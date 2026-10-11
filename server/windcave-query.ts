// R2-T3 (plan v2.2 §9.3; review pass 2): strict reading of a Windcave session query
// and an exact decimal-to-cents parser. It classifies; it decides nothing about
// money. The shared verifier (R2-T5) compares an approved result with the values the
// attempt expected before any state changes.

const MAX_LEDGER_CENTS = 9_999_999_999; // decimal(10,2): 99,999,999.99
const DECIMAL = /^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

export type CentsParse = { ok: true; cents: number } | { ok: false; reason: string };

/**
 * A canonical decimal string to integer cents, by string arithmetic: at most two
 * fraction digits, no sign, exponent, separator, whitespace or leading zero, and
 * within the ledger's decimal(10,2). A JavaScript number is refused outright.
 */
export function parseCentsExact(value: unknown): CentsParse {
  if (typeof value !== "string") return { ok: false, reason: "type" };
  const match = DECIMAL.exec(value);
  if (!match) return { ok: false, reason: "format" };
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_LEDGER_CENTS) return { ok: false, reason: "range" };
  return { ok: true, cents };
}

export interface NormalizedTransaction {
  id: string;
  authorised: boolean;
  type: string;
  amountCents: number;
  currency: string;
  merchantReference: string;
  sessionId?: string;
  /** The provider account the transaction ran under, when the reply names it. */
  username?: string;
}

export type SessionQueryResult =
  | { kind: "approved"; sessionId: string; transactionCount: number; transaction: NormalizedTransaction }
  | { kind: "declined"; sessionId: string; transactionCount: number }
  | { kind: "pending"; sessionId: string }
  | { kind: "ambiguous"; reason: "no_transaction" | "multiple_authorised" | "type" }
  | { kind: "integrity_mismatch"; reason: "session" }
  | { kind: "malformed"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeTransaction(value: unknown): NormalizedTransaction | null {
  if (!isRecord(value)) return null;
  const { id, authorised, type, amount, currency, merchantReference, sessionId, username } = value;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof authorised !== "boolean") return null;
  if (typeof type !== "string" || type.length === 0) return null;
  if (typeof currency !== "string" || !ISO_CURRENCY.test(currency)) return null;
  if (typeof merchantReference !== "string") return null;
  if (sessionId !== undefined && typeof sessionId !== "string") return null;
  if (username !== undefined && typeof username !== "string") return null;
  const cents = parseCentsExact(amount);
  if (!cents.ok) return null;
  return {
    id,
    authorised,
    type,
    amountCents: cents.cents,
    currency,
    merchantReference,
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(username !== undefined ? { username } : {}),
  };
}

export function normalizeSessionQuery(body: unknown, queriedSessionId: string): SessionQueryResult {
  if (!isRecord(body)) return { kind: "malformed", reason: "body" };
  if (typeof body.id !== "string" || body.id.length === 0) return { kind: "malformed", reason: "session_id" };
  if (body.id !== queriedSessionId) return { kind: "integrity_mismatch", reason: "session" };
  if (typeof body.state !== "string" || body.state.length === 0) return { kind: "malformed", reason: "state" };
  // Windcave documents "init" and "complete"; any state that is not complete is not final.
  if (body.state !== "complete") return { kind: "pending", sessionId: body.id };
  if (!Array.isArray(body.transactions)) return { kind: "malformed", reason: "transactions" };

  const transactions: NormalizedTransaction[] = [];
  for (const entry of body.transactions) {
    const normalized = normalizeTransaction(entry);
    if (!normalized) return { kind: "malformed", reason: "transaction" };
    if (normalized.sessionId !== undefined && normalized.sessionId !== queriedSessionId) {
      return { kind: "integrity_mismatch", reason: "session" };
    }
    transactions.push(normalized);
  }

  if (transactions.length === 0) return { kind: "ambiguous", reason: "no_transaction" };
  const authorised = transactions.filter((transaction) => transaction.authorised);
  if (authorised.length > 1) return { kind: "ambiguous", reason: "multiple_authorised" };
  if (authorised.length === 1) {
    if (authorised[0].type !== "purchase") return { kind: "ambiguous", reason: "type" };
    return { kind: "approved", sessionId: body.id, transactionCount: transactions.length, transaction: authorised[0] };
  }
  return { kind: "declined", sessionId: body.id, transactionCount: transactions.length };
}
