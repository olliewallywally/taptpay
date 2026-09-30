import "./support/test-env";

import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storageSnapshot, VALID_PASSWORD } from "./support/http-harness";

/**
 * R1-T4 phase E (owner decisions 2026-09-29 and 2026-09-30,
 * docs/PLAN-2026-09-29-r1-t4-phase-e-sessions.md §2.2–2.3). Once a sign-in is a cookie, the browser sends
 * it by itself, so another website must not be able to make a signed-in browser act, and only the site's
 * own origin may read its answers. A change (POST, PUT, PATCH, DELETE) whose Origin is another site —
 * `null` included — or, with no Origin, whose Sec-Fetch-Site says another site, is refused before anything
 * else, unless the route is on the named list of callbacks that legitimately arrive from another site. The
 * CORS answer names only the site's own origin (PUBLIC_ORIGIN, here https://harness.test), never `*`, never
 * an origin merely because it was sent. Requests with no Origin (servers, the scheduler) are unaffected.
 */

type App = Awaited<ReturnType<typeof createTestApp>>["app"];
const SITE = "https://harness.test";

jest.setTimeout(30_000);
beforeEach(() => resetTestStorage());

const loginFrom = (app: App, headers: Record<string, string>, email = "nobody@harness.test") => {
  let call = request(app).post("/api/auth/login");
  for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
  return call.send({ email, password: "Wrong-password-1" });
};

describe("a change sent from another website is refused before anything else", () => {
  it.each([
    ["another site", { Origin: "https://evil.test" }],
    ["a null origin (a sandboxed frame, a file, a privacy redirect)", { Origin: "null" }],
    ["the site's name inside another domain", { Origin: "https://harness.test.evil.test" }],
    ["a look-alike domain", { Origin: "https://evilharness.test" }],
    ["the site over plain http", { Origin: "http://harness.test" }],
    ["the site on another port", { Origin: "https://harness.test:8443" }],
    ["two origins at once", { Origin: `${SITE}, https://evil.test` }],
    ["no Origin, but the browser says cross-site", { "Sec-Fetch-Site": "cross-site" }],
    ["no Origin, but the browser says another site of the same domain", { "Sec-Fetch-Site": "same-site" }],
  ])("%s: 403 CROSS_SITE_REJECTED, nothing counted or changed", async (_label, headers) => {
    const { app } = await createTestApp();
    const before = storageSnapshot();

    const res = await loginFrom(app, headers);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CROSS_SITE_REJECTED");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(storageSnapshot()).toBe(before);
  });

  it.each([
    ["the site's own origin", { Origin: SITE }],
    ["no Origin at all (a server, the scheduler)", {}],
    ["no Origin, and the browser says same origin", { "Sec-Fetch-Site": "same-origin" }],
    ["no Origin, and the person typed the address", { "Sec-Fetch-Site": "none" }],
  ])("%s: let through to the route (here: wrong password, 401)", async (_label, headers) => {
    const { app } = await createTestApp();

    const res = await loginFrom(app, headers);

    expect(res.status).toBe(401);
  });

  it("the site's own origin can sign in", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app).post("/api/auth/login").set("Origin", SITE).send({ email: owner.user.email, password: VALID_PASSWORD });
    expect(res.status).toBe(200);
  });

  it("reads from another site are answered, but without CORS headers the browser keeps the answer from it", async () => {
    const { app } = await createTestApp();

    const res = await request(app).get("/api/push/capabilities").set("Origin", "https://evil.test");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("the CORS answer names only the site's own origin", () => {
  it("a read from the site's origin is allowed, with credentials, and varies by Origin", async () => {
    const { app } = await createTestApp();

    const res = await request(app).get("/api/push/capabilities").set("Origin", SITE);
    expect(res.headers["access-control-allow-origin"]).toBe(SITE);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers.vary).toMatch(/Origin/);
  });

  it("the preflight from the site's origin allows the methods and the CSRF header, and the request that follows gets the same answer", async () => {
    const { app } = await createTestApp();

    const preflight = await request(app)
      .options("/api/auth/login")
      .set("Origin", SITE)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type, x-csrf-token");
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(SITE);
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
    expect(preflight.headers["access-control-allow-methods"]).toMatch(/\bPOST\b/);
    expect(preflight.headers["access-control-allow-headers"]).toMatch(/x-csrf-token/i);
    expect(preflight.headers["access-control-allow-headers"]).toMatch(/content-type/i);

    const actual = await loginFrom(app, { Origin: SITE });
    expect(actual.status).toBe(401);
    expect(actual.headers["access-control-allow-origin"]).toBe(SITE);
  });

  it.each([
    ["another site", "https://evil.test"],
    ["a null origin", "null"],
  ])("the preflight from %s is refused, with no CORS headers, and so is the request that would follow", async (_label, origin) => {
    const { app } = await createTestApp();

    const preflight = await request(app)
      .options("/api/auth/login")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
    expect(preflight.status).toBe(403);
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
    expect(preflight.headers["access-control-allow-methods"]).toBeUndefined();

    expect((await loginFrom(app, { Origin: origin })).status).toBe(403);
  });

  it("no answer ever says * or repeats an origin that is not the site's", async () => {
    const { app } = await createTestApp();
    const answers = await Promise.all([
      request(app).get("/api/push/capabilities").set("Origin", "https://evil.test"),
      request(app).get("/api/push/capabilities").set("Origin", "null"),
      request(app).get("/api/push/capabilities"),
      request(app).options("/api/auth/login").set("Origin", "https://evil.test").set("Access-Control-Request-Method", "GET"),
      loginFrom(app, { Origin: "https://evil.test" }),
    ]);
    for (const res of answers) {
      expect(res.headers["access-control-allow-origin"] ?? "absent").not.toBe("*");
      expect(res.headers["access-control-allow-origin"] ?? "absent").not.toMatch(/evil|null/);
    }
  });
});

describe("the named callbacks from other sites", () => {
  it.each([
    ["Windcave's card capture", "https://sec.windcave.com"],
    ["Windcave's test card capture", "https://uat.windcave.com"],
    ["a page with no referrer (Origin: null)", "null"],
  ])("the billing card return accepts %s's form post: it changes nothing and only sends the browser to billing", async (_label, origin) => {
    const { app } = await createTestApp();
    const before = storageSnapshot();

    const res = await request(app)
      .post("/api/billing/card/callback?merchantId=1")
      .set("Origin", origin)
      .type("form")
      .send({ result: "approved" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/settings?section=billing&card=approved");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(storageSnapshot()).toBe(before);
  });

  it("the list names a route and a method, not a prefix: another route from the same site is refused", async () => {
    const { app } = await createTestApp();

    const res = await loginFrom(app, { Origin: "https://sec.windcave.com" });
    expect(res.status).toBe(403);
  });

  it("a provider's notification, sent by its server with no Origin, is unaffected", async () => {
    const { app } = await createTestApp();

    const res = await request(app).post("/api/billing/card/notification").send({ sessionId: "anything" });
    expect(res.status).toBe(200);
  });
});
