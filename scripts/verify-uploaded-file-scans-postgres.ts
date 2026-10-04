/**
 * R1-T7 S6a on actual PostgreSQL: a document is readable and attachable only with a clean scan on
 * record; the file and its verdict commit together; the verdict table's own rules.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-uploaded-file-scans-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { assertSafePostgresVerifierEnvironment } from "./postgres-verifier-safety.mjs";

const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
  testDatabaseUrl: process.env.TEST_DATABASE_URL, configuredDatabaseUrl: process.env.DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE,
});
assertSafePostgresVerifierEnvironment({ testDatabaseUrl, configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE });
const url = new URL(testDatabaseUrl);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s\d_verify_[a-z0-9_]+$/);
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
const writerName = "taptpay-t7-s6a-writer";
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: writerName });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.error(`FAIL ${name}`); }
}
const INVALID = [undefined, null, 0, -1, 1.5, NaN];
const SCAN = { scanner: "verifier" };
const BYTES = Buffer.from("%PDF-1.4\nsynthetic");

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires a new empty disposable database");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const inventories = await import("../server/upload-ownership-inventory");
  const client = await pool.connect();
  try {
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === "0025_verified_upload_ownership.sql") break;
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-04T00:00:00Z" });
    assert.equal(inventory.entries.length, 0);
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    console.log("MIGRATIONS applied on the empty disposable database through the existing runner");
  } finally { client.release(); }
  const { DatabaseStorage, UploadPathOwnershipError } = await import("../server/storage"); const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any) as any;
  const two = new DatabaseStorage(drizzle(writerPool, { schema }) as any) as any;
  await writerPool.query("SET statement_timeout='10s'");
  const addMerchant = async (label: string): Promise<number> => (await pool.query(
    "INSERT INTO merchants(name,business_name,email,status) VALUES ($1,$1,$2,'active') RETURNING id", [label, `${label}@tenant-storage.test`],
  )).rows[0].id;
  const a = await addMerchant("s6a-tenant-a"); const b = await addMerchant("s6a-tenant-b");
  let made = 0;
  const newPath = () => `invoices/invoice-17900000000${String(++made).padStart(2, "0")}-0123456789abcdef.pdf`;
  const fileRow = async (path: string) => (await pool.query("SELECT id, merchant_id, mime_type, data FROM uploaded_files WHERE path=$1", [path])).rows[0];
  const scanRow = async (path: string) => (await pool.query(
    "SELECT s.verdict, s.signature, s.scanner FROM uploaded_file_scans s JOIN uploaded_files f ON f.id=s.file_id WHERE f.path=$1", [path])).rows[0];
  const verdict = (path: string, verdictText: string, signature: string | null) => pool.query(
    "INSERT INTO uploaded_file_scans(file_id,verdict,signature,scanner) SELECT id,$2,$3,'verifier' FROM uploaded_files WHERE path=$1", [path, verdictText, signature]);
  const noReader = async (path: string, merchant: number) => {
    assert.equal(await one.getCleanUploadedFileForMerchant(path, merchant), undefined);
    assert.equal(await one.getCleanUploadedFile(path), undefined);
    assert.equal(await one.cleanUploadedFileOwnedByMerchant(path, merchant), false);
  };

  await check("a scanned save writes the file and its clean verdict, read by its business and the admin reader only", async () => {
    const path = newPath();
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN);
    assert.equal((await fileRow(path)).merchant_id, a);
    assert.deepEqual(await scanRow(path), { verdict: "clean", signature: null, scanner: "verifier" });
    assert.deepEqual((await one.getCleanUploadedFileForMerchant(path, a))?.data, BYTES);
    assert.deepEqual((await one.getCleanUploadedFile(path))?.data, BYTES);
    assert.equal(await one.cleanUploadedFileOwnedByMerchant(path, a), true);
    assert.equal(await one.getCleanUploadedFileForMerchant(path, b), undefined);
    assert.equal(await one.cleanUploadedFileOwnedByMerchant(path, b), false);
  });

  await check("a file with no verdict is found by no document reader; the public folder's reader is unchanged", async () => {
    const path = newPath();
    await one.saveUploadedFile(path, "application/pdf", BYTES, a);
    assert.equal(await scanRow(path), undefined);
    await noReader(path, a);
    assert.deepEqual((await one.getUploadedFile(path))?.data, BYTES);
  });

  await check("a file whose verdict is infected is found by no document reader", async () => {
    const path = newPath();
    await one.saveUploadedFile(path, "application/pdf", BYTES, a);
    await verdict(path, "infected", "Synthetic.Test");
    await noReader(path, a);
  });

  await check("the verdict table refuses a verdict that is neither, a nameless finding and a named clean one", async () => {
    const path = newPath();
    await one.saveUploadedFile(path, "application/pdf", BYTES, a);
    await assert.rejects(verdict(path, "probably-fine", null));
    await assert.rejects(verdict(path, "infected", null));
    await assert.rejects(verdict(path, "clean", "Synthetic.Test"));
    assert.equal(await scanRow(path), undefined);
    // One verdict per file.
    await verdict(path, "clean", null);
    await assert.rejects(verdict(path, "infected", "Synthetic.Test"));
    assert.deepEqual(await scanRow(path), { verdict: "clean", signature: null, scanner: "verifier" });
  });

  await check("a verdict goes when its file goes", async () => {
    const path = newPath();
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN);
    const id = (await fileRow(path)).id;
    await one.deleteUploadedFile(path, a);
    assert.equal(await fileRow(path), undefined);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM uploaded_file_scans WHERE file_id=$1", [id])).rows[0].n, 0);
  });

  await check("another business cannot replace a document or its verdict", async () => {
    const path = newPath();
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN);
    await assert.rejects(one.saveScannedUploadedFile(path, "image/png", Buffer.from("other"), b, { scanner: "other" }), UploadPathOwnershipError);
    assert.deepEqual((await fileRow(path)).data, BYTES);
    assert.deepEqual(await scanRow(path), { verdict: "clean", signature: null, scanner: "verifier" });
    assert.equal(await one.getCleanUploadedFileForMerchant(path, b), undefined);
    // Its own business may replace it, and the replacement carries its own verdict.
    await one.saveScannedUploadedFile(path, "application/pdf", Buffer.from("%PDF-1.4\nnew"), a, { scanner: "verifier-2" });
    assert.equal((await one.getCleanUploadedFileForMerchant(path, a))?.data.toString(), "%PDF-1.4\nnew");
    assert.equal((await scanRow(path)).scanner, "verifier-2");
  });

  await check("a rescan replaces an earlier infected verdict with the clean one it was given", async () => {
    const path = newPath();
    await one.saveUploadedFile(path, "application/pdf", BYTES, a);
    await verdict(path, "infected", "Synthetic.Test");
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN);
    assert.deepEqual(await scanRow(path), { verdict: "clean", signature: null, scanner: "verifier" });
    assert.deepEqual((await one.getCleanUploadedFileForMerchant(path, a))?.data, BYTES);
  });

  await check("bytes stored unscanned over a scanned document have no verdict, in the same transaction", async () => {
    const path = newPath();
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN);
    await one.saveUploadedFile(path, "application/pdf", Buffer.from("%PDF-1.4\nreplaced"), a);
    assert.equal(await scanRow(path), undefined);
    await noReader(path, a);
    // Another business's unscanned save is refused and leaves the document and its verdict alone.
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN);
    await assert.rejects(one.saveUploadedFile(path, "application/pdf", Buffer.from("other"), b), UploadPathOwnershipError);
    assert.deepEqual((await one.getCleanUploadedFileForMerchant(path, a))?.data, BYTES);
  });

  await check("a verdict that cannot be written stores no file", async () => {
    const path = newPath();
    await pool.query(`CREATE FUNCTION s6a_refuse_verdict() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic verdict failure'; END $$`);
    await pool.query("CREATE TRIGGER s6a_refuse_verdict BEFORE INSERT ON uploaded_file_scans FOR EACH ROW EXECUTE FUNCTION s6a_refuse_verdict()");
    try {
      await assert.rejects(one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN));
    } finally {
      await pool.query("DROP TRIGGER s6a_refuse_verdict ON uploaded_file_scans");
      await pool.query("DROP FUNCTION s6a_refuse_verdict()");
    }
    assert.equal(await fileRow(path), undefined);
  });

  await check("two businesses saving one path at once: one owner, and the verdict is its file's", async () => {
    for (let round = 0; round < 6; round++) {
      const path = newPath();
      const raced = await Promise.allSettled([
        one.saveScannedUploadedFile(path, "application/pdf", Buffer.from("a"), a, { scanner: "from-a" }),
        two.saveScannedUploadedFile(path, "application/pdf", Buffer.from("b"), b, { scanner: "from-b" }),
      ]);
      assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
      const row = await fileRow(path);
      const owner = row.merchant_id === a ? "a" : "b";
      assert.equal(row.data.toString(), owner);
      assert.equal((await scanRow(path)).scanner, `from-${owner}`);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM uploaded_file_scans WHERE file_id=$1", [row.id])).rows[0].n, 1);
    }
  });

  await check("invalid businesses store and read nothing", async () => {
    const path = newPath();
    for (const invalid of INVALID) await assert.rejects(one.saveScannedUploadedFile(path, "application/pdf", BYTES, invalid, SCAN));
    assert.equal(await fileRow(path), undefined);
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN);
    for (const invalid of INVALID) {
      assert.equal(await one.getCleanUploadedFileForMerchant(path, invalid), undefined);
      assert.equal(await one.cleanUploadedFileOwnedByMerchant(path, invalid), false);
    }
  });

  // ── The attach holds in storage: the same rule, under the share lock ──
  const tenant = await one.createTenantProfileForMerchant(a, { firstName: "Synthetic", lastName: "Profile", email: "owned@example.test", propertyAddress: "Test address" });
  const clientProfile = await one.createClientProfileForMerchant(a, { firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test" });
  const charge = (documentUrl: string) => one.createOrReuseInvoiceRentRequestForMerchant(tenant.id, a,
    { amountCents: 52_000, deliveryChannel: "email", dueAt: new Date("2026-10-10T00:00:00Z"), kind: "charge", chargeType: "utilities", documentUrl, documentName: "synthetic.pdf" });
  const quote = (documentUrl: string) => one.createQuoteForMerchant(a, { clientProfileId: clientProfile.id }, {
    lineItems: [{ description: "Synthetic", qty: 1, unitPriceCents: 100_000, lineTotalCents: 100_000 }], subtotalCents: 100_000, gstCents: 0, gstMode: null,
    totalCents: 100_000, depositEnabled: false, depositType: null, depositValue: null, depositCents: 0, deliveryChannel: "email", validUntil: null, notes: null,
    documentUrl, documentName: "synthetic.pdf" });
  const counts = async () => (await pool.query("SELECT (SELECT count(*) FROM invoices_rent_requests)::int AS invoices, (SELECT count(*) FROM quotes)::int AS quotes")).rows[0];

  await check("a document with no verdict, or an infected one, cannot be attached to a property invoice or a trades quote", async () => {
    const never = newPath(); const blocked = newPath();
    await one.saveUploadedFile(never, "application/pdf", BYTES, a);
    await one.saveUploadedFile(blocked, "application/pdf", BYTES, a);
    await verdict(blocked, "infected", "Synthetic.Test");
    const before = await counts();
    for (const path of [never, blocked]) {
      assert.deepEqual(await charge(`/uploads/${path}`), { kind: "invalid-document" });
      assert.deepEqual(await quote(`/uploads/${path}`), { kind: "invalid-document" });
    }
    assert.deepEqual(await counts(), before);
  });

  await check("a document scanned clean is attached to both", async () => {
    const path = newPath();
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, a, SCAN);
    const invoice = await charge(`/uploads/${path}`);
    assert.equal(invoice.kind, "ok"); assert.equal(invoice.invoice.documentUrl, `/uploads/${path}`);
    const quoted = await quote(`/uploads/${path}`);
    assert.equal(quoted.kind, "ok"); assert.equal(quoted.quote.documentUrl, `/uploads/${path}`);
  });

  await check("another business's clean document cannot be attached", async () => {
    const path = newPath();
    await one.saveScannedUploadedFile(path, "application/pdf", BYTES, b, SCAN);
    assert.deepEqual(await charge(`/uploads/${path}`), { kind: "invalid-document" });
    assert.deepEqual(await quote(`/uploads/${path}`), { kind: "invalid-document" });
  });
} finally {
  await Promise.all([pool.end(), writerPool.end()]);
}
console.log(`UPLOADED FILE SCANS POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
