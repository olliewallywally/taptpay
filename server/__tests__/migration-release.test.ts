import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MigrationHistoryError,
  checksumAll,
  listMigrationFiles,
  parseCliArgs,
  verifyMigrationState,
  type LedgerRow,
  type MigrationClient,
} from '../migrate';

/** A ledger client whose rows are whatever the case under test supplies. */
function fixture(ledger: LedgerRow[] | null) {
  const client = {
    async query(text: string) {
      if (text.startsWith('SELECT filename')) {
        if (ledger === null) {
          const error = new Error('relation does not exist') as Error & { code: string };
          error.code = '42P01';
          throw error;
        }
        return { rows: ledger };
      }
      return { rows: [] };
    },
  } as MigrationClient;
  return client;
}

function migrationDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-release-'));
  fs.writeFileSync(path.join(dir, '0000_a.sql'), 'SELECT 1;\n');
  fs.writeFileSync(path.join(dir, '0001_b.sql'), 'SELECT 2;\n');
  return dir;
}

function ledgerFor(dir: string, filenames: readonly string[]): LedgerRow[] {
  const checksums = checksumAll(dir, listMigrationFiles(dir));
  return filenames.map((filename) => ({
    filename,
    checksum: checksums.get(filename)!,
    applied_at: new Date().toISOString(),
    baselined: false,
  }));
}

// ---------------------------------------------------------------------------
// Release mode is a distinct, non-mergeable mode
// ---------------------------------------------------------------------------

test('release is its own mode', () => {
  expect(parseCliArgs(['--release']).mode).toBe('release');
  expect(parseCliArgs(['--release']).unknown).toEqual([]);
});

test.each([
  ['--release', '--status'],
  ['--release', '--baseline'],
  ['--release', '--release'],
])('release cannot be combined or repeated (%s %s)', (first, second) => {
  expect(parseCliArgs([first, second]).unknown.length).toBeGreaterThan(0);
});

test('destructive approval is off unless asked for, and cannot be repeated', () => {
  expect(parseCliArgs(['--release']).allowDestructive).toBe(false);
  expect(parseCliArgs(['--release', '--allow-destructive']).allowDestructive).toBe(true);
  expect(parseCliArgs(['--allow-destructive', '--allow-destructive']).unknown.length)
    .toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// A release proves its own end state
// ---------------------------------------------------------------------------

test('a fully applied history verifies', async () => {
  const dir = migrationDir();
  try {
    const plan = await verifyMigrationState(fixture(ledgerFor(dir, ['0000_a.sql', '0001_b.sql'])), dir);
    expect(plan.pending).toEqual([]);
    expect(plan.applied).toHaveLength(2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a still-pending migration fails verification', async () => {
  const dir = migrationDir();
  try {
    await expect(verifyMigrationState(fixture(ledgerFor(dir, ['0000_a.sql'])), dir))
      .rejects.toBeInstanceOf(MigrationHistoryError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a drifted checksum fails verification', async () => {
  const dir = migrationDir();
  try {
    const ledger = ledgerFor(dir, ['0000_a.sql', '0001_b.sql']);
    ledger[1].checksum = 'not-the-checksum-on-disk';
    await expect(verifyMigrationState(fixture(ledger), dir)).rejects.toBeDefined();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a ledger recording a file that is gone fails verification', async () => {
  const dir = migrationDir();
  try {
    const ledger = ledgerFor(dir, ['0000_a.sql', '0001_b.sql']);
    ledger.push({ filename: '0099_removed.sql', checksum: 'gone', applied_at: null, baselined: false });
    await expect(verifyMigrationState(fixture(ledger), dir))
      .rejects.toBeInstanceOf(MigrationHistoryError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an uninitialised ledger fails verification rather than reporting success', async () => {
  const dir = migrationDir();
  try {
    await expect(verifyMigrationState(fixture(null), dir))
      .rejects.toBeInstanceOf(MigrationHistoryError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
