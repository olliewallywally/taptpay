import "./support/test-env";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn } from "./support/http-harness";
import { fakeTrades, seedTrades, inDays, CLIENT, SCHEDULE, MADE_SCHEDULE } from "./support/trades-fake";
import { observeRefusalEffects } from "./support/refusal-effects";
beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());
const input = () => ({ clientProfileId: CLIENT, amountCents: 52_000, frequency: "weekly", deliveryChannel: "email", startDate: inDays(7).toISOString() });
const held = storage as any;
const spyIfPresent = (name: string, implementation: (...args: any[]) => any) => { if (typeof held[name] === "function") jest.spyOn(held, name).mockImplementation(implementation); };

test.each([
  ["create", "parent", "moved", 404, { message: "Client not found" }],
  ["create", "parent", "archived", 409, { message: "This client is archived" }],
  ["update", "child", "moved", 404, { message: "Not found" }],
  ["delete", "child", "moved", 404, { message: "Not found" }],
  ["update", "parent", "moved", 404, { message: "Not found" }],
  ["delete", "parent", "moved", 404, { message: "Not found" }],
  ["update", "child", "terminated", 409, { message: "This recurring invoice was cancelled" }],
] as const)("%s refuses a %s %s after the first lookup without a row, history or message", async (action, target, change, status, body) => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal(); const other = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId);
  const snapshot = () => JSON.stringify({ clients: [...fake.clients], schedules: [...fake.schedules], events: fake.events });
  let after: string | undefined;
  const racedLookup = async () => {
    const stale = { ...(action === "create" ? fake.clients.get(CLIENT) : fake.schedules.get(SCHEDULE)) };
    const row = target === "parent" ? fake.clients.get(CLIENT) : fake.schedules.get(SCHEDULE);
    if (change === "moved") row.merchantId = other.merchantId; else row.status = change;
    after = snapshot(); return stale;
  };
  // The reader the route uses before S4c, and the scoped one it uses after.
  for (const name of action === "create" ? ["getClientProfile", "getClientProfileForMerchant"] : ["getJobSchedule", "getJobScheduleForMerchant"]) spyIfPresent(name, racedLookup);
  const effects = observeRefusalEffects();
  try {
    const res = action === "create" ? await request(app).post("/api/trades/schedules").set(signedIn(owner)).send(input())
      : action === "delete" ? await request(app).delete(`/api/trades/schedules/${SCHEDULE}`).set(signedIn(owner))
      : await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "active", amountCents: 54_000 });
    expect(res.status).toBe(status); expect(res.body).toEqual(body);
    expect(after).toBeDefined(); expect(snapshot()).toBe(after); expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});

test("resume uses the latest locked cycle rather than the stale route snapshot", async () => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId, { schedule: { status: "paused", frequency: "weekly", nextRunDate: new Date("2020-01-06T09:00:00Z"), startDate: new Date("2019-12-02T09:00:00Z") } });
  const next = inDays(20);
  const lookup = async () => {
    const stale = { ...fake.schedules.get(SCHEDULE) };
    Object.assign(fake.schedules.get(SCHEDULE), { frequency: "monthly", nextRunDate: next }); return stale;
  };
  for (const name of ["getJobSchedule", "getJobScheduleForMerchant"]) spyIfPresent(name, lookup);
  const res = await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "active" });
  expect(res.status).toBe(200);
  expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(next);
  expect(fake.events.map(row => row.eventType)).toEqual(["schedule_resumed"]);
});

test("each recurring-invoice write is one storage call that takes the business, with its history", async () => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId);
  const body = input();
  const made = await request(app).post("/api/trades/schedules").set(signedIn(owner)).send({ ...body, merchantId: 99, status: "terminated", nextRunDate: "2020-01-01T00:00:00Z" });
  expect(made.status).toBe(201);
  expect(made.body).toMatchObject({ id: MADE_SCHEDULE, merchantId: owner.merchantId, clientProfileId: CLIENT, amountCents: 52_000, frequency: "weekly", status: "active" });
  expect(held.createJobScheduleForMerchant).toHaveBeenCalledWith(CLIENT, owner.merchantId,
    { amountCents: 52_000, frequency: "weekly", deliveryChannel: "email", startDate: new Date(body.startDate), endDate: undefined });
  const paused = await request(app).put(`/api/trades/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "paused", amountCents: 54_000 });
  expect(paused.status).toBe(200); expect(paused.body).toMatchObject({ id: SCHEDULE, status: "paused", amountCents: 54_000 });
  expect(held.updateJobScheduleForMerchant).toHaveBeenCalledWith(SCHEDULE, owner.merchantId, { status: "paused", amountCents: 54_000 });
  const cancelled = await request(app).delete(`/api/trades/schedules/${SCHEDULE}`).set(signedIn(owner));
  expect(cancelled.status).toBe(200); expect(cancelled.body).toMatchObject({ id: SCHEDULE, status: "terminated" });
  expect(held.terminateJobScheduleForMerchant).toHaveBeenCalledWith(SCHEDULE, owner.merchantId);
  expect(fake.events.map(row => [row.eventType, row.scheduleId])).toEqual([["schedule_created", MADE_SCHEDULE], ["schedule_paused", SCHEDULE], ["schedule_terminated", SCHEDULE]]);
  expect(fake.events[0]).toMatchObject({ merchantId: owner.merchantId, clientProfileId: CLIENT, payload: { amountCents: 52_000, frequency: "weekly" } });
  expect(fake.events[1].payload).toEqual({ status: "paused", amountCents: 54_000 });
  // The cron's own globally keyed writes are not the signed-in routes'.
  for (const name of ["updateJobSchedule", "terminateJobSchedule"]) expect(held[name]).not.toHaveBeenCalled();
  expect(held.createJobSchedule).toBeUndefined(); expect(held.getJobSchedule).toBeUndefined();
});

test.each([
  [{ kind: "not-found" }, 404, { message: "Client not found" }],
  [{ kind: "conflict", reason: "archived" }, 409, { message: "This client is archived" }],
] as const)("create answers storage's refusal %j as %s", async (result, status, body) => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId);
  jest.spyOn(held, "createJobScheduleForMerchant").mockResolvedValue(result);
  const res = await request(app).post("/api/trades/schedules").set(signedIn(owner)).send(input());
  expect(res.status).toBe(status); expect(res.body).toEqual(body); expect(fake.events).toEqual([]);
});
