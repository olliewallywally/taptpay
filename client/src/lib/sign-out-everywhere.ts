/**
 * R1-T4 phase D — "Sign out of all devices". The server ends every session of
 * this login by advancing its session version; this device's token is spent
 * with the rest, so the caller then signs this device out as it always does.
 *
 * Only the server's 204 means every session ended. A 401 means this device's
 * own session had already ended — which says nothing about a device that signed
 * in since — so it is reported as "already-signed-out", never as success.
 */
export type SignOutEverywhereOutcome = "ended" | "already-signed-out";

const FAILED = "Couldn't sign out of all devices. Please try again.";

export const SIGN_OUT_EVERYWHERE_CONFIRMATION =
  "Sign out of all devices? Every device signed in to this login, this one included, will need to sign in again.";

export async function signOutEverywhere(): Promise<SignOutEverywhereOutcome> {
  let token: string | null = null;
  try {
    token = localStorage.getItem("authToken");
  } catch {
    // Storage unavailable: nothing here is signed in.
  }
  if (!token) return "already-signed-out";

  let response: Response;
  try {
    response = await fetch("/api/auth/sign-out-everywhere", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(FAILED);
  }
  if (response.status === 204) return "ended";
  if (response.status === 401) return "already-signed-out";
  const body = (await response.json().catch(() => ({}))) as { message?: unknown };
  throw new Error(typeof body.message === "string" ? body.message : FAILED);
}
