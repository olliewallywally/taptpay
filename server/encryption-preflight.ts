import { DataEncryption, LEGACY_BANK_COLUMNS, LEGACY_PROTECTED_COLUMNS, MAX_ENCRYPTED_ENVELOPE_LENGTH, type EncryptionBucket, type LegacyBankColumn, type LegacyProtectedColumn } from "./data-encryption";

export interface PreflightTarget { readonly host: string; readonly port: number; readonly database: string }
export interface PreflightClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, any>[] }>;
}
function fail(code: string): never { throw new Error(code); }
export const MAX_PREFLIGHT_BATCH_SIZE = 100;
export const DEFAULT_PREFLIGHT_BATCH_SIZE = 25;

export function parsePreflightArguments(argv: readonly string[]): PreflightTarget & { batchSize: number } {
  const options = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match || options.has(match[1])) fail("R5_PREFLIGHT_INVALID_ARGUMENTS");
    options.set(match[1], match[2]);
  }
  if ([...options.keys()].some(key => !["expected-host", "expected-port", "expected-database", "batch-size"].includes(key))) {
    fail("R5_PREFLIGHT_INVALID_ARGUMENTS");
  }
  const host = options.get("expected-host");
  const database = options.get("expected-database");
  const port = options.get("expected-port");
  const batch = options.get("batch-size") ?? String(DEFAULT_PREFLIGHT_BATCH_SIZE);
  if (!host || !database || !port || !/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535 ||
    !/^[1-9][0-9]{0,3}$/.test(batch) || Number(batch) > MAX_PREFLIGHT_BATCH_SIZE) fail("R5_PREFLIGHT_INVALID_ARGUMENTS");
  return { host, database, port: Number(port), batchSize: Number(batch) };
}

export function assertPreflightTarget(expected: PreflightTarget, settings: PreflightTarget, actualDatabase?: string): void {
  if (settings.host !== expected.host || settings.port !== expected.port || settings.database !== expected.database ||
    (actualDatabase !== undefined && actualDatabase !== expected.database)) fail("R5_PREFLIGHT_TARGET_MISMATCH");
}

// Fetch no unbounded text: an oversized stored value gets a separate invalid
// flag, never a truncation that could be mistaken for null or valid plaintext.
// The identifiers come only from the frozen server-side column list.
function pageQuery(columns: readonly LegacyProtectedColumn[], credentialPresence = false) {
  return `SELECT id, xmin::text AS encryption_row_version, ${columns.map(column =>
  `CASE WHEN octet_length(${column}) > ${MAX_ENCRYPTED_ENVELOPE_LENGTH} THEN NULL ELSE ${column} END AS ${column},
   (octet_length(${column}) > ${MAX_ENCRYPTED_ENVELOPE_LENGTH}) AS ${column}_oversized`).join(", ")}
  ${credentialPresence ? ", (windcave_api_key IS NOT NULL) AS credential_present" : ""}
  FROM public.merchants WHERE id > $1 ORDER BY id LIMIT $2`;
}
export const BANK_PAGE_QUERY = pageQuery(LEGACY_BANK_COLUMNS);
export const ENCRYPT_CREDENTIAL_PAGE_QUERY = pageQuery(LEGACY_PROTECTED_COLUMNS);
export const DELETE_CREDENTIAL_PAGE_QUERY = pageQuery(LEGACY_BANK_COLUMNS, true);
export type CredentialPolicy = "unselected" | "delete" | "encrypt";

// The unused credential must never leave PostgreSQL. It has a separate owner
// disposition gate; inspecting/decrypting its values is outside this preflight.
export const CREDENTIAL_COUNTS_QUERY = `SELECT count(*)::int AS merchants,
  count(*) FILTER (WHERE windcave_api_key IS NOT NULL)::int AS with_credential,
  count(*) FILTER (WHERE windcave_api_key IS NOT NULL AND btrim(windcave_api_key) <> '')::int AS with_nonempty_credential
  FROM public.merchants`;

const buckets: readonly EncryptionBucket[] = Object.freeze([
  "null", "plaintext", "encryptedActiveKey", "encryptedOldKey", "unknownKey",
  "malformedEnvelope", "authenticationFailure", "unsupportedVersion", "invalidValue",
]);
export type EncryptionCounts = Record<EncryptionBucket, number>;
export interface EncryptionPreflightReport {
  readonly merchants: number;
  readonly credentialCounts: { withCredential: number; withNonemptyCredential: number };
  readonly fields: Record<LegacyBankColumn, EncryptionCounts>;
  readonly safeToBackfill: boolean;
  readonly credentialEncryption?: EncryptionCounts;
}

/** No mutations, persistent values, row IDs or envelopes in the result. */
export async function countLegacyBankData(
  client: PreflightClient, expected: PreflightTarget, settings: PreflightTarget,
  reader: DataEncryption, batchSize = DEFAULT_PREFLIGHT_BATCH_SIZE, credentialPolicy: CredentialPolicy = "unselected",
): Promise<EncryptionPreflightReport> {
  assertPreflightTarget(expected, settings);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_PREFLIGHT_BATCH_SIZE) fail("R5_PREFLIGHT_INVALID_ARGUMENTS");
  if (reader.describe().stage === "legacy") fail("R5_PREFLIGHT_READER_NOT_READY");
  const fields = Object.fromEntries(LEGACY_BANK_COLUMNS.map(column => [column,
    Object.fromEntries(buckets.map(bucket => [bucket, 0])),
  ])) as Record<LegacyBankColumn, EncryptionCounts>;
  if (!["unselected", "delete", "encrypt"].includes(credentialPolicy)) fail("R5_PREFLIGHT_INVALID_ARGUMENTS");
  const credentialEncryption = Object.fromEntries(buckets.map(bucket => [bucket, 0])) as EncryptionCounts;
  const columns = credentialPolicy === "encrypt" ? LEGACY_PROTECTED_COLUMNS : LEGACY_BANK_COLUMNS;
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
  try {
    await client.query("SET LOCAL search_path = pg_catalog");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const identity = await client.query("SELECT current_database() AS database");
    if (typeof identity.rows[0]?.database !== "string") fail("R5_PREFLIGHT_TARGET_MISMATCH");
    assertPreflightTarget(expected, settings, identity.rows[0].database);
    const counts = (await client.query(CREDENTIAL_COUNTS_QUERY)).rows[0];
    if (!counts || [counts.merchants, counts.with_credential, counts.with_nonempty_credential]
      .some(count => !Number.isSafeInteger(count) || count < 0) ||
      counts.with_nonempty_credential > counts.with_credential || counts.with_credential > counts.merchants) {
      fail("R5_PREFLIGHT_INVALID_COUNTS");
    }
    let lastId = 0;
    let merchants = 0;
    while (true) {
      const { rows } = await client.query(credentialPolicy === "encrypt" ? ENCRYPT_CREDENTIAL_PAGE_QUERY : BANK_PAGE_QUERY, [lastId, batchSize]);
      if (rows.length > batchSize) fail("R5_PREFLIGHT_INVALID_PAGE");
      for (const row of rows) {
        if (!Number.isSafeInteger(row.id) || row.id <= lastId) fail("R5_PREFLIGHT_INVALID_PAGE");
        lastId = row.id;
        merchants++;
        for (const column of columns) {
          const bucket = row[`${column}_oversized`] === true ? "invalidValue" :
            reader.classify(row[column], { schema: "public", table: "merchants", rowId: row.id, column });
          if (column === "windcave_api_key") credentialEncryption[bucket]++;
          else fields[column][bucket]++;
        }
      }
      if (rows.length < batchSize) break;
    }
    if (merchants !== counts.merchants) fail("R5_PREFLIGHT_INCONSISTENT_COUNTS");
    const allCounts = [...Object.values(fields), ...(credentialPolicy === "encrypt" ? [credentialEncryption] : [])];
    const safeToBackfill = allCounts.every(count =>
      count.unknownKey === 0 && count.malformedEnvelope === 0 && count.authenticationFailure === 0 &&
      count.unsupportedVersion === 0 && count.invalidValue === 0);
    return { merchants, credentialCounts: {
      withCredential: counts.with_credential, withNonemptyCredential: counts.with_nonempty_credential,
    }, fields, safeToBackfill, ...(credentialPolicy === "encrypt" ? { credentialEncryption } : {}) };
  } finally {
    await client.query("ROLLBACK");
  }
}
