import "./support/test-env";
import "./support/resend-capture-env";

import crypto from "crypto";
import { performance } from "node:perf_hooks";
import request from "supertest";
import {
  createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-23 (docs/decisions/2026-09-23-r1-t4-enumeration-owner-answers.md):
 * no door says whether an email address has an account — not in its answer, not in how
 * long it takes.
 *
 * Before: sign-up answered 409 "Email already registered". Resending the confirmation link
 * answered 404 "Merchant not found", "Email is already verified" or "Verification email
 * sent", by address or by account number. Forgot-password answered at once for an address
 * with no login, and only after saving a link and sending an email for one with a login.
 */

// Each answer now takes at least one or one and a half seconds, by design.
jest.setTimeout(60_000);

type Sent = { to: string | string[]; subject: string; html?: string; text?: string };
const mockSent: Sent[] = [];
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(async (message: Sent) => {
        mockSent.push(message);
        return { data: { id: "captured" }, error: null };
      }),
    },
  })),
}));

type App = Awaited<ReturnType<typeof createTestApp>>["app"];
const CHECK_EMAIL = { message: "Check your email to continue." };
const RESENT = { message: "If that address is waiting to be confirmed, we've sent the link again." };
const CONFIRM_SUBJECT = "Confirm your TaptPay email address";
const NOTICE_SUBJECT = "Someone tried to sign up to TaptPay with your email";
const SIGN_UP_FLOOR_MS = 1500;
const EMAIL_FLOOR_MS = 1000;
const EARLY = 5; // a timer may fire a millisecond or two early against performance.now()

beforeEach(() => {
  resetTestStorage();
  mockSent.length = 0;
});

const randomEmail = (label: string) => `${label}.${crypto.randomBytes(4).toString("hex")}@harness.test`;
const recipient = (message: Sent) => [message.to].flat()[0];
const sentTo = (email: string) => mockSent.filter((message) => recipient(message) === email);

async function timed(pending: request.Test) {
  const started = performance.now();
  const res = await pending;
  return { res, ms: performance.now() - started };
}

function signUp(app: App, email: string, overrides: Record<string, string> = {}) {
  return request(app).post("/api/merchants/signup").send({
    name: "Jamie Smith",
    email,
    phone: "021 555 0100",
    businessName: "Kauri Studio",
    businessType: "sole-trader",
    businessAddress: "1 Kauri Road, Auckland",
    director: "Jamie Smith",
    businessDescription: "Independent design studio",
    estimatedAnnualTurnover: "Under $50k",
    password: "Password1!",
    confirmPassword: "Password1!",
    ...overrides,
  });
}
const resend = (app: App, body: Record<string, unknown>) =>
  request(app).post("/api/auth/resend-confirmation").send(body);
const forgot = (app: App, email: string) => request(app).post("/api/auth/forgot-password").send({ email });
const applicationsFor = async (email: string) =>
  (await storage.getAllMerchants()).filter((merchant) => merchant.email === email);

describe("sign-up never says whether an address has an account", () => {
  it("answers an address with an account as it answers a new one, after the same wait, and mails its owner a note instead of opening a second application", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const fresh = randomEmail("fresh");

    const brandNew = await timed(signUp(app, fresh));
    const taken = await timed(signUp(app, owner.user.email));

    for (const { res, ms } of [brandNew, taken]) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual(CHECK_EMAIL);
      expect(ms).toBeGreaterThanOrEqual(SIGN_UP_FLOOR_MS - EARLY);
    }
    expect(sentTo(fresh).map((message) => message.subject)).toEqual([CONFIRM_SUBJECT]);
    expect(sentTo(owner.user.email).map((message) => message.subject)).toEqual([NOTICE_SUBJECT]);
    const applications = await applicationsFor(owner.user.email);
    expect(applications.map((merchant) => [merchant.id, merchant.businessName]))
      .toEqual([[owner.merchantId, "Harness Merchant Ltd"]]);
  });

  it("treats a teammate's login address the same way", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const taken = await signUp(app, member.user.email);

    expect(taken.status).toBe(200);
    expect(taken.body).toEqual(CHECK_EMAIL);
    expect(sentTo(member.user.email).map((message) => message.subject)).toEqual([NOTICE_SUBJECT]);
    expect(await applicationsFor(member.user.email)).toEqual([]);
  });

  it("sends an address at most three notes, then stays quiet, still answering the same", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const answers = [];
    for (let i = 0; i < 4; i += 1) answers.push(await signUp(app, owner.user.email));

    expect(answers.map((res) => [res.status, res.body])).toEqual(Array(4).fill([200, CHECK_EMAIL]));
    expect(sentTo(owner.user.email)).toHaveLength(3);
  });

  it("puts a sign-up's name into the confirmation email as text, never as HTML", async () => {
    const { app } = await createTestApp();
    const fresh = randomEmail("fresh");

    await signUp(app, fresh, { name: '<a href="https://evil.test">Claim your prize</a>' });

    const [email] = sentTo(fresh);
    expect(email.subject).toBe(CONFIRM_SUBJECT);
    expect(email.html).not.toContain('<a href="https://evil.test">');
    expect(email.html).toContain("&lt;a href=");
  });
});

describe("resending the confirmation link never says whether an address has an account", () => {
  it("answers no account, a confirmed account and a waiting application alike, after the same wait; only the waiting one gets its link", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const waiting = randomEmail("waiting");
    await signUp(app, waiting);
    mockSent.length = 0;

    for (const email of [randomEmail("nobody"), owner.user.email, waiting]) {
      const { res, ms } = await timed(resend(app, { email }));
      expect({ email, status: res.status, body: res.body }).toEqual({ email, status: 200, body: RESENT });
      expect(ms).toBeGreaterThanOrEqual(EMAIL_FLOOR_MS - EARLY);
    }
    expect(mockSent.map((message) => [recipient(message), message.subject])).toEqual([[waiting, CONFIRM_SUBJECT]]);
  });

  it("answers the same when asked by account number, sending only a waiting application its own link", async () => {
    const { app } = await createTestApp();
    const waiting = randomEmail("waiting");
    await signUp(app, waiting);
    const [application] = await applicationsFor(waiting);
    mockSent.length = 0;

    const byNumber = await resend(app, { merchantId: application.id });
    const byMissingNumber = await resend(app, { merchantId: application.id + 1000 });

    for (const res of [byNumber, byMissingNumber]) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual(RESENT);
    }
    expect(mockSent.map(recipient)).toEqual([waiting]);
  });

  it("slows repeated requests for an address the same way whether or not it has an account", async () => {
    const { app } = await createTestApp();
    const waiting = randomEmail("waiting");
    await signUp(app, waiting);

    for (const email of [waiting, randomEmail("nobody")]) {
      const statuses = [];
      for (let i = 0; i < 3; i += 1) statuses.push((await resend(app, { email })).status);
      expect({ email, statuses }).toEqual({ email, statuses: [200, 200, 200] });
      const refused = await resend(app, { email });
      expect(refused.status).toBe(429);
      expect(refused.body.code).toBe("TOO_MANY_ATTEMPTS");
      // Five minutes from the third request, which itself took a second to answer.
      expect(Number(refused.headers["retry-after"])).toBeGreaterThanOrEqual(295);
      expect(Number(refused.headers["retry-after"])).toBeLessThanOrEqual(300);
    }
  });
});

describe("the public business read never lists sign-in addresses", () => {
  // GET /api/merchants/:id is public and asked by a sequential number, so counting through the
  // numbers reads every business. Sign-up (and the admin's create) sets the contact email to the
  // sign-in address, so that field listed every account's address, and its holder's name.
  it("gives no business's sign-in address, nor its holder's name, to anyone asking by number", async () => {
    const { app } = await createTestApp();
    const waiting = randomEmail("waiting");
    await signUp(app, waiting);
    const [application] = await applicationsFor(waiting);
    const owner = await createOwnerPrincipal({ name: "Morgan Reid" });

    for (const [id, email, holder] of [
      [application.id, waiting, "Jamie Smith"],
      [owner.merchantId, owner.user.email, "Morgan Reid"],
    ] as const) {
      const res = await request(app).get(`/api/merchants/${id}`);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("contactEmail");
      expect(res.body).not.toHaveProperty("name");
      expect(JSON.stringify(res.body)).not.toContain(email);
      expect(JSON.stringify(res.body)).not.toContain(holder);
    }
  });

  it("still gives the customer pages what they show: the business's name, logo and receipt details", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal({ businessName: "Kōwhai Café" });
    await storage.updateMerchant(owner.merchantId, {
      contactEmail: owner.user.email,
      contactPhone: "09 555 0199",
      businessAddress: "2 Kōwhai Lane, Auckland",
      gstNumber: "123-456-789",
      nzbn: "9429041234567",
    });

    const res = await request(app).get(`/api/merchants/${owner.merchantId}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: owner.merchantId,
      businessName: "Kōwhai Café",
      businessAddress: "2 Kōwhai Lane, Auckland",
      contactPhone: "09 555 0199",
      gstNumber: "123-456-789",
      nzbn: "9429041234567",
    });
    expect(res.body).toHaveProperty("customLogoUrl");
  });
});

describe("forgot password takes as long whether or not the address has a login", () => {
  it("never answers sooner than a second, and only the login is sent a link", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const withLogin = await timed(forgot(app, owner.user.email));
    const withoutLogin = await timed(forgot(app, randomEmail("nobody")));

    for (const { res, ms } of [withLogin, withoutLogin]) {
      expect(res.status).toBe(200);
      expect(ms).toBeGreaterThanOrEqual(EMAIL_FLOOR_MS - EARLY);
    }
    expect(withoutLogin.res.body).toEqual(withLogin.res.body);
    expect(mockSent.map(recipient)).toEqual([owner.user.email]);
  });

  it("still refuses a slowed-down request at once: the refusal is the same for every address", async () => {
    const { app } = await createTestApp();
    const nobody = randomEmail("nobody");
    for (let i = 0; i < 3; i += 1) await forgot(app, nobody);

    const refused = await timed(forgot(app, nobody));

    expect(refused.res.status).toBe(429);
    expect(refused.ms).toBeLessThan(EMAIL_FLOOR_MS);
  });
});
