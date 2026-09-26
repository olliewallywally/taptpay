import { extractRouteFacts, statusesOfFunction, type RouteFacts } from "../route-facts";

/**
 * R1-T2 (C10): the per-route facts the policy records are read from each
 * handler's syntax tree — its own body, its middleware and the helper
 * functions it calls in the same file — not from a slice of lines, which
 * attributes a neighbour's text or a leading comment to the wrong route.
 */
const SOURCE = `
import express, { type Express } from "express";

function checkRateLimit(ip: string) { return ip.length > 0; }

async function requireBillingCard(merchantId: number, res: any): Promise<boolean> {
  const subscription = await storage.getSubscription(merchantId);
  if (!billingCardIsReady(subscription)) {
    res.status(402).json({ code: BILLING_CARD_REQUIRED, message: "Card needed" });
    return false;
  }
  return true;
}

function broadcastToStone(merchantId: number, stoneId: number, data: any) {
  sseBroker.broadcast({ merchantId, stoneId }, data);
}

export async function registerRoutes(app: Express) {
  function checkMerchantOwnership(req: any, merchantId: number): boolean {
    return req.user?.merchantId === merchantId;
  }

  const authenticateAdmin = async (req: any, res: any, next: any) => {
    await authenticateToken(req, res, () => {
      if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      next();
    });
  };

  // A leading comment that mentions checkMerchantOwnership( belongs to no route.
  app.put("/api/merchants/:id/theme", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!checkMerchantOwnership(req, merchantId)) return res.status(403).json({ message: "Access denied" });
      const validation = updateThemeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid theme", errors: validation.error.errors });
      }
      if (!(await requireBillingCard(merchantId, res))) return;
      const updated = await storage.updateMerchantTheme(merchantId, validation.data.themeId);
      broadcastToStone(merchantId, 1, { type: "theme" });
      res.json(ownerMerchantDto(updated));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/things/:thingId", async (req, res) => {
    const { thingId } = req.params;
    const limit = Number(req.query.limit);
    const stoneId = req.query.stoneId !== undefined ? strictPositiveIntegerQueryParam(req.query.stoneId) : undefined;
    if (!checkRateLimit(req.ip)) return res.status(429).json({ message: "Slow down" });
    const thing = await storage.getThing(thingId, limit, stoneId);
    if (thing.merchantId !== (req as any).user?.merchantId) return res.sendStatus(404);
    await sendEmail({ to: "owner@example.test" });
    res.json(publicThingDto(thing));
  });

  app.post("/api/admin/refund", authenticateAdmin, async (req, res) => {
    const { transactionId, amount } = req.body;
    if (!config.features.refundInitiation) return res.status(503).json({ code: "REFUNDS_OFF" });
    const claimed = await storage.claimRefund(transactionId, req.headers["idempotency-key"]);
    await createWindcaveRefund(claimed, amount);
    await fetch("https://example.test/audit");
    res.redirect("/admin/done");
  });

  async function loadTokenReceipt(rawToken: string) {
    const transaction = await storage.getTransactionByTokenHash(hashToken(rawToken));
    if (!transaction || transaction.merchantId !== merchantOfToken(rawToken)) return null;
    return transaction;
  }

  app.get("/api/pay/t/:token/receipt", async (req, res) => {
    const receipt = await loadTokenReceipt(req.params.token);
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });
    res.json(tokenReceiptDto(receipt));
  });

  const billingCardCallback = (req: express.Request, res: express.Response) => {
    res.redirect(\`/settings?card=\${String(req.query.result)}\`);
  };
  app.get("/api/billing/card/callback", billingCardCallback);

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *");
  });

  app.post("/api/webhooks/relay", async (req, res) => {
    res.status(200).send("OK");
    if (config.relay.apiKey) {
      const incoming = req.headers["apikey"] as string | undefined;
      if (incoming !== config.relay.apiKey) return;
    }
    await storage.recordRelay(req.body.id);
  });

  function authorizeCronRequest(req: any, res: any): boolean {
    const provided = Buffer.from(String(req.headers["x-cron-secret"] ?? ""));
    const secret = Buffer.from(config.cronSecret);
    if (provided.length !== secret.length || !crypto.timingSafeEqual(provided, secret)) {
      res.status(401).json({ message: "Unauthorized" });
      return false;
    }
    return true;
  }

  app.post("/api/internal/cron", async (req, res) => {
    if (!authorizeCronRequest(req, res)) return;
    const ok = await runPasses();
    res.status(ok ? 202 : 207).json({ started: true });
  });
}
`;

function factsFor(key: string): RouteFacts {
  const facts = extractRouteFacts(SOURCE, "server/routes.ts").get(key);
  if (!facts) throw new Error(`no facts for ${key}`);
  return facts;
}

describe("R1-T2 route facts, read from each handler's syntax tree (C10)", () => {
  it("finds every route, keyed by method and path", () => {
    expect([...extractRouteFacts(SOURCE, "server/routes.ts").keys()]).toEqual([
      "PUT /api/merchants/:id/theme",
      "GET /api/things/:thingId",
      "POST /api/admin/refund",
      "GET /api/pay/t/:token/receipt",
      "GET /api/billing/card/callback",
      "GET /robots.txt",
      "POST /api/webhooks/relay",
      "POST /api/internal/cron",
    ]);
  });

  it("reads a signed-in owner route: middleware, strict parsing, ownership, schema, gate, storage, effects, DTO", () => {
    expect(factsFor("PUT /api/merchants/:id/theme")).toEqual({
      middleware: ["authenticateToken"],
      params: ["id: strictPositiveIntegerParam"],
      query: [],
      body: ["schema: updateThemeSchema"],
      authChecks: ["checkMerchantOwnership"],
      storageMethods: ["getSubscription", "updateMerchantTheme"],
      sideEffects: ["live update: sseBroker.broadcast"],
      statuses: [200, 400, 402, 403, 500],
      dtos: ["ownerMerchantDto"],
      errorTextInResponse: ["error.message", "validation.error.errors"],
      capabilityGates: [],
      entitlementGates: ["BILLING_CARD_REQUIRED", "billingCardIsReady", "requireBillingCard"],
      rateLimits: [],
      idempotency: [],
      helpers: ["broadcastToStone", "requireBillingCard"],
    });
  });

  it("reads raw parameters, an inline tenant comparison, a rate limit and an email", () => {
    expect(factsFor("GET /api/things/:thingId")).toEqual({
      middleware: [],
      params: ["thingId: raw"],
      query: ["limit: raw", "stoneId: strictPositiveIntegerQueryParam"],
      body: [],
      authChecks: ["compares thing.merchantId !== (req as any).user?.merchantId"],
      storageMethods: ["getThing"],
      sideEffects: ["email: sendEmail"],
      statuses: [200, 404, 429],
      dtos: ["publicThingDto"],
      errorTextInResponse: [],
      capabilityGates: [],
      entitlementGates: [],
      rateLimits: ["checkRateLimit"],
      idempotency: [],
      helpers: ["checkRateLimit"],
    });
  });

  it("follows a middleware defined in the file, and reads body fields, a feature flag, provider and outbound calls", () => {
    expect(factsFor("POST /api/admin/refund")).toEqual({
      middleware: ["authenticateAdmin"],
      params: [],
      query: [],
      body: ["fields: amount, transactionId"],
      authChecks: ["authenticateToken", 'compares req.user?.role !== "admin"'],
      storageMethods: ["claimRefund"],
      sideEffects: ["outbound http: fetch", "provider: createWindcaveRefund"],
      statuses: [302, 403, 503],
      dtos: [],
      errorTextInResponse: [],
      capabilityGates: ["config.features.refundInitiation"],
      entitlementGates: [],
      rateLimits: [],
      idempotency: ["claimRefund", "idempotency-key header"],
      helpers: ["authenticateAdmin"],
    });
  });

  it("follows a credential check quietly: its storage reads count, it is named once, its comparisons are not repeated", () => {
    expect(factsFor("GET /api/pay/t/:token/receipt")).toEqual({
      middleware: [],
      params: ["token: raw"],
      query: [],
      body: [],
      authChecks: ["loadTokenReceipt"],
      storageMethods: ["getTransactionByTokenHash"],
      sideEffects: [],
      statuses: [200, 404],
      dtos: ["tokenReceiptDto"],
      errorTextInResponse: [],
      capabilityGates: [],
      entitlementGates: [],
      rateLimits: [],
      idempotency: [],
      helpers: [],
    });
  });

  it("adds the statuses an imported gate answers, as middleware or called inside a helper", () => {
    const facts = extractRouteFacts(SOURCE, "server/routes.ts", {
      importedStatuses: { authenticateToken: [401, 403, 503] },
    });
    expect(facts.get("PUT /api/merchants/:id/theme")?.statuses).toEqual([200, 400, 401, 402, 403, 500, 503]);
    // through the admin middleware, which calls authenticateToken itself
    expect(facts.get("POST /api/admin/refund")?.statuses).toEqual([302, 401, 403, 503]);
    expect(facts.get("GET /api/things/:thingId")?.statuses).toEqual([200, 404, 429]);
  });

  it("reads the statuses one function answers, with the helpers it calls in its own file", () => {
    const auth = `
      function unavailable(res: any) { return res.status(503).json({ code: "DOWN" }); }
      function notThis(res: any) { return res.status(418).end(); }
      export async function authenticateToken(req: any, res: any, next: any) {
        if (!req.headers.authorization) return res.status(401).json({ message: "Token required" });
        const user = await load().catch(() => null);
        if (user === null) return unavailable(res);
        if (!user.active) return res.status(403).json({ message: "Access revoked" });
        next();
      }`;
    expect(statusesOfFunction(auth, "server/auth.ts", "authenticateToken")).toEqual([401, 403, 503]);
    expect(() => statusesOfFunction(auth, "server/auth.ts", "missing")).toThrow("no function missing");
  });

  it("reads a send chained from the response with no status as a 200", () => {
    expect(factsFor("GET /robots.txt").statuses).toEqual([200]);
  });

  it("finds an error's own text behind a cast or parentheses", () => {
    const source = `
      export function wire(app: Express) {
        app.get("/x", async (_req, res) => {
          try {
            await work();
          } catch (error) {
            res.status(500).json({ message: (error as Error).message, detail: String((error as any)) });
          }
        });
      }`;
    expect(extractRouteFacts(source, "server/wire.ts").get("GET /x")?.errorTextInResponse).toEqual([
      "(error as Error).message",
      "String((error as any))",
    ]);
  });

  it("reads a shared secret compared with a configured value, and a constant-time comparison inside a check", () => {
    expect(factsFor("POST /api/webhooks/relay")).toMatchObject({
      authChecks: ["compares incoming !== config.relay.apiKey"],
      body: ["fields: id"],
      storageMethods: ["recordRelay"],
      statuses: [200],
    });
    expect(factsFor("POST /api/internal/cron")).toMatchObject({
      authChecks: ["authorizeCronRequest", "constant-time comparison: crypto.timingSafeEqual"],
      statuses: [202, 207, 401],
    });
  });

  it("reads a storage budget that refuses a request as a rate limit", () => {
    // GET /api/checkout/document/:token spends a per-link read budget shared
    // through the database; without this its review would have to say "none".
    const source = `
      export function wire(app: Express) {
        app.get("/doc/:token", async (req, res) => {
          if (!(await storage.consumeInvoiceDocumentReadLimit(req.params.token))) return res.status(429).end();
          res.json({ ok: true });
        });
      }`;
    expect(extractRouteFacts(source, "server/wire.ts").get("GET /doc/:token")?.rateLimits).toEqual([
      "storage.consumeInvoiceDocumentReadLimit",
    ]);
  });

  it("reads the sign-in checks: a password, a one-time code and a sign-up link", () => {
    // Batch 3b: without these, sign-in and its one-time credentials would read as
    // routes that check nothing.
    const source = `
      export function wire(app: Express) {
        app.post("/login", async (req, res) => {
          const user = await authenticateUser(req.body.email, req.body.password);
          if (!user) return res.status(401).end();
          res.json({ ok: true });
        });
        app.post("/admin", async (req, res) => {
          if (!(await checkPasswordEvenly(req.body.password, config.admin.passwordHash))) return res.status(401).end();
          res.json({ ok: true });
        });
        app.post("/session", async (req, res) => {
          res.json({ redeemed: await storage.consumeAuthHandoffCode(req.body.code, new Date()) });
        });
        app.post("/verify", async (req, res) => {
          res.json({ merchant: await storage.verifyMerchant(req.body.token, "hash") });
        });
      }`;
    const facts = extractRouteFacts(source, "server/wire.ts");
    expect(facts.get("POST /login")?.authChecks).toEqual(["authenticateUser"]);
    expect(facts.get("POST /admin")?.authChecks).toEqual(["checkPasswordEvenly"]);
    expect(facts.get("POST /session")?.authChecks).toEqual(["storage.consumeAuthHandoffCode"]);
    expect(facts.get("POST /verify")?.authChecks).toEqual(["storage.verifyMerchant"]);
  });

  it("reads an email sent by any send…Email function, even one imported inside the handler", () => {
    const source = `
      export function wire(app: Express) {
        app.post("/signup", async (req, res) => {
          const { sendMerchantVerificationEmail } = await import("./email-service-multi");
          await sendMerchantVerificationEmail(req.body.email, "token");
          res.json({ ok: true });
        });
      }`;
    expect(extractRouteFacts(source, "server/wire.ts").get("POST /signup")?.sideEffects).toEqual([
      "email: sendMerchantVerificationEmail",
    ]);
  });

  it("reads a handler passed by name", () => {
    expect(factsFor("GET /api/billing/card/callback")).toMatchObject({
      middleware: [],
      query: ["result: raw"],
      statuses: [302],
      helpers: ["billingCardCallback"],
    });
  });
});
