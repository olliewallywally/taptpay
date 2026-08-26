import { createHash, randomBytes } from "node:crypto";

export const PAYMENT_TOKEN_BYTES = 32;
export const PAYMENT_TOKEN_LENGTH = 43;
export const PAYMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PAYMENT_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface PaymentCredential {
  rawToken: string;
  hash: string;
}

/**
 * Produce the digest used for persistence and lookup. Shape validation belongs
 * to the token resolver so malformed and unknown public credentials can share
 * one generic not-found response.
 */
export function hashBearerCredential(rawCredential: string): string {
  return createHash("sha256").update(rawCredential, "utf8").digest("hex");
}

export const hashPaymentToken = hashBearerCredential;

/**
 * Mint one per-payment bearer credential. Only the SHA-256 digest is persisted;
 * the raw token exists solely in the authenticated create response.
 *
 * Database uniqueness is the final collision arbiter. Retrying a 23505 insert
 * belongs to the create service so the lookup and insert cannot become a racy
 * check-then-write inside this pure helper.
 */
export function createPaymentCredential(): PaymentCredential {
  const rawToken = randomBytes(PAYMENT_TOKEN_BYTES).toString("base64url");
  return {
    rawToken,
    hash: hashBearerCredential(rawToken),
  };
}
