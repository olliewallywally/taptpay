/*
 * R1-T5d: the pages' side of Sign in with Apple. The server holds every rule; these are the three
 * small things a page does itself: ask whether it is offered, refuse to leave for anywhere but
 * Apple's own sign-in page, and turn a return word into fixed words.
 */
import { APPLE_SIGN_IN_START, appleConnectOutcome, appleSignInOffered, isAppleAuthorizeUrl } from "./apple-sign-in";

const fetchMock = global.fetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => fetchMock.mockReset());

describe("whether Sign in with Apple is offered", () => {
  it("asks the server, with the cookie and never from a cache, and believes only an exact yes", async () => {
    fetchMock.mockResolvedValue(reply(200, { available: true }));
    await expect(appleSignInOffered()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect({ url, method: init.method ?? "GET", credentials: init.credentials, cache: init.cache })
      .toEqual({ url: "/api/auth/apple/available", method: "GET", credentials: "same-origin", cache: "no-store" });
  });

  it.each([
    ["the server says no", () => reply(200, { available: false })],
    ["the answer is not a boolean yes", () => reply(200, { available: "true" })],
    ["the answer says something else", () => reply(200, { apple: true })],
    ["the answer is empty", () => reply(200, null)],
    ["the server refuses", () => reply(503, { available: true })],
    ["the answer is not JSON", () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } })],
  ])("is not offered when %s", async (_what, answer) => {
    fetchMock.mockResolvedValue(answer());
    await expect(appleSignInOffered()).resolves.toBe(false);
  });

  it("is not offered when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(appleSignInOffered()).resolves.toBe(false);
  });
});

describe("where a sign-in starts", () => {
  it("is the server's own start, which sets the starting cookie and sends the browser on to Apple", () => {
    // What the button's one line goes to; the real navigation is the browser check's (scripts/verify-r1-t5-apple-browser.ts).
    expect(APPLE_SIGN_IN_START).toBe("/api/auth/apple");
  });
});

describe("the only address a connect may leave for", () => {
  it("is Apple's own sign-in page, with whatever it is asked", () => {
    expect(isAppleAuthorizeUrl("https://appleid.apple.com/auth/authorize?client_id=nz.taptpay.signin&state=abc&nonce=def")).toBe(true);
    expect(isAppleAuthorizeUrl("https://appleid.apple.com/auth/authorize")).toBe(true);
  });

  it.each([
    ["another site", "https://appleid.apple.com.evil.example/auth/authorize"],
    ["Apple's name in the path of another site", "https://evil.example/appleid.apple.com/auth/authorize"],
    ["Apple's name as the user of another site", "https://appleid.apple.com@evil.example/auth/authorize"],
    ["Apple over http", "http://appleid.apple.com/auth/authorize"],
    ["another page of Apple's", "https://appleid.apple.com/auth/token"],
    ["another Apple host", "https://www.apple.com/auth/authorize"],
    ["a script", "javascript:alert(1)"],
    ["this site", "/settings"],
    ["nothing", ""],
    ["not a string", { url: "https://appleid.apple.com/auth/authorize" }],
    ["undefined", undefined],
  ])("never %s", (_what, value) => {
    expect(isAppleAuthorizeUrl(value)).toBe(false);
  });
});

describe("how a connect ended", () => {
  it("says it is connected for the one word that means so", () => {
    expect(appleConnectOutcome("connected")).toEqual({ connected: true, title: "Apple connected", description: "You can now sign in with Apple." });
  });

  it("has fixed words for each of the seven refusals, none of them a success", () => {
    const words = ["cancelled", "expired", "taken", "has-another", "unavailable", "failed", "try-later"];
    const outcomes = words.map((word) => appleConnectOutcome(word));
    for (const outcome of outcomes) {
      expect(outcome).toMatchObject({ connected: false, title: "Apple was not connected" });
      expect(outcome!.description.length).toBeGreaterThan(10);
    }
    // Each says something of its own.
    expect(new Set(outcomes.map((outcome) => outcome!.description)).size).toBe(words.length);
    expect(appleConnectOutcome("taken")!.description).toBe("That Apple account is already connected to another TaptPay login.");
    expect(appleConnectOutcome("has-another")!.description).toBe("This login already has a different Apple account connected. Disconnect it first.");
  });

  it.each([null, "", "Connected", "connected ", "complete", "constructor", "toString", "__proto__", "<script>alert(1)</script>", "hasOwnProperty"])(
    "says nothing for %p", (word) => {
      expect(appleConnectOutcome(word)).toBeNull();
    });
});
