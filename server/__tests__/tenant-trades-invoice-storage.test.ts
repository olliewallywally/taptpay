import "./support/test-env";
import { DatabaseStorage, MemStorage } from "../storage";
import { clientProfiles, jobEvents, jobInvoices, quotes } from "@shared/schema";
import { PgDialect } from "drizzle-orm/pg-core";
const id = "44444444-4444-4444-8444-444444444444";
const parentId = "22222222-2222-4222-8222-222222222222";
const quoteId = "33333333-3333-4333-8333-333333333333";
function capture(row: Record<string, unknown> = {}, found = true) {
  const calls: any[] = [];
  const invoice = { id, merchantId: 11, clientProfileId: parentId, kind: "full", status: "dispatched", ...row };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => {
      const call: any = { kind: "select", table, locked: false }; calls.push(call);
      const result: any = Promise.resolve(found ? [table === clientProfiles ? { id: parentId, merchantId: 11, status: "archived" } : invoice] : []);
      result.innerJoin = (joined: any) => { call.joined = joined; return result; };
      result.where = (where: any) => { call.where = where; return result; };
      result.limit = () => result; result.orderBy = () => result;
      result.for = () => { call.locked = true; return result; };
      return result;
    } }),
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table, where, set });
      const result: any = Promise.resolve([{ ...invoice, ...set }]); result.returning = () => result; return result;
    } }) }),
    insert: (table: any) => ({ values: (values: any) => { calls.push({ kind: "insert", table, values }); return Promise.resolve(); } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const query = (where: any) => new PgDialect().sqlToQuery(where);
const writes = (calls: any[]) => calls.filter(call => ["update", "insert"].includes(call.kind));
const OPERATIONS = [
  ["voidJobInvoiceForMerchant", "dispatched", "invoice_voided"],
  ["markJobInvoicePaidExternalForMerchant", "dispatched", "paid_external"],
  ["completeJobInvoiceForMerchant", "paid", "job_completed"],
] as const;

test("invoice and quote reads and lists constrain the row and its current client's ownership", async () => {
  const { storage, calls } = capture();
  await storage.getJobInvoiceForMerchant(id, 11);
  await storage.getJobInvoicesByMerchant(11, { status: "paid", clientProfileId: parentId });
  await storage.getQuotesByMerchant(11, { status: "sent" });
  expect(query(calls[0].where).params).toEqual([id, 11, 11]);
  expect(query(calls[1].where).params).toEqual([11, 11, "paid", parentId]);
  expect(query(calls[2].where).params).toEqual([11, 11, "sent"]);
  for (const call of calls) {
    const table = call.table === quotes ? "quotes" : "job_invoices";
    expect(query(call.where).sql).toContain(`"${table}"."merchant_id"`);
    expect(query(call.where).sql).toContain('"client_profiles"."merchant_id"');
    expect(query(call.where).sql.toLowerCase()).toContain("exists");
  }
});
test.each([["getQuoteDeliveryForMerchant", quotes, quoteId, "quotes"], ["getJobInvoiceDeliveryForMerchant", jobInvoices, id, "job_invoices"]] as const)(
  "%s reads the row and its owned client together in one statement", async (name, table, rowId, sqlName) => {
    const { storage, calls } = capture();
    await storage[name](rowId, 11);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(table); expect(calls[0].joined).toBe(clientProfiles);
    expect(query(calls[0].where).params).toEqual([rowId, 11, 11]);
    expect(query(calls[0].where).sql).toContain(`"${sqlName}"."merchant_id"`);
    expect(query(calls[0].where).sql).toContain('"client_profiles"."merchant_id"');
  });
test.each(OPERATIONS)("%s locks parent then child and commits scoped state with history, including an archived parent", async (name, status, eventType) => {
  const { storage, calls } = capture({ status });
  expect((await storage[name](id, 11, "Synthetic reference")).kind).toBe("ok");
  expect(calls[0].kind).toBe("transaction");
  expect(calls.filter(call => call.locked).map(call => call.table)).toEqual([clientProfiles, jobInvoices]);
  expect(query(calls.find(call => call.locked && call.table === clientProfiles).where).params).toEqual([parentId, 11]);
  const update = calls.find(call => call.kind === "update");
  expect(update.table).toBe(jobInvoices); expect(query(update.where).params).toEqual([id, 11, parentId]);
  for (const field of ["id", "merchantId", "clientProfileId", "token", "amountCents", "kind"]) expect(update.set).not.toHaveProperty(field);
  const event = calls.find(call => call.kind === "insert");
  expect(event.table).toBe(jobEvents);
  expect(event.values).toMatchObject({ merchantId: 11, clientProfileId: parentId, jobInvoiceId: id, eventType });
});
test("each state change sets only its own fixed fields", async () => {
  const set = async (name: string, row: Record<string, unknown>, reference?: string) => {
    const { storage, calls } = capture(row); await storage[name](id, 11, reference);
    return calls.find(call => call.kind === "update").set;
  };
  const voided = await set("voidJobInvoiceForMerchant", {});
  expect(voided).toMatchObject({ status: "voided", voidedAt: expect.any(Date) });
  expect(Object.keys(voided).sort()).toEqual(["status", "updatedAt", "voidedAt"]);
  const paid = await set("markJobInvoicePaidExternalForMerchant", {}, "Cash");
  expect(paid).toMatchObject({ status: "paid_external", paidAt: expect.any(Date), externalPaymentReference: "Cash" });
  expect(Object.keys(paid).sort()).toEqual(["externalPaymentReference", "paidAt", "status", "updatedAt"]);
  expect((await set("markJobInvoicePaidExternalForMerchant", {})).externalPaymentReference).toBeNull();
  const completed = await set("completeJobInvoiceForMerchant", { status: "paid_external" });
  expect(completed).toMatchObject({ completedAt: expect.any(Date) });
  expect(Object.keys(completed).sort()).toEqual(["completedAt", "updatedAt"]);
});
test.each([
  ["voidJobInvoiceForMerchant", {}, false, { kind: "not-found" }],
  ["voidJobInvoiceForMerchant", { status: "paid" }, true, { kind: "conflict", reason: "paid" }],
  ["voidJobInvoiceForMerchant", { status: "paid_external" }, true, { kind: "conflict", reason: "paid" }],
  ["markJobInvoicePaidExternalForMerchant", {}, false, { kind: "not-found" }],
  ["markJobInvoicePaidExternalForMerchant", { status: "paid" }, true, { kind: "conflict", reason: "paid" }],
  ["markJobInvoicePaidExternalForMerchant", { status: "paid_external" }, true, { kind: "conflict", reason: "paid" }],
  ["markJobInvoicePaidExternalForMerchant", { status: "voided" }, true, { kind: "conflict", reason: "voided" }],
  ["completeJobInvoiceForMerchant", { status: "paid" }, false, { kind: "not-found" }],
  ["completeJobInvoiceForMerchant", { status: "paid", kind: "deposit" }, true, { kind: "conflict", reason: "deposit" }],
  ["completeJobInvoiceForMerchant", { status: "dispatched", kind: "deposit" }, true, { kind: "conflict", reason: "deposit" }],
  ["completeJobInvoiceForMerchant", { status: "dispatched" }, true, { kind: "conflict", reason: "unpaid" }],
  ["completeJobInvoiceForMerchant", { status: "voided" }, true, { kind: "conflict", reason: "unpaid" }],
] as const)("%s on %j (found %s) refuses with no mutation or history", async (name, row, found, expected) => {
  const { storage, calls } = capture(row, found);
  expect(await storage[name](id, 11)).toEqual(expected);
  expect(writes(calls)).toEqual([]);
});
test("a voided invoice is voided again and a completed job completed again, each logged again", async () => {
  const voided = capture({ status: "voided", voidedAt: new Date(0) });
  expect((await voided.storage.voidJobInvoiceForMerchant(id, 11)).kind).toBe("ok");
  const completed = capture({ status: "paid", completedAt: new Date(0) });
  expect((await completed.storage.completeJobInvoiceForMerchant(id, 11)).kind).toBe("ok");
  for (const { calls } of [voided, completed]) expect(writes(calls).map(call => call.kind)).toEqual(["update", "insert"]);
});
test.each([[true, "invoice_email_sent"], [false, "invoice_email_failed"]] as const)("a receipt (sent %s) is logged only for the owned invoice of its captured owned client", async (sent, eventType) => {
  const { storage, calls } = capture({ status: "paid_external" });
  expect(await storage.recordJobInvoiceReceiptForMerchant(id, 11, parentId, { sent, reference: "JOB-44444444" })).toBe(true);
  expect(calls.filter(call => call.locked).map(call => call.table)).toEqual([clientProfiles, jobInvoices]);
  expect(query(calls.find(call => call.table === clientProfiles).where).params).toEqual([parentId, 11]);
  expect(query(calls.find(call => call.table === jobInvoices).where).params).toEqual([id, 11, parentId]);
  expect(writes(calls)).toHaveLength(1);
  expect(writes(calls)[0]).toMatchObject({ kind: "insert", table: jobEvents,
    values: { merchantId: 11, clientProfileId: parentId, jobInvoiceId: id, eventType, payload: { reference: "JOB-44444444" } } });
  const missing = capture({}, false);
  expect(await missing.storage.recordJobInvoiceReceiptForMerchant(id, 11, parentId, { sent, reference: "JOB-44444444" })).toBe(false);
  expect(writes(missing.calls)).toEqual([]);
});
test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid merchant %s issues no query", async merchant => {
  const { storage, calls } = capture();
  expect(await storage.getJobInvoiceForMerchant(id, merchant)).toBeUndefined();
  expect(await storage.getJobInvoiceDeliveryForMerchant(id, merchant)).toBeUndefined();
  expect(await storage.getQuoteDeliveryForMerchant(quoteId, merchant)).toBeUndefined();
  expect(await storage.getJobInvoicesByMerchant(merchant)).toEqual([]);
  expect(await storage.getQuotesByMerchant(merchant)).toEqual([]);
  for (const [name] of OPERATIONS) expect(await storage[name](id, merchant)).toEqual({ kind: "not-found" });
  expect(await storage.recordJobInvoiceReceiptForMerchant(id, merchant, parentId, { sent: true, reference: "JOB-44444444" })).toBe(false);
  expect(calls).toEqual([]);
});
test("memory invoice management remains DB-only", async () => {
  const storage = new MemStorage() as any;
  expect(await storage.getJobInvoiceForMerchant(id, 11)).toBeUndefined();
  expect(await storage.getJobInvoiceDeliveryForMerchant(id, 11)).toBeUndefined();
  expect(await storage.getQuoteDeliveryForMerchant(quoteId, 11)).toBeUndefined();
  for (const [name] of OPERATIONS) expect(await storage[name](id, 11)).toEqual({ kind: "not-found" });
  expect(await storage.recordJobInvoiceReceiptForMerchant(id, 11, parentId, { sent: true, reference: "JOB-44444444" })).toBe(false);
});
