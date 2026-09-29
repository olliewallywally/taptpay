/*
 * R1-T4 phase D follow-up (owner decision 2026-09-22): notifications belong to
 * the login that turned them on for a device. Log Out stops this device. A
 * confirmed session re-registers this device's existing subscription under the
 * signed-in login, and never turns notifications on for a device that has none.
 * Neither may throw or hold up signing out or opening the app.
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
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  delete (window as { PushManager?: unknown }).PushManager;
  delete (window as { Notification?: unknown }).Notification;
});

const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => url === path);
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);
const authOf = (call: unknown[]) => ((call[1] as RequestInit).headers as Record<string, string>).Authorization;

describe("Log Out on a browser", () => {
  it("retires this browser's subscription, then tells the server with the token it had", async () => {
    await stopThisDevicePush("this.device.token");

    expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1);
    const [call] = callsTo("/api/push/unsubscribe");
    expect(call[1]).toEqual(expect.objectContaining({ method: "POST", keepalive: true }));
    expect(authOf(call)).toBe("Bearer this.device.token");
    expect(bodyOf(call)).toEqual({ endpoint: "https://push.example.test/this-browser" });
    // Local first: it retires the endpoint at the push service even if the request never lands.
    expect(subscription!.unsubscribe.mock.invocationCallOrder[0])
      .toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
  });

  it("asks nothing of the server when this browser has no subscription", async () => {
    subscription = null;
    await stopThisDevicePush("this.device.token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retires the subscription even with no token to tell the server", async () => {
    await stopThisDevicePush(null);
    expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not held up by a page without a service worker", async () => {
    getRegistration.mockResolvedValue(undefined);
    await expect(stopThisDevicePush("this.device.token")).resolves.toBeUndefined();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    await expect(stopThisDevicePush("this.device.token")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws, and still tells the server when the browser refuses to unsubscribe", async () => {
    subscription!.unsubscribe.mockRejectedValue(new Error("synthetic browser fault"));
    await expect(stopThisDevicePush("this.device.token")).resolves.toBeUndefined();
    expect(callsTo("/api/push/unsubscribe")).toHaveLength(1);

    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(stopThisDevicePush("this.device.token")).resolves.toBeUndefined();
    getRegistration.mockRejectedValue(new Error("synthetic worker fault"));
    await expect(stopThisDevicePush("this.device.token")).resolves.toBeUndefined();
  });

  it("abandons a request that never answers", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    let settled = false;
    const stopping = stopThisDevicePush("this.device.token").then(() => { settled = true; });
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

    await stopThisDevicePush("this.device.token");

    const [call] = callsTo("/api/push/native-unsubscribe");
    expect(authOf(call)).toBe("Bearer this.device.token");
    expect(bodyOf(call)).toEqual({ deviceToken: "device-token-1" });
    expect(rememberedDuringRequest).toBeNull();
    expect(readNativeDeviceToken()).toBeNull();
    expect(nativeDeviceState()).toBe("off");
    expect(getRegistration).not.toHaveBeenCalled();
  });

  it("asks for this login's iPhones when it registered before tokens were remembered", async () => {
    await stopThisDevicePush("this.device.token");
    expect(bodyOf(callsTo("/api/push/native-unsubscribe")[0])).toEqual({});
  });
});

describe("a confirmed session re-registers this device", () => {
  it("re-registers this browser's existing subscription under the signed-in login", async () => {
    await resyncThisDevicePush("fresh.token");

    const [call] = callsTo("/api/push/subscribe");
    expect(call[1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(authOf(call)).toBe("Bearer fresh.token");
    expect(bodyOf(call)).toEqual({ subscription: subscription!.toJSON() });
    expect(pushManagerSubscribe).not.toHaveBeenCalled();
  });

  it("never turns notifications on: not without permission, not without a subscription", async () => {
    installBrowserPush("default");
    await resyncThisDevicePush("fresh.token");
    installBrowserPush("granted");
    subscription = null;
    await resyncThisDevicePush("fresh.token");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushManagerSubscribe).not.toHaveBeenCalled();
  });

  it("re-registers an iPhone's remembered token, and leaves one with none alone", async () => {
    mockNativeIOS = true;
    rememberNativeDeviceToken("device-token-2");
    await resyncThisDevicePush("fresh.token");
    const [call] = callsTo("/api/push/native-subscribe");
    expect(authOf(call)).toBe("Bearer fresh.token");
    expect(bodyOf(call)).toEqual({ deviceToken: "device-token-2" });

    fetchMock.mockClear();
    forgetNativeDeviceToken();
    await resyncThisDevicePush("fresh.token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(resyncThisDevicePush("fresh.token")).resolves.toBeUndefined();
    getRegistration.mockRejectedValue(new Error("synthetic worker fault"));
    await expect(resyncThisDevicePush("fresh.token")).resolves.toBeUndefined();
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
