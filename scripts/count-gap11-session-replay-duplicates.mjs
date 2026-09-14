// Gap 11 / C0 — count-only preflight for the split-session single-use design.
//
// See docs/decisions/2026-09-13-gap11-split-session-single-use-design.md,
// section 4 "Recommendation" / "Suggested sequence", step C0. This script is
// step C0 exactly as scoped there: four counts, no remediation, no schema
// change. Its job is to answer one question before C1 (two additive partial
// unique indexes) is attempted: would either index already be violated by
// data in this database, and is completedSplits already out of sync with
// split_payments?
//
// It performs ZERO writes. All four queries run inside one
// READ ONLY, REPEATABLE READ transaction that is always rolled back, and it
// refuses to run against a database the caller has not explicitly named
// (see connectionSettings() in schema-fingerprint.mjs and the identical
// pattern in count-merchant-credentials.mjs) so it cannot silently drift onto
// the wrong target when someone with production access re-runs it there.
import { connectionSettings } from './schema-fingerprint.mjs';

const fail = (code) => { throw new Error(code); };

export function parseArguments(argv) {
  const options = new Map();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) fail('GAP11_C0_INVALID_ARGUMENTS');
    if (options.has(match[1])) fail('GAP11_C0_INVALID_ARGUMENTS');
    options.set(match[1], match[2]);
  }
  const host = options.get('expected-host');
  const database = options.get('expected-database');
  if (!host || !database) fail('GAP11_C0_INVALID_ARGUMENTS');
  if ([...options.keys()].some((key) => !['expected-host', 'expected-database'].includes(key))) {
    fail('GAP11_C0_INVALID_ARGUMENTS');
  }
  return { host, database };
}

/**
 * The URI says which database the caller believes they reached; the server
 * says which one they actually reached. Both must match what the caller
 * named, because a URI alone can be redirected and ambient PG* variables can
 * backfill it. Mirrors count-merchant-credentials.mjs's assertTarget exactly.
 */
export function assertTarget(expected, settings, server) {
  if (settings.host !== expected.host || settings.database !== expected.database) {
    fail('GAP11_C0_TARGET_MISMATCH');
  }
  if (server.current_database !== expected.database) fail('GAP11_C0_TARGET_MISMATCH');
}

// Each query reports both how many distinct values are duplicated
// ("duplicate_values" — this is what a partial unique index would refuse)
// and how many rows sit inside those duplicated groups ("duplicate_rows").
// Neither ever selects the session id or transaction id itself: only counts
// leave the database, per the memo's "Numbers only" instruction.
export const QUERIES = Object.freeze({
  duplicateProcessorSessionIds: `
    SELECT count(*)::int AS duplicate_values, coalesce(sum(cnt), 0)::int AS duplicate_rows
      FROM (
        SELECT processor_session_id, count(*) AS cnt
          FROM payment_attempts
         WHERE processor_session_id IS NOT NULL
         GROUP BY processor_session_id
        HAVING count(*) > 1
      ) d
  `,
  duplicateWindcaveTransactionIds: `
    SELECT count(*)::int AS duplicate_values, coalesce(sum(cnt), 0)::int AS duplicate_rows
      FROM (
        SELECT windcave_transaction_id, count(*) AS cnt
          FROM split_payments
         WHERE windcave_transaction_id IS NOT NULL
         GROUP BY windcave_transaction_id
        HAVING count(*) > 1
      ) d
  `,
  completedSplitsWithNullProviderTxId: `
    SELECT count(*)::int AS rows
      FROM split_payments
     WHERE status = 'completed'
       AND windcave_transaction_id IS NULL
  `,
  // coalesce(..., 0) matches the column's schema default of 0; a transaction
  // whose completed_splits is explicitly NULL is not flagged as a mismatch
  // purely for being NULL when it also has zero actually-completed rows.
  transactionsWithSplitCountMismatch: `
    SELECT count(*)::int AS rows
      FROM transactions t
     WHERE coalesce(t.completed_splits, 0) <> (
             SELECT count(*)::int
               FROM split_payments sp
              WHERE sp.transaction_id = t.id
                AND sp.status = 'completed'
           )
  `,
});

export async function runPreflight(client, expected, settings) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  try {
    // Dev tables here are expected to be small, but the house discipline
    // (memo section 6 / schema-fingerprint.mjs's collectSchema) is to bound
    // every read against a real database with explicit timeouts regardless.
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const identity = await client.query('SELECT current_database(), current_user');
    assertTarget(expected, settings, identity.rows[0]);

    // pg.Client (a single connection, not a Pool) serialises queries and
    // warns if asked to run several concurrently, so these run in sequence.
    const sessions = await client.query(QUERIES.duplicateProcessorSessionIds);
    const providerIds = await client.query(QUERIES.duplicateWindcaveTransactionIds);
    const nullTxCompleted = await client.query(QUERIES.completedSplitsWithNullProviderTxId);
    const splitMismatch = await client.query(QUERIES.transactionsWithSplitCountMismatch);

    const duplicateProcessorSessionIds = {
      duplicateValues: sessions.rows[0].duplicate_values,
      duplicateRows: sessions.rows[0].duplicate_rows,
    };
    const duplicateWindcaveTransactionIds = {
      duplicateValues: providerIds.rows[0].duplicate_values,
      duplicateRows: providerIds.rows[0].duplicate_rows,
    };
    const completedSplitsWithNullProviderTxId = nullTxCompleted.rows[0].rows;
    const transactionsWithSplitCountMismatch = splitMismatch.rows[0].rows;

    return {
      database: identity.rows[0].current_database,
      role: identity.rows[0].current_user,
      duplicateProcessorSessionIds,
      duplicateWindcaveTransactionIds,
      completedSplitsWithNullProviderTxId,
      transactionsWithSplitCountMismatch,
      safeToAddIndexes:
        duplicateProcessorSessionIds.duplicateValues === 0
        && duplicateWindcaveTransactionIds.duplicateValues === 0
        && completedSplitsWithNullProviderTxId === 0
        && transactionsWithSplitCountMismatch === 0,
    };
  } finally {
    // Nothing was written; rolled back anyway so no snapshot/lock is held.
    await client.query('ROLLBACK').catch(() => undefined);
  }
}

export async function main(argv, env) {
  const expected = parseArguments(argv);
  const settings = connectionSettings({ FINGERPRINT_DATABASE_URL: env.GAP11_C0_DATABASE_URL });
  const { default: pg } = await import('pg');
  const client = new pg.Client({ ...settings, application_name: 'gap11-c0-preflight' });
  await client.connect();
  try {
    return await runPreflight(client, expected, settings);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('count-gap11-session-replay-duplicates.mjs')) {
  try {
    const result = await main(process.argv.slice(2), process.env);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(
      `GAP11_C0_PREFLIGHT database=${result.database} role=${result.role} `
      + `duplicate_processor_session_ids=${result.duplicateProcessorSessionIds.duplicateValues} `
      + `duplicate_windcave_transaction_ids=${result.duplicateWindcaveTransactionIds.duplicateValues} `
      + `completed_splits_with_null_provider_tx_id=${result.completedSplitsWithNullProviderTxId} `
      + `transactions_with_split_count_mismatch=${result.transactionsWithSplitCountMismatch} `
      + `safe_to_add_indexes=${result.safeToAddIndexes}\n`,
    );
    if (!result.safeToAddIndexes) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${/^(?:GAP11_C0|FINGERPRINT)_[A-Z_]+$/.test(error.message) ? error.message : 'GAP11_C0_FAILED'}\n`);
    process.exitCode = 1;
  }
}
