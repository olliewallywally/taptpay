/**
 * R1-T4 phase E — what the page knows about its sign-in (owner decisions 2026-09-29 and 2026-09-30,
 * docs/PLAN-2026-09-29-r1-t4-phase-e-sessions.md §2.4).
 *
 * The sign-in itself is an HttpOnly cookie that the browser sends by itself and that no script on the
 * page can read. The page keeps only who is signed in and the session's CSRF token, in memory and never
 * in storage: the start-up check hands them over (GET /api/auth/session; the admin area's
 * GET /api/admin/auth/me), a sign-in's answer carries the token, and a reload asks again. Every change
 * the page sends (POST, PUT, PATCH, DELETE) carries the token in X-CSRF-Token: another website can make a
 * browser send the cookie, but cannot read the token.
 *
 * The admin area has its own sign-in and its own token: a request to /api/admin/… carries the admin's,
 * every other request the business's, as the server reads them.
 */

export type SessionRealm = "business" | "admin";

/** The signed-in login, as the start-up check reads it. */
export interface SessionUser {
  id: number;
  email: string;
  merchantId: number | null;
  role: string;
  onboardingCompleted?: boolean;
  merchantStatus?: string | null;
  gstRegistered?: boolean;
  tradeGstMode?: string;
  billingCardReady?: boolean;
}

interface HeldSession {
  user: SessionUser;
  csrfToken: string;
}

const held: Record<SessionRealm, HeldSession | null> = { business: null, admin: null };

export const CSRF_HEADER = "X-CSRF-Token";
const CHANGES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Where the page kept its sign-in before phase E. The first load after the release removes them, so no
 * account token outlives the switch in this browser's storage.
 */
export const LEGACY_SESSION_KEYS = ["authToken", "user", "merchantId", "adminAuthToken", "adminUser"] as const;

export function holdSession(realm: SessionRealm, user: SessionUser, csrfToken: string): void {
  held[realm] = { user, csrfToken };
}

export function releaseSession(realm: SessionRealm): void {
  held[realm] = null;
}

export function heldSession(realm: SessionRealm): Readonly<HeldSession> | null {
  return held[realm];
}

/** Keeps the page's token after a change that started a new session (a password change). */
export function replaceCsrfToken(realm: SessionRealm, csrfToken: string): void {
  const current = held[realm];
  if (current) held[realm] = { ...current, csrfToken };
}

/** Which sign-in a request to this address is read by. */
export function realmOf(url: string): SessionRealm {
  let path = url;
  try {
    path = new URL(url, "http://same-origin.invalid").pathname;
  } catch {
    // A relative path as given.
  }
  return path === "/api/admin" || path.startsWith("/api/admin/") ? "admin" : "business";
}

/** Whether a request goes to this site's own origin (a path, or an address on the same origin). */
export function sameOrigin(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return typeof window !== "undefined" && new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * The session a request to this address is signed in by, as the server reads the cookies: the admin
 * area reads only the admin's; every other route the business's, then the admin's (the platform admin
 * on a business route).
 */
function sessionFor(url: string): HeldSession | null {
  return realmOf(url) === "admin" ? held.admin : held.business ?? held.admin;
}

/**
 * The CSRF header a request needs: the page's token on a change to this site, nothing on a read, and
 * never anything to another site.
 */
export function csrfHeaders(url: string, method = "GET"): Record<string, string> {
  if (!CHANGES.has(method.toUpperCase()) || !sameOrigin(url)) return {};
  const session = sessionFor(url);
  return session ? { [CSRF_HEADER]: session.csrfToken } : {};
}

/**
 * The business session's CSRF header whatever the method, for the helpers that build headers for calls
 * to this site's own API (propHeaders, tradesHeaders, …). On a read the server ignores it.
 */
export function businessCsrfHeader(): Record<string, string> {
  const session = held.business;
  return session ? { [CSRF_HEADER]: session.csrfToken } : {};
}

/** The admin session's CSRF header whatever the method, for the admin area's calls to /api/admin/…. */
export function adminCsrfHeader(): Record<string, string> {
  const session = held.admin;
  return session ? { [CSRF_HEADER]: session.csrfToken } : {};
}

function withCsrf(url: string, init: RequestInit): RequestInit {
  const headers = new Headers(init.headers ?? {});
  for (const [name, value] of Object.entries(csrfHeaders(url, init.method ?? "GET"))) headers.set(name, value);
  return { ...init, headers, credentials: "same-origin" };
}

async function csrfRefused(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body = await response.clone().json();
    return body?.code === "CSRF_REJECTED";
  } catch {
    return false;
  }
}

/**
 * The page's fetch for its own API: the cookie goes with it, and a change carries the page's CSRF token.
 * If the server refuses the token (the session was replaced in another tab, by a password change), the
 * start-up check is asked again once and the change retried with the session's current token.
 */
export async function sessionFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, withCsrf(url, init));
  if (!(await csrfRefused(response))) return response;
  const realm = realmOf(url);
  const before = held[realm]?.csrfToken;
  const refreshed = realm === "admin" ? await readAdminSession() : await readBusinessSession();
  if (refreshed.kind !== "signed-in" || refreshed.csrfToken === before) return response;
  return fetch(url, withCsrf(url, init));
}

export type SessionCheck =
  | { kind: "signed-in"; user: SessionUser; csrfToken: string }
  | { kind: "signed-out" }
  | { kind: "unavailable"; status: number };

function sessionUser(value: unknown): SessionUser | null {
  const user = value as Partial<SessionUser> | null;
  if (!user || typeof user !== "object" || typeof user.id !== "number" || typeof user.email !== "string" || typeof user.role !== "string") {
    return null;
  }
  const merchantId = typeof user.merchantId === "number" ? user.merchantId : Number(user.merchantId) || null;
  return { ...(user as SessionUser), merchantId };
}

/**
 * The business start-up check: who is signed in here, and the page's CSRF token. It is held in memory
 * when signed in and released when not. Throws only when the request itself failed (offline, aborted).
 */
export async function readBusinessSession(signal?: AbortSignal): Promise<SessionCheck> {
  const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) {
    releaseSession("business");
    return { kind: "signed-out" };
  }
  if (!response.ok) return { kind: "unavailable", status: response.status };
  const body = await response.json();
  if (body?.signedIn === false) {
    releaseSession("business");
    return { kind: "signed-out" };
  }
  const user = sessionUser(body?.user);
  if (body?.signedIn !== true || !user || typeof body.csrfToken !== "string") {
    throw new Error("The server sent an incomplete session reply.");
  }
  holdSession("business", user, body.csrfToken);
  return { kind: "signed-in", user, csrfToken: body.csrfToken };
}

/** The admin area's start-up check (GET /api/admin/auth/me), held and released as the business's. */
export async function readAdminSession(signal?: AbortSignal): Promise<SessionCheck> {
  const response = await fetch("/api/admin/auth/me", { credentials: "same-origin", cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) {
    releaseSession("admin");
    return { kind: "signed-out" };
  }
  if (!response.ok) return { kind: "unavailable", status: response.status };
  const body = await response.json();
  const user = sessionUser(body?.user);
  if (!user || typeof body.csrfToken !== "string") throw new Error("The server sent an incomplete session reply.");
  holdSession("admin", user, body.csrfToken);
  return { kind: "signed-in", user, csrfToken: body.csrfToken };
}

/** Removes the pre-phase-E sign-in from this browser's storage. Never throws. */
export function forgetLegacyStoredSession(): void {
  try {
    for (const key of LEGACY_SESSION_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts: nothing to forget.
  }
}

/**
 * A sign-out this device has begun and not yet finished. The session cookie is HttpOnly, so only the
 * server can end the session: when it cannot be reached, the page is signed out at once and the next
 * load finishes the job before anyone is signed in here (App.tsx). The mark holds no credential; a new
 * sign-in clears it.
 */
export const SIGN_OUT_PENDING_KEY = "taptpay:sign-out-pending";

export function signOutPending(): boolean {
  try {
    return localStorage.getItem(SIGN_OUT_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function markSignOutPending(pending: boolean): void {
  try {
    if (pending) localStorage.setItem(SIGN_OUT_PENDING_KEY, "1");
    else localStorage.removeItem(SIGN_OUT_PENDING_KEY);
  } catch {
    // Storage unavailable: the sign-out finishes now or the session ends on its own.
  }
}

/**
 * The first step of every Log Out, before anything is awaited: from here no load signs this browser in
 * until the sign-out has finished.
 */
export function beginSignOut(): void {
  markSignOutPending(true);
}

/** A new sign-in: nothing is left to finish. */
export function clearSignOutPending(): void {
  markSignOutPending(false);
}

/**
 * Finishes a sign-out an earlier page could not: asks which session this browser's cookie is, and has
 * the server end it. It holds nothing in memory, so it never signs anyone in. Still pending when the
 * server cannot be reached. Never throws.
 */
export async function finishPendingSignOut(): Promise<void> {
  try {
    const check = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    if (!check.ok) return;
    const body = await check.json();
    if (body?.signedIn !== true || typeof body.csrfToken !== "string") {
      if (body?.signedIn === false) markSignOutPending(false); // Nothing to end.
      return;
    }
    const ended = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { [CSRF_HEADER]: body.csrfToken },
    });
    // Ended now (204) or already (401); or the cookie is no longer that session's (403: a sign-in since
    // has replaced it, and the one being ended is out of this browser's reach, to run out on its own).
    if (ended.ok || ended.status === 401 || ended.status === 403) markSignOutPending(false);
  } catch {
    // Unreachable: still pending.
  }
}

/**
 * Log Out for this device's business sign-in: the server ends this session, clears its cookie and closes
 * its live streams; the page forgets what it held. The page is signed out at once whatever happens; if
 * the server cannot be reached, or the page never learned its session (a start-up check that did not
 * answer), the sign-out stays pending until a load can finish it. Never throws.
 */
export async function logOutThisDevice(): Promise<void> {
  beginSignOut();
  try {
    if (!held.business) {
      await finishPendingSignOut();
      return;
    }
    const response = await sessionFetch("/api/auth/logout", { method: "POST" });
    // Ended now, or had already ended.
    if (response.ok || response.status === 401) markSignOutPending(false);
  } catch {
    // Unreachable: still pending.
  } finally {
    releaseSession("business");
    forgetLegacyStoredSession();
  }
}

/** The admin area's Log Out, as the business's. */
export async function logOutAdmin(): Promise<void> {
  try {
    if (held.admin) await sessionFetch("/api/admin/auth/logout", { method: "POST" });
  } catch {
    // Unreachable: the admin session ends on its own, after 30 minutes unused.
  } finally {
    releaseSession("admin");
    forgetLegacyStoredSession();
  }
}
