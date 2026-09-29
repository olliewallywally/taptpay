import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyMigration, runPendingMigrations, withMigrationAdvisoryLock, ACQUIRE_MIGRATION_LOCK_SQL,
  RELEASE_MIGRATION_LOCK_SQL, INSERT_LEDGER_SQL, type MigrationClient } from '../migrate';

const SETTINGS = "SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout";
const SESSION = "SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)";
const LOCAL = "SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)";

function fixture(fail?: (sql: string) => boolean) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const client = { async query(sql: string, values?: unknown[]) {
    calls.push({ sql, values });
    if (fail?.(sql)) throw new Error('synthetic query failure');
    return { rows: sql === SETTINGS ? [{ lock_timeout: '2s', statement_timeout: '3min' }] : [] };
  } } as MigrationClient;
  return { client, calls };
}

test('advisory acquisition is bounded before waiting and prior settings are restored', async () => {
  const { client, calls } = fixture();
  await withMigrationAdvisoryLock(client, async () => { calls.push({ sql: 'WORK' }); });
  expect(calls).toEqual([
    { sql: SETTINGS }, { sql: SESSION, values: ['5000ms', '10000ms'] },
    { sql: ACQUIRE_MIGRATION_LOCK_SQL }, { sql: SESSION, values: ['5000ms', '60000ms'] },
    { sql: 'WORK' }, { sql: RELEASE_MIGRATION_LOCK_SQL },
    { sql: SESSION, values: ['2s', '3min'] },
  ]);
});

test('failed acquisition does no work and restores the prior session budgets', async () => {
  const { client, calls } = fixture((sql) => sql === ACQUIRE_MIGRATION_LOCK_SQL);
  const work = jest.fn();
  await expect(withMigrationAdvisoryLock(client, work)).rejects.toThrow();
  expect(work).not.toHaveBeenCalled();
  expect(calls.at(-1)).toEqual({ sql: SESSION, values: ['2s', '3min'] });
  expect(calls.some((call) => call.sql === RELEASE_MIGRATION_LOCK_SQL)).toBe(false);
});

test('failed work still releases the lock and restores settings', async () => {
  const { client, calls } = fixture();
  await expect(withMigrationAdvisoryLock(client, async () => { throw new Error('work failed'); })).rejects.toThrow('work failed');
  expect(calls.slice(-2)).toEqual([
    { sql: RELEASE_MIGRATION_LOCK_SQL }, { sql: SESSION, values: ['2s', '3min'] },
  ]);
});

test('unlock failure is surfaced and session restoration is still attempted', async () => {
  const { client, calls } = fixture((sql) => sql === RELEASE_MIGRATION_LOCK_SQL);
  await expect(withMigrationAdvisoryLock(client, async () => 'done')).rejects.toThrow();
  expect(calls.at(-1)).toEqual({ sql: SESSION, values: ['2s', '3min'] });
});

test('transaction-local budgets precede migration statements and the ledger insert', async () => {
  const { client, calls } = fixture();
  await applyMigration(client, '0000_fixture.sql', 'SELECT 1;');
  expect(calls.slice(0, 3)).toEqual([
    { sql: 'BEGIN' }, { sql: LOCAL, values: ['5000ms', '60000ms'] }, { sql: 'SELECT 1;' },
  ]);
  expect(calls.at(-1)?.sql).toBe('COMMIT');
});

test('budget setup failure rolls back without migration SQL or ledger writes', async () => {
  const { client, calls } = fixture((sql) => sql === LOCAL);
  await expect(applyMigration(client, '0000_fixture.sql', 'SELECT 1;')).rejects.toThrow();
  expect(calls.map((c) => c.sql)).toEqual(['BEGIN', LOCAL, 'ROLLBACK']);
  expect(calls.some((c) => c.sql === INSERT_LEDGER_SQL)).toBe(false);
});

test.each([0, -1, 0.5, NaN, Infinity, 300_001, undefined])('invalid budget %s fails before any query', async (value) => {
  for (const key of ['advisoryLockMs', 'lockMs', 'statementMs'] as const) {
    const { client, calls } = fixture();
    const options = { [key]: value };
    await expect(withMigrationAdvisoryLock(client, async () => undefined, options)).rejects.toThrow('Invalid migration timeout budget');
    await expect(applyMigration(client, '0000_fixture.sql', 'SELECT 1;', options)).rejects.toThrow('Invalid migration timeout budget');
    expect(calls).toEqual([]);
  }
});

test('a lock budget at or above statement budget is rejected before queries', async () => {
  const { client, calls } = fixture();
  await expect(applyMigration(client, '0000_fixture.sql', 'SELECT 1;', { lockMs: 60_000 })).rejects.toThrow();
  expect(calls).toEqual([]);
});

test('failure to set acquisition budgets prevents acquisition and work', async () => {
  let attempts = 0;
  const { client, calls } = fixture((sql) => sql === SESSION && ++attempts === 1);
  const work = jest.fn();
  await expect(withMigrationAdvisoryLock(client, work)).rejects.toThrow();
  expect(work).not.toHaveBeenCalled();
  expect(calls.some((c) => c.sql === ACQUIRE_MIGRATION_LOCK_SQL)).toBe(false);
  expect(calls.at(-1)).toEqual({ sql: SESSION, values: ['2s', '3min'] });
});

test('failure setting work budgets releases the acquired lock without running work', async () => {
  let attempts = 0;
  const { client, calls } = fixture((sql) => sql === SESSION && ++attempts === 2);
  const work = jest.fn();
  await expect(withMigrationAdvisoryLock(client, work)).rejects.toThrow();
  expect(work).not.toHaveBeenCalled();
  expect(calls.slice(-2)).toEqual([
    { sql: RELEASE_MIGRATION_LOCK_SQL }, { sql: SESSION, values: ['2s', '3min'] },
  ]);
});

test('restoration failure cannot report success', async () => {
  let attempts = 0;
  const { client } = fixture((sql) => sql === SESSION && ++attempts === 3);
  await expect(withMigrationAdvisoryLock(client, async () => 'done')).rejects.toThrow();
});

test('validated custom budgets propagate from the lock callback to every pending migration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-custom-budgets-'));
  try {
    fs.writeFileSync(path.join(dir, '0000_fixture.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(dir, '0001_fixture.sql'), 'SELECT 2;');
    const { client, calls } = fixture();
    await withMigrationAdvisoryLock(client, (timeouts) => runPendingMigrations(client, {
      dir, timeouts, log: () => undefined,
    }), { advisoryLockMs: 500, lockMs: 100, statementMs: 1000 });
    expect(calls.filter((c) => c.sql === LOCAL)).toEqual([
      { sql: LOCAL, values: ['100ms', '1000ms'] },
      { sql: LOCAL, values: ['100ms', '1000ms'] },
    ]);
    expect(calls.filter((c) => c.sql === INSERT_LEDGER_SQL)).toHaveLength(2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
