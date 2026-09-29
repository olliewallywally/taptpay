/** Split-invoice share sessions (0030) against real PostgreSQL: owner decision 2026-09-26
 * (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 1) — each share of a split
 * rent or trades invoice is paid only by a session recorded for that invoice when it was opened.
 * Run only against an EMPTY, explicitly marked disposable database:
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-invoice-split-sessions-postgres.ts
 * The URL must carry a user and a password: the migration runner validates its target.
 * Applies the real migration chain through the project runner (0025 with the inventory drafted
 * from this empty database, which has nothing to own), then exercises actual DatabaseStorage
 * from two instances on separate pools, as two servers would. Synthetic rows are retained.
 * The share claim itself (atomicClaimSplitShare, older code) reads the app's global connection,
 * which a verifier cannot inject; the harness tests (invoice-split-sessions.test.ts) cover it.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
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
const pools = [new pg.Pool({ connectionString: testDatabaseUrl, max: 10 }),
  new pg.Pool({ connectionString: testDatabaseUrl, max: 10 })];
const [pool] = pools;
const failures: string[] = [];
async function check(name: string, test: () => Promise<void>) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const REPAIR = "0025_verified_upload_ownership.sql";
const testUrl = new URL(testDatabaseUrl);
const pgTarget = { host: testUrl.hostname, port: Number(testUrl.port || 5432),
  database: decodeURIComponent(testUrl.pathname.slice(1)) };
const session = () => `verifier-${randomBytes(8).toString("hex")}`;
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
  try {
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === REPAIR) break; // The rest go through the runner with a verified inventory.
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts,
      { target: pgTarget, approvedBy: "synthetic verifier", approvedAt: "2026-09-26T00:00:00Z" });
    assert.equal(inventory.entries.length, 0, "an empty database has no invoice documents to own");
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, sha(source), pgTarget);
    const { appliedNow } = await runner.runPendingMigrations(client,
      { log: () => undefined, uploadOwnershipInventory: verified });
    assert.ok(appliedNow.includes("0030_invoice_split_sessions.sql"), "0030 applied through the runner");
    console.log(`MIGRATIONS applied through the runner: ${appliedNow.join(", ")}`);
  } finally { client.release(); }

  const { DatabaseStorage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const [one, two] = pools.map((p) => new DatabaseStorage(drizzle(p, { schema }) as any));
  const merchant = (await pool.query(`INSERT INTO merchants(name,business_name,email,status)
    VALUES ('Split','Split Ltd','split@c10.test','active') RETURNING id`)).rows[0].id;
  const tenant = (await pool.query(`INSERT INTO tenant_profiles(merchant_id,first_name,last_name,property_address)
    VALUES ($1,'Tess','Tenant','1 Test Road') RETURNING id`, [merchant])).rows[0].id;
  const clientProfile = (await pool.query(`INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address)
    VALUES ($1,'Sam','Smith','2 Site Road') RETURNING id`, [merchant])).rows[0].id;
  const rentInvoice = async () => (await pool.query(`INSERT INTO invoices_rent_requests
    (merchant_id,tenant_profile_id,amount_cents,token,delivery_channel,due_at,status,split_enabled,split_count)
    VALUES ($1,$2,100000,$3,'email',now(),'sent',true,2) RETURNING id`, [merchant, tenant, randomBytes(20).toString("base64url")])).rows[0].id as string;
  const jobInvoice = async () => (await pool.query(`INSERT INTO job_invoices
    (merchant_id,client_profile_id,amount_cents,token,delivery_channel,due_at,status,split_enabled,split_count)
    VALUES ($1,$2,90000,$3,'email',now(),'sent',true,2) RETURNING id`, [merchant, clientProfile, randomBytes(20).toString("base64url")])).rows[0].id as string;
  const rowOf = async (id: string) =>
    (await pool.query("SELECT * FROM invoice_split_sessions WHERE windcave_session_id=$1", [id])).rows;

  await check("0030 refuses a session for no invoice, for two invoices, for an unknown invoice, or for nothing", async () => {
    const rent = await rentInvoice();
    const job = await jobInvoice();
    const insert = (rentId: string | null, jobId: string | null, cents: number) => pool.query(
      `INSERT INTO invoice_split_sessions(windcave_session_id,rent_invoice_id,job_invoice_id,amount_cents)
       VALUES ($1,$2,$3,$4)`, [session(), rentId, jobId, cents]);
    await assert.rejects(insert(null, null, 100), /invoice_split_sessions_one_invoice_chk/);
    await assert.rejects(insert(rent, job, 100), /invoice_split_sessions_one_invoice_chk/);
    await assert.rejects(insert(rent, null, 0), /invoice_split_sessions_amount_chk/);
    await assert.rejects(insert("00000000-0000-4000-8000-000000000000", null, 100), /foreign key/);
    await insert(rent, null, 100);
    await insert(null, job, 100);
  });

  await check("a session is recorded once, with its invoice, amount and payer's email, from either instance", async () => {
    const rent = await rentInvoice();
    const id = session();
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? two : one).recordInvoiceSplitSession({
      vertical: "property", invoiceId: rent, sessionId: id, amountCents: 50_000, payerEmail: i === 0 ? "first@c10.test" : `later${i}@c10.test`,
    })));
    const rows = await rowOf(id);
    assert.equal(rows.length, 1, "one row for the session, whatever the race");
    const stored = await two.getInvoiceSplitSession(id);
    assert.equal(stored?.rentInvoiceId, rent);
    assert.equal(stored?.jobInvoiceId, null);
    assert.equal(stored?.amountCents, 50_000);
    assert.match(stored?.payerEmail ?? "", /@c10\.test$/);
    assert.equal(stored?.paidAt, null);
    assert.equal(await one.getInvoiceSplitSession(session()), undefined, "an unknown session is not found");
  });

  await check("a trades session is recorded against its job invoice", async () => {
    const job = await jobInvoice();
    const id = session();
    await one.recordInvoiceSplitSession({ vertical: "trades", invoiceId: job, sessionId: id, amountCents: 45_000, payerEmail: null });
    const stored = await two.getInvoiceSplitSession(id);
    assert.equal(stored?.jobInvoiceId, job);
    assert.equal(stored?.rentInvoiceId, null);
    assert.equal(await one.invoiceHasSplitSessions({ vertical: "trades", invoiceId: job }), true);
    assert.equal(await one.invoiceHasSplitSessions({ vertical: "property", invoiceId: job }), false,
      "a job invoice's id is not read as a rent invoice's");
  });

  await check("an invoice has sessions only once one is recorded for it", async () => {
    const [rent, other] = [await rentInvoice(), await rentInvoice()];
    assert.equal(await one.invoiceHasSplitSessions({ vertical: "property", invoiceId: rent }), false);
    await two.recordInvoiceSplitSession({ vertical: "property", invoiceId: rent, sessionId: session(), amountCents: 50_000, payerEmail: null });
    assert.equal(await one.invoiceHasSplitSessions({ vertical: "property", invoiceId: rent }), true);
    assert.equal(await one.invoiceHasSplitSessions({ vertical: "property", invoiceId: other }), false);
  });

  await check("a session is marked paid once, even by simultaneous calls, and never moved", async () => {
    const rent = await rentInvoice();
    const id = session();
    await one.recordInvoiceSplitSession({ vertical: "property", invoiceId: rent, sessionId: id, amountCents: 50_000, payerEmail: "payer@c10.test" });
    const first = new Date("2026-09-26T10:00:00Z");
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? two : one).markInvoiceSplitSessionPaid(id, first)));
    await one.markInvoiceSplitSessionPaid(id, new Date("2026-09-26T11:00:00Z"));
    assert.equal((await two.getInvoiceSplitSession(id))?.paidAt?.toISOString(), first.toISOString());
  });

  await check("the payers' emails are those of paid sessions only, of that invoice only", async () => {
    const [rent, other] = [await rentInvoice(), await rentInvoice()];
    const open = async (invoiceId: string, payerEmail: string | null) => {
      const id = session();
      await one.recordInvoiceSplitSession({ vertical: "property", invoiceId, sessionId: id, amountCents: 50_000, payerEmail });
      return id;
    };
    const paid = await open(rent, "paid@c10.test");
    await open(rent, "abandoned@c10.test");
    const paidWithoutEmail = await open(rent, null);
    const elsewhere = await open(other, "elsewhere@c10.test");
    for (const id of [paid, paidWithoutEmail, elsewhere]) await two.markInvoiceSplitSessionPaid(id, new Date());
    assert.deepEqual(await one.getPaidInvoiceSplitPayerEmails({ vertical: "property", invoiceId: rent }), ["paid@c10.test"]);
  });

  await check("deleting an invoice removes its sessions", async () => {
    const job = await jobInvoice();
    const id = session();
    await one.recordInvoiceSplitSession({ vertical: "trades", invoiceId: job, sessionId: id, amountCents: 45_000, payerEmail: null });
    await pool.query("DELETE FROM job_invoices WHERE id=$1", [job]);
    assert.deepEqual(await rowOf(id), []);
  });

  assert.deepEqual(failures, [], "split-invoice session PostgreSQL verification failed");
  console.log("Split-invoice session PostgreSQL verification passed");
} finally {
  await Promise.all(pools.map((p) => p.end()));
}
