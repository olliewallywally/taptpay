/**
 * R1-T5a: Apple's token boundary for Sign in with Apple (owner decision 2026-09-29, answer 2:
 * built and tested with stand-ins; live needs the owner's Services ID, key and team ID).
 *
 * Three things, each failing closed:
 * - the client secret Apple asks for: a short-lived ES256 token signed with the team's key;
 * - exchanging Apple's one-time code for an identity token;
 * - verifying that token: Apple's own signature (RS256, against the keys Apple publishes), the
 *   issuer, this app's Services ID as audience, its time, and the nonce this browser was given.
 *
 * Nothing here stores, links or signs anyone in (that is R1-T5b). The network is a parameter so
 * tests never leave the machine; production passes `fetch`.
 */
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import { config, type AppConfig } from "./config";
import { HANDOFF_CODE_TTL_MS, OAUTH_STATE_TTL_MS } from "./google-sign-in";

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

/** How long a client secret lives: enough for one exchange. */
const CLIENT_SECRET_TTL_SECONDS = 300;
/** A token may claim an issue time this far ahead of our clock, and no further. */
const ISSUED_AT_SKEW_SECONDS = 60;
/** An unknown key id may send us back to Apple for its keys at most this often. */
const KEY_REFETCH_INTERVAL_MS = 60_000;

export const APPLE_AUTHORIZE_URL = "https://appleid.apple.com/auth/authorize";

/** The part of `fetch` this needs. */
export type AppleTransport = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Why there is no identity. The message never carries a token, a subject or an address.
 * - bad-token: what arrived is not a token Apple issued for this app and this browser.
 * - grant-refused: Apple no longer honours the code (used, expired, or the person withdrew).
 * - unreachable: Apple could not be asked, or did not answer as documented.
 */
export type AppleFailure = "bad-token" | "grant-refused" | "unreachable";
export class AppleSignInError extends Error {
  constructor(public readonly reason: AppleFailure, detail: string) {
    super(`Sign in with Apple: ${detail}`);
    this.name = "AppleSignInError";
  }
}

/** Who Apple says this is. The subject, with its issuer and client id, is the stable identity. */
export interface AppleIdentity {
  issuer: string;
  clientId: string;
  subject: string;
  /** Present on the first authorization; may be a private relay address. Never required later. */
  email: string | undefined;
  emailVerified: boolean;
  privateRelay: boolean;
}

export type AppleSettings = Required<Pick<AppConfig["apple"], "servicesId" | "teamId" | "keyId" | "privateKey">>;

/** The secret Apple's token endpoint asks for: this team vouching for this Services ID, for five minutes. */
export function appleClientSecret(settings: AppleSettings, now: Date = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return jwt.sign(
    { iss: settings.teamId, sub: settings.servicesId, aud: APPLE_ISSUER, iat: issuedAt, exp: issuedAt + CLIENT_SECRET_TTL_SECONDS },
    settings.privateKey,
    { algorithm: "ES256", header: { alg: "ES256", kid: settings.keyId } },
  );
}

export interface AppleKeySet {
  /** Apple's signing key with that id, or null when Apple publishes none. */
  keyFor(keyId: string): Promise<crypto.KeyObject | null>;
}

/**
 * Apple's published signing keys, fetched from Apple's fixed address, kept, and refetched when a
 * token names a key id we do not have (Apple rotates). The refetch happens at most once a minute,
 * so a made-up key id cannot be used to make this server hammer Apple.
 */
export function createAppleKeySet(transport: AppleTransport, clock: () => number = Date.now): AppleKeySet {
  let keys: Map<string, crypto.KeyObject> | undefined;
  let fetchedAt = -Infinity;
  let fetching: Promise<void> | undefined;

  async function fetchKeys(): Promise<void> {
    let body: unknown;
    try {
      const response = await transport(APPLE_KEYS_URL);
      if (!response.ok) throw new Error("status");
      body = await response.json();
    } catch {
      throw new AppleSignInError("unreachable", "Apple's keys could not be read");
    }
    const published = (body as { keys?: unknown } | null)?.keys;
    if (!Array.isArray(published)) throw new AppleSignInError("unreachable", "Apple's keys were not a key set");
    const next = new Map<string, crypto.KeyObject>();
    for (const entry of published) {
      const key = entry as { kty?: unknown; kid?: unknown; use?: unknown; alg?: unknown } | null;
      // Only RSA signing keys count; anything else in the set is not one of Apple's token keys.
      if (!key || key.kty !== "RSA" || typeof key.kid !== "string" || !key.kid) continue;
      if (key.use !== undefined && key.use !== "sig") continue;
      if (key.alg !== undefined && key.alg !== "RS256") continue;
      try {
        next.set(key.kid, crypto.createPublicKey({ key: key as crypto.JsonWebKey, format: "jwk" }));
      } catch {
        // A malformed entry is skipped: a token signed under it finds no key.
      }
    }
    keys = next;
    fetchedAt = clock();
  }

  return {
    async keyFor(keyId: string) {
      const known = keys?.get(keyId);
      if (known) return known;
      if (clock() - fetchedAt < KEY_REFETCH_INTERVAL_MS) return null;
      // One fetch at a time, shared by whoever is waiting for it.
      fetching ??= fetchKeys().finally(() => { fetching = undefined; });
      await fetching;
      return keys?.get(keyId) ?? null;
    },
  };
}

/** Apple writes these two as a boolean or as the text "true"; nothing else is true. */
const claimIsTrue = (value: unknown) => value === true || value === "true";
const sameText = (a: string, b: string) =>
  crypto.timingSafeEqual(crypto.createHash("sha256").update(a).digest(), crypto.createHash("sha256").update(b).digest());

/**
 * The identity in a token Apple issued for this app and this browser, or AppleSignInError.
 * Every check is required: RS256 under a key Apple publishes, Apple as issuer, the Services ID as
 * the only audience, not expired, not issued in the future, the browser's own nonce, a subject.
 */
export async function verifyAppleIdentityToken(
  idToken: string,
  expected: { clientId: string; nonce: string },
  keys: AppleKeySet,
  now: Date = new Date(),
): Promise<AppleIdentity> {
  const bad = (detail: string) => new AppleSignInError("bad-token", detail);
  if (typeof idToken !== "string" || idToken.split(".").length !== 3) throw bad("not an identity token");
  let header: { alg?: unknown; kid?: unknown };
  try {
    header = JSON.parse(Buffer.from(idToken.split(".")[0], "base64url").toString("utf8"));
  } catch {
    throw bad("not an identity token");
  }
  // The algorithm is ours to choose, never the token's: no "none", no shared-secret algorithm.
  if (header?.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) throw bad("not signed as Apple signs");
  const key = await keys.keyFor(header.kid);
  if (!key) throw bad("signed by a key Apple does not publish");

  const nowSeconds = Math.floor(now.getTime() / 1000);
  let claims: jwt.JwtPayload;
  try {
    const verified = jwt.verify(idToken, key, { algorithms: ["RS256"], issuer: APPLE_ISSUER, clockTimestamp: nowSeconds });
    if (typeof verified === "string") throw new Error("payload");
    claims = verified;
  } catch {
    throw bad("the signature, issuer or time did not hold");
  }
  if (claims.aud !== expected.clientId) throw bad("issued for another app");
  if (typeof claims.exp !== "number") throw bad("no expiry");
  if (typeof claims.iat !== "number" || claims.iat > nowSeconds + ISSUED_AT_SKEW_SECONDS) throw bad("issued in the future");
  if (typeof claims.nonce !== "string" || !sameText(claims.nonce, expected.nonce)) throw bad("not this browser's sign-in");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw bad("no subject");
  if (claims.email !== undefined && (typeof claims.email !== "string" || claims.email.length > 320)) throw bad("an address that is not text");

  return {
    issuer: APPLE_ISSUER,
    clientId: expected.clientId,
    subject: claims.sub,
    email: claims.email,
    emailVerified: claimIsTrue(claims.email_verified),
    privateRelay: claimIsTrue(claims.is_private_email),
  };
}

/**
 * Exchanges Apple's one-time code for its identity token (still to be verified by the caller).
 * `invalid_grant` is Apple no longer honouring the code; every other failure is Apple not answering
 * as documented. The secret is made here, used once and never logged.
 */
export async function exchangeAppleCode(
  code: string,
  redirectUri: string,
  settings: AppleSettings,
  transport: AppleTransport,
  now: Date = new Date(),
): Promise<string> {
  if (typeof code !== "string" || !code || code.length > 2048) throw new AppleSignInError("bad-token", "not a code Apple issues");
  let response: Awaited<ReturnType<AppleTransport>>;
  let body: unknown;
  try {
    response = await transport(APPLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.servicesId,
        client_secret: appleClientSecret(settings, now),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });
    body = await response.json().catch(() => undefined);
  } catch {
    throw new AppleSignInError("unreachable", "Apple's token endpoint could not be reached");
  }
  if (!response.ok) {
    if ((body as { error?: unknown } | undefined)?.error === "invalid_grant") {
      throw new AppleSignInError("grant-refused", "Apple no longer honours that code");
    }
    throw new AppleSignInError("unreachable", "Apple's token endpoint refused the exchange");
  }
  const idToken = (body as { id_token?: unknown } | undefined)?.id_token;
  if (typeof idToken !== "string" || !idToken) throw new AppleSignInError("bad-token", "Apple's answer carried no identity token");
  return idToken;
}

// ── R1-T5b: this browser's sign-in ──────────────────────────────────────────────────────────────

const RANDOM_TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const randomToken = () => crypto.randomBytes(32).toString("base64url");

/** All four settings, or null: then Sign in with Apple is simply not offered. */
export function appleSettings(settings: AppConfig["apple"] = config.apple): AppleSettings | null {
  const { servicesId, teamId, keyId, privateKey } = settings;
  return servicesId && teamId && keyId && privateKey ? { servicesId, teamId, keyId, privateKey } : null;
}

/**
 * Cookie names and flags for the public origin. Apple returns by a cross-site form POST, and only a
 * `SameSite=None; Secure` cookie comes back with one, so the starting cookie has to be that: the
 * flow needs an https origin (`secure` false here means it cannot run). The handoff cookie is read
 * only by our own page's POST, so it is Strict, as Google's is.
 */
export function appleSignInCookies(publicOrigin: string) {
  const secure = new URL(publicOrigin).protocol === "https:";
  const name = (base: string) => (secure ? `__Host-${base}` : base);
  const options = (sameSite: "none" | "strict", maxAge: number): CookieOptions => ({ httpOnly: true, secure, sameSite, path: "/", maxAge });
  return {
    secure,
    oauth: { name: name("taptpay-apple-oauth"), options: options("none", OAUTH_STATE_TTL_MS) },
    handoff: { name: name("taptpay-apple-handoff"), options: options("strict", HANDOFF_CODE_TTL_MS) },
  };
}

let appleStateKey: Buffer | undefined;
/** The starting cookie's signature, under a key for this purpose alone (as Google's state has its own). */
function appleStateSignature(payload: string): string {
  appleStateKey ??= Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, Buffer.alloc(0), "taptpay apple-state v1", 32));
  return crypto.createHmac("sha256", appleStateKey).update(payload, "utf8").digest("base64url");
}

/** A fresh state and nonce, and the signed cookie value binding them to this browser and this moment. */
export function startAppleSignIn(): { state: string; nonce: string; cookieValue: string } {
  const state = randomToken();
  const nonce = randomToken();
  const payload = `${state}.${nonce}.${Date.now()}`;
  return { state, nonce, cookieValue: `${payload}.${appleStateSignature(payload)}` };
}

/**
 * The nonce this browser was given when the returned `state` is its own, else null. The cookie is
 * believed only under this server's signature and within ten minutes of its start; a malformed
 * cookie or state is simply refused. Compared in constant time.
 */
export function verifyAppleSignInState(cookieValue: string | undefined, returnedState: unknown): string | null {
  if (typeof cookieValue !== "string" || typeof returnedState !== "string") return null;
  const [state, nonce, issued, signature, extra] = cookieValue.split(".");
  if (extra !== undefined || !RANDOM_TOKEN.test(state ?? "") || !RANDOM_TOKEN.test(nonce ?? "") || !RANDOM_TOKEN.test(signature ?? "")) return null;
  if (!/^\d{13}$/.test(issued ?? "")) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(appleStateSignature(`${state}.${nonce}.${issued}`)))) return null;
  const age = Date.now() - Number(issued);
  if (age < 0 || age >= OAUTH_STATE_TTL_MS) return null;
  if (!RANDOM_TOKEN.test(returnedState)) return null;
  return crypto.timingSafeEqual(Buffer.from(state), Buffer.from(returnedState)) ? nonce : null;
}

/** Where the browser is sent to sign in at Apple. The answer comes back as a form post. */
export function appleAuthorizeUrl(settings: AppleSettings, redirectUri: string, started: { state: string; nonce: string }): string {
  const params = new URLSearchParams({
    client_id: settings.servicesId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state: started.state,
    nonce: started.nonce,
  });
  return `${APPLE_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * A display name from the form's `user` field, which Apple sends once and does not sign. Only a
 * name is ever read from it: letters as given, control characters removed, at most 100 characters.
 */
export function appleDisplayName(userField: unknown): string | undefined {
  if (typeof userField !== "string" || userField.length > 4096) return undefined;
  let parsed: { name?: { firstName?: unknown; lastName?: unknown } } | null;
  try {
    parsed = JSON.parse(userField);
  } catch {
    return undefined;
  }
  const part = (value: unknown) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "");
  const name = `${part(parsed?.name?.firstName)} ${part(parsed?.name?.lastName)}`.trim().slice(0, 100).trim();
  return name || undefined;
}
