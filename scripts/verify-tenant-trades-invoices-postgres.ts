/** R1-T7 S4b1: scoped trades quote/invoice reads, manual invoice state changes and receipt history. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s4_verify_[a-z0-9_]+$/);
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 12 });
const writerName = "taptpay-t7-s4b1-writer";
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: writerName });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.error(`FAIL ${name}`); }
}

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
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-03T00:00:00Z" });
    assert.equal(inventory.entries.length, 0);
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    console.log("MIGRATIONS applied on the empty disposable database through the existing runner");
  } finally { client.release(); }
  const { DatabaseStorage } = await import("../server/storage"); const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any);
  const two = new DatabaseStorage(drizzle(writerPool, { schema }) as any);
  await writerPool.query("SET statement_timeout='10s'");
  const addMerchant = async (label: string): Promise<number> => (await pool.query(
    "INSERT INTO merchants(name,business_name,email,status) VALUES ($1,$1,$2,'active') RETURNING id", [label, `${label}@tenant-storage.test`],
  )).rows[0].id;
  const a = await addMerchant("s4b1-tenant-a"); const b = await addMerchant("s4b1-tenant-b");
  const profile = (merchant = a) => one.createClientProfileForMerchant(merchant, { firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test" });
  const make = async (parent: string, status = "dispatched", merchant = a, kind = "full") => (await pool.query(
    "INSERT INTO job_invoices(merchant_id,client_profile_id,kind,amount_cents,token,delivery_channel,due_at,status) VALUES ($1,$2,$3,52000,$4,'email',now(),$5) RETURNING id",
    [merchant, parent, kind, `synthetic-${randomUUID()}`, status],
  )).rows[0].id as string;
  const makeQuote = async (parent: string, status = "sent", merchant = a) => (await pool.query(
    "INSERT INTO quotes(merchant_id,client_profile_id,token,status,line_items,subtotal_cents,total_cents) VALUES ($1,$2,$3,$4,'[]'::jsonb,52000,52000) RETURNING id",
    [merchant, parent, `synthetic-${randomUUID()}`, status],
  )).rows[0].id as string;
  const rawInvoice = async (id: string) => (await pool.query("SELECT * FROM job_invoices WHERE id=$1", [id])).rows[0];
  const events = async (parent: string) => (await pool.query("SELECT * FROM job_events WHERE client_profile_id=$1 ORDER BY created_at, id", [parent])).rows;
  const snapshot = async (id: string, parent: string) => ({ invoice: await rawInvoice(id), events: await events(parent) });
  type Action = "void" | "paid-external" | "complete";
  const ACTIONS: Action[] = ["void", "paid-external", "complete"];
  const startStatus = (action: Action) => action === "complete" ? "paid" : "dispatched";
  const mutate = (store: typeof one, action: Action, id: string, merchant = a) => action === "void" ? store.voidJobInvoiceForMerchant(id, merchant)
    : action === "paid-external" ? store.markJobInvoicePaidExternalForMerchant(id, merchant, "Synthetic reference")
    : store.completeJobInvoiceForMerchant(id, merchant);
  const receipt = (store: typeof one, id: string, parent: string, merchant = a, sent = true) =>
    store.recordJobInvoiceReceiptForMerchant(id, merchant, parent, { sent, reference: "JOB-SYNTHETIC" });
  async function waited(sql: string, args: any[], run: () => Promise<any>, accept: (result: any) => Promise<void>) {
    const locker = await pool.connect(); let open = false; let pending: Promise<any> | undefined;
    try {
      await locker.query("BEGIN"); open = true; await locker.query(sql, args);
      pending = run(); void pending.catch(() => undefined);
      let didWait = false;
      for (let i = 0; i < 200; i++) {
        const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [writerName]);
        if (result.rowCount) { didWait = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(didWait, "must actually wait on the concurrent write");
      await locker.query("COMMIT"); open = false; await accept(await pending);
    } finally { if (open) await locker.query("ROLLBACK"); await pending?.catch(() => undefined); locker.release(); }
  }

  await check("scoped reads and writes refuse foreign missing and inconsistent-parent invoices", async () => {
    const parent = await profile(); const missing = randomUUID();
    for (const action of ACTIONS) {
      const id = await make(parent.id, startStatus(action)); const before = await snapshot(id, parent.id);
      assert.equal((await one.getJobInvoiceForMerchant(id, a))?.id, id);
      assert.equal(await one.getJobInvoiceForMerchant(id, b), undefined);
      assert.equal(await one.getJobInvoiceForMerchant(missing, a), undefined);
      assert.deepEqual(await mutate(one, action, id, b), { kind: "not-found" });
      assert.deepEqual(await mutate(one, action, missing), { kind: "not-found" });
      assert.equal(await receipt(one, id, parent.id, b), false);
      assert.equal(await receipt(one, missing, parent.id), false);
      assert.deepEqual(await snapshot(id, parent.id), before);
    }
    const moved = await profile(); const id = await make(moved.id, "paid"); const before = await snapshot(id, moved.id);
    await pool.query("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, moved.id]);
    assert.equal(await one.getJobInvoiceForMerchant(id, a), undefined);
    assert.equal(await one.getJobInvoiceDeliveryForMerchant(id, a), undefined);
    assert.ok(!(await one.getJobInvoicesByMerchant(a)).some(row => row.id === id));
    for (const action of ACTIONS) assert.deepEqual(await mutate(one, action, id), { kind: "not-found" });
    assert.equal(await receipt(one, id, moved.id), false);
    assert.deepEqual(await snapshot(id, moved.id), before);
    // An invoice stamped with another business under an owned client belongs to neither.
    const mine = await profile(); const stamped = await make(mine.id, "paid", b); const stampedBefore = await snapshot(stamped, mine.id);
    for (const merchant of [a, b]) {
      assert.equal(await one.getJobInvoiceForMerchant(stamped, merchant), undefined);
      assert.equal(await one.getJobInvoiceDeliveryForMerchant(stamped, merchant), undefined);
      assert.ok(!(await one.getJobInvoicesByMerchant(merchant)).some(row => row.id === stamped));
      for (const action of ACTIONS) assert.deepEqual(await mutate(one, action, stamped, merchant), { kind: "not-found" });
      assert.equal(await receipt(one, stamped, mine.id, merchant), false);
    }
    assert.deepEqual(await snapshot(stamped, mine.id), stampedBefore);
  });
  await check("invoice and quote lists retain their filters newest first and omit foreign children and children of foreign clients", async () => {
    const parent = await profile(); const other = await profile(); const foreignParent = await profile(b);
    const older = await make(parent.id, "balance_due"); const newer = await make(parent.id, "balance_due");
    await pool.query("UPDATE job_invoices SET created_at = now() - interval '1 day' WHERE id=$1", [older]);
    await make(parent.id, "paid"); await make(other.id, "balance_due");
    await make(parent.id, "balance_due", b); const orphan = await make(foreignParent.id, "balance_due", a);
    assert.deepEqual((await one.getJobInvoicesByMerchant(a, { clientProfileId: parent.id, status: "balance_due" })).map(row => row.id), [newer, older]);
    assert.ok(!(await one.getJobInvoicesByMerchant(a)).some(row => row.id === orphan));
    const sent = await makeQuote(parent.id, "sent"); await makeQuote(parent.id, "accepted");
    await makeQuote(parent.id, "sent", b); const orphanQuote = await makeQuote(foreignParent.id, "sent", a);
    const listed = (await one.getQuotesByMerchant(a, { status: "sent" })).map(row => row.id);
    assert.ok(listed.includes(sent)); assert.ok(!listed.includes(orphanQuote));
    assert.ok((await one.getQuotesByMerchant(a)).every(row => row.merchantId === a && row.id !== orphanQuote));
    assert.equal((await one.getQuotesByMerchant(a)).filter(row => row.clientProfileId === parent.id).length, 2);
  });
  await check("joined snapshots return the row with its owned client and refuse foreign missing and inconsistent rows", async () => {
    const parent = await profile(); const id = await make(parent.id); const quote = await makeQuote(parent.id);
    const invoiceSnapshot = await one.getJobInvoiceDeliveryForMerchant(id, a);
    assert.equal(invoiceSnapshot?.invoice.id, id); assert.equal(invoiceSnapshot?.client.id, parent.id); assert.equal(invoiceSnapshot?.client.merchantId, a);
    const quoteSnapshot = await one.getQuoteDeliveryForMerchant(quote, a);
    assert.equal(quoteSnapshot?.quote.id, quote); assert.equal(quoteSnapshot?.client.id, parent.id); assert.equal(quoteSnapshot?.client.merchantId, a);
    assert.equal(await one.getJobInvoiceDeliveryForMerchant(id, b), undefined); assert.equal(await one.getQuoteDeliveryForMerchant(quote, b), undefined);
    assert.equal(await one.getJobInvoiceDeliveryForMerchant(randomUUID(), a), undefined); assert.equal(await one.getQuoteDeliveryForMerchant(randomUUID(), a), undefined);
    await pool.query("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id]);
    assert.equal(await one.getJobInvoiceDeliveryForMerchant(id, a), undefined); assert.equal(await one.getQuoteDeliveryForMerchant(quote, a), undefined);
    assert.equal(await one.getJobInvoiceDeliveryForMerchant(id, b), undefined); assert.equal(await one.getQuoteDeliveryForMerchant(quote, b), undefined);
  });
  await check("each state change commits its fixed fields and one history line for the owned client", async () => {
    const parent = await profile();
    const voidId = await make(parent.id); const paidId = await make(parent.id); const doneId = await make(parent.id, "paid_external");
    const [voidBefore, paidBefore, doneBefore] = [await rawInvoice(voidId), await rawInvoice(paidId), await rawInvoice(doneId)];
    const voided = await mutate(one, "void", voidId); const paid = await mutate(one, "paid-external", paidId); const done = await mutate(one, "complete", doneId);
    assert.equal(voided.kind, "ok"); assert.equal(paid.kind, "ok"); assert.equal(done.kind, "ok");
    const [voidAfter, paidAfter, doneAfter] = [await rawInvoice(voidId), await rawInvoice(paidId), await rawInvoice(doneId)];
    assert.equal(voidAfter.status, "voided"); assert.ok(voidAfter.voided_at);
    assert.deepEqual({ ...voidAfter, status: voidBefore.status, voided_at: null, updated_at: voidBefore.updated_at }, voidBefore);
    assert.equal(paidAfter.status, "paid_external"); assert.ok(paidAfter.paid_at); assert.equal(paidAfter.external_payment_reference, "Synthetic reference");
    assert.deepEqual({ ...paidAfter, status: paidBefore.status, paid_at: null, external_payment_reference: null, updated_at: paidBefore.updated_at }, paidBefore);
    assert.equal(doneAfter.status, "paid_external"); assert.ok(doneAfter.completed_at);
    assert.deepEqual({ ...doneAfter, completed_at: null, updated_at: doneBefore.updated_at }, doneBefore);
    const history = await events(parent.id);
    assert.deepEqual(history.map(row => [row.job_invoice_id, row.event_type]).sort(), [[voidId, "invoice_voided"], [paidId, "paid_external"], [doneId, "job_completed"]].sort());
    assert.ok(history.every(row => row.merchant_id === a && row.client_profile_id === parent.id));
    const noReference = await make(parent.id); await one.markJobInvoicePaidExternalForMerchant(noReference, a);
    assert.equal((await rawInvoice(noReference)).external_payment_reference, null);
  });
  await check("an archived client's issued invoices stay manageable", async () => {
    const parent = await profile(); const voidId = await make(parent.id); const paidId = await make(parent.id); const doneId = await make(parent.id, "paid");
    await one.archiveClientProfileForMerchant(parent.id, a);
    assert.ok(await one.getJobInvoiceForMerchant(voidId, a));
    assert.equal((await one.getJobInvoicesByMerchant(a, { clientProfileId: parent.id })).length, 3);
    assert.equal((await mutate(one, "void", voidId)).kind, "ok"); assert.equal((await mutate(one, "paid-external", paidId)).kind, "ok");
    assert.equal((await mutate(one, "complete", doneId)).kind, "ok");
    assert.equal(await receipt(one, paidId, parent.id), true);
  });
  await check("settled voided deposit and unpaid refusals preserve state and history", async () => {
    const parent = await profile();
    for (const status of ["paid", "paid_external", "voided"]) {
      const id = await make(parent.id, status); const before = await snapshot(id, parent.id);
      assert.deepEqual(await mutate(one, "paid-external", id), { kind: "conflict", reason: status === "voided" ? "voided" : "paid" });
      if (status !== "voided") assert.deepEqual(await mutate(one, "void", id), { kind: "conflict", reason: "paid" });
      assert.deepEqual(await snapshot(id, parent.id), before);
    }
    for (const [status, kind, reason] of [["paid", "deposit", "deposit"], ["dispatched", "deposit", "deposit"], ["dispatched", "full", "unpaid"], ["voided", "full", "unpaid"]] as const) {
      const id = await make(parent.id, status, a, kind); const before = await snapshot(id, parent.id);
      assert.deepEqual(await mutate(one, "complete", id), { kind: "conflict", reason });
      assert.deepEqual(await snapshot(id, parent.id), before);
    }
  });
  await check("a repeated void and a repeated completion each record a new time and another history line", async () => {
    const parent = await profile(); const voidId = await make(parent.id); const doneId = await make(parent.id, "paid");
    for (const [action, id, column, eventType] of [["void", voidId, "voided_at", "invoice_voided"], ["complete", doneId, "completed_at", "job_completed"]] as const) {
      assert.equal((await mutate(one, action, id)).kind, "ok"); const first = (await rawInvoice(id))[column];
      await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal((await mutate(one, action, id)).kind, "ok"); const second = (await rawInvoice(id))[column];
      assert.ok(second.getTime() > first.getTime());
      assert.equal((await events(parent.id)).filter(row => row.job_invoice_id === id && row.event_type === eventType).length, 2);
    }
  });
  await check("history failures roll back every state change and the receipt line", async () => {
    const parent = await profile();
    await pool.query(`CREATE FUNCTION s4b1_refuse_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`);
    await pool.query("CREATE TRIGGER s4b1_refuse_history BEFORE INSERT ON job_events FOR EACH ROW EXECUTE FUNCTION s4b1_refuse_history()");
    try {
      for (const action of ACTIONS) {
        const id = await make(parent.id, startStatus(action)); const before = await snapshot(id, parent.id);
        await assert.rejects(mutate(one, action, id)); assert.deepEqual(await snapshot(id, parent.id), before);
        await assert.rejects(receipt(one, id, parent.id)); assert.deepEqual(await snapshot(id, parent.id), before);
      }
    } finally { await pool.query("DROP TRIGGER s4b1_refuse_history ON job_events"); await pool.query("DROP FUNCTION s4b1_refuse_history()"); }
  });
  await check("concurrent void and external payment serialize to one state and one history line", async () => {
    for (let round = 0; round < 8; round++) {
      const parent = await profile(); const id = await make(parent.id);
      const results = await Promise.all([one.voidJobInvoiceForMerchant(id, a), one.markJobInvoicePaidExternalForMerchant(id, a)]);
      const invoice = await rawInvoice(id); const history = await events(parent.id);
      if (invoice.status === "voided") {
        // Either order can leave it voided only when the void ran first: the payment record is then refused.
        assert.deepEqual(results.map(result => result.kind), ["ok", "conflict"]);
        assert.deepEqual(history.map(row => row.event_type), ["invoice_voided"]);
      } else {
        assert.equal(invoice.status, "paid_external"); assert.deepEqual(results.map(result => result.kind), ["conflict", "ok"]);
        assert.deepEqual(history.map(row => row.event_type), ["paid_external"]);
      }
    }
  });
  await check("receipt history needs the current owned invoice of the captured client and logs sent or failed", async () => {
    const parent = await profile(); const other = await profile(); const id = await make(parent.id, "paid_external"); const before = await rawInvoice(id);
    assert.equal(await receipt(one, id, other.id), false); assert.deepEqual(await events(other.id), []); assert.deepEqual(await events(parent.id), []);
    assert.equal(await receipt(one, id, parent.id, a, true), true); assert.equal(await receipt(one, id, parent.id, a, false), true);
    const history = await events(parent.id);
    assert.deepEqual(history.map(row => row.event_type).sort(), ["invoice_email_failed", "invoice_email_sent"]);
    assert.ok(history.every(row => row.merchant_id === a && row.job_invoice_id === id && row.payload.reference === "JOB-SYNTHETIC"));
    assert.deepEqual(await rawInvoice(id), before);
  });
  for (const action of ACTIONS) {
    await check(`${action} waits and refuses committed child ownership change`, async () => {
      const parent = await profile(); const id = await make(parent.id, startStatus(action)); const before = await snapshot(id, parent.id);
      await waited("UPDATE job_invoices SET merchant_id=$1 WHERE id=$2", [b, id], () => mutate(two, action, id), async result => {
        assert.deepEqual(result, { kind: "not-found" });
        assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, merchant_id: b } });
      });
    });
    await check(`${action} waits and refuses committed parent ownership change`, async () => {
      const parent = await profile(); const id = await make(parent.id, startStatus(action)); const before = await snapshot(id, parent.id);
      await waited("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], () => mutate(two, action, id), async result => {
        assert.deepEqual(result, { kind: "not-found" }); assert.deepEqual(await snapshot(id, parent.id), before);
      });
    });
    await check(`${action} waits and refuses a reparented invoice`, async () => {
      const parent = await profile(); const next = await profile(); const id = await make(parent.id, startStatus(action)); const before = await snapshot(id, parent.id);
      await waited("UPDATE job_invoices SET client_profile_id=$1 WHERE id=$2", [next.id, id], () => mutate(two, action, id), async result => {
        assert.deepEqual(result, { kind: "not-found" });
        assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, client_profile_id: next.id } });
        assert.deepEqual(await events(next.id), []);
      });
    });
  }
  for (const action of ["void", "paid-external"] as const) for (const status of ["paid", "paid_external"]) {
    await check(`${action} waits and refuses newly ${status} invoice`, async () => {
      const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
      await waited("UPDATE job_invoices SET status=$1 WHERE id=$2", [status, id], () => mutate(two, action, id), async result => {
        assert.deepEqual(result, { kind: "conflict", reason: "paid" });
        assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, status } });
      });
    });
  }
  await check("external payment waits and refuses a newly voided invoice", async () => {
    const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
    await waited("UPDATE job_invoices SET status='voided' WHERE id=$1", [id], () => mutate(two, "paid-external", id), async result => {
      assert.deepEqual(result, { kind: "conflict", reason: "voided" });
      assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, status: "voided" } });
    });
  });
  await check("completion waits and refuses an invoice no longer paid", async () => {
    const parent = await profile(); const id = await make(parent.id, "paid"); const before = await snapshot(id, parent.id);
    await waited("UPDATE job_invoices SET status='voided' WHERE id=$1", [id], () => mutate(two, "complete", id), async result => {
      assert.deepEqual(result, { kind: "conflict", reason: "unpaid" });
      assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, status: "voided" } });
    });
  });
  await check("receipt history waits and refuses a committed parent ownership change", async () => {
    const parent = await profile(); const id = await make(parent.id, "paid_external"); const before = await snapshot(id, parent.id);
    await waited("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], () => receipt(two, id, parent.id), async result => {
      assert.equal(result, false); assert.deepEqual(await snapshot(id, parent.id), before);
    });
  });
  await check("invalid merchants refuse before database casts or mutations", async () => {
    const parent = await profile(); const id = await make(parent.id); const quote = await makeQuote(parent.id); const before = await snapshot(id, parent.id);
    for (const merchant of [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648]) {
      assert.equal(await one.getJobInvoiceForMerchant(id, merchant as any), undefined);
      assert.equal(await one.getJobInvoiceDeliveryForMerchant(id, merchant as any), undefined);
      assert.equal(await one.getQuoteDeliveryForMerchant(quote, merchant as any), undefined);
      assert.deepEqual(await one.getJobInvoicesByMerchant(merchant as any), []);
      assert.deepEqual(await one.getQuotesByMerchant(merchant as any), []);
      // Called directly: the helpers above default an undefined business to tenant a.
      assert.deepEqual(await one.voidJobInvoiceForMerchant(id, merchant as any), { kind: "not-found" });
      assert.deepEqual(await one.markJobInvoicePaidExternalForMerchant(id, merchant as any, "Synthetic reference"), { kind: "not-found" });
      assert.deepEqual(await one.completeJobInvoiceForMerchant(id, merchant as any), { kind: "not-found" });
      assert.equal(await one.recordJobInvoiceReceiptForMerchant(id, merchant as any, parent.id, { sent: true, reference: "JOB-SYNTHETIC" }), false);
    }
    assert.deepEqual(await snapshot(id, parent.id), before);
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S4 TRADES INVOICE STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
