jest.mock("../config", () => {
  const actual = jest.requireActual("../config");
  return {
    ...actual,
    config: {
      ...actual.config,
      paymentMode: "uat",
      windcave: { ...actual.config.windcave, endpoint: actual.UAT_WINDCAVE_ENDPOINT, username: "SyntheticUser", apiKey: "synthetic-key" },
    },
  };
});

import { createWindcaveSession, queryWindcaveSession } from "../windcave";

/**
 * R2-T1: createWindcaveSession / queryWindcaveSession now run through the injectable
 * client but keep the return shapes the routes read until R2-T5. The one deliberate
 * difference: provider text is no longer carried in error strings (RF-6), and a reply
 * that is not an object is an unknown outcome rather than a thrown error or a decline.
 */

const SESSION_ID = "0000120000000000a1b2c3d4e5f60718";

function reply(status: number, body?: unknown, raw?: string): Response {
  return new Response(raw ?? (body === undefined ? "" : JSON.stringify(body)), { status });
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("queryWindcaveSession", () => {
  it("reads the 0th transaction as before", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(reply(200, { id: SESSION_ID, transactions: [{ id: "0000000c00000001", authorised: true }] }));
    await expect(queryWindcaveSession(SESSION_ID)).resolves.toEqual({ success: true, approved: true, windcaveTransactionId: "0000000c00000001" });
  });

  it("keeps an unauthorised 0th transaction's reading", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(reply(200, { id: SESSION_ID, transactions: [{ id: "0000000c00000002", authorised: false }] }));
    await expect(queryWindcaveSession(SESSION_ID)).resolves.toEqual({ success: true, approved: false, windcaveTransactionId: undefined });
  });

  it.each([["JSON null", "null"], ["a truncated body", "{\"transactions\":["]])("answers %s as unreadable, not as a decline", async (_label, raw) => {
    jest.spyOn(global, "fetch").mockResolvedValue(reply(200, undefined, raw));
    await expect(queryWindcaveSession(SESSION_ID)).resolves.toEqual({ success: false, error: "Unreadable provider response body" });
  });

  it("drops the provider's text from a 4xx error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(reply(404, undefined, "PROVIDER-DETAIL"));
    const result = await queryWindcaveSession(SESSION_ID);
    expect(result).toEqual({ success: false, error: "Windcave 404" });
  });
});

describe("createWindcaveSession", () => {
  const links = [
    { href: `https://uat.windcave.com/api/v1/sessions/${SESSION_ID}`, rel: "self", method: "GET" },
    { href: "https://uat.windcave.com/pxmi3/F0SYNTHETIC", rel: "hpp", method: "REDIRECT" },
    { href: "https://uat.windcave.com/mh/F1SYNTHETIC", rel: "ajaxSubmitCard", method: "AJAX_POST" },
    { href: "https://uat.windcave.com/mh/F2SYNTHETIC", rel: "ajaxSubmitApplePay", method: "AJAX_POST" },
    { href: "https://uat.windcave.com/mh/F3SYNTHETIC", rel: "ajaxSubmitGooglePay", method: "AJAX_POST" },
  ];

  it("maps a created session's links as before", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(reply(202, { id: SESSION_ID, state: "init", links }));
    await expect(createWindcaveSession("x-id", "12.34", "TAPT_ref", "payer@example.test", "https://app.example.test", 7)).resolves.toEqual({
      success: true,
      sessionId: SESSION_ID,
      hppUrl: "https://uat.windcave.com/pxmi3/F0SYNTHETIC",
      ajaxSubmitCardUrl: "https://uat.windcave.com/mh/F1SYNTHETIC",
      ajaxSubmitApplePayUrl: "https://uat.windcave.com/mh/F2SYNTHETIC",
      ajaxSubmitGooglePayUrl: "https://uat.windcave.com/mh/F3SYNTHETIC",
      alreadyComplete: false,
    });
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.callbackUrls.approved).toBe("https://app.example.test/api/windcave/callback?transactionId=7&result=approved");
    expect(body.notificationUrl).toBe("https://app.example.test/api/windcave/notification");
  });

  it("uses a caller's own callback and notification addresses", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(reply(202, { id: SESSION_ID, links }));
    await createWindcaveSession("x-id", "1.00", "RENT-1", "", "https://app.example.test", 0, 0, {
      callbackBase: "https://app.example.test/api/checkout/callback?token=t",
      notificationUrl: "https://app.example.test/api/windcave/rent-notification",
    });
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.callbackUrls.declined).toBe("https://app.example.test/api/checkout/callback?token=t&result=declined");
    expect(body.notificationUrl).toBe("https://app.example.test/api/windcave/rent-notification");
  });

  it("keeps the legacy reading of a duplicate X-ID until R2-T5", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(reply(200, { id: SESSION_ID, transactions: [{ id: "0000000c00000003", authorised: true }] }));
    await expect(createWindcaveSession("x-id", "1.00", "r", "", "https://app.example.test", 1)).resolves.toEqual({
      success: true,
      sessionId: SESSION_ID,
      alreadyComplete: true,
      approved: true,
      windcaveTransactionId: "0000000c00000003",
    });
  });

  it("drops the provider's text from a 4xx error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(reply(400, undefined, "PROVIDER-DETAIL"));
    await expect(createWindcaveSession("x-id", "1.00", "r", "", "https://app.example.test", 1)).resolves.toEqual({ success: false, error: "Windcave 400" });
  });
});
