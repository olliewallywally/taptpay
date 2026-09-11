import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNT_QUERY, assertTarget, countCredentials, parseArguments } from './count-merchant-credentials.mjs';

const expected = { host: 'helium', database: 'heliumdb' };
const settings = { host: 'helium', database: 'heliumdb' };

test('both expected-host and expected-database are required', () => {
  assert.deepEqual(parseArguments(['--expected-host=helium', '--expected-database=heliumdb']), expected);
  for (const argv of [
    [],
    ['--expected-host=helium'],
    ['--expected-database=heliumdb'],
    ['--expected-host=helium', '--expected-database=heliumdb', '--allow-destructive='],
    ['--expected-host=helium', '--expected-host=other', '--expected-database=heliumdb'],
    ['heliumdb'],
  ]) assert.throws(() => parseArguments(argv), /CREDENTIAL_COUNT_INVALID_ARGUMENTS/, argv.join(' '));
});

test('a URI pointing somewhere else than the caller named is refused', () => {
  assert.throws(() => assertTarget(expected, { host: 'elsewhere', database: 'heliumdb' },
    { current_database: 'heliumdb' }), /CREDENTIAL_COUNT_TARGET_MISMATCH/);
  assert.throws(() => assertTarget(expected, { host: 'helium', database: 'other' },
    { current_database: 'other' }), /CREDENTIAL_COUNT_TARGET_MISMATCH/);
});

test('a server that reports a different database than the URI claimed is refused', () => {
  assert.throws(() => assertTarget(expected, settings, { current_database: 'production' }),
    /CREDENTIAL_COUNT_TARGET_MISMATCH/);
  assert.doesNotThrow(() => assertTarget(expected, settings, { current_database: 'heliumdb' }));
});

/**
 * Collapses parenthesised groups innermost-first, so what is left is the bare
 * projection. The placeholder deliberately is not itself a paren group, or the
 * first collapse would be a fixpoint and outer groups would survive.
 */
function withoutParenGroups(text) {
  let previous;
  let current = text;
  do {
    previous = current;
    current = current.replace(/\([^()]*\)/g, '[]');
  } while (current !== previous);
  return current;
}

test('the query counts and never projects the column', () => {
  // A value must never leave the database. Collapsing every parenthesised group
  // leaves only what is actually projected; the column name must not survive,
  // which proves each mention was inside a FILTER predicate rather than selected.
  assert.doesNotMatch(withoutParenGroups(COUNT_QUERY), /windcave_api_key/);
  assert.match(withoutParenGroups(COUNT_QUERY), /SELECT count\[\]::int AS merchants/);
  // ...and the predicates themselves are still there.
  assert.match(COUNT_QUERY, /FILTER \(WHERE windcave_api_key IS NOT NULL\)/);
  assert.match(COUNT_QUERY, /btrim\(windcave_api_key\) <> ''/);
});

test('the read runs read-only and is rolled back even when the target is wrong', async () => {
  const issued = [];
  const client = {
    query: async (text) => {
      issued.push(text.trim().split('\n')[0]);
      if (text.startsWith('SELECT current_database()')) return { rows: [{ current_database: 'production', current_user: 'app' }] };
      return { rows: [{ merchants: 0, with_credential: 0, with_nonempty_credential: 0 }] };
    },
  };
  await assert.rejects(() => countCredentials(client, expected, settings), /CREDENTIAL_COUNT_TARGET_MISMATCH/);
  assert.equal(issued[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  assert.equal(issued.at(-1), 'ROLLBACK');
  assert.ok(!issued.some((text) => text.includes('FROM public.merchants')), 'counted despite a wrong target');
});

test('a matching target returns counts and the identity it actually reached', async () => {
  const client = {
    query: async (text) => {
      if (text.startsWith('SELECT current_database()')) return { rows: [{ current_database: 'heliumdb', current_user: 'reader' }] };
      return { rows: [{ merchants: 7, with_credential: 2, with_nonempty_credential: 1 }] };
    },
  };
  assert.deepEqual(await countCredentials(client, expected, settings), {
    database: 'heliumdb', role: 'reader', merchants: 7, with_credential: 2, with_nonempty_credential: 1,
  });
});
