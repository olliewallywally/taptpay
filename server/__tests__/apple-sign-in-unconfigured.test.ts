import "./support/test-env";

import request from "supertest";
import { createTestApp, resetTestStorage } from "./support/http-harness";

/**
 * R1-T5b: with no Apple settings (this file sets none), Sign in with Apple is simply not offered:
 * both routes send the browser back to the login page with a fixed message, and Apple is never asked.
 */
let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  resetTestStorage();
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input: any) => { throw new Error(`unexpected outbound request in test: ${String(input)}`); });
});
afterEach(() => fetchSpy.mockRestore());

const loginError = (res: request.Response) => new URL(res.headers.location, "https://harness.test").searchParams.get("error");

test("the start sets no cookie and goes back to the login page", async () => {
  const { app } = await createTestApp();
  const res = await request(app).get("/api/auth/apple");
  expect(res.status).toBe(302);
  expect(loginError(res)).toBe("Apple sign in is not configured");
  expect(res.headers["set-cookie"]).toBeUndefined();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("a post to the callback is answered the same way, whatever it carries", async () => {
  const { app } = await createTestApp();
  const res = await request(app).post("/api/auth/apple/callback").type("form")
    .set({ Origin: "https://appleid.apple.com" }).send({ state: "A".repeat(43), code: "apple-code-1" });
  expect(res.status).toBe(303);
  expect(loginError(res)).toBe("Apple sign in is not configured");
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("the session route still only redeems a code that was issued", async () => {
  const { app } = await createTestApp();
  const res = await request(app).post("/api/auth/apple/session");
  expect(res.status).toBe(401);
  expect(res.body.code).toBe("APPLE_SIGN_IN_EXPIRED");
});
