/*
 * R1-T4 phase E. Log Out on this device: the sign-out is marked as begun before anything is awaited (so
 * no load signs the browser back in while it is on its way), this device's notifications are stopped
 * while its session still stands (the server can then tell whose device it was), and only then is the
 * session ended on the server and forgotten here.
 */
const mockStopThisDevicePush = jest.fn();
jest.mock("../push-device", () => ({ stopThisDevicePush: () => mockStopThisDevicePush() }));

import { forgetThisDeviceSignIn, logOut } from "../log-out";
import { CSRF_HEADER, heldSession, holdSession, releaseSession, signOutPending } from "../session";

const fetchMock = global.fetch as jest.Mock;
const reply = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}), clone() { return this; } });
const OWNER = { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" };

beforeEach(() => {
  fetchMock.mockReset();
  mockStopThisDevicePush.mockReset();
  localStorage.clear();
  releaseSession("business");
});

describe("Log Out on this device", () => {
  it("marks the sign-out as begun at once, stops notifications while still signed in, then ends the session", async () => {
    holdSession("business", OWNER, "page-csrf-token");
    const order: string[] = [];
    mockStopThisDevicePush.mockImplementation(async () => {
      order.push(`push stopped (signed in: ${heldSession("business") !== null}, sign-out begun: ${signOutPending()})`);
    });
    fetchMock.mockImplementation(async (url: string) => {
      order.push(`asked ${url}`);
      return reply(204);
    });

    const done = logOut();
    // Before anything has been awaited:
    expect(signOutPending()).toBe(true);
    await done;

    expect(order).toEqual(["push stopped (signed in: true, sign-out begun: true)", "asked /api/auth/logout"]);
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get(CSRF_HEADER)).toBe("page-csrf-token");
    expect(heldSession("business")).toBeNull();
    expect(signOutPending()).toBe(false);
  });

  it("never throws, and leaves the sign-out owed when the server cannot be reached", async () => {
    holdSession("business", OWNER, "page-csrf-token");
    mockStopThisDevicePush.mockResolvedValue(undefined);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(logOut()).resolves.toBeUndefined();

    expect(heldSession("business")).toBeNull();
    expect(signOutPending()).toBe(true);
  });
});

describe("after 'Sign out of all devices'", () => {
  it("the page only forgets: the server has already ended this session and stopped its devices", () => {
    holdSession("business", OWNER, "page-csrf-token");
    localStorage.setItem("authToken", "kept-from-before-the-switch");

    forgetThisDeviceSignIn();

    expect(heldSession("business")).toBeNull();
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockStopThisDevicePush).not.toHaveBeenCalled();
    expect(signOutPending()).toBe(false);
  });
});
