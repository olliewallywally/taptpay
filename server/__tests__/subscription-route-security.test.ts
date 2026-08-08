import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");

function handler(method: "get" | "post" | "put" | "delete", route: string): string {
  const marker = `app.${method}("${route}",`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing route ${method.toUpperCase()} ${route}`);
  const next = source.indexOf("\n  app.", start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("subscription and team route authorization", () => {
  test.each([
    ["get", "/api/subscription", "storage.getOrCreateSubscription("],
    ["get", "/api/team", "storage.getOrCreateSubscription("],
    ["get", "/api/subscription/billing-history", "storage.getBillingHistory("],
    ["get", "/api/billing/card", "storage.getMerchant("],
  ] as const)("%s %s authorizes the owner before reading private data", (method, route, readMarker) => {
    const body = handler(method, route);
    const gate = body.indexOf("isAccountOwner(req.user)");
    const read = body.indexOf(readMarker);
    expect(gate).toBeGreaterThan(0);
    expect(read).toBeGreaterThan(gate);
  });

  test.each([
    ["post", "/api/merchants/:id/onboarding"],
    ["get", "/api/merchants/:id/profile"],
    ["put", "/api/merchants/:id/details"],
    ["put", "/api/merchants/:id/business-details"],
    ["put", "/api/merchants/:id"],
  ] as const)("%s %s requires account ownership", (method, route) => {
    expect(handler(method, route)).toContain("checkAccountOwnership(req, merchantId)");
  });

  test("general merchant updates cannot change the login email", () => {
    const update = handler("put", "/api/merchants/:id");

    expect(update).not.toContain("email: z.string().email().optional()");
    expect(update).toContain("contactEmail: z.string().email().optional()");
  });

  test("resume rejects subscriptions whose cancellation window is already closed", () => {
    const resume = handler("post", "/api/subscription/resume");
    const guard = resume.indexOf("if (!subscription)");
    const projection = resume.indexOf("subscriptionDto(subscription");
    expect(guard).toBeGreaterThan(0);
    expect(projection).toBeGreaterThan(guard);
    expect(resume).toContain("res.status(409)");
  });
});

describe("subscription card and paid-plan route integration", () => {
  test("a hosted-card session is bound before its identifier is returned", () => {
    const session = handler("post", "/api/billing/card/session");
    const created = session.indexOf("createCardStorageSession(");
    const bound = session.indexOf("storage.bindSubscriptionCardSession(");
    const returned = session.indexOf("res.json({ sessionId:");

    expect(created).toBeGreaterThan(0);
    expect(bound).toBeGreaterThan(created);
    expect(returned).toBeGreaterThan(bound);
  });

  test("card confirmation completes the bound setup and never directly saves a token", () => {
    const confirm = handler("post", "/api/billing/card/confirm");
    expect(confirm).toContain("storage.completeSubscriptionCardSetup(");
    expect(confirm).toContain("executeStoredCardCharge");
    expect(confirm).not.toContain("storage.saveSubscriptionCard(");
    expect(confirm).toContain('completion.reason === "session-mismatch"');
    expect(confirm).toContain('completion.reason === "billing-busy"');
    expect(confirm).toContain('completion.reason === "invalid-state"');
    expect(confirm).toContain('completion.reason === "declined"');
    expect(confirm).toContain('completion.reason === "charge-failed"');
    expect(confirm).toContain("ready: billingCardIsReady(completion.subscription)");
    expect(source).toContain('app.all("/api/billing/card/notification"');
  });

  test("paid plan changes provide a charge executor and map every failure family", () => {
    const plan = handler("put", "/api/subscription/plan");
    expect(plan).toContain("changeSubscriptionPlan(merchantId, parsed.data, executeStoredCardCharge)");
    expect(plan).toContain('result.reason === "payment-method-required"');
    expect(plan).toContain('result.reason === "declined"');
    expect(plan).toContain('result.reason === "billing-busy"');
    expect(plan).toContain('result.reason === "invalid-state"');
    expect(plan).toContain('result.reason === "charge-failed"');
  });

  test("Windcave callback supports GET and POST without reflecting a session", () => {
    const start = source.indexOf("const billingCardCallback");
    const end = source.indexOf("// Remove the stored card", start);
    const callback = source.slice(start, end);
    expect(callback).toContain('app.get("/api/billing/card/callback", billingCardCallback)');
    expect(callback).toContain('app.post("/api/billing/card/callback", billingCardCallback)');
    expect(callback).not.toContain("sessionId");
    expect(callback).not.toContain("&session=");
  });
});

describe("admin and SSE token provenance", () => {
  test("the route-local admin guard delegates to the canonical token verifier", () => {
    const start = source.indexOf("const authenticateAdmin");
    const end = source.indexOf("// Google OAuth routes", start);
    const guard = source.slice(start, end);
    expect(guard).toContain("await authenticateToken(req, res");
    expect(guard).toContain('req.user?.role !== "admin"');
    expect(guard).toContain("req.user.merchantId !== 0");
    expect(guard).toContain("ADMIN_EMAIL");
    expect(handler("get", "/api/admin/auth/me")).toContain("authenticateAdmin");
  });

  test("every private admin route uses the configured-admin guard", () => {
    const registrations = Array.from(source.matchAll(
      /app\.(?:get|post|put|patch|delete)\("(\/api\/admin[^"]+)",([^\n]*)/g,
    ));
    const privateRoutes = registrations.filter(([, route]) => route !== "/api/admin/auth/login");

    expect(privateRoutes.length).toBeGreaterThan(0);
    for (const [, route, middleware] of privateRoutes) {
      expect({ route, middleware }).toEqual({
        route,
        middleware: expect.stringContaining("authenticateAdmin"),
      });
    }
    expect(handler("post", "/api/merchants/:id/test-payment-link")).toContain("authenticateAdmin");
  });

  test("authenticated SSE uses live user resolution and records its users-row audience", () => {
    const events = handler("get", "/api/merchants/:id/events");
    expect(events).toContain("await authenticateToken(");
    expect(events).toContain("userId,");
    expect(events).toContain('principal: authenticatedRequest.user?.role === "admin" ? "admin" : "user"');
    expect(events).not.toContain("jwt.verify(");
  });
});

describe("signup identity collisions", () => {
  test.each([
    ["post", "/api/merchants/signup"],
    ["post", "/api/admin/merchants/signup"],
  ] as const)("%s %s checks the global login namespace", (method, route) => {
    expect(handler(method, route)).toContain("storage.getUserByEmail(normalizedEmail)");
  });

  test("public signup passes the password hash into atomic merchant creation", () => {
    const signup = handler("post", "/api/merchants/signup");
    expect(signup).toContain("createMerchantWithSignup({");
    expect(signup).toContain("passwordHash,");
    expect(signup).not.toContain("updateMerchantPasswordHash");
  });

  test("Google and admin creation use the atomic password-backed path", () => {
    expect(handler("get", "/api/auth/google/callback")).toContain("createMerchantWithPassword(");
    expect(handler("post", "/api/admin/merchants/signup")).toContain("createMerchantWithPassword(");
  });
});

describe("invite lifecycle", () => {
  test("failed first-delivery rolls the seat back", () => {
    const invite = handler("post", "/api/team/invite");
    expect(invite).toContain("if (!emailSent)");
    expect(invite).toContain("storage.revokeTeamInvite(merchantId, result.user.id, inviteTokenHash)");
  });

  test("resend rotates credentials and invite revocation has a dedicated route", () => {
    const resend = handler("post", "/api/team/:userId/resend");
    expect(resend).toContain("storage.rotateTeamInvite(");
    expect(resend).toContain("expectedTokenHash: previous.inviteTokenHash");
    expect(resend).toContain('rotation.reason === "seat-limit"');
    expect(resend).toContain("storage.revokeTeamInvite(merchantId, userId, inviteTokenHash)");
    expect(handler("delete", "/api/team/:userId/invite")).toContain("storage.revokeTeamInvite(");
  });

  test("status changes use the atomic storage outcome and revoke live streams", () => {
    const status = handler("put", "/api/team/:userId/status");
    expect(status).toContain("storage.setTeamMemberStatus(");
    expect(status).not.toContain("storage.countSeatsInUse(");
    expect(status).toContain("sseBroker.disconnectUser(merchantId, userId)");
  });
});
