/** R1-T7 S4b2: scoped trades quote, invoice and balance creation and their delivery records. */
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
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 16 });
const writerName = "taptpay-t7-s4b2-writer";
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
  const a = await addMerchant("s4b2-tenant-a"); const b = await addMerchant("s4b2-tenant-b");
  const MISSING = "99999999-9999-4999-8999-999999999999";
  const prospect = { firstName: "Quinn", lastName: "Quick", email: "quinn@example.test", phone: null, siteAddress: "", preferredChannel: "email" };
  const quoteInput: any = { lineItems: [{ description: "Synthetic", qty: 1, unitPriceCents: 100_000, lineTotalCents: 100_000 }], subtotalCents: 100_000, gstCents: 0, gstMode: null,
    totalCents: 100_000, depositEnabled: true, depositType: "percent", depositValue: 20, depositCents: 20_000, deliveryChannel: "email", validUntil: null, notes: null, documentUrl: null, documentName: null };
  const invoiceInput: any = { kind: "full", amountCents: 52_000, deliveryChannel: "email", dueAt: new Date("2026-10-10T00:00:00Z") };
  const INJECTED = { id: randomUUID(), merchantId: b, clientProfileId: MISSING, token: "caller-token", status: "accepted", acceptedAt: new Date(0), paidAt: new Date(0),
    splitPaidCount: 22, scheduleId: MISSING, windcaveSessionId: "caller-session", createdAt: new Date(0), updatedAt: new Date(0) };
  const profile = (merchant = a) => one.createClientProfileForMerchant(merchant, { firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test" });
  const quoteFor = async (parent: string, data = quoteInput) => {
    const result = await one.createQuoteForMerchant(a, { clientProfileId: parent }, data); assert.equal(result.kind, "ok"); return (result as any).quote;
  };
  const invoiceFor = async (parent: string, data = invoiceInput) => {
    const result = await one.createJobInvoiceForMerchant(a, { clientProfileId: parent }, data); assert.equal(result.kind, "ok"); return (result as any).invoice;
  };
  const paidDeposit = async (parent: string, quote: string, amountCents = 20_000, channel = "sms") => {
    const deposit = await invoiceFor(parent, { ...invoiceInput, kind: "deposit", quoteId: quote, amountCents, deliveryChannel: channel });
    await pool.query("UPDATE job_invoices SET status='paid', paid_at=now() WHERE id=$1", [deposit.id]); return deposit.id as string;
  };
  const rawInvoice = async (id: string) => (await pool.query("SELECT * FROM job_invoices WHERE id=$1", [id])).rows[0];
  const counts = async () => (await pool.query(`SELECT (SELECT count(*)::int FROM client_profiles) AS clients, (SELECT count(*)::int FROM quotes) AS quotes,
    (SELECT count(*)::int FROM job_invoices) AS invoices, (SELECT count(*)::int FROM job_events) AS events`)).rows[0];
  const events = async (parent: string) => (await pool.query("SELECT * FROM job_events WHERE client_profile_id=$1 ORDER BY created_at, id", [parent])).rows;
  const snapshot = async (parent: string) => ({
    quotes: (await pool.query("SELECT * FROM quotes WHERE client_profile_id=$1 ORDER BY id", [parent])).rows,
    invoices: (await pool.query("SELECT * FROM job_invoices WHERE client_profile_id=$1 ORDER BY id", [parent])).rows,
    events: await events(parent) });
  const addDocument = async (merchant = a) => {
    const path = `invoices/invoice-${1_700_000_000_000 + Math.floor(Math.random() * 1e9)}-${randomUUID().replace(/-/g, "").slice(0, 16)}.pdf`;
    await pool.query("INSERT INTO uploaded_files(path,mime_type,data,merchant_id) VALUES ($1,'application/pdf',$2,$3)", [path, Buffer.from("%PDF-synthetic"), merchant]);
    return { path, documentUrl: `/uploads/${path}`, documentName: "synthetic.pdf" };
  };
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

  await check("foreign and missing clients refuse every create with nothing written", async () => {
    const theirs = await profile(b); const before = await counts();
    for (const parent of [theirs.id, MISSING]) {
      assert.deepEqual(await one.createQuoteForMerchant(a, { clientProfileId: parent }, quoteInput), { kind: "not-found" });
      assert.deepEqual(await one.createJobInvoiceForMerchant(a, { clientProfileId: parent }, invoiceInput), { kind: "not-found" });
    }
    assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(MISSING, a, false), { kind: "not-found" });
    assert.deepEqual(await counts(), before);
  });
  await check("runtime projection forces identity business token status and lifecycle on quotes and invoices", async () => {
    const parent = await profile();
    const quote = await quoteFor(parent.id, { ...quoteInput, ...INJECTED });
    assert.notEqual(quote.id, INJECTED.id); assert.equal(quote.merchantId, a); assert.equal(quote.clientProfileId, parent.id); assert.equal(quote.status, "sent");
    assert.notEqual(quote.token, "caller-token"); assert.match(quote.token, /^[A-Za-z0-9_-]{27}$/); assert.ok(quote.sentAt); assert.equal(quote.acceptedAt, null);
    assert.notEqual(quote.createdAt.getTime(), 0); assert.equal(quote.totalCents, 100_000); assert.equal(quote.depositCents, 20_000);
    const invoice = await invoiceFor(parent.id, { ...invoiceInput, ...INJECTED, kind: "recurring", jobDetails: "Synthetic job", splitEnabled: true });
    assert.notEqual(invoice.id, INJECTED.id); assert.equal(invoice.merchantId, a); assert.equal(invoice.clientProfileId, parent.id); assert.equal(invoice.status, "pending_dispatch");
    assert.notEqual(invoice.token, "caller-token"); assert.match(invoice.token, /^[A-Za-z0-9_-]{27}$/); assert.equal(invoice.kind, "full"); assert.equal(invoice.paidAt, null);
    assert.equal(invoice.splitPaidCount, 0); assert.equal(invoice.scheduleId, null); assert.equal(invoice.windcaveSessionId, null); assert.equal(invoice.quoteId, null);
    assert.equal(invoice.jobDetails, "Synthetic job"); assert.equal(invoice.splitEnabled, true); assert.notEqual(invoice.createdAt.getTime(), 0);
    assert.deepEqual((await events(parent.id)).map(row => [row.event_type, row.merchant_id, row.quote_id ?? row.job_invoice_id]).sort(),
      [["invoice_sent", a, invoice.id], ["quote_sent", a, quote.id]].sort());
  });
  await check("an unsaved recipient's hidden prospect commits with its quote or invoice and one history line each", async () => {
    const before = await counts();
    const quoted = await one.createQuoteForMerchant(a, { prospect: { ...prospect, merchantId: b, id: randomUUID(), status: "active", archivedAt: new Date(0) } as any }, quoteInput);
    const invoiced = await one.createJobInvoiceForMerchant(a, { prospect: { ...prospect, firstName: "", lastName: "", email: null } }, invoiceInput);
    assert.equal(quoted.kind, "ok"); assert.equal(invoiced.kind, "ok");
    for (const result of [quoted, invoiced] as any[]) {
      assert.equal(result.client.merchantId, a); assert.equal(result.client.status, "prospect"); assert.equal(result.client.archivedAt, null);
      assert.equal((result.quote ?? result.invoice).clientProfileId, result.client.id);
    }
    assert.equal((invoiced as any).client.firstName, ""); assert.equal((invoiced as any).client.email, null);
    const after = await counts();
    assert.deepEqual(after, { clients: before.clients + 2, quotes: before.quotes + 1, invoices: before.invoices + 1, events: before.events + 2 });
  });
  await check("a history failure rolls back the prospect and the row for every create", async () => {
    const parent = await profile(); const quote = await quoteFor(parent.id); const deposit = await paidDeposit(parent.id, quote.id); const before = await counts();
    await pool.query(`CREATE FUNCTION s4b2_refuse_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`);
    await pool.query("CREATE TRIGGER s4b2_refuse_history BEFORE INSERT ON job_events FOR EACH ROW EXECUTE FUNCTION s4b2_refuse_history()");
    try {
      await assert.rejects(one.createQuoteForMerchant(a, { prospect }, quoteInput));
      await assert.rejects(one.createJobInvoiceForMerchant(a, { prospect }, invoiceInput));
      await assert.rejects(one.createQuoteForMerchant(a, { clientProfileId: parent.id }, quoteInput));
      await assert.rejects(one.createJobInvoiceForMerchant(a, { clientProfileId: parent.id }, invoiceInput));
      await assert.rejects(one.createJobBalanceInvoiceForMerchant(deposit, a, false));
      assert.deepEqual(await counts(), before);
    } finally { await pool.query("DROP TRIGGER s4b2_refuse_history ON job_events"); await pool.query("DROP FUNCTION s4b2_refuse_history()"); }
  });
  await check("an attached document must be the business's own upload through the write, and a refusal leaves no prospect", async () => {
    const parent = await profile(); const mine = await addDocument(a);
    const quote = await quoteFor(parent.id, { ...quoteInput, documentUrl: mine.documentUrl, documentName: mine.documentName });
    const invoice = await invoiceFor(parent.id, { ...invoiceInput, documentUrl: mine.documentUrl, documentName: mine.documentName });
    assert.equal(quote.documentUrl, mine.documentUrl); assert.equal(invoice.documentName, "synthetic.pdf");
    const theirs = await addDocument(b); const before = await counts();
    for (const documentUrl of [theirs.documentUrl, "https://foreign.example/doc.pdf", "/uploads/invoices/invoice-1-0000000000000000.pdf"]) {
      for (const ref of [{ clientProfileId: parent.id }, { prospect }] as const) {
        assert.deepEqual(await one.createQuoteForMerchant(a, ref, { ...quoteInput, documentUrl }), { kind: "invalid-document" });
        assert.deepEqual(await one.createJobInvoiceForMerchant(a, ref, { ...invoiceInput, documentUrl }), { kind: "invalid-document" });
      }
    }
    assert.deepEqual(await counts(), before);
  });
  await check("a linked quote must be the business's and that client's", async () => {
    const parent = await profile(); const other = await profile(); const quote = await quoteFor(parent.id); const elsewhere = await quoteFor(other.id);
    const foreignParent = await profile(b);
    const foreign = (await two.createQuoteForMerchant(b, { clientProfileId: foreignParent.id }, quoteInput) as any).quote;
    const before = await counts();
    for (const quoteId of [elsewhere.id, foreign.id, MISSING]) {
      assert.deepEqual(await one.createJobInvoiceForMerchant(a, { clientProfileId: parent.id }, { ...invoiceInput, kind: "deposit", quoteId }), { kind: "quote-not-found" });
    }
    assert.deepEqual(await one.createJobInvoiceForMerchant(a, { prospect }, { ...invoiceInput, quoteId: quote.id }), { kind: "quote-not-found" });
    assert.deepEqual(await counts(), before);
    const deposit = await invoiceFor(parent.id, { ...invoiceInput, kind: "deposit", quoteId: quote.id });
    assert.equal(deposit.kind, "deposit"); assert.equal(deposit.quoteId, quote.id);
  });
  await check("an archived client can still be quoted and invoiced, as recorded", async () => {
    const parent = await profile(); await one.archiveClientProfileForMerchant(parent.id, a);
    assert.equal((await one.createQuoteForMerchant(a, { clientProfileId: parent.id }, quoteInput)).kind, "ok");
    assert.equal((await one.createJobInvoiceForMerchant(a, { clientProfileId: parent.id }, invoiceInput)).kind, "ok");
  });
  await check("the balance bills what is left on the quote once, by the deposit's channel, due in seven days", async () => {
    const parent = await profile(); const quote = await quoteFor(parent.id); const deposit = await paidDeposit(parent.id, quote.id);
    await invoiceFor(parent.id, { ...invoiceInput, kind: "deposit", quoteId: quote.id, amountCents: 5_000 });
    const voided = await invoiceFor(parent.id, { ...invoiceInput, kind: "deposit", quoteId: quote.id, amountCents: 30_000 });
    await pool.query("UPDATE job_invoices SET status='voided' WHERE id=$1", [voided.id]);
    await invoiceFor(parent.id, { ...invoiceInput, amountCents: 9_000 });
    const history = (await events(parent.id)).length; const started = Date.now();
    const result = await one.createJobBalanceInvoiceForMerchant(deposit, a, true);
    assert.equal(result.kind, "ok"); const balance = (result as any).invoice;
    assert.equal(balance.kind, "balance"); assert.equal(balance.amountCents, 75_000); assert.equal(balance.quoteId, quote.id); assert.equal(balance.clientProfileId, parent.id);
    assert.equal(balance.merchantId, a); assert.equal(balance.deliveryChannel, "sms"); assert.equal(balance.status, "pending_dispatch"); assert.equal(balance.splitEnabled, true);
    assert.match(balance.token, /^[A-Za-z0-9_-]{27}$/);
    const expected = new Date(started); expected.setDate(expected.getDate() + 7);
    assert.ok(Math.abs(balance.dueAt.getTime() - expected.getTime()) < 10_000);
    const after = await events(parent.id); assert.equal(after.length, history + 1);
    assert.deepEqual([after.at(-1).event_type, after.at(-1).job_invoice_id, after.at(-1).merchant_id], ["balance_sent", balance.id, a]);
    const before = await snapshot(parent.id);
    assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(deposit, a, false), { kind: "conflict", reason: "exists" });
    assert.deepEqual(await snapshot(parent.id), before);
  });
  await check("the balance refuses a non-deposit an unpaid deposit one with no quote a foreign quote and nothing left", async () => {
    const parent = await profile(); const quote = await quoteFor(parent.id);
    const full = await invoiceFor(parent.id); const unpaid = await invoiceFor(parent.id, { ...invoiceInput, kind: "deposit", quoteId: quote.id, amountCents: 20_000 });
    const loose = await paidDeposit(parent.id, quote.id); await pool.query("UPDATE job_invoices SET quote_id=NULL WHERE id=$1", [loose]);
    const foreignParent = await profile(b); const foreignQuote = (await two.createQuoteForMerchant(b, { clientProfileId: foreignParent.id }, quoteInput) as any).quote;
    const astray = await paidDeposit(parent.id, quote.id); await pool.query("UPDATE job_invoices SET quote_id=$1 WHERE id=$2", [foreignQuote.id, astray]);
    const before = await snapshot(parent.id);
    assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(full.id, a, false), { kind: "conflict", reason: "not-deposit" });
    assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(unpaid.id, a, false), { kind: "conflict", reason: "unpaid" });
    assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(loose, a, false), { kind: "conflict", reason: "no-quote" });
    assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(astray, a, false), { kind: "conflict", reason: "quote-not-found" });
    const covered = await profile(); const small = await quoteFor(covered.id, { ...quoteInput, totalCents: 20_000, subtotalCents: 20_000 });
    const whole = await paidDeposit(covered.id, small.id, 20_000); const coveredBefore = await snapshot(covered.id);
    assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(whole, a, false), { kind: "conflict", reason: "none-remaining" });
    assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(whole, b, false), { kind: "not-found" });
    assert.deepEqual(await snapshot(parent.id), before); assert.deepEqual(await snapshot(covered.id), coveredBefore);
  });
  await check("a deposit paid outside TaptPay or marked deposit_paid also takes its balance", async () => {
    for (const status of ["paid_external", "deposit_paid"]) {
      const parent = await profile(); const quote = await quoteFor(parent.id); const deposit = await paidDeposit(parent.id, quote.id);
      await pool.query("UPDATE job_invoices SET status=$1 WHERE id=$2", [status, deposit]);
      assert.equal((await one.createJobBalanceInvoiceForMerchant(deposit, a, false)).kind, "ok");
    }
  });
  await check("eight balance sends at the same moment make one balance and one history line", async () => {
    const parent = await profile(); const quote = await quoteFor(parent.id); const deposit = await paidDeposit(parent.id, quote.id);
    const results = await Promise.all(Array.from({ length: 8 }, () => one.createJobBalanceInvoiceForMerchant(deposit, a, false)));
    assert.equal(results.filter(result => result.kind === "ok").length, 1);
    assert.equal(results.filter(result => result.kind === "conflict" && result.reason === "exists").length, 7);
    const made = (await snapshot(parent.id)).invoices.filter(row => row.kind === "balance");
    assert.equal(made.length, 1); assert.equal(made[0].amount_cents, 80_000);
    assert.equal((await events(parent.id)).filter(row => row.event_type === "balance_sent").length, 1);
  });
  await check("balance sends through two paid deposits of one quote at the same moment still make one balance", async () => {
    for (let round = 0; round < 4; round++) {
      const parent = await profile(); const quote = await quoteFor(parent.id);
      const first = await paidDeposit(parent.id, quote.id, 20_000); const second = await paidDeposit(parent.id, quote.id, 10_000);
      const results = await Promise.all([first, second, first, second].map(deposit => one.createJobBalanceInvoiceForMerchant(deposit, a, false)));
      assert.equal(results.filter(result => result.kind === "ok").length, 1);
      assert.equal(results.filter(result => result.kind === "conflict" && result.reason === "exists").length, 3);
      const made = (await snapshot(parent.id)).invoices.filter(row => row.kind === "balance");
      assert.equal(made.length, 1); assert.equal(made[0].amount_cents, 70_000);
    }
  });
  await check("eight creates for one client at the same moment each commit their own row token and history", async () => {
    const parent = await profile();
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => i % 2 ? one.createQuoteForMerchant(a, { clientProfileId: parent.id }, quoteInput)
      : one.createJobInvoiceForMerchant(a, { clientProfileId: parent.id }, invoiceInput)));
    assert.ok(results.every(result => result.kind === "ok"));
    const after = await snapshot(parent.id); assert.equal(after.quotes.length, 4); assert.equal(after.invoices.length, 4); assert.equal(after.events.length, 8);
    assert.equal(new Set([...after.quotes, ...after.invoices].map(row => row.token)).size, 8);
  });
  await check("a quote's delivery is logged sent or failed only for the owned quote of its captured owned client", async () => {
    const parent = await profile(); const other = await profile(); const quote = await quoteFor(parent.id); const before = (await events(parent.id)).length;
    assert.equal(await one.recordQuoteDeliveryForMerchant(quote.id, b, parent.id, { sent: true, channel: "email" }), false);
    assert.equal(await one.recordQuoteDeliveryForMerchant(quote.id, a, other.id, { sent: true, channel: "email" }), false);
    assert.equal(await one.recordQuoteDeliveryForMerchant(MISSING, a, parent.id, { sent: true, channel: "email" }), false);
    assert.equal((await events(parent.id)).length, before); assert.deepEqual(await events(other.id), []);
    assert.equal(await one.recordQuoteDeliveryForMerchant(quote.id, a, parent.id, { sent: true, channel: "email" }), true);
    assert.equal(await one.recordQuoteDeliveryForMerchant(quote.id, a, parent.id, { sent: false, reason: "no_deliverable" }), true);
    const logged = (await events(parent.id)).slice(before);
    assert.deepEqual(logged.map(row => [row.event_type, row.quote_id, row.merchant_id]), [["quote_dispatched", quote.id, a], ["quote_dispatch_failed", quote.id, a]]);
    assert.equal(logged[0].payload.channel, "email"); assert.equal(logged[1].payload.reason, "no_deliverable");
    // A quote stamped with another business under an owned client belongs to neither.
    const stamped = (await pool.query("INSERT INTO quotes(merchant_id,client_profile_id,token,status,line_items,subtotal_cents,total_cents) VALUES ($1,$2,$3,'sent','[]'::jsonb,1,1) RETURNING id",
      [b, parent.id, `synthetic-${randomUUID()}`])).rows[0].id;
    for (const merchant of [a, b]) assert.equal(await one.recordQuoteDeliveryForMerchant(stamped, merchant, parent.id, { sent: true, channel: "email" }), false);
    assert.equal((await events(parent.id)).length, before + 2);
    await pool.query("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id]);
    assert.equal(await one.recordQuoteDeliveryForMerchant(quote.id, a, parent.id, { sent: true, channel: "email" }), false);
    assert.equal((await events(parent.id)).length, before + 2);
  });
  await check("an invoice's delivery record sets its fixed fields, moves only a waiting invoice to dispatched, and logs once", async () => {
    const parent = await profile();
    for (const [status, next] of [["pending_dispatch", "dispatched"], ["dispatch_failed", "dispatched"], ["dispatched", "dispatched"], ["viewed", "viewed"], ["balance_due", "balance_due"]]) {
      const invoice = await invoiceFor(parent.id); await pool.query("UPDATE job_invoices SET status=$1 WHERE id=$2", [status, invoice.id]);
      const before = await rawInvoice(invoice.id); const history = (await events(parent.id)).length;
      const result = await one.recordJobInvoiceDeliveryForMerchant(invoice.id, a, parent.id, { channel: "email", messageId: "ignored-for-email" });
      assert.equal(result.kind, "ok"); const after = await rawInvoice(invoice.id);
      assert.equal(after.status, next); assert.ok(after.dispatched_at); assert.ok(after.sent_at); assert.equal(after.whatsapp_message_id, null);
      assert.deepEqual({ ...after, status: before.status, dispatched_at: null, sent_at: null, updated_at: before.updated_at }, before);
      const logged = (await events(parent.id)).slice(history);
      assert.deepEqual(logged.map(row => [row.event_type, row.job_invoice_id, row.merchant_id, row.payload.channel]), [["invoice_dispatched", invoice.id, a, "email"]]);
    }
    const whatsapp = await invoiceFor(parent.id);
    await one.recordJobInvoiceDeliveryForMerchant(whatsapp.id, a, parent.id, { channel: "whatsapp", messageId: "synthetic-message" });
    assert.equal((await rawInvoice(whatsapp.id)).whatsapp_message_id, "synthetic-message");
  });
  await check("an invoice's delivery record refuses foreign missing settled and other-client rows with nothing written", async () => {
    const parent = await profile(); const other = await profile(); const invoice = await invoiceFor(parent.id);
    assert.deepEqual(await one.recordJobInvoiceDeliveryForMerchant(invoice.id, b, parent.id, { channel: "email" }), { kind: "not-found" });
    assert.deepEqual(await one.recordJobInvoiceDeliveryForMerchant(invoice.id, a, other.id, { channel: "email" }), { kind: "not-found" });
    assert.deepEqual(await one.recordJobInvoiceDeliveryForMerchant(MISSING, a, parent.id, { channel: "email" }), { kind: "not-found" });
    for (const [status, reason] of [["paid", "paid"], ["paid_external", "paid"], ["voided", "voided"]]) {
      await pool.query("UPDATE job_invoices SET status=$1 WHERE id=$2", [status, invoice.id]); const before = await snapshot(parent.id);
      assert.deepEqual(await one.recordJobInvoiceDeliveryForMerchant(invoice.id, a, parent.id, { channel: "email" }), { kind: "conflict", reason });
      assert.deepEqual(await snapshot(parent.id), before);
    }
    assert.deepEqual(await events(other.id), []);
  });
  await check("a history failure rolls back an invoice's delivery record and refuses a quote's", async () => {
    const parent = await profile(); const invoice = await invoiceFor(parent.id); const quote = await quoteFor(parent.id); const before = await snapshot(parent.id);
    await pool.query(`CREATE FUNCTION s4b2_refuse_delivery_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`);
    await pool.query("CREATE TRIGGER s4b2_refuse_delivery_history BEFORE INSERT ON job_events FOR EACH ROW EXECUTE FUNCTION s4b2_refuse_delivery_history()");
    try {
      await assert.rejects(one.recordJobInvoiceDeliveryForMerchant(invoice.id, a, parent.id, { channel: "email" }));
      await assert.rejects(one.recordQuoteDeliveryForMerchant(quote.id, a, parent.id, { sent: true, channel: "email" }));
      assert.deepEqual(await snapshot(parent.id), before);
    } finally { await pool.query("DROP TRIGGER s4b2_refuse_delivery_history ON job_events"); await pool.query("DROP FUNCTION s4b2_refuse_delivery_history()"); }
  });
  for (const kind of ["quote", "invoice"] as const) {
    await check(`${kind} create waits and refuses a committed client ownership change`, async () => {
      const parent = await profile(); const before = await counts();
      const run = () => kind === "quote" ? two.createQuoteForMerchant(a, { clientProfileId: parent.id }, quoteInput) : two.createJobInvoiceForMerchant(a, { clientProfileId: parent.id }, invoiceInput);
      await waited("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], run, async result => {
        assert.deepEqual(result, { kind: "not-found" }); assert.deepEqual(await counts(), before);
      });
    });
    await check(`${kind} create waits and refuses a reassigned document`, async () => {
      const parent = await profile(); const document = await addDocument(a); const before = await counts();
      const run = () => kind === "quote" ? two.createQuoteForMerchant(a, { prospect }, { ...quoteInput, documentUrl: document.documentUrl })
        : two.createJobInvoiceForMerchant(a, { clientProfileId: parent.id }, { ...invoiceInput, documentUrl: document.documentUrl });
      await waited("UPDATE uploaded_files SET merchant_id=$1 WHERE path=$2", [b, document.path], run, async result => {
        assert.deepEqual(result, { kind: "invalid-document" }); assert.deepEqual(await counts(), before);
      });
    });
  }
  for (const [label, sql, value] of [["moved to another business", "UPDATE quotes SET merchant_id=$1 WHERE id=$2", "b"], ["moved to another client", "UPDATE quotes SET client_profile_id=$1 WHERE id=$2", "other"]] as const) {
    await check(`a deposit create waits and refuses a quote ${label}`, async () => {
      const parent = await profile(); const other = await profile(); const quote = await quoteFor(parent.id); const before = await counts();
      await waited(sql, [value === "b" ? b : other.id, quote.id], () => two.createJobInvoiceForMerchant(a, { clientProfileId: parent.id }, { ...invoiceInput, kind: "deposit", quoteId: quote.id }), async result => {
        assert.deepEqual(result, { kind: "quote-not-found" }); assert.deepEqual(await counts(), before);
      });
    });
  }
  for (const [label, sql, value, expected] of [
    ["a committed deposit ownership change", "UPDATE job_invoices SET merchant_id=$1 WHERE id=$2", "b", { kind: "not-found" }],
    ["a committed client ownership change", "UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", "parent-b", { kind: "not-found" }],
    ["a reparented deposit", "UPDATE job_invoices SET client_profile_id=$1 WHERE id=$2", "other", { kind: "not-found" }],
    ["a deposit no longer paid", "UPDATE job_invoices SET status=$1 WHERE id=$2", "voided", { kind: "conflict", reason: "unpaid" }],
  ] as const) {
    await check(`the balance waits and refuses ${label}`, async () => {
      const parent = await profile(); const other = await profile(); const quote = await quoteFor(parent.id); const deposit = await paidDeposit(parent.id, quote.id);
      const before = await counts();
      const args = value === "b" ? [b, deposit] : value === "parent-b" ? [b, parent.id] : value === "other" ? [other.id, deposit] : [value, deposit];
      await waited(sql, args, () => two.createJobBalanceInvoiceForMerchant(deposit, a, false), async result => {
        assert.deepEqual(result, expected); assert.deepEqual(await counts(), before); assert.deepEqual(await events(other.id), []);
      });
    });
  }
  for (const [label, sql, value, expected] of [
    ["a committed invoice ownership change", "UPDATE job_invoices SET merchant_id=$1 WHERE id=$2", "b", { kind: "not-found" }],
    ["a committed client ownership change", "UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", "parent-b", { kind: "not-found" }],
    ["a reparented invoice", "UPDATE job_invoices SET client_profile_id=$1 WHERE id=$2", "other", { kind: "not-found" }],
    ["a newly paid invoice", "UPDATE job_invoices SET status=$1 WHERE id=$2", "paid", { kind: "conflict", reason: "paid" }],
    ["a newly voided invoice", "UPDATE job_invoices SET status=$1 WHERE id=$2", "voided", { kind: "conflict", reason: "voided" }],
  ] as const) {
    await check(`an invoice's delivery record waits and refuses ${label}`, async () => {
      const parent = await profile(); const other = await profile(); const invoice = await invoiceFor(parent.id);
      const before = await rawInvoice(invoice.id); const history = await events(parent.id);
      const args = value === "b" ? [b, invoice.id] : value === "parent-b" ? [b, parent.id] : value === "other" ? [other.id, invoice.id] : [value, invoice.id];
      await waited(sql, args, () => two.recordJobInvoiceDeliveryForMerchant(invoice.id, a, parent.id, { channel: "email" }), async result => {
        assert.deepEqual(result, expected);
        const after = await rawInvoice(invoice.id);
        assert.equal(after.dispatched_at, before.dispatched_at); assert.equal(after.sent_at, before.sent_at);
        assert.deepEqual(await events(parent.id), history); assert.deepEqual(await events(other.id), []);
      });
    });
  }
  await check("a quote's delivery line waits and refuses a committed client ownership change", async () => {
    const parent = await profile(); const quote = await quoteFor(parent.id); const history = await events(parent.id);
    await waited("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], () => two.recordQuoteDeliveryForMerchant(quote.id, a, parent.id, { sent: true, channel: "email" }), async result => {
      assert.equal(result, false); assert.deepEqual(await events(parent.id), history);
    });
  });
  await check("invalid merchants refuse before database casts or mutations", async () => {
    const parent = await profile(); const quote = await quoteFor(parent.id); const deposit = await paidDeposit(parent.id, quote.id); const before = await counts();
    for (const merchant of [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648]) {
      // Called directly: a helper with a default would replace an undefined business.
      assert.deepEqual(await one.createQuoteForMerchant(merchant as any, { clientProfileId: parent.id }, quoteInput), { kind: "not-found" });
      assert.deepEqual(await one.createQuoteForMerchant(merchant as any, { prospect }, quoteInput), { kind: "not-found" });
      assert.deepEqual(await one.createJobInvoiceForMerchant(merchant as any, { clientProfileId: parent.id }, invoiceInput), { kind: "not-found" });
      assert.deepEqual(await one.createJobInvoiceForMerchant(merchant as any, { prospect }, invoiceInput), { kind: "not-found" });
      assert.deepEqual(await one.createJobBalanceInvoiceForMerchant(deposit, merchant as any, false), { kind: "not-found" });
      assert.equal(await one.recordQuoteDeliveryForMerchant(quote.id, merchant as any, parent.id, { sent: true }), false);
      assert.deepEqual(await one.recordJobInvoiceDeliveryForMerchant(deposit, merchant as any, parent.id, {}), { kind: "not-found" });
    }
    assert.deepEqual(await counts(), before);
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S4 TRADES CREATION STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
