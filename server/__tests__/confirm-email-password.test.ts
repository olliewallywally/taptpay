import "./support/test-env";

import bcrypt from "bcrypt";
import crypto from "crypto";
import request from "supertest";
import { createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * Owner decision 2026-09-23 (docs/decisions/2026-09-23-r1-t4-confirm-with-password-owner-answers.md):
 * confirming an email needs the password chosen at sign-up.
 *
 * Before: `GET /api/auth/confirm-email?token=…` confirmed on the link alone. Anyone can start
 * an application with any address and choose its password. The address's owner, emailed the
 * link, could confirm it, and the account then signed in with the stranger's password.
 */

jest.setTimeout(30_000);

type App = Awaited<ReturnType<typeof createTestApp>>["app"];
const PASSWORD = "Password1!";
beforeEach(() => resetTestStorage());

/** An application as the sign-up form leaves it: pending, with its chosen password's hash. */
async function application(options: { withPassword?: boolean } = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const email = `applicant.${crypto.randomBytes(4).toString("hex")}@harness.test`;
  const merchant = await storage.createMerchantWithSignup({
    name: "Jamie Smith",
    businessName: "Kauri Studio",
    businessType: "sole-trader",
    email,
    phone: "021 555 0100",
    address: "1 Kauri Road, Auckland",
    businessAddress: "1 Kauri Road, Auckland",
    director: "Jamie Smith",
    businessDescription: "Independent design studio",
    estimatedAnnualTurnover: "Under $50k",
    verificationToken: token,
    passwordHash: options.withPassword === false ? undefined : await bcrypt.hash(PASSWORD, 4),
  } as any);
  return { id: merchant.id, email, token };
}
const confirm = (app: App, token: string, password: string) =>
  request(app).post("/api/auth/confirm-email").send({ token, password });
const statusOf = async (id: number) => (await storage.getMerchant(id))?.status;

it("confirms an application only with the password chosen at sign-up, after which its owner signs in", async () => {
  const { app } = await createTestApp();
  const applied = await application();

  const wrong = await confirm(app, applied.token, "Not-the-password-9");
  expect(wrong.status).toBe(400);
  expect(wrong.body.code).toBe("WRONG_PASSWORD");
  expect(await statusOf(applied.id)).toBe("pending");

  const right = await confirm(app, applied.token, PASSWORD);
  expect(right.status).toBe(200);
  expect(await statusOf(applied.id)).toBe("verified");
  const signedIn = await request(app).post("/api/auth/login").send({ email: applied.email, password: PASSWORD });
  expect(signedIn.status).toBe(200);
});

it("no longer confirms on the link alone", async () => {
  const { app } = await createTestApp();
  const applied = await application();

  await request(app).get(`/api/auth/confirm-email?token=${applied.token}`);

  expect(await statusOf(applied.id)).toBe("pending");
});

it("slows repeated wrong passwords for one link", async () => {
  const { app } = await createTestApp();
  const applied = await application();

  for (let i = 0; i < 5; i += 1) expect((await confirm(app, applied.token, `Wrong-${i}-password`)).status).toBe(400);
  const slowed = await confirm(app, applied.token, PASSWORD);

  expect(slowed.status).toBe(429);
  expect(await statusOf(applied.id)).toBe("pending");
});

it("does not confirm an application that has no chosen password, and says who can help", async () => {
  const { app } = await createTestApp();
  const applied = await application({ withPassword: false });

  const res = await confirm(app, applied.token, PASSWORD);

  expect(res.status).toBe(400);
  expect(res.body.code).toBe("NO_PASSWORD_CHOSEN");
  expect(res.body.message).toContain("support@taptpay.co.nz");
  expect(await statusOf(applied.id)).toBe("pending");
});

it("refuses a link that matches no application", async () => {
  const { app } = await createTestApp();

  const res = await confirm(app, crypto.randomBytes(32).toString("hex"), PASSWORD);

  expect(res.status).toBe(400);
  expect(res.body.message).toBe("Invalid or expired verification token");
});

it("after a password reset from the same address, the new password confirms and the chosen one no longer does", async () => {
  // The page offers "Reset your password" once a password is refused. The reset link goes to
  // the application's address, and it replaces the password: a stranger's choice stops working.
  const { app } = await createTestApp();
  const applied = await application();
  const login = await storage.getUserByEmail(applied.email);
  const raw = crypto.randomBytes(32).toString("hex");
  await storage.setUserResetToken(
    login!.id,
    crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
    new Date(Date.now() + 3_600_000),
  );

  const reset = await request(app).post("/api/auth/reset-password")
    .send({ token: raw, password: "Chosen-again-2", confirmPassword: "Chosen-again-2" });
  expect(reset.status).toBe(200);

  expect((await confirm(app, applied.token, PASSWORD)).body.code).toBe("WRONG_PASSWORD");
  expect((await confirm(app, applied.token, "Chosen-again-2")).status).toBe(200);
  expect(await statusOf(applied.id)).toBe("verified");
});
