import "./support/test-env";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn } from "./support/http-harness";
import { fakeProperty, seedProperty, TENANT, SCHEDULE } from "./support/property-fake";
import { observeRefusalEffects } from "./support/refusal-effects";

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());
const input = { amountCents: 52000, frequency: "weekly", deliveryChannel: "email", startDate: "2026-10-10T00:00:00Z" };

test.each([
  ["create", "parent", "moved", 404],
  ["create", "parent", "archived", 409],
  ["update", "child", "moved", 404],
  ["delete", "child", "moved", 404],
  ["update", "parent", "moved", 404],
  ["delete", "parent", "moved", 404],
  ["update", "child", "terminated", 409],
] as const)("%s refuses %s %s after the first lookup", async (action, target, change, expected) => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal(); const other = await createOwnerPrincipal();
  const fake = fakeProperty(); seedProperty(fake, owner.merchantId);
  const held = storage as any;
  const scoped = action === "create" ? "getTenantProfileForMerchant" : "getActiveScheduleForMerchant";
  const reader = action === "create" ? "getTenantProfile" : "getActiveSchedule";
  const snapshot = () => JSON.stringify({ tenants: [...fake.tenants], schedules: [...fake.schedules], events: fake.events });
  let after: string | undefined;
  const racedLookup = async () => {
    const stale = { ...(action === "create" ? fake.tenants.get(TENANT) : fake.schedules.get(SCHEDULE)) };
    const row = target === "parent" ? fake.tenants.get(TENANT) : fake.schedules.get(SCHEDULE);
    if (change === "moved") row.merchantId = other.merchantId; else row.status = change;
    after = snapshot(); return stale;
  };
  jest.spyOn(held, reader).mockImplementation(racedLookup);
  if (typeof held[scoped] === "function") jest.spyOn(held, scoped).mockImplementation(racedLookup);
  const effects = observeRefusalEffects();
  try {
    const res = action === "create" ? await request(app).post(`/api/property/tenants/${TENANT}/schedules`).set(signedIn(owner)).send(input)
      : action === "delete" ? await request(app).delete(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner))
      : await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "active", amountCents: 54000 });
    expect(res.status).toBe(expected); expect(after).toBeDefined();
    expect(snapshot()).toBe(after); expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});

test("resume uses the latest locked cycle rather than the stale route snapshot", async () => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeProperty(); seedProperty(fake, owner.merchantId, { schedule: { status: "paused", frequency: "weekly", nextRunDate: new Date("2020-01-01T00:00:00Z") } });
  const held = storage as any;
  const reader = held.getActiveScheduleForMerchant ? "getActiveScheduleForMerchant" : "getActiveSchedule";
  const next = new Date(Date.now() + 20 * 86400000);
  jest.spyOn(held, reader).mockImplementation(async () => {
    const stale = { ...fake.schedules.get(SCHEDULE) };
    Object.assign(fake.schedules.get(SCHEDULE), { frequency: "monthly", nextRunDate: next }); return stale;
  });
  const res = await request(app).put(`/api/property/schedules/${SCHEDULE}`).set(signedIn(owner)).send({ status: "active" });
  expect(res.status).toBe(200);
  expect(fake.schedules.get(SCHEDULE).nextRunDate).toEqual(next);
  expect(fake.events.map(event => event.eventType)).toEqual(["Schedule_Resumed"]);
});
