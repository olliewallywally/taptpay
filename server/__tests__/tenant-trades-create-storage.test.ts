import "./support/test-env";
import { DatabaseStorage, MemStorage } from "../storage";
import { clientProfiles, jobEvents, jobInvoices, quotes, uploadedFiles } from "@shared/schema";
import { PgDialect } from "drizzle-orm/pg-core";
const parentId = "22222222-2222-4222-8222-222222222222";
const quoteId = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const madeId = "88888888-8888-4888-8888-888888888888";
const documentUrl = "/uploads/invoices/invoice-1700000000000-0123456789abcdef.pdf";
const client = { id: parentId, merchantId: 11, status: "archived", firstName: "Synthetic", email: "owned@example.test" };
const quoteInput = { lineItems: [{ description: "Synthetic", qty: 1, unitPriceCents: 10_000, lineTotalCents: 10_000 }], subtotalCents: 10_000, gstCents: 0, gstMode: null,
  totalCents: 10_000, depositEnabled: false, depositType: null, depositValue: null, depositCents: null, deliveryChannel: "email", validUntil: null, notes: null, documentUrl: null, documentName: null };
const invoiceInput = { kind: "full", amountCents: 5000, deliveryChannel: "email", dueAt: new Date("2026-10-10T00:00:00Z") };
const prospect = { firstName: "Quinn", lastName: "Quick", email: "quinn@example.test", phone: null, siteAddress: "", preferredChannel: "email" };
const INJECTED = { id: "caller-id", merchantId: 99, clientProfileId: "foreign", token: "caller-token", status: "accepted", acceptedAt: new Date(0),
  paidAt: new Date(0), splitPaidCount: 42, windcaveSessionId: "caller-session", scheduleId: "caller-schedule", createdAt: new Date(0) };

/** Rows each table answers with, in order; the last answer repeats. `[]` is a missing or foreign row. */
function capture(rows: Partial<Record<"clients" | "quotes" | "invoices" | "files", any[][]>> = {}) {
  const calls: any[] = [];
  const answers: Record<string, any[][]> = { clients: [[client]], quotes: [[{ id: quoteId, merchantId: 11, clientProfileId: parentId, totalCents: 100_000 }]], invoices: [[]], files: [[{ id: 1 }]], ...rows };
  const seen: Record<string, number> = {};
  const nameOf = (table: any) => table === clientProfiles ? "clients" : table === quotes ? "quotes" : table === jobInvoices ? "invoices" : "files";
  const next = (table: any) => { const name = nameOf(table); const list = answers[name]; const index = Math.min(seen[name] ?? 0, list.length - 1); seen[name] = (seen[name] ?? 0) + 1; return list[index]; };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => {
      const call: any = { kind: "select", table, locked: false }; calls.push(call);
      const result: any = Promise.resolve(next(table));
      result.where = (where: any) => { call.where = where; return result; };
      result.limit = () => result; result.orderBy = () => result;
      result.for = (mode: string) => { call.locked = true; call.mode = mode; return result; };
      return result;
    } }),
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table, where, set });
      const result: any = Promise.resolve([{ id: invoiceId, merchantId: 11, clientProfileId: parentId, ...set }]); result.returning = () => result; return result;
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      calls.push({ kind: "insert", table, values });
      const result: any = Promise.resolve([{ id: table === clientProfiles ? parentId : madeId, ...values }]); result.returning = () => result; return result;
    } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const query = (where: any) => new PgDialect().sqlToQuery(where);
const inserts = (calls: any[], table?: any) => calls.filter(call => call.kind === "insert" && (!table || call.table === table));
const writes = (calls: any[]) => calls.filter(call => ["insert", "update"].includes(call.kind));
const locked = (calls: any[]) => calls.filter(call => call.locked).map(call => [call.table, call.mode]);

test("a quote for a saved client locks the owned client and commits projected input, a server token and its history together", async () => {
  const { storage, calls } = capture();
  const result = await storage.createQuoteForMerchant(11, { clientProfileId: parentId }, { ...quoteInput, ...INJECTED });
  expect(result).toMatchObject({ kind: "ok", quote: { id: madeId }, client: { id: parentId } });
  expect(calls[0].kind).toBe("transaction");
  expect(locked(calls)).toEqual([[clientProfiles, "update"]]);
  expect(query(calls.find(call => call.table === clientProfiles).where).params).toEqual([parentId, 11]);
  const [quote] = inserts(calls, quotes);
  expect(quote.values).toMatchObject({ ...quoteInput, merchantId: 11, clientProfileId: parentId, status: "sent", sentAt: expect.any(Date) });
  expect(quote.values.token).not.toBe("caller-token"); expect(quote.values.token).toMatch(/^[A-Za-z0-9_-]{27}$/);
  for (const field of ["id", "acceptedAt", "paidAt", "splitPaidCount", "windcaveSessionId", "scheduleId", "createdAt"]) expect(quote.values).not.toHaveProperty(field);
  expect(inserts(calls, clientProfiles)).toEqual([]);
  expect(inserts(calls, jobEvents)[0].values).toEqual({ merchantId: 11, clientProfileId: parentId, quoteId: madeId, eventType: "quote_sent" });
});
test("a quote for an unsaved recipient makes its hidden prospect, the quote and its history in one transaction", async () => {
  const { storage, calls } = capture();
  const result = await storage.createQuoteForMerchant(11, { prospect: { ...prospect, merchantId: 99, id: "caller", status: "active", archivedAt: new Date(0) } }, quoteInput);
  expect(result).toMatchObject({ kind: "ok", client: { id: parentId, status: "prospect" } });
  expect(calls.filter(call => call.kind === "transaction")).toHaveLength(1);
  expect(writes(calls).map(call => call.table)).toEqual([clientProfiles, quotes, jobEvents]);
  expect(inserts(calls, clientProfiles)[0].values).toEqual({ ...prospect, merchantId: 11, status: "prospect" });
  expect(inserts(calls, quotes)[0].values).toMatchObject({ merchantId: 11, clientProfileId: parentId });
  expect(calls.some(call => call.kind === "select")).toBe(false);
});
test.each(["createQuoteForMerchant", "createJobInvoiceForMerchant"])("%s refuses a missing or foreign client with nothing written", async name => {
  const { storage, calls } = capture({ clients: [[]] });
  expect(await storage[name](11, { clientProfileId: parentId }, name.includes("Quote") ? quoteInput : invoiceInput)).toEqual({ kind: "not-found" });
  expect(writes(calls)).toEqual([]);
});
test.each(["createQuoteForMerchant", "createJobInvoiceForMerchant"])("%s holds an attached document to the business under a share lock, before any prospect is made", async name => {
  const input = { ...(name.includes("Quote") ? quoteInput : invoiceInput), documentUrl, documentName: "synthetic.pdf" };
  const owned = capture();
  expect((await owned.storage[name](11, { prospect }, input)).kind).toBe("ok");
  const file = owned.calls.find(call => call.table === uploadedFiles);
  expect(file.locked).toBe(true); expect(file.mode).toBe("share"); expect(query(file.where).params).toEqual([documentUrl.slice("/uploads/".length), 11]);
  expect(owned.calls.indexOf(file)).toBeLessThan(owned.calls.indexOf(inserts(owned.calls, clientProfiles)[0]));
  const missing = capture({ files: [[]] });
  expect(await missing.storage[name](11, { prospect }, input)).toEqual({ kind: "invalid-document" });
  expect(writes(missing.calls)).toEqual([]);
  const malformed = capture();
  expect(await malformed.storage[name](11, { prospect }, { ...input, documentUrl: "https://foreign.example/doc.pdf" })).toEqual({ kind: "invalid-document" });
  expect(writes(malformed.calls)).toEqual([]);
});
test("an invoice commits projected input, a server token, the fixed first status and its history together", async () => {
  const { storage, calls } = capture();
  const result = await storage.createJobInvoiceForMerchant(11, { clientProfileId: parentId },
    { ...invoiceInput, jobDetails: "Synthetic job", splitEnabled: true, scheduledSendAt: new Date("2026-10-09T00:00:00Z"), ...INJECTED, kind: "recurring" });
  expect(result).toMatchObject({ kind: "ok", invoice: { id: madeId }, client: { id: parentId } });
  expect(locked(calls)).toEqual([[clientProfiles, "update"]]);
  const [invoice] = inserts(calls, jobInvoices);
  expect(invoice.values).toMatchObject({ merchantId: 11, clientProfileId: parentId, kind: "full", amountCents: 5000, deliveryChannel: "email", jobDetails: "Synthetic job",
    dueAt: invoiceInput.dueAt, scheduledSendAt: new Date("2026-10-09T00:00:00Z"), splitEnabled: true, status: "pending_dispatch", quoteId: null, documentUrl: null, documentName: null });
  expect(invoice.values.token).not.toBe("caller-token"); expect(invoice.values.token).toMatch(/^[A-Za-z0-9_-]{27}$/);
  for (const field of ["id", "paidAt", "splitPaidCount", "windcaveSessionId", "scheduleId", "createdAt", "acceptedAt"]) expect(invoice.values).not.toHaveProperty(field);
  expect(inserts(calls, jobEvents)[0].values).toEqual({ merchantId: 11, clientProfileId: parentId, jobInvoiceId: madeId, eventType: "invoice_sent" });
});
test("a quick invoice makes its hidden prospect, the invoice and its history in one transaction", async () => {
  const { storage, calls } = capture();
  expect((await storage.createJobInvoiceForMerchant(11, { prospect }, invoiceInput)).kind).toBe("ok");
  expect(calls.filter(call => call.kind === "transaction")).toHaveLength(1);
  expect(writes(calls).map(call => call.table)).toEqual([clientProfiles, jobInvoices, jobEvents]);
  expect(inserts(calls, clientProfiles)[0].values).toEqual({ ...prospect, merchantId: 11, status: "prospect" });
});
test("a deposit's quote must be the business's and that client's, held under a share lock through the insert", async () => {
  const { storage, calls } = capture();
  expect((await storage.createJobInvoiceForMerchant(11, { clientProfileId: parentId }, { ...invoiceInput, kind: "deposit", quoteId })).kind).toBe("ok");
  expect(locked(calls)).toEqual([[clientProfiles, "update"], [quotes, "share"]]);
  expect(query(calls.find(call => call.table === quotes).where).params).toEqual([quoteId, 11, parentId]);
  expect(inserts(calls, jobInvoices)[0].values).toMatchObject({ kind: "deposit", quoteId });
  const missing = capture({ quotes: [[]] });
  expect(await missing.storage.createJobInvoiceForMerchant(11, { clientProfileId: parentId }, { ...invoiceInput, kind: "deposit", quoteId })).toEqual({ kind: "quote-not-found" });
  expect(writes(missing.calls)).toEqual([]);
  const quick = capture();
  expect(await quick.storage.createJobInvoiceForMerchant(11, { prospect }, { ...invoiceInput, quoteId })).toEqual({ kind: "quote-not-found" });
  expect(writes(quick.calls)).toEqual([]);
});
describe("the balance", () => {
  const deposit = { id: invoiceId, merchantId: 11, clientProfileId: parentId, kind: "deposit", status: "paid", quoteId, amountCents: 20_000, deliveryChannel: "sms" };
  const billed = [deposit, { id: "other", kind: "deposit", status: "dispatched", quoteId, amountCents: 5_000 }];
  test("locks the client then the deposit, bills what is left on the quote once, and commits it with its history", async () => {
    const { storage, calls } = capture({ invoices: [[deposit], [deposit], billed] });
    const before = Date.now();
    const result = await storage.createJobBalanceInvoiceForMerchant(invoiceId, 11, true);
    expect(result).toMatchObject({ kind: "ok", invoice: { id: madeId } });
    expect(locked(calls)).toEqual([[clientProfiles, "update"], [jobInvoices, "update"], [quotes, "share"]]);
    const selects = calls.filter(call => call.kind === "select");
    expect(query(selects[0].where).params).toEqual([invoiceId, 11]);
    expect(query(selects[1].where).params).toEqual([parentId, 11]);
    expect(query(selects[2].where).params).toEqual([invoiceId, 11, parentId]);
    expect(query(selects[3].where).params).toEqual([quoteId, 11]);
    expect(query(selects[4].where).params).toEqual([11, parentId, quoteId, "voided"]);
    const [balance] = inserts(calls, jobInvoices);
    expect(balance.values).toMatchObject({ merchantId: 11, clientProfileId: parentId, quoteId, kind: "balance", amountCents: 75_000, deliveryChannel: "sms", status: "pending_dispatch", splitEnabled: true });
    expect(balance.values.token).toMatch(/^[A-Za-z0-9_-]{27}$/);
    const due = balance.values.dueAt.getTime(); const expected = new Date(before); expected.setDate(expected.getDate() + 7);
    expect(Math.abs(due - expected.getTime())).toBeLessThan(5_000);
    expect(inserts(calls, jobEvents)[0].values).toEqual({ merchantId: 11, clientProfileId: parentId, jobInvoiceId: madeId, eventType: "balance_sent" });
  });
  test.each([
    ["a missing or foreign deposit", { invoices: [[]] }, { kind: "not-found" }],
    ["a deposit whose client is not the business's", { invoices: [[deposit]], clients: [[]] }, { kind: "not-found" }],
    ["a deposit moved or reparented before its lock", { invoices: [[deposit], []] }, { kind: "not-found" }],
    ["an invoice that is not a deposit", { invoices: [[{ ...deposit, kind: "full" }]] }, { kind: "conflict", reason: "not-deposit" }],
    ["an unpaid deposit", { invoices: [[{ ...deposit, status: "dispatched" }]] }, { kind: "conflict", reason: "unpaid" }],
    ["a deposit on no quote", { invoices: [[{ ...deposit, quoteId: null }]] }, { kind: "conflict", reason: "no-quote" }],
    ["a missing or foreign quote", { invoices: [[deposit]], quotes: [[]] }, { kind: "conflict", reason: "quote-not-found" }],
    ["a balance already made", { invoices: [[deposit], [deposit], [deposit, { id: "made", kind: "balance", status: "dispatched", quoteId, amountCents: 80_000 }]] }, { kind: "conflict", reason: "exists" }],
    ["nothing left to bill", { invoices: [[deposit], [deposit], [deposit, { id: "rest", kind: "full", status: "paid", quoteId, amountCents: 80_000 }]] }, { kind: "conflict", reason: "none-remaining" }],
  ] as const)("refuses %s with nothing written", async (_label, rows, expected) => {
    const { storage, calls } = capture(rows as any);
    expect(await storage.createJobBalanceInvoiceForMerchant(invoiceId, 11, false)).toEqual(expected);
    expect(writes(calls)).toEqual([]);
  });
  test.each(["paid", "paid_external", "deposit_paid"])("is taken for a deposit that is %s", async status => {
    const { storage } = capture({ invoices: [[{ ...deposit, status }], [{ ...deposit, status }], [{ ...deposit, status }]] });
    expect((await storage.createJobBalanceInvoiceForMerchant(invoiceId, 11, false)).kind).toBe("ok");
  });
});
test.each([[true, "quote_dispatched"], [false, "quote_dispatch_failed"]] as const)("a quote's delivery (sent %s) is logged only for the owned quote of its captured owned client", async (sent, eventType) => {
  const { storage, calls } = capture();
  expect(await storage.recordQuoteDeliveryForMerchant(quoteId, 11, parentId, { sent, channel: "email", reason: sent ? undefined : "send_failed" })).toBe(true);
  expect(calls.filter(call => call.locked).map(call => call.table)).toEqual([clientProfiles, quotes]);
  expect(query(calls.find(call => call.table === clientProfiles).where).params).toEqual([parentId, 11]);
  expect(query(calls.find(call => call.table === quotes).where).params).toEqual([quoteId, 11, parentId]);
  expect(writes(calls)).toHaveLength(1);
  expect(writes(calls)[0]).toMatchObject({ kind: "insert", table: jobEvents, values: { merchantId: 11, clientProfileId: parentId, quoteId, eventType, payload: { channel: "email", reason: sent ? undefined : "send_failed" } } });
  for (const rows of [{ clients: [[]] }, { quotes: [[]] }]) {
    const missing = capture(rows as any);
    expect(await missing.storage.recordQuoteDeliveryForMerchant(quoteId, 11, parentId, { sent, channel: "email" })).toBe(false);
    expect(writes(missing.calls)).toEqual([]);
  }
});
describe("an invoice's delivery record", () => {
  const sentInvoice = (row: Record<string, unknown> = {}) => ({ id: invoiceId, merchantId: 11, clientProfileId: parentId, kind: "full", status: "pending_dispatch", ...row });
  test.each([["pending_dispatch", "dispatched"], ["dispatch_failed", "dispatched"], ["dispatched", undefined], ["viewed", undefined], ["balance_due", undefined]] as const)(
    "from %s locks client then invoice and saves the delivery with its history", async (status, next) => {
      const { storage, calls } = capture({ invoices: [[sentInvoice({ status })]] });
      const result = await storage.recordJobInvoiceDeliveryForMerchant(invoiceId, 11, parentId, { channel: "email", messageId: "ignored-for-email" });
      expect(result.kind).toBe("ok");
      expect(calls.filter(call => call.locked).map(call => call.table)).toEqual([clientProfiles, jobInvoices]);
      const update = calls.find(call => call.kind === "update");
      expect(query(update.where).params).toEqual([invoiceId, 11, parentId]);
      expect(update.set).toMatchObject({ dispatchedAt: expect.any(Date), sentAt: expect.any(Date), updatedAt: expect.any(Date) });
      expect(update.set.status).toBe(next); expect(update.set).not.toHaveProperty("whatsappMessageId");
      expect(Object.keys(update.set).sort()).toEqual(next ? ["dispatchedAt", "sentAt", "status", "updatedAt"] : ["dispatchedAt", "sentAt", "updatedAt"]);
      expect(inserts(calls, jobEvents)[0].values).toEqual({ merchantId: 11, clientProfileId: parentId, jobInvoiceId: invoiceId, eventType: "invoice_dispatched", payload: { channel: "email" } });
    });
  test("keeps a WhatsApp message id, and no other channel's", async () => {
    const whatsapp = capture({ invoices: [[sentInvoice()]] });
    await whatsapp.storage.recordJobInvoiceDeliveryForMerchant(invoiceId, 11, parentId, { channel: "whatsapp", messageId: "synthetic-message" });
    expect(whatsapp.calls.find(call => call.kind === "update").set.whatsappMessageId).toBe("synthetic-message");
    const sms = capture({ invoices: [[sentInvoice()]] });
    await sms.storage.recordJobInvoiceDeliveryForMerchant(invoiceId, 11, parentId, { channel: "sms", messageId: "synthetic-message" });
    expect(sms.calls.find(call => call.kind === "update").set).not.toHaveProperty("whatsappMessageId");
  });
  test.each([
    ["a missing or foreign invoice", { invoices: [[]] }, parentId, { kind: "not-found" }],
    ["an invoice of another client than the one captured", { invoices: [[sentInvoice()]] }, "99999999-9999-4999-8999-999999999999", { kind: "not-found" }],
    ["a client no longer the business's", { invoices: [[sentInvoice()]], clients: [[]] }, parentId, { kind: "not-found" }],
    ["a paid invoice", { invoices: [[sentInvoice({ status: "paid" })]] }, parentId, { kind: "conflict", reason: "paid" }],
    ["an invoice paid outside TaptPay", { invoices: [[sentInvoice({ status: "paid_external" })]] }, parentId, { kind: "conflict", reason: "paid" }],
    ["a voided invoice", { invoices: [[sentInvoice({ status: "voided" })]] }, parentId, { kind: "conflict", reason: "voided" }],
  ] as const)("refuses %s with nothing written", async (_label, rows, captured, expected) => {
    const { storage, calls } = capture(rows as any);
    expect(await storage.recordJobInvoiceDeliveryForMerchant(invoiceId, 11, captured, { channel: "email" })).toEqual(expected);
    expect(writes(calls)).toEqual([]);
  });
});
test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid merchant %s issues no query", async merchant => {
  const { storage, calls } = capture();
  expect(await storage.createQuoteForMerchant(merchant, { clientProfileId: parentId }, quoteInput)).toEqual({ kind: "not-found" });
  expect(await storage.createQuoteForMerchant(merchant, { prospect }, quoteInput)).toEqual({ kind: "not-found" });
  expect(await storage.createJobInvoiceForMerchant(merchant, { clientProfileId: parentId }, invoiceInput)).toEqual({ kind: "not-found" });
  expect(await storage.createJobInvoiceForMerchant(merchant, { prospect }, invoiceInput)).toEqual({ kind: "not-found" });
  expect(await storage.createJobBalanceInvoiceForMerchant(invoiceId, merchant, false)).toEqual({ kind: "not-found" });
  expect(await storage.recordQuoteDeliveryForMerchant(quoteId, merchant, parentId, { sent: true })).toBe(false);
  expect(await storage.recordJobInvoiceDeliveryForMerchant(invoiceId, merchant, parentId, {})).toEqual({ kind: "not-found" });
  expect(calls).toEqual([]);
});
test("memory creation and delivery remain DB-only", async () => {
  const storage = new MemStorage() as any;
  await expect(storage.createQuoteForMerchant(11, { clientProfileId: parentId }, quoteInput)).rejects.toThrow("requires database");
  await expect(storage.createJobInvoiceForMerchant(11, { clientProfileId: parentId }, invoiceInput)).rejects.toThrow("requires database");
  await expect(storage.createJobBalanceInvoiceForMerchant(invoiceId, 11, false)).rejects.toThrow("requires database");
  expect(await storage.recordQuoteDeliveryForMerchant(quoteId, 11, parentId, { sent: true })).toBe(false);
  expect(await storage.recordJobInvoiceDeliveryForMerchant(invoiceId, 11, parentId, {})).toEqual({ kind: "not-found" });
});
test("the global quote create is retired", () => {
  expect((new MemStorage() as any).createQuote).toBeUndefined();
  expect((DatabaseStorage.prototype as any).createQuote).toBeUndefined();
});
