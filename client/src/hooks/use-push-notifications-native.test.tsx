/**
 * R1-T4 phase D follow-up (owner decision 2026-09-22), on an iPhone. Turning
 * notifications off stops this iPhone only, by the device token it remembered
 * when they were turned on, and the switch shows this iPhone's own state. It
 * used to read one flag for the whole business, so with per-iPhone "off" a
 * teammate's iPhone would flip this one's switch back on.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePushNotifications } from "./use-push-notifications";
import { nativeDeviceState, readNativeDeviceToken, rememberNativeDeviceToken, forgetNativeDeviceToken } from "@/lib/push-device";

jest.mock("@/lib/native", () => ({ isNativeIOS: () => true }));
const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

type Listener = (payload: { value?: string; error?: string }) => void;
const mockListeners: Record<string, Listener> = {};
const mockNativePush = {
  checkPermissions: jest.fn(),
  requestPermissions: jest.fn(),
  addListener: jest.fn(async (event: string, listener: Listener) => {
    mockListeners[event] = listener;
    return { remove: jest.fn() };
  }),
  register: jest.fn(async () => {
    mockListeners.registration?.({ value: "apns-device-token-1" });
  }),
};
jest.mock("@capacitor/push-notifications", () => ({ PushNotifications: mockNativePush }));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
let businessWideFlag: boolean;
let unsubscribeStatus: number;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("authToken", "this.device.token");
  businessWideFlag = false;
  unsubscribeStatus = 200;
  mockNativePush.checkPermissions.mockResolvedValue({ receive: "granted" });
  mockNativePush.requestPermissions.mockResolvedValue({ receive: "granted" });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/push/capabilities") return reply({ nativePush: { available: true } });
    if (url === "/api/push/status") return reply({ nativeSubscribed: businessWideFlag });
    if (url === "/api/push/preferences") return reply({ preferences: null });
    if (url === "/api/push/native-subscribe") return reply({ success: true });
    if (url === "/api/push/native-unsubscribe") return reply({ success: unsubscribeStatus === 200 }, unsubscribeStatus);
    throw new Error(`Unexpected fetch: ${url}`);
  });
});

const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => url === path);
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

async function mountHook() {
  const hook = renderHook(() => usePushNotifications());
  await waitFor(() => expect(hook.result.current.available).toBe(true));
  await waitFor(() => expect(mockNativePush.checkPermissions).toHaveBeenCalled());
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  return hook;
}

describe("notifications on an iPhone", () => {
  it("turning them on remembers this iPhone's device token", async () => {
    const { result } = await mountHook();
    await act(async () => {
      await result.current.toggle(true);
    });

    expect(bodyOf(callsTo("/api/push/native-subscribe")[0])).toEqual({ deviceToken: "apns-device-token-1" });
    expect(readNativeDeviceToken()).toBe("apns-device-token-1");
    expect(nativeDeviceState()).toBe("on");
    expect(result.current.enabled).toBe(true);
  });

  it("turning them off stops this iPhone only, by its remembered token, then forgets it", async () => {
    rememberNativeDeviceToken("apns-device-token-1");
    const { result } = await mountHook();
    expect(result.current.enabled).toBe(true);
    await act(async () => {
      await result.current.toggle(false);
    });

    expect(bodyOf(callsTo("/api/push/native-unsubscribe")[0])).toEqual({ deviceToken: "apns-device-token-1" });
    expect(readNativeDeviceToken()).toBeNull();
    expect(nativeDeviceState()).toBe("off");
    expect(result.current.enabled).toBe(false);
  });

  it("a refused turn-off keeps the token, so the switch stays on and it can be retried", async () => {
    rememberNativeDeviceToken("apns-device-token-1");
    unsubscribeStatus = 500;
    const { result } = await mountHook();
    await act(async () => {
      await result.current.toggle(false);
    });

    expect(readNativeDeviceToken()).toBe("apns-device-token-1");
    expect(result.current.enabled).toBe(true);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Failed to update notification settings" }));
  });

  it("the switch shows this iPhone, not a teammate's: off here stays off", async () => {
    forgetNativeDeviceToken();
    businessWideFlag = true;
    const { result } = await mountHook();

    expect(result.current.enabled).toBe(false);
    expect(callsTo("/api/push/status")).toHaveLength(0);
  });

  it("the switch shows this iPhone on without asking about the rest of the business", async () => {
    rememberNativeDeviceToken("apns-device-token-1");
    const { result } = await mountHook();

    expect(result.current.enabled).toBe(true);
    expect(callsTo("/api/push/status")).toHaveLength(0);
  });

  it("an iPhone set up before tokens were remembered still reads the business-wide flag", async () => {
    businessWideFlag = true;
    const { result } = await mountHook();

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(callsTo("/api/push/status")).toHaveLength(1);
  });

  it("the switch is off while iOS permission is withheld, whatever this iPhone remembers", async () => {
    rememberNativeDeviceToken("apns-device-token-1");
    mockNativePush.checkPermissions.mockResolvedValue({ receive: "denied" });
    const { result } = await mountHook();

    expect(result.current.enabled).toBe(false);
  });
});
