import { stopThisDevicePush } from "./push-device";
import { beginSignOut, forgetLegacyStoredSession, logOutThisDevice, releaseSession } from "./session";

/**
 * Log Out on this device (R1-T4): stop its notifications while the session can still say whose device
 * it is, then end the session on the server and forget it here. Never throws; the page is signed out
 * even when the server cannot be reached, and the sign-out is then finished by the next load
 * (lib/session.ts). The sign-out is marked as begun before anything is awaited.
 */
export async function logOut(): Promise<void> {
  beginSignOut();
  await stopThisDevicePush();
  await logOutThisDevice();
}

/**
 * After "Sign out of all devices": the server has already ended every session of this login, this
 * one's included, cleared its cookie and stopped its devices' notifications. The page only forgets.
 */
export function forgetThisDeviceSignIn(): void {
  releaseSession("business");
  forgetLegacyStoredSession();
}
