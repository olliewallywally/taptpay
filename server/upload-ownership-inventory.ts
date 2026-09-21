import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { MigrationClient } from "./migrate";

/**
 * Gap 13 — the owner's decision of 2026-09-19, "Require a trusted ownership
 * inventory before migration"
 * (docs/decisions/2026-09-19-gap13-trusted-ownership-inventory.md).
 *
 * Migration 0023 attributed legacy invoice documents from the invoice/quote rows
 * that referenced them, and a reference proves nothing about who uploaded a file:
 * before gap 13 any merchant could attach any string. So the migrations that set
 * document ownership (0023–0025) run only with an operator-approved inventory
 * naming every existing invoice document's verified owner, and 0025 replaces
 * every inferred owner with the inventory's. The runner refuses before it touches
 * the database when the inventory is absent, altered, approved for another
 * database, or does not match every invoice document exactly.
 *
 * This validates an artifact, not the truth of its evidence. A person inspects
 * the independent evidence and approves the file's SHA-256.
 */

const GUIDANCE = {
  REQUIRED:
    "migrations 0023–0025 set invoice-document ownership and run only with an operator-approved inventory: " +
    "pass --upload-ownership-inventory=<file> and --upload-ownership-inventory-sha256=<SHA-256 of that file>",
  FLAGS_INCOMPLETE:
    "pass both --upload-ownership-inventory and --upload-ownership-inventory-sha256, or neither",
  TOO_LARGE: "the inventory file is larger than 16 MiB",
  UNREADABLE: "the inventory file could not be read",
  DIGEST_MISMATCH:
    "the inventory file's SHA-256 is not the approved digest: the file changed after approval, or the wrong digest was given",
  INVALID:
    "the inventory is not a valid version-1 inventory: every entry needs a file id, path and content SHA-256, " +
    "a merchant id and evidence",
  DUPLICATE_FILE: "the inventory lists the same file more than once",
  TARGET_MISMATCH: "the inventory was approved for a different database",
  COVERAGE_MISMATCH:
    "the inventory does not match this database exactly: an invoice document is missing from it, or an entry's " +
    "file, path hash, content hash or merchant does not match",
} as const;

export type UploadInventoryFailure = keyof typeof GUIDANCE;

/** Messages are fixed text, never a path, digest or row value — safe to print. */
export class UploadOwnershipInventoryError extends Error {
  readonly code: `UPLOAD_INVENTORY_${UploadInventoryFailure}`;
  constructor(failure: UploadInventoryFailure) {
    super(`UPLOAD_INVENTORY_${failure}: ${GUIDANCE[failure]}. See docs/operations/migration-release.md.`);
    this.name = "UploadOwnershipInventoryError";
    this.code = `UPLOAD_INVENTORY_${failure}`;
  }
}

function fail(failure: UploadInventoryFailure): never {
  throw new UploadOwnershipInventoryError(failure);
}

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const label = z.string().trim().min(1).max(200).regex(/^[\x20-\x7e]+$/);
const inventorySchema = z.object({
  version: z.literal(1),
  target: z.object({ host: z.string().min(1), port: z.number().int().min(1).max(65535), database: z.string().min(1) }).strict(),
  approvedBy: label,
  approvedAt: z.string().datetime({ offset: true }),
  entries: z.array(z.object({
    fileId: z.number().int().positive().max(2147483647),
    pathSha256: digest,
    contentSha256: digest,
    merchantId: z.number().int().positive().max(2147483647),
    evidence: z.object({
      kind: z.enum(["authenticated-upload-log", "merchant-attestation"]),
      reference: label,
      sha256: digest,
    }).strict(),
  }).strict()).max(100_000),
}).strict();

export type UploadInventoryTarget = { host: string; port: number; database: string };
export type UploadOwnershipInventory = z.infer<typeof inventorySchema> & { sha256: string };
const MAX_INVENTORY_BYTES = 16 * 1024 * 1024;

/** The runner's own host normalisation (server/migrate.ts normalizeHost). */
const normalizeHost = (host: string) => host.replace(/^\[|\]$/g, "").toLowerCase();

// This validates an operator-approved artifact, not the truth of its evidence.
// A human must inspect the independent source before approving its digest.
export function parseUploadOwnershipInventory(source: string, approvedSha256: string, target: UploadInventoryTarget): UploadOwnershipInventory {
  if (Buffer.byteLength(source) > MAX_INVENTORY_BYTES) fail("TOO_LARGE");
  const sha256 = createHash("sha256").update(source).digest("hex");
  if (!digest.safeParse(approvedSha256).success || sha256 !== approvedSha256) fail("DIGEST_MISMATCH");
  let json: unknown = undefined;
  try { json = JSON.parse(source); } catch { fail("INVALID"); }
  const parsed = inventorySchema.safeParse(json);
  if (!parsed.success) fail("INVALID");
  const value = parsed.data;
  if (normalizeHost(value.target.host) !== normalizeHost(target.host)
    || value.target.port !== target.port
    || value.target.database !== target.database) fail("TARGET_MISMATCH");
  if (new Set(value.entries.map(row => row.fileId)).size !== value.entries.length) fail("DUPLICATE_FILE");
  return { ...value, sha256 };
}

export function readUploadOwnershipInventory(file: string, approvedSha256: string, target: UploadInventoryTarget): UploadOwnershipInventory {
  let source = "";
  try {
    if (statSync(file).size > MAX_INVENTORY_BYTES) fail("TOO_LARGE");
    source = readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof UploadOwnershipInventoryError) throw error;
    fail("UNREADABLE");
  }
  return parseUploadOwnershipInventory(source, approvedSha256, target);
}

/** The two command-line flags: both (read and validated) or neither (undefined). */
export function readUploadOwnershipInventoryOption(
  options: { path?: string; sha256?: string },
  target: UploadInventoryTarget,
): UploadOwnershipInventory | undefined {
  const { path: file, sha256 } = options;
  if (file === undefined && sha256 === undefined) return undefined;
  if (!file || !sha256) fail("FLAGS_INCOMPLETE");
  return readUploadOwnershipInventory(file, sha256, target);
}

/** The migration that replaces inferred owners with the inventory's. */
export const UPLOAD_OWNERSHIP_REPAIR_MIGRATION = "0025_verified_upload_ownership.sql";
/** Where the runner stages the inventory inside 0025's transaction. 0025 reads it. */
export const STAGED_INVENTORY_TABLE = "gap13_upload_ownership_inventory";

export const INVENTORY_GATED_MIGRATIONS: ReadonlySet<string> = new Set([
  "0023_uploaded_files_tenant_column.sql",
  "0024_invoice_document_security.sql",
  UPLOAD_OWNERSHIP_REPAIR_MIGRATION,
]);
export function requireUploadOwnershipInventory(filename: string, inventory: UploadOwnershipInventory | undefined): void {
  if (INVENTORY_GATED_MIGRATIONS.has(filename) && !inventory) fail("REQUIRED");
}

function rows(inventory: UploadOwnershipInventory) {
  return inventory.entries.map(row => ({ file_id: row.fileId, path_sha256: row.pathSha256,
    content_sha256: row.contentSha256, merchant_id: row.merchantId,
    evidence_kind: row.evidence.kind, evidence_ref: row.evidence.reference, evidence_sha256: row.evidence.sha256 }));
}

/**
 * Every invoice document is listed, and every listed entry matches a real
 * invoice document byte for byte (path and content SHA-256) and a real
 * merchant. Read-only. Proves completeness, not that the evidence is true.
 */
export async function assertUploadInventoryCoverage(client: MigrationClient, inventory: UploadOwnershipInventory): Promise<void> {
  const identity = await client.query<{ database: string; has_files: boolean }>(
    "SELECT current_database() AS database, to_regclass('public.uploaded_files') IS NOT NULL AS has_files");
  if (identity.rows[0]?.database !== inventory.target.database) fail("TARGET_MISMATCH");
  if (!identity.rows[0].has_files) {
    if (inventory.entries.length) fail("COVERAGE_MISMATCH");
    return; // Empty pre-schema database still requires an explicitly approved empty inventory.
  }
  const result = await client.query<{ missing: number; invalid: number }>(`
    WITH inventory AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb)
      AS i(file_id integer, path_sha256 text, content_sha256 text, merchant_id integer)
    )
    SELECT (SELECT count(*)::int FROM public.uploaded_files f WHERE f.path LIKE 'invoices/%'
              AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.file_id=f.id)) AS missing,
           (SELECT count(*)::int FROM inventory i
              LEFT JOIN public.uploaded_files f ON f.id=i.file_id
              LEFT JOIN public.merchants m ON m.id=i.merchant_id
             WHERE f.id IS NULL OR m.id IS NULL OR f.path NOT LIKE 'invoices/%'
                OR encode(sha256(convert_to(f.path,'UTF8')),'hex') <> i.path_sha256
                OR encode(sha256(f.data),'hex') <> i.content_sha256) AS invalid`, [JSON.stringify(rows(inventory))]);
  if (!result.rows[0] || result.rows[0].missing !== 0 || result.rows[0].invalid !== 0) fail("COVERAGE_MISMATCH");
}

// Called inside migration 0025's transaction. Lock out uploads between the last
// completeness/hash check and the ownership update; no stale approval can win a race.
export async function stageUploadOwnershipInventory(client: MigrationClient, inventory: UploadOwnershipInventory): Promise<void> {
  await client.query("LOCK TABLE public.uploaded_files IN SHARE ROW EXCLUSIVE MODE");
  await assertUploadInventoryCoverage(client, inventory);
  await client.query(`CREATE TEMP TABLE ${STAGED_INVENTORY_TABLE} (
    file_id integer PRIMARY KEY, path_sha256 text NOT NULL, content_sha256 text NOT NULL,
    merchant_id integer NOT NULL, evidence_kind text NOT NULL, evidence_ref text NOT NULL,
    evidence_sha256 text NOT NULL, approved_by text NOT NULL, approved_at timestamptz NOT NULL,
    inventory_sha256 text NOT NULL
  ) ON COMMIT DROP`);
  await client.query(`INSERT INTO pg_temp.${STAGED_INVENTORY_TABLE}
    SELECT i.*, $2, $3::timestamptz, $4 FROM jsonb_to_recordset($1::jsonb)
      AS i(file_id integer, path_sha256 text, content_sha256 text, merchant_id integer,
           evidence_kind text, evidence_ref text, evidence_sha256 text)`,
  [JSON.stringify(rows(inventory)), inventory.approvedBy, inventory.approvedAt, inventory.sha256]);
}
