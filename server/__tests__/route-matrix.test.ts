import "./support/test-env";
// Push subscription checks its keys (503) before the caller, as P2.2 orders a capability before the
// role or tenant: with keys set, the caller's answer is the one observed.
import "./support/push-test-env";

import request from "supertest";
import { expandFacts } from "../route-facts";
import { ADMIN_SERVED_AT_THE_GATE, GATE_REFUSED, ROUTE_MATRIX, type MatrixCaller } from "../route-matrix";
import { ROUTE_POLICY } from "../route-policy";
import { ROUTE_REVIEW } from "../route-review";
import {
  bearer,
  createAdminPrincipal,
  createDisabledMemberPrincipal,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  mintPaymentCredential,
  resetTestStorage,
  storage,
  storageSnapshot,
} from "./support/http-harness";

/**
 * R1-T3 (plan C10): every API row's refusals, driven at runtime. P2.2: a caller whose authentication
 * is missing, invalid, expired or disabled gets 401; an authenticated principal without the role or
 * the tenant gets 403. Each refusal must change nothing (the storage snapshot is compared).
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
 * platform admin, and the owner and a teammate on the admin routes. A teammate's or another business's
 * refusal at a route's own role or tenant check is driven with real requests (route-matrix-roles).
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
  it("serves at least one caller on every route", () => {
    const forNobody = Object.entries(ROUTE_MATRIX)
      .filter(([, row]) => !Object.values(row.answers).includes("allowed"))
      .map(([key]) => key);
    expect(forNobody).toEqual([]);
  });
});

describe("R1-T3 — every signed-in route's gate refusals (P2.2), with nothing changed", () => {
  let app: any;
  const tokens = {} as Record<MatrixCaller, string>;

  beforeAll(async () => {
    resetTestStorage();
    ({ app } = await createTestApp());
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const disabled = await createDisabledMemberPrincipal(owner.merchantId);
    // A business suspended after its owner signed in (createOwnerPrincipal takes no status).
    const suspended = await createOwnerPrincipal();
    await storage.updateMerchant(suspended.merchantId, { status: "suspended" } as any);
    tokens.owner = owner.token;
    tokens.member = member.token;
    tokens["disabled-login"] = disabled.token;
    tokens["suspended-business"] = suspended.token;
    tokens["invalid-token"] = "not-a-real-token";
    // A live payment link's token: it opens its one sale, and is never a sign-in.
    const link = mintPaymentCredential();
    await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Linked sale", price: "5.50", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false, paymentTokenHash: link.tokenHash,
    } as any);
    tokens["link-as-sign-in"] = link.rawToken;
    tokens["platform-admin"] = createAdminPrincipal().token;
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

    let pending = request(app)[method](path);
    if (caller !== "signed-out") pending = pending.set(bearer({ token: tokens[caller] }));
    if (["post", "put", "patch"].includes(method)) pending = pending.send(WELL_FORMED_BODY[key] ?? {});
    const res = await pending;

    expect(res.status).toBe(status);
    expect(storageSnapshot()).toBe(before);
  });
});
