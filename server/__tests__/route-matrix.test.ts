import "./support/test-env";
// Push subscription checks its keys (503) before the caller, as P2.2 orders a capability before the
// role or tenant: with keys set, the caller's answer is the one observed.
import "./support/push-test-env";

import { observeRefusalEffects } from "./support/refusal-effects";
import request from "supertest";
import { expandFacts } from "../route-facts";
import { ADMIN_SERVED_AT_THE_GATE, GATE_REFUSED, ROUTE_MATRIX, type MatrixCaller } from "../route-matrix";
import { ROUTE_POLICY } from "../route-policy";
import { ROUTE_REVIEW } from "../route-review";
import {
  signedIn,
  createAdminPrincipal,
  createDisabledMemberPrincipal,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  mintPaymentCredential,
  resetTestStorage,
  storage,
  storageSnapshot,
  type Principal,
} from "./support/http-harness";
import { SERVED_FAMILIES } from "./support/matrix-served";
import { oldAccountToken, oldAdminToken, oldBearer } from "./support/old-account-token";
import { BUSINESS_COOKIE } from "./support/session-browser";

/**
 * R1-T3 (plan C10): every API row's refusals, driven at runtime. P2.2: a caller whose authentication
 * is missing, invalid, expired or disabled gets 401; an authenticated principal without the role or
 * the tenant gets 403. Each refusal must change nothing (the storage snapshot is compared).
 *
 * R1-T4 phase E3: the sign-in is the session cookie and nothing else. Every caller signs in as a page
 * does (its cookie, and the page's CSRF token), and the account token the app once held, correctly
 * signed and unexpired, is refused on every route: the owner's and the platform admin's.
 *
 * This part covers the two sign-in gates, whose refusals come before any route-specific work, so a
 * well-formed placeholder request is enough for every route: each path parameter gets a value its
 * parser accepts, and a body-taking route gets an empty object.
 */

const PLACEHOLDER: Record<string, string> = {
  strictUuidParam: "11111111-1111-4111-8111-111111111111",
  strictPositiveIntegerParam: "1",
  isTutorialPageKey: "retail-terminal",
};

function addressOf(key: string): { method: "get" | "post" | "put" | "patch" | "delete"; path: string } {
  const [method, path] = key.split(" ");
  const facts = expandFacts(ROUTE_POLICY[key].facts);
  const parsers = new Map(facts.params.map((entry) => {
    const [name, how] = entry.split(": ");
    return [name, how.split(" | ")[0]] as const;
  }));
  const filled = path.replace(/:([A-Za-z]+)/g, (_match, name: string) => PLACEHOLDER[parsers.get(name) ?? ""] ?? "x");
  return { method: method.toLowerCase() as any, path: filled };
}

/**
 * A well-formed body for the routes that read theirs before the caller's tenant: P2.2 answers malformed
 * input (400) before a missing tenant (403), so an empty body would hide the tenant check.
 */
const WELL_FORMED_BODY: Record<string, Record<string, unknown>> = {
  "POST /api/push/subscribe": {
    subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/matrix-placeholder", keys: { p256dh: "placeholder", auth: "placeholder" } },
  },
  "POST /api/push/unsubscribe": { endpoint: "https://fcm.googleapis.com/fcm/send/matrix-placeholder" },
  "POST /api/push/native-subscribe": { deviceToken: "matrix-placeholder-device" },
};

/**
 * The refusals a gate makes before any route-specific work: the callers GATE_REFUSED names, the
 * platform admin, and the owner and a teammate on the admin routes (whose session is not a sign-in to
 * the admin area). A teammate's or another business's refusal at a route's own role or tenant check is
 * driven with real requests (route-matrix-roles).
 */
const AT_THE_GATE = (gate: string, caller: MatrixCaller) =>
  (GATE_REFUSED as readonly string[]).includes(caller) || caller === "platform-admin" || (gate === "admin" && (caller === "owner" || caller === "member"));

/** [route, caller, the status the matrix says it is refused with] for every refusal of a gated route. */
const REFUSALS: Array<[string, MatrixCaller, number]> = Object.entries(ROUTE_MATRIX).filter(([, row]) => row.gate !== "own").flatMap(([key, row]) =>
  (Object.entries(row.answers) as Array<[MatrixCaller, unknown]>)
    .filter(([caller, answer]) => typeof answer === "number" && AT_THE_GATE(row.gate, caller))
    .map(([caller, answer]): [string, MatrixCaller, number] => [key, caller, answer as number]),
);

describe("R1-T3 — the matrix records who each route is for", () => {
  it("has a row for every route of the policy", () => {
    expect(Object.keys(ROUTE_MATRIX).sort()).toEqual(Object.keys(ROUTE_POLICY).sort());
  });

  it("serves at least one caller on every route", () => {
    const forNobody = Object.entries(ROUTE_MATRIX)
      .filter(([, row]) => !Object.values(row.answers).includes("allowed"))
      .map(([key]) => key);
    expect(forNobody).toEqual([]);
  });

  it("has every route that serves a caller in exactly one served test's family", () => {
    // Each family's test (route-matrix-served-<family>.test.ts) has a request for every one of its routes.
    const unclaimedOrTwice = Object.entries(ROUTE_MATRIX)
      .filter(([, row]) => Object.values(row.answers).includes("allowed"))
      .map(([key, row]) => ({
        key,
        families: Object.entries(SERVED_FAMILIES).filter(([, family]) => family.gate === row.gate && family.family.test(key)).map(([name]) => name),
      }))
      .filter(({ families }) => families.length !== 1);
    expect(unclaimedOrTwice).toEqual([]);
  });
});

describe("R1-T3 — every signed-in route's gate refusals (P2.2), with nothing changed", () => {
  let app: any;
  /** The headers each caller sends; none for the caller with no credential at all. */
  const callers = {} as Record<MatrixCaller, Record<string, string>>;

  beforeAll(async () => {
    resetTestStorage();
    ({ app } = await createTestApp());
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const disabled = await createDisabledMemberPrincipal(owner.merchantId);
    // A business suspended after its owner signed in (createOwnerPrincipal takes no status).
    const suspended = await createOwnerPrincipal();
    await storage.updateMerchant(suspended.merchantId, { status: "suspended" } as any);
    callers["signed-out"] = {};
    callers.owner = signedIn(owner);
    callers.member = signedIn(member);
    callers["disabled-login"] = signedIn(disabled);
    callers["suspended-business"] = signedIn(suspended);
    // The owner's own session id, with a secret that is not that session's (and the page's real CSRF token).
    callers["invalid-session"] = signedIn({ cookie: `${BUSINESS_COOKIE}=${owner.sessionId}.${"A".repeat(43)}`, csrf: owner.csrf });
    // A live payment link's token: it opens its one sale, and is never a sign-in, wherever it is put.
    const link = mintPaymentCredential();
    await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Linked sale", price: "5.50", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false, paymentTokenHash: link.tokenHash,
    } as any);
    callers["link-as-sign-in"] = { Cookie: `${BUSINESS_COOKIE}=${link.rawToken}`, ...oldBearer(link.rawToken) };
    callers["platform-admin"] = signedIn(await createAdminPrincipal());
    callers["old-admin-token"] = oldBearer(oldAdminToken());
    oldTokenOf = owner;
  });

  /**
   * The token the owner held before sessions: signed with the server's secret, within its hour, for a
   * login and a business in good standing, and minted for each request under the session version the
   * login has at that moment. Nothing but its retirement refuses it.
   */
  let oldTokenOf: Principal;
  async function headersOf(caller: MatrixCaller): Promise<Record<string, string>> {
    if (caller !== "old-token") return callers[caller];
    const login = await storage.getUserById(oldTokenOf.user.id);
    return oldBearer(oldAccountToken({ ...oldTokenOf, user: { ...oldTokenOf.user, sessionVersion: login?.sessionVersion ?? 0 } }));
  }

  it("builds the old tokens as the server once did: the sign-in they name is in good standing", async () => {
    // The owner the old token names is served by its session, so the token's refusal is the token's alone.
    expect((await request(app).get("/api/auth/me").set(callers.owner)).status).toBe(200);
    expect((await request(app).get("/api/admin/auth/me").set(callers["platform-admin"])).status).toBe(200);
    for (const caller of ["old-token", "old-admin-token"] as const) {
      const headers = await headersOf(caller);
      expect(Object.keys(headers)).toEqual(["Authorization"]);
      expect(headers.Authorization).toMatch(/^Bearer eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
    }
  });

  it("serves the platform admin at the gate only where the route's review says so in words", () => {
    for (const [key, reason] of Object.entries(ADMIN_SERVED_AT_THE_GATE)) {
      expect(ROUTE_MATRIX[key]?.answers["platform-admin"]).toBe("allowed");
      expect(JSON.stringify(ROUTE_REVIEW[key].branches)).toMatch(/platform admin[^"]*is answered/i);
      expect(reason).toBeTruthy();
    }
  });

  it("covers every route behind authenticateToken or authenticateAdmin, for every caller the gate refuses", () => {
    const gated = Object.entries(ROUTE_MATRIX).filter(([, row]) => row.gate !== "own").map(([key]) => key);
    expect(gated.length).toBeGreaterThan(100);
    for (const key of gated) {
      for (const caller of GATE_REFUSED) expect(REFUSALS).toContainEqual([key, caller, 401]);
    }
  });

  it.each(REFUSALS)("%s refuses %s with %s, and changes nothing", async (key, caller, status) => {
    const { method, path } = addressOf(key);
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    try {

    let pending = request(app)[method](path).set(await headersOf(caller));
    if (["post", "put", "patch"].includes(method)) pending = pending.send(WELL_FORMED_BODY[key] ?? {});
    const res = await pending;

    expect(res.status).toBe(status);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    } finally { effects.restore(); }
  });
});
