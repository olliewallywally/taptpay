/*
 * R1-T4 phase D follow-up (owner decision 2026-09-22): notifications belong to
 * the login that turned them on for a device. Log Out stops this device. A
 * confirmed session re-registers this device's existing subscription under the
 * signed-in login, and never turns notifications on for a device that has none.
 * Neither may throw or hold up signing out or opening the app.
 *
 * R1-T4 phase E: the session cookie signs these requests in (the browser sends it itself); each carries
 * the page's CSRF token, and none is sent unless the page holds a sign-in.
 */
import {
  forgetNativeDeviceToken,
  nativeDeviceState,
  PUSH_REQUEST_TIMEOUT_MS,
  readNativeDeviceToken,
  rememberNativeDeviceToken,
  resyncThisDevicePush,
  stopThisDevicePush,
} from "../push-device";
import { holdSession, releaseSession } from "../session";

let mockNativeIOS = false;
jest.mock("@/lib/native", () => ({ isNativeIOS: () => mockNativeIOS }));

const fetchMock = global.fetch as jest.Mock;
const ok = { ok: true, status: 200, json: async () => ({}) };

function browserSubscription(endpoint = "https://push.example.test/this-browser") {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "browser-public", auth: "browser-auth" } }),
    unsubscribe: jest.fn().mockResolvedValue(true),
  };
}

let subscription: ReturnType<typeof browserSubscription> | null;
let getRegistration: jest.Mock;
let pushManagerSubscribe: jest.Mock;

function installBrowserPush(permission: NotificationPermission = "granted") {
  pushManagerSubscribe = jest.fn();
  getRegistration = jest.fn(async () => ({
    pushManager: { getSubscription: jest.fn(async () => subscription), subscribe: pushManagerSubscribe },
  }));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration } });
  Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, "Notification", { configurable: true, value: { permission } });
}

beforeEach(() => {
  mockNativeIOS = false;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok);
  localStorage.clear();
  subscription = browserSubscription();
  installBrowserPush();
  holdSession("business", { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" }, "this.device.csrf");
});

afterEach(() => {
  releaseSession("business");
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  delete (window as { PushManager?: unknown }).PushManager;
  delete (window as { Notification?: unknown }).Notification;
});

const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => url === path);
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);
const headersOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;
const csrfOf = (call: unknown[]) => headersOf(call)["X-CSRF-Token"];

describe("Log Out on a browser", () => {
  it("retires this browser's subscription, then tells the server, signed in by the session it had", async () => {
    await stopThisDevicePush();

    expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1);
    const [call] = callsTo("/api/push/unsubscribe");
    expect(call[1]).toEqual(expect.objectContaining({ method: "POST", keepalive: true }));
    expect(call[1]).toEqual(expect.objectContaining({ credentials: "same-origin" }));
    expect(csrfOf(call)).toBe("this.device.csrf");
    expect(headersOf(call).Authorization).toBeUndefined();
    expect(bodyOf(call)).toEqual({ endpoint: "https://push.example.test/this-browser" });
    // Local first: it retires the endpoint at the push service even if the request never lands.
    expect(subscription!.unsubscribe.mock.invocationCallOrder[0])
      .toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
  });

  it("asks nothing of the server when this browser has no subscription", async () => {
    subscription = null;
    await stopThisDevicePush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retires the subscription even with no sign-in to tell the server", async () => {
    releaseSession("business");
    await stopThisDevicePush();
    expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not held up by a page without a service worker", async () => {
    getRegistration.mockResolvedValue(undefined);
    await expect(stopThisDevicePush()).resolves.toBeUndefined();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    await expect(stopThisDevicePush()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws, and still tells the server when the browser refuses to unsubscribe", async () => {
    subscription!.unsubscribe.mockRejectedValue(new Error("synthetic browser fault"));
    await expect(stopThisDevicePush()).resolves.toBeUndefined();
    expect(callsTo("/api/push/unsubscribe")).toHaveLength(1);

    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(stopThisDevicePush()).resolves.toBeUndefined();
    getRegistration.mockRejectedValue(new Error("synthetic worker fault"));
    await expect(stopThisDevicePush()).resolves.toBeUndefined();
  });

  it("abandons a request that never answers", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    let settled = false;
    const stopping = stopThisDevicePush().then(() => { settled = true; });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(callsTo("/api/push/unsubscribe")).toHaveLength(1);

    jest.advanceTimersByTime(PUSH_REQUEST_TIMEOUT_MS);
    await stopping;
    expect(settled).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("Log Out on an iPhone", () => {
  beforeEach(() => {
    mockNativeIOS = true;
  });

  it("stops this iPhone by its remembered device token, forgotten before the request", async () => {
    rememberNativeDeviceToken("device-token-1");
    let rememberedDuringRequest: string | null | undefined;
    fetchMock.mockImplementation(async () => {
      rememberedDuringRequest = readNativeDeviceToken();
      return ok;
    });

    await stopThisDevicePush();

    const [call] = callsTo("/api/push/native-unsubscribe");
    expect(csrfOf(call)).toBe("this.device.csrf");
    expect(bodyOf(call)).toEqual({ deviceToken: "device-token-1" });
    expect(rememberedDuringRequest).toBeNull();
    expect(readNativeDeviceToken()).toBeNull();
    expect(nativeDeviceState()).toBe("off");
    expect(getRegistration).not.toHaveBeenCalled();
  });

  it("asks for this login's iPhones when it registered before tokens were remembered", async () => {
    await stopThisDevicePush();
    expect(bodyOf(callsTo("/api/push/native-unsubscribe")[0])).toEqual({});
  });
});

describe("a confirmed session re-registers this device", () => {
  it("re-registers this browser's existing subscription under the signed-in login", async () => {
    await resyncThisDevicePush();

    const [call] = callsTo("/api/push/subscribe");
    expect(call[1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(csrfOf(call)).toBe("this.device.csrf");
    expect(headersOf(call).Authorization).toBeUndefined();
    expect(bodyOf(call)).toEqual({ subscription: subscription!.toJSON() });
    expect(pushManagerSubscribe).not.toHaveBeenCalled();
  });

  it("never turns notifications on: not without permission, not without a subscription", async () => {
    installBrowserPush("default");
    await resyncThisDevicePush();
    installBrowserPush("granted");
    subscription = null;
    await resyncThisDevicePush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushManagerSubscribe).not.toHaveBeenCalled();
  });

  it("re-registers an iPhone's remembered token, and leaves one with none alone", async () => {
    mockNativeIOS = true;
    rememberNativeDeviceToken("device-token-2");
    await resyncThisDevicePush();
    const [call] = callsTo("/api/push/native-subscribe");
    expect(csrfOf(call)).toBe("this.device.csrf");
    expect(bodyOf(call)).toEqual({ deviceToken: "device-token-2" });

    fetchMock.mockClear();
    forgetNativeDeviceToken();
    await resyncThisDevicePush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks nothing of the server when the page holds no sign-in", async () => {
    releaseSession("business");
    await resyncThisDevicePush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(resyncThisDevicePush()).resolves.toBeUndefined();
    getRegistration.mockRejectedValue(new Error("synthetic worker fault"));
    await expect(resyncThisDevicePush()).resolves.toBeUndefined();
  });
});

describe("the remembered iPhone device token", () => {
  it("is remembered, read and forgotten", () => {
    expect(readNativeDeviceToken()).toBeNull();
    rememberNativeDeviceToken("device-token-3");
    expect(readNativeDeviceToken()).toBe("device-token-3");
    forgetNativeDeviceToken();
    expect(readNativeDeviceToken()).toBeNull();
  });

  it("tells this iPhone's on, off and not-yet-known apart", () => {
    expect(nativeDeviceState()).toBe("unknown");
    rememberNativeDeviceToken("device-token-5");
    expect(nativeDeviceState()).toBe("on");
    forgetNativeDeviceToken();
    expect(nativeDeviceState()).toBe("off");
    rememberNativeDeviceToken("device-token-6");
    expect(nativeDeviceState()).toBe("on");
  });

  it("survives storage that refuses every call", () => {
    const refuse = () => { throw new DOMException("synthetic storage fault", "SecurityError"); };
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation(refuse);

    expect(() => rememberNativeDeviceToken("device-token-4")).not.toThrow();
    expect(readNativeDeviceToken()).toBeNull();
    expect(() => forgetNativeDeviceToken()).not.toThrow();
    expect(nativeDeviceState()).toBe("unknown");
  });
});
