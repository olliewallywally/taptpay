import "./support/test-env";
import { ADMIN_TEST_PASSWORD } from "./support/admin-sign-in-test-env";

import bcrypt from "bcrypt";
import crypto from "crypto";
import request from "supertest";
import { config } from "../config";
import {
  VALID_PASSWORD, createDisabledMemberPrincipal, createMemberPrincipal, createOwnerPrincipal, createTestApp,
  resetTestStorage, storage,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-23 (Q3 of the R1-T4 phase C report): how long a sign-in takes must
 * not tell whether the email has a login.
 *
 * Before, authenticateUser returned before checking any password for an unknown email, a
 * disabled login or a business not yet active, while a real login paid for a bcrypt check:
 * ~0.27 s at cost 12, ~0.07 s at the cost 10 most older accounts carry. Admin sign-in
 * checked a password only for the admin's email.
 *
 * Now every attempt spends one cost-12 check's worth of hashing. bcrypt's work doubles with
 * each step of cost, so these tests add up 2^cost over every check an attempt makes.
 */

// Each attempt now makes up to nine real bcrypt checks (a cost-4 test hash is topped up
// with stand-ins at costs 4 to 11), and Jest's default is 5 seconds.
jest.setTimeout(30_000);

const WRONG = "Wrong-password-1";
const FULL = 2 ** 12;
type App = Awaited<ReturnType<typeof createTestApp>>["app"];

function costOf(hash: unknown): number {
  const match = typeof hash === "string" ? /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/.exec(hash) : null;
  return match ? Number(match[1]) : Number.NaN;
}

let checks: jest.SpyInstance;
beforeEach(() => {
  resetTestStorage();
  checks = jest.spyOn(bcrypt, "compare");
});
afterEach(() => checks.mockRestore());

/** Hashing work of the bcrypt checks made since the last reset. bcrypt returns at once for a malformed hash. */
function work(): number {
  return checks.mock.calls.reduce((sum, [, hash]) => sum + (Number.isNaN(costOf(hash)) ? 0 : 2 ** costOf(hash)), 0);
}

const nobody = () => `nobody.${crypto.randomBytes(4).toString("hex")}@harness.test`;
const signIn = (app: App, email: string, password: string) =>
  request(app).post("/api/auth/login").send({ email, password });
const adminSignIn = (app: App, email: string, password: string) =>
  request(app).post("/api/admin/auth/login").send({ email, password });

describe("merchant sign-in spends one full password check, whoever the email belongs to", () => {
  it("a login given the wrong password: the check every other case must match", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    expect((await signIn(app, owner.user.email, WRONG)).status).toBe(401);
    expect(work()).toBe(FULL);
  });

  it("an email with no login", async () => {
    const { app } = await createTestApp();

    expect((await signIn(app, nobody(), WRONG)).status).toBe(401);
    expect(work()).toBe(FULL);
  });

  it("a login whose password was saved at a lower cost, as older accounts' were", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId); // the fixture hashes at cost 4
    expect(costOf((await storage.getUserByEmail(member.user.email))!.password)).toBe(4);

    expect((await signIn(app, member.user.email, WRONG)).status).toBe(401);
    expect(work()).toBe(FULL);
    // Topping up the work does not change the answer.
    expect((await signIn(app, member.user.email, VALID_PASSWORD)).status).toBe(200);
  });

  it("a login that has been disabled, even given its right password", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const disabled = await createDisabledMemberPrincipal(owner.merchantId);

    expect((await signIn(app, disabled.user.email, VALID_PASSWORD)).status).toBe(401);
    expect(work()).toBe(FULL);
  });

  it("a business that is not active yet, even given the right password", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    await storage.updateMerchantStatus(owner.merchantId, "pending");

    expect((await signIn(app, owner.user.email, VALID_PASSWORD)).status).toBe(401);
    expect(work()).toBe(FULL);
  });

  it("a login whose stored password is not a readable hash: full work, and never signed in", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    await storage.updateUserPassword(owner.user.id, "not-a-bcrypt-hash");

    expect((await signIn(app, owner.user.email, "not-a-bcrypt-hash")).status).toBe(401);
    expect(work()).toBe(FULL);
  });
});

describe("admin sign-in", () => {
  it("spends the same for an email that is not the admin's as for the admin's", async () => {
    const { app } = await createTestApp();

    expect((await adminSignIn(app, config.admin.email!, WRONG)).status).toBe(401);
    const admin = work();
    checks.mockClear();
    expect((await adminSignIn(app, nobody(), WRONG)).status).toBe(401);

    expect(work()).toBe(admin);
    expect(admin).toBe(FULL); // the test admin hash is cost 4: topped up to 12
  });

  it("still signs the admin in", async () => {
    const { app } = await createTestApp();

    expect((await adminSignIn(app, config.admin.email!, ADMIN_TEST_PASSWORD)).status).toBe(200);
  });
});
