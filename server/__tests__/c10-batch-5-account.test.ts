import "./support/test-env";
import "./support/push-test-env";

import request from "supertest";
import {
  bearer, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot,
} from "./support/http-harness";

/**
 * C10 route review, batch 5 (the account's routes), 2026-09-26.
 */
type App = Awaited<ReturnType<typeof createTestApp>>["app"];
type Principal = Awaited<ReturnType<typeof createOwnerPrincipal>>;

beforeEach(() => resetTestStorage());

const web = (name: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
  keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
});
const subscribeWeb = (app: App, who: Principal, name: string) =>
  request(app).post("/api/push/subscribe").set(bearer(who)).send({ subscription: web(name) });
const activeEndpoints = async (merchantId: number) =>
  (await storage.getPushSubscriptionsByMerchant(merchantId)).map((s) => s.endpoint).sort();
const fromBefore = (merchantId: number, name: string) => storage.createPushSubscription({
  merchantId, endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, p256dh: "p", auth: "a", userId: null,
});

/**
 * Owner decision 2026-09-22 (docs/decisions/2026-09-22-r1-t4-push-follow-up-owner-answers.md):
 * disabling a teammate stops their devices' notifications, as "sign out everywhere" does,
 * unattributed subscriptions (from before 0029) included. The question said "Removing a teammate
 * already stops them": true of subscriptions recorded against the login (0029's cascade), not of
 * the unattributed ones, which removal left on.
 */
describe("removing a teammate stops their devices' notifications, as disabling does", () => {
  it("stops the business's unattributed subscriptions too", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribeWeb(app, owner, "owner-laptop");
    await subscribeWeb(app, member, "member-laptop");
    await fromBefore(owner.merchantId, "from-before");

    const res = await request(app).delete(`/api/team/${member.user.id}`).set(bearer(owner));

    expect(res.status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual([web("owner-laptop").endpoint]);
  });

  it("never touches another business's devices", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const elsewhere = await createOwnerPrincipal();
    await subscribeWeb(app, elsewhere, "elsewhere-laptop");
    await fromBefore(elsewhere.merchantId, "elsewhere-from-before");

    expect((await request(app).delete(`/api/team/${member.user.id}`).set(bearer(owner))).status).toBe(200);

    expect(await activeEndpoints(elsewhere.merchantId)).toEqual([
      web("elsewhere-from-before").endpoint, web("elsewhere-laptop").endpoint,
    ].sort());
  });

  it("still removes the login when stopping notifications fails, and says so only in the log", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const stop = jest.spyOn(storage, "deactivatePushSubscriptionsForLogin").mockRejectedValueOnce(new Error("database down"));
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app).delete(`/api/team/${member.user.id}`).set(bearer(owner));

    expect(res.status).toBe(200);
    expect(await storage.getUserById(member.user.id)).toBeUndefined();
    expect(stop).toHaveBeenCalledWith(owner.merchantId, member.user.id);
    expect(log).toHaveBeenCalledWith("[TEAM_REMOVE_PUSH_STOP]", expect.any(Error));
    stop.mockRestore();
    log.mockRestore();
  });
});

describe("only the account owner changes the plan (guards for isAccountOwner)", () => {
  it.each([
    ["put", "/api/subscription/plan", { planId: "starter" }, "Only the account owner can change the plan"],
    ["post", "/api/subscription/cancel", { reason: "Too dear" }, "Only the account owner can cancel the subscription"],
    ["post", "/api/subscription/resume", {}, "Only the account owner can change the subscription"],
  ] as const)("a teammate's %s %s is 403 and changes nothing", async (method, path, body, message) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const before = storageSnapshot();

    const res = await request(app)[method](path).set(bearer(member)).send(body);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message });
    expect(storageSnapshot()).toBe(before);
  });

  it("the owner still cancels and resumes", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const cancelled = await request(app).post("/api/subscription/cancel").set(bearer(owner)).send({ reason: "Too dear" });
    expect(cancelled.status).toBe(200);
    const resumed = await request(app).post("/api/subscription/resume").set(bearer(owner)).send({});
    expect([200, 409]).toContain(resumed.status);
    expect(resumed.status).not.toBe(403);
  });
});

describe("turning notifications off is never reported done when it failed", () => {
  it.each([
    ["the web switch", "/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/owner-laptop" }],
    ["one iPhone", "/api/push/native-unsubscribe", { deviceToken: "owner-phone-token" }],
  ] as const)("%s answers 500 when stopping it fails", async (_what, path, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    await subscribeWeb(app, owner, "owner-laptop");
    await request(app).post("/api/push/native-subscribe").set(bearer(owner)).send({ deviceToken: "owner-phone-token" });
    const stop = jest.spyOn(storage, "deactivatePushSubscriptionByEndpoint").mockRejectedValueOnce(new Error("database down"));
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app).post(path).set(bearer(owner)).send(body);

    expect(res.status).toBe(500);
    expect(res.body.success).not.toBe(true);
    stop.mockRestore();
    log.mockRestore();
  });
});
