import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUERIES,
  assertTarget,
  parseArguments,
  runPreflight,
} from './count-gap11-session-replay-duplicates.mjs';

const expected = { host: 'helium', database: 'heliumdb' };
const settings = { host: 'helium', database: 'heliumdb' };

const ZERO_ROW = {
  duplicateProcessorSessionIds: { duplicate_values: 0, duplicate_rows: 0 },
  duplicateWindcaveTransactionIds: { duplicate_values: 0, duplicate_rows: 0 },
  completedSplitsWithNullProviderTxId: { rows: 0 },
  transactionsWithSplitCountMismatch: { rows: 0 },
};

function fakeClient(overrides = {}, { currentDatabase = 'heliumdb' } = {}) {
  const issued = [];
  const rowsFor = { ...ZERO_ROW, ...overrides };
  const client = {
    query: async (text) => {
      const statement = text.trim().split('\n')[0].trim();
      issued.push(statement);
      if (['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY', 'ROLLBACK'].includes(statement)
          || statement.startsWith('SET LOCAL')) {
        return { rows: [] };
      }
      if (statement.startsWith('SELECT current_database()')) {
        return { rows: [{ current_database: currentDatabase, current_user: 'reader' }] };
      }
      if (text.includes('FROM payment_attempts')) return { rows: [rowsFor.duplicateProcessorSessionIds] };
      if (text.includes('FROM split_payments') && text.includes('windcave_transaction_id, count(*)')) {
        return { rows: [rowsFor.duplicateWindcaveTransactionIds] };
      }
      if (text.includes("status = 'completed'") && text.includes('windcave_transaction_id IS NULL')) {
        return { rows: [rowsFor.completedSplitsWithNullProviderTxId] };
      }
      if (text.includes('FROM transactions t')) return { rows: [rowsFor.transactionsWithSplitCountMismatch] };
      throw new Error(`unexpected query: ${text}`);
    },
  };
  return { client, issued };
}

test('both expected-host and expected-database are required', () => {
  assert.deepEqual(parseArguments(['--expected-host=helium', '--expected-database=heliumdb']), expected);
  for (const argv of [
    [],
    ['--expected-host=helium'],
    ['--expected-database=heliumdb'],
    ['--expected-host=helium', '--expected-database=heliumdb', '--allow-destructive='],
    ['--expected-host=helium', '--expected-host=other', '--expected-database=heliumdb'],
    ['heliumdb'],
  ]) assert.throws(() => parseArguments(argv), /GAP11_C0_INVALID_ARGUMENTS/, argv.join(' '));
});

test('a URI or server reporting a different target than the caller named is refused', () => {
  assert.throws(() => assertTarget(expected, { host: 'elsewhere', database: 'heliumdb' },
    { current_database: 'heliumdb' }), /GAP11_C0_TARGET_MISMATCH/);
  assert.throws(() => assertTarget(expected, settings, { current_database: 'production' }),
    /GAP11_C0_TARGET_MISMATCH/);
  assert.doesNotThrow(() => assertTarget(expected, settings, { current_database: 'heliumdb' }));
});

/** Collapses parenthesised groups innermost-first, leaving only the bare projection list. */
function withoutParenGroups(text) {
  let previous;
  let current = text;
  do {
    previous = current;
    current = current.replace(/\([^()]*\)/g, '[]');
  } while (current !== previous);
  return current;
}

test('every query counts and never projects an id value', () => {
  for (const [name, sql] of Object.entries(QUERIES)) {
    const projection = withoutParenGroups(sql);
    assert.doesNotMatch(projection, /session_id,|transaction_id,/, name);
    assert.match(sql, /count\(\*\)/, name);
  }
  assert.match(QUERIES.duplicateProcessorSessionIds, /GROUP BY processor_session_id/);
  assert.match(QUERIES.duplicateProcessorSessionIds, /HAVING count\(\*\) > 1/);
  assert.match(QUERIES.duplicateWindcaveTransactionIds, /GROUP BY windcave_transaction_id/);
  assert.match(QUERIES.duplicateWindcaveTransactionIds, /HAVING count\(\*\) > 1/);
  assert.match(QUERIES.completedSplitsWithNullProviderTxId, /status = 'completed'/);
  assert.match(QUERIES.completedSplitsWithNullProviderTxId, /windcave_transaction_id IS NULL/);
  assert.match(QUERIES.transactionsWithSplitCountMismatch, /coalesce\(t\.completed_splits, 0\)/);
});

test('the read runs read-only, is rolled back, and never runs the counts against a wrong target', async () => {
  const { client, issued } = fakeClient({}, { currentDatabase: 'production' });
  await assert.rejects(() => runPreflight(client, expected, settings), /GAP11_C0_TARGET_MISMATCH/);
  assert.equal(issued[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  assert.equal(issued.at(-1), 'ROLLBACK');
  assert.ok(!issued.some((text) => text.includes('FROM payment_attempts') || text.includes('FROM split_payments')),
    'counted despite a wrong target');
});

test('all-zero results report safeToAddIndexes true', async () => {
  const { client } = fakeClient();
  const result = await runPreflight(client, expected, settings);
  assert.deepEqual(result, {
    database: 'heliumdb',
    role: 'reader',
    duplicateProcessorSessionIds: { duplicateValues: 0, duplicateRows: 0 },
    duplicateWindcaveTransactionIds: { duplicateValues: 0, duplicateRows: 0 },
    completedSplitsWithNullProviderTxId: 0,
    transactionsWithSplitCountMismatch: 0,
    safeToAddIndexes: true,
  });
});

test('any nonzero count reports safeToAddIndexes false', async () => {
  const { client } = fakeClient({
    duplicateProcessorSessionIds: { duplicate_values: 2, duplicate_rows: 5 },
  });
  const result = await runPreflight(client, expected, settings);
  assert.equal(result.safeToAddIndexes, false);
  assert.deepEqual(result.duplicateProcessorSessionIds, { duplicateValues: 2, duplicateRows: 5 });
});
