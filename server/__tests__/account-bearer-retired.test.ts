import "./support/test-env";

import request from "supertest";
import {
  VALID_PASSWORD, createAdminPrincipal, createOwnerPrincipal, createTestApp,
  resetTestStorage, signedIn, storageSnapshot,
} from "./support/http-harness";
import { oldAccountToken, oldAdminToken, oldBearer } from "./support/old-account-token";
import { observeRefusalEffects } from "./support/refusal-effects";
import { BUSINESS_COOKIE, setCookies } from "./support/session-browser";

beforeEach(() => resetTestStorage());

test("password login returns only the user and the page's CSRF token", async () => {
  const owner = await createOwnerPrincipal();
  const { app } = await createTestApp();
  const res = await request(app).post("/api/auth/login").send({ email: owner.user.email, password: VALID_PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    csrfToken: expect.any(String),
    user: { id: owner.user.id, email: owner.user.email, merchantId: owner.merchantId, role: "owner" },
  });
  expect(setCookies(res).has(BUSINESS_COOKIE)).toBe(true);
});

test.each(["business", "admin"] as const)("a %s cookie wins over an unrelated Authorization header", async (realm) => {
  const who = realm === "admin" ? await createAdminPrincipal() : await createOwnerPrincipal();
  const { app } = await createTestApp();
  const res = await request(app).get(realm === "admin" ? "/api/admin/auth/me" : "/api/auth/me")
    .set(signedIn(who)).set("Authorization", "Bearer unrelated-invalid-token");
  expect(res.status).toBe(200);
  expect(res.body.user.email).toBe(who.user.email);
});

test.each(["owner", "admin"] as const)("the old %s token cannot bypass a cookie's missing CSRF check", async (caller) => {
  const owner = await createOwnerPrincipal();
  const { app } = await createTestApp();
  const before = storageSnapshot();
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post("/api/tutorial/restart").set("Cookie", owner.cookie)
      .set(oldBearer(caller === "owner" ? oldAccountToken(owner) : oldAdminToken()));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_REJECTED");
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
  } finally { effects.restore(); }
});

test("an old admin token cannot change which cookie signs the request in", async () => {
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  const { app } = await createTestApp();
  const before = storageSnapshot();
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).get(`/api/merchants/${other.merchantId}/transactions`)
      .set(signedIn(owner)).set(oldBearer(oldAdminToken()));
    expect(res.status).toBe(403);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
  } finally { effects.restore(); }
});
