/**
 * R1-T4 phase D follow-up (owner decision 2026-09-22,
 * docs/decisions/2026-09-22-r1-t4-phase-d-owner-answers.md): notifications
 * belong to the login that turned them on for this device.
 *
 * - Log Out stops this device's notifications before its token is discarded.
 * - A confirmed session re-registers this device's existing subscription under
 *   the signed-in login: when the app opens (App.tsx), and after a password
 *   change, which stopped every device of the login. Subscriptions from before
 *   migration 0029 gain their login this way. It never turns notifications on
 *   for a device that has none.
 *
 * Neither ever throws, and each request is abandoned after
 * PUSH_REQUEST_TIMEOUT_MS: signing out, or opening the app, never depends on
 * notifications.
 *
 * An iPhone remembers the device token it registered, so that turning
 * notifications off, or Log Out, stops that iPhone alone, and its switch shows
 * that iPhone rather than the whole business.
 */
import { isNativeIOS } from "@/lib/native";

export const PUSH_REQUEST_TIMEOUT_MS = 5_000;

const DEVICE_TOKEN_KEY = "pushDeviceToken";
const DEVICE_OFF_KEY = "pushDeviceOff";

export function rememberNativeDeviceToken(deviceToken: string): void {
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
    localStorage.removeItem(DEVICE_OFF_KEY);
  } catch {
    // Storage unavailable: the switch falls back to the business-wide flag.
  }
}

export function readNativeDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

/** Turned off, or signed out, on this iPhone: remembered as off. */
export function forgetNativeDeviceToken(): void {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    localStorage.setItem(DEVICE_OFF_KEY, "1");
  } catch {
    // Storage unavailable: nothing was remembered.
  }
}

/**
 * "on": registered with a remembered token. "off": turned off or signed out
 * here since tokens were remembered. "unknown": neither — set up, if at all,
 * before, so only the business-wide flag is known.
 */
export function nativeDeviceState(): "on" | "off" | "unknown" {
  if (readNativeDeviceToken()) return "on";
  try {
    return localStorage.getItem(DEVICE_OFF_KEY) ? "off" : "unknown";
  } catch {
    return "unknown";
  }
}

async function currentWebSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  // getRegistration, not .ready: .ready never settles on a page with no worker.
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function post(path: string, authToken: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_REQUEST_TIMEOUT_MS);
  try {
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(body),
      // Outlives the page, should signing out navigate away first.
      keepalive: true,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Log Out: stop this device's notifications. `authToken` is the one being discarded. */
export async function stopThisDevicePush(authToken: string | null): Promise<void> {
  try {
    if (isNativeIOS()) {
      // Forgotten first, so a sign-in that follows at once cannot re-register it.
      const deviceToken = readNativeDeviceToken();
      forgetNativeDeviceToken();
      // Without a remembered token the server stops this login's iPhones.
      if (authToken) await post("/api/push/native-unsubscribe", authToken, deviceToken ? { deviceToken } : {});
      return;
    }
    const subscription = await currentWebSubscription();
    if (!subscription) return;
    const { endpoint } = subscription;
    // Local first: it retires the endpoint at the push service, so this device
    // stops even if the request below never lands.
    await subscription.unsubscribe().catch(() => false);
    if (authToken) await post("/api/push/unsubscribe", authToken, { endpoint });
  } catch {
    // Signing out never fails because of notifications.
  }
}

/** A confirmed session: re-register this device's existing subscription under its login. */
export async function resyncThisDevicePush(authToken: string): Promise<void> {
  try {
    if (isNativeIOS()) {
      const deviceToken = readNativeDeviceToken();
      if (deviceToken) await post("/api/push/native-subscribe", authToken, { deviceToken });
      return;
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const subscription = await currentWebSubscription();
    if (subscription) await post("/api/push/subscribe", authToken, { subscription: subscription.toJSON() });
  } catch {
    // Opening the app never fails because of notifications.
  }
}
