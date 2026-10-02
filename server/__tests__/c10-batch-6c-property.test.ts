import "./support/test-env";

import request from "supertest";
import * as propertyCron from "../property-cron";
import { ROUTE_POLICY } from "../route-policy";
import { signedIn, type SignedIn, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot } from "./support/http-harness";
import { INVOICE, MISSING, SCHEDULE, TENANT, fakeProperty, inDays, seedProperty as seed } from "./support/property-fake";

/**
 * C10 route review, batch 6c (the property routes), 2026-09-27. The in-memory storage has no
 * property tables, so the tenants, automations and invoices live in a small fake
 * (support/property-fake.ts, shared since R1-T3), which records every read and write.
 */

const DAY = 86_400_000;

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

async function send(app: any, principal: SignedIn, method: Method, address: string, body?: Record<string, unknown>) {
  let pending = request(app)[method](address).set(signedIn(principal));
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

    const res = await request(app).get(address).set(signedIn(owner));

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/json/);
    expect(fake.reads).toEqual([]);
  });

  it("the routes that stay beside them still answer the owner", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    expect((await request(app).get("/api/property/invoices").set(signedIn(owner))).status).toBe(200);
    expect((await request(app).get("/api/property/schedules").set(signedIn(owner))).status).toBe(200);
    expect((await request(app).post(`/api/property/invoices/${INVOICE}/resend`).set(signedIn(owner))).status).toBe(200);
    const created = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(signedIn(owner))
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

    const missing = await request(app).post("/api/property/invoices").set(signedIn(other)).send(bill(MISSING));
    const theirs = await request(app).post("/api/property/invoices").set(signedIn(other)).send(bill(TENANT));

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

    expect((await request(app).get(`/api/property/tenants/${TENANT}`).set(signedIn(member))).status).toBe(200);
    expect((await request(app).get(`/api/property/tenants/${TENANT}`).set(signedIn(owner))).status).toBe(200);
    expect((await request(app).post(`/api/property/invoices/${INVOICE}/void`).set(signedIn(member))).status).toBe(200);
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

    const res = await request(app).get("/api/property/invoices?tenantProfileId=not-a-uuid").set(signedIn(owner));

    expect(res.status).toBe(400);
    expect(fake.reads).toEqual([]);
  });

  it("the invoice list still filters by a well-formed tenant", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const res = await request(app).get(`/api/property/invoices?tenantProfileId=${TENANT}`).set(signedIn(owner));

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

    const res = await request(app).post("/api/property/invoices").set(signedIn(owner))
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

    const res = await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status });

    expect(res.status).toBe(409);
    expect(fake.schedules.get(SCHEDULE).status).toBe("terminated");
    expect(fake.writes).toEqual([]);
  });

  it("an automation is cancelled only by DELETE, which records when (PUT refuses 'terminated', 400)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    const put = await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "terminated" });
    expect(put.status).toBe(400);
    expect(fake.writes).toEqual([]);

    const del = await request(app).delete(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner));
    expect(del.status).toBe(200);
    expect(fake.schedules.get(SCHEDULE)).toMatchObject({ status: "terminated", terminatedAt: expect.any(Date) });
  });

  it("an archived tenant gets no new automation (409), and nothing is made", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { tenant: { status: "archived" } });

    const res = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(signedIn(owner))
      .send({ amountCents: 50_000, frequency: "weekly", deliveryChannel: "email", startDate: inDays(7).toISOString() });

    expect(res.status).toBe(409);
    expect(fake.writes).toEqual([]);
  });

  it("a voided invoice cannot be marked paid (409), and stays voided", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { invoice: { status: "voided" } });

    const res = await request(app).post(`/api/property/invoices/${INVOICE}/mark-paid-external`).set(signedIn(owner)).send({});

    expect(res.status).toBe(409);
    expect(fake.invoices.get(INVOICE).status).toBe("voided");
    expect(fake.writes).toEqual([]);
  });

  it("what the screens do is unchanged: pause, resume, a current tenant's automation, marking a sent invoice paid", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);

    expect((await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "paused" })).status).toBe(200);
    expect((await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "active" })).status).toBe(200);
    const created = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(signedIn(owner))
      .send({ amountCents: 50_000, frequency: "weekly", deliveryChannel: "email", startDate: inDays(7).toISOString() });
    expect(created.status).toBe(201);
    const paid = await request(app).post(`/api/property/invoices/${INVOICE}/mark-paid-external`).set(signedIn(owner)).send({ externalPaymentReference: "Cash" });
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
    const res = await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "active" });
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

    expect((await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ amountCents: 52_000 })).status).toBe(200);
    expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(due);
    expect((await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "paused" })).status).toBe(200);
    expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(due);
  });
});

/**
 * Sending rent with a repeat to a tenant who already had an automation started a second one, and
 * the tenant was billed by both every period (two weekly sends, $500 then $520: two requests a week).
 * The owner chose that the new one replaces the old (docs/decisions/2026-09-27-c10-batch-6c-owner-answers.md, 4).
 */
describe("a new rent automation replaces the tenant's old one (owner decision 2026-09-27)", () => {
  const PAUSED = "77777777-7777-4777-8777-777777777777";
  const CANCELLED = "88888888-8888-4888-8888-888888888888";
  const OTHER_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const cancelledAt = new Date("2026-09-01T00:00:00Z");

  async function withAutomations() {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId);
    fake.schedules.set(PAUSED, { ...fake.schedules.get(SCHEDULE), id: PAUSED, status: "paused", amountCents: 48_000 });
    fake.schedules.set(CANCELLED, { ...fake.schedules.get(SCHEDULE), id: CANCELLED, status: "terminated", terminatedAt: cancelledAt });
    fake.tenants.set(OTHER_TENANT, { ...fake.tenants.get(TENANT), id: OTHER_TENANT });
    fake.schedules.set(THEIRS, { ...fake.schedules.get(SCHEDULE), id: THEIRS, tenantProfileId: OTHER_TENANT });
    return { app, owner, fake };
  }
  const weekly = (amountCents: number) => ({ amountCents, frequency: "weekly", deliveryChannel: "email", startDate: inDays(7).toISOString() });

  it("cancels the tenant's running and paused automations, and records when", async () => {
    const { app, owner, fake } = await withAutomations();

    const res = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(signedIn(owner)).send(weekly(52_000));

    expect(res.status).toBe(201);
    expect(fake.schedules.get(res.body.id)).toMatchObject({ status: "active", amountCents: 52_000 });
    expect(fake.schedules.get(SCHEDULE)).toMatchObject({ status: "terminated", terminatedAt: expect.any(Date) });
    expect(fake.schedules.get(PAUSED)).toMatchObject({ status: "terminated", terminatedAt: expect.any(Date) });
    expect(storage.logTransactionEvent).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: SCHEDULE, eventType: "Schedule_Terminated" }));
    expect(storage.logTransactionEvent).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: PAUSED, eventType: "Schedule_Terminated" }));
  });

  it("leaves an automation already cancelled, and another tenant's, as they were", async () => {
    const { app, owner, fake } = await withAutomations();

    const res = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(signedIn(owner)).send(weekly(52_000));

    expect(res.status).toBe(201);
    expect(fake.schedules.get(CANCELLED)).toMatchObject({ status: "terminated", terminatedAt: cancelledAt });
    expect(fake.schedules.get(THEIRS).status).toBe("active");
  });

  it("then the tenant gets one rent request a period, at the new amount", async () => {
    const { app, owner, fake } = await withAutomations();
    await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(signedIn(owner)).send(weekly(52_000));
    jest.spyOn(storage, "getSubscription").mockResolvedValue({} as any);
    jest.spyOn(storage, "getDueActiveSchedules").mockImplementation(async (at: Date) =>
      [...fake.schedules.values()].filter((s) => s.status === "active" && s.nextRunDate <= at) as any);

    await propertyCron.runGeneratePass(inDays(7.1));

    const made = (storage.createInvoiceRentRequest as jest.Mock).mock.calls.map(([data]) => data);
    expect(made.filter((data) => data.tenantProfileId === TENANT)).toEqual([expect.objectContaining({ amountCents: 52_000 })]);
  });

  it("a refused automation cancels nothing", async () => {
    const { app, owner, fake } = await withAutomations();

    const res = await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(signedIn(owner))
      .send({ ...weekly(52_000), frequency: "daily" });

    expect(res.status).toBe(400);
    expect(fake.schedules.get(SCHEDULE).status).toBe("active");
    expect(fake.schedules.get(PAUSED).status).toBe("paused");
    expect(fake.writes).toEqual([]);
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

    const res = await request(app).post(address(owner.merchantId)).set(signedIn(owner))
      .attach(field, Buffer.from("<b>not a document</b>"), { filename: "page.html", contentType: "text/html" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^Only (PDF or image|PNG) files are allowed$/);
    expect(storageSnapshot()).toBe(before);
  });

  it.each(UPLOADS)("%s: a file over 20 MB is 413, and nothing is stored", async (_label, address, field, filename, contentType) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    const res = await request(app).post(address(owner.merchantId)).set(signedIn(owner)).attach(field, TOO_BIG, { filename, contentType });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: "The file is larger than 20 MB" });
    expect(storageSnapshot()).toBe(before);
  });

  it.each(UPLOADS)("%s: a file under the wrong field name is 400", async (_label, address, _field, filename, contentType) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app).post(address(owner.merchantId)).set(signedIn(owner))
      .attach("somethingElse", Buffer.from("%PDF-1.4\n"), { filename, contentType });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid upload" });
  });
});

/**
 * The tenant edit screen sends the whole form, so an emptied email or phone arrives as "". The schema
 * turned "" into undefined and the update left undefined out, so the old value stayed while the screen
 * said saved. Owner decision 2026-09-27 (docs/decisions/2026-09-27-before-r1-t3-owner-answers.md, 2).
 */
describe("an emptied tenant field is cleared (owner decision 2026-09-27)", () => {
  const FORM = { firstName: "Tess", lastName: "Tenant", propertyAddress: "1 Test Road", email: "tess@example.test", phone: "021 555 0100", preferredChannel: "email" };

  it("the edit screen's emptied phone clears it, and the rest stay", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { tenant: { phone: "021 555 0100" } });

    const res = await request(app).put(`/api/property/tenants/${TENANT}`).set(signedIn(owner)).send({ ...FORM, phone: "" });

    expect(res.status).toBe(200);
    expect(fake.tenants.get(TENANT)).toMatchObject({ phone: null, email: "tess@example.test", firstName: "Tess" });
  });

  it("an emptied email clears it; a field left out is left as it was", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { tenant: { phone: "021 555 0100", coTenantsText: "Sam" } });

    const cleared = await request(app).put(`/api/property/tenants/${TENANT}`).set(signedIn(owner)).send({ ...FORM, email: "", preferredChannel: "sms" });
    expect(cleared.status).toBe(200);
    expect(fake.tenants.get(TENANT)).toMatchObject({ email: null, phone: "021 555 0100", coTenantsText: "Sam" });

    const renamed = await request(app).put(`/api/property/tenants/${TENANT}`).set(signedIn(owner)).send({ firstName: "Tessa" });
    expect(renamed.status).toBe(200);
    expect(fake.tenants.get(TENANT)).toMatchObject({ firstName: "Tessa", email: null, phone: "021 555 0100", coTenantsText: "Sam" });
  });
});

/** R1-T3 (P2.2): a settled invoice is a state conflict, 409 (these three answered 400). */
describe("a settled rent invoice's conflicts are 409 (R1-T3, P2.2)", () => {
  it.each([
    ["resent", "post", (id: string) => `/api/property/invoices/${id}/resend`, undefined, "paid"],
    ["voided", "post", (id: string) => `/api/property/invoices/${id}/void`, undefined, "paid_external"],
    ["marked paid again", "post", (id: string) => `/api/property/invoices/${id}/mark-paid-external`, {}, "paid"],
  ] as const)("a paid invoice cannot be %s: 409, and nothing changes or is sent", async (_label, _method, address, body, status) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fake = fakeProperty();
    seed(fake, owner.merchantId, { invoice: { status } });

    let pending = request(app).post(address(INVOICE)).set(signedIn(owner));
    if (body) pending = pending.send(body);
    const res = await pending;

    expect(res.status).toBe(409);
    expect(fake.invoices.get(INVOICE).status).toBe(status);
    expect(fake.writes).toEqual([]);
  });
});
