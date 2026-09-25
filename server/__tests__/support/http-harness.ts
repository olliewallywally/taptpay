/**
 * R1-T1 — no-live-system HTTP test harness.
 *
 * Builds the app production serves — `createApp` (server/app.ts: security
 * headers, compression, bearer-page caching, body parsing, the request log),
 * the real `registerRoutes` and the global error handler — with no network
 * listener, no Vite, no migrations, no seeding, no cron and no real provider
 * client. See server/index.ts for everything its bootstrap adds on top. The
 * server tests' no-network guard (./no-network.ts) fails any test that reaches
 * off this machine anyway.
 *
 * MUST be imported only from a test file that imported "./test-env" first
 * (for its side effect) — that module deletes DATABASE_URL and sets the rest
 * of the deterministic test environment before config.ts/storage.ts load.
 */
import crypto from "crypto";
import type { Express } from "express";
import http, { type IncomingHttpHeaders, type Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import type { Readable } from "stream";
import zlib from "zlib";
import { createApp } from "../../app";
import { registerRoutes } from "../../routes";
import { createGlobalErrorHandler } from "../../http-error-handler";
import { storage as liveStorage } from "../../storage";
import { config } from "../../config";
import { generateToken, type User } from "../../auth";
import { createPaymentCredential, hashPaymentToken } from "../../payment-credential";
import type { Merchant } from "@shared/schema";

export interface TestApp {
  app: Express;
  httpServer: HttpServer;
  /** Every line the request log wrote, oldest first; emptied by resetTestStorage(). */
  requestLog: string[];
}

let cached: TestApp | null = null;

/**
 * Builds the app once per test file (module-scope memoisation — Jest already
 * gives each test file its own registry, so this never leaks across files).
 * Use resetTestStorage() between tests instead of rebuilding the app.
 */
export async function createTestApp(): Promise<TestApp> {
  if (cached) return cached;

  if (typeof liveStorage.clearAllMerchants !== "function") {
    throw new Error(
      "http-harness requires MemStorage (clearAllMerchants missing) — " +
        'import "./test-env" before importing "./http-harness" in this test file.',
    );
  }

  const requestLog: string[] = [];
  const app = createApp({ writeRequestLog: (line) => requestLog.push(line) });
  const httpServer = await registerRoutes(app);
  app.use(createGlobalErrorHandler());

  cached = { app, httpServer, requestLog };
  return cached;
}

/** Clears all merchant/user/transaction state between tests. Real reset, not a fresh app. */
export function resetTestStorage(): void {
  liveStorage.clearAllMerchants?.();
  cached?.requestLog.splice(0);
}

export const storage = liveStorage;

function randomEmail(label: string): string {
  return `${label}.${crypto.randomBytes(4).toString("hex")}@harness.test`;
}

export const VALID_PASSWORD = "Harness123";

async function createActiveMerchant(overrides: Partial<Merchant> & { email?: string } = {}): Promise<Merchant> {
  const email = overrides.email ?? randomEmail("owner");
  const created = await liveStorage.createMerchant({
    name: overrides.name ?? "Harness Merchant",
    businessName: overrides.businessName ?? "Harness Merchant Ltd",
    businessType: "retail",
    email,
    phone: "021 555 0100",
    address: "1 Test Street, Auckland",
  } as any);
  const activated = await liveStorage.updateMerchantStatus(created.id, "active");
  return activated ?? created;
}

export interface Principal {
  token: string;
  user: User;
  merchantId: number;
}

/** A merchant account owner with an active login. */
export async function createOwnerPrincipal(overrides: Partial<Merchant> & { email?: string } = {}): Promise<Principal> {
  const merchant = await createActiveMerchant(overrides);
  const { createUser } = await import("../../auth");
  const user = await createUser(merchant.email, VALID_PASSWORD, merchant.id, "merchant");
  return { token: generateToken(user), user, merchantId: merchant.id };
}

/** An active teammate (role "member") on the given owner's merchant, via the real invite→accept path. */
export async function createMemberPrincipal(merchantId: number): Promise<Principal> {
  // The default "solo" plan has exactly one seat (the owner). A brand-new
  // subscription has no live paid period yet, so this upgrade applies
  // immediately with no charge — see changeSubscriptionPlan's `!paidUpgrade` path.
  await liveStorage.getOrCreateSubscription(merchantId);
  const upgraded = await liveStorage.changeSubscriptionPlan(merchantId, "team");
  if (!upgraded.ok) throw new Error(`fixture: could not grant a team seat — ${upgraded.reason}`);

  const rawToken = crypto.randomBytes(24).toString("hex");
  const inviteTokenHash = crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
  const invited = await liveStorage.inviteTeamMember(merchantId, {
    email: randomEmail("member"),
    inviteTokenHash,
    inviteExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  if (!invited.ok) throw new Error(`fixture: could not invite member — ${invited.reason}`);

  const passwordHash = await import("bcrypt").then((bcrypt) => bcrypt.hash(VALID_PASSWORD, 4));
  const activated = await liveStorage.activateInvitedUser(invited.user.id, inviteTokenHash, passwordHash);
  if (!activated) throw new Error("fixture: member invite did not activate");

  // activateInvitedUser returns the raw storage row (nullable merchantId,
  // per shared/schema.ts); generateToken wants auth.ts's stricter principal
  // shape, so re-read it the same way authenticateUser does.
  const { getUserByEmail } = await import("../../auth");
  const user = await getUserByEmail(activated.email);
  if (!user) throw new Error("fixture: activated member row failed auth conversion");

  return { token: generateToken(user), user, merchantId };
}

/**
 * A teammate whose seat has been revoked *after* their token was issued —
 * proves authenticateToken re-checks status live rather than trusting the JWT.
 */
export async function createDisabledMemberPrincipal(merchantId: number): Promise<Principal> {
  const member = await createMemberPrincipal(merchantId);
  const result = await liveStorage.setTeamMemberStatus(merchantId, member.user.id, "disabled");
  if (!result.ok) throw new Error(`fixture: could not disable member — ${result.reason}`);
  return member; // token was minted while active; the server must reject it now
}

/** The platform admin principal — merchantId 0, email must equal config.admin.email exactly. */
export function createAdminPrincipal(): Principal {
  const adminEmail = config.admin.email;
  if (!adminEmail) {
    throw new Error("fixture: ADMIN_EMAIL is not set — check server/__tests__/support/test-env.ts");
  }
  const user: User = {
    id: 1,
    userId: 1,
    email: adminEmail,
    password: "",
    merchantId: 0,
    role: "admin",
    createdAt: new Date(),
  };
  return { token: generateToken(user), user, merchantId: 0 };
}

/** Authorization header for the named principal. */
export function bearer(principal: Pick<Principal, "token">): Record<string, string> {
  return { Authorization: `Bearer ${principal.token}` };
}

/** Header for the cron-only endpoints (authorizeCronRequest in routes.ts). */
export function cronHeader(): Record<string, string> {
  if (!config.cronSecret) {
    throw new Error("fixture: CRON_SECRET is not set — check server/__tests__/support/test-env.ts");
  }
  return { "x-cron-secret": config.cronSecret };
}

/**
 * A single-resource public payment credential (retail token flow) — NOT an
 * account session. `paymentTokenHash` is set once, at transaction creation
 * (there is no setter for an existing row), so this only mints the
 * raw/hash pair; pass `tokenHash` as the transaction's `paymentTokenHash`
 * when creating the fixture transaction, then use `rawToken` as the
 * `:token` path param against the real resolve/pay/receipt routes.
 */
export function mintPaymentCredential(): { rawToken: string; tokenHash: string } {
  const credential = createPaymentCredential();
  return { rawToken: credential.rawToken, tokenHash: hashPaymentToken(credential.rawToken) };
}

/**
 * An ecommerce API key header. FEATURE_ECOMMERCE_API defaults false, so
 * /api/v1/* routes 404 before this key is even looked up — the fixture exists
 * so a test can prove that ordering (requireEcommerceApi before authenticateApiKey).
 */
export function apiKeyHeader(rawKey = "harness-ecommerce-api-key"): Record<string, string> {
  return { Authorization: `Bearer ${rawKey}` };
}

/**
 * The provider-notification principal: Windcave's notification call, which
 * carries no user session — a GET with `?sessionid=` (Windcave's pseudo code
 * v1.5; the route accepts every method). Send it with
 * `request(app)[n.method](n.path)`.
 */
export function providerNotification({ sessionId }: { sessionId: string }): { method: "get"; path: string } {
  return { method: "get", path: `/api/windcave/notification?sessionid=${encodeURIComponent(sessionId)}` };
}

/**
 * Fakes the clock (`Date`) only. Every timer stays real, so HTTP, bcrypt and
 * supertest keep working (the set-up auth-throttle.test.ts uses). Always
 * `restore()`, in a finally or an afterEach.
 */
export function useFakeClock(now: Date): { advance(ms: number): void; restore(): void } {
  jest.useFakeTimers({
    now,
    doNotFake: [
      "hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
      "requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate", "setInterval",
      "clearInterval", "setTimeout", "clearTimeout",
    ],
  });
  return {
    advance: (ms) => jest.setSystemTime(Date.now() + ms),
    restore: () => jest.useRealTimers(),
  };
}

export interface EventStream {
  status: number;
  headers: IncomingHttpHeaders;
  /** The next `data:` event, parsed as JSON; rejects if none arrives in time. */
  nextEvent(timeoutMs?: number): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Opens a live event stream (SSE) on a loopback listener and reads it the way
 * a browser does: decompressing a gzip, deflate or brotli body, one `data:`
 * event at a time. (supertest cannot read a response that never ends.)
 */
export async function openEventStream(
  app: Express,
  path: string,
  headers: Record<string, string> = {},
): Promise<EventStream> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path, headers }, resolve).on("error", reject);
  });

  const decoders: Record<string, () => zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress> = {
    gzip: () => zlib.createGunzip(),
    deflate: () => zlib.createInflate(),
    br: () => zlib.createBrotliDecompress(),
  };
  const decoder = decoders[String(response.headers["content-encoding"] ?? "")];
  const body: Readable = decoder ? response.pipe(decoder()) : response;

  const events: unknown[] = [];
  const waiting: Array<(event: unknown) => void> = [];
  let buffered = "";
  body.setEncoding("utf8");
  body.on("data", (chunk: string) => {
    buffered += chunk;
    let end: number;
    while ((end = buffered.indexOf("\n\n")) !== -1) {
      const frame = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      const event = JSON.parse(data);
      const waiter = waiting.shift();
      if (waiter) waiter(event);
      else events.push(event);
    }
  });
  body.on("error", () => {}); // the stream is torn down on close()

  return {
    status: response.statusCode ?? 0,
    headers: response.headers,
    nextEvent(timeoutMs = 1_000) {
      if (events.length > 0) return Promise.resolve(events.shift());
      return new Promise((resolve, reject) => {
        const deliver = (event: unknown) => {
          clearTimeout(timer);
          resolve(event);
        };
        const timer = setTimeout(() => {
          waiting.splice(waiting.indexOf(deliver), 1);
          reject(new Error(`no event on ${path} within ${timeoutMs} ms`));
        }, timeoutMs);
        waiting.push(deliver);
      });
    },
    async close() {
      response.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
