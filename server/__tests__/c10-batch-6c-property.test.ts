import "./support/test-env";

import request from "supertest";
import * as billing from "../billing-card";
import * as propertyCron from "../property-cron";
import { ROUTE_POLICY } from "../route-policy";
import { bearer, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot } from "./support/http-harness";

/**
 * C10 route review, batch 6c (the property routes), 2026-09-27. The in-memory storage has no
 * property tables, so the tenants, automations and invoices live in a small fake here (the
 * technique of invoice-document-attach-ownership.test.ts), which records every read and write.
 */

const TENANT = "22222222-2222-4222-8222-222222222222";
const SCHEDULE = "33333333-3333-4333-8333-333333333333";
const INVOICE = "44444444-4444-4444-8444-444444444444";
const MISSING = "99999999-9999-4999-8999-999999999999";
const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY);

interface PropertyFake {
  tenants: Map<string, any>;
  schedules: Map<string, any>;
  invoices: Map<string, any>;
  reads: string[];
  writes: string[];
}

function fakeProperty(): PropertyFake {
  const fake: PropertyFake = { tenants: new Map(), schedules: new Map(), invoices: new Map(), reads: [], writes: [] };
  const read = (name: string, rows: Map<string, any>) =>
    jest.spyOn(storage as any, name).mockImplementation(async (id: unknown) => {
      fake.reads.push(name);
      return rows.get(id as string);
    });
  read("getTenantProfile", fake.tenants);
  read("getActiveSchedule", fake.schedules);
  read("getInvoiceRentRequest", fake.invoices);
  const list = (name: string, rows: () => any[]) =>
    jest.spyOn(storage as any, name).mockImplementation(async () => {
      fake.reads.push(name);
      return rows();
    });
  list("getTenantProfilesByMerchant", () => [...fake.tenants.values()]);
  list("getActiveSchedulesByMerchant", () => [...fake.schedules.values()]);
  list("getActiveSchedulesByTenant", () => [...fake.schedules.values()]);
  list("getInvoiceRentRequestsByMerchant", () => [...fake.invoices.values()]);
  list("getTransactionEventsByTenant", () => []);
  jest.spyOn(storage, "getLiveInvoiceByTenant").mockResolvedValue(undefined as any);
  const write = (name: string, apply: (...args: any[]) => any) =>
    jest.spyOn(storage as any, name).mockImplementation(async (...args: any[]) => {
      fake.writes.push(name);
      return apply(...args);
    });
  write("updateTenantProfile", (id: string, updates: any) => Object.assign(fake.tenants.get(id), updates));
  write("archiveTenantProfile", (id: string) => Object.assign(fake.tenants.get(id), { status: "archived" }));
  write("unarchiveTenantProfile", (id: string) => Object.assign(fake.tenants.get(id), { status: "active" }));
  write("createActiveSchedule", (data: any) => {
    const row = { id: "55555555-5555-4555-8555-555555555555", status: "active", ...data };
    fake.schedules.set(row.id, row);
    return row;
  });
  write("updateActiveSchedule", (id: string, updates: any) => Object.assign(fake.schedules.get(id), updates));
  write("terminateActiveSchedule", (id: string) => Object.assign(fake.schedules.get(id), { status: "terminated", terminatedAt: new Date() }));
  write("createInvoiceRentRequest", (data: any) => {
    const row = { id: "66666666-6666-4666-8666-666666666666", ...data };
    fake.invoices.set(row.id, row);
    return row;
  });
  write("updateInvoiceRentRequest", (id: string, updates: any) => Object.assign(fake.invoices.get(id), updates));
  write("logTransactionEvent", () => ({}));
  jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
  jest.spyOn(propertyCron, "resendInvoiceEmail").mockImplementation(async (id: string) => {
    fake.writes.push("resendInvoiceEmail");
    return { ok: true, invoice: fake.invoices.get(id) };
  });
  return fake;
}

/** A business with one tenant, one weekly automation and one sent invoice, all its own. */
function seed(fake: PropertyFake, merchantId: number, state: { tenant?: object; schedule?: object; invoice?: object } = {}) {
  fake.tenants.set(TENANT, {
    id: TENANT, merchantId, firstName: "Tess", lastName: "Tenant", propertyAddress: "1 Test Road",
    email: "tess@example.test", preferredChannel: "email", status: "active", ...state.tenant,
  });
  fake.schedules.set(SCHEDULE, {
    id: SCHEDULE, merchantId, tenantProfileId: TENANT, amountCents: 50_000, frequency: "weekly",
    deliveryChannel: "email", status: "active", nextRunDate: inDays(3), ...state.schedule,
  });
  fake.invoices.set(INVOICE, {
    id: INVOICE, merchantId, tenantProfileId: TENANT, amountCents: 50_000, status: "dispatched",
    token: "checkout-token", deliveryChannel: "email", ...state.invoice,
  });
}

beforeEach(() => {
  resetTestStorage();
  jest.restoreAllMocks();
});

type Method = "get" | "post" | "put" | "delete";
type Call = [label: string, method: Method, address: (id: string) => string, body: Record<string, unknown> | undefined];

/** The routes that address one tenant, automation or invoice by its id in the path. */
const BY_ID: Call[] = [
  ["GET /api/property/tenants/:id", "get", (id) => `/api/property/tenants/${id}`, undefined],
  ["PUT /api/property/tenants/:id", "put", (id) => `/api/property/tenants/${id}`, { firstName: "Tessa" }],
  ["POST /api/property/tenants/:id/archive", "post", (id) => `/api/property/tenants/${id}/archive`, undefined],
  ["POST /api/property/tenants/:id/unarchive", "post", (id) => `/api/property/tenants/${id}/unarchive`, undefined],
  ["GET /api/property/tenants/:id/events", "get", (id) => `/api/property/tenants/${id}/events`, undefined],
  ["POST /api/property/tenants/:tenantId/schedules", "post", (id) => `/api/property/tenants/${id}/schedules`,
    { amountCents: 50_000, frequency: "weekly", deliveryChannel: "email", startDate: inDays(7).toISOString() }],
  ["PUT /api/property/schedules/:id", "put", (id) => `/api/property/schedules/${id}`, { status: "paused" }],
  ["DELETE /api/property/schedules/:id", "delete", (id) => `/api/property/schedules/${id}`, undefined],
  ["POST /api/property/invoices/:id/resend", "post", (id) => `/api/property/invoices/${id}/resend`, undefined],
  ["POST /api/property/invoices/:id/void", "post", (id) => `/api/property/invoices/${id}/void`, undefined],
  ["POST /api/property/invoices/:id/mark-paid-external", "post", (id) => `/api/property/invoices/${id}/mark-paid-external`, {}],
];
const idOf = (label: string) => (label.includes("/schedules/:id") ? SCHEDULE : label.includes("/invoices/") ? INVOICE : TENANT);

async function send(app: any, principal: { token: string }, method: Method, address: string, body?: Record<string, unknown>) {
  let pending = request(app)[method](address).set(bearer(principal));
  if (body) pending = pending.send(body);
  return pending;
}

describe("the two property routes no screen calls are removed (owner decision 2026-09-27)", () => {
  const RETIRED: Array<[string, string]> = [
    ["GET /api/property/invoices/:id", `/api/property/invoices/${INVOICE}`],
    ["GET /api/property/tenants/:tenantId/schedules", `/api/property/tenants/${TENANT}/schedules`],
  ];

  it.each(RETIRED)("%s is registered nowhere", (key) => {
    expect(ROUTE_POLICY[key]).toBeUndefined();
  });

  it.each(RETIRED)("%s answers the owner as an unknown address, and reads nothing", async (_key, address) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const res = await request(app).get(address).set(bearer(owner));

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/json/);
    expect(fake.reads).toEqual([]);
  });

  it("the routes that stay beside them still answer the owner", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    expect((await request(app).get("/api/property/invoices").set(bearer(owner))).status).toBe(200);
    expect((await request(app).get("/api/property/schedules").set(bearer(owner))).status).toBe(200);
    expect((await request(app).post(`/api/property/invoices/${INVOICE}/resend`).set(bearer(owner))).status).toBe(200);
    const created = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(bearer(owner))
      .send({ amountCents: 50_000, frequency: "weekly", deliveryChannel: "email", startDate: inDays(7).toISOString() });
    expect(created.status).toBe(201);
  });
});

/**
 * Another business's tenant, automation or invoice answered 403 while a missing one answered 404,
 * so the answer said whether the id exists. The trades routes answer both alike.
 */
describe("another business's property record is not found, like a missing one", () => {
  it.each(BY_ID)("%s: another business gets the missing record's answer, and nothing changes", async (label, method, address, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const missing = await send(app, other, method, address(MISSING), body);
    const theirs = await send(app, other, method, address(idOf(label)), body);

    expect(missing.status).toBe(404);
    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(missing.body);
    expect(fake.writes).toEqual([]);
  });

  it("the invoice create: another business's tenant gets the missing tenant's answer, and nothing is made", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);
    const bill = (tenantProfileId: string) => ({ tenantProfileId, amountCents: 5_000, deliveryChannel: "email", dueAt: inDays(7).toISOString() });

    const missing = await request(app).post("/api/property/invoices").set(bearer(other)).send(bill(MISSING));
    const theirs = await request(app).post("/api/property/invoices").set(bearer(other)).send(bill(TENANT));

    expect(missing.status).toBe(404);
    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(missing.body);
    expect(fake.writes).toEqual([]);
  });

  it("the business's teammate and owner still reach their own records", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    expect((await request(app).get(`/api/property/tenants/${TENANT}`).set(bearer(member))).status).toBe(200);
    expect((await request(app).get(`/api/property/tenants/${TENANT}`).set(bearer(owner))).status).toBe(200);
    expect((await request(app).post(`/api/property/invoices/${INVOICE}/void`).set(bearer(member))).status).toBe(200);
  });
});

/** A malformed id reached PostgreSQL, whose uuid cast throws (22P02): the route answered 500. */
describe("property ids are read strictly", () => {
  it.each(BY_ID)("%s: a malformed id is refused (400) before anything is read", async (_label, method, address, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const res = await send(app, owner, method, address("not-a-uuid"), body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid id" });
    expect(fake.reads).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it("the invoice list refuses a malformed tenant filter (400) before reading", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const res = await request(app).get("/api/property/invoices?tenantProfileId=not-a-uuid").set(bearer(owner));

    expect(res.status).toBe(400);
    expect(fake.reads).toEqual([]);
  });

  it("the invoice list still filters by a well-formed tenant", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const res = await request(app).get(`/api/property/invoices?tenantProfileId=${TENANT}`).set(bearer(owner));

    expect(res.status).toBe(200);
    expect(storage.getInvoiceRentRequestsByMerchant).toHaveBeenCalledWith(owner.merchantId, expect.objectContaining({ tenantProfileId: TENANT }));
  });

  it.each([
    ["a malformed tenant", { tenantProfileId: "not-a-uuid" }],
    ["a tenant that is not text", { tenantProfileId: { id: TENANT } }],
  ])("the invoice create refuses %s with the issues (400) before reading the tenant", async (_label, change) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const res = await request(app).post("/api/property/invoices").set(bearer(owner))
      .send({ amountCents: 5_000, deliveryChannel: "email", dueAt: inDays(7).toISOString(), ...change });

    expect(res.status).toBe(400);
    expect(res.body.errors?.length).toBeGreaterThan(0);
    expect(fake.reads).toEqual([]);
    expect(fake.writes).toEqual([]);
  });
});

/** Rules the screens already keep: each was taken by the server (200 or 201) when called directly. */
describe("the property screens' state rules hold on the server", () => {
  it.each([["active"], ["paused"]])("a cancelled automation cannot be set %s (409), and nothing changes", async (status) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { schedule: { status: "terminated" } });

    const res = await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status });

    expect(res.status).toBe(409);
    expect(fake.schedules.get(SCHEDULE).status).toBe("terminated");
    expect(fake.writes).toEqual([]);
  });

  it("an automation is cancelled only by DELETE, which records when (PUT refuses 'terminated', 400)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const put = await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "terminated" });
    expect(put.status).toBe(400);
    expect(fake.writes).toEqual([]);

    const del = await request(app).delete(`/api/property/schedules/${SCHEDULE}`).set(bearer(owner));
    expect(del.status).toBe(200);
    expect(fake.schedules.get(SCHEDULE)).toMatchObject({ status: "terminated", terminatedAt: expect.any(Date) });
  });

  it("an archived tenant gets no new automation (409), and nothing is made", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { tenant: { status: "archived" } });

    const res = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(bearer(owner))
      .send({ amountCents: 50_000, frequency: "weekly", deliveryChannel: "email", startDate: inDays(7).toISOString() });

    expect(res.status).toBe(409);
    expect(fake.writes).toEqual([]);
  });

  it("a voided invoice cannot be marked paid (409), and stays voided", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { invoice: { status: "voided" } });

    const res = await request(app).post(`/api/property/invoices/${INVOICE}/mark-paid-external`).set(bearer(owner)).send({});

    expect(res.status).toBe(409);
    expect(fake.invoices.get(INVOICE).status).toBe("voided");
    expect(fake.writes).toEqual([]);
  });

  it("what the screens do is unchanged: pause, resume, a current tenant's automation, marking a sent invoice paid", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    expect((await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "paused" })).status).toBe(200);
    expect((await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "active" })).status).toBe(200);
    const created = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(bearer(owner))
      .send({ amountCents: 50_000, frequency: "weekly", deliveryChannel: "email", startDate: inDays(7).toISOString() });
    expect(created.status).toBe(201);
    const paid = await request(app).post(`/api/property/invoices/${INVOICE}/mark-paid-external`).set(bearer(owner)).send({ externalPaymentReference: "Cash" });
    expect(paid.status).toBe(200);
    expect(fake.invoices.get(INVOICE).status).toBe("paid_external");
  });
});

/**
 * Pausing left an automation's next date where it was, so resuming billed every period it missed,
 * one request per cron run (a weekly automation resumed after five weeks: six requests, five overdue).
 * The owner chose to skip the paused time (docs/decisions/2026-09-27-c10-batch-6c-owner-answers.md).
 */
describe("resuming a paused automation skips the paused time (owner decision 2026-09-27)", () => {
  const WEEK = 7 * DAY;

  async function resume(schedule: object) {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { schedule: { status: "paused", ...schedule } });
    const before = new Date();
    const res = await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "active" });
    return { res, fake, before };
  }

  it("moves a weekly automation's next date to its first date after the resume, on the same cycle", async () => {
    const old = new Date(Date.now() - 35 * DAY - 3_600_000);
    const { res, fake, before } = await resume({ nextRunDate: old });

    expect(res.status).toBe(200);
    const next: Date = fake.schedules.get(SCHEDULE).nextRunDate;
    expect(next.getTime()).toBeGreaterThan(before.getTime());
    expect(next.getTime() - before.getTime()).toBeLessThanOrEqual(WEEK);
    expect((next.getTime() - old.getTime()) % WEEK).toBe(0);
  });

  it("moves a monthly automation's next date to its first monthly date after the resume", async () => {
    const old = new Date(Date.UTC(2026, 5, 15, 9, 0, 0));
    const { res, fake, before } = await resume({ nextRunDate: old, frequency: "monthly" });

    expect(res.status).toBe(200);
    const next: Date = fake.schedules.get(SCHEDULE).nextRunDate;
    expect(next.getTime()).toBeGreaterThan(before.getTime());
    expect(next.getUTCDate()).toBe(15);
    expect(next.getUTCHours()).toBe(9);
    const monthEarlier = new Date(next);
    monthEarlier.setUTCMonth(monthEarlier.getUTCMonth() - 1);
    expect(monthEarlier.getTime()).toBeLessThanOrEqual(before.getTime());
  });

  it("then sends nothing for the paused time: the generate pass has nothing due", async () => {
    const { fake } = await resume({ nextRunDate: new Date(Date.now() - 35 * DAY - 3_600_000) });
    jest.spyOn(storage, "getSubscription").mockResolvedValue({} as any);
    jest.spyOn(storage, "getDueActiveSchedules").mockImplementation(async (at: Date) =>
      [...fake.schedules.values()].filter((s) => s.status === "active" && s.nextRunDate <= at) as any);

    const result = await propertyCron.runGeneratePass(new Date());

    expect(result.generated).toBe(0);
    expect(fake.writes.filter((name) => name === "createInvoiceRentRequest")).toEqual([]);
  });

  it("leaves the next date alone when resumed before it", async () => {
    const soon = inDays(3);
    const { res, fake } = await resume({ nextRunDate: soon });

    expect(res.status).toBe(200);
    expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(soon);
  });

  it("changes nothing about the next date when pausing, or when an active automation's amount changes", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    const due = new Date(Date.now() - 3_600_000); // due now: the next cron run sends it
    seed(fake, owner.merchantId, { schedule: { nextRunDate: due } });

    expect((await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(bearer(owner)).send({ amountCents: 52_000 })).status).toBe(200);
    expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(due);
    expect((await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(bearer(owner)).send({ status: "paused" })).status).toBe(200);
    expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(due);
  });
});

/** multer's refusals reached the error handler without a status: every one answered 500. */
describe("a rejected upload says why", () => {
  const TOO_BIG = Buffer.alloc(20 * 1024 * 1024 + 1, 0x41);
  const UPLOADS: Array<[string, (merchantId: number) => string, string, string, string]> = [
    ["the invoice document", () => "/api/property/invoices/document", "document", "bill.pdf", "application/pdf"],
    ["the logo", (merchantId) => `/api/merchants/${merchantId}/logo`, "logo", "logo.png", "image/png"],
  ];

  it.each(UPLOADS)("%s: a file of the wrong type is 400, and nothing is stored", async (_label, address, field) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    const res = await request(app).post(address(owner.merchantId)).set(bearer(owner))
      .attach(field, Buffer.from("<b>not a document</b>"), { filename: "page.html", contentType: "text/html" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^Only (PDF or image|PNG) files are allowed$/);
    expect(storageSnapshot()).toBe(before);
  });

  it.each(UPLOADS)("%s: a file over 20 MB is 413, and nothing is stored", async (_label, address, field, filename, contentType) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    const res = await request(app).post(address(owner.merchantId)).set(bearer(owner)).attach(field, TOO_BIG, { filename, contentType });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: "The file is larger than 20 MB" });
    expect(storageSnapshot()).toBe(before);
  });

  it.each(UPLOADS)("%s: a file under the wrong field name is 400", async (_label, address, _field, filename, contentType) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app).post(address(owner.merchantId)).set(bearer(owner))
      .attach("somethingElse", Buffer.from("%PDF-1.4\n"), { filename, contentType });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid upload" });
  });
});
