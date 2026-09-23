import "./support/test-env";

import crypto from "crypto";
import request from "supertest";
import {
  acceptInviteSchema, changePasswordSchema, createMerchantSchema, publicSignupSchema, resetPasswordSchema,
  verifyMerchantSchema,
} from "@shared/schema";
import { createUser } from "../auth";
import {
  VALID_PASSWORD, bearer, createAdminPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-23 (R1-T4 phase C follow-up, Q2): a new password needs at least
 * 8 characters, a capital letter, and a number or symbol — wherever a password is set.
 *
 * Before: password reset and change asked only for 6 characters. Sign-up, team invites and
 * admin-created accounts asked for a lowercase letter and a number, and a symbol did not
 * count. Email verification and admin activation checked nothing at all. Sign-in does not
 * apply the rule: a password set under an older one keeps working until it is changed.
 */

jest.setTimeout(30_000);

const RULE = "Use at least 8 characters, including a capital letter and a number or symbol.";
// A space is not a symbol; a capital need not be A–Z.
const REFUSED = ["Sh0rt!", "Short1!", "password1", "password!", "Password", "Pass word"];
const ALLOWED = ["Password1", "Password!", "PASSWORD1", "Élan-vital", "Correct horse 9"];

type App = Awaited<ReturnType<typeof createTestApp>>["app"];

beforeEach(() => resetTestStorage());

const randomEmail = (label: string) => `${label}.${crypto.randomBytes(4).toString("hex")}@harness.test`;
const sha256 = (raw: string) => crypto.createHash("sha256").update(raw, "utf8").digest("hex");
const signIn = (app: App, email: string, password: string) =>
  request(app).post("/api/auth/login").send({ email, password });

const SIGNUP = {
  name: "Rule Tester",
  phone: "021 555 0100",
  businessName: "Rule Cafe",
  businessType: "sole-trader",
  businessAddress: "1 Rule Street, Auckland",
  director: "Rule Tester",
  businessDescription: "Coffee and cake",
  estimatedAnnualTurnover: "Under $50k",
};
const ADMIN_CREATED = {
  name: "Admin Made",
  businessName: "Admin Made Ltd",
  businessType: "retail",
  phone: "021 555 0100",
  address: "1 Admin Street, Auckland",
};

/** The raw link a reset email would carry, live for an hour. */
async function issueResetLink(userId: number): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  await storage.setUserResetToken(userId, sha256(raw), new Date(Date.now() + 60 * 60 * 1000));
  return raw;
}

/** The raw token of a live team invite on the given business (a plan with a free seat). */
async function inviteTeammate(merchantId: number): Promise<string> {
  await storage.getOrCreateSubscription(merchantId);
  const upgraded = await storage.changeSubscriptionPlan(merchantId, "team");
  if (!upgraded.ok) throw new Error(`fixture: could not grant a team seat — ${upgraded.reason}`);
  const raw = crypto.randomBytes(24).toString("hex");
  const invited = await storage.inviteTeamMember(merchantId, {
    email: randomEmail("invitee"),
    inviteTokenHash: sha256(raw),
    inviteExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  if (!invited.ok) throw new Error(`fixture: could not invite — ${invited.reason}`);
  return raw;
}

/** A business that signed up and has not confirmed its email yet, with its verification token. */
async function pendingSignup(): Promise<{ id: number; token: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const merchant = await storage.createMerchantWithSignup({
    name: "Pending Owner",
    businessName: "Pending Ltd",
    businessType: "retail",
    email: randomEmail("pending"),
    phone: "021 555 0100",
    address: "1 Pending Street, Auckland",
    verificationToken: token,
  } as any);
  return { id: merchant.id, token };
}

type Parsed = { success: true } | { success: false; error: { issues: { message: string }[] } };

describe("the rule, in every schema that sets a password", () => {
  const schemas: Record<string, (password: string) => Parsed> = {
    "sign-up": (password) =>
      publicSignupSchema.safeParse({ ...SIGNUP, email: "rule@harness.test", password, confirmPassword: password }),
    "team invite": (password) => acceptInviteSchema.safeParse({ token: "t", password, confirmPassword: password }),
    "admin-created account": (password) =>
      createMerchantSchema.safeParse({ ...ADMIN_CREATED, email: "rule@harness.test", password, confirmPassword: password }),
    "email verification": (password) =>
      verifyMerchantSchema.safeParse({ token: "t", password, confirmPassword: password }),
    "password reset": (password) => resetPasswordSchema.safeParse({ token: "t", password, confirmPassword: password }),
    "password change": (password) =>
      changePasswordSchema.safeParse({ currentPassword: "anything", newPassword: password, confirmPassword: password }),
  };

  for (const [name, parse] of Object.entries(schemas)) {
    it(`${name}: refuses ${REFUSED.join(", ")} with the rule, in its own words`, () => {
      for (const password of REFUSED) {
        const result = parse(password);
        expect({ password, success: result.success }).toEqual({ password, success: false });
        if (!result.success) {
          expect({ password, messages: result.error.issues.map((issue) => issue.message) })
            .toEqual({ password, messages: [RULE] });
        }
      }
    });

    it(`${name}: allows ${ALLOWED.join(", ")}`, () => {
      for (const password of ALLOWED) {
        expect({ password, success: parse(password).success }).toEqual({ password, success: true });
      }
    });
  }
});

describe("every route that sets a password applies the rule and says it", () => {
  it("password reset", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = await issueResetLink(owner.user.id);
    const reset = (password: string) =>
      request(app).post("/api/auth/reset-password").send({ token, password, confirmPassword: password });

    const refused = await reset("password1");
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(RULE);

    expect((await reset("Password!")).status).toBe(200);
    expect((await signIn(app, owner.user.email, "Password!")).status).toBe(200);
  });

  it("password change — and a refused new password does not use up an attempt", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const change = (newPassword: string) =>
      request(app).put(`/api/merchants/${owner.merchantId}/change-password`).set(bearer(owner))
        .send({ currentPassword: VALID_PASSWORD, newPassword, confirmPassword: newPassword });

    // Six refusals in a row: more than the five free attempts, so none was counted.
    for (let i = 0; i < 6; i += 1) {
      const refused = await change("password1");
      expect(refused.status).toBe(400);
      expect(refused.body.message).toBe(RULE);
    }
    expect((await change("PASSWORD1")).status).toBe(200);
  });

  it("public sign-up", async () => {
    const { app } = await createTestApp();
    const signUp = (password: string) => request(app).post("/api/merchants/signup")
      .send({ ...SIGNUP, email: randomEmail("signup"), password, confirmPassword: password });

    const refused = await signUp("password1");
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(RULE);

    // A symbol in place of a number, and no lowercase letter: both allowed now.
    expect((await signUp("Password!")).status).toBe(200);
    expect((await signUp("PASSWORD1")).status).toBe(200);
  });

  it("accepting a team invite", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = await inviteTeammate(owner.merchantId);
    const accept = (password: string) =>
      request(app).post("/api/team/accept-invite").send({ token, password, confirmPassword: password });

    const refused = await accept("Password");
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(RULE);

    expect((await accept("Password!")).status).toBe(200);
  });

  it("an account an admin creates", async () => {
    const { app } = await createTestApp();
    const admin = createAdminPrincipal();
    const create = (password: string) => request(app).post("/api/admin/merchants/signup").set(bearer(admin))
      .send({ ...ADMIN_CREATED, email: randomEmail("admin-made"), password, confirmPassword: password });

    const refused = await create("password1");
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(RULE);

    expect((await create("Password!")).status).toBe(200);
  });

  it("email verification, which used to take any password at all", async () => {
    const { app } = await createTestApp();
    const { token } = await pendingSignup();
    const verify = (password: unknown) => request(app).post("/api/merchants/verify").send({ token, password });

    const refused = await verify("password");
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(RULE);
    expect((await verify(12345678)).status).toBe(400);

    expect((await verify("Password1")).status).toBe(200);
  });

  it("admin activation, which used to take any password at all", async () => {
    const { app } = await createTestApp();
    const admin = createAdminPrincipal();
    const { id } = await pendingSignup();
    const activate = (password: unknown) =>
      request(app).post(`/api/admin/merchants/${id}/activate`).set(bearer(admin)).send({ password });

    const refused = await activate("password");
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe(RULE);
    expect((await activate(["Password1"])).status).toBe(400);

    expect((await activate("Password1")).status).toBe(200);
  });
});

describe("sign-in does not apply the rule", () => {
  it("a password set under an older rule still signs in", async () => {
    const { app } = await createTestApp();
    const email = randomEmail("older");
    const merchant = await storage.createMerchant({
      name: "Older Owner", businessName: "Older Ltd", businessType: "retail", email,
      phone: "021 555 0100", address: "1 Older Street, Auckland",
    } as any);
    await storage.updateMerchantStatus(merchant.id, "active");
    // How the dev seed's "demo123" came to exist: createUser hashes what it is given.
    await createUser(email, "demo123", merchant.id, "merchant");

    expect((await signIn(app, email, "demo123")).status).toBe(200);
  });
});
