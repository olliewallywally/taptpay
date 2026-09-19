// Gap 13 — count-only preflight for migration 0023 (uploaded_files tenant column).
//
// See docs/decisions/2026-09-14-uploads-tenant-authorization-option-c-disposition.md
// and docs/evidence/remediation-v2-2/r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md.
//
// Question answered before 0023 is applied anywhere that holds real data: of
// the rows in `uploaded_files`, how many will the migration attribute to a
// merchant, how many will it (deliberately) leave NULL as ambiguous or orphaned,
// and how many invoice/quote/job-invoice rows carry a `document_url` the
// checkout will no longer surface?
//
// It performs ZERO writes. Every query runs inside one READ ONLY, REPEATABLE
// READ transaction that is always rolled back, and it refuses to run against a
// database the caller has not explicitly named (see connectionSettings() in
// schema-fingerprint.mjs and the identical pattern in
// count-gap11-session-replay-duplicates.mjs), so it cannot silently drift onto
// the wrong target when someone with production access re-runs it there.
//
// Numbers only. No query projects a path, id, url, merchant id or any file
// content: this reads tenant financial documents' metadata and must not become
// a way to exfiltrate it. It does not reference `uploaded_files.merchant_id`,
// so it gives the same classification before and after the migration.
//
// The classification uses the SAME patterns as migrations/0023_*.sql; a test
// asserts they have not drifted apart.
import { connectionSettings } from './schema-fingerprint.mjs';

const fail = (code) => { throw new Error(code); };

export function parseArguments(argv) {
  const options = new Map();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) fail('GAP13_PREFLIGHT_INVALID_ARGUMENTS');
    if (options.has(match[1])) fail('GAP13_PREFLIGHT_INVALID_ARGUMENTS');
    options.set(match[1], match[2]);
  }
  const host = options.get('expected-host');
  const database = options.get('expected-database');
  if (!host || !database) fail('GAP13_PREFLIGHT_INVALID_ARGUMENTS');
  if ([...options.keys()].some((key) => !['expected-host', 'expected-database'].includes(key))) {
    fail('GAP13_PREFLIGHT_INVALID_ARGUMENTS');
  }
  return { host, database };
}

/**
 * The URI says which database the caller believes they reached; the server
 * says which one they actually reached. Both must match what the caller named.
 * Mirrors count-gap11-session-replay-duplicates.mjs's assertTarget exactly.
 */
export function assertTarget(expected, settings, server) {
  if (settings.host !== expected.host || settings.database !== expected.database) {
    fail('GAP13_PREFLIGHT_TARGET_MISMATCH');
  }
  if (server.current_database !== expected.database) fail('GAP13_PREFLIGHT_TARGET_MISMATCH');
}

// The exact reference shape `POST /api/property/invoices/document` produces and
// migration 0023 attributes from; anything else attributes nothing.
export const DOCUMENT_REFERENCE_PATTERN = String.raw`^/uploads/(invoices/invoice-[0-9]{10,16}-[0-9a-f]{16}(?:\.[a-z0-9]{1,10})?)$`;
// A logo's own path names its merchant: logos/merchant-<n>.<ext>.
export const LOGO_PATH_PATTERN = String.raw`^logos/merchant-([0-9]{1,9})\.[A-Za-z0-9]{1,10}$`;

// Every row, in any of the three tables, that references a stored document.
const REFERENCES_CTE = `
  refs AS (
    SELECT document_url, merchant_id FROM invoices_rent_requests WHERE document_url IS NOT NULL AND document_url <> ''
    UNION ALL
    SELECT document_url, merchant_id FROM quotes WHERE document_url IS NOT NULL AND document_url <> ''
    UNION ALL
    SELECT document_url, merchant_id FROM job_invoices WHERE document_url IS NOT NULL AND document_url <> ''
  )`;

// Each query's outermost SELECT (the only one at column 0) projects nothing but
// count() aggregates; the CTEs above it read the columns and never leave the
// database.
export const QUERIES = Object.freeze({
  filesByFolder: `
SELECT count(*)::int AS total,
       count(*) FILTER (WHERE path LIKE 'logos/%')::int AS logos,
       count(*) FILTER (WHERE path LIKE 'invoices/%')::int AS invoices,
       count(*) FILTER (WHERE path NOT LIKE 'logos/%' AND path NOT LIKE 'invoices/%')::int AS other
  FROM uploaded_files
  `,
  logosByAttribution: `
SELECT count(*) FILTER (WHERE m.id IS NOT NULL)::int AS attributable,
       count(*) FILTER (WHERE m.id IS NULL)::int AS unattributable
  FROM uploaded_files f
  LEFT JOIN merchants m
    ON f.path ~ '${LOGO_PATH_PATTERN}'
   AND m.id = substring(f.path from '${LOGO_PATH_PATTERN}')::integer
 WHERE f.path LIKE 'logos/%'
  `,
  invoiceDocumentsByAttribution: `
WITH${REFERENCES_CTE},
  parsed AS (
    SELECT substring(document_url from '${DOCUMENT_REFERENCE_PATTERN}') AS path, merchant_id FROM refs
  ),
  per_path AS (
    SELECT p.path,
           count(*) AS reference_rows,
           count(DISTINCT p.merchant_id) AS distinct_merchants,
           count(m.id) AS references_with_existing_merchant
      FROM parsed p
      LEFT JOIN merchants m ON m.id = p.merchant_id
     WHERE p.path IS NOT NULL
     GROUP BY p.path
  )
SELECT count(*) FILTER (WHERE pp.path IS NULL)::int AS orphan,
       count(*) FILTER (WHERE pp.path IS NOT NULL
                          AND pp.distinct_merchants = 1
                          AND pp.references_with_existing_merchant = pp.reference_rows)::int AS attributable,
       count(*) FILTER (WHERE pp.path IS NOT NULL
                          AND NOT (pp.distinct_merchants = 1
                                   AND pp.references_with_existing_merchant = pp.reference_rows))::int AS ambiguous
  FROM uploaded_files f
  LEFT JOIN per_path pp ON pp.path = f.path
 WHERE f.path LIKE 'invoices/%'
  `,
  referencingRows: `
WITH${REFERENCES_CTE}
SELECT count(*)::int AS total,
       count(*) FILTER (WHERE substring(r.document_url from '${DOCUMENT_REFERENCE_PATTERN}') IS NULL)::int AS unrecognised_shape,
       count(*) FILTER (WHERE substring(r.document_url from '${DOCUMENT_REFERENCE_PATTERN}') IS NOT NULL
                          AND NOT EXISTS (
                            SELECT 1 FROM uploaded_files f
                             WHERE f.path = substring(r.document_url from '${DOCUMENT_REFERENCE_PATTERN}')
                          ))::int AS pointing_at_missing_file
  FROM refs r
  `,
});

export async function runPreflight(client, expected, settings) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  try {
    // House discipline (schema-fingerprint.mjs's collectSchema): bound every
    // read against a real database with explicit timeouts.
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const identity = await client.query('SELECT current_database(), current_user');
    assertTarget(expected, settings, identity.rows[0]);

    // pg.Client (a single connection) serialises queries, so these run in sequence.
    const files = (await client.query(QUERIES.filesByFolder)).rows[0];
    const logos = (await client.query(QUERIES.logosByAttribution)).rows[0];
    const invoiceDocuments = (await client.query(QUERIES.invoiceDocumentsByAttribution)).rows[0];
    const references = (await client.query(QUERIES.referencingRows)).rows[0];

    const result = {
      database: identity.rows[0].current_database,
      role: identity.rows[0].current_user,
      files: { total: files.total, logos: files.logos, invoices: files.invoices, other: files.other },
      logos: { attributable: logos.attributable, unattributable: logos.unattributable },
      invoiceDocuments: {
        attributable: invoiceDocuments.attributable,
        ambiguous: invoiceDocuments.ambiguous,
        orphan: invoiceDocuments.orphan,
      },
      referencingRows: {
        total: references.total,
        unrecognisedShape: references.unrecognised_shape,
        pointingAtMissingFile: references.pointing_at_missing_file,
      },
    };
    // The migration itself is additive and fails closed, so it is always safe to
    // apply; what an owner must look at first is anything that would change what
    // a customer sees today: a document that cannot be attributed unambiguously,
    // or a stored reference the checkout will no longer surface.
    return {
      ...result,
      requiresOwnerReview:
        result.invoiceDocuments.ambiguous > 0
        || result.referencingRows.unrecognisedShape > 0
        || result.referencingRows.pointingAtMissingFile > 0,
    };
  } finally {
    // Nothing was written; rolled back anyway so no snapshot/lock is held.
    await client.query('ROLLBACK').catch(() => undefined);
  }
}

export async function main(argv, env) {
  const expected = parseArguments(argv);
  const settings = connectionSettings({ FINGERPRINT_DATABASE_URL: env.GAP13_PREFLIGHT_DATABASE_URL });
  const { default: pg } = await import('pg');
  const client = new pg.Client({ ...settings, application_name: 'gap13-uploads-preflight' });
  await client.connect();
  try {
    return await runPreflight(client, expected, settings);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('count-gap13-uploaded-files-attribution.mjs')) {
  try {
    const result = await main(process.argv.slice(2), process.env);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(
      `GAP13_PREFLIGHT database=${result.database} role=${result.role} `
      + `files_total=${result.files.total} logos_attributable=${result.logos.attributable} `
      + `logos_unattributable=${result.logos.unattributable} `
      + `invoice_docs_attributable=${result.invoiceDocuments.attributable} `
      + `invoice_docs_ambiguous=${result.invoiceDocuments.ambiguous} `
      + `invoice_docs_orphan=${result.invoiceDocuments.orphan} `
      + `referencing_rows_unrecognised=${result.referencingRows.unrecognisedShape} `
      + `referencing_rows_missing_file=${result.referencingRows.pointingAtMissingFile} `
      + `requires_owner_review=${result.requiresOwnerReview}\n`,
    );
    if (result.requiresOwnerReview) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${/^(?:GAP13_PREFLIGHT|FINGERPRINT)_[A-Z_]+$/.test(error.message) ? error.message : 'GAP13_PREFLIGHT_FAILED'}\n`);
    process.exitCode = 1;
  }
}
