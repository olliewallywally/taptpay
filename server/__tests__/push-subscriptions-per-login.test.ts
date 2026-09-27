import "./support/test-env";
import "./support/push-test-env";

import crypto from "crypto";
import request from "supertest";
import {
  VALID_PASSWORD, bearer, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage,
} from "./support/http-harness";

/**
 * R1-T4 phase D follow-up (owner decision 2026-09-22). Push subscriptions
 * belonged to the merchant, so a device kept receiving payment notifications
 * after it was signed out, and turning notifications off on one iPhone turned
 * them off on every iPhone of the business. Each subscription now records the
 * login that made it: Log Out stops that device; "sign out of all devices", a
 * password reset and a password change stop every device of that login — and
 * the merchant's unattributed subscriptions from before, which cannot be shown
 * to belong to anyone else.
 */

type App = Awaited<ReturnType<typeof createTestApp>>["app"];
type Principal = Awaited<ReturnType<typeof createOwnerPrincipal>>;

beforeEach(() => resetTestStorage());

const web = (name: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
  keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
});
const subscribeWeb = (app: App, who: Principal | { token: string }, name: string) =>
  request(app).post("/api/push/subscribe").set(bearer(who)).send({ subscription: web(name) });
const subscribeNative = (app: App, who: Principal, deviceToken: string) =>
  request(app).post("/api/push/native-subscribe").set(bearer(who)).send({ deviceToken });
const activeEndpoints = async (merchantId: number) =>
  (await storage.getPushSubscriptionsByMerchant(merchantId)).map((s) => s.endpoint).sort();
const loginOf = async (merchantId: number, endpoint: string) =>
  (await storage.getPushSubscriptionsByMerchant(merchantId)).find((s) => s.endpoint === endpoint)?.userId;

describe("push subscriptions belong to a login", () => {
  it("records the login that made a subscription, and moves it when another login re-registers the device", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    expect((await subscribeWeb(app, owner, "a")).status).toBe(200);
    expect(await loginOf(owner.merchantId, web("a").endpoint)).toBe(owner.user.id);
    expect((await subscribeWeb(app, member, "a")).status).toBe(200);
    expect(await loginOf(owner.merchantId, web("a").endpoint)).toBe(member.user.id);
    expect((await subscribeNative(app, owner, "device-token-owner")).status).toBe(200);
    expect(await loginOf(owner.merchantId, "apns://device-token-owner")).toBe(owner.user.id);
  });

  it("sign out everywhere stops that login's devices and unattributed ones, never a teammate's", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribeWeb(app, owner, "owner-laptop");
    await subscribeNative(app, owner, "owner-phone");
    await subscribeWeb(app, member, "member-laptop");
    await storage.createPushSubscription({
      merchantId: owner.merchantId, endpoint: "https://fcm.googleapis.com/fcm/send/from-before", p256dh: "p", auth: "a", userId: null,
    });

    expect((await request(app).post("/api/auth/sign-out-everywhere").set(bearer(owner))).status).toBe(204);
    expect(await activeEndpoints(owner.merchantId)).toEqual([web("member-laptop").endpoint]);
  });

  it("a password reset stops that login's devices", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribeWeb(app, owner, "owner-laptop");
    await subscribeWeb(app, member, "member-laptop");
    const raw = crypto.randomBytes(32).toString("hex");
    await storage.setUserResetToken(owner.user.id, crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      new Date(Date.now() + 3_600_000));

    const reset = await request(app).post("/api/auth/reset-password")
      .send({ token: raw, password: "NewHarness456", confirmPassword: "NewHarness456" });
    expect(reset.status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual([web("member-laptop").endpoint]);
  });

  it("a password change stops that login's devices; this device re-registers under its fresh token", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    await subscribeWeb(app, owner, "this-laptop");
    await subscribeWeb(app, owner, "lost-phone");

    const change = await request(app).put(`/api/merchants/${owner.merchantId}/change-password`).set(bearer(owner))
      .send({ currentPassword: VALID_PASSWORD, newPassword: "Changed789", confirmPassword: "Changed789" });
    expect(change.status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual([]);

    expect((await subscribeWeb(app, owner, "lost-phone")).status).toBe(401);
    expect((await subscribeWeb(app, { token: change.body.token }, "this-laptop")).status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual([web("this-laptop").endpoint]);
  });

  it("Log Out on a device stops only that device", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    await subscribeWeb(app, owner, "a");
    await subscribeWeb(app, owner, "b");
    const off = await request(app).post("/api/push/unsubscribe").set(bearer(owner)).send({ endpoint: web("a").endpoint });
    expect(off.status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual([web("b").endpoint]);
  });

  it("turning notifications off on one iPhone stops only that iPhone", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribeNative(app, owner, "owner-phone-1");
    await subscribeNative(app, owner, "owner-phone-2");
    await subscribeNative(app, member, "member-phone");

    const off = await request(app).post("/api/push/native-unsubscribe").set(bearer(owner)).send({ deviceToken: "owner-phone-1" });
    expect(off.status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual(["apns://member-phone", "apns://owner-phone-2"]);

    // Without a device token (registered before tokens were remembered): that login's iPhones only.
    expect((await request(app).post("/api/push/native-unsubscribe").set(bearer(owner)).send({})).status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual(["apns://member-phone"]);
  });

  it("removing a teammate's login takes their devices with it", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribeWeb(app, owner, "owner-laptop");
    await subscribeNative(app, member, "member-phone");

    expect((await request(app).delete(`/api/team/${member.user.id}`).set(bearer(owner))).status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual([web("owner-laptop").endpoint]);
  });

  // Owner decision 2026-09-22 (docs/decisions/2026-09-22-r1-t4-push-follow-up-owner-answers.md).
  it("disabling a teammate's login stops their devices; the owner's stay", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribeWeb(app, owner, "owner-laptop");
    await subscribeWeb(app, member, "member-laptop");
    await subscribeNative(app, member, "member-phone");

    const disabled = await request(app).put(`/api/team/${member.user.id}/status`).set(bearer(owner))
      .send({ status: "disabled" });
    expect(disabled.status).toBe(200);
    expect(await activeEndpoints(owner.merchantId)).toEqual([web("owner-laptop").endpoint]);
  });

  it("refuses to stop another business's iPhone", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const stranger = await createOwnerPrincipal();
    await subscribeNative(app, owner, "owner-phone");

    const off = await request(app).post("/api/push/native-unsubscribe").set(bearer(stranger)).send({ deviceToken: "owner-phone" });
    expect(off.status).toBe(403);
    expect(await activeEndpoints(owner.merchantId)).toEqual(["apns://owner-phone"]);
  });
});

/**
 * Ending the sessions is the security action; stopping the notifications follows
 * it. A fault in the second must neither undo the first nor be reported as if
 * the first had failed — the caller's own token is already spent, so a "please
 * try again" could never be acted on. The fault is logged.
 */
describe("a fault stopping notifications never undoes or misreports ending the sessions", () => {
  const failStopping = () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(storage, "deactivatePushSubscriptionsForLogin").mockRejectedValueOnce(new Error("synthetic fault"));
    return logged;
  };
  const loggedTags = (logged: jest.SpyInstance) => logged.mock.calls.map(([tag]) => tag);

  it("sign out everywhere still answers 204, and every session has ended", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const logged = failStopping();

    expect((await request(app).post("/api/auth/sign-out-everywhere").set(bearer(owner))).status).toBe(204);
    expect((await subscribeWeb(app, owner, "after")).status).toBe(401);
    expect(loggedTags(logged)).toContain("[SIGN_OUT_EVERYWHERE_PUSH_STOP]");
  });

  it("disabling a teammate still succeeds, and the teammate is refused", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const logged = failStopping();

    const disabled = await request(app).put(`/api/team/${member.user.id}/status`).set(bearer(owner))
      .send({ status: "disabled" });
    expect(disabled.status).toBe(200);
    expect((await subscribeWeb(app, member, "after")).status).toBe(403);
    expect(loggedTags(logged)).toContain("[TEAM_DISABLE_PUSH_STOP]");
  });

  it("a password reset still succeeds", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const raw = crypto.randomBytes(32).toString("hex");
    await storage.setUserResetToken(owner.user.id, crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      new Date(Date.now() + 3_600_000));
    const logged = failStopping();

    const reset = await request(app).post("/api/auth/reset-password")
      .send({ token: raw, password: "NewHarness456", confirmPassword: "NewHarness456" });
    expect(reset.status).toBe(200);
    expect((await subscribeWeb(app, owner, "after")).status).toBe(401);
    expect(loggedTags(logged)).toContain("[RESET_PUSH_STOP]");
  });

  it("a password change still succeeds and hands this device its fresh token", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const logged = failStopping();

    const change = await request(app).put(`/api/merchants/${owner.merchantId}/change-password`).set(bearer(owner))
      .send({ currentPassword: VALID_PASSWORD, newPassword: "Changed789", confirmPassword: "Changed789" });
    expect(change.status).toBe(200);
    expect((await subscribeWeb(app, owner, "after")).status).toBe(401);
    expect((await subscribeWeb(app, { token: change.body.token }, "after")).status).toBe(200);
    expect(loggedTags(logged)).toContain("[PASSWORD_CHANGE_PUSH_STOP]");
  });
});
