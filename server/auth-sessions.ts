import crypto from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import type { AuthSession } from "@shared/schema";
import { config } from "./config";
import { readCookie, sha256Hex } from "./google-sign-in";
import { getBaseUrl } from "./url-utils";

/**
 * R1-T4 phase E — a sign-in is a session the server keeps (owner decisions 2026-09-29 and 2026-09-30,
 * docs/PLAN-2026-09-29-r1-t4-phase-e-sessions.md).
 *
 * The browser holds `<id>.<secret>` in an HttpOnly `__Host-` cookie that no script on the page can
 * read. The server keeps only SHA-256 digests of secrets (auth_sessions, 0031). Each use moves the idle
 * expiry forward (written at most once a minute); nothing extends the absolute one. Once a day a
 * response offers a new secret; it becomes current when the browser first presents it, and the one it
 * replaces is accepted for 60 seconds more (requests in flight). A replaced secret presented after that
 * means someone else holds a copy: the whole session ends and it is logged. A change (POST, PUT, PATCH,
 * DELETE) on a cookie session needs the page's CSRF token, an HMAC of the session id that the start-up
 * check hands to the page and that the page keeps in memory only.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Owner decision 2026-09-29, Q1: a business sign-in ends after a day unused, and a week after it began. */
export const BUSINESS_SESSION_IDLE_MS = DAY;
export const BUSINESS_SESSION_MAX_MS = 7 * DAY;
/** Owner decision 2026-09-29, Q2: the admin area, which sees every business, 30 minutes and 12 hours. */
export const ADMIN_SESSION_IDLE_MS = 30 * MINUTE;
export const ADMIN_SESSION_MAX_MS = 12 * HOUR;
export const SESSION_ROTATE_AFTER_MS = DAY;
/** How long a replaced secret is still accepted after the new one's first use. */
export const SESSION_REPLACED_GRACE_MS = MINUTE;
/** An offer not taken up in this long is taken to be lost, and a fresh one is made. */
export const SESSION_REOFFER_AFTER_MS = MINUTE;
export const SESSION_TOUCH_EVERY_MS = MINUTE;
/** Rows are reclaimed this long after their absolute expiry (a session lasts a week at most). */
export const SESSION_RECLAIM_AFTER_MS = 30 * DAY;

export const CSRF_HEADER = "x-csrf-token";

export type SessionRealm = "business" | "admin";

export const SESSION_LIMITS: Record<SessionRealm, { idleMs: number; maxMs: number }> = {
  business: { idleMs: BUSINESS_SESSION_IDLE_MS, maxMs: BUSINESS_SESSION_MAX_MS },
  admin: { idleMs: ADMIN_SESSION_IDLE_MS, maxMs: ADMIN_SESSION_MAX_MS },
};

/** Why a session ended, as recorded on its row and in the security log. */
export type SessionEndReason =
  | "logout"
  | "sign_out_everywhere"
  | "password_reset"
  | "password_change"
  | "login_disabled"
  | "login_removed"
  | "reuse_detected";

const SESSION_ID = /^[A-Za-z0-9_-]{22}$/; // 16 random bytes, base64url
const SESSION_SECRET = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const CSRF_TOKEN = /^[A-Za-z0-9_-]{43}$/; // an HMAC-SHA256, base64url

/**
 * The cookie's name and flags for the public origin: `__Host-` (Secure, Path=/, no Domain, so no
 * subdomain can plant or shadow it) and Secure on https only, as the sign-in cookies are. SameSite=Lax:
 * the browser sends it when the person follows a link to the site, never with another site's
 * background request or form post.
 */
export function sessionCookie(realm: SessionRealm, publicOrigin: string = getBaseUrl()) {
  const secure = new URL(publicOrigin).protocol === "https:";
  const base = realm === "admin" ? "taptpay-admin-session" : "taptpay-session";
  const options: CookieOptions = { httpOnly: true, secure, sameSite: "lax", path: "/" };
  return { name: secure ? `__Host-${base}` : base, options };
}

export function setSessionCookie(res: Response, realm: SessionRealm, id: string, secret: string, maxAgeMs: number): void {
  const cookie = sessionCookie(realm);
  res.cookie(cookie.name, `${id}.${secret}`, { ...cookie.options, maxAge: Math.max(0, Math.floor(maxAgeMs)) });
}

export function clearSessionCookie(res: Response, realm: SessionRealm): void {
  const cookie = sessionCookie(realm);
  res.clearCookie(cookie.name, cookie.options);
}

/** The raw cookie value when the request carries this realm's cookie at all. */
export function readSessionCookie(req: Request, realm: SessionRealm): string | undefined {
  return readCookie(req.headers.cookie, sessionCookie(realm).name);
}

/** The id and secret of a cookie value in the shape this server writes; null for anything else. */
export function parseSessionCookie(value: string | undefined): { id: string; secret: string } | null {
  if (typeof value !== "string" || value.length !== 66) return null;
  const [id, secret, extra] = value.split(".");
  if (extra !== undefined || !SESSION_ID.test(id ?? "") || !SESSION_SECRET.test(secret ?? "")) return null;
  return { id, secret };
}

export const newSessionId = () => crypto.randomBytes(16).toString("base64url");
export const newSessionSecret = () => crypto.randomBytes(32).toString("base64url");

function sameDigest(a: string, b: string | null | undefined): boolean {
  if (typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Which of the session's secrets was presented. `late` is the replaced secret after its 60 seconds:
 * the sign of a copy in someone else's hands.
 */
export type PresentedSecret = "current" | "offered" | "previous" | "late";

export function presentedSecret(session: AuthSession, secret: string, now: Date): PresentedSecret | null {
  const digest = sha256Hex(secret);
  if (sameDigest(digest, session.secretHash)) return "current";
  if (sameDigest(digest, session.offeredSecretHash)) return "offered";
  if (sameDigest(digest, session.previousSecretHash)) {
    const until = session.previousValidUntil?.getTime() ?? 0;
    return now.getTime() < until ? "previous" : "late";
  }
  return null;
}

/** Whether a session has been ended or has run out, at `now`. */
export function sessionEnded(session: AuthSession, now: Date): boolean {
  return session.revokedAt !== null
    || now.getTime() >= session.idleExpiresAt.getTime()
    || now.getTime() >= session.absoluteExpiresAt.getTime();
}

let csrfKey: Buffer | undefined;
/** The page's CSRF token for a session: bound to the session and to the site's origin. */
export function csrfTokenFor(sessionId: string, origin: string): string {
  csrfKey ??= Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, Buffer.alloc(0), "taptpay csrf v1", 32));
  return crypto.createHmac("sha256", csrfKey).update(`${origin}\n${sessionId}`, "utf8").digest("base64url");
}

export function csrfTokenMatches(presented: unknown, sessionId: string, origin: string): boolean {
  if (typeof presented !== "string" || !CSRF_TOKEN.test(presented)) return false;
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(csrfTokenFor(sessionId, origin)));
}

let adminTagKey: Buffer | undefined;
/**
 * A tag of the admin's configured credentials, kept on each admin session: a change of the admin's
 * email or password hash ends every admin session. Null when the admin is not configured.
 */
export function adminCredentialTag(): string | null {
  const email = config.admin.email;
  const passwordHash = config.admin.passwordHash;
  if (!email || !passwordHash) return null;
  adminTagKey ??= Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, Buffer.alloc(0), "taptpay admin session v1", 32));
  return crypto.createHmac("sha256", adminTagKey)
    .update(`${email.trim().toLowerCase()}\n${passwordHash}`, "utf8")
    .digest("base64url");
}

export function adminTagMatches(tag: string | null): boolean {
  const current = adminCredentialTag();
  return current !== null && sameDigest(current, tag);
}

/** A short browser-and-platform name for the device list, from the user agent; never an address. */
export function deviceLabel(userAgent: unknown): string | null {
  if (typeof userAgent !== "string" || userAgent.length === 0) return null;
  const ua = userAgent.slice(0, 512);
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const platform = /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (!browser && !platform) return null;
  return platform ? `${browser ?? "Browser"} on ${platform}` : browser;
}

/** What a started session gives the route: its id, and the page's CSRF token. */
export interface StartedSession {
  id: string;
  csrfToken: string;
}

/**
 * Starts a session and sets its cookie. A business session records the login's current session
 * version; an admin session the admin's credential tag.
 */
export async function startSession(
  req: Request,
  res: Response,
  start: { realm: "business"; userId: number; sessionVersion: number } | { realm: "admin" },
  now: Date = new Date(),
): Promise<StartedSession> {
  const { storage } = await import("./storage");
  const limits = SESSION_LIMITS[start.realm];
  const id = newSessionId();
  const secret = newSessionSecret();
  const adminTag = start.realm === "admin" ? adminCredentialTag() : null;
  if (start.realm === "admin" && !adminTag) throw new Error("Cannot start an admin session: the admin is not configured");
  await storage.createAuthSession({
    id,
    principal: start.realm,
    userId: start.realm === "business" ? start.userId : null,
    sessionVersion: start.realm === "business" ? start.sessionVersion : null,
    adminTag,
    secretHash: sha256Hex(secret),
    deviceLabel: deviceLabel(req.headers["user-agent"]),
    createdAt: now,
    lastUsedAt: now,
    rotatedAt: now,
    idleExpiresAt: new Date(now.getTime() + limits.idleMs),
    absoluteExpiresAt: new Date(now.getTime() + limits.maxMs),
  }, now);
  setSessionCookie(res, start.realm, id, secret, limits.maxMs);
  return { id, csrfToken: csrfTokenFor(id, getBaseUrl(req)) };
}

/**
 * After a request on a session has been let through: take up an offered secret, offer a new one when
 * the daily swap is due, and record the use at most once a minute. A fault here is logged and never
 * fails the request: the session was valid, and each step is retried by the next request.
 */
export async function settleSession(
  res: Response,
  realm: SessionRealm,
  session: AuthSession,
  presented: Exclude<PresentedSecret, "late">,
  now: Date,
): Promise<void> {
  const { storage } = await import("./storage");
  const limits = SESSION_LIMITS[realm];
  try {
    if (presented === "offered" && session.offeredSecretHash) {
      await storage.promoteAuthSessionSecret(session.id, {
        offeredSecretHash: session.offeredSecretHash,
        now,
        previousValidUntil: new Date(now.getTime() + SESSION_REPLACED_GRACE_MS),
      });
    } else if (presented === "current" && now.getTime() - session.rotatedAt.getTime() >= SESSION_ROTATE_AFTER_MS) {
      const offeredAt = session.offeredAt?.getTime();
      if (offeredAt === undefined || now.getTime() - offeredAt >= SESSION_REOFFER_AFTER_MS) {
        const secret = newSessionSecret();
        const offered = await storage.offerAuthSessionSecret(session.id, {
          secretHash: sha256Hex(secret),
          now,
          rotateBefore: new Date(now.getTime() - SESSION_ROTATE_AFTER_MS),
          reofferBefore: new Date(now.getTime() - SESSION_REOFFER_AFTER_MS),
        });
        if (offered) {
          setSessionCookie(res, realm, session.id, secret, session.absoluteExpiresAt.getTime() - now.getTime());
        }
      }
    }
    if (now.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_EVERY_MS) {
      const idle = Math.min(now.getTime() + limits.idleMs, session.absoluteExpiresAt.getTime());
      await storage.touchAuthSession(session.id, now, new Date(idle));
    }
  } catch (error) {
    console.error("[AUTH_SESSION_SETTLE]", error);
  }
}
