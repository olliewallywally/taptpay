import "./support/test-env";

import request from "supertest";
import * as billing from "../billing-card";
import * as tradesCron from "../trades-cron";
import * as delivery from "../trades-delivery";
import { ROUTE_POLICY } from "../route-policy";
import { bearer, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage, useFakeClock } from "./support/http-harness";

/**
 * C10 route review, batch 6d (the trades routes), 2026-09-27. The in-memory storage keeps no
 * trades data (its trades methods are stubs), so the clients, quotes, invoices and recurring
 * invoices live in a small fake here, as in c10-batch-6c-property.test.ts. It records every read
 * and write, and every quote, invoice or receipt sent.
 */

const CLIENT = "22222222-2222-4222-8222-222222222222";
const QUOTE = "33333333-3333-4333-8333-333333333333";
const INVOICE = "44444444-4444-4444-8444-444444444444";
const SCHEDULE = "55555555-5555-4555-8555-555555555555";
const MISSING = "99999999-9999-4999-8999-999999999999";
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const inDays = (days: number) => new Date(Date.now() + days * DAY);

interface TradesFake {
  clients: Map<string, any>;
  quotes: Map<string, any>;
  invoices: Map<string, any>;
  schedules: Map<string, any>;
  reads: string[];
  writes: string[];
}

function fakeTrades(): TradesFake {
  const fake: TradesFake = { clients: new Map(), quotes: new Map(), invoices: new Map(), schedules: new Map(), reads: [], writes: [] };
  const read = (name: string, rows: Map<string, any>) =>
    jest.spyOn(storage as any, name).mockImplementation(async (id: unknown) => {
      fake.reads.push(name);
      return rows.get(id as string);
    });
  read("getClientProfile", fake.clients);
  read("getQuote", fake.quotes);
  read("getJobInvoice", fake.invoices);
  read("getJobSchedule", fake.schedules);
  const list = (name: string, rows: (...args: any[]) => any[]) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      fake.reads.push(name);
      return rows(...args);
    });
  list("getClientProfilesByMerchant", () => [...fake.clients.values()]);
  list("getQuotesByMerchant", () => [...fake.quotes.values()]);
  list("getJobInvoicesByMerchant", (_merchantId: number, opts: { clientProfileId?: string } = {}) =>
    [...fake.invoices.values()].filter((row) => !opts.clientProfileId || row.clientProfileId === opts.clientProfileId));
  list("getJobSchedulesByMerchant", () => [...fake.schedules.values()]);
  list("getJobEventsByClient", () => []);
  const write = (name: string, apply: (...args: any[]) => any) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      fake.writes.push(name);
      return apply(...args);
    });
  write("createClientProfile", (data: any) => {
    const row = { id: "66666666-6666-4666-8666-666666666666", status: "active", ...data };
    fake.clients.set(row.id, row);
    return row;
  });
  write("updateClientProfile", (id: string, updates: any) => Object.assign(fake.clients.get(id), updates));
  write("archiveClientProfile", (id: string) => Object.assign(fake.clients.get(id), { status: "archived", archivedAt: new Date() }));
  write("unarchiveClientProfile", (id: string) => Object.assign(fake.clients.get(id), { status: "active", archivedAt: null }));
  write("createQuote", (data: any) => {
    const row = { id: "77777777-7777-4777-8777-777777777777", ...data };
    fake.quotes.set(row.id, row);
    return row;
  });
  write("createJobInvoice", (data: any) => {
    const row = { id: "88888888-8888-4888-8888-888888888888", ...data };
    fake.invoices.set(row.id, row);
    return row;
  });
  write("updateJobInvoice", (id: string, updates: any) => Object.assign(fake.invoices.get(id), updates));
  write("createJobSchedule", (data: any) => {
    const row = { id: "12121212-1212-4121-8121-121212121212", status: "active", ...data };
    fake.schedules.set(row.id, row);
    return row;
  });
  write("updateJobSchedule", (id: string, updates: any) => Object.assign(fake.schedules.get(id), updates));
  write("terminateJobSchedule", (id: string) => Object.assign(fake.schedules.get(id), { status: "terminated", terminatedAt: new Date() }));
  write("createJobEvent", () => ({}));
  jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
  const send = (name: string, answer: (...args: any[]) => any) =>
    jest.spyOn(delivery as any, name).mockImplementation(async (...args: any[]) => {
      fake.writes.push(name);
      return answer(...args);
    });
  send("sendTradeQuote", () => ({ sent: true, channel: "email" }));
  send("resendTradeInvoice", (id: string) => ({ sent: true, channel: "email", invoice: fake.invoices.get(id) }));
  send("sendTradePaymentInvoice", () => 1);
  return fake;
}

/** A business with one client, one accepted quote, one sent invoice and one weekly recurring invoice, all its own. */
function seed(fake: TradesFake, merchantId: number, state: { client?: object; quote?: object; invoice?: object; schedule?: object } = {}) {
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

beforeEach(() => {
  resetTestStorage();
  jest.restoreAllMocks();
});

type Method = "get" | "post" | "put" | "delete";
type Call = [label: string, method: Method, address: (id: string) => string, body: Record<string, unknown> | undefined];

/** The routes that address one client, quote, invoice or recurring invoice by its id in the path. */
const BY_ID: Call[] = [
  ["GET /api/trades/clients/:id", "get", (id) => `/api/trades/clients/${id}`, undefined],
  ["PUT /api/trades/clients/:id", "put", (id) => `/api/trades/clients/${id}`, { firstName: "Callum" }],
  ["POST /api/trades/clients/:id/archive", "post", (id) => `/api/trades/clients/${id}/archive`, undefined],
  ["POST /api/trades/clients/:id/unarchive", "post", (id) => `/api/trades/clients/${id}/unarchive`, undefined],
  ["POST /api/trades/clients/:id/promote", "post", (id) => `/api/trades/clients/${id}/promote`, undefined],
  ["GET /api/trades/clients/:id/events", "get", (id) => `/api/trades/clients/${id}/events`, undefined],
  ["GET /api/trades/quotes/:id/pdf", "get", (id) => `/api/trades/quotes/${id}/pdf`, undefined],
  ["POST /api/trades/invoices/:id/send-balance", "post", (id) => `/api/trades/invoices/${id}/send-balance`, { splitEnabled: false }],
  ["POST /api/trades/invoices/:id/mark-paid-external", "post", (id) => `/api/trades/invoices/${id}/mark-paid-external`, { externalPaymentReference: "Cash" }],
  ["POST /api/trades/invoices/:id/complete", "post", (id) => `/api/trades/invoices/${id}/complete`, undefined],
  ["POST /api/trades/invoices/:id/void", "post", (id) => `/api/trades/invoices/${id}/void`, undefined],
  ["PUT /api/trades/schedules/:id", "put", (id) => `/api/trades/schedules/${id}`, { status: "paused" }],
  ["DELETE /api/trades/schedules/:id", "delete", (id) => `/api/trades/schedules/${id}`, undefined],
];
const idOf = (label: string) =>
  label.includes("/schedules/") ? SCHEDULE : label.includes("/invoices/") ? INVOICE : label.includes("/quotes/") ? QUOTE : CLIENT;

async function send(app: any, principal: { token: string }, method: Method, address: string, body?: Record<string, unknown>) {
  let pending = request(app)[method](address).set(bearer(principal));
  if (body) pending = pending.send(body);
  return pending;
}

async function ownerWithTrades(state?: Parameters<typeof seed>[2]) {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const fake = fakeTrades();
  seed(fake, owner.merchantId, state);
  return { app, owner, fake };
}

describe("the three trades routes no screen calls are removed (owner decision 2026-09-27)", () => {
  const RETIRED: Array<[string, Method, string]> = [
    ["GET /api/trades/quotes/:id", "get", `/api/trades/quotes/${QUOTE}`],
    ["POST /api/trades/quotes/:id/resend", "post", `/api/trades/quotes/${QUOTE}/resend`],
    ["POST /api/trades/invoices/:id/resend", "post", `/api/trades/invoices/${INVOICE}/resend`],
  ];

  it.each(RETIRED)("%s is registered nowhere", (key) => {
    expect(ROUTE_POLICY[key]).toBeUndefined();
  });

  it.each(RETIRED)("%s answers the owner as an unknown address, and reads and sends nothing", async (_key, method, address) => {
    const { app, owner, fake } = await ownerWithTrades({ quote: { status: "sent" } });

    const res = await request(app)[method](address).set(bearer(owner));

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/json/);
    expect(fake.reads).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it("the routes that stay beside them still answer the owner", async () => {
    const { app, owner } = await ownerWithTrades();

    expect((await request(app).get("/api/trades/quotes").set(bearer(owner))).status).toBe(200);
    const pdf = await request(app).get(`/api/trades/quotes/${QUOTE}/pdf`).set(bearer(owner));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect((await request(app).get("/api/trades/invoices").set(bearer(owner))).status).toBe(200);
    expect((await request(app).post(`/api/trades/invoices/${INVOICE}/void`).set(bearer(owner))).status).toBe(200);
  });
});

/** The trades routes already answer another business's record as a missing one: kept. */
describe("another business's trades record is not found, like a missing one", () => {
  it.each(BY_ID)("%s: another business gets the missing record's answer, and nothing changes", async (label, method, address, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const fake = fakeTrades();
    seed(fake, owner.merchantId, { client: { status: "prospect" }, invoice: { status: "paid" } });

    const missing = await send(app, other, method, address(MISSING), body);
    const theirs = await send(app, other, method, address(idOf(label)), body);

    expect(missing.status).toBe(404);
    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(missing.body);
    expect(fake.writes).toEqual([]);
  });
});

/** A malformed id reached PostgreSQL, whose uuid cast throws (22P02): the route answered 500. */
describe("trades ids are read strictly", () => {
  it.each(BY_ID)("%s: a malformed id is refused (400) before anything is read", async (_label, method, address, body) => {
    const { app, owner, fake } = await ownerWithTrades();

    const res = await send(app, owner, method, address("not-a-uuid"), body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid id" });
    expect(fake.reads).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it.each([
    ["a malformed client", "clientProfileId=not-a-uuid"],
    ["two clients", `clientProfileId=${CLIENT}&clientProfileId=${MISSING}`],
  ])("the invoice list refuses %s as its filter (400) before reading", async (_label, query) => {
    const { app, owner, fake } = await ownerWithTrades();

    const res = await request(app).get(`/api/trades/invoices?${query}`).set(bearer(owner));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid clientProfileId" });
    expect(fake.reads).toEqual([]);
  });

  it("the invoice list still filters by a well-formed client (the client page's request)", async () => {
    const { app, owner } = await ownerWithTrades();

    const res = await request(app).get(`/api/trades/invoices?clientProfileId=${CLIENT}`).set(bearer(owner));

    expect(res.status).toBe(200);
    expect(storage.getJobInvoicesByMerchant).toHaveBeenCalledWith(owner.merchantId, { status: undefined, clientProfileId: CLIENT });
  });

  it.each([
    ["quote", "/api/trades/quotes", "getQuotesByMerchant"],
    ["invoice", "/api/trades/invoices", "getJobInvoicesByMerchant"],
  ])("the %s list takes its status filter only as text: a repeated one is not passed on", async (_label, address, method) => {
    const { app, owner } = await ownerWithTrades();

    const res = await request(app).get(`${address}?status=sent&status=viewed`).set(bearer(owner));

    expect(res.status).toBe(200);
    expect((storage as any)[method]).toHaveBeenCalledWith(owner.merchantId, expect.objectContaining({ status: undefined }));
  });

  it("the quote list still filters by one status", async () => {
    const { app, owner } = await ownerWithTrades();

    expect((await request(app).get("/api/trades/quotes?status=sent").set(bearer(owner))).status).toBe(200);
    expect(storage.getQuotesByMerchant).toHaveBeenCalledWith(owner.merchantId, { status: "sent" });
  });
});

/** Rules the screens already keep: each was taken by the server (200) when called directly. */
describe("the trades screens' state rules hold on the server", () => {
  it.each([["paid"], ["paid_external"]])("an invoice %s cannot be voided (409), and stays as it was", async (status) => {
    const { app, owner, fake } = await ownerWithTrades({ invoice: { status } });

    const res = await request(app).post(`/api/trades/invoices/${INVOICE}/void`).set(bearer(owner));

    expect(res.status).toBe(409);
    expect(fake.invoices.get(INVOICE).status).toBe(status);
    expect(fake.writes).toEqual([]);
  });

  it.each([
    ["voided", "This invoice was voided"],
    ["paid", "This invoice is already paid"],
    ["paid_external", "This invoice is already paid"],
  ])("an invoice %s cannot be marked paid outside TaptPay (409): nothing changes and no receipt is emailed", async (status, message) => {
    const { app, owner, fake } = await ownerWithTrades({ invoice: { status } });

    const res = await request(app).post(`/api/trades/invoices/${INVOICE}/mark-paid-external`).set(bearer(owner)).send({ externalPaymentReference: "Cash" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message });
    expect(fake.invoices.get(INVOICE).status).toBe(status);
    expect(fake.writes).toEqual([]);
  });

  it.each([["active"], ["paused"]])("a cancelled recurring invoice cannot be set %s (409), and nothing changes", async (status) => {
    const { app, owner, fake } = await ownerWithTrades({ schedule: { status: "terminated" } });

    const res = await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status });

    expect(res.status).toBe(409);
    expect(fake.schedules.get(SCHEDULE).status).toBe("terminated");
    expect(fake.writes).toEqual([]);
  });

  it("a recurring invoice is cancelled only by DELETE, which records when (PUT refuses 'terminated', 400)", async () => {
    const { app, owner, fake } = await ownerWithTrades();

    const put = await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "terminated" });
    expect(put.status).toBe(400);
    expect(fake.writes).toEqual([]);

    const del = await request(app).delete(`/api/trades/schedules/${SCHEDULE}`).set(bearer(owner));
    expect(del.status).toBe(200);
    expect(fake.schedules.get(SCHEDULE)).toMatchObject({ status: "terminated", terminatedAt: expect.any(Date) });
  });

  it("what the screens do is unchanged: pause, resume, cancel a sent invoice, mark one received, complete a paid job", async () => {
    const { app, owner, fake } = await ownerWithTrades();

    expect((await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "paused" })).status).toBe(200);
    expect((await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "active" })).status).toBe(200);
    const paid = await request(app).post(`/api/trades/invoices/${INVOICE}/mark-paid-external`).set(bearer(owner)).send({ externalPaymentReference: "Cash" });
    expect(paid.status).toBe(200);
    expect(fake.invoices.get(INVOICE)).toMatchObject({ status: "paid_external", externalPaymentReference: "Cash" });
    expect(fake.writes.filter((name) => name === "sendTradePaymentInvoice")).toHaveLength(1);
    expect((await request(app).post(`/api/trades/invoices/${INVOICE}/complete`).set(bearer(owner))).status).toBe(200);

    fake.invoices.set(INVOICE, { ...fake.invoices.get(INVOICE), status: "dispatched", completedAt: null });
    expect((await request(app).post(`/api/trades/invoices/${INVOICE}/void`).set(bearer(owner))).status).toBe(200);
    expect(fake.invoices.get(INVOICE).status).toBe("voided");
  });
});

/**
 * Every "mark received" button sends { externalPaymentReference: null } when no reference is typed
 * (the desktop trades terminal always does), and the schemas took only a string or nothing: the
 * server refused it (400), on both verticals.
 */
describe("marking an invoice received without a reference, as the screens send it", () => {
  it("trades: the screens' null reference is taken as none (200), and the receipt is emailed once", async () => {
    const { app, owner, fake } = await ownerWithTrades();

    const res = await request(app).post(`/api/trades/invoices/${INVOICE}/mark-paid-external`).set(bearer(owner)).send({ externalPaymentReference: null });

    expect(res.status).toBe(200);
    expect(fake.invoices.get(INVOICE)).toMatchObject({ status: "paid_external", externalPaymentReference: null });
    expect(fake.writes.filter((name) => name === "sendTradePaymentInvoice")).toHaveLength(1);
  });

  it("property: the screens' null reference is taken as none (200)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const RENT_INVOICE = "abababab-abab-4bab-8bab-abababababab";
    jest.spyOn(storage, "getInvoiceRentRequest").mockResolvedValue({
      id: RENT_INVOICE, merchantId: owner.merchantId, tenantProfileId: CLIENT, amountCents: 50_000, status: "dispatched",
    } as any);
    const update = jest.spyOn(storage, "updateInvoiceRentRequest").mockImplementation(async (id: string, updates: any) => ({ id, ...updates }) as any);
    jest.spyOn(storage, "logTransactionEvent").mockResolvedValue({} as any);

    const res = await request(app).post(`/api/property/invoices/${RENT_INVOICE}/mark-paid-external`).set(bearer(owner)).send({ externalPaymentReference: null });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(RENT_INVOICE, expect.objectContaining({ status: "paid_external", externalPaymentReference: null }));
  });

  it.each([
    ["a reference that is not text", { externalPaymentReference: 42 }],
    ["a reference over 200 characters", { externalPaymentReference: "x".repeat(201) }],
  ])("trades: %s is still refused (400), and nothing changes", async (_label, body) => {
    const { app, owner, fake } = await ownerWithTrades();

    const res = await request(app).post(`/api/trades/invoices/${INVOICE}/mark-paid-external`).set(bearer(owner)).send(body);

    expect(res.status).toBe(400);
    expect(fake.writes).toEqual([]);
  });
});

/**
 * The invoice create took any kind. A "balance" is made by send-balance, which checks the deposit
 * is paid and bills only what is left, once; a "recurring" one is made by the cron. A deposit's
 * quote had only to be the business's, not the chosen client's.
 */
describe("the invoice create makes only what the screens send", () => {
  const invoice = (change: Record<string, unknown>) => ({
    clientProfileId: CLIENT, amountCents: 50_000, deliveryChannel: "email", dueAt: inDays(7).toISOString(), kind: "full", ...change,
  });

  it.each([["balance"], ["recurring"]])("a %s invoice is refused (400): nothing is made or sent", async (kind) => {
    const { app, owner, fake } = await ownerWithTrades();

    const res = await request(app).post("/api/trades/invoices").set(bearer(owner)).send(invoice({ kind, quoteId: QUOTE }));

    expect(res.status).toBe(400);
    expect(fake.writes).toEqual([]);
  });

  it("a deposit on another client's quote is refused as a quote not found (404): nothing is made or sent", async () => {
    const { app, owner, fake } = await ownerWithTrades();
    const OTHER_CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const THEIR_QUOTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    fake.clients.set(OTHER_CLIENT, { ...fake.clients.get(CLIENT), id: OTHER_CLIENT, firstName: "Olive" });
    fake.quotes.set(THEIR_QUOTE, { ...fake.quotes.get(QUOTE), id: THEIR_QUOTE, clientProfileId: OTHER_CLIENT });

    const res = await request(app).post("/api/trades/invoices").set(bearer(owner))
      .send(invoice({ kind: "deposit", amountCents: 20_000, quoteId: THEIR_QUOTE }));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Quote not found" });
    expect(fake.writes).toEqual([]);
  });

  it("what the screens send is made: a full invoice, a quick invoice, and a deposit on the client's own quote", async () => {
    const { app, owner, fake } = await ownerWithTrades();

    const full = await request(app).post("/api/trades/invoices").set(bearer(owner)).send(invoice({ splitEnabled: false }));
    expect(full.status).toBe(201);
    const quick = await request(app).post("/api/trades/invoices").set(bearer(owner)).send({
      recipient: { name: "Quinn Quick", email: "quinn@example.test", channel: "email" },
      amountCents: 12_000, deliveryChannel: "email", dueAt: inDays(7).toISOString(), kind: "full", splitEnabled: true,
    });
    expect(quick.status).toBe(201);
    const deposit = await request(app).post("/api/trades/invoices").set(bearer(owner))
      .send(invoice({ kind: "deposit", amountCents: 20_000, quoteId: QUOTE }));
    expect(deposit.status).toBe(201);
    expect(fake.invoices.get(deposit.body.id)).toMatchObject({ kind: "deposit", quoteId: QUOTE, clientProfileId: CLIENT });
  });
});

/** send-balance read splitEnabled from the raw body: "yes" turned splitting on. */
describe("sending the balance takes only its own switch", () => {
  const PAID_DEPOSIT = { invoice: { kind: "deposit", status: "paid", quoteId: QUOTE, amountCents: 20_000 } };

  it.each([
    ["a switch that is not true or false", { splitEnabled: "yes" }],
    ["a field it does not take", { splitEnabled: false, amountCents: 1 }],
  ])("refuses %s (400): no balance is made or sent", async (_label, body) => {
    const { app, owner, fake } = await ownerWithTrades(PAID_DEPOSIT);

    const res = await request(app).post(`/api/trades/invoices/${INVOICE}/send-balance`).set(bearer(owner)).send(body);

    expect(res.status).toBe(400);
    expect(fake.writes).toEqual([]);
  });

  it.each([
    ["the phone's split balance", { splitEnabled: true }, true],
    ["the desktop's balance", { splitEnabled: false }, false],
    ["no body", undefined, false],
  ])("sends %s: what is left of the quote", async (_label, body, split) => {
    const { app, owner, fake } = await ownerWithTrades(PAID_DEPOSIT);

    const res = await send(app, owner, "post", `/api/trades/invoices/${INVOICE}/send-balance`, body);

    expect(res.status).toBe(201);
    expect(fake.invoices.get(res.body.id)).toMatchObject({ kind: "balance", amountCents: 80_000, splitEnabled: split });
  });
});

/**
 * The GST settings change the tax on every quote and invoice. The settings page shows them to a
 * teammate greyed out ("Business details are managed by the account owner"), but the server took
 * a teammate's change.
 */
describe("the trades GST settings are the owner's to change", () => {
  it("a teammate's change is refused (403), and the settings stay as they were", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const res = await request(app).put("/api/trades/gst-settings").set(bearer(member)).send({ gstRegistered: true, tradeGstMode: "exclusive" });

    expect(res.status).toBe(403);
    const merchant = await storage.getMerchant(owner.merchantId);
    expect(merchant?.gstRegistered ?? false).toBe(false);
    expect(merchant?.tradeGstMode ?? "inclusive").toBe("inclusive");
  });

  it("the owner still changes them, and a teammate still reads them", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const changed = await request(app).put("/api/trades/gst-settings").set(bearer(owner)).send({ gstRegistered: true, tradeGstMode: "exclusive" });
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ gstRegistered: true, tradeGstMode: "exclusive" });
    const read = await request(app).get("/api/trades/gst-settings").set(bearer(member));
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ gstRegistered: true, tradeGstMode: "exclusive" });
  });

  it("a teammate keeps every other trades action: an invoice, a recurring invoice, marking one received, cancelling one", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const fake = fakeTrades();
    seed(fake, owner.merchantId);

    const made = await request(app).post("/api/trades/invoices").set(bearer(member))
      .send({ clientProfileId: CLIENT, amountCents: 50_000, deliveryChannel: "email", dueAt: inDays(7).toISOString(), kind: "full" });
    expect(made.status).toBe(201);
    expect((await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(bearer(member)).send({ status: "paused" })).status).toBe(200);
    expect((await request(app).post(`/api/trades/invoices/${INVOICE}/mark-paid-external`).set(bearer(member)).send({ externalPaymentReference: "Cash" })).status).toBe(200);
    expect((await request(app).post(`/api/trades/invoices/${made.body.id}/void`).set(bearer(member))).status).toBe(200);
    expect((await request(app).put("/api/trades/reminder-settings").set(bearer(member)).send({ tradeRemindersEnabled: false })).status).toBe(200);
  });
});

/**
 * Pausing left a recurring invoice's next date where it was, so resuming billed every period it
 * missed, one invoice per cron run, most already overdue. The owner chose to skip the paused time,
 * as for rent (docs/decisions/2026-09-27-c10-batch-6d-owner-answers.md, answer 2).
 */
describe("resuming a paused recurring invoice skips the paused time (owner decision 2026-09-27)", () => {
  async function resume(schedule: object) {
    const { app, owner, fake } = await ownerWithTrades({ schedule: { status: "paused", ...schedule } });
    const before = new Date();
    const res = await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "active" });
    return { res, fake, before };
  }

  it("moves a weekly one's next date to its first date after the resume, on the same cycle", async () => {
    const old = new Date(Date.now() - 35 * DAY - 3_600_000);
    const { res, fake, before } = await resume({ nextRunDate: old, startDate: new Date(old.getTime() - 2 * WEEK) });

    expect(res.status).toBe(200);
    const next: Date = fake.schedules.get(SCHEDULE).nextRunDate;
    expect(next.getTime()).toBeGreaterThan(before.getTime());
    expect(next.getTime() - before.getTime()).toBeLessThanOrEqual(WEEK);
    expect((next.getTime() - old.getTime()) % WEEK).toBe(0);
  });

  it("keeps a monthly one on its start date's day of the month (the 31st, in the months that have one)", async () => {
    // Started on 31 January; its June invoice fell on the 30th, the month's last day. Resumed on
    // 30 August at noon: the next is 31 August, not the 30th of each month after June.
    const clock = useFakeClock(new Date("2026-08-30T12:00:00.000Z"));
    try {
      const { res, fake } = await resume({
        frequency: "monthly",
        startDate: new Date("2026-01-31T09:00:00.000Z"),
        nextRunDate: new Date("2026-06-30T09:00:00.000Z"),
      });

      expect(res.status).toBe(200);
      expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(new Date("2026-08-31T09:00:00.000Z"));
    } finally {
      clock.restore();
    }
  });

  it("then sends nothing for the paused time: the generate pass has nothing due", async () => {
    const { fake } = await resume({ nextRunDate: new Date(Date.now() - 35 * DAY - 3_600_000) });
    jest.spyOn(storage, "getDueJobSchedules").mockImplementation(async (at: Date) =>
      [...fake.schedules.values()].filter((s) => s.status === "active" && s.nextRunDate <= at) as any);

    const result = await tradesCron.runTradesGeneratePass(new Date());

    expect(result.generated).toBe(0);
    expect(fake.writes.filter((name) => name === "createJobInvoice")).toEqual([]);
  });

  it("leaves the next date alone when resumed before it", async () => {
    const soon = inDays(3);
    const { res, fake } = await resume({ nextRunDate: soon });

    expect(res.status).toBe(200);
    expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(soon);
  });

  it("changes nothing about the next date when pausing, or when an active one's amount changes", async () => {
    const due = new Date(Date.now() - 3_600_000); // due now: the next cron run sends it
    const { app, owner, fake } = await ownerWithTrades({ schedule: { nextRunDate: due } });

    expect((await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(bearer(owner)).send({ amountCents: 52_000 })).status).toBe(200);
    expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(due);
    expect((await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "paused" })).status).toBe(200);
    expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(due);
  });
});

/**
 * Archiving a client left their recurring invoices running: each kept making and emailing an
 * invoice every period. The owner chose to cancel them, as archiving a rent tenant cancels its
 * automations (docs/decisions/2026-09-27-c10-batch-6d-owner-answers.md, answer 3).
 */
describe("archiving a trades client cancels their recurring invoices (owner decision 2026-09-27)", () => {
  const PAUSED = "13131313-1313-4131-8131-131313131313";
  const CANCELLED = "14141414-1414-4141-8141-141414141414";
  const OTHER_CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const THEIRS = "15151515-1515-4151-8151-151515151515";
  const cancelledAt = new Date("2026-09-01T00:00:00Z");

  async function withRecurring() {
    const { app, owner, fake } = await ownerWithTrades();
    fake.schedules.set(PAUSED, { ...fake.schedules.get(SCHEDULE), id: PAUSED, status: "paused" });
    fake.schedules.set(CANCELLED, { ...fake.schedules.get(SCHEDULE), id: CANCELLED, status: "terminated", terminatedAt: cancelledAt });
    fake.clients.set(OTHER_CLIENT, { ...fake.clients.get(CLIENT), id: OTHER_CLIENT, firstName: "Olive" });
    fake.schedules.set(THEIRS, { ...fake.schedules.get(SCHEDULE), id: THEIRS, clientProfileId: OTHER_CLIENT });
    return { app, owner, fake };
  }

  it("cancels the client's running and paused recurring invoices, and records when", async () => {
    const { app, owner, fake } = await withRecurring();

    const res = await request(app).post(`/api/trades/clients/${CLIENT}/archive`).set(bearer(owner));

    expect(res.status).toBe(200);
    expect(fake.clients.get(CLIENT).status).toBe("archived");
    expect(fake.schedules.get(SCHEDULE)).toMatchObject({ status: "terminated", terminatedAt: expect.any(Date) });
    expect(fake.schedules.get(PAUSED)).toMatchObject({ status: "terminated", terminatedAt: expect.any(Date) });
    expect(storage.createJobEvent).toHaveBeenCalledWith(expect.objectContaining({ clientProfileId: CLIENT, scheduleId: SCHEDULE, eventType: "schedule_terminated" }));
    expect(storage.createJobEvent).toHaveBeenCalledWith(expect.objectContaining({ clientProfileId: CLIENT, scheduleId: PAUSED, eventType: "schedule_terminated" }));
  });

  it("leaves one already cancelled, and another client's, as they were", async () => {
    const { app, owner, fake } = await withRecurring();

    await request(app).post(`/api/trades/clients/${CLIENT}/archive`).set(bearer(owner));

    expect(fake.schedules.get(CANCELLED)).toMatchObject({ status: "terminated", terminatedAt: cancelledAt });
    expect(fake.schedules.get(THEIRS).status).toBe("active");
    expect(storage.createJobEvent).not.toHaveBeenCalledWith(expect.objectContaining({ scheduleId: CANCELLED }));
  });

  it("then the cron bills the archived client nothing, and the other client as before", async () => {
    const { app, owner, fake } = await withRecurring();
    await request(app).post(`/api/trades/clients/${CLIENT}/archive`).set(bearer(owner));
    jest.spyOn(storage, "getDueJobSchedules").mockImplementation(async (at: Date) =>
      [...fake.schedules.values()].filter((s) => s.status === "active" && s.nextRunDate <= at) as any);

    await tradesCron.runTradesGeneratePass(inDays(3.1));

    const made = (storage.createJobInvoice as jest.Mock).mock.calls.map(([data]) => data);
    expect(made).toEqual([expect.objectContaining({ clientProfileId: OTHER_CLIENT, scheduleId: THEIRS })]);
  });

  it("restoring the client does not restart them", async () => {
    const { app, owner, fake } = await withRecurring();

    await request(app).post(`/api/trades/clients/${CLIENT}/archive`).set(bearer(owner));
    const res = await request(app).post(`/api/trades/clients/${CLIENT}/unarchive`).set(bearer(owner));

    expect(res.status).toBe(200);
    expect(fake.clients.get(CLIENT).status).toBe("active");
    expect(fake.schedules.get(SCHEDULE).status).toBe("terminated");
    expect(fake.schedules.get(PAUSED).status).toBe("terminated");
  });

  it("an archived client gets no new recurring invoice (409), and nothing is made", async () => {
    const { app, owner, fake } = await ownerWithTrades({ client: { status: "archived" } });

    const res = await request(app).post("/api/trades/schedules").set(bearer(owner)).send({
      clientProfileId: CLIENT, amountCents: 50_000, frequency: "monthly", deliveryChannel: "email", startDate: inDays(7).toISOString(),
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "This client is archived" });
    expect(fake.writes).toEqual([]);
  });
});

/**
 * A past start date was taken: the first run was already due, and the cron billed every period
 * since, one overdue invoice per run. The owner chose to refuse it; a date up to a day back is still
 * taken, since the forms send today's UTC date at 09:00 UTC
 * (docs/decisions/2026-09-27-c10-batch-6d-owner-answers.md, answer 4).
 */
describe("a recurring invoice cannot start in the past (owner decision 2026-09-27)", () => {
  const HOUR = 3_600_000;
  const recurring = (startDate: Date) => ({
    clientProfileId: CLIENT, amountCents: 50_000, frequency: "monthly", deliveryChannel: "email", startDate: startDate.toISOString(),
  });

  it.each([
    ["25 hours back", () => new Date(Date.now() - 25 * HOUR)],
    ["six months back", () => new Date(Date.now() - 182 * DAY)],
  ])("a start date %s is refused (400), and nothing is made", async (_label, start) => {
    const { app, owner, fake } = await ownerWithTrades();

    const res = await request(app).post("/api/trades/schedules").set(bearer(owner)).send(recurring(start()));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The start date can't be in the past" });
    expect(fake.writes).toEqual([]);
  });

  it.each([
    ["today at 09:00 UTC, as the forms send it", () => new Date(`${new Date().toISOString().slice(0, 10)}T09:00:00Z`)],
    ["23 hours back", () => new Date(Date.now() - 23 * HOUR)],
    ["next week", () => inDays(7)],
  ])("a start date %s is taken (201), first billed on that date", async (_label, start) => {
    const { app, owner, fake } = await ownerWithTrades();
    const startDate = start();

    const res = await request(app).post("/api/trades/schedules").set(bearer(owner)).send(recurring(startDate));

    expect(res.status).toBe(201);
    expect(fake.schedules.get(res.body.id)).toMatchObject({ startDate, nextRunDate: startDate, status: "active" });
  });
});
