import type { Transaction } from "@shared/schema";
import { createHmac } from "node:crypto";
import {
  createPaymentCredential,
  hashPaymentToken,
  PAYMENT_TOKEN_PATTERN,
  type PaymentCredential,
} from "./payment-credential";

export type PaymentTokenEndpointFamily = "resolve" | "qr" | "session" | "completion";

export interface PaymentTokenLookup {
  getTransactionByPaymentTokenHash(hash: string): Promise<Transaction | undefined>;
}

/**
 * Resolve the bearer address without exposing whether a malformed token or a
 * well-shaped unknown token was supplied. Routes return the same generic 404
 * for either undefined result.
 */
export async function resolvePaymentToken(
  lookup: PaymentTokenLookup,
  rawToken: string,
): Promise<Transaction | undefined> {
  if (!PAYMENT_TOKEN_PATTERN.test(rawToken)) return undefined;
  return lookup.getTransactionByPaymentTokenHash(hashPaymentToken(rawToken));
}

/**
 * Return states have the same encoding guarantees as payment tokens. When an
 * attempt ID and server secret are supplied the credential is deterministically
 * pseudorandom, letting a crashed worker retry the original processor X-ID and
 * callback state without ever storing bearer plaintext.
 */
export function createPaymentReturnState(
  attemptId?: string,
  serverSecret?: string,
): PaymentCredential {
  if (attemptId === undefined && serverSecret === undefined) {
    return createPaymentCredential();
  }
  if (!attemptId || !serverSecret) {
    throw new Error("attemptId and serverSecret must be supplied together");
  }
  const rawToken = createHmac("sha256", serverSecret)
    .update(`taptpay:return-state:${attemptId}`)
    .digest("base64url");
  return { rawToken, hash: hashPaymentToken(rawToken) };
}

type Counter = { count: number; resetAt: number };

const DEFAULT_LIMITS: Record<PaymentTokenEndpointFamily, number> = {
  resolve: 120,
  qr: 30,
  session: 20,
  completion: 40,
};

/**
 * Small in-process guard used in addition to infrastructure limits. Counters
 * are deliberately independent by endpoint family so status polling cannot
 * exhaust the smaller session/completion budget.
 */
export class PaymentTokenRateLimiter {
  private readonly counters = new Map<string, Counter>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly limits: Record<PaymentTokenEndpointFamily, number> = DEFAULT_LIMITS,
  ) {}

  allow(ip: string, family: PaymentTokenEndpointFamily, now = Date.now()): boolean {
    const key = `${family}:${ip}`;
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return true;
    }
    if (current.count >= this.limits[family]) return false;
    current.count += 1;
    return true;
  }

  clear() {
    this.counters.clear();
  }

  private prune(now: number) {
    if (this.counters.size < 1_000) return;
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
  }
}

export const paymentTokenRateLimiter = new PaymentTokenRateLimiter();
