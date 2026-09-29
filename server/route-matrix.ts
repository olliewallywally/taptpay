/**
 * R1-T3 (plan C10) — the role and tenant matrix: for every route, what each kind of caller gets.
 *
 * Derived, not hand-written: a route's review (server/route-review.ts) says which principals each
 * branch serves, the roles, whether the platform admin is admitted and where the tenant comes from;
 * its facts (server/route-policy.ts) say which gate it sits behind. From those this module gives,
 * per caller, either "allowed" (the request is served when it is otherwise valid) or the P2.2
 * status the caller is refused with:
 *
 *   401  authentication missing, invalid, expired or disabled
 *   403  an authenticated principal without the role or the tenant
 *   404  another business's record, answered like a missing one (tenant-safe)
 *
 * Every row is driven at runtime: the two sign-in gates' refusals (route-matrix.test.ts), the own gates'
 * (route-matrix-own-gates.test.ts), a teammate's and another business's (route-matrix-roles and
 * -records), and every caller a route serves, family by family (route-matrix-served-*.test.ts). A route
 * behind a sign-in gate serves the business's logins its review admits; a route with its own gate
 * serves the callers its review's branches name (anyone, a link's holder, the provider, the scheduler,
 * an API key).
 */
import { expandFacts, type RecordedRouteFacts } from "./route-facts";
import { ROUTE_POLICY } from "./route-policy";
import { ROUTE_REVIEW } from "./route-review";

/** The callers the matrix answers for, and what each is (the inventory table lists them). */
export const MATRIX_CALLER_MEANING = {
  "signed-out": "no credential at all; on a public route, anyone",
  "invalid-token": "a token that does not verify (malformed, forged or expired)",
  "disabled-login": "a teammate whose login the owner disabled, holding a token minted before",
  "suspended-business": "the owner of a business that is no longer verified or active",
  owner: "the business's owner",
  member: "a teammate of the business",
  "other-owner": "the owner of another business",
  "platform-admin": "the validated platform admin (no business of its own)",
  "link-as-sign-in": "a payment link's token presented as a sign-in (Authorization: Bearer)",
  "no-secret": "the scheduler's routes without x-cron-secret",
  "wrong-secret": "the scheduler's routes with a secret that is not the scheduler's",
  "no-key": "the ecommerce API without a key",
  "unknown-key": "the ecommerce API with a key nobody was issued",
  "key-without-permission": "the ecommerce API with a live key that lacks the route's permission",
  "unknown-link": "a link route asked with a token, state or code that is no one's",
  "sale-with-its-own-link": "a numbered route asked for a sale that has its own payment link",
  "wrong-webhook-key": "the WhatsApp webhook with a key that is not the provider's",
  "link-holder": "the holder of the route's own link: its token, return state, handoff code or invite",
  provider: "the payment or messaging provider's servers, naming their own reference",
  scheduler: "the scheduler, with its secret",
  "api-key": "the ecommerce API with a live key that has the route's permission",
} as const;

/** The callers the matrix answers for. */
export type MatrixCaller = keyof typeof MATRIX_CALLER_MEANING;

/**
 * A refusal's status. A few are answered 200 by design (the WhatsApp webhook acknowledges every call
 * at once; the reset-link check answers { valid: false }), or 302 (a browser's return is sent home).
 */
export type MatrixAnswer = "allowed" | 200 | 302 | 400 | 401 | 403 | 404;

/** Which gate a route sits behind, from its middleware. */
export type MatrixGate = "session" | "admin" | "own";

export interface MatrixRow {
  gate: MatrixGate;
  /** Only the callers this part of R1-T3 has settled; the rest are filled in by family. */
  answers: Partial<Record<MatrixCaller, MatrixAnswer>>;
}

/**
 * Routes whose review serves the platform admin through authenticateToken alone, with no admitting
 * check the review rules could see; each review says so in words.
 */
export const ADMIN_SERVED_AT_THE_GATE: Record<string, string> = {
  "GET /api/auth/me": "the session read answers the platform admin too, with no business (its review, batch 5)",
};

/**
 * Record routes whose business is named in the path and compared before any read: another business
 * gets 403 whatever the record (its answer says nothing about which records exist).
 */
export const RECORD_ROUTES_NAMING_THE_BUSINESS: Record<string, string> = {
  "GET /api/merchants/:merchantId/refunds": "the business in the path is compared with the session's before anything is read",
};

/**
 * Callers every gated route refuses before any route-specific work. A payment link's token is never a
 * sign-in (the plan's safe default: a public checkout token never grants merchant API access).
 */
export const GATE_REFUSED: readonly MatrixCaller[] = ["signed-out", "invalid-token", "disabled-login", "suspended-business", "link-as-sign-in"];

/**
 * A link route's answer to a token, state or code that is no one's, where it is not 404: each is the
 * route's reviewed answer. The sign-in handoff and the pages that read a token from the body answer as
 * their screens expect; the checkout's browser return goes home.
 */
export const UNKNOWN_LINK_ANSWER: Record<string, MatrixAnswer> = {
  "POST /api/auth/google/session": 401,
  "POST /api/auth/reset-password": 400,
  "GET /api/auth/validate-reset-token/:token": 200,
  "POST /api/auth/confirm-email": 400,
  "POST /api/team/accept-invite": 400,
  "GET /api/checkout/callback": 302,
};

function gateOf(recorded: RecordedRouteFacts): MatrixGate {
  const facts = expandFacts(recorded);
  if (facts.middleware.includes("authenticateAdmin")) return "admin";
  if (facts.middleware.includes("authenticateToken")) return "session";
  return "own";
}

/**
 * A route's row, from its review and its recorded facts (the generator passes the facts it has just read,
 * before route-policy.ts is rewritten with them).
 */
export function matrixRowFor(key: string, recorded: RecordedRouteFacts = ROUTE_POLICY[key].facts): MatrixRow {
  const gate = gateOf(recorded);
  const answers: MatrixRow["answers"] = {};
  if (gate === "own") {
    // The routes with their own gates, by what their review says selects the caller.
    const branches = ROUTE_REVIEW[key].branches;
    const principals = new Set(branches.map((branch) => branch.principal));
    const tenants = new Set(branches.map((branch) => branch.tenant));
    // Who it serves: each branch's principal.
    if (principals.has("public")) answers["signed-out"] = "allowed";
    if (principals.has("public-bearer")) answers["link-holder"] = "allowed";
    if (principals.has("provider")) answers.provider = "allowed";
    if (principals.has("cron")) answers.scheduler = "allowed";
    if (principals.has("api-key")) answers["api-key"] = "allowed";
    // A business reading its own board routes signed in (its open sale, its live updates): with an
    // Authorization header the handler runs the sign-in gate and the business check itself.
    const signedIn = branches.find((branch) => branch.principal === "merchant");
    if (signedIn) {
      for (const caller of GATE_REFUSED) if (caller !== "signed-out") answers[caller] = 401;
      answers.owner = "allowed";
      answers.member = signedIn.roles?.includes("member") ? "allowed" : 403;
      answers["platform-admin"] = signedIn.platformAdmin ? "allowed" : 403;
      if (signedIn.tenant === "path-merchant") answers["other-owner"] = 403;
    }
    if (principals.has("cron")) {
      answers["no-secret"] = 401;
      answers["wrong-secret"] = 401;
    }
    if (principals.has("api-key")) {
      answers["no-key"] = 401;
      answers["unknown-key"] = 401;
      answers["key-without-permission"] = 403;
    }
    if (principals.has("public-bearer") && tenants.has("token")) answers["unknown-link"] = UNKNOWN_LINK_ANSWER[key] ?? 404;
    // A sale with its own link is answered like a missing one (tenant-safe, P2.2): 404, or for the
    // Windcave browser return, which sends a missing sale home, the same redirect.
    if (tenants.has("number")) answers["sale-with-its-own-link"] = key === "GET /api/windcave/callback" ? 302 : 404;
    if (key === "POST /api/webhooks/whatsapp") answers["wrong-webhook-key"] = 200;
    return { gate, answers };
  }
  for (const caller of GATE_REFUSED) answers[caller] = 401;
  if (gate === "admin") {
    // authenticateAdmin: signed in, but not the validated platform admin.
    answers.owner = 403;
    answers.member = 403;
    answers["platform-admin"] = "allowed";
    return { gate, answers };
  }
  // Behind authenticateToken: the platform admin passes the gate with no business of its own, so a
  // route that does not admit it (per its review) must refuse it as a principal without the tenant.
  const review = ROUTE_REVIEW[key];
  // The business's own logins: the owner is served; a teammate is refused (403) on an owner-only route;
  // another business's owner is refused (403) where the request names the business (in its path or
  // body). The routes that act on the session's own business, or address one record, follow by family.
  const merchantBranch = review.branches.find((branch) => branch.principal === "merchant");
  if (merchantBranch) {
    answers.owner = "allowed";
    answers.member = merchantBranch.roles?.includes("member") ? "allowed" : 403;
    if (merchantBranch.tenant === "path-merchant") answers["other-owner"] = 403;
    // One record, read by id: another business's is answered as a missing one is (404, P2.2's
    // tenant-safe answer), unless the business is compared from the path before anything is read.
    if (merchantBranch.tenant === "resource") answers["other-owner"] = key in RECORD_ROUTES_NAMING_THE_BUSINESS ? 403 : 404;
  }
  const admitsAdmin =
    key in ADMIN_SERVED_AT_THE_GATE ||
    review.branches.some((branch) => branch.principal === "platform-admin" || branch.platformAdmin === true);
  answers["platform-admin"] = admitsAdmin ? "allowed" : 403;
  return { gate, answers };
}

// Only reviewed routes have a row: the generator loads this module before it rewrites route-policy.ts,
// so a route just removed (its review with it) must not stop it. route-matrix.test.ts holds every route
// of the policy to a row, as the review tests hold it to a review.
export const ROUTE_MATRIX: Record<string, MatrixRow> = Object.fromEntries(
  Object.keys(ROUTE_POLICY).filter((key) => key in ROUTE_REVIEW).map((key) => [key, matrixRowFor(key)]),
);

/**
 * A row in words, for the inventory table: the callers served, then each refusal's status with the
 * callers refused with it (callers in MATRIX_CALLER_MEANING's order).
 */
export function describeMatrixRow(row: MatrixRow): { served: string; refused: string } {
  const callers = (Object.keys(MATRIX_CALLER_MEANING) as MatrixCaller[]).filter((caller) => row.answers[caller] !== undefined);
  const named = (answer: MatrixAnswer) => callers.filter((caller) => row.answers[caller] === answer).map((caller) => `\`${caller}\``).join(", ");
  const statuses = [...new Set(callers.map((caller) => row.answers[caller]))]
    .filter((answer): answer is Exclude<MatrixAnswer, "allowed"> => typeof answer === "number")
    .sort((a, b) => a - b);
  return {
    served: named("allowed") || "—",
    refused: statuses.map((status) => `${status}: ${named(status)}`).join("; ") || "—",
  };
}
