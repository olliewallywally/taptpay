/**
 * R1-T7 S6b on actual PostgreSQL: the scan pass's selection and its one-verdict rule; the deletion
 * of uploads no invoice uses, its 12-month boundary and both orders of the attach race.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-upload-lifecycle-postgres.ts
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
const writerName = "taptpay-t7-s6b-writer";
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: writerName });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.error(`FAIL ${name}`); }
}
const BYTES = Buffer.from("%PDF-1.4\nsynthetic");
const CLEAN = { verdict: "clean", scanner: "verifier" } as const;
const FOUND = { verdict: "infected", scanner: "verifier", signature: "Synthetic.Test" } as const;

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
  const { DatabaseStorage } = await import("../server/storage"); const schema = await import("../shared/schema");
  const { unattachedUploadCutoff } = await import("../server/upload-lifecycle");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any) as any;
  const two = new DatabaseStorage(drizzle(writerPool, { schema }) as any) as any;
  await writerPool.query("SET statement_timeout='10s'");
  const addMerchant = async (label: string): Promise<number> => (await pool.query(
    "INSERT INTO merchants(name,business_name,email,status) VALUES ($1,$1,$2,'active') RETURNING id", [label, `${label}@tenant-storage.test`],
  )).rows[0].id;
  const a = await addMerchant("s6b-tenant-a"); const b = await addMerchant("s6b-tenant-b");
  let made = 0;
  const newPath = () => `invoices/invoice-17900000000${String(++made).padStart(2, "0")}-0123456789abcdef.pdf`;
  /** A stored file of a given age (in the database's own clock), with or without a clean verdict. */
  const stored = async (path: string, age: string, options: { clean?: boolean; merchant?: number | null } = {}) => {
    const id = (await pool.query(
      `INSERT INTO uploaded_files(path,mime_type,data,merchant_id,created_at) VALUES ($1,'application/pdf',$2,$3, now() - $4::interval) RETURNING id`,
      [path, BYTES, options.merchant === undefined ? a : options.merchant, age])).rows[0].id as number;
    if (options.clean) await pool.query("INSERT INTO uploaded_file_scans(file_id,verdict,scanner) VALUES ($1,'clean','verifier')", [id]);
    return path;
  };
  const exists = async (path: string) => (await pool.query("SELECT 1 FROM uploaded_files WHERE path=$1", [path])).rowCount === 1;
  const scanOf = async (path: string) => (await pool.query(
    "SELECT s.verdict, s.signature, s.scanner FROM uploaded_file_scans s JOIN uploaded_files f ON f.id=s.file_id WHERE f.path=$1", [path])).rows[0];
  const scans = async () => (await pool.query("SELECT count(*)::int AS n FROM uploaded_file_scans")).rows[0].n as number;
  const cutoff = () => unattachedUploadCutoff(new Date());
  async function waited(sql: string, args: unknown[], run: () => Promise<any>): Promise<any> {
    const locker = await pool.connect(); let open = false; let pending: Promise<any> | undefined;
    try {
      await locker.query("BEGIN"); open = true; await locker.query(sql, args);
      pending = run(); void pending.catch(() => undefined);
      let didWait = false;
      for (let i = 0; i < 200; i++) {
        const state = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [writerName]);
        if (state.rowCount) { didWait = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(didWait, "the write waited on the row");
      await locker.query("COMMIT"); open = false;
      return await pending;
    } finally {
      if (open) await locker.query("ROLLBACK");
      await pending?.catch(() => undefined);
      locker.release();
    }
  }

  // ── The scan pass's storage ──
  const unscanned = [await stored(newPath(), "3 days"), await stored(newPath(), "2 days", { merchant: b }), await stored(newPath(), "1 day", { merchant: null })];
  const scanned = await stored(newPath(), "5 days", { clean: true });
  await pool.query("INSERT INTO uploaded_files(path,mime_type,data,merchant_id) VALUES ('logos/merchant-1.png','image/png',$1,$2)", [BYTES, a]);

  await check("the list is exactly the documents with no verdict: not a scanned one, not a logo; bounded", async () => {
    const listed = await one.listUnscannedInvoiceDocuments(50);
    assert.deepEqual(listed.map((row: any) => row.path).sort(), [...unscanned].sort());
    const mine = listed.find((row: any) => row.path === unscanned[0]);
    assert.equal(mine.merchantId, a); assert.deepEqual(mine.data, BYTES); assert.match(mine.version, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/);
    assert.equal(listed.find((row: any) => row.path === unscanned[2]).merchantId, null);
    assert.equal((await one.listUnscannedInvoiceDocuments(2)).length, 2);
    for (const limit of [0, -1, 1.5, NaN, 51, undefined]) assert.deepEqual(await one.listUnscannedInvoiceDocuments(limit), []);
    // Bounded runs still reach every document: none is always last.
    const seen = new Set<string>();
    for (let run = 0; run < 40 && seen.size < 3; run++) seen.add((await one.listUnscannedInvoiceDocuments(1))[0].path);
    assert.equal(seen.size, 3);
    assert.equal(scanned.length > 0, true);
  });

  await check("a recorded verdict makes a clean document readable and keeps an infected one from every reader", async () => {
    const listed = await one.listUnscannedInvoiceDocuments(50);
    const [first, second] = [unscanned[0], unscanned[1]].map((path) => listed.find((row: any) => row.path === path));
    assert.equal(await one.recordUploadedFileScan(first.path, first.version, CLEAN), true);
    assert.equal(await one.recordUploadedFileScan(second.path, second.version, FOUND), true);
    assert.deepEqual(await scanOf(first.path), { verdict: "clean", signature: null, scanner: "verifier" });
    assert.deepEqual(await scanOf(second.path), { verdict: "infected", signature: "Synthetic.Test", scanner: "verifier" });
    assert.deepEqual((await one.getCleanUploadedFileForMerchant(first.path, a))?.data, BYTES);
    assert.equal(await one.getCleanUploadedFileForMerchant(second.path, b), undefined);
    assert.equal(await one.getCleanUploadedFile(second.path), undefined);
    assert.equal(await exists(second.path), true);
    assert.deepEqual((await one.listUnscannedInvoiceDocuments(50)).map((row: any) => row.path), [unscanned[2]]);
  });

  await check("a file takes one verdict: a repeat, a wrong version, a missing file and a bad verdict record nothing", async () => {
    const [row] = await one.listUnscannedInvoiceDocuments(50);
    const before = await scans();
    assert.equal(await one.recordUploadedFileScan(row.path, "1999-01-01 00:00:00", CLEAN), false);
    assert.equal(await one.recordUploadedFileScan("invoices/invoice-1-0000000000000000.pdf", row.version, CLEAN), false);
    await assert.rejects(one.recordUploadedFileScan(row.path, row.version, { verdict: "probably-fine", scanner: "x" }));
    await assert.rejects(one.recordUploadedFileScan(row.path, row.version, { verdict: "infected", scanner: "x" }));
    assert.equal(await scans(), before);
    assert.equal(await one.recordUploadedFileScan(row.path, row.version, FOUND), true);
    assert.equal(await one.recordUploadedFileScan(row.path, row.version, CLEAN), false);
    assert.equal((await scanOf(row.path)).verdict, "infected");
  });

  await check("two passes recording one file at once leave one verdict", async () => {
    for (let round = 0; round < 6; round++) {
      const path = await stored(newPath(), "1 day");
      const row = (await one.listUnscannedInvoiceDocuments(50)).find((listed: any) => listed.path === path);
      const results = await Promise.all([one.recordUploadedFileScan(path, row.version, CLEAN), two.recordUploadedFileScan(path, row.version, FOUND)]);
      assert.deepEqual([...results].sort(), [false, true]);
      assert.equal((await scanOf(path)).verdict, results[0] ? "clean" : "infected");
    }
  });

  await check("a verdict for bytes replaced while it waited is not recorded", async () => {
    const path = await stored(newPath(), "1 day");
    const row = (await one.listUnscannedInvoiceDocuments(50)).find((listed: any) => listed.path === path);
    const recorded = await waited("UPDATE uploaded_files SET data=$1, created_at=now() WHERE path=$2", [Buffer.from("%PDF-1.4\nreplaced"), path],
      () => two.recordUploadedFileScan(path, row.version, CLEAN));
    assert.equal(recorded, false);
    assert.equal(await scanOf(path), undefined);
  });

  // ── The 12-month deletion ──
  const tenant = await one.createTenantProfileForMerchant(a, { firstName: "Synthetic", lastName: "Profile", email: "owned@example.test", propertyAddress: "Test address" });
  const clientProfile = await one.createClientProfileForMerchant(a, { firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test" });
  const charge = (path: string, store = one) => store.createOrReuseInvoiceRentRequestForMerchant(tenant.id, a,
    { amountCents: 52_000, deliveryChannel: "email", dueAt: new Date("2026-10-10T00:00:00Z"), kind: "charge", chargeType: "utilities", documentUrl: `/uploads/${path}`, documentName: "synthetic.pdf" });
  const quote = (path: string) => one.createQuoteForMerchant(a, { clientProfileId: clientProfile.id }, {
    lineItems: [{ description: "Synthetic", qty: 1, unitPriceCents: 100_000, lineTotalCents: 100_000 }], subtotalCents: 100_000, gstCents: 0, gstMode: null,
    totalCents: 100_000, depositEnabled: false, depositType: null, depositValue: null, depositCents: 0, deliveryChannel: "email", validUntil: null, notes: null,
    documentUrl: `/uploads/${path}`, documentName: "synthetic.pdf" });
  const jobInvoice = (path: string) => one.createJobInvoiceForMerchant(a, { clientProfileId: clientProfile.id },
    { kind: "full", amountCents: 52_000, deliveryChannel: "email", dueAt: new Date("2026-10-10T00:00:00Z"), documentUrl: `/uploads/${path}`, documentName: "synthetic.pdf" });
  // Everything from the scan checks is recent; clear the table of old unattached leftovers first.
  assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 0);

  await check("an upload no invoice uses goes after 12 months, with its verdict; a day short stays", async () => {
    const past = await stored(newPath(), "12 months 1 day", { clean: true });
    const blocked = await stored(newPath(), "13 months");
    await pool.query("INSERT INTO uploaded_file_scans(file_id,verdict,signature,scanner) SELECT id,'infected','Synthetic.Test','verifier' FROM uploaded_files WHERE path=$1", [blocked]);
    const never = await stored(newPath(), "2 years", { merchant: null });
    const short = await stored(newPath(), "12 months -1 day", { clean: true });
    const before = await scans();
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 3);
    assert.deepEqual([await exists(past), await exists(blocked), await exists(never), await exists(short)], [false, false, false, true]);
    assert.equal(await scans(), before - 2);
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 0);
  });

  await check("a document a property invoice, a trades quote or a trades invoice names is kept, however old", async () => {
    const paths = [await stored(newPath(), "1 day", { clean: true }), await stored(newPath(), "1 day", { clean: true }), await stored(newPath(), "1 day", { clean: true })];
    assert.equal((await charge(paths[0])).kind, "ok");
    assert.equal((await quote(paths[1])).kind, "ok");
    assert.equal((await jobInvoice(paths[2])).kind, "ok");
    await pool.query("UPDATE uploaded_files SET created_at = now() - interval '8 years' WHERE path = ANY($1)", [paths]);
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 0);
    for (const path of paths) assert.equal(await exists(path), true);
    for (const path of paths) assert.deepEqual((await one.getCleanUploadedFileForMerchant(path, a))?.data, BYTES);
  });

  await check("a document an invoice names by a longer form of its address is kept too", async () => {
    // Deletion cannot be undone, so any stored address that contains the file's path counts.
    const forms = [(path: string) => `https://old.example.test/uploads/${path}`, (path: string) => `/uploads/${path}?v=2`, (path: string) => path];
    const kept: string[] = [];
    for (const form of forms) {
      const path = await stored(newPath(), "1 day", { clean: true });
      const invoice = await charge(path);
      assert.equal(invoice.kind, "ok");
      await pool.query("UPDATE invoices_rent_requests SET document_url=$1 WHERE id=$2", [form(path), invoice.invoice.id]);
      kept.push(path);
    }
    // A name that merely resembles another's is not it: this one is named by nobody.
    const lookalike = await stored(newPath(), "3 years");
    await pool.query("UPDATE uploaded_files SET created_at = now() - interval '3 years' WHERE path = ANY($1)", [kept]);
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 1);
    for (const path of kept) assert.equal(await exists(path), true);
    assert.equal(await exists(lookalike), false);
  });

  await check("a logo and any file outside the documents folder is never deleted", async () => {
    await pool.query("UPDATE uploaded_files SET created_at = now() - interval '9 years' WHERE path='logos/merchant-1.png'");
    await pool.query("INSERT INTO uploaded_files(path,mime_type,data,merchant_id,created_at) VALUES ('misc/invoices/old.pdf','application/pdf',$1,$2, now() - interval '9 years')", [BYTES, a]);
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 0);
    assert.equal(await exists("logos/merchant-1.png"), true); assert.equal(await exists("misc/invoices/old.pdf"), true);
  });

  await check("one pass is bounded, attached documents ahead of it do not hold it back, and later passes finish", async () => {
    // Old attached documents come first in the table: the pass must still reach the unattached ones behind them.
    const attached = [await stored(newPath(), "1 day", { clean: true }), await stored(newPath(), "1 day", { clean: true })];
    for (const path of attached) assert.equal((await charge(path)).kind, "ok");
    await pool.query("UPDATE uploaded_files SET created_at = now() - interval '5 years' WHERE path = ANY($1)", [attached]);
    const old = [await stored(newPath(), "2 years"), await stored(newPath(), "2 years"), await stored(newPath(), "2 years")];
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 2), 2);
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 2), 1);
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 2), 0);
    for (const path of old) assert.equal(await exists(path), false);
    for (const path of attached) assert.equal(await exists(path), true);
    for (const limit of [0, -1, 1.5, NaN, 51, undefined]) assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), limit), 0);
  });

  await check("a document being attached while the pass runs is skipped and kept", async () => {
    const path = await stored(newPath(), "2 years", { clean: true });
    const attaching = await pool.connect();
    try {
      // The attach's own hold: a share lock on the file's row inside the create's transaction.
      await attaching.query("BEGIN");
      await attaching.query("SELECT id FROM uploaded_files WHERE path=$1 FOR SHARE", [path]);
      assert.equal(await two.deleteUnattachedInvoiceDocuments(cutoff(), 50), 0);
      await attaching.query("COMMIT");
    } finally { await attaching.query("ROLLBACK").catch(() => undefined); attaching.release(); }
    assert.equal(await exists(path), true);
    assert.equal((await charge(path)).kind, "ok");
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 0);
    assert.equal(await exists(path), true);
  });

  await check("an attach that waited for the deletion finds no document and makes no invoice", async () => {
    const path = await stored(newPath(), "2 years", { clean: true });
    const before = (await pool.query("SELECT count(*)::int AS n FROM invoices_rent_requests")).rows[0].n;
    // The deletion's own lock, held: the attach's share lock waits on it.
    const result = await waited("DELETE FROM uploaded_files WHERE path=$1", [path], () => charge(path, two));
    assert.deepEqual(result, { kind: "invalid-document" });
    assert.equal(await exists(path), false);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM invoices_rent_requests")).rows[0].n, before);
  });

  await check("it is the invoice's naming of it that keeps a document: once nothing names it, the next pass removes it", async () => {
    const path = await stored(newPath(), "1 day", { clean: true });
    const invoice = await charge(path);
    assert.equal(invoice.kind, "ok");
    await pool.query("UPDATE uploaded_files SET created_at = now() - interval '3 years' WHERE path=$1", [path]);
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 0);
    assert.equal(await exists(path), true);
    await pool.query("UPDATE invoices_rent_requests SET document_url=NULL, document_name=NULL WHERE id=$1", [invoice.invoice.id]);
    assert.equal(await one.deleteUnattachedInvoiceDocuments(cutoff(), 50), 1);
    assert.equal(await exists(path), false);
  });
} finally {
  await Promise.all([pool.end(), writerPool.end()]);
}
console.log(`UPLOAD LIFECYCLE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
