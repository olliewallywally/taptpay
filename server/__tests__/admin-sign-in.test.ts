import "./support/test-env";
import { ADMIN_TEST_PASSWORD } from "./support/admin-sign-in-test-env";

import request from "supertest";
import { config } from "../config";
import { createTestApp, resetTestStorage } from "./support/http-harness";

/**
 * Owner report 2026-09-23: "i cant log into admin anymore". The admin's email was
 * compared character for character, so the address typed with a capital (as phone
 * keyboards do for the first letter) was refused as wrong credentials. Email addresses
 * are compared without regard to case, as merchant sign-in already does.
 */

jest.setTimeout(30_000);
beforeEach(() => resetTestStorage());

const adminSignIn = (app: Awaited<ReturnType<typeof createTestApp>>["app"], email: string, password: string) =>
  request(app).post("/api/admin/auth/login").send({ email, password });

it("signs the admin in whatever the capitals in the email", async () => {
  const { app } = await createTestApp();
  const email = config.admin.email!;

  for (const typed of [email, email.toUpperCase(), email.charAt(0).toUpperCase() + email.slice(1)]) {
    const res = await adminSignIn(app, typed, ADMIN_TEST_PASSWORD);
    expect({ typed, status: res.status }).toEqual({ typed, status: 200 });
    expect(res.body.user.email).toBe(email);
  }
});

it("still refuses another address, and the wrong password", async () => {
  const { app } = await createTestApp();

  expect((await adminSignIn(app, "someone.else@harness.test", ADMIN_TEST_PASSWORD)).status).toBe(401);
  expect((await adminSignIn(app, config.admin.email!.toUpperCase(), "Not-the-password-9")).status).toBe(401);
});
