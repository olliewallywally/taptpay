/**
 * R1-T6 — strict numeric path/query parsing.
 *
 * Replaces bare `parseInt(req.params.x)` / `parseInt(req.query.x)`, which
 * accept "1abc" (parseInt stops at the first non-digit and returns 1),
 * leading/trailing whitespace, "+1", "1.5" (truncated), exponent notation
 * ("1e3"), and silently return NaN for "" or undefined rather than a
 * distinguishable 400. `parseInt` on an array (Express's query parser
 * produces one for a repeated key) also stringifies the array first,
 * silently parsing whatever number happens to lead it off.
 *
 * A dedicated UUID param exists separately (server/route-inventory.ts's
 * generator can find which tables actually use uuid ids — do not swap a
 * uuid-keyed route's :id onto this parser).
 */

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A single path param value. Rejects everything parseInt silently accepted:
 * non-digit suffixes, signs, decimals, exponents, whitespace, empty/missing.
 */
export function parsePositiveIntParam(value: string | undefined | null): number | null {
  if (typeof value !== "string" || !POSITIVE_INTEGER.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * A single query param value. Express (qs) turns a repeated key into an
 * array and a bracketed key into an object — both must be rejected outright
 * for an endpoint that expects one scalar id, not silently coerced to the
 * first entry the way `parseInt(arr)` would.
 */
export function parsePositiveIntQuery(value: unknown): number | null {
  if (typeof value !== "string") return null;
  return parsePositiveIntParam(value);
}

export function isValidUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID.test(value);
}

export const INVALID_ID_RESPONSE = Object.freeze({ message: "Invalid id" });
