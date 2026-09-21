/** Run only against an EMPTY, explicitly marked disposable database.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 npx tsx scripts/verify-gap13-postgres.ts
 * Applies the real migration chain through the project runner — 0025 only after
 * proving it is refused without a verified ownership inventory and with an
 * incomplete, false, forged or stale one, and after running the real drafting
 * command — then exercises actual DatabaseStorage. Synthetic rows
 * are retained for inspection; nothing is dropped. Refuses a populated database
 * and the ambient application target.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { assertSafePostgresVerifierEnvironment } from "./postgres-verifier-safety.mjs";

const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  configuredDatabaseUrl: process.env.DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE,
});
// Check BOTH ambient targets before loading config or application modules.
assertSafePostgresVerifierEnvironment({ testDatabaseUrl,
  configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE });
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 12 });
const failures: string[] = [];
async function check(name: string, test: () => Promise<void>) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
}
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const doc = "invoices/invoice-1700000000000-aaaaaaaaaaaaaaaa.pdf";
const bytes = Buffer.from("%PDF-1.4 synthetic owner A");
// Uploaded (by old code, so with no tenant) after an inventory was approved.
const late = "invoices/invoice-1700000000001-cccccccccccccccc.pdf";
const REPAIR = "0025_verified_upload_ownership.sql";
// Recent documents for the automatic rule (the upload time is in the generated name).
const uploadMs = Date.now() - 3_600_000;
const recent = (digit: string, ms = uploadMs) => `invoices/invoice-${ms}-${digit.repeat(16)}.pdf`;
const s1 = recent("1");                            // merchant A attaches it 2 minutes later → A's
const s2 = recent("2");                            // A and B both attach it → locked
const s3 = recent("3");                            // never attached → locked
const s4 = recent("4", uploadMs - 3 * 86_400_000); // B attaches it 3 days after upload → locked
const testUrl = new URL(testDatabaseUrl);
const pgTarget = { host: testUrl.hostname, port: Number(testUrl.port || 5432),
  database: decodeURIComponent(testUrl.pathname.slice(1)) };
try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires an empty disposable database; no cleanup is automatic");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const inventories = await import("../server/upload-ownership-inventory");
  const client = await pool.connect();
  let a = 0, b = 0;
  try {
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === REPAIR) break; // Below: refused without, then applied with, a verified inventory.
      if (file === "0023_uploaded_files_tenant_column.sql") {
        const merchants = await client.query(`INSERT INTO merchants(name,business_name,email,status)
          VALUES ('A','A','a@gap13.test','active'),('B','B','b@gap13.test','active') RETURNING id`);
        [a,b] = merchants.rows.map((r: any) => r.id);
        const clientRow = await client.query(`INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address)
          VALUES ($1,'Synthetic','B','Test') RETURNING id`, [b]);
        await client.query(`INSERT INTO uploaded_files(path,mime_type,data) VALUES
          ($1,'application/pdf',$2),($3,'image/png',$2)`, [doc, bytes, `logos/merchant-${a}.png`]);
        await client.query(`INSERT INTO quotes(merchant_id,client_profile_id,token,line_items,subtotal_cents,total_cents,document_url)
          VALUES ($1,$2,'legacy-foreign-reference','[]',100,100,$3)`, [b, clientRow.rows[0].id, `/uploads/${doc}`]);
      }
      const result = await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
      console.log(`MIGRATION ${file} ${result.durationMs}ms`);
    }

    // Four recent documents for the automatic rule, uploaded by pre-gap-13 code
    // (so with no tenant) and attached at chosen times; the upload time is in the name.
    const clientA = (await client.query(`INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address)
      VALUES ($1,'Synthetic','A','Test') RETURNING id`, [a])).rows[0].id;
    const clientB = (await client.query("SELECT id FROM client_profiles WHERE merchant_id=$1", [b])).rows[0].id;
    for (const file of [s1, s2, s3, s4]) {
      await client.query("INSERT INTO uploaded_files(path,mime_type,data) VALUES ($1,'application/pdf',$2)",
        [file, Buffer.from(`%PDF-1.4 ${file}`)]);
    }
    const attach = (merchant: number, profile: string, file: string, at: number, token: string) => client.query(
      `INSERT INTO quotes(merchant_id,client_profile_id,token,line_items,subtotal_cents,total_cents,document_url,created_at)
       VALUES ($1,$2,$3,'[]',100,100,$4,($5::timestamptz AT TIME ZONE 'UTC'))`,
      [merchant, profile, token, `/uploads/${file}`, new Date(at).toISOString()]);
    await attach(a, clientA, s1, uploadMs + 120_000, "recent-s1-a");
    await attach(a, clientA, s2, uploadMs + 60_000, "recent-s2-a");
    await attach(b, clientB, s2, uploadMs + 90_000, "recent-s2-b");
    await attach(b, clientB, s4, uploadMs, "recent-s4-b"); // s4 was uploaded three days before this

    // The operator's list: drafted from the database's own records exactly as
    // server/draft-upload-inventory.ts does, then amended with (invented) attestations.
    const draft = async (attest: ReadonlyMap<string, number> = new Map(), edit = (entries: any[]) => entries) => {
      const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
      const { inventory } = inventories.buildDraftInventory(facts,
        { target: pgTarget, approvedBy: "synthetic verifier", approvedAt: "2026-09-21T00:00:00Z" });
      const idOf = new Map((await client.query("SELECT id, path FROM uploaded_files WHERE path LIKE 'invoices/%'")).rows
        .map((r: any) => [r.path, r.id]));
      const attested = new Map([...attest].map(([file, merchant]) => [idOf.get(file), merchant]));
      const entries = edit(inventory.entries.map((e: any) => attested.has(e.fileId)
        ? { fileId: e.fileId, pathSha256: e.pathSha256, contentSha256: e.contentSha256, disposition: "owner",
            merchantId: attested.get(e.fileId), evidence: { kind: "merchant-attestation",
              reference: `synthetic-attestation-${e.fileId}`, sha256: sha(`evidence ${e.fileId}`) } }
        : e));
      const source = JSON.stringify({ ...inventory, entries });
      return inventories.parseUploadOwnershipInventory(source, sha(source), pgTarget);
    };
    const idOfPath = async (file: string) =>
      (await client.query("SELECT id FROM uploaded_files WHERE path=$1", [file])).rows[0].id;
    const repairSource = await readFile(`migrations/${REPAIR}`, "utf8");
    const quiet = { log: () => undefined };
    const ledgerHas = async (file: string) =>
      (await client.query("SELECT count(*)::int AS n FROM drizzle.applied_migrations WHERE filename=$1", [file])).rows[0].n === 1;
    const ownerOf = async (file: string) =>
      (await client.query("SELECT merchant_id FROM uploaded_files WHERE path=$1", [file])).rows[0]?.merchant_id ?? null;

    await check("0025 aborts without a staged inventory, even when applied directly", async () => {
      await assert.rejects(runner.applyMigration(client, REPAIR, repairSource), runner.MigrationExecutionError);
      assert.equal(await ledgerHas(REPAIR), false);
      assert.equal((await client.query("SELECT to_regclass('public.uploaded_file_ownership_evidence') AS t")).rows[0].t, null);
    });
    await check("the automatic rule sorts documents from TaptPay's own records", async () => {
      const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: false });
      const byId = new Map(facts.map((f) => [f.fileId, inventories.classifyInvoiceDocument(f)]));
      const sorted = async (file: string) => byId.get(await idOfPath(file));
      assert.deepEqual(await sorted(s1), { disposition: "owner", merchantId: a,
        uploadedAt: new Date(uploadMs), firstAttachedAt: new Date(uploadMs + 120_000) });
      assert.deepEqual(await sorted(s2), { disposition: "locked", reason: "several-merchants" });
      assert.deepEqual(await sorted(s3), { disposition: "locked", reason: "never-attached" });
      assert.deepEqual(await sorted(s4), { disposition: "locked", reason: "attached-outside-window" });
      assert.deepEqual(await sorted(doc), { disposition: "locked", reason: "attached-outside-window" });
    });
    await check("the runner refuses 0025 with no, an incomplete, a false, a forged or a stale inventory", async () => {
      assert.equal(await ownerOf(doc), b, "0023 inferred merchant B from B's quote — the defect being repaired");
      await assert.rejects(runner.runPendingMigrations(client, quiet), /UPLOAD_INVENTORY_REQUIRED/);
      const truthful = new Map([[doc, a]]);
      await assert.rejects(runner.runPendingMigrations(client, { ...quiet,
        uploadOwnershipInventory: await draft(truthful, (e) => e.slice(1)) }), /UPLOAD_INVENTORY_COVERAGE_MISMATCH/);
      await assert.rejects(runner.runPendingMigrations(client, { ...quiet, uploadOwnershipInventory:
        await draft(truthful, (e) => e.map((x) => ({ ...x, contentSha256: sha("other bytes") }))) }),
      /UPLOAD_INVENTORY_COVERAGE_MISMATCH/);
      await assert.rejects(runner.runPendingMigrations(client, { ...quiet,
        uploadOwnershipInventory: await draft(new Map([[doc, 2_000_000_000]])) }), /UPLOAD_INVENTORY_COVERAGE_MISMATCH/);
      // A list may not claim TaptPay's records for a document the records do not support.
      const s4Id = await idOfPath(s4);
      await assert.rejects(runner.runPendingMigrations(client, { ...quiet, uploadOwnershipInventory: await draft(truthful,
        (e) => e.map((x) => x.fileId !== s4Id ? x : { fileId: x.fileId, pathSha256: x.pathSha256,
          contentSha256: x.contentSha256, disposition: "owner", merchantId: b,
          evidence: { kind: "system-record", reference: "forged claim", sha256: sha("forged") } })) }),
      /UPLOAD_INVENTORY_EVIDENCE_MISMATCH/);
      const approved = await draft(truthful);
      await client.query("INSERT INTO uploaded_files(path,mime_type,data) VALUES ($1,'application/pdf',$2)",
        [late, Buffer.from("%PDF-1.4 synthetic owner B, uploaded after approval")]);
      await assert.rejects(runner.runPendingMigrations(client, { ...quiet, uploadOwnershipInventory: approved }),
        /UPLOAD_INVENTORY_COVERAGE_MISMATCH/);
      // The same stale approval is refused again under the lock inside 0025's own transaction.
      await assert.rejects(runner.applyMigration(client, REPAIR, repairSource, {},
        (tx) => inventories.stageUploadOwnershipInventory(tx, approved)), /UPLOAD_INVENTORY_COVERAGE_MISMATCH/);
      assert.equal(await ledgerHas(REPAIR), false);
      assert.equal(await ownerOf(doc), b, "nothing changed while refused");
    });
    await check("the drafting command counts and drafts from the database, read-only", async () => {
      const cli = ["tsx", "server/draft-upload-inventory.ts", "--target=local", `--expected-host=${pgTarget.host}`,
        `--expected-port=${pgTarget.port}`, `--expected-database=${pgTarget.database}`];
      const env = { ...process.env, GAP13_INVENTORY_DATABASE_URL: testDatabaseUrl };
      const counted = execFileSync("npx", [...cli, "--count-only"], { env, encoding: "utf8" });
      assert.match(counted, / total=6 owner=1 locked=5 /);
      assert.match(counted, /locked\.never-attached=2/);
      const out = `${os.tmpdir()}/gap13-draft-${process.pid}-${Date.now()}.json`;
      const drafted = execFileSync("npx", [...cli, `--out=${out}`, "--approved-by=synthetic verifier"], { env, encoding: "utf8" });
      const digest = /GAP13_INVENTORY_SHA256 ([0-9a-f]{64})/.exec(drafted)?.[1];
      assert.ok(digest, "the draft reports its SHA-256");
      assert.equal(inventories.readUploadOwnershipInventory(out, digest!, pgTarget).entries.length, 6);
      assert.equal(statSync(out).mode & 0o777, 0o600);
      assert.ok(!readFileSync(out, "utf8").includes("invoices/"), "no path is written");
      assert.throws(() => execFileSync("npx", [...cli, `--out=${out}`, "--approved-by=synthetic verifier"], { env, stdio: "pipe" }),
        "an existing (possibly approved) draft is never overwritten");
      assert.equal(await ledgerHas(REPAIR), false, "drafting changed nothing");
    });
    await check("a verified inventory gives owners only where records or evidence prove it, and locks the rest", async () => {
      const verified = await draft(new Map([[doc, a], [late, b]]));
      assert.deepEqual((await runner.runPendingMigrations(client, { ...quiet, uploadOwnershipInventory: verified })).appliedNow, [REPAIR]);
      assert.deepEqual(await Promise.all([doc, late, s1, s2, s3, s4, `logos/merchant-${a}.png`].map(ownerOf)),
        [a, b, a, null, null, null, a]);
      const rows = new Map((await client.query("SELECT * FROM uploaded_file_ownership_evidence")).rows.map((r: any) => [r.file_id, r]));
      const row = async (file: string) => rows.get(await idOfPath(file));
      assert.deepEqual([(await row(doc)).disposition, (await row(doc)).evidence_kind], ["owner", "merchant-attestation"]);
      assert.deepEqual([(await row(s1)).merchant_id, (await row(s1)).evidence_kind], [a, "system-record"]);
      assert.deepEqual([(await row(s2)).disposition, (await row(s2)).merchant_id, (await row(s2)).locked_reason],
        ["locked", null, "several-merchants"]);
      assert.equal((await row(s3)).locked_reason, "never-attached");
      assert.equal((await row(s4)).locked_reason, "attached-outside-window");
      assert.equal(rows.size, 6);
      assert.ok([...rows.values()].every((r: any) => r.inventory_sha256 === verified.sha256 && !JSON.stringify(r).includes("invoices/")),
        "every row carries the approved list's SHA-256 and no path");
    });
    const repeated = await runner.runPendingMigrations(client, quiet);
    assert.equal(repeated.appliedNow.length, 0, "runner rerun must be a no-op, and needs no inventory");
  } finally { client.release(); }
  const { DatabaseStorage, UploadPathOwnershipError } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const db = drizzle(pool, { schema });
  const storage = new DatabaseStorage(db as any);
  const otherInstance = new DatabaseStorage(db as any);

  await check("untrusted legacy references confer no tenant authority; bytes retained", async () => {
    assert.equal(await storage.getUploadedFileForMerchant(doc, b), undefined);
    assert.equal(await storage.uploadedFileOwnedByMerchant(doc, b), false);
    assert.deepEqual((await storage.getUploadedFile(doc))?.data, bytes);
  });
  await check("the evidenced owner of a legacy document keeps access to it", async () => {
    assert.deepEqual((await storage.getUploadedFileForMerchant(doc, a))?.data, bytes);
    assert.equal(await storage.uploadedFileOwnedByMerchant(doc, a), true);
  });
  await check("a locked document reaches no merchant, and stays readable by the admin", async () => {
    for (const merchant of [a, b]) assert.equal(await storage.getUploadedFileForMerchant(s2, merchant), undefined);
    assert.equal(await storage.uploadedFileOwnedByMerchant(s3, a), false);
    assert.deepEqual((await storage.getUploadedFile(s2))?.data, Buffer.from(`%PDF-1.4 ${s2}`)); // the admin route's read
    assert.deepEqual((await storage.getUploadedFileForMerchant(s1, a))?.data, Buffer.from(`%PDF-1.4 ${s1}`));
  });
  await check("logo remains public and can be overwritten by its owner", async () => {
    await storage.saveUploadedFile(`logos/merchant-${a}.png`, "image/png", bytes, a);
    assert.deepEqual((await storage.getUploadedFile(`logos/merchant-${a}.png`))?.data, bytes);
  });
  await check("production upsert: one winner, no foreign overwrite/delete or NULL adoption", async () => {
    const path = "invoices/invoice-1700000000000-bbbbbbbbbbbbbbbb.pdf";
    const raced = await Promise.allSettled([storage.saveUploadedFile(path,"application/pdf",bytes,a),
      otherInstance.saveUploadedFile(path,"application/pdf",bytes,b)]);
    assert.equal(raced.filter(r => r.status === "fulfilled").length,1);
    const owner = await storage.uploadedFileOwnedByMerchant(path,a) ? a : b;
    const foreign = owner === a ? b : a;
    await assert.rejects(storage.saveUploadedFile(path,"application/pdf",bytes,foreign), UploadPathOwnershipError);
    await storage.deleteUploadedFile(path,foreign);
    assert.ok(await storage.getUploadedFileForMerchant(path,owner));
    assert.equal(await storage.getUploadedFileForMerchant(path,foreign),undefined);
    await storage.saveUploadedFile(path,"application/pdf",Buffer.from("new"),owner);
    assert.equal((await storage.getUploadedFileForMerchant(path,owner))?.data.toString(),"new");
    await assert.rejects(storage.saveUploadedFile(doc,"application/pdf",bytes,b), UploadPathOwnershipError);
    await storage.deleteUploadedFile(path,owner);
    assert.equal(await storage.getUploadedFile(path),undefined);
  });
  await check("a refused merchant deletion preserves transactions", async () => {
    const transaction = await pool.query(`INSERT INTO transactions(merchant_id,item_name,price,status)
      VALUES ($1,'Synthetic','1.00','pending') RETURNING id`, [a]);
    assert.equal(await storage.deleteMerchant(a),false);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM transactions WHERE id=$1",[transaction.rows[0].id])).rows[0].n,1);
  });
  await check("admin audit survives a new connection and has no contents or token", async () => {
    await storage.recordInvoiceDocumentAdminRead(17,doc.slice("invoices/".length));
    const reader = new pg.Client({ connectionString: testDatabaseUrl });
    await reader.connect();
    try {
      const rows = (await reader.query("SELECT admin_user_id,document_name,created_at FROM invoice_document_access_audit")).rows;
      assert.equal(rows.length,1);
      assert.equal(rows[0].admin_user_id,17);
      assert.equal(rows[0].document_name,doc.slice("invoices/".length));
      assert.ok(rows[0].created_at);
    } finally { await reader.end(); }
  });
  await check("two instances enforce one 10-read token budget atomically", async () => {
    const results = await Promise.all(Array.from({length:30},(_,i) =>
      (i%2 ? storage : otherInstance).consumeInvoiceDocumentReadLimit("shared-synthetic-token")));
    assert.equal(results.filter(Boolean).length,10);
    const keys = (await pool.query("SELECT key FROM invoice_document_read_limits")).rows;
    assert.ok(keys.every((r:any) => !r.key.includes("shared-synthetic-token")));
  });
  // Owner decision 2026-09-21: no platform-wide pool. Distinct links never share
  // a budget (the route counts only real invoices, so rows stay bounded by them).
  await check("distinct links never share a budget (no platform-wide cap); expired counters are reclaimed", async () => {
    await pool.query("DELETE FROM invoice_document_read_limits");
    let allowed=0;
    for(let i=0;i<700;i++) if(await (i%2 ? storage:otherInstance).consumeInvoiceDocumentReadLimit(`token-${i}`)) allowed++;
    assert.equal(allowed,700);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM invoice_document_read_limits")).rows[0].n,700);
    await pool.query("UPDATE invoice_document_read_limits SET expires_at=now()-interval '1 second'");
    assert.equal(await otherInstance.consumeInvoiceDocumentReadLimit("after-window"),true);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM invoice_document_read_limits")).rows[0].n,1);
  });
  assert.deepEqual(failures,[],"gap 13 PostgreSQL verification failed");
} finally {
  await pool.end();
}
