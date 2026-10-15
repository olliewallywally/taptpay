import "./support/test-env";
import { ADMIN_TEST_PASSWORD } from "./support/admin-sign-in-test-env";

import crypto from "crypto";
import request from "supertest";
import { config } from "../config";
import {
  VALID_PASSWORD, signedIn, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage,
  type Principal,
} from "./support/http-harness";
import { businessSessionBegunBy } from "./support/session-browser";

/**
 * R1-T4 phase C (owner decision 2026-09-21, Q5: slow repeated attempts down instead of
 * locking). The old throttle lived in each process's memory. Five wrong passwords locked an
 * email for 15 minutes for everyone, so anyone who knew a merchant's email could lock them
 * out. It checked before the password and counted after, so a burst of simultaneous guesses
 * had every one checked. Forgot-password had no limit at all.
 *
 * Now every attempt is counted in shared storage before the password is checked. Five are
 * free, then each waits, the wait doubling from 30 seconds to a 15-minute cap. A device that
 * has signed in before carries a mark and is slowed only by its own mistakes; a completed
 * password reset clears the login's waits.
 */

const DEVICE_COOKIE = "__Secure-taptpay-signin-device";
const ADMIN_DEVICE_COOKIE = "__Secure-taptpay-admin-signin-device";
const WRONG = "Wrong-password-1";
type App = Awaited<ReturnType<typeof createTestApp>>["app"];

// Up to ~20 real password checks per test, each a bcrypt compare at the production
// cost of 12. jest.server.config.cjs's testTimeout is ignored when jest runs both
// projects, which leaves Jest's 5-second default.
jest.setTimeout(30_000);

beforeEach(() => {
  resetTestStorage();
  // Only the clock is faked: HTTP and bcrypt keep their real timers.
  jest.useFakeTimers({
    now: new Date("2026-09-22T12:00:00.000Z"),
    doNotFake: [
      "hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
      "requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate", "setInterval",
      "clearInterval", "setTimeout", "clearTimeout",
    ],
  });
});
afterEach(() => jest.useRealTimers());

const wait = (seconds: number) => jest.setSystemTime(Date.now() + seconds * 1000);

function signIn(app: App, email: string, password: string, cookie?: string) {
  const req = request(app).post("/api/auth/login").send({ email, password });
  return cookie ? req.set("Cookie", cookie) : req;
}
function adminSignIn(app: App, email: string, password: string, cookie?: string) {
  const req = request(app).post("/api/admin/auth/login").send({ email, password });
  return cookie ? req.set("Cookie", cookie) : req;
}
const forgotPassword = (app: App, email: string) => request(app).post("/api/auth/forgot-password").send({ email });

function setCookieHeader(res: request.Response, name: string): string {
  const header = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${name}=`));
  if (!header) throw new Error(`the response set no ${name} cookie`);
  return header;
}
/** "name=value" of a cookie the response set, to send back as a browser would. */
const cookieFrom = (res: request.Response, name: string) => setCookieHeader(res, name).split(";")[0];

async function statuses(attempts: number, attempt: () => Promise<request.Response>): Promise<number[]> {
  const seen: number[] = [];
  for (let i = 0; i < attempts; i += 1) seen.push((await attempt()).status);
  return seen;
}

function expectSlowed(res: request.Response, seconds: number) {
  expect(res.status).toBe(429);
  expect(res.headers["retry-after"]).toBe(String(seconds));
  expect(res.body).toEqual({ code: "TOO_MANY_ATTEMPTS", message: expect.any(String), retryAfterSeconds: seconds });
}

const FIVE_FREE = [401, 401, 401, 401, 401];

describe("password sign-in is slowed down, never locked", () => {
  it("allows five wrong passwords, then makes each attempt wait, the wait doubling", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();

    expect(await statuses(5, () => signIn(app, email, WRONG))).toEqual(FIVE_FREE);
    const slowed = await signIn(app, email, WRONG);
    expectSlowed(slowed, 30);
    expect(slowed.body.message).toBe("Too many attempts. Please try again in 30 seconds.");
    // While waiting, not even the right password is checked.
    expectSlowed(await signIn(app, email, VALID_PASSWORD), 30);
    wait(10);
    expectSlowed(await signIn(app, email, VALID_PASSWORD), 20);

    wait(20);
    expect((await signIn(app, email, WRONG)).status).toBe(401);
    const longer = await signIn(app, email, WRONG);
    expectSlowed(longer, 60);
    expect(longer.body.message).toBe("Too many attempts. Please try again in 1 minute.");
    wait(60);
    expect((await signIn(app, email, VALID_PASSWORD)).status).toBe(200);
  });

  it("stops the wait growing at 15 minutes", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();

    expect(await statuses(5, () => signIn(app, email, WRONG))).toEqual(FIVE_FREE);
    const waits: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await signIn(app, email, WRONG);
      expect(res.status).toBe(429);
      waits.push(Number(res.headers["retry-after"]));
      wait(waits[waits.length - 1]);
      expect((await signIn(app, email, WRONG)).status).toBe(401);
    }
    expect(waits).toEqual([30, 60, 120, 240, 480, 900, 900, 900]);
  });

  it("checks exactly five passwords from a burst of twelve simultaneous guesses", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();
    const lookups = jest.spyOn(storage, "getUserByEmail");

    const results = await Promise.all(Array.from({ length: 12 }, () => signIn(app, email, WRONG)));

    expect(results.map((res) => res.status).sort()).toEqual([...FIVE_FREE, ...Array(7).fill(429)]);
    expect(lookups.mock.calls.filter(([looked]) => looked === email)).toHaveLength(5);
  });

  it("never lets someone else's guesses slow down a device that has signed in before", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();
    const phone = cookieFrom(await signIn(app, email, VALID_PASSWORD), DEVICE_COOKIE);

    const guesses = await statuses(20, () => signIn(app, email, WRONG));
    expect(guesses.filter((status) => status === 401)).toHaveLength(5);
    expect(guesses.filter((status) => status === 429)).toHaveLength(15);

    expect((await signIn(app, email, VALID_PASSWORD, phone)).status).toBe(200);
    // The phone is slowed only by its own mistakes.
    expect(await statuses(5, () => signIn(app, email, WRONG, phone))).toEqual(FIVE_FREE);
    expectSlowed(await signIn(app, email, WRONG, phone), 30);
  });

  it("gives the device a mark that scripts cannot read, sent only to the sign-in routes, holding no email", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();

    const header = setCookieHeader(await signIn(app, email, VALID_PASSWORD), DEVICE_COOKIE);

    expect(header).toMatch(/; Path=\/api\/auth(;|$)/);
    expect(header).toMatch(/; HttpOnly(;|$)/);
    expect(header).toMatch(/; Secure(;|$)/);
    expect(header).toMatch(/; SameSite=Strict(;|$)/);
    expect(header).toMatch(/; Max-Age=15552000(;|$)/);
    expect(decodeURIComponent(header).toLowerCase()).not.toContain(email.split("@")[0].toLowerCase());
  });

  it("honours a mark only for the email it signed in to, and only as the server wrote it", async () => {
    const { app } = await createTestApp();
    const a = (await createOwnerPrincipal()).user.email;
    const b = (await createOwnerPrincipal()).user.email;
    const aDevice = cookieFrom(await signIn(app, a, VALID_PASSWORD), DEVICE_COOKIE);

    expect(await statuses(5, () => signIn(app, b, WRONG))).toEqual(FIVE_FREE);
    expectSlowed(await signIn(app, b, VALID_PASSWORD, aDevice), 30);

    expect(await statuses(5, () => signIn(app, a, WRONG))).toEqual(FIVE_FREE);
    const [name, value] = [aDevice.slice(0, aDevice.indexOf("=")), aDevice.slice(aDevice.indexOf("=") + 1)];
    const forged = `${name}=${value.slice(0, -1)}${value.endsWith("A") ? "B" : "A"}`;
    expectSlowed(await signIn(app, a, VALID_PASSWORD, forged), 30);
    expect((await signIn(app, a, VALID_PASSWORD, aDevice)).status).toBe(200);
  });

  it("answers the same whether or not the email has a login", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();
    const nobody = `nobody.${crypto.randomBytes(4).toString("hex")}@harness.test`;

    const known = [];
    const unknown = [];
    for (let i = 0; i < 6; i += 1) known.push(await signIn(app, email, WRONG));
    for (let i = 0; i < 6; i += 1) unknown.push(await signIn(app, nobody, WRONG));

    expect(known.map((res) => res.status)).toEqual([...FIVE_FREE, 429]);
    expect(unknown.map((res) => res.status)).toEqual([...FIVE_FREE, 429]);
    expect(known[0].body).toEqual({ message: "Invalid email or password" });
    expect(unknown[0].body).toEqual(known[0].body);
    expect(unknown[5].body).toEqual(known[5].body);
    expect(unknown[5].headers["retry-after"]).toBe(known[5].headers["retry-after"]);
  });

  it("starts the count again after a successful sign-in", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();

    expect(await statuses(4, () => signIn(app, email, WRONG))).toEqual([401, 401, 401, 401]);
    expect((await signIn(app, email, VALID_PASSWORD)).status).toBe(200);
    expect(await statuses(5, () => signIn(app, email, WRONG))).toEqual(FIVE_FREE);
    expectSlowed(await signIn(app, email, WRONG), 30);
  });

  it("does not give extra guesses for the same email in different capitals", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();

    expect(await statuses(3, () => signIn(app, email, WRONG))).toEqual([401, 401, 401]);
    expect(await statuses(2, () => signIn(app, email.toUpperCase(), WRONG))).toEqual([401, 401]);
    expectSlowed(await signIn(app, email.replace(/^./, (c) => c.toUpperCase()), WRONG), 30);
  });

  it("does not count a sign-in that failed for an internal error", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();

    expect(await statuses(4, () => signIn(app, email, WRONG))).toEqual([401, 401, 401, 401]);
    jest.spyOn(storage, "getUserByEmail").mockRejectedValueOnce(new Error("database unavailable"));
    expect((await signIn(app, email, WRONG)).status).toBe(500);
    expect((await signIn(app, email, WRONG)).status).toBe(401);
    expectSlowed(await signIn(app, email, WRONG), 30);
  });
});

describe("a completed password reset", () => {
  it("clears the login's waits on every device and marks the browser that reset it", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const email = owner.user.email;
    const phone = cookieFrom(await signIn(app, email, VALID_PASSWORD), DEVICE_COOKIE);
    expect(await statuses(5, () => signIn(app, email, WRONG, phone))).toEqual(FIVE_FREE);
    expectSlowed(await signIn(app, email, WRONG, phone), 30);
    expect(await statuses(5, () => signIn(app, email, WRONG))).toEqual(FIVE_FREE);
    expectSlowed(await signIn(app, email, WRONG), 30);

    // The merchant follows the emailed link in a third browser.
    const raw = crypto.randomBytes(32).toString("hex");
    await storage.setUserResetToken(owner.user.id, crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      new Date(Date.now() + 60 * 60 * 1000));
    const NEW_PASSWORD = "New-password-2";
    const reset = await request(app).post("/api/auth/reset-password")
      .send({ token: raw, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    const browser = cookieFrom(reset, DEVICE_COOKIE);

    expect((await signIn(app, email, NEW_PASSWORD, phone)).status).toBe(200);
    expect((await signIn(app, email, NEW_PASSWORD)).status).toBe(200);
    // The browser that reset it is known from now on.
    expect(await statuses(5, () => signIn(app, email, WRONG))).toEqual(FIVE_FREE);
    expectSlowed(await signIn(app, email, WRONG), 30);
    expect((await signIn(app, email, NEW_PASSWORD, browser)).status).toBe(200);
  });
});

describe("admin sign-in", () => {
  it("is slowed down the same way, and a signed-in admin device gets its own mark", async () => {
    const { app } = await createTestApp();
    const adminEmail = config.admin.email!;

    expect(await statuses(5, () => adminSignIn(app, adminEmail, WRONG))).toEqual(FIVE_FREE);
    expectSlowed(await adminSignIn(app, adminEmail, ADMIN_TEST_PASSWORD), 30);
    wait(30);
    const signedIn = await adminSignIn(app, adminEmail, ADMIN_TEST_PASSWORD);
    expect(signedIn.status).toBe(200);
    expect(setCookieHeader(signedIn, ADMIN_DEVICE_COOKIE)).toMatch(/; Path=\/api\/admin\/auth(;|$)/);
    const adminDevice = cookieFrom(signedIn, ADMIN_DEVICE_COOKIE);

    expect(await statuses(5, () => adminSignIn(app, adminEmail, WRONG))).toEqual(FIVE_FREE);
    expectSlowed(await adminSignIn(app, adminEmail, ADMIN_TEST_PASSWORD), 30);
    expect((await adminSignIn(app, adminEmail, ADMIN_TEST_PASSWORD, adminDevice)).status).toBe(200);
  });

  it("does not honour a merchant sign-in mark, even one for the same email", async () => {
    const { app } = await createTestApp();
    const adminEmail = config.admin.email!;
    await createOwnerPrincipal({ email: adminEmail });
    const merchantDevice = cookieFrom(await signIn(app, adminEmail, VALID_PASSWORD), DEVICE_COOKIE);
    const value = merchantDevice.slice(merchantDevice.indexOf("=") + 1);

    expect(await statuses(5, () => adminSignIn(app, adminEmail, WRONG))).toEqual(FIVE_FREE);
    expectSlowed(await adminSignIn(app, adminEmail, ADMIN_TEST_PASSWORD, merchantDevice), 30);
    expectSlowed(await adminSignIn(app, adminEmail, ADMIN_TEST_PASSWORD, `${ADMIN_DEVICE_COOKIE}=${value}`), 30);
  });
});

describe("changing the password while signed in", () => {
  // The current-password check is a password check too: someone holding a stolen
  // session could otherwise guess the password without limit, then change it.
  const changePassword = (app: App, who: Principal, currentPassword: string, newPassword = "Changed-password-3") =>
    request(app).put(`/api/merchants/${who.merchantId}/change-password`).set(signedIn(who))
      .send({ currentPassword, newPassword, confirmPassword: newPassword });

  it("allows five wrong current passwords, then makes each attempt wait", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    expect(await statuses(5, () => changePassword(app, owner, WRONG))).toEqual([400, 400, 400, 400, 400]);
    const slowed = await changePassword(app, owner, VALID_PASSWORD);
    expectSlowed(slowed, 30);
    expect(slowed.body.message).toBe("Too many attempts. Please try again in 30 seconds.");
    wait(30);
    expect((await changePassword(app, owner, VALID_PASSWORD)).status).toBe(200);
  });

  it("counts per login: a teammate's wrong guesses do not slow the owner", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    expect(await statuses(5, () => changePassword(app, member, WRONG))).toEqual([400, 400, 400, 400, 400]);
    expectSlowed(await changePassword(app, member, WRONG), 30);
    expect((await changePassword(app, owner, VALID_PASSWORD)).status).toBe(200);
  });

  it("starts the count again after a change goes through", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    expect(await statuses(4, () => changePassword(app, owner, WRONG))).toEqual([400, 400, 400, 400]);
    const changed = await changePassword(app, owner, VALID_PASSWORD, "Changed-password-3");
    expect(changed.status).toBe(200);
    const fresh = { ...owner, ...businessSessionBegunBy(changed) };
    expect(await statuses(5, () => changePassword(app, fresh, WRONG))).toEqual([400, 400, 400, 400, 400]);
    expectSlowed(await changePassword(app, fresh, WRONG), 30);
  });
});

describe("forgot password", () => {
  it("sends three links per email, then waits; a refused request sends nothing and keeps the live link", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();
    const issued = jest.spyOn(storage, "setUserResetToken");

    expect(await statuses(3, () => forgotPassword(app, email))).toEqual([200, 200, 200]);
    expect(issued).toHaveBeenCalledTimes(3);
    const liveLink = (await storage.getUserByEmail(email))!.resetToken;
    expect(liveLink).toEqual(expect.any(String));

    const refused = await forgotPassword(app, email);
    expectSlowed(refused, 300);
    expect(refused.body.message).toBe("Too many password reset requests. Please try again in 5 minutes.");
    expect(issued).toHaveBeenCalledTimes(3);
    expect((await storage.getUserByEmail(email))!.resetToken).toBe(liveLink);

    wait(300);
    expect((await forgotPassword(app, email)).status).toBe(200);
    expect(issued).toHaveBeenCalledTimes(4);
    expectSlowed(await forgotPassword(app, email), 600);
  });

  it("answers an email with no login exactly as one with a login", async () => {
    const { app } = await createTestApp();
    const { user: { email } } = await createOwnerPrincipal();
    const nobody = `nobody.${crypto.randomBytes(4).toString("hex")}@harness.test`;

    const known = [];
    const unknown = [];
    for (let i = 0; i < 4; i += 1) known.push(await forgotPassword(app, email));
    for (let i = 0; i < 4; i += 1) unknown.push(await forgotPassword(app, nobody));

    expect(known.map((res) => res.status)).toEqual([200, 200, 200, 429]);
    expect(unknown.map((res) => res.status)).toEqual([200, 200, 200, 429]);
    expect(unknown[0].body).toEqual(known[0].body);
    expect(unknown[3].body).toEqual(known[3].body);
  });
});
