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
 * route-matrix.test.ts drives every row at runtime. This first part covers the two sign-in gates
 * (authenticateToken, authenticateAdmin), whose refusals come before any route-specific work; the
 * callers served by a route (and another business's owner) follow family by family, as the reviews
 * did.
 */
import { expandFacts } from "./route-facts";
import { ROUTE_POLICY } from "./route-policy";
import { ROUTE_REVIEW } from "./route-review";

/** The callers the matrix answers for. */
export type MatrixCaller =
  | "signed-out" // no credential at all
  | "invalid-token" // a token that does not verify (malformed, forged or expired)
  | "disabled-login" // a teammate whose login the owner disabled, holding a token minted before
  | "suspended-business" // the owner of a business that is no longer verified or active
  | "owner" // the business's owner
  | "member" // a teammate of the business
  | "platform-admin"; // the validated platform admin (no business of its own)

export type MatrixAnswer = "allowed" | 401 | 403 | 404;

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

/** Callers every gated route refuses before any route-specific work. */
export const GATE_REFUSED: readonly MatrixCaller[] = ["signed-out", "invalid-token", "disabled-login", "suspended-business"];

function gateOf(key: string): MatrixGate {
  const facts = expandFacts(ROUTE_POLICY[key].facts);
  if (facts.middleware.includes("authenticateAdmin")) return "admin";
  if (facts.middleware.includes("authenticateToken")) return "session";
  return "own";
}

export function matrixRowFor(key: string): MatrixRow {
  const gate = gateOf(key);
  const answers: MatrixRow["answers"] = {};
  if (gate === "own") return { gate, answers };
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
  const admitsAdmin =
    key in ADMIN_SERVED_AT_THE_GATE ||
    review.branches.some((branch) => branch.principal === "platform-admin" || branch.platformAdmin === true);
  answers["platform-admin"] = admitsAdmin ? "allowed" : 403;
  return { gate, answers };
}

export const ROUTE_MATRIX: Record<string, MatrixRow> = Object.fromEntries(
  Object.keys(ROUTE_POLICY).map((key) => [key, matrixRowFor(key)]),
);
