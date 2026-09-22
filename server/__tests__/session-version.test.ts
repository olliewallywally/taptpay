import "./support/test-env";

import crypto from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { TOKEN_PRINCIPAL, issueTokenForUserId } from "../auth";
import { sseBroker } from "../sse-broker";
import {
  VALID_PASSWORD, bearer, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage,
} from "./support/http-harness";

/**
 * R1-T4 phase D (owner decision 2026-09-21). Account tokens are one-hour JWTs
 * that nothing could cancel early: after a password reset a stolen token kept
 * working until it expired, and there was no "sign out everywhere". Now every
 * token carries the session version it was issued under (users.session_version,
 * 0027), and each request compares it with the users row it already re-reads.
 * A password reset and "sign out everywhere" advance the version, so every
 * token issued before stops working at once.
 */

const JWT_SECRET = process.env.JWT_SECRET!;
type App = Awaited<ReturnType<typeof createTestApp>>["app"];

beforeEach(() => resetTestStorage());

const me = (app: App, token: string) => request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
const signOutEverywhere = (app: App, token: string) =>
  request(app).post("/api/auth/sign-out-everywhere").set("Authorization", `Bearer ${token}`);
const sessionVersionOf = (token: string) => (jwt.verify(token, JWT_SECRET) as { sv?: unknown }).sv;

async function passwordLogin(app: App, email: string, password = VALID_PASSWORD) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function expectSessionEnded(app: App, token: string) {
  const res = await me(app, token);
  expect(res.status).toBe(401);
  expect(res.body.code).toBe("SESSION_ENDED");
}

describe("session versions", () => {
  it("issues every token under the login's current session version", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    expect(sessionVersionOf(await passwordLogin(app, owner.user.email))).toBe(0);
  });

  it("sign out everywhere ends every session of that login, this one included", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const secondDevice = await passwordLogin(app, owner.user.email);

    expect((await signOutEverywhere(app, owner.token)).status).toBe(204);
    await expectSessionEnded(app, owner.token);
    await expectSessionEnded(app, secondDevice);

    const fresh = await passwordLogin(app, owner.user.email);
    expect(sessionVersionOf(fresh)).toBe(1);
    expect((await me(app, fresh)).status).toBe(200);
  });

  it("sign out everywhere needs a signed-in login, and a spent token cannot repeat it", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    expect((await request(app).post("/api/auth/sign-out-everywhere")).status).toBe(401);
    expect((await signOutEverywhere(app, owner.token)).status).toBe(204);
    expect((await signOutEverywhere(app, owner.token)).status).toBe(401);
    expect(sessionVersionOf(await passwordLogin(app, owner.user.email))).toBe(1);
  });

  it("a teammate signing out everywhere leaves the owner's sessions alone", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    expect((await signOutEverywhere(app, member.token)).status).toBe(204);
    await expectSessionEnded(app, member.token);
    expect((await me(app, owner.token)).status).toBe(200);
  });

  it("a password reset ends every session issued before it", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const raw = crypto.randomBytes(32).toString("hex");
    await storage.setUserResetToken(
      owner.user.id,
      crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      new Date(Date.now() + 3_600_000),
    );

    const reset = await request(app).post("/api/auth/reset-password")
      .send({ token: raw, password: "NewHarness456", confirmPassword: "NewHarness456" });
    expect(reset.status).toBe(200);
    await expectSessionEnded(app, owner.token);

    const fresh = await passwordLogin(app, owner.user.email, "NewHarness456");
    expect((await me(app, fresh)).status).toBe(200);
  });

  it("honours a token from before session versions only until the sessions are ended", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const legacy = jwt.sign(
      { principal: TOKEN_PRINCIPAL, userId: owner.user.id, email: owner.user.email, merchantId: owner.merchantId, role: "owner" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );
    expect((await me(app, legacy)).status).toBe(200);

    expect((await signOutEverywhere(app, owner.token)).status).toBe(204);
    await expectSessionEnded(app, legacy);
  });

  it("refuses a token whose session version is not a whole number", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    for (const sv of ["0", -1, 1.5, null]) {
      const odd = jwt.sign(
        { principal: TOKEN_PRINCIPAL, userId: owner.user.id, email: owner.user.email, merchantId: owner.merchantId, role: "owner", sv },
        JWT_SECRET,
        { expiresIn: "1h" },
      );
      expect((await me(app, odd)).status).toBe(401);
    }
  });

  it("closes the login's live update streams when its sessions end", async () => {
    const { app } = await createTestApp();
    const disconnect = jest.spyOn(sseBroker, "disconnectUser");
    try {
      const owner = await createOwnerPrincipal();
      expect((await signOutEverywhere(app, owner.token)).status).toBe(204);
      expect(disconnect).toHaveBeenCalledWith(owner.merchantId, owner.user.id);

      const other = await createOwnerPrincipal();
      const raw = crypto.randomBytes(32).toString("hex");
      await storage.setUserResetToken(
        other.user.id,
        crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
        new Date(Date.now() + 3_600_000),
      );
      const reset = await request(app).post("/api/auth/reset-password")
        .send({ token: raw, password: "NewHarness456", confirmPassword: "NewHarness456" });
      expect(reset.status).toBe(200);
      expect(disconnect).toHaveBeenCalledWith(other.merchantId, other.user.id);
    } finally {
      disconnect.mockRestore();
    }
  });

  it("Google sign-in issues its token under the current session version", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    expect((await signOutEverywhere(app, owner.token)).status).toBe(204);

    const issued = await issueTokenForUserId(owner.user.id);
    expect(issued).not.toBeNull();
    expect(sessionVersionOf(issued!.token)).toBe(1);
    expect((await me(app, issued!.token)).status).toBe(200);
  });
});
