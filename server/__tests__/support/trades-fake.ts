/**
 * The trades records, faked (C10 batch 6d; shared since R1-T3 batch (i)). The in-memory storage keeps
 * no trades data (its trades methods are stubs), so the clients, quotes, invoices, recurring invoices
 * and their history live here, in maps, with every read and write recorded, and every quote, invoice
 * or receipt sent. As support/property-fake.ts: what a test with it proves is the routes' decisions;
 * the SQL behind them is PostgreSQL's.
 *
 * Call fakeTrades() in a test after resetTestStorage(); jest restores the spies between tests.
 */
import * as billing from "../../billing-card";
import * as delivery from "../../trades-delivery";
import { nextJobRunDateAfter } from "../../trades-schedule";
import { storage } from "./http-harness";

export const CLIENT = "22222222-2222-4222-8222-222222222222";
export const QUOTE = "33333333-3333-4333-8333-333333333333";
export const INVOICE = "44444444-4444-4444-8444-444444444444";
export const SCHEDULE = "55555555-5555-4555-8555-555555555555";
export const MISSING = "99999999-9999-4999-8999-999999999999";
/** The ids the fake gives what it makes. */
export const MADE_CLIENT = "66666666-6666-4666-8666-666666666666";
export const MADE_QUOTE = "77777777-7777-4777-8777-777777777777";
export const MADE_INVOICE = "88888888-8888-4888-8888-888888888888";
export const MADE_SCHEDULE = "12121212-1212-4121-8121-121212121212";
const DAY = 86_400_000;
export const inDays = (days: number) => new Date(Date.now() + days * DAY);

export interface TradesFake {
  clients: Map<string, any>;
  quotes: Map<string, any>;
  invoices: Map<string, any>;
  schedules: Map<string, any>;
  /** The history logged (createJobEvent), oldest first. */
  events: any[];
  reads: string[];
  writes: string[];
}

export function fakeTrades(): TradesFake {
  const fake: TradesFake = { clients: new Map(), quotes: new Map(), invoices: new Map(), schedules: new Map(), events: [], reads: [], writes: [] };
  const read = (name: string, rows: Map<string, any>) =>
    jest.spyOn(storage as any, name).mockImplementation(async (id: unknown) => {
      fake.reads.push(name);
      return rows.get(id as string);
    });
  read("getClientProfile", fake.clients);
  jest.spyOn(storage, "getClientProfileForMerchant").mockImplementation(async (id, merchantId) => {
    fake.reads.push("getClientProfile"); const row = fake.clients.get(id);
    return row?.merchantId === merchantId ? row : undefined;
  });
  read("getQuote", fake.quotes);
  read("getJobInvoice", fake.invoices);
  // As the scoped SQL: a quote or invoice is the business's only with its current client the business's too.
  const owned = (row: any, merchantId: number) =>
    row?.merchantId === merchantId && fake.clients.get(row.clientProfileId)?.merchantId === merchantId ? row : undefined;
  jest.spyOn(storage, "getQuoteDeliveryForMerchant").mockImplementation(async (id, merchantId) => {
    fake.reads.push("getQuote"); const quote = owned(fake.quotes.get(id), merchantId);
    return quote ? { quote, client: fake.clients.get(quote.clientProfileId) } : undefined;
  });
  jest.spyOn(storage, "getJobInvoiceForMerchant").mockImplementation(async (id, merchantId) => {
    fake.reads.push("getJobInvoice"); return owned(fake.invoices.get(id), merchantId);
  });
  jest.spyOn(storage, "getJobInvoiceDeliveryForMerchant").mockImplementation(async (id, merchantId) => {
    fake.reads.push("getJobInvoice"); const invoice = owned(fake.invoices.get(id), merchantId);
    return invoice ? { invoice, client: fake.clients.get(invoice.clientProfileId) } : undefined;
  });
  const list = (name: string, rows: (...args: any[]) => any[]) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      fake.reads.push(name);
      return rows(...args);
    });
  list("getClientProfilesByMerchant", (merchantId: number) => [...fake.clients.values()].filter(row => row.merchantId === merchantId));
  list("getQuotesByMerchant", (merchantId: number) => [...fake.quotes.values()].filter(row => owned(row, merchantId)));
  list("getJobInvoicesByMerchant", (merchantId: number, opts: { clientProfileId?: string } = {}) =>
    [...fake.invoices.values()].filter((row) => owned(row, merchantId) && (!opts.clientProfileId || row.clientProfileId === opts.clientProfileId)));
  list("getJobSchedulesByMerchant", (merchantId: number) => [...fake.schedules.values()].filter((row) => owned(row, merchantId)));
  jest.spyOn(storage, "getJobScheduleForMerchant").mockImplementation(async (id, merchantId) => {
    fake.reads.push("getJobSchedule"); return owned(fake.schedules.get(id), merchantId);
  });
  // Newest first, as the client's history screen reads it.
  jest.spyOn(storage, "getJobEventsByClientForMerchant").mockImplementation(async (clientId, merchantId, limit = 50) => {
    fake.reads.push("getJobEventsByClient");
    if (fake.clients.get(clientId)?.merchantId !== merchantId) return [];
    return fake.events.filter(row => row.clientProfileId === clientId && row.merchantId === merchantId).reverse().slice(0, limit);
  });
  const write = (name: string, apply: (...args: any[]) => any) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      if (["updateClientProfileForMerchant", "archiveClientProfileForMerchant", "unarchiveClientProfileForMerchant"].includes(name)) {
        const [id, merchantId, updates] = args;
        if (fake.clients.get(id)?.merchantId !== merchantId) return undefined;
        fake.writes.push(name.replace("ForMerchant", "")); return apply(id, updates);
      }
      fake.writes.push(name.replace("ForMerchant", ""));
      return apply(...args);
    });
  write("createClientProfileForMerchant", (merchantId: number, input: any) => {
    const data = { ...input, merchantId };
    const row = { id: MADE_CLIENT, status: "active", ...data };
    fake.clients.set(row.id, row);
    return row;
  });
  // As Drizzle does (mapUpdateSet), an update leaves out every field whose value is undefined.
  write("updateClientProfileForMerchant", (id: string, updates: any) =>
    Object.assign(fake.clients.get(id), Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))));
  write("archiveClientProfileForMerchant", async (id: string) => {
    const row = Object.assign(fake.clients.get(id), { status: "archived", archivedAt: new Date() });
    for (const schedule of fake.schedules.values()) {
      if (schedule.clientProfileId === id && schedule.merchantId === row.merchantId && schedule.status !== "terminated") {
        Object.assign(schedule, { status: "terminated", terminatedAt: new Date() }); fake.writes.push("terminateJobSchedule");
        await storage.createJobEvent({ merchantId: row.merchantId, clientProfileId: id, scheduleId: schedule.id, eventType: "schedule_terminated", payload: { reason: "client_archived" } });
      }
    }
    return row;
  });
  write("unarchiveClientProfileForMerchant", (id: string) => Object.assign(fake.clients.get(id), { status: "active", archivedAt: null }));
  jest.spyOn(storage, "promoteClientProfileForMerchant").mockImplementation(async (id, merchantId) => {
    const row = fake.clients.get(id); if (row?.merchantId !== merchantId) return { kind: "not-found" };
    if (row.status !== "prospect") return { kind: "conflict" };
    fake.writes.push("updateClientProfile"); Object.assign(row, { status: "active", updatedAt: new Date() });
    return { kind: "ok", client: row };
  });
  // The scoped creates (R1-T7 S4b2): the business's own saved client, or a hidden prospect made with
  // the row; then the row and its creation history, recorded as the writes they replace.
  const clientFor = (merchantId: number, ref: any) => {
    if ("clientProfileId" in ref) { const row = fake.clients.get(ref.clientProfileId); return row?.merchantId === merchantId ? row : undefined; }
    const row = { id: MADE_CLIENT, ...ref.prospect, merchantId, status: "prospect" };
    fake.clients.set(row.id, row); fake.writes.push("createClientProfile");
    return row;
  };
  jest.spyOn(storage, "createQuoteForMerchant").mockImplementation(async (merchantId, ref, data) => {
    const client = clientFor(merchantId, ref);
    if (!client) return { kind: "not-found" };
    const quote = { id: MADE_QUOTE, ...data, merchantId, clientProfileId: client.id, token: "made-quote-token", status: "sent", sentAt: new Date() } as any;
    fake.quotes.set(quote.id, quote); fake.writes.push("createQuote");
    await storage.createJobEvent({ merchantId, clientProfileId: client.id, quoteId: quote.id, eventType: "quote_sent" });
    return { kind: "ok", quote, client };
  });
  jest.spyOn(storage, "createJobInvoiceForMerchant").mockImplementation(async (merchantId, ref, data) => {
    // As storage: the client and the linked quote are checked before a prospect is made.
    if ("clientProfileId" in ref && fake.clients.get(ref.clientProfileId)?.merchantId !== merchantId) return { kind: "not-found" };
    if (data.quoteId) {
      const quote = fake.quotes.get(data.quoteId);
      if (!("clientProfileId" in ref) || quote?.merchantId !== merchantId || quote.clientProfileId !== ref.clientProfileId) return { kind: "quote-not-found" };
    }
    const client = clientFor(merchantId, ref);
    const invoice = { id: MADE_INVOICE, ...data, merchantId, clientProfileId: client.id, token: "made-invoice-token", status: "pending_dispatch" } as any;
    fake.invoices.set(invoice.id, invoice); fake.writes.push("createJobInvoice");
    await storage.createJobEvent({ merchantId, clientProfileId: client.id, jobInvoiceId: invoice.id, eventType: "invoice_sent" });
    return { kind: "ok", invoice, client };
  });
  jest.spyOn(storage, "createJobBalanceInvoiceForMerchant").mockImplementation(async (id, merchantId, splitEnabled) => {
    const deposit = owned(fake.invoices.get(id), merchantId);
    if (!deposit) return { kind: "not-found" };
    if (deposit.kind !== "deposit") return { kind: "conflict", reason: "not-deposit" };
    if (!["paid", "paid_external", "deposit_paid"].includes(deposit.status)) return { kind: "conflict", reason: "unpaid" };
    if (!deposit.quoteId) return { kind: "conflict", reason: "no-quote" };
    const quote = fake.quotes.get(deposit.quoteId);
    if (quote?.merchantId !== merchantId) return { kind: "conflict", reason: "quote-not-found" };
    const onQuote = [...fake.invoices.values()].filter((row) => row.merchantId === merchantId && row.clientProfileId === deposit.clientProfileId
      && row.quoteId === deposit.quoteId && row.status !== "voided");
    if (onQuote.some((row) => row.kind === "balance")) return { kind: "conflict", reason: "exists" };
    const balanceCents = Math.max(quote.totalCents - onQuote.reduce((sum, row) => sum + (row.amountCents || 0), 0), 0);
    if (balanceCents <= 0) return { kind: "conflict", reason: "none-remaining" };
    const invoice = { id: MADE_INVOICE, merchantId, clientProfileId: deposit.clientProfileId, quoteId: deposit.quoteId, kind: "balance", amountCents: balanceCents,
      token: "made-balance-token", deliveryChannel: deposit.deliveryChannel, status: "pending_dispatch", dueAt: inDays(7), splitEnabled: !!splitEnabled } as any;
    fake.invoices.set(invoice.id, invoice); fake.writes.push("createJobInvoice");
    await storage.createJobEvent({ merchantId, clientProfileId: deposit.clientProfileId, jobInvoiceId: invoice.id, eventType: "balance_sent" });
    return { kind: "ok", invoice };
  });
  jest.spyOn(storage, "recordQuoteDeliveryForMerchant").mockImplementation(async (id, merchantId, clientProfileId, record) => {
    const quote = owned(fake.quotes.get(id), merchantId);
    if (!quote || quote.clientProfileId !== clientProfileId) return false;
    await storage.createJobEvent({ merchantId, clientProfileId, quoteId: id, eventType: record.sent ? "quote_dispatched" : "quote_dispatch_failed", payload: { channel: record.channel, reason: record.reason } });
    return true;
  });
  jest.spyOn(storage, "recordJobInvoiceDeliveryForMerchant").mockImplementation(async (id, merchantId, clientProfileId, record) => {
    const invoice = owned(fake.invoices.get(id), merchantId);
    if (!invoice || invoice.clientProfileId !== clientProfileId) return { kind: "not-found" };
    if (invoice.status === "voided") return { kind: "conflict", reason: "voided" };
    if (settled(invoice)) return { kind: "conflict", reason: "paid" };
    fake.writes.push("updateJobInvoice");
    Object.assign(invoice, { dispatchedAt: new Date(), sentAt: new Date() }, ["pending_dispatch", "dispatch_failed"].includes(invoice.status) ? { status: "dispatched" } : {});
    await storage.createJobEvent({ merchantId, clientProfileId, jobInvoiceId: id, eventType: "invoice_dispatched", payload: { channel: record.channel } });
    return { kind: "ok", invoice };
  });
  write("createJobInvoice", (data: any) => {
    const row = { id: MADE_INVOICE, ...data };
    fake.invoices.set(row.id, row);
    return row;
  });
  write("updateJobInvoice", (id: string, updates: any) => Object.assign(fake.invoices.get(id), updates));
  // The scoped state changes: refused for a row that is not the business's, or whose state no longer
  // allows it; otherwise the fixed change and its history line, recorded as the writes they replace.
  const settled = (invoice: any) => invoice.status === "paid" || invoice.status === "paid_external";
  const change = (name: string, decide: (invoice: any, reference?: string) => { reason: string } | { set: object; eventType: string }) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      const [id, merchantId, reference] = args as [string, number, string | undefined];
      const invoice = owned(fake.invoices.get(id), merchantId);
      if (!invoice) return { kind: "not-found" };
      const decided = decide(invoice, reference);
      if ("reason" in decided) return { kind: "conflict", reason: decided.reason };
      fake.writes.push("updateJobInvoice"); Object.assign(invoice, decided.set);
      await storage.createJobEvent({ merchantId, clientProfileId: invoice.clientProfileId, jobInvoiceId: id, eventType: decided.eventType });
      return { kind: "ok", invoice };
    });
  change("voidJobInvoiceForMerchant", (invoice) => settled(invoice) ? { reason: "paid" }
    : { set: { status: "voided", voidedAt: new Date() }, eventType: "invoice_voided" });
  change("markJobInvoicePaidExternalForMerchant", (invoice, reference) => invoice.status === "voided" ? { reason: "voided" } : settled(invoice) ? { reason: "paid" }
    : { set: { status: "paid_external", paidAt: new Date(), externalPaymentReference: reference ?? null }, eventType: "paid_external" });
  change("completeJobInvoiceForMerchant", (invoice) => invoice.kind === "deposit" ? { reason: "deposit" } : !settled(invoice) ? { reason: "unpaid" }
    : { set: { completedAt: new Date() }, eventType: "job_completed" });
  jest.spyOn(storage, "recordJobInvoiceReceiptForMerchant").mockImplementation(async (id, merchantId, clientProfileId, receipt) => {
    const invoice = owned(fake.invoices.get(id), merchantId);
    if (!invoice || invoice.clientProfileId !== clientProfileId) return false;
    await storage.createJobEvent({ merchantId, clientProfileId, jobInvoiceId: id, eventType: receipt.sent ? "invoice_email_sent" : "invoice_email_failed", payload: { reference: receipt.reference } });
    return true;
  });
  // The scoped recurring-invoice writes (R1-T7 S4c), recorded as the writes they replace: the
  // business's own unarchived client for a create; the row and its current client for the others.
  jest.spyOn(storage, "createJobScheduleForMerchant").mockImplementation(async (clientProfileId, merchantId, data) => {
    const client = fake.clients.get(clientProfileId);
    if (client?.merchantId !== merchantId) return { kind: "not-found" };
    if (client.status === "archived") return { kind: "conflict", reason: "archived" };
    const schedule = { id: MADE_SCHEDULE, ...data, merchantId, clientProfileId, status: "active", nextRunDate: data.startDate } as any;
    fake.schedules.set(schedule.id, schedule); fake.writes.push("createJobSchedule");
    await storage.createJobEvent({ merchantId, clientProfileId, scheduleId: schedule.id, eventType: "schedule_created", payload: { amountCents: schedule.amountCents, frequency: schedule.frequency } });
    return { kind: "ok", schedule };
  });
  jest.spyOn(storage, "updateJobScheduleForMerchant").mockImplementation(async (id, merchantId, changes) => {
    const schedule = owned(fake.schedules.get(id), merchantId);
    if (!schedule) return { kind: "not-found" };
    if (schedule.status === "terminated") return { kind: "conflict", reason: "terminated" };
    // As storage: a resume's next date comes from the row as it is now, not from the route's read.
    const resumed = schedule.status === "paused" && changes.status === "active"
      ? { nextRunDate: nextJobRunDateAfter(new Date(schedule.nextRunDate), changes.frequency ?? schedule.frequency, new Date(schedule.startDate), new Date()) } : {};
    fake.writes.push("updateJobSchedule");
    Object.assign(schedule, Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)), resumed);
    await storage.createJobEvent({ merchantId, clientProfileId: schedule.clientProfileId, scheduleId: id,
      eventType: changes.status === "paused" ? "schedule_paused" : changes.status === "active" ? "schedule_resumed" : "schedule_updated", payload: changes });
    return { kind: "ok", schedule };
  });
  jest.spyOn(storage, "terminateJobScheduleForMerchant").mockImplementation(async (id, merchantId) => {
    const schedule = owned(fake.schedules.get(id), merchantId);
    if (!schedule) return { kind: "not-found" };
    fake.writes.push("terminateJobSchedule"); Object.assign(schedule, { status: "terminated", terminatedAt: new Date() });
    await storage.createJobEvent({ merchantId, clientProfileId: schedule.clientProfileId, scheduleId: id, eventType: "schedule_terminated" });
    return { kind: "ok", schedule };
  });
  write("updateJobSchedule", (id: string, updates: any) => Object.assign(fake.schedules.get(id), updates));
  write("terminateJobSchedule", (id: string) => Object.assign(fake.schedules.get(id), { status: "terminated", terminatedAt: new Date() }));
  write("createJobEvent", (data: any) => {
    const row = { id: `event-${fake.events.length + 1}`, createdAt: new Date(), ...data };
    fake.events.push(row);
    return row;
  });
  jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
  const send = (name: string, answer: (...args: any[]) => any) =>
    jest.spyOn(delivery as any, name).mockImplementation(async (...args: any[]) => {
      fake.writes.push(name.replace("ForMerchant", ""));
      return answer(...args);
    });
  send("sendTradeQuoteForMerchant", () => ({ sent: true, channel: "email" }));
  // The public quote acceptance's and the cron's sender, and the signed-in business's.
  send("resendTradeInvoice", (id: string) => ({ sent: true, channel: "email", invoice: fake.invoices.get(id) }));
  send("resendTradeInvoiceForMerchant", (id: string) => ({ sent: true, channel: "email", invoice: fake.invoices.get(id) }));
  send("sendTradePaymentInvoice", () => 1);
  send("sendTradePaymentInvoiceForMerchant", () => 1);
  return fake;
}

/** A business with one client, one accepted quote, one sent invoice and one weekly recurring invoice, all its own. */
export function seedTrades(fake: TradesFake, merchantId: number, state: { client?: object; quote?: object; invoice?: object; schedule?: object } = {}) {
  fake.clients.set(CLIENT, {
    id: CLIENT, merchantId, firstName: "Cal", lastName: "Client", email: "cal@example.test", phone: null,
    siteAddress: "1 Site Road", preferredChannel: "email", status: "active", ...state.client,
  });
  fake.quotes.set(QUOTE, {
    id: QUOTE, merchantId, clientProfileId: CLIENT, token: "quote-token", status: "accepted",
    lineItems: [{ description: "Rewire the kitchen", qty: 1, unitPriceCents: 100_000, lineTotalCents: 100_000 }],
    subtotalCents: 100_000, gstCents: 0, gstMode: null, totalCents: 100_000,
    depositEnabled: true, depositType: "percent", depositValue: 20, depositCents: 20_000, deliveryChannel: "email",
    createdAt: new Date(), ...state.quote,
  });
  fake.invoices.set(INVOICE, {
    id: INVOICE, merchantId, clientProfileId: CLIENT, quoteId: null, kind: "full", amountCents: 50_000,
    token: "invoice-token", deliveryChannel: "email", status: "dispatched", dueAt: inDays(7), ...state.invoice,
  });
  fake.schedules.set(SCHEDULE, {
    id: SCHEDULE, merchantId, clientProfileId: CLIENT, amountCents: 50_000, frequency: "weekly", deliveryChannel: "email",
    startDate: new Date(Date.now() - 70 * DAY), nextRunDate: inDays(3), status: "active", ...state.schedule,
  });
}
