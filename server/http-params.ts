/** Strict positive base-10 integer parsing for path parameters. */
export function strictPositiveIntegerParam(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Same rules as strictPositiveIntegerParam, for a query string value.
 * Express (qs) turns a repeated key into an array and a bracketed key into
 * an object — both must be rejected outright for a query param that expects
 * one scalar id, not silently coerced to the first entry the way
 * `parseInt(arr)` would be.
 */
export function strictPositiveIntegerQueryParam(raw: unknown): number | null {
  return typeof raw === "string" ? strictPositiveIntegerParam(raw) : null;
}

/**
 * A bounded free-form tuning value from the query string — a QR pixel size, a
 * reporting window, a page limit. Unlike an identifier these legitimately have
 * a default, but R1-T6 requires that the default apply only when the value is
 * ABSENT: present-but-garbage must be refused, not silently replaced.
 *
 * Returns the clamped number, or null meaning "present and invalid" so the
 * caller can answer 400. Arrays, objects and repeated keys are rejected by the
 * scalar parser this builds on.
 */
export function strictBoundedIntegerQueryParam(
  raw: unknown,
  bounds: { fallback: number; min?: number; max: number },
): number | null {
  if (raw === undefined) return bounds.fallback;
  const parsed = strictPositiveIntegerQueryParam(raw);
  if (parsed === null) return null;
  return Math.min(Math.max(parsed, bounds.min ?? 1), bounds.max);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strict RFC-4122-shaped UUID parsing for path parameters (property/trades tables use uuid ids, not serial). */
export function strictUuidParam(raw: unknown): string | null {
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : null;
}
