/*
 * R1-T5d: the pages' side of Sign in with Apple. Every rule is the server's
 * (server/apple-sign-in.ts, server/routes.ts): a page only asks whether it is offered, sends the
 * browser to start it, and says how it went. Nothing here is stored.
 */

/** A login's own Apple connection, as GET /api/auth/apple/connection answers its owner. */
export interface AppleConnection {
  /** A connect can start here: Apple is set up, on an https origin. */
  available: boolean;
  connected: boolean;
  /** The address Apple gave; possibly a relay address. */
  email: string | null;
  isPrivateEmail: boolean;
  connectedAt: string | null;
}

/** Whether Sign in with Apple is offered here: the server's own answer, and no when it cannot be asked. */
export async function appleSignInOffered(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/apple/available", { credentials: "same-origin", cache: "no-store", signal });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    return body?.available === true;
  } catch {
    return false;
  }
}

/** Apple's own sign-in page, and nothing else: the only address a connect's start may send the browser to. */
export function isAppleAuthorizeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === "https://appleid.apple.com" && url.pathname === "/auth/authorize";
  } catch {
    return false;
  }
}

/** The one way a page leaves for Apple. (A test replaces it: jsdom cannot navigate.) */
export function leaveForApple(url: string): void {
  window.location.assign(url);
}

/** Where a sign-in starts: the server sets its starting cookie there and sends the browser on to Apple. */
export const APPLE_SIGN_IN_START = "/api/auth/apple";

/** Starts Sign in with Apple from the login page. (A test replaces it, as above.) */
export function leaveToSignInWithApple(): void {
  window.location.assign(APPLE_SIGN_IN_START);
}

export interface AppleConnectOutcome {
  connected: boolean;
  title: string;
  description: string;
}

const NOT_CONNECTED = "Apple was not connected";

/**
 * How a connect ended, by the one fixed word Apple's return leaves in the address
 * (/settings?apple=<word>). Only these words say anything; the address's own text is never shown.
 */
const OUTCOMES: Record<string, AppleConnectOutcome> = {
  connected: { connected: true, title: "Apple connected", description: "You can now sign in with Apple." },
  cancelled: { connected: false, title: NOT_CONNECTED, description: "You cancelled at Apple." },
  expired: { connected: false, title: NOT_CONNECTED, description: "That took too long, or you were signed out. Please try again." },
  taken: { connected: false, title: NOT_CONNECTED, description: "That Apple account is already connected to another TaptPay login." },
  "has-another": { connected: false, title: NOT_CONNECTED, description: "This login already has a different Apple account connected. Disconnect it first." },
  unavailable: { connected: false, title: NOT_CONNECTED, description: "Apple is unavailable right now. Please try again." },
  failed: { connected: false, title: NOT_CONNECTED, description: "Something went wrong. Please try again." },
  "try-later": { connected: false, title: NOT_CONNECTED, description: "Too many attempts. Please try again later." },
};

/** What to tell the owner for a return word, or nothing for anything that is not one of the eight. */
export function appleConnectOutcome(word: string | null): AppleConnectOutcome | null {
  return word !== null && Object.prototype.hasOwnProperty.call(OUTCOMES, word) ? OUTCOMES[word] : null;
}
