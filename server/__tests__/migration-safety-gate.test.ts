import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MigrationSafetyError,
  defaultMigrationsDir,
  inspectMigrationSafety,
  listMigrationFiles,
  readMigrationSource,
  runPendingMigrations,
  type MigrationClient,
} from '../migrate';

function fixture() {
  const calls: string[] = [];
  const client = {
    async query(text: string) {
      calls.push(text);
      if (text.startsWith('SELECT filename')) return { rows: [] };
      return { rows: [] };
    },
  } as MigrationClient;
  return { client, calls };
}

/** A directory holding one pending migration with the given body. */
async function withMigration(sql: string, run: (dir: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-safety-'));
  try {
    fs.writeFileSync(path.join(dir, '0000_fixture.sql'), sql);
    await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const kinds = (sql: string) => inspectMigrationSafety('0000_fixture.sql', sql).map((f) => f.kind);

// ---------------------------------------------------------------------------
// What counts as destructive
// ---------------------------------------------------------------------------

test.each([
  'DROP TABLE merchants;',
  'DROP TABLE IF EXISTS merchants;',
  'ALTER TABLE merchants DROP COLUMN legacy_bank_account;',
  'DROP SCHEMA public CASCADE;',
  'DROP DATABASE taptpay;',
  'DROP TYPE merchant_status;',
  'TRUNCATE transactions;',
  'DELETE FROM transactions;',
])('a data-destroying statement is flagged: %s', (sql) => {
  expect(kinds(sql)).toEqual(['destructive']);
});

test('a bounded delete is not treated as destructive', () => {
  expect(kinds("DELETE FROM transactions WHERE status = 'draft';")).toEqual([]);
});

// The drop-then-re-add pattern in 0013 reshapes constraints without destroying
// rows. Flagging it would block every fresh database for no safety gain.
test.each([
  'ALTER TABLE merchant_subscriptions DROP CONSTRAINT IF EXISTS merchant_subscriptions_status_check;',
  'ALTER TABLE users ALTER COLUMN merchant_id DROP DEFAULT;',
  'ALTER TABLE users ALTER COLUMN merchant_id DROP NOT NULL;',
  'DROP INDEX IF EXISTS idx_transactions_merchant;',
])('a constraint, default or index reshape is not destructive: %s', (sql) => {
  expect(kinds(sql)).toEqual([]);
});

// ---------------------------------------------------------------------------
// What cannot run inside the runner's transaction
// ---------------------------------------------------------------------------

test.each([
  'CREATE INDEX CONCURRENTLY idx_tx_merchant ON transactions (merchant_id);',
  'DROP INDEX CONCURRENTLY idx_tx_merchant;',
  'REINDEX INDEX idx_tx_merchant;',
  'VACUUM ANALYZE transactions;',
  "ALTER TYPE merchant_status ADD VALUE 'suspended';",
])('a non-transactional statement is flagged: %s', (sql) => {
  expect(kinds(sql)).toEqual(['nontransactional']);
});

// ---------------------------------------------------------------------------
// The scanner cannot be fooled or waived
// ---------------------------------------------------------------------------

test('a comment mentioning a destructive statement is not a finding', () => {
  expect(kinds('-- DROP TABLE merchants; we deliberately do not\nSELECT 1;')).toEqual([]);
  expect(kinds('/* TRUNCATE transactions */ SELECT 1;')).toEqual([]);
});

test('a string literal mentioning a destructive statement is not a finding', () => {
  expect(kinds("INSERT INTO audit_log (note) VALUES ('DROP TABLE merchants');")).toEqual([]);
});

// The runner wraps each file in one transaction it owns, so a DO block is not a
// safe harbour: whatever it executes runs with the same effects. It is scanned.
test('a DO block is scanned rather than waived', () => {
  expect(kinds('DO $$ BEGIN DROP TABLE merchants; END $$;')).toEqual(['destructive']);
  expect(kinds('DO $$ BEGIN VACUUM transactions; END $$;')).toEqual(['nontransactional']);
});

test('a finding names the file and the rule without quoting row values', () => {
  const [finding] = inspectMigrationSafety('0099_x.sql', "DELETE FROM users; -- secret-value");
  expect(finding.filename).toBe('0099_x.sql');
  expect(finding.rule).toBeTruthy();
  expect(JSON.stringify(finding)).not.toContain('secret-value');
});

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

test('a destructive pending migration is refused before any statement runs', async () => {
  await withMigration('DROP TABLE merchants;', async (dir) => {
    const { client, calls } = fixture();
    await expect(runPendingMigrations(client, { dir, log: () => undefined }))
      .rejects.toBeInstanceOf(MigrationSafetyError);
    expect(calls).not.toContain('BEGIN');
    expect(calls.some((c) => c.startsWith('CREATE SCHEMA'))).toBe(false);
  });
});

test('an explicit approval lets a destructive migration through', async () => {
  await withMigration('DROP TABLE merchants;', async (dir) => {
    const { client, calls } = fixture();
    await expect(runPendingMigrations(client, {
      dir, allowDestructive: true, log: () => undefined,
    })).resolves.toBeTruthy();
    expect(calls).toContain('BEGIN');
  });
});

test('no approval flag lets a non-transactional statement through', async () => {
  await withMigration('CREATE INDEX CONCURRENTLY i ON t (c);', async (dir) => {
    const { client, calls } = fixture();
    await expect(runPendingMigrations(client, {
      dir, allowDestructive: true, log: () => undefined,
    })).rejects.toBeInstanceOf(MigrationSafetyError);
    expect(calls).not.toContain('BEGIN');
  });
});

test('a dry run reports findings instead of throwing — it is the preflight', async () => {
  await withMigration('DROP TABLE merchants;', async (dir) => {
    const { client, calls } = fixture();
    const lines: string[] = [];
    await expect(runPendingMigrations(client, {
      dir, dryRun: true, log: (message) => lines.push(message),
    })).resolves.toBeTruthy();
    expect(lines.join('\n')).toContain('destructive');
    expect(calls).not.toContain('BEGIN');
  });
});

// ---------------------------------------------------------------------------
// The gate must not block the checked-in history
// ---------------------------------------------------------------------------

test('every checked-in migration passes the gate unassisted', () => {
  const dir = defaultMigrationsDir();
  const findings = listMigrationFiles(dir).flatMap((filename) =>
    inspectMigrationSafety(filename, readMigrationSource(dir, filename)));
  expect(findings).toEqual([]);
});
