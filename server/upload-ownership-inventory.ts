import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { MigrationClient } from "./migrate";

/**
 * Gap 13 — who owns each invoice document that existed before tenant scoping.
 *
 * Migration 0023 attributed legacy invoice documents from the invoice/quote rows
 * that referenced them, and a reference alone proves nothing about who uploaded
 * a file: before gap 13 any merchant could attach any string. So 0023–0025 run
 * only with an operator-approved list (docs/decisions/2026-09-19-gap13-trusted-
 * ownership-inventory.md), and 0025 replaces every inferred owner with the list's.
 *
 * Owner decision 2026-09-21 (docs/decisions/2026-09-21-gap13-ownership-rule-and-
 * retention.md): the list is drafted from TaptPay's own records. A document is its
 * merchant's when exactly one merchant attached it and first did so within 24
 * hours of its upload (the upload time is in the server-generated file name) —
 * the normal upload-then-invoice flow, which only the uploader's browser could
 * complete. Every other document is listed as LOCKED: kept, never deleted, served
 * to no merchant or customer, readable by the audited platform admin. An operator
 * may also record other evidence (an upload log, a merchant's attestation), or
 * lock anything. The runner re-checks "TaptPay's records" evidence against the
 * database itself; other evidence it cannot check, so a person approves the
 * list's SHA-256. The runner refuses before touching the database when the list
 * is absent, altered, for another database, or does not match every invoice
 * document exactly.
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
    "the inventory is not a valid version-2 inventory: every invoice document needs either an owner with evidence, " +
    "or a locked reason — draft it with npm run db:draft-upload-inventory",
  APPROVER_INVALID:
    "--approved-by must be 1–200 printable ASCII characters (no accents or symbols beyond ASCII): " +
    "the list and the evidence table record it",
  DUPLICATE_FILE: "the inventory lists the same file more than once",
  TARGET_MISMATCH: "the inventory was approved for a different database",
  COVERAGE_MISMATCH:
    "the inventory does not match this database exactly: every invoice document must be listed once, and every " +
    "entry must match a real invoice document by id, path hash and content hash (and name an existing merchant if it gives an owner)",
  EVIDENCE_MISMATCH:
    "an entry gives TaptPay's own records as evidence, but the records do not show exactly that merchant attaching " +
    "the document within 24 hours of its upload — redraft the inventory",
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

/** Why a document is locked (admin-only). "operator-decision": a person locked it. */
export const LOCKED_REASONS = [
  "never-attached",
  "several-merchants",
  "attached-outside-window",
  "attach-time-unknown",
  "unrecognised-name",
  "merchant-missing",
  "operator-decision",
] as const;
export type LockedReason = (typeof LOCKED_REASONS)[number];

export const EVIDENCE_KINDS = ["system-record", "authenticated-upload-log", "merchant-attestation"] as const;

/** First attach no earlier than 5 minutes before the recorded upload (clock skew) and no later than 24 hours after. */
export const ATTACH_WINDOW = Object.freeze({ beforeMs: 5 * 60_000, afterMs: 24 * 3_600_000 });

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const label = z.string().trim().min(1).max(200).regex(/^[\x20-\x7e]+$/);
const fileFields = {
  fileId: z.number().int().positive().max(2147483647),
  pathSha256: digest,
  contentSha256: digest,
};
const ownerEntry = z.object({
  ...fileFields,
  disposition: z.literal("owner"),
  merchantId: z.number().int().positive().max(2147483647),
  evidence: z.object({ kind: z.enum(EVIDENCE_KINDS), reference: label, sha256: digest }).strict(),
}).strict();
const lockedEntry = z.object({
  ...fileFields,
  disposition: z.literal("locked"),
  reason: z.enum(LOCKED_REASONS),
}).strict();
const inventorySchema = z.object({
  version: z.literal(2),
  target: z.object({ host: z.string().min(1), port: z.number().int().min(1).max(65535), database: z.string().min(1) }).strict(),
  approvedBy: label,
  approvedAt: z.string().datetime({ offset: true }),
  entries: z.array(z.discriminatedUnion("disposition", [ownerEntry, lockedEntry])).max(100_000),
}).strict();

export type UploadInventoryTarget = { host: string; port: number; database: string };
export type UploadOwnershipInventory = z.infer<typeof inventorySchema> & { sha256: string };
export type UploadOwnershipInventoryDraft = z.infer<typeof inventorySchema>;
const MAX_INVENTORY_BYTES = 16 * 1024 * 1024;

/** The runner's own host normalisation (server/migrate.ts normalizeHost). */
const normalizeHost = (host: string) => host.replace(/^\[|\]$/g, "").toLowerCase();
const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

// This validates an operator-approved artifact. Only "system-record" evidence is
// later re-checked against the database; a human approves the rest by its digest.
export function parseUploadOwnershipInventory(source: string, approvedSha256: string, target: UploadInventoryTarget): UploadOwnershipInventory {
  if (Buffer.byteLength(source) > MAX_INVENTORY_BYTES) fail("TOO_LARGE");
  const sha256 = sha256Hex(source);
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

// ---------------------------------------------------------------------------
// TaptPay's own records: what the automatic rule reads, and the rule itself
// ---------------------------------------------------------------------------

/** One invoice document as the database records it. No path or content leaves the database. */
export interface InvoiceDocumentFacts {
  fileId: number;
  pathSha256: string;
  /** Null when read for counting only. */
  contentSha256: string | null;
  /** The name the upload route generates, so its upload time can be read from it. */
  nameRecognised: boolean;
  uploadedAt: Date | null;
  /** Distinct merchants whose invoices, quotes or job invoices attach it. */
  merchants: number;
  /** That merchant, when there is exactly one. */
  merchantId: number | null;
  merchantExists: boolean;
  /** The earliest of those rows' creation times. */
  firstAttachedAt: Date | null;
}

export type DocumentClassification =
  | { disposition: "owner"; merchantId: number; uploadedAt: Date; firstAttachedAt: Date }
  | { disposition: "locked"; reason: LockedReason };

export function classifyInvoiceDocument(facts: InvoiceDocumentFacts): DocumentClassification {
  const locked = (reason: LockedReason): DocumentClassification => ({ disposition: "locked", reason });
  if (!facts.nameRecognised || !facts.uploadedAt) return locked("unrecognised-name");
  if (facts.merchants === 0) return locked("never-attached");
  if (facts.merchants > 1) return locked("several-merchants");
  if (facts.merchantId === null || !facts.merchantExists) return locked("merchant-missing");
  if (!facts.firstAttachedAt) return locked("attach-time-unknown");
  const gap = facts.firstAttachedAt.getTime() - facts.uploadedAt.getTime();
  if (gap < -ATTACH_WINDOW.beforeMs || gap > ATTACH_WINDOW.afterMs) return locked("attached-outside-window");
  return { disposition: "owner", merchantId: facts.merchantId, uploadedAt: facts.uploadedAt, firstAttachedAt: facts.firstAttachedAt };
}

/** A generated name, exactly as upload-policy.ts and migration 0023 accept it. */
const GENERATED_NAME = String.raw`invoices/invoice-[0-9]{10,16}-[0-9a-f]{16}(?:\.[a-z0-9]{1,10})?`;
const REFERENCE = String.raw`'^/uploads/(${GENERATED_NAME})$'`;

/**
 * Read-only. `created_at` is `timestamp` (no zone) written by the database's own
 * now(), which is UTC on every target this app uses; `AT TIME ZONE 'UTC'` reads it
 * as such (and is equally right for a `timestamptz` column).
 */
export function invoiceDocumentFactsSql(withContent: boolean): string {
  return `
    WITH refs AS (
      SELECT substring(document_url from ${REFERENCE}) AS path, merchant_id, created_at
        FROM public.invoices_rent_requests WHERE document_url IS NOT NULL
      UNION ALL
      SELECT substring(document_url from ${REFERENCE}), merchant_id, created_at
        FROM public.quotes WHERE document_url IS NOT NULL
      UNION ALL
      SELECT substring(document_url from ${REFERENCE}), merchant_id, created_at
        FROM public.job_invoices WHERE document_url IS NOT NULL
    ),
    per_file AS (
      SELECT f.id, f.path,
             count(DISTINCT r.merchant_id)::int AS merchants,
             CASE WHEN count(DISTINCT r.merchant_id) = 1 THEN min(r.merchant_id) END AS merchant_id,
             min(r.created_at) AS first_attached
        FROM public.uploaded_files f
        LEFT JOIN refs r ON r.path = f.path
       WHERE f.path LIKE 'invoices/%'
       GROUP BY f.id, f.path
    )
    SELECT p.id AS file_id,
           encode(sha256(convert_to(p.path, 'UTF8')), 'hex') AS path_sha256,
           ${withContent ? "(SELECT encode(sha256(u.data), 'hex') FROM public.uploaded_files u WHERE u.id = p.id)" : "NULL"} AS content_sha256,
           p.path ~ '^${GENERATED_NAME}$' AS name_recognised,
           CASE WHEN p.path ~ '^${GENERATED_NAME}$'
                THEN substring(p.path from '^invoices/invoice-([0-9]{10,16})-') END AS uploaded_ms,
           p.merchants,
           p.merchant_id,
           (p.merchant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = p.merchant_id)) AS merchant_exists,
           CASE WHEN p.first_attached IS NOT NULL
                THEN floor(extract(epoch FROM (p.first_attached AT TIME ZONE 'UTC')) * 1000)::bigint::text END AS first_attached_ms
      FROM per_file p
     ORDER BY p.id`;
}

export async function readInvoiceDocumentFacts(client: MigrationClient, options: { withContent: boolean }): Promise<InvoiceDocumentFacts[]> {
  const result = await client.query<Record<string, unknown>>(invoiceDocumentFactsSql(options.withContent));
  const toDate = (ms: unknown) => {
    if (ms === null || ms === undefined) return null;
    const date = new Date(Number(ms));
    return Number.isFinite(date.getTime()) ? date : null;
  };
  return result.rows.map((row) => ({
    fileId: Number(row.file_id),
    pathSha256: String(row.path_sha256),
    contentSha256: row.content_sha256 == null ? null : String(row.content_sha256),
    nameRecognised: row.name_recognised === true,
    uploadedAt: toDate(row.uploaded_ms),
    merchants: Number(row.merchants),
    merchantId: row.merchant_id == null ? null : Number(row.merchant_id),
    merchantExists: row.merchant_exists === true,
    firstAttachedAt: toDate(row.first_attached_ms),
  }));
}

export interface ClassificationSummary {
  total: number;
  owner: number;
  locked: Partial<Record<LockedReason, number>>;
}

/** Numbers only — safe to share. */
export function summarizeClassifications(all: readonly InvoiceDocumentFacts[]): ClassificationSummary {
  const summary: ClassificationSummary = { total: all.length, owner: 0, locked: {} };
  for (const facts of all) {
    const result = classifyInvoiceDocument(facts);
    if (result.disposition === "owner") summary.owner += 1;
    else summary.locked[result.reason] = (summary.locked[result.reason] ?? 0) + 1;
  }
  return summary;
}

/** The list the operator reviews and approves: every document once, owner or locked. */
export function buildDraftInventory(
  all: readonly InvoiceDocumentFacts[],
  meta: { target: UploadInventoryTarget; approvedBy: string; approvedAt: string },
): { inventory: UploadOwnershipInventoryDraft; summary: ClassificationSummary } {
  const entries = all.map((facts) => {
    if (!facts.contentSha256) throw new Error("A draft inventory needs every document's content SHA-256");
    const file = { fileId: facts.fileId, pathSha256: facts.pathSha256, contentSha256: facts.contentSha256 };
    const result = classifyInvoiceDocument(facts);
    if (result.disposition === "locked") return { ...file, disposition: "locked" as const, reason: result.reason };
    const seconds = Math.round((result.firstAttachedAt.getTime() - result.uploadedAt.getTime()) / 1000);
    const recorded = [facts.fileId, result.merchantId, result.uploadedAt.toISOString(), result.firstAttachedAt.toISOString()].join("|");
    return {
      ...file,
      disposition: "owner" as const,
      merchantId: result.merchantId,
      evidence: {
        kind: "system-record" as const,
        reference: `TaptPay records: one merchant, first attached ${seconds}s after upload`,
        sha256: sha256Hex(recorded),
      },
    };
  });
  const { host, port, database } = meta.target;
  const inventory: UploadOwnershipInventoryDraft = { version: 2, target: { host, port, database }, approvedBy: meta.approvedBy, approvedAt: meta.approvedAt, entries };
  // Never hand an operator a list to approve that the runner would refuse.
  if (!inventorySchema.safeParse(inventory).success) fail("INVALID");
  return { inventory, summary: summarizeClassifications(all) };
}

/** The drafting tool checks its approver before reading anything, by the list's own rule. */
export function assertInventoryApprover(approvedBy: string): void {
  if (!label.safeParse(approvedBy).success) fail("APPROVER_INVALID");
}

// ---------------------------------------------------------------------------
// Coverage and staging (the runner)
// ---------------------------------------------------------------------------

function rows(inventory: UploadOwnershipInventory) {
  return inventory.entries.map((row) => {
    const file = { file_id: row.fileId, path_sha256: row.pathSha256, content_sha256: row.contentSha256 };
    return row.disposition === "owner"
      ? { ...file, disposition: "owner", merchant_id: row.merchantId, evidence_kind: row.evidence.kind,
          evidence_ref: row.evidence.reference, evidence_sha256: row.evidence.sha256, locked_reason: null }
      : { ...file, disposition: "locked", merchant_id: null, evidence_kind: null, evidence_ref: null,
          evidence_sha256: null, locked_reason: row.reason };
  });
}

/**
 * Every invoice document is listed, every entry matches a real invoice document
 * byte for byte (path and content SHA-256), every owner is an existing merchant,
 * and every "TaptPay's records" claim is true of the records now. Read-only.
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
      AS i(file_id integer, path_sha256 text, content_sha256 text, disposition text, merchant_id integer)
    )
    SELECT (SELECT count(*)::int FROM public.uploaded_files f WHERE f.path LIKE 'invoices/%'
              AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.file_id=f.id)) AS missing,
           (SELECT count(*)::int FROM inventory i
              LEFT JOIN public.uploaded_files f ON f.id=i.file_id
              LEFT JOIN public.merchants m ON m.id=i.merchant_id
             WHERE f.id IS NULL OR f.path NOT LIKE 'invoices/%'
                OR (i.disposition = 'owner' AND m.id IS NULL)
                OR encode(sha256(convert_to(f.path,'UTF8')),'hex') <> i.path_sha256
                OR encode(sha256(f.data),'hex') <> i.content_sha256) AS invalid`, [JSON.stringify(rows(inventory))]);
  if (!result.rows[0] || result.rows[0].missing !== 0 || result.rows[0].invalid !== 0) fail("COVERAGE_MISMATCH");

  const claimed = inventory.entries.filter((row) => row.disposition === "owner" && row.evidence.kind === "system-record");
  if (claimed.length === 0) return;
  const facts = new Map((await readInvoiceDocumentFacts(client, { withContent: false })).map((row) => [row.fileId, row]));
  for (const row of claimed) {
    const recorded = facts.get(row.fileId);
    const result = recorded ? classifyInvoiceDocument(recorded) : undefined;
    if (!result || result.disposition !== "owner" || row.disposition !== "owner" || result.merchantId !== row.merchantId) {
      fail("EVIDENCE_MISMATCH");
    }
  }
}

// Called inside migration 0025's transaction. Lock out uploads between the last
// completeness/hash/records check and the ownership update; no stale approval can win a race.
export async function stageUploadOwnershipInventory(client: MigrationClient, inventory: UploadOwnershipInventory): Promise<void> {
  await client.query("LOCK TABLE public.uploaded_files IN SHARE ROW EXCLUSIVE MODE");
  await assertUploadInventoryCoverage(client, inventory);
  await client.query(`CREATE TEMP TABLE ${STAGED_INVENTORY_TABLE} (
    file_id integer PRIMARY KEY, path_sha256 text NOT NULL, content_sha256 text NOT NULL,
    disposition text NOT NULL, merchant_id integer, evidence_kind text, evidence_ref text,
    evidence_sha256 text, locked_reason text,
    approved_by text NOT NULL, approved_at timestamptz NOT NULL, inventory_sha256 text NOT NULL
  ) ON COMMIT DROP`);
  await client.query(`INSERT INTO pg_temp.${STAGED_INVENTORY_TABLE}
    SELECT i.*, $2, $3::timestamptz, $4 FROM jsonb_to_recordset($1::jsonb)
      AS i(file_id integer, path_sha256 text, content_sha256 text, disposition text, merchant_id integer,
           evidence_kind text, evidence_ref text, evidence_sha256 text, locked_reason text)`,
  [JSON.stringify(rows(inventory)), inventory.approvedBy, inventory.approvedAt, inventory.sha256]);
}
