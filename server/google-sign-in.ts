import crypto from "node:crypto";
import type { CookieOptions, Response } from "express";

/**
 * R1-T4 phase A — the pieces of Google sign-in that must not live in an address
 * (owner decision 2026-09-21, docs/decisions/2026-09-21-r1-t4-t9-owner-answers.md).
 *
 * - Starting sign-in sets one HttpOnly cookie holding a one-time `state` and the
 *   PKCE verifier. Google echoes the state back; the callback accepts only a state
 *   equal to this browser's cookie (no login CSRF) and proves the code with the
 *   verifier (an intercepted code is useless).
 * - The callback never hands the browser an account token. It stores the SHA-256
 *   of a random one-time code and sets the code in a second HttpOnly cookie; the
 *   login page redeems it once, by POST, and receives the token in the response
 *   body — never in a URL, so never in history, access logs or analytics.
 *
 * Cookies use the `__Host-` prefix (Secure, Path=/, no Domain: a subdomain cannot
 * plant or shadow them) whenever the public origin is https.
 */

export const OAUTH_STATE_TTL_MS = 10 * 60_000;
export const HANDOFF_CODE_TTL_MS = 60_000;

const RANDOM_TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

const randomToken = () => crypto.randomBytes(32).toString("base64url");
export const sha256Hex = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

/** Cookie names and flags for the public origin: `__Host-` + Secure on https only. */
export function signInCookies(publicOrigin: string) {
  const secure = new URL(publicOrigin).protocol === "https:";
  const name = (base: string) => (secure ? `__Host-${base}` : base);
  const options = (sameSite: "lax" | "strict", maxAge: number): CookieOptions =>
    ({ httpOnly: true, secure, sameSite, path: "/", maxAge });
  return {
    /** Sent with Google's cross-site redirect back, so SameSite=Lax. */
    oauth: { name: name("taptpay-google-oauth"), options: options("lax", OAUTH_STATE_TTL_MS) },
    /** Read only by the same-origin POST that redeems it, so SameSite=Strict. */
    handoff: { name: name("taptpay-google-handoff"), options: options("strict", HANDOFF_CODE_TTL_MS) },
  };
}

export function clearSignInCookie(res: Response, cookie: { name: string; options: CookieOptions }): void {
  const { maxAge: _maxAge, ...rest } = cookie.options;
  res.clearCookie(cookie.name, rest);
}

/** One cookie's value from a Cookie header; undefined when absent or malformed. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** A fresh state and PKCE pair, and the cookie value binding them to this browser. */
export function startGoogleSignIn(): { state: string; codeChallenge: string; cookieValue: string } {
  const state = randomToken();
  const verifier = randomToken();
  const codeChallenge = crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { state, codeChallenge, cookieValue: `${state}.${verifier}` };
}

/**
 * The PKCE verifier when the returned `state` is this browser's own, else null.
 * Compared in constant time; a malformed cookie or state is simply refused.
 */
export function verifyGoogleSignInState(cookieValue: string | undefined, returnedState: unknown): string | null {
  if (typeof cookieValue !== "string" || typeof returnedState !== "string") return null;
  const [state, verifier, extra] = cookieValue.split(".");
  if (extra !== undefined || !RANDOM_TOKEN.test(state ?? "") || !RANDOM_TOKEN.test(verifier ?? "")) return null;
  if (!RANDOM_TOKEN.test(returnedState)) return null;
  const same = crypto.timingSafeEqual(Buffer.from(state), Buffer.from(returnedState));
  return same ? verifier : null;
}

/** A one-time code for the browser and the hash stored in its place. */
export function newHandoffCode(): { code: string; codeHash: string } {
  const code = randomToken();
  return { code, codeHash: sha256Hex(code) };
}

/** The stored hash for a presented code, or null when it is not a code this server could have issued. */
export function handoffCodeHash(code: string | undefined): string | null {
  return typeof code === "string" && RANDOM_TOKEN.test(code) ? sha256Hex(code) : null;
}

/** Google's answer on whether it verified the address (userinfo v2, or OIDC's spelling). */
export function googleVerifiedEmail(profile: { verified_email?: unknown; email_verified?: unknown }): boolean {
  return profile.verified_email === true || profile.email_verified === true;
}
