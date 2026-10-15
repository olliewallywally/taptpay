/**
 * A live session's row and the cookie that presents it, for the unit tests that drive server/auth.ts
 * against a mocked storage (no app, no MemStorage): the row is what `storage.getAuthSession` answers.
 * Built with the server's own helpers, so the cookie's name, the digest and the limits are the server's.
 *
 * Import after the test file has set its environment: this loads server/config.ts.
 */
import type { AuthSession } from "@shared/schema";
import {
  SESSION_LIMITS, adminCredentialTag, newSessionId, newSessionSecret, sessionCookie, type SessionRealm,
} from "../../auth-sessions";
import { sha256Hex } from "../../google-sign-in";

export interface LiveSession {
  row: AuthSession;
  /** The request's Cookie header: this session under `as`'s cookie name (its own realm's by default). */
  cookie: string;
}

export function liveSession(
  who: { realm: "business"; userId: number; sessionVersion?: number } | { realm: "admin" },
  options: { as?: SessionRealm; now?: Date } = {},
): LiveSession {
  const now = options.now ?? new Date();
  const limits = SESSION_LIMITS[who.realm];
  const id = newSessionId();
  const secret = newSessionSecret();
  const row: AuthSession = {
    id,
    principal: who.realm,
    userId: who.realm === "business" ? who.userId : null,
    sessionVersion: who.realm === "business" ? who.sessionVersion ?? 0 : null,
    adminTag: who.realm === "admin" ? adminCredentialTag() : null,
    secretHash: sha256Hex(secret),
    offeredSecretHash: null,
    offeredAt: null,
    previousSecretHash: null,
    previousValidUntil: null,
    deviceLabel: null,
    createdAt: now,
    lastUsedAt: now,
    idleExpiresAt: new Date(now.getTime() + limits.idleMs),
    absoluteExpiresAt: new Date(now.getTime() + limits.maxMs),
    rotatedAt: now,
    revokedAt: null,
    revokedReason: null,
  };
  return { row, cookie: `${sessionCookie(options.as ?? who.realm).name}=${id}.${secret}` };
}

/** A request as the sign-in gate reads it: a read of `path` carrying `cookie`. */
export function requestWith(cookie: string | undefined, path = "/api/auth/me"): any {
  return { method: "GET", path, headers: cookie === undefined ? {} : { cookie } };
}
