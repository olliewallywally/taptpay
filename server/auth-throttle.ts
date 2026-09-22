import crypto from "node:crypto";
import { config } from "./config";

/**
 * R1-T4 phase C — sign-in and account-recovery throttles shared by every app
 * instance (owner decision 2026-09-21, Q5: slow repeated attempts down instead of
 * locking; docs/decisions/2026-09-21-r1-t4-t9-owner-answers.md).
 *
 * A bucket counts attempts against one subject: an email's unknown devices, one
 * known device's attempts at one email (server/sign-in-device.ts), a signed-in
 * login's current-password checks, or an email's password-reset requests. An
 * attempt is counted before the password is checked,
 * so a burst of simultaneous guesses gets no more checks than a patient guesser.
 * The first `free` attempts pass; after that each must wait, the wait doubling from
 * `firstWaitMs` up to `maxWaitMs`. A bucket left alone for `forgetAfterMs` starts
 * again. A correct password clears the bucket it was counted against.
 *
 * Buckets are rows of `auth_throttle` (0028), keyed `<purpose>:<HMAC>` under a key
 * derived from JWT_SECRET: no email or device id is stored. Client addresses are
 * deliberately not a subject yet. Until the app is told how many proxies stand in
 * front of it (phase B), every visitor may arrive from the proxy's address, and an
 * address bucket would let anyone slow everyone down.
 */

export interface AuthThrottlePolicy {
  /** Attempts that never wait. */
  readonly free: number;
  readonly firstWaitMs: number;
  readonly maxWaitMs: number;
  /** A bucket untouched this long starts again. Always longer than maxWaitMs. */
  readonly forgetAfterMs: number;
}

const MINUTE = 60_000;

/** Password sign-in, merchant and admin alike, known device or not. */
export const SIGN_IN_POLICY: AuthThrottlePolicy = Object.freeze({
  free: 5, firstWaitMs: 30_000, maxWaitMs: 15 * MINUTE, forgetAfterMs: 60 * MINUTE,
});

/** Forgot-password requests: every request counts, since each one sends an email. */
export const PASSWORD_RESET_POLICY: AuthThrottlePolicy = Object.freeze({
  free: 3, firstWaitMs: 5 * MINUTE, maxWaitMs: 60 * MINUTE, forgetAfterMs: 24 * 60 * MINUTE,
});

/** Rows untouched this long are deleted: no policy counts them any more. */
export const AUTH_THROTTLE_RECLAIM_AFTER_MS = 24 * 60 * MINUTE;

export interface AuthThrottleBucket {
  readonly key: string;
  readonly policy: AuthThrottlePolicy;
}

/** One `auth_throttle` row. `failures` counts attempts a success has not cleared. */
export interface AuthThrottleRow {
  bucketKey: string;
  failures: number;
  windowStartedAt: Date;
  nextAllowedAt: Date | null;
  updatedAt: Date;
}

export type AuthThrottleTake = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * What happened to an attempt that was let through: "success" (the right password)
 * clears its buckets; "void" (it never reached a verdict, e.g. a storage fault)
 * gives back its count, and any wait that count started.
 */
export type AuthThrottleOutcome = "success" | "void";

/** How long to wait after `failures` counted attempts: nothing within the free allowance. */
export function waitAfter(failures: number, policy: AuthThrottlePolicy): number {
  if (failures < policy.free) return 0;
  const doublings = failures - policy.free;
  if (doublings >= 31) return policy.maxWaitMs;
  return Math.min(policy.firstWaitMs * 2 ** doublings, policy.maxWaitMs);
}

/** Each bucket once, in key order: the order every storage locks rows in. */
export function uniqueAuthThrottleBuckets(buckets: readonly AuthThrottleBucket[]): AuthThrottleBucket[] {
  const byKey = new Map<string, AuthThrottleBucket>();
  for (const bucket of buckets) if (!byKey.has(bucket.key)) byKey.set(bucket.key, bucket);
  return Array.from(byKey.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function freshRow(key: string, now: Date): AuthThrottleRow {
  return { bucketKey: key, failures: 0, windowStartedAt: now, nextAllowedAt: null, updatedAt: now };
}

/** A row as it stands at `now`: one untouched past its policy's forgetAfterMs has started again. */
function asOf(row: AuthThrottleRow | undefined, bucket: AuthThrottleBucket, now: Date): AuthThrottleRow {
  if (row && now.getTime() - row.updatedAt.getTime() < bucket.policy.forgetAfterMs) return row;
  return freshRow(bucket.key, now);
}

/**
 * Decide one attempt against locked rows. If any bucket is still waiting the attempt
 * is refused, with the longest wait, and nothing is counted. Otherwise it is counted
 * against every bucket, and the rows to write back are returned.
 */
export function planAuthThrottleTake(
  buckets: readonly AuthThrottleBucket[],
  rows: readonly AuthThrottleRow[],
  now: Date,
): { allowed: false; retryAfterMs: number } | { allowed: true; charged: AuthThrottleRow[] } {
  const stored = new Map(rows.map((row) => [row.bucketKey, row]));
  const current = uniqueAuthThrottleBuckets(buckets).map((bucket) => ({ bucket, row: asOf(stored.get(bucket.key), bucket, now) }));
  const retryAfterMs = Math.max(0, ...current.map(({ row }) =>
    row.nextAllowedAt ? row.nextAllowedAt.getTime() - now.getTime() : 0));
  if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
  return {
    allowed: true,
    charged: current.map(({ bucket, row }) => {
      const failures = row.failures + 1;
      const wait = waitAfter(failures, bucket.policy);
      return {
        bucketKey: bucket.key,
        failures,
        windowStartedAt: row.windowStartedAt,
        nextAllowedAt: wait > 0 ? new Date(now.getTime() + wait) : null,
        updatedAt: now,
      };
    }),
  };
}

/** A row after the attempt it counted is settled (see AuthThrottleOutcome). */
export function settleAuthThrottleRow(row: AuthThrottleRow, outcome: AuthThrottleOutcome, now: Date): AuthThrottleRow {
  if (outcome === "success") return freshRow(row.bucketKey, now);
  // A waiting bucket admits no one, so a wait running now was started by this
  // attempt's count, or by one let through alongside it; ending it errs, at most
  // one wait's worth, towards the merchant.
  return { ...row, failures: Math.max(0, row.failures - 1), nextAllowedAt: null, updatedAt: now };
}

// ── Bucket keys ──────────────────────────────────────────────────────────────

let bucketKeySecret: Buffer | undefined;
function bucketKeyHmac(label: string, value: string): string {
  bucketKeySecret ??= Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, Buffer.alloc(0), "taptpay auth-throttle v1", 32));
  return crypto.createHmac("sha256", bucketKeySecret).update(`${label}\n${value}`, "utf8").digest("hex");
}

/** Emails are compared as a sign-in compares them: case and surrounding spaces ignored. */
export const normalizeThrottleEmail = (email: string) => email.trim().toLowerCase();

export type SignInRealm = "merchant" | "admin";
const SIGN_IN_PURPOSES = {
  merchant: { account: "signin-account", device: "signin-device" },
  admin: { account: "admin-signin-account", device: "admin-signin-device" },
} as const;

/** The bucket every device not yet known to this email shares. */
export function signInAccountBucket(realm: SignInRealm, email: string): AuthThrottleBucket {
  const purpose = SIGN_IN_PURPOSES[realm].account;
  return { key: `${purpose}:${bucketKeyHmac(purpose, normalizeThrottleEmail(email))}`, policy: SIGN_IN_POLICY };
}

/** The start of every known-device bucket for this email, so a reset can clear them all. */
export function signInDeviceKeyPrefix(realm: SignInRealm, email: string): string {
  const purpose = SIGN_IN_PURPOSES[realm].device;
  return `${purpose}:${bucketKeyHmac(purpose, normalizeThrottleEmail(email))}:`;
}

/** One known device's own bucket for this email. */
export function signInDeviceBucket(realm: SignInRealm, email: string, deviceId: string): AuthThrottleBucket {
  return {
    key: `${signInDeviceKeyPrefix(realm, email)}${bucketKeyHmac("signin-device-id", deviceId)}`,
    policy: SIGN_IN_POLICY,
  };
}

/** A signed-in login's current-password checks, when it changes its password. */
export function passwordChangeBucket(userId: number): AuthThrottleBucket {
  return { key: `password-change:${bucketKeyHmac("password-change", String(userId))}`, policy: SIGN_IN_POLICY };
}

/** Forgot-password requests for this email, whether or not it has a login. */
export function passwordResetBucket(email: string): AuthThrottleBucket {
  return { key: `reset-account:${bucketKeyHmac("reset-account", normalizeThrottleEmail(email))}`, policy: PASSWORD_RESET_POLICY };
}

// ── The refusal ──────────────────────────────────────────────────────────────

/** Whole seconds, never zero: Retry-After and the message agree. */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

export function waitInWords(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? "1 second" : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** The 429 body. The same for every email, with a login or without. */
export function tooManyAttempts(retryAfterMs: number, what: "sign-in" | "password-reset") {
  const seconds = retryAfterSeconds(retryAfterMs);
  const subject = what === "password-reset" ? "Too many password reset requests" : "Too many attempts";
  return {
    retryAfterSeconds: seconds,
    body: { code: "TOO_MANY_ATTEMPTS", message: `${subject}. Please try again in ${waitInWords(seconds)}.`, retryAfterSeconds: seconds },
  };
}
