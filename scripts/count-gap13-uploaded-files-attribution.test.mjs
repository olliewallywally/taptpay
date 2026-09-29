import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DOCUMENT_REFERENCE_PATTERN,
  LOGO_PATH_PATTERN,
  QUERIES,
  assertTarget,
  parseArguments,
  runPreflight,
} from './count-gap13-uploaded-files-attribution.mjs';

const expected = { host: 'helium', database: 'heliumdb' };
const settings = { host: 'helium', database: 'heliumdb' };

const ZERO_ROWS = {
  filesByFolder: { total: 0, logos: 0, invoices: 0, other: 0 },
  logosByAttribution: { attributable: 0, unattributable: 0 },
  invoiceDocumentsByAttribution: { single_merchant_references: 0, ambiguous: 0, orphan: 0 },
  referencingRows: { total: 0, unrecognised_shape: 0, pointing_at_missing_file: 0 },
};

function fakeClient(overrides = {}, { currentDatabase = 'heliumdb' } = {}) {
  const issued = [];
  const rowsFor = { ...ZERO_ROWS, ...overrides };
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
      for (const [name, sql] of Object.entries(QUERIES)) {
        if (text === sql) return { rows: [rowsFor[name]] };
      }
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
  ]) assert.throws(() => parseArguments(argv), /GAP13_PREFLIGHT_INVALID_ARGUMENTS/, argv.join(' '));
});

test('a URI or server reporting a different target than the caller named is refused', () => {
  assert.throws(() => assertTarget(expected, { host: 'elsewhere', database: 'heliumdb' },
    { current_database: 'heliumdb' }), /GAP13_PREFLIGHT_TARGET_MISMATCH/);
  assert.throws(() => assertTarget(expected, settings, { current_database: 'production' }),
    /GAP13_PREFLIGHT_TARGET_MISMATCH/);
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

test('every query projects nothing but counts — never a path, url, id, merchant id or content', () => {
  for (const [name, sql] of Object.entries(QUERIES)) {
    // The outermost SELECT is the only one at column 0; CTE SELECTs are indented.
    const outer = sql.slice(sql.lastIndexOf('\nSELECT') + 1);
    const projection = withoutParenGroups(outer).replace(/^SELECT/, '').split(/\bFROM\b/)[0];
    const items = projection.split(',').map((item) => item.trim()).filter(Boolean);
    assert.ok(items.length > 0, name);
    for (const item of items) {
      assert.match(item, /^count\[\]/, `${name}: projects a non-aggregate: ${item}`);
    }
  }
});

test('the queries never touch a data column of uploaded_files that could carry content', () => {
  for (const [name, sql] of Object.entries(QUERIES)) {
    assert.doesNotMatch(sql, /\bdata\b/i, `${name} references the bytea column`);
    assert.doesNotMatch(sql, /mime_type/i, name);
  }
});

test('the classification patterns are the same ones migration 0023 uses', () => {
  const migration = readFileSync(new URL('../migrations/0023_uploaded_files_tenant_column.sql', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  assert.ok(migration.includes(DOCUMENT_REFERENCE_PATTERN),
    'the invoice-document reference pattern drifted from the migration');
  assert.ok(migration.includes(LOGO_PATH_PATTERN),
    'the logo path pattern drifted from the migration');
  // The logo pattern in the migration is also used unanchored-capture for the
  // regex test, so its non-capturing twin must appear too.
  assert.ok(migration.includes(String.raw`'^logos/merchant-[0-9]{1,9}\.[A-Za-z0-9]{1,10}$'`));
});

test('the read runs read-only, is rolled back, and never runs the counts against a wrong target', async () => {
  const { client, issued } = fakeClient({}, { currentDatabase: 'production' });
  await assert.rejects(() => runPreflight(client, expected, settings), /GAP13_PREFLIGHT_TARGET_MISMATCH/);
  assert.equal(issued[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  assert.equal(issued.at(-1), 'ROLLBACK');
  assert.ok(!issued.some((text) => text.includes('uploaded_files') || text.includes('WITH')),
    'counted despite a wrong target');
});

test('an empty database reports nothing to review', async () => {
  const { client } = fakeClient();
  const result = await runPreflight(client, expected, settings);
  assert.deepEqual(result, {
    database: 'heliumdb',
    role: 'reader',
    files: { total: 0, logos: 0, invoices: 0, other: 0 },
    logos: { attributable: 0, unattributable: 0 },
    invoiceDocuments: { singleMerchantReferences: 0, ambiguous: 0, orphan: 0 },
    referencingRows: { total: 0, unrecognisedShape: 0, pointingAtMissingFile: 0 },
    requiresOwnerReview: false,
  });
});

test('legacy single-merchant references and orphans still require ownership review', async () => {
  const { client } = fakeClient({
    filesByFolder: { total: 9, logos: 3, invoices: 6, other: 0 },
    logosByAttribution: { attributable: 3, unattributable: 0 },
    invoiceDocumentsByAttribution: { single_merchant_references: 4, ambiguous: 0, orphan: 2 },
    referencingRows: { total: 4, unrecognised_shape: 0, pointing_at_missing_file: 0 },
  });
  const result = await runPreflight(client, expected, settings);
  assert.equal(result.requiresOwnerReview, true);
  assert.equal(result.invoiceDocuments.orphan, 2);
});

test('any ambiguous document, unrecognised reference or dangling reference requires owner review', async () => {
  for (const override of [
    { invoiceDocumentsByAttribution: { single_merchant_references: 0, ambiguous: 1, orphan: 0 } },
    { referencingRows: { total: 1, unrecognised_shape: 1, pointing_at_missing_file: 0 } },
    { referencingRows: { total: 1, unrecognised_shape: 0, pointing_at_missing_file: 1 } },
  ]) {
    const { client } = fakeClient(override);
    const result = await runPreflight(client, expected, settings);
    assert.equal(result.requiresOwnerReview, true, JSON.stringify(override));
  }
});
