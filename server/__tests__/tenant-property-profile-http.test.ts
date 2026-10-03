import "./support/test-env";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn } from "./support/http-harness";
import { fakeProperty, seedProperty, TENANT } from "./support/property-fake";
import { observeRefusalEffects } from "./support/refusal-effects";
beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

test.each(["edit", "archive", "restore", "history"])("profile %s refuses a moved parent after lookup", async action => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  const fake = fakeProperty(); seedProperty(fake, owner.merchantId);
  fake.events.push({ tenantProfileId: TENANT, merchantId: owner.merchantId, eventType: "Synthetic" });
  const held = storage as any;
  const reader = held.getTenantProfileForMerchant ? "getTenantProfileForMerchant" : "getTenantProfile";
  const snapshot = () => JSON.stringify({ tenants: [...fake.tenants], schedules: [...fake.schedules], events: fake.events });
  let afterMove: string | undefined;
  jest.spyOn(held, reader).mockImplementation(async (...args: any[]) => {
    const stale = { ...fake.tenants.get(args[0]) };
    fake.tenants.get(TENANT).merchantId = other.merchantId;
    afterMove = snapshot();
    return stale;
  });
  const effects = observeRefusalEffects();
  try {
    const base = `/api/property/tenants/${TENANT}`;
    const res = action === "edit" ? await request(app).put(base).set(signedIn(owner)).send({ firstName: "Changed" })
      : action === "history" ? await request(app).get(base + "/events").set(signedIn(owner))
      : await request(app).post(base + (action === "archive" ? "/archive" : "/unarchive")).set(signedIn(owner));
    expect(res.status).toBe(action === "history" ? 200 : 404);
    if (action === "history") expect(res.body).toEqual([]);
    expect(afterMove).toBeDefined();
    expect(snapshot()).toBe(afterMove);
    expect(fake.writes).toEqual([]);
    effects.assertNone();
  } finally { effects.restore(); }
});
