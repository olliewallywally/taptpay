import "./support/test-env";
import "./support/push-test-env";
import { ADMIN_TEST_PASSWORD } from "./support/admin-sign-in-test-env";

import crypto from "crypto";
import request from "supertest";
import { config } from "../config";
import { isStreamSessionActive } from "../auth";
import { BUSINESS_SESSION_IDLE_MS, SESSION_REPLACED_GRACE_MS, SESSION_ROTATE_AFTER_MS } from "../auth-sessions";
import { GOOGLE_STATE_ONCE_POLICY, googleStateBucket } from "../auth-throttle";
import { OAUTH_STATE_TTL_MS, startGoogleSignIn, verifyGoogleSignInState } from "../google-sign-in";
import { SSE_REVALIDATE_EVERY_MS, SseBroker, sseBroker, type SseAudience } from "../sse-broker";
import {
  VALID_PASSWORD,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
  useFakeClock,
  type Principal,
} from "./support/http-harness";
import {
  BUSINESS_COOKIE,
  sendAs,
  sessionIdOf,
  signInAdminBrowser,
  signInBrowser,
  type Browser,
} from "./support/session-browser";

/**
 * The external review's R1-T4 fixes (2026-09-29, written against b0500c5d, where a sign-in was a
 * token), carried onto phase E, where a browser's sign-in is a session cookie. As written, the fixes
 * re-checked a stream by its Authorization header only, so a cookie's stream — every browser's, after
 * phase E — would have gone unchecked. Here: a cookie's stream is checked by its session; the check
 * writes nothing, is not a use, and survives the daily swap of the secret; the broker stops what it
 * closes; push registration and the Google start hold on the cookie path too.
 */

type App = Awaited<ReturnType<typeof createTestApp>>["app"];

jest.setTimeout(30_000);
beforeEach(() => {
  resetTestStorage();
  sseBroker.clear();
});

const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const sessionOf = (browser: Browser) => ({ id: sessionIdOf(browser.cookie), realm: "business" as const });

/** A stream held by another instance: its own broker, checking the session in the storage both share. */
function streamOnAnotherInstance(merchantId: number, userId: number, browser: Browser) {
  const otherInstance = new SseBroker();
  const connection = { write: jest.fn(), end: jest.fn() };
  const session = sessionOf(browser);
  const audience: SseAudience = { kind: "merchant", userId, principal: "user", sessionId: session.id };
  otherInstance.subscribe(merchantId, audience, connection, () => isStreamSessionActive(session, merchantId));
  connection.write.mockClear(); // the "connected" greeting
  return { otherInstance, connection };
}

describe("a stream opened on a session cookie is checked by its session", () => {
  it("the events route gives a cookie's stream a check that answers for that session", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signInBrowser(app, owner.user.email);
    let check: (() => Promise<boolean>) | undefined;
    const subscribe = jest.spyOn(sseBroker, "subscribe").mockImplementation((_merchant, _audience, connection, authorize) => {
      check = authorize;
      connection.end?.();
      return () => undefined;
    });
    try {
      const opened = await request(app).get(`/api/merchants/${owner.merchantId}/events`).set("Cookie", `${BUSINESS_COOKIE}=${browser.cookie}`);
      expect(opened.status).toBe(200);
      expect(check).toEqual(expect.any(Function));
      expect(await check!()).toBe(true);
      // Another instance ends the session in shared storage, without telling this broker.
      expect(await storage.revokeAuthSession(sessionIdOf(browser.cookie), "logout", new Date())).toBe(true);
      expect(await check!()).toBe(false);
    } finally {
      subscribe.mockRestore();
    }
  });

  it("a board's stream is given no check: it has no sign-in", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await storage.createNextTaptStone(owner.merchantId, "Front till");
    const browser = await signInBrowser(app, owner.user.email);
    const checks: unknown[] = [];
    const subscribe = jest.spyOn(sseBroker, "subscribe").mockImplementation((_merchant, _audience, connection, authorize) => {
      checks.push(authorize);
      connection.end?.();
      return () => undefined;
    });
    try {
      // A board's page keeps its board stream even in a browser signed in to the business.
      const opened = await request(app).get(`/api/merchants/${owner.merchantId}/events?stoneId=${board.id}`)
        .set("Cookie", `${BUSINESS_COOKIE}=${browser.cookie}`);
      expect(opened.status).toBe(200);
      expect(checks).toEqual([undefined]);
    } finally {
      subscribe.mockRestore();
    }
  });

  type Ending = (ctx: { app: App; owner: Principal; member: Principal; ownerBrowser: Browser; watched: Browser }) => Promise<void>;
  const expectStatus = (res: request.Response, status: number) => expect(res.status).toBe(status);

  // Each row: whose stream is watched, and what ends that session on the instance the request reaches.
  const ENDINGS: Array<[string, "owner" | "member", Ending]> = [
    ["Log Out", "owner", async ({ app, watched }) => expectStatus(await sendAs(app, watched, "post", "/api/auth/logout"), 204)],
    ["sign out everywhere", "owner", async ({ app, watched }) =>
      expectStatus(await sendAs(app, watched, "post", "/api/auth/sign-out-everywhere"), 204)],
    ["sign out everywhere, from another device of the login", "owner", async ({ app, ownerBrowser }) =>
      expectStatus(await sendAs(app, ownerBrowser, "post", "/api/auth/sign-out-everywhere"), 204)],
    ["a password change on another device of the login", "owner", async ({ app, owner, ownerBrowser }) =>
      expectStatus(await sendAs(app, ownerBrowser, "put", `/api/merchants/${owner.merchantId}/change-password`, {
        currentPassword: VALID_PASSWORD, newPassword: "New-password-3", confirmPassword: "New-password-3",
      }), 200)],
    ["a password reset", "owner", async ({ app, owner }) => {
      const resetToken = crypto.randomBytes(32).toString("hex");
      await storage.setUserResetToken(owner.user.id, sha256(resetToken), new Date(Date.now() + 60 * 60_000));
      expectStatus(await request(app).post("/api/auth/reset-password")
        .send({ token: resetToken, password: "New-password-2", confirmPassword: "New-password-2" }), 200);
    }],
    ["disabling the teammate", "member", async ({ app, member, ownerBrowser }) =>
      expectStatus(await sendAs(app, ownerBrowser, "put", `/api/team/${member.user.id}/status`, { status: "disabled" }), 200)],
    ["removing the teammate", "member", async ({ app, member, ownerBrowser }) =>
      expectStatus(await sendAs(app, ownerBrowser, "delete", `/api/team/${member.user.id}`), 200)],
    ["the login's session version advancing alone", "owner", async ({ owner }) => {
      expect(await storage.advanceUserSessionVersion(owner.user.id)).toBe(true);
    }],
  ];

  it.each(ENDINGS)("%s stops a private event on another instance, and closes the stream there", async (_name, whose, end) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const ownerBrowser = await signInBrowser(app, owner.user.email);
    const watchedLogin = whose === "owner" ? owner : member;
    const watched = await signInBrowser(app, watchedLogin.user.email);
    const { otherInstance, connection } = streamOnAnotherInstance(owner.merchantId, watchedLogin.user.id, watched);
    try {
      await otherInstance.broadcast(owner.merchantId, null, { type: "transaction_updated", transactionId: 1 });
      expect(connection.write).toHaveBeenCalledTimes(1);
      connection.write.mockClear();

      await end({ app, owner, member, ownerBrowser, watched });

      await otherInstance.broadcast(owner.merchantId, null, { type: "transaction_updated", transactionId: 2 });
      expect(connection.write).not.toHaveBeenCalled();
      expect(connection.end).toHaveBeenCalledTimes(1);
      expect(otherInstance.subscriberCount()).toBe(0);
    } finally {
      otherInstance.clear();
    }
  });

  it("a session that has run out closes its stream too: a day unused, however often the stream was checked", async () => {
    const clock = useFakeClock(new Date("2026-10-06T08:00:00.000Z"));
    try {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const browser = await signInBrowser(app, owner.user.email);
      const session = sessionOf(browser);
      const signedIn = (await storage.getAuthSession(session.id))!;

      // Checked every few minutes for a day: never a use, so nothing is written and the day still runs out.
      for (let minutes = 5; minutes < 24 * 60; minutes += 7) {
        clock.advance(7 * 60_000);
        expect(await isStreamSessionActive(session, owner.merchantId)).toBe(true);
      }
      expect(await storage.getAuthSession(session.id)).toEqual(signedIn);

      clock.advance(BUSINESS_SESSION_IDLE_MS);
      expect(await isStreamSessionActive(session, owner.merchantId)).toBe(false);
      expect(await storage.getAuthSession(session.id)).toEqual(signedIn);
    } finally {
      clock.restore();
    }
  });

  it("the daily swap of the secret neither closes an open stream nor is taken for a stolen copy", async () => {
    const clock = useFakeClock(new Date("2026-10-06T08:00:00.000Z"));
    try {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const browser = await signInBrowser(app, owner.user.email);
      const session = sessionOf(browser);
      const first = browser.cookie;
      clock.advance(20 * 60 * 60_000);
      expect((await sendAs(app, browser, "get", "/api/auth/me")).status).toBe(200);
      clock.advance(SESSION_ROTATE_AFTER_MS - 20 * 60 * 60_000 + 1_000);
      await sendAs(app, browser, "get", "/api/auth/me"); // offered, and followed
      expect(browser.cookie).not.toBe(first);
      await sendAs(app, browser, "get", "/api/auth/me"); // the new secret's first use
      clock.advance(SESSION_REPLACED_GRACE_MS + 1_000); // the secret the stream was opened with is now a replaced one

      expect(await isStreamSessionActive(session, owner.merchantId)).toBe(true);
      expect((await storage.getAuthSession(session.id))!.revokedAt).toBeNull();
      expect((await sendAs(app, browser, "get", "/api/auth/me")).status).toBe(200);
    } finally {
      clock.restore();
    }
  });

  it("answers only for the stream's own business; the platform admin's session for any", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const browser = await signInBrowser(app, owner.user.email);
    const admin = await signInAdminBrowser(app, ADMIN_TEST_PASSWORD);
    const adminSession = { id: sessionIdOf(admin.cookie), realm: "admin" as const };

    expect(await isStreamSessionActive(sessionOf(browser), owner.merchantId)).toBe(true);
    expect(await isStreamSessionActive(sessionOf(browser), other.merchantId)).toBe(false);
    expect(await isStreamSessionActive(adminSession, owner.merchantId)).toBe(true);
    expect(await isStreamSessionActive(adminSession, other.merchantId)).toBe(true);
    // A session is its own realm's: a business session's id is no admin session.
    expect(await isStreamSessionActive({ id: sessionIdOf(browser.cookie), realm: "admin" }, owner.merchantId)).toBe(false);
    expect(await isStreamSessionActive({ id: "no-such-session-0000000", realm: "business" }, owner.merchantId)).toBe(false);
  });

  it("the admin's stream closes when the admin's session ends, or the admin's credentials change", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const admin = await signInAdminBrowser(app, ADMIN_TEST_PASSWORD);
    const adminSession = { id: sessionIdOf(admin.cookie), realm: "admin" as const };
    const row = (await storage.getAuthSession(adminSession.id))!;
    // A session begun under other admin credentials (the email or password hash has changed since).
    const stale = { id: crypto.randomBytes(16).toString("base64url"), realm: "admin" as const };
    await storage.createAuthSession({ ...row, id: stale.id, adminTag: "a".repeat(43) }, new Date());

    expect(await isStreamSessionActive(adminSession, owner.merchantId)).toBe(true);
    expect(await isStreamSessionActive(stale, owner.merchantId)).toBe(false);
    expect((await sendAs(app, admin, "post", "/api/admin/auth/logout")).status).toBe(204);
    expect(await isStreamSessionActive(adminSession, owner.merchantId)).toBe(false);
  });

  it("a storage fault closes the stream rather than leaving it open unchecked", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signInBrowser(app, owner.user.email);
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const read = jest.spyOn(storage, "getAuthSession").mockRejectedValue(new Error("the database did not answer"));
    try {
      expect(await isStreamSessionActive(sessionOf(browser), owner.merchantId)).toBe(false);
    } finally {
      read.mockRestore();
      logged.mockRestore();
    }
    expect(await isStreamSessionActive(sessionOf(browser), owner.merchantId)).toBe(true);
  });

  it("an idle stream of an ended session is closed at its next check on another instance", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signInBrowser(app, owner.user.email);
    jest.useFakeTimers();
    const { otherInstance, connection } = streamOnAnotherInstance(owner.merchantId, owner.user.id, browser);
    try {
      await jest.advanceTimersByTimeAsync(SSE_REVALIDATE_EVERY_MS);
      expect(connection.end).not.toHaveBeenCalled();
      expect(await storage.revokeAuthSession(sessionIdOf(browser.cookie), "logout", new Date())).toBe(true);
      await jest.advanceTimersByTimeAsync(SSE_REVALIDATE_EVERY_MS);
      expect(connection.end).toHaveBeenCalledTimes(1);
      expect(connection.write).not.toHaveBeenCalled();
      expect(otherInstance.subscriberCount()).toBe(0);
    } finally {
      otherInstance.clear();
      jest.useRealTimers();
    }
  });
});

describe("the broker stops what it closes", () => {
  const audienceOf = (sessionId: string): SseAudience => ({ kind: "merchant", userId: 7, principal: "user", sessionId });
  const connectionStub = () => ({ write: jest.fn(), end: jest.fn() });

  it.each([
    ["Log Out's disconnectSession", (broker: SseBroker) => broker.disconnectSession("session-a")],
    ["disconnectUser", (broker: SseBroker) => broker.disconnectUser(3, 7)],
    ["clear", (broker: SseBroker) => broker.clear()],
  ])("%s leaves no check running for the stream it closed", async (_name, close) => {
    jest.useFakeTimers();
    const broker = new SseBroker();
    const authorize = jest.fn(async () => true);
    try {
      broker.subscribe(3, audienceOf("session-a"), connectionStub(), authorize);
      expect(jest.getTimerCount()).toBe(1);
      close(broker);
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(3 * SSE_REVALIDATE_EVERY_MS);
      expect(authorize).not.toHaveBeenCalled();
      expect(broker.subscriberCount()).toBe(0);
    } finally {
      broker.clear();
      jest.useRealTimers();
    }
  });

  it("a stream closed by its own check leaves no check running", async () => {
    jest.useFakeTimers();
    const broker = new SseBroker();
    const connection = connectionStub();
    const authorize = jest.fn(async () => false);
    try {
      broker.subscribe(3, audienceOf("session-a"), connection, authorize);
      await jest.advanceTimersByTimeAsync(SSE_REVALIDATE_EVERY_MS);
      expect(connection.end).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(3 * SSE_REVALIDATE_EVERY_MS);
      expect(authorize).toHaveBeenCalledTimes(1);
    } finally {
      broker.clear();
      jest.useRealTimers();
    }
  });

  it("a check that throws closes the stream, with the event not written", async () => {
    const broker = new SseBroker();
    const connection = connectionStub();
    try {
      broker.subscribe(3, audienceOf("session-a"), connection, async () => { throw new Error("the check itself failed"); });
      connection.write.mockClear();
      await broker.broadcast(3, null, { type: "transaction_updated", transactionId: 1 });

      expect(connection.write).not.toHaveBeenCalled();
      expect(connection.end).toHaveBeenCalledTimes(1);
      expect(broker.subscriberCount()).toBe(0);
    } finally {
      broker.clear();
    }
  });

  it("a connection that can no longer be written to is dropped, and the others still get the event", async () => {
    const broker = new SseBroker();
    const gone = connectionStub();
    const live = connectionStub();
    try {
      broker.subscribe(3, audienceOf("session-a"), gone, async () => true);
      broker.subscribe(3, audienceOf("session-b"), live, async () => true);
      gone.write.mockImplementation(() => { throw new Error("write after end"); });
      live.write.mockClear();
      await broker.broadcast(3, null, { type: "transaction_updated", transactionId: 1 });

      expect(gone.end).toHaveBeenCalledTimes(1);
      expect(live.write).toHaveBeenCalledTimes(1);
      expect(broker.subscriberCount(3)).toBe(1);
    } finally {
      broker.clear();
    }
  });

  it("a stream that closes late does not drop a newer stream of the same business", async () => {
    const broker = new SseBroker();
    const closedLate = broker.subscribe(3, audienceOf("session-a"), connectionStub(), async () => true);
    try {
      // The broker closes the first stream (sign out everywhere); the business has no stream left.
      expect(broker.disconnectUser(3, 7)).toBe(1);
      expect(broker.subscriberCount(3)).toBe(0);
      // The login signs in again and opens a new stream before the old connection's close arrives.
      const newer = connectionStub();
      broker.subscribe(3, audienceOf("session-b"), newer, async () => true);
      newer.write.mockClear();
      closedLate(); // the old request's close event

      expect(broker.subscriberCount(3)).toBe(1);
      await broker.broadcast(3, null, { type: "transaction_updated", transactionId: 9 });
      expect(newer.write).toHaveBeenCalledTimes(1);
    } finally {
      broker.clear();
    }
  });

  it("one stream's events keep their order while its sign-in is being checked", async () => {
    const broker = new SseBroker();
    const connection = connectionStub();
    const waits = [30, 0, 10];
    const authorize = jest.fn(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), waits.shift() ?? 0)));
    try {
      broker.subscribe(3, audienceOf("session-a"), connection, authorize);
      connection.write.mockClear();
      await Promise.all([1, 2, 3].map((transactionId) =>
        broker.broadcast(3, null, { type: "transaction_updated", transactionId })));
      const written = connection.write.mock.calls.map(([frame]) => JSON.parse(String(frame).slice("data: ".length)).transactionId);
      expect(written).toEqual([1, 2, 3]);
    } finally {
      broker.clear();
    }
  });
});

describe("push registration on a session cookie checks the session's generation too", () => {
  const REGISTRATIONS: Array<[string, Record<string, unknown>]> = [
    ["/api/push/native-subscribe", { deviceToken: "review-lost-device" }],
    ["/api/push/subscribe", { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/review-lost-device", keys: { p256dh: "test-key", auth: "test-auth" } } }],
  ];

  it.each(REGISTRATIONS)("%s made while signed in registers the device", async (path, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signInBrowser(app, owner.user.email);

    const registered = await sendAs(app, browser, "post", path, body);
    expect(registered.status).toBe(200);
    expect((await storage.getPushSubscriptionsByMerchant(owner.merchantId)).map((row) => row.userId)).toEqual([owner.user.id]);
  });

  it.each(REGISTRATIONS)("in-flight %s cannot reactivate push after sign out everywhere", async (path, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const phone = await signInBrowser(app, owner.user.email);
    const laptop = await signInBrowser(app, owner.user.email);
    let entered!: () => void;
    let release!: () => void;
    const atWrite = new Promise<void>((resolve) => { entered = resolve; });
    const mayWrite = new Promise<void>((resolve) => { release = resolve; });
    const original = storage.createPushSubscription.bind(storage);
    const spy = jest.spyOn(storage, "createPushSubscription").mockImplementation(async (data) => {
      entered();
      await mayWrite;
      return original(data);
    });
    const pending = sendAs(app, phone, "post", path, body);
    try {
      await atWrite;
      expect((await sendAs(app, laptop, "post", "/api/auth/sign-out-everywhere")).status).toBe(204);
      release();
      const registered = await pending;
      const active = await storage.getPushSubscriptionsByMerchant(owner.merchantId);
      expect({ status: registered.status, code: registered.body.code, active: active.map((row) => row.endpoint) })
        .toEqual({ status: 401, code: "SESSION_ENDED", active: [] });
    } finally {
      release();
      await pending;
      spy.mockRestore();
    }
  });
});

describe("the Google start cookie", () => {
  it("is signed under a key of its own, not the account tokens' secret", () => {
    const start = startGoogleSignIn();
    const [state, verifier, issued] = start.cookieValue.split(".");
    const payload = `${state}.${verifier}.${issued}`;
    const underTheTokenSecret = crypto.createHmac("sha256", config.jwtSecret)
      .update(`taptpay google-state v1\n${payload}`).digest("base64url");
    const plainlyUnderIt = crypto.createHmac("sha256", config.jwtSecret).update(payload).digest("base64url");

    expect(verifyGoogleSignInState(`${payload}.${underTheTokenSecret}`, state)).toBeNull();
    expect(verifyGoogleSignInState(`${payload}.${plainlyUnderIt}`, state)).toBeNull();
    expect(verifyGoogleSignInState(start.cookieValue, state)).toBe(verifier);
  });

  it("a start is taken up once, by whichever instance is first, for as long as a start lasts", async () => {
    const { state } = startGoogleSignIn();
    const now = new Date();
    expect(GOOGLE_STATE_ONCE_POLICY).toMatchObject({ free: 1, firstWaitMs: OAUTH_STATE_TTL_MS, maxWaitMs: OAUTH_STATE_TTL_MS });

    const takes = await Promise.all([1, 2, 3].map(() => storage.takeAuthThrottleSlot([googleStateBucket(state)], now)));
    expect(takes.filter((take) => take.allowed)).toHaveLength(1);
    const later = await storage.takeAuthThrottleSlot([googleStateBucket(state)], new Date(now.getTime() + OAUTH_STATE_TTL_MS - 1));
    expect(later.allowed).toBe(false);
    // Another start is its own bucket; and the bucket's key holds no state.
    expect((await storage.takeAuthThrottleSlot([googleStateBucket(startGoogleSignIn().state)], now)).allowed).toBe(true);
    expect(googleStateBucket(state).key).toMatch(/^google-state:[0-9a-f]{64}$/);
    expect(googleStateBucket(state).key).not.toContain(state);
  });
});
