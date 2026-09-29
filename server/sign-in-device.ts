import crypto from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { config } from "./config";
import {
  normalizeThrottleEmail,
  signInAccountBucket,
  signInDeviceBucket,
  type AuthThrottleBucket,
  type SignInRealm,
} from "./auth-throttle";
import { readCookie } from "./google-sign-in";

/**
 * R1-T4 phase C — a device that has signed in before is slowed down only by its
 * own mistakes (OWASP's "device cookies"). Without this, anyone who knew a
 * merchant's email could keep them waiting: every device not yet known to the
 * email shares one bucket (server/auth-throttle.ts), and an attacker could keep it
 * full.
 *
 * A successful sign-in, or a completed password reset, gives the browser an
 * HttpOnly cookie: a random device id and, for each email it has signed in to, a
 * tag — an HMAC of the device id and the email under a server key. A request that
 * carries a valid tag for the email it is signing in to is counted against that
 * device's own bucket. The mark opens nothing — the password is still required —
 * and holds no email.
 */

export const DEVICE_MARK_MAX_AGE_MS = 180 * 24 * 60 * 60_000;
const MAX_TAGS = 5;
const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/; // 16 random bytes, base64url
const TAG = /^[A-Za-z0-9_-]{22}$/; // 16 bytes of an HMAC-SHA256, base64url

export interface SignInDevice {
  id: string;
  tags: string[];
}

let tagSecret: Buffer | undefined;
function tagFor(realm: SignInRealm, deviceId: string, email: string): string {
  tagSecret ??= Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, Buffer.alloc(0), "taptpay sign-in device v1", 32));
  return crypto.createHmac("sha256", tagSecret)
    .update(`${realm}\n${deviceId}\n${normalizeThrottleEmail(email)}`, "utf8")
    .digest().subarray(0, 16).toString("base64url");
}

/**
 * The mark's name and flags. Admin and merchant sign-in each have their own,
 * sent only to their own sign-in routes; `__Secure-` and Secure on https only.
 */
export function signInDeviceCookie(realm: SignInRealm, publicOrigin: string) {
  const secure = new URL(publicOrigin).protocol === "https:";
  const base = realm === "admin" ? "taptpay-admin-signin-device" : "taptpay-signin-device";
  const options: CookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: realm === "admin" ? "/api/admin/auth" : "/api/auth",
    maxAge: DEVICE_MARK_MAX_AGE_MS,
  };
  return { realm, name: secure ? `__Secure-${base}` : base, options };
}
export type SignInDeviceCookie = ReturnType<typeof signInDeviceCookie>;

/** The device a mark names; null when absent or not in the shape this server writes. */
export function parseSignInDevice(value: string | undefined): SignInDevice | null {
  if (typeof value !== "string" || value.length > 200) return null;
  const [version, id, ...tags] = value.split(".");
  if (version !== "1" || !DEVICE_ID.test(id ?? "")) return null;
  if (tags.length > MAX_TAGS || !tags.every((tag) => TAG.test(tag))) return null;
  return { id, tags };
}

export function readSignInDevice(req: Request, cookie: SignInDeviceCookie): SignInDevice | null {
  return parseSignInDevice(readCookie(req.headers.cookie, cookie.name));
}

/** Whether this device has signed in to this email before, as this server recorded it. */
export function deviceKnowsEmail(device: SignInDevice | null, realm: SignInRealm, email: string): boolean {
  if (!device) return false;
  const expected = Buffer.from(tagFor(realm, device.id, email));
  return device.tags.some((tag) => crypto.timingSafeEqual(Buffer.from(tag), expected));
}

/** The one bucket a sign-in attempt counts against. */
export function signInBucketFor(realm: SignInRealm, email: string, device: SignInDevice | null): AuthThrottleBucket {
  return device && deviceKnowsEmail(device, realm, email)
    ? signInDeviceBucket(realm, email, device.id)
    : signInAccountBucket(realm, email);
}

/** The mark after this email's success: its tag first, the device's others kept. */
export function deviceMarkAfterSuccess(device: SignInDevice | null, realm: SignInRealm, email: string): string {
  const id = device?.id ?? crypto.randomBytes(16).toString("base64url");
  const tag = tagFor(realm, id, email);
  const tags = [tag, ...(device?.tags ?? []).filter((other) => other !== tag)].slice(0, MAX_TAGS);
  return ["1", id, ...tags].join(".");
}

export function markSignInDevice(
  res: Response, cookie: SignInDeviceCookie, device: SignInDevice | null, email: string,
): void {
  res.cookie(cookie.name, deviceMarkAfterSuccess(device, cookie.realm, email), cookie.options);
}
