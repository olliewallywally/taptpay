import "./support/test-env";

import request from "supertest";
import {
  createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage, storageSnapshot, type Principal,
} from "./support/http-harness";
import { fakeProperty, seedProperty, MADE_TENANT, TENANT } from "./support/property-fake";
import { observeRefusalEffects } from "./support/refusal-effects";

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

const held = storage as any;
const loginId = (who: Principal) => who.user.userId ?? who.user.id;
const INVALID_TENANTS = [undefined, null, 0, -1, NaN, 1.5, 2_147_483_648];

async function seed() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const member = await createMemberPrincipal(owner.merchantId);
  const other = await createOwnerPrincipal();
  return { app, owner, member, other };
}

describe("R1-T7 S5b — stock create", () => {
  test("names the path's business to storage, whatever the body names", async () => {
    const { app, owner, other } = await seed();
    const create = jest.spyOn(held, "createStockItemForMerchant");
    const res = await request(app).post(`/api/merchants/${owner.merchantId}/stock-items`).set(signedIn(owner))
      .send({ name: "Coffee", cost: "4.50", merchantId: other.merchantId, id: 9999, isActive: false });
    expect(res.status).toBe(201);
    expect(create.mock.calls.map(([merchantId]: any[]) => merchantId)).toEqual([owner.merchantId]);
    expect(res.body).toMatchObject({ merchantId: owner.merchantId, name: "Coffee", cost: "4.50", isActive: true });
    expect(res.body.id).not.toBe(9999);
    expect(await storage.getStockItemsByMerchant(other.merchantId)).toEqual([]);
  });

  test("another business's path is refused and nothing is made", async () => {
    const { app, owner, other } = await seed();
    const before = storageSnapshot();
    const res = await request(app).post(`/api/merchants/${other.merchantId}/stock-items`).set(signedIn(owner)).send({ name: "Coffee", cost: "4.50" });
    expect(res.status).toBe(403);
    expect(storageSnapshot()).toBe(before);
  });
});

describe("R1-T7 S5b — the team's logins", () => {
  async function invited(app: any, owner: Principal): Promise<number> {
    const res = await request(app).post("/api/team/invite").set(signedIn(owner)).send({ email: `invitee-${Date.now()}@harness.test` });
    if (res.status !== 201) throw new Error(`fixture: invite failed ${res.status}`);
    return res.body.member.id;
  }
  const send = (app: any, action: string, who: Principal, id: number) =>
    action === "resend" ? request(app).post(`/api/team/${id}/resend`).set(signedIn(who)) : request(app).delete(`/api/team/${id}`).set(signedIn(who));

  test("a login is read through its business, in memory as in the database", async () => {
    const { owner, member, other } = await seed();
    expect(await held.getTeamMemberForMerchant(loginId(member), owner.merchantId)).toMatchObject({ id: loginId(member), merchantId: owner.merchantId });
    expect(await held.getTeamMemberForMerchant(loginId(member), other.merchantId)).toBeUndefined();
    expect(await held.getTeamMemberForMerchant(999_999, owner.merchantId)).toBeUndefined();
    for (const tenant of INVALID_TENANTS) expect(await held.getTeamMemberForMerchant(loginId(member), tenant)).toBeUndefined();
  });

  test.each(["resend", "remove"])("%s reads its login through the business, never by the login's number alone", async (action) => {
    const { app, owner, member } = await seed();
    const target = action === "resend" ? await invited(app, owner) : loginId(member);
    const scoped = jest.spyOn(held, "getTeamMemberForMerchant");
    const byNumber = jest.spyOn(storage, "getUserById");
    const res = await send(app, action, owner, target);
    expect(res.status).toBe(200);
    expect(scoped.mock.calls).toEqual([[target, owner.merchantId]]);
    // The sign-in check reads the caller's own login; nothing reads the target by its number alone.
    expect(byNumber.mock.calls.filter(([id]) => id === target)).toEqual([]);
  });

  test.each(["resend", "remove"])("%s answers another business's login as a missing one and changes nothing", async (action) => {
    const { app, owner, other } = await seed();
    // The other business's teammate moves it to the team plan, so it has a seat for an invite too.
    const theirs = loginId(await createMemberPrincipal(other.merchantId));
    const foreign = action === "resend" ? await invited(app, other) : theirs;
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    try {
      const res = await send(app, action, owner, foreign);
      const missing = await send(app, action, owner, 999_999);
      expect(res.status).toBe(404);
      expect({ status: res.status, body: res.body }).toEqual({ status: missing.status, body: missing.body });
      expect(storageSnapshot()).toBe(before);
      effects.assertNone();
    } finally { effects.restore(); }
  });
});

describe("R1-T7 S5b — a property tenant's history is storage's to write", () => {
  const FIELDS = { firstName: "Nia", lastName: "Newcomer", propertyAddress: "2 Test Road", email: "nia@example.test" };

  test.each([
    ["create", "createTenantProfile", "Tenant_Created", 201],
    ["archive", "archiveTenantProfile", "Tenant_Archived", 200],
    ["restore", "unarchiveTenantProfile", "Tenant_Restored", 200],
  ] as const)("%s is one storage write; the route logs nothing itself", async (action, write, eventType, status) => {
    const { app, owner } = await seed();
    const fake = fakeProperty();
    seedProperty(fake, owner.merchantId, action === "restore" ? { tenant: { status: "archived" } } : {});
    const res = action === "create"
      ? await request(app).post("/api/property/tenants").set(signedIn(owner)).send(FIELDS)
      : await request(app).post(`/api/property/tenants/${TENANT}/${action === "archive" ? "archive" : "unarchive"}`).set(signedIn(owner));
    expect(res.status).toBe(status);
    expect(fake.writes).toEqual([write]);
    const tenantId = action === "create" ? MADE_TENANT : TENANT;
    expect(fake.events.map((event) => [event.tenantProfileId, event.merchantId, event.eventType])).toEqual([[tenantId, owner.merchantId, eventType]]);
    if (action === "create") expect(fake.events[0].payload).toEqual({ firstName: "Nia", lastName: "Newcomer", propertyAddress: "2 Test Road" });
  });
});

describe("R1-T7 S5b — stopping a device", () => {
  const WEB = "https://fcm.googleapis.com/fcm/send/stragglers-web";
  const TOKEN = "stragglers-iphone-token";
  const ROUTES = [
    { name: "the web switch", path: "/api/push/unsubscribe", endpoint: WEB, body: { endpoint: WEB }, refusal: "Not authorized to unsubscribe this endpoint" },
    { name: "one iPhone", path: "/api/push/native-unsubscribe", endpoint: `apns://${TOKEN}`, body: { deviceToken: TOKEN }, refusal: "Not authorized to unsubscribe this device" },
  ] as const;
  const register = (who: Principal, endpoint: string) =>
    storage.createPushSubscription({ merchantId: who.merchantId, userId: loginId(who), endpoint, p256dh: "key", auth: "auth" });
  const stored = (endpoint: string) => held.pushSubs.find((sub: any) => sub.endpoint === endpoint);

  test.each(ROUTES)("$name names the business and the address in one storage call", async (route) => {
    const { app, owner } = await seed();
    await register(owner, route.endpoint);
    const scoped = jest.spyOn(held, "deactivatePushSubscriptionForMerchant");
    const list = jest.spyOn(storage, "getPushSubscriptionsByMerchant");
    const byAddress = jest.spyOn(storage, "deactivatePushSubscriptionByEndpoint");
    const res = await request(app).post(route.path).set(signedIn(owner)).send(route.body);
    expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { success: true } });
    expect(scoped.mock.calls).toEqual([[owner.merchantId, route.endpoint]]);
    expect(list).not.toHaveBeenCalled();
    expect(byAddress).not.toHaveBeenCalled();
    expect(stored(route.endpoint)).toMatchObject({ merchantId: owner.merchantId, isActive: false });
  });

  test.each(ROUTES)("$name refuses another business's device, a stopped one and an unknown one, and leaves them as they were", async (route) => {
    const { app, owner, other } = await seed();
    await register(other, route.endpoint);
    const refused = await request(app).post(route.path).set(signedIn(owner)).send(route.body);
    expect({ status: refused.status, body: refused.body }).toEqual({ status: 403, body: { message: route.refusal } });
    expect(stored(route.endpoint)).toMatchObject({ merchantId: other.merchantId, isActive: true });
    // Its own business stops it; a second stop finds nothing to stop.
    expect((await request(app).post(route.path).set(signedIn(other)).send(route.body)).status).toBe(200);
    expect((await request(app).post(route.path).set(signedIn(other)).send(route.body)).status).toBe(403);
  });

  test.each(ROUTES)("$name leaves on a device another business registered while the stop was handled", async (route) => {
    const { app, owner, other } = await seed();
    await register(owner, route.endpoint);
    // Any read the route makes of the business's devices is answered, and then the device moves.
    const read = storage.getPushSubscriptionsByMerchant.bind(storage);
    jest.spyOn(storage, "getPushSubscriptionsByMerchant").mockImplementation(async (merchantId) => {
      const rows = (await read(merchantId)).map((row) => ({ ...row }));
      await register(other, route.endpoint);
      return rows;
    });
    await request(app).post(route.path).set(signedIn(owner)).send(route.body);
    const device = stored(route.endpoint);
    expect(device.merchantId === owner.merchantId || device.isActive).toBe(true);
  });
});

describe("R1-T7 S5b — the print request's board", () => {
  const pdf = () => { const bytes = Buffer.alloc(2_000, 0x41); Buffer.from("%PDF-1.3\n").copy(bytes); return bytes.toString("base64"); };
  const body = (stoneId: number) => ({ pdf: pdf(), stoneId, layout: "A5 Portrait", submitterName: "Jamie", submitterEmail: "jamie@harness.test" });
  async function board(app: any, who: Principal): Promise<number> {
    const res = await request(app).post(`/api/merchants/${who.merchantId}/tapt-stones`).set(signedIn(who)).send({ name: "Front till" });
    if (res.status !== 200) throw new Error(`fixture: board failed ${res.status}`);
    return res.body.id;
  }

  test("is read through the business, never by the board's number alone", async () => {
    const { app, owner } = await seed();
    const stoneId = await board(app, owner);
    const scoped = jest.spyOn(storage, "getTaptStoneForMerchant");
    const byNumber = jest.spyOn(storage, "getTaptStone");
    const res = await request(app).post("/api/board-builder/submit").set(signedIn(owner)).send(body(stoneId));
    expect(res.status).toBe(200);
    expect(scoped.mock.calls).toEqual([[stoneId, owner.merchantId]]);
    expect(byNumber).not.toHaveBeenCalled();
  });

  test("another business's board, a removed one and a missing one are all not found, and nothing is sent", async () => {
    const { app, owner, other } = await seed();
    const foreign = await board(app, other);
    const removed = await board(app, owner);
    expect(await storage.deleteTaptStoneForMerchant(removed, owner.merchantId)).toBe(true);
    const effects = observeRefusalEffects();
    try {
      for (const stoneId of [foreign, removed, 999_999]) {
        const res = await request(app).post("/api/board-builder/submit").set(signedIn(owner)).send(body(stoneId));
        expect({ status: res.status, body: res.body }).toEqual({ status: 404, body: { message: "Payment board not found" } });
      }
      effects.assertNone();
    } finally { effects.restore(); }
  });
});
