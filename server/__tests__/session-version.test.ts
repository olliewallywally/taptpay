import "./support/test-env";

import crypto from "crypto";
import request from "supertest";
import { sseBroker } from "../sse-broker";
import {
  VALID_PASSWORD, signedIn, type SignedIn, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage,
} from "./support/http-harness";
import { BUSINESS_COOKIE, businessSessionBegunBy, setCookies } from "./support/session-browser";

/**
 * R1-T4 phase D (owner decision 2026-09-21), on phase E's sessions. A sign-in that nothing could cancel
 * early kept working after a password reset, and there was no "sign out everywhere". Every session
 * records the session version its login had when it began (users.session_version, 0027;
 * auth_sessions.session_version, 0031), and each request compares it with the users row it already
 * re-reads. A password reset, a password change and "sign out everywhere" advance the version, so every
 * session begun before stops working at once, whatever its own row says.
 */

type App = Awaited<ReturnType<typeof createTestApp>>["app"];

beforeEach(() => resetTestStorage());

const me = (app: App, who: SignedIn) => request(app).get("/api/auth/me").set(signedIn(who));
const signOutEverywhere = (app: App, who: SignedIn) => request(app).post("/api/auth/sign-out-everywhere").set(signedIn(who));
const sessionIdOf = (who: SignedIn) => who.cookie.split("=")[1].split(".")[0];
const sessionOf = (who: SignedIn) => storage.getAuthSession(sessionIdOf(who));
/** The row where the in-memory store keeps it (a read hands out a copy), to put a session in a state no route makes. */
const keptRowOf = (who: SignedIn) =>
  (storage as unknown as { authSessionRows: Map<string, { sessionVersion: number | null }> }).authSessionRows.get(sessionIdOf(who))!;
const sessionVersionOf = async (who: SignedIn) => (await sessionOf(who))?.sessionVersion;

async function passwordLogin(app: App, email: string, password = VALID_PASSWORD): Promise<SignedIn> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return businessSessionBegunBy(res);
}

async function expectSessionEnded(app: App, who: SignedIn) {
  const res = await me(app, who);
  expect(res.status).toBe(401);
  expect(res.body.code).toBe("SESSION_ENDED");
}

async function resetLinkFor(userId: number): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  await storage.setUserResetToken(
    userId,
    crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
    new Date(Date.now() + 3_600_000),
  );
  return raw;
}

describe("session versions", () => {
  it("begins every session under the login's current session version", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    expect(await sessionVersionOf(await passwordLogin(app, owner.user.email))).toBe(0);
  });

  it("sign out everywhere ends every session of that login, this one included", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const secondDevice = await passwordLogin(app, owner.user.email);

    expect((await signOutEverywhere(app, owner)).status).toBe(204);
    await expectSessionEnded(app, owner);
    await expectSessionEnded(app, secondDevice);

    const fresh = await passwordLogin(app, owner.user.email);
    expect(await sessionVersionOf(fresh)).toBe(1);
    expect((await me(app, fresh)).status).toBe(200);
  });

  it("sign out everywhere needs a signed-in login, and an ended session cannot repeat it", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    expect((await request(app).post("/api/auth/sign-out-everywhere")).status).toBe(401);
    expect((await signOutEverywhere(app, owner)).status).toBe(204);
    expect((await signOutEverywhere(app, owner)).status).toBe(401);
    expect(await sessionVersionOf(await passwordLogin(app, owner.user.email))).toBe(1);
  });

  it("a teammate signing out everywhere leaves the owner's sessions alone", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    expect((await signOutEverywhere(app, member)).status).toBe(204);
    await expectSessionEnded(app, member);
    expect((await me(app, owner)).status).toBe(200);
  });

  it("a password reset ends every session begun before it", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const raw = await resetLinkFor(owner.user.id);

    const reset = await request(app).post("/api/auth/reset-password")
      .send({ token: raw, password: "NewHarness456", confirmPassword: "NewHarness456" });
    expect(reset.status).toBe(200);
    await expectSessionEnded(app, owner);

    const fresh = await passwordLogin(app, owner.user.email, "NewHarness456");
    expect((await me(app, fresh)).status).toBe(200);
  });

  it("the version alone ends a session: its own row need not have been marked", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    expect((await me(app, owner)).status).toBe(200);

    // Another instance advanced the version and went down before it recorded the ending on each session.
    await storage.advanceUserSessionVersion(owner.user.id);
    expect((await sessionOf(owner))?.revokedAt).toBeNull();
    await expectSessionEnded(app, owner);
  });

  it("refuses a session whose recorded version is not the login's, whichever way it differs", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const row = keptRowOf(owner);
    for (const recorded of [1, -1, null]) {
      row.sessionVersion = recorded;
      await expectSessionEnded(app, owner);
    }
    row.sessionVersion = 0;
    expect((await me(app, owner)).status).toBe(200);
  });

  it("closes the login's live update streams when its sessions end", async () => {
    const { app } = await createTestApp();
    const disconnect = jest.spyOn(sseBroker, "disconnectUser");
    try {
      const owner = await createOwnerPrincipal();
      expect((await signOutEverywhere(app, owner)).status).toBe(204);
      expect(disconnect).toHaveBeenCalledWith(owner.merchantId, owner.user.id);

      const other = await createOwnerPrincipal();
      const raw = await resetLinkFor(other.user.id);
      const reset = await request(app).post("/api/auth/reset-password")
        .send({ token: raw, password: "NewHarness456", confirmPassword: "NewHarness456" });
      expect(reset.status).toBe(200);
      expect(disconnect).toHaveBeenCalledWith(other.merchantId, other.user.id);
    } finally {
      disconnect.mockRestore();
    }
  });

  it("a password change ends every other session and keeps this device signed in", async () => {
    const { app } = await createTestApp();
    const disconnect = jest.spyOn(sseBroker, "disconnectUser");
    try {
      const owner = await createOwnerPrincipal();
      const otherDevice = await passwordLogin(app, owner.user.email);

      const change = await request(app).put(`/api/merchants/${owner.merchantId}/change-password`)
        .set(signedIn(owner))
        .send({ currentPassword: VALID_PASSWORD, newPassword: "Changed789", confirmPassword: "Changed789" });
      expect(change.status).toBe(200);
      // This device carries on under a new session, begun under the new version; no token is handed out.
      expect(change.body).toEqual({ message: "Password updated successfully", csrfToken: expect.any(String) });
      const thisDevice = businessSessionBegunBy(change);
      expect(await sessionVersionOf(thisDevice)).toBe(1);

      await expectSessionEnded(app, owner);
      await expectSessionEnded(app, otherDevice);
      expect((await me(app, thisDevice)).status).toBe(200);
      expect(disconnect).toHaveBeenCalledWith(owner.merchantId, owner.user.id);
      expect((await me(app, await passwordLogin(app, owner.user.email, "Changed789"))).status).toBe(200);
    } finally {
      disconnect.mockRestore();
    }
  });

  it("a refused password change ends nothing and begins nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const change = await request(app).put(`/api/merchants/${owner.merchantId}/change-password`)
      .set(signedIn(owner))
      .send({ currentPassword: "not-the-password", newPassword: "Changed789", confirmPassword: "Changed789" });
    expect(change.status).toBe(400);
    expect(change.body).toEqual({ message: "Current password is incorrect" });
    expect(setCookies(change).has(BUSINESS_COOKIE)).toBe(false);
    expect((await me(app, owner)).status).toBe(200);
  });

  it("Google sign-in begins its session under the current session version", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    expect((await signOutEverywhere(app, owner)).status).toBe(204);

    // The browser redeems the one-time code Google's return left it (server/google-sign-in.ts).
    const code = crypto.randomBytes(32).toString("base64url");
    await storage.createAuthHandoffCode({
      codeHash: crypto.createHash("sha256").update(code, "utf8").digest("hex"),
      userId: owner.user.id, newUser: false, expiresAt: new Date(Date.now() + 60_000),
    });
    const redeemed = await request(app).post("/api/auth/google/session").set("Cookie", `__Host-taptpay-google-handoff=${code}`);
    expect(redeemed.status).toBe(200);
    const google = businessSessionBegunBy(redeemed);
    expect(await sessionVersionOf(google)).toBe(1);
    expect((await me(app, google)).status).toBe(200);
  });
});
