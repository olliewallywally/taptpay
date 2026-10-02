import "./support/test-env";

import crypto from "crypto";
import request from "supertest";
import { sseBroker } from "../sse-broker";
import { VALID_PASSWORD, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage } from "./support/http-harness";

/**
 * C10 route review, batch 3b (2026-09-26): the password-reset link's routes
 * answered a database fault as a bad link. validateResetToken and resetPassword
 * (server/auth.ts) caught every error and returned "not valid" / null, so
 * GET /api/auth/validate-reset-token/:token said { valid: false } and
 * POST /api/auth/reset-password said 400 "Invalid or expired reset token" about
 * a link that may have been perfectly good. The validate route's own comment
 * says why that is wrong: the user is sent to ask for another link, which fails
 * the same way. A fault now reaches the routes' own handlers: 500, and nothing
 * changes.
 */

type App = Awaited<ReturnType<typeof createTestApp>>["app"];

const hashOf = (raw: string) => crypto.createHash("sha256").update(raw, "utf8").digest("hex");

async function liveResetLink(expiresInMs = 3_600_000) {
  const owner = await createOwnerPrincipal();
  const raw = crypto.randomBytes(32).toString("hex");
  await storage.setUserResetToken(owner.user.id, hashOf(raw), new Date(Date.now() + expiresInMs));
  return { owner, raw };
}

const validate = (app: App, raw: string) => request(app).get(`/api/auth/validate-reset-token/${raw}`);
const reset = (app: App, raw: string, password = "NewHarness456") =>
  request(app).post("/api/auth/reset-password").send({ token: raw, password, confirmPassword: password });
const signIn = (app: App, email: string, password: string) =>
  request(app).post("/api/auth/login").send({ email, password });

beforeEach(() => resetTestStorage());

describe("GET /api/auth/validate-reset-token/:token", () => {
  it("answers a database fault with 500, not as an expired link", async () => {
    const { app } = await createTestApp();
    const { raw } = await liveResetLink();
    jest.spyOn(storage, "getUserByResetToken").mockRejectedValueOnce(new Error("connection terminated unexpectedly"));

    const res = await validate(app, raw);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Failed to validate the reset link" });
  });

  it("still says a live link is valid", async () => {
    const { app } = await createTestApp();
    const { raw } = await liveResetLink();
    const res = await validate(app, raw);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true });
  });

  it("still says an unknown or expired link is not valid", async () => {
    const { app } = await createTestApp();
    const { raw: expired } = await liveResetLink(-1_000);
    for (const raw of [crypto.randomBytes(32).toString("hex"), expired]) {
      const res = await validate(app, raw);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ valid: false });
    }
  });
});

describe("POST /api/auth/reset-password", () => {
  it("answers a database fault on the link's lookup with 500, and changes nothing", async () => {
    const { app } = await createTestApp();
    const { owner, raw } = await liveResetLink();
    const disconnect = jest.spyOn(sseBroker, "disconnectUser");
    jest.spyOn(storage, "getUserByResetToken").mockRejectedValueOnce(new Error("connection terminated unexpectedly"));

    const res = await reset(app, raw);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Failed to reset password" });
    expect(disconnect).not.toHaveBeenCalled();
    // The link, the password and the sessions are as they were.
    expect((await request(app).get("/api/auth/me").set(signedIn(owner))).status).toBe(200);
    expect((await validate(app, raw)).body).toEqual({ valid: true });
    expect((await signIn(app, owner.user.email, VALID_PASSWORD)).status).toBe(200);
  });

  it("answers a database fault on the password's write with 500, and changes nothing", async () => {
    const { app } = await createTestApp();
    const { owner, raw } = await liveResetLink();
    const disconnect = jest.spyOn(sseBroker, "disconnectUser");
    jest.spyOn(storage, "resetUserPasswordByToken").mockRejectedValueOnce(new Error("could not serialize access"));

    const res = await reset(app, raw);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Failed to reset password" });
    expect(disconnect).not.toHaveBeenCalled();
    expect((await request(app).get("/api/auth/me").set(signedIn(owner))).status).toBe(200);
    expect((await signIn(app, owner.user.email, VALID_PASSWORD)).status).toBe(200);
    // Nothing was spent: the same link still works.
    expect((await reset(app, raw)).status).toBe(200);
  });

  it("still refuses an unknown link, and a spent one, with 400", async () => {
    const { app } = await createTestApp();
    const { raw } = await liveResetLink();
    const unknown = await reset(app, crypto.randomBytes(32).toString("hex"));
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual({ message: "Invalid or expired reset token" });

    expect((await reset(app, raw)).status).toBe(200);
    const again = await reset(app, raw, "OtherHarness789");
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ message: "Invalid or expired reset token" });
  });
});
