import {
  LANDING_DEMO_ABSOLUTE_LIFETIME_MS,
  LANDING_DEMO_TTL_MS,
  type LandingDemoActionRequest,
} from "@shared/landing-demo";
import { landingDemoActionSchema } from "../landing-demo-schema";
import {
  createLandingDemoSeedState,
  LandingDemoService,
} from "../landing-demo-service";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tokenFor = (value: number) => Buffer.alloc(32, value).toString("base64url");

describe("isolated landing-demo session service", () => {
  let now: number;
  let tokenIndex: number;
  let service: LandingDemoService;

  beforeEach(() => {
    now = Date.UTC(2026, 7, 7);
    tokenIndex = 1;
    service = new LandingDemoService({
      now: () => now,
      tokenFactory: () => tokenFor(tokenIndex++),
      startCleanup: false,
    });
  });

  afterEach(() => service.dispose());

  function create(ip = "192.0.2.1") {
    const result = service.create(ip);
    if (result.kind !== "created") throw new Error(`create failed: ${result.kind}`);
    return result.session;
  }

  test("creates the exact deterministic seed and returns a 32-byte token once", () => {
    const session = create();
    expect(session.token).toHaveLength(43);
    expect(session.revision).toBe(0);
    expect(session.state).toEqual(createLandingDemoSeedState("retail-sale"));
    expect(JSON.stringify(session.state)).not.toContain(session.token);
    const records = [...(service as unknown as {
      sessions: Map<string, Record<string, unknown>>;
    }).sessions.values()];
    expect(records).toHaveLength(1);
    expect(records[0]).not.toHaveProperty("token");
    expect(records[0].tokenHash).not.toBe(session.token);
  });

  test("keeps sessions isolated and reset replaces the entire state", () => {
    const first = create("192.0.2.1");
    const second = create("192.0.2.2");
    const reset = service.apply(first.token, {
      type: "RESET_SCENE", expectedRevision: 0, scene: "rent-weekly",
    });
    expect(reset.kind).toBe("ok");
    const sent = service.apply(first.token, {
      type: "CREATE_WEEKLY_RENT", expectedRevision: 1,
      tenantKey: "tenant-mia", amountCents: 62_000, frequency: "weekly",
    });
    expect(sent.kind).toBe("ok");
    expect(service.read(second.token)).toMatchObject({
      kind: "ok", snapshot: { revision: 0, state: createLandingDemoSeedState("retail-sale") },
    });
    const restored = service.apply(first.token, {
      type: "RESET_SCENE", expectedRevision: 2, scene: "rent-weekly",
    });
    expect(restored).toMatchObject({
      kind: "ok", snapshot: { revision: 3, state: createLandingDemoSeedState("rent-weekly") },
    });
  });

  test("returns the authoritative snapshot on a stale revision", () => {
    const session = create();
    const result = service.apply(session.token, {
      type: "RESET_SCENE", expectedRevision: 99, scene: "overview",
    });
    expect(result).toMatchObject({
      kind: "conflict",
      snapshot: { revision: 0, state: createLandingDemoSeedState("retail-sale") },
    });
  });

  test("uses a sliding 20 minute TTL capped by a 30 minute lifetime", () => {
    const session = create();
    now += LANDING_DEMO_TTL_MS - 1;
    expect(service.read(session.token).kind).toBe("ok");
    now = Date.UTC(2026, 7, 7) + LANDING_DEMO_ABSOLUTE_LIFETIME_MS - 1;
    expect(service.read(session.token).kind).toBe("ok");
    now += 1;
    expect(service.read(session.token)).toEqual({ kind: "expired" });
  });

  test("enforces create and action windows", () => {
    service.dispose();
    service = new LandingDemoService({
      now: () => now, tokenFactory: () => tokenFor(tokenIndex++),
      createLimit: 2, actionLimit: 2, startCleanup: false,
    });
    const session = create("198.51.100.2");
    create("198.51.100.2");
    expect(service.create("198.51.100.2")).toEqual({ kind: "rate-limited" });
    expect(service.apply(session.token, { type: "RESET_SCENE", expectedRevision: 0, scene: "overview" }).kind).toBe("ok");
    expect(service.apply(session.token, { type: "RESET_SCENE", expectedRevision: 1, scene: "overview" }).kind).toBe("ok");
    expect(service.apply(session.token, { type: "RESET_SCENE", expectedRevision: 2, scene: "overview" })).toEqual({ kind: "rate-limited" });
  });

  test("evicts the least-recently-used session at the count cap", () => {
    service.dispose();
    service = new LandingDemoService({
      now: () => now, tokenFactory: () => tokenFor(tokenIndex++),
      maxSessions: 2, createLimit: 20, startCleanup: false,
    });
    const first = create("1");
    now += 1;
    const second = create("2");
    now += 1;
    service.read(first.token);
    now += 1;
    const third = create("3");
    expect(service.read(second.token)).toEqual({ kind: "expired" });
    expect(service.read(first.token).kind).toBe("ok");
    expect(service.read(third.token).kind).toBe("ok");
  });

  test("evicts by aggregate byte capacity and never exceeds the cap", () => {
    const bytes = Buffer.byteLength(JSON.stringify(createLandingDemoSeedState()), "utf8");
    service.dispose();
    service = new LandingDemoService({
      now: () => now, tokenFactory: () => tokenFor(tokenIndex++),
      maxAggregateBytes: bytes * 2 - 1, createLimit: 20, startCleanup: false,
    });
    const first = create("1");
    const second = create("2");
    expect(service.stats()).toEqual({ sessions: 1, aggregateBytes: bytes });
    expect(service.read(first.token)).toEqual({ kind: "expired" });
    expect(service.read(second.token).kind).toBe("ok");
  });

  test("rejects an oversized reducer result atomically", () => {
    const initial = createLandingDemoSeedState("retail-sale");
    const initialBytes = Buffer.byteLength(JSON.stringify(initial), "utf8");
    service.dispose();
    service = new LandingDemoService({
      now: () => now, tokenFactory: () => tokenFor(tokenIndex++),
      maxStateBytes: initialBytes, startCleanup: false,
    });
    const session = create();
    const result = service.apply(session.token, {
      type: "RESET_SCENE", expectedRevision: 0, scene: "checkout-wallet",
    });
    expect(result).toEqual({ kind: "state-too-large" });
    expect(service.read(session.token)).toMatchObject({
      kind: "ok", snapshot: { revision: 0, state: initial },
    });
  });

  test.each([
    { type: "RESET_SCENE", expectedRevision: 0, scene: "overview", merchantId: 22 },
    { type: "RESET_SCENE", expectedRevision: 0, scene: "overview", userId: 4 },
    { type: "RESET_SCENE", expectedRevision: 0, scene: "overview", url: "https://example.test" },
    { type: "RESET_SCENE", expectedRevision: 0, scene: "overview", file: "bytes" },
    { type: "RESET_SCENE", expectedRevision: 0, scene: "overview", providerPayload: {} },
    { type: "unknown", expectedRevision: 0 },
  ])("strictly rejects forbidden or unknown action payload %#", payload => {
    expect(landingDemoActionSchema.safeParse(payload).success).toBe(false);
  });

  test("rejects invalid semantic transitions without changing revision", () => {
    const session = create();
    const action: LandingDemoActionRequest = {
      type: "SETTLE_RETAIL_SALE", expectedRevision: 0, saleKey: "flat-white-sale",
    };
    expect(service.apply(session.token, action)).toEqual({ kind: "invalid-transition" });
    expect(service.read(session.token)).toMatchObject({ kind: "ok", snapshot: { revision: 0 } });
  });

  test("has no production database, auth, provider, communication, or SSE imports", () => {
    const files = [
      "server/landing-demo-service.ts",
      "server/landing-demo-schema.ts",
      "server/landing-demo-routes.ts",
    ];
    const forbidden = [
      /from ["'][^"']*(?:database|storage|auth|windcave|wallet|email|sms|push|webhook|pdf|upload|receipt|sse)[^"']*["']/i,
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    }
  });
});
