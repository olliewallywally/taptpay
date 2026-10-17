import fs from "node:fs";
import path from "node:path";
import { readRouteRegistrationSource } from '../route-inventory';

const source = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");

function handler(method: "get" | "post" | "put" | "delete", route: string): string {
  return readRouteRegistrationSource(method, route).registration;
}

describe("subscription and team route authorization", () => {
  test.each([
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

  test("get /api/subscription is member-readable but remains authenticated", () => {
    const body = handler("get", "/api/subscription");
    expect(body.slice(0, body.indexOf("async ("))).toContain("authenticateToken");
    // A teammate is never refused here. The one 403 is the platform admin's, which has no business
    // (P2.2, R1-T3, 2026-09-27: it was 400).
    expect(body.match(/res\.status\(403\)[^;]*/g) ?? []).toEqual(["res.status(403).json(MERCHANT_ACCESS_REQUIRED)"]);
    expect(body.indexOf("isAccountOwner(req.user)"))
      .toBeGreaterThan(body.indexOf("storage.getOrCreateSubscription("));
    expect(body).toContain("subscriptionDto(subscription, seatsInUse)");
  });

  test.each([
    ["post", "/api/merchants/:id/onboarding"],
    ["put", "/api/merchants/:id/details"],
    ["put", "/api/merchants/:id"],
  ] as const)("%s %s requires account ownership", (method, route) => {
    expect(handler(method, route)).toContain("checkAccountOwnership(req, merchantId)");
  });

  test("member Settings receives a restricted merchant profile", () => {
    const profile = handler("get", "/api/merchants/:id/profile");
    expect(profile).toContain("checkMerchantOwnership(req, merchantId)");
    expect(profile).toContain("isAccountOwner(req.user)");
    expect(profile).toContain("memberMerchantSettingsDto(merchant)");
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
  test("card setup requires a UUID and delegates to the durable scoped engine",()=>{
    const session=handler("post","/api/billing/card/session");
    expect(session.indexOf("isAccountOwner(req.user)")).toBeLessThan(session.indexOf("subscriptionPayments.card.start("));
    expect(session.indexOf("isUuid(idempotencyKey)")).toBeLessThan(session.indexOf("subscriptionPayments.card.start("));
    expect(session).toContain("actor:commandActor(req,res)");
    expect(session).not.toContain("createCardStorageSession(");
  });
  test("confirmation uses the same durable inbox and projects only masked card fields",()=>{
    const confirm=handler("post","/api/billing/card/confirm");
    expect(confirm).toContain("subscriptionPayments.card.confirm(merchantId,parsed.data.sessionId)");
    expect(confirm).not.toContain("storage.completeSubscriptionCardSetup(");expect(confirm).not.toContain("storage.saveSubscriptionCard(");
    expect(confirm).toContain("res.status(202)");expect(confirm).toContain("res.status(422)");
    expect(confirm).toContain("ready:renewalPaymentMethodIsReady(subscription)");
    expect(source).toContain('app.all("/api/billing/card/notification",...durableNotificationHandlers)');
  });
  test("paid plan changes carry the authenticated actor and map failure families",()=>{
    const plan=handler("put","/api/subscription/plan");
    expect(plan).toContain("request=>executeStoredCardCharge(request,commandActor(req,res))");
    for(const reason of ["payment-method-required","declined","billing-busy","invalid-state","charge-failed"])expect(plan).toContain(`result.reason === "${reason}"`);
  });
  test("card returns validate hashed state and never trust the browser outcome",()=>{
    const start=source.indexOf("const billingCardCallback"),end=source.indexOf("// Remove the stored card",start),callback=source.slice(start,end);
    expect(callback).toContain("resolveReturnState(state)");expect(callback).toContain("card.confirm(attempt.merchant_id,attempt.session_id)");
    expect(callback).toContain("card=pending");expect(callback).not.toContain("req.query.result");
    expect(callback).toContain('app.get("/api/billing/card/callback"');expect(callback).toContain('app.post("/api/billing/card/callback"');
  });

});

describe("internal cron isolation and observability", () => {
  test("status and execution routes share the protected cron authorization", () => {
    expect(handler("get", "/api/internal/cron/status")).toContain(
      "authorizeCronRequest(req, res)",
    );
    expect(handler("post", "/api/internal/cron")).toContain(
      "authorizeCronRequest(req, res)",
    );
  });

  test("subscription billing starts independently and every module load is pass-isolated", () => {
    const cron = handler("post", "/api/internal/cron");
    const runner=fs.readFileSync(path.join(process.cwd(),'server/durable-cron.ts'),'utf8');
    const subscriptionStart = cron.search(/name:\s*['"]subscriptionBilling['"]/);
    const propertyStart = cron.search(/name:\s*['"]generate['"]/);
    expect(subscriptionStart).toBeGreaterThan(0);
    expect(propertyStart).toBeGreaterThan(subscriptionStart);
    expect(cron).toContain("await import('./subscription-cron')");
    expect(cron).toContain("await import('./property-cron')");
    const start=runner.search(/billingSettled\s*=\s*execute\(billing\)/),loop=runner.search(/for\s*\(const job of jobs\)/);
    expect(start).toBeGreaterThan(0);expect(loop).toBeGreaterThan(start);
    expect(runner).toContain('failed.add(job.name)');
    expect(cron).toMatch(/res\.status\(result\.ok\s*\?\s*200\s*:\s*207\)/);
    expect(cron).toMatch(/result\.kind\s*===\s*['"]unavailable['"]/);
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
    expect(guard).toContain("config.admin.email");
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
    // POST /api/merchants/:id/test-payment-link, the one guarded route outside /api/admin, was
    // removed on 2026-09-26 (owner decision, C10 batch 4).
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
  // POST /api/admin/merchants/signup was removed on 2026-09-26 (owner decision, C10 batch 4).
  test.each([
    ["post", "/api/merchants/signup"],
  ] as const)("%s %s checks the global login namespace", (method, route) => {
    expect(handler(method, route)).toContain("storage.getUserByEmail(normalizedEmail)");
  });

  test("public signup passes the password hash into atomic merchant creation", () => {
    const signup = handler("post", "/api/merchants/signup");
    expect(signup).toContain("createMerchantWithSignup({");
    expect(signup).toContain("passwordHash,");
    expect(signup).not.toContain("updateMerchantPasswordHash");
  });

  test("Google creation uses the atomic password-backed path", () => {
    expect(handler("get", "/api/auth/google/callback")).toContain("createMerchantWithPassword(");
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
