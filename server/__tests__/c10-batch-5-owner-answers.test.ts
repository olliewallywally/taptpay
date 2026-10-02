import "./support/test-env";
import "./support/push-test-env";

import request from "supertest";
import {
  signedIn, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-5-owner-answers.md).
 */
type App = Awaited<ReturnType<typeof createTestApp>>["app"];
type Principal = Awaited<ReturnType<typeof createOwnerPrincipal>>;

beforeEach(() => resetTestStorage());

const fcm = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;
const subscribe = (app: App, who: Principal, endpoint: string) =>
  request(app).post("/api/push/subscribe").set(signedIn(who))
    .send({ subscription: { endpoint, keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` } } });
const setSwitches = (app: App, who: Principal, switches: Record<string, boolean>) =>
  request(app).put("/api/push/preferences").set(signedIn(who)).send(switches);
const switchesOf = async (app: App, who: Principal) =>
  (await request(app).get("/api/push/preferences").set(signedIn(who))).body.preferences;
const rowOf = async (merchantId: number, endpoint: string) =>
  (await storage.getPushSubscriptionsByMerchant(merchantId)).find((sub) => sub.endpoint === endpoint);

const DEFAULTS = { paymentReceived: true, dailyPayoutSummary: true, failedPaymentAlerts: false };
const QUIET = { paymentReceived: false, dailyPayoutSummary: false, failedPaymentAlerts: false };

/**
 * Answer 1: "Only the real services". The server POSTs to a registered endpoint on every payment,
 * so an address anywhere else let any signed-in login point the server at a host of its choosing.
 */
describe("a device registers only through a browser push service", () => {
  it.each([
    "https://push.example.test/device",
    "https://169.254.169.254/latest/meta-data",
    "https://fcm.googleapis.com.attacker.test/fcm/send/x",
    "http://fcm.googleapis.com/fcm/send/x",
  ])("refuses %s, and stores nothing", async (endpoint) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    const res = await subscribe(app, owner, endpoint);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Notifications can only use a browser's own push service." });
    expect(storageSnapshot()).toBe(before);
  });

  it.each([
    fcm("chrome"),
    "https://updates.push.services.mozilla.com/wpush/v2/firefox",
    "https://wns2-bl2p.notify.windows.com/w/?token=edge",
    "https://web.push.apple.com/safari",
  ])("accepts %s", async (endpoint) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    expect((await subscribe(app, owner, endpoint)).status).toBe(200);
    expect(await rowOf(owner.merchantId, endpoint)).toMatchObject({ isActive: true, userId: owner.user.id });
  });

  it("leaves the app's iPhones as they were (Apple's device token)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app).post("/api/push/native-subscribe").set(signedIn(owner)).send({ deviceToken: "owner-phone-token" });

    expect(res.status).toBe(200);
    expect(await rowOf(owner.merchantId, "apns://owner-phone-token")).toMatchObject({ isActive: true });
  });
});

/**
 * Answer 2: "Each login its own". The switches were the business's: a teammate's change reached
 * every device, the owner's included.
 */
describe("each login has its own notification switches", () => {
  it("a teammate's switches change only their own devices", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribe(app, owner, fcm("owner-laptop"));
    await subscribe(app, member, fcm("member-laptop"));

    expect((await setSwitches(app, member, QUIET)).status).toBe(200);

    expect(await switchesOf(app, member)).toEqual(QUIET);
    expect(await switchesOf(app, owner)).toEqual(DEFAULTS);
    expect((await rowOf(owner.merchantId, fcm("owner-laptop")))?.preferences).toEqual(DEFAULTS);
    expect((await rowOf(owner.merchantId, fcm("member-laptop")))?.preferences).toEqual(QUIET);
  });

  it("a login's new device starts with that login's switches, not another login's", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribe(app, owner, fcm("owner-laptop"));
    await setSwitches(app, owner, QUIET);

    await subscribe(app, member, fcm("member-phone"));

    expect((await rowOf(owner.merchantId, fcm("member-phone")))?.preferences).toEqual(DEFAULTS);
    expect(await switchesOf(app, member)).toEqual(DEFAULTS);
  });

  it("a device that moves to another login takes that login's switches", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribe(app, owner, fcm("owner-laptop"));
    await subscribe(app, owner, fcm("shared-till"));
    await setSwitches(app, owner, QUIET);

    await subscribe(app, member, fcm("shared-till"));

    expect(await rowOf(owner.merchantId, fcm("shared-till"))).toMatchObject({ userId: member.user.id, preferences: DEFAULTS });
    expect(await switchesOf(app, owner)).toEqual(QUIET);
  });

  it("a login's switches live on its devices: with none left, it reads the defaults", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await subscribe(app, owner, fcm("shared-till"));
    await setSwitches(app, owner, QUIET);

    await subscribe(app, member, fcm("shared-till"));

    expect(await switchesOf(app, owner)).toEqual(DEFAULTS);
  });

  it("the notification status is the login's own", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    await request(app).post("/api/push/native-subscribe").set(signedIn(owner)).send({ deviceToken: "owner-phone-token" });

    const mine = await request(app).get("/api/push/status").set(signedIn(member));
    const theirs = await request(app).get("/api/push/status").set(signedIn(owner));

    expect(mine.body).toMatchObject({ subscribed: false, deviceCount: 0, nativeSubscribed: false, preferences: DEFAULTS });
    expect(theirs.body).toMatchObject({ subscribed: true, deviceCount: 1, nativeSubscribed: true });
  });
});
