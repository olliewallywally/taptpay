import { performance } from "node:perf_hooks";

// Owner decision 2026-09-23: a door that must not say whether an email address has an
// account must not say it through its timing either. Sign-up, forgot-password and the
// confirmation resend each do more for an address that has an account (save a link,
// send an email) than for one that does not, so each answers no sooner than a fixed
// time after the request began, whichever way it went.

/** Sign-up hashes a password, saves an application and sends an email. */
export const SIGN_UP_REPLY_FLOOR_MS = 1500;
/** Forgot-password and the confirmation resend each save or look up, then send an email. */
export const ACCOUNT_EMAIL_REPLY_FLOOR_MS = 1000;

/** The reading to take as a request begins and hand to `replyNoSoonerThan`: one clock for both. */
export function replyStart(): number {
  return performance.now();
}

/**
 * Waits until `floorMs` have passed since `startedAt` (from `replyStart()`), and returns
 * how long the work itself took. When that is over the floor, the timing can tell again:
 * callers log it, so the floor can be raised.
 */
export async function replyNoSoonerThan(startedAt: number, floorMs: number): Promise<number> {
  const worked = performance.now() - startedAt;
  if (worked < floorMs) await new Promise((resolve) => setTimeout(resolve, floorMs - worked));
  return worked;
}
