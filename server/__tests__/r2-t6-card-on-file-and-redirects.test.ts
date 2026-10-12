import "./support/test-env";

// Links are checked against the payment mode's host and callbacks against PUBLIC_ORIGIN.
jest.mock("../config", () => {
  const actual = jest.requireActual("../config");
  return {
    ...actual,
    config: {
      ...actual.config,
      paymentMode: "uat",
      publicOrigin: "https://app.example.test",
      windcave: { ...actual.config.windcave, endpoint: actual.UAT_WINDCAVE_ENDPOINT, username: "SyntheticUser", apiKey: "synthetic-key" },
    },
  };
});

import * as windcave from "../windcave";
import * as securityAuditLog from "../security-audit-log";
import { createWindcaveClient } from "../windcave-client";
import { UAT_WINDCAVE_ENDPOINT } from "../config";

/**
 * R2-T6 (plan v2.2 §9.2, §9.6 exit; the T6 review's blocking issues 2 and 3). The
 * subscription card-on-file flow was outside T1–T5: the card-setup page link was the
 * `hpp` link or else any REDIRECT link, unvalidated, and the callback addresses were not
 * checked; the read-back trusted the first transaction without comparing the session; a
 * stored-card charge was accepted on `authorised` alone. And every transport followed
 * redirects. Shapes follow Windcave's REST pages; IDs are synthetic.
 */

const CALLBACK = "https://app.example.test/api/billing/card/callback?merchantId=22";
const NOTIFY = "https://app.example.test/api/billing/card/notification";
const HPP = "https://uat.windcave.com/pxmi3/EF4C8D1SYNTHETIC";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const sequence = (...responses: Response[]) =>
  jest.fn(async (_url: string, _init: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected provider request");
    return next;
  });

let audit: jest.SpyInstance;
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  audit = jest.spyOn(securityAuditLog, "writeSecurityAuditEvent").mockImplementation(() => undefined);
});

describe("card setup hands the browser only a validated hosted-page link", () => {
  const start = (request: jest.Mock, callback = CALLBACK, notify = NOTIFY) =>
    windcave.createCardStorageSession("card-x-id", "TAPTPAY-CARD-M22", "owner@example.test", callback, notify, { request });

  it("returns the mode's hpp link", async () => {
    const request = sequence(json(202, { id: "session-123", links: [{ rel: "hpp", method: "REDIRECT", href: HPP }] }));
    await expect(start(request)).resolves.toEqual({ success: true, sessionId: "session-123", hppUrl: HPP });
  });

  it.each([
    ["only a REDIRECT link of another relation", [{ rel: "other", method: "REDIRECT", href: "https://pay.example.test/pxmi3/X1" }]],
    ["an hpp link on the production host", [{ rel: "hpp", method: "REDIRECT", href: "https://sec.windcave.com/pxmi3/X1" }]],
    ["an hpp link on a lookalike host", [{ rel: "hpp", method: "REDIRECT", href: "https://uat.windcave.com.example.test/pxmi3/X1" }]],
    ["an hpp link with userinfo", [{ rel: "hpp", method: "REDIRECT", href: "https://user@uat.windcave.com/pxmi3/X1" }]],
    ["two hpp links", [{ rel: "hpp", method: "REDIRECT", href: HPP }, { rel: "hpp", method: "REDIRECT", href: `${HPP}2` }]],
  ])("refuses %s", async (_label, links) => {
    const result = await start(sequence(json(202, { id: "session-123", links })));
    expect(result.success).toBe(false);
    expect(result.hppUrl).toBeUndefined();
  });

  it.each([
    ["a callback on another origin", "https://evil.example.test/api/billing/card/callback?merchantId=22", NOTIFY],
    ["a callback without its query", "https://app.example.test/api/billing/card/callback", NOTIFY],
    ["a notification on another origin", CALLBACK, "https://evil.example.test/api/billing/card/notification"],
  ])("refuses %s before calling the provider", async (_label, callback, notify) => {
    const request = sequence();
    const result = await start(request, callback, notify);
    expect(result.success).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("the card read-back settles only on its own session's unambiguous result", () => {
  const card = { id: "stored-card-token", type: "Visa", cardNumber: "4111 11** **** 4242", dateExpiryMonth: 9, dateExpiryYear: 2031 };

  it("refuses a reply for another session, never approving it", async () => {
    const result = await windcave.queryStoredCardSession("session-mine", {
      request: sequence(json(200, { id: "session-other", transactions: [{ id: "v1", authorised: true, card }] })) as any,
    });
    expect(result).toEqual({ success: false, error: "integrity_mismatch:session" });
    expect(audit).toHaveBeenCalledWith("PROVIDER_OUTCOME_MISMATCH", { field: "session" });
  });

  it("reads a reply whose session is still open as not complete", async () => {
    const result = await windcave.queryStoredCardSession("session-mine", {
      request: sequence(json(200, { id: "session-mine", state: "init", transactions: [] })) as any,
    });
    expect(result).toEqual({ success: true, complete: false });
  });

  it("refuses two authorised transactions as ambiguous", async () => {
    const result = await windcave.queryStoredCardSession("session-mine", {
      request: sequence(json(200, { id: "session-mine", transactions: [{ id: "v1", authorised: true, card }, { id: "v2", authorised: true, card }] })) as any,
    });
    expect(result.success).toBe(false);
    expect(result.approved).toBeUndefined();
  });

  it("takes the one authorised transaction after a declined one", async () => {
    const result = await windcave.queryStoredCardSession("session-mine", {
      request: sequence(json(200, { id: "session-mine", transactions: [{ id: "v1", authorised: false }, { id: "v2", authorised: true, card }] })) as any,
    });
    expect(result).toMatchObject({ success: true, complete: true, approved: true, card: { cardId: "stored-card-token" } });
  });
});

describe("a stored-card charge is checked against what was charged", () => {
  const charge = (request: jest.Mock) =>
    windcave.chargeStoredCard("sub-7-2026-08-01", "card-1", "7.99", "TAPTPAY-SOLO-M22-2026-08-01", { request: request as any, wait: async () => undefined });
  const approval = (over: Record<string, unknown> = {}) =>
    ({ id: "transaction-123", authorised: true, type: "purchase", amount: "7.99", currency: "NZD", merchantReference: "TAPTPAY-SOLO-M22-2026-08-01", ...over });

  it("approves a reply that matches every field it carries", async () => {
    await expect(charge(sequence(json(200, approval())))).resolves.toMatchObject({ success: true, approved: true, windcaveTransactionId: "transaction-123" });
  });

  it.each([
    ["the amount", { amount: "0.01" }, "amount"],
    ["an amount that is not exact", { amount: "7.990" }, "amount"],
    ["the currency", { currency: "AUD" }, "currency"],
    ["the reference", { merchantReference: "TAPTPAY-SOLO-M23-2026-08-01" }, "reference"],
    ["the type", { type: "refund" }, "type"],
  ])("refuses a reply that differs in %s, as neither approved nor declined", async (_label, over, field) => {
    const result = await charge(sequence(json(200, approval(over))));
    expect(result).toMatchObject({ success: false, error: `integrity_mismatch:${field}` });
    expect(result.approved).toBeUndefined();
    expect(audit).toHaveBeenCalledWith("PROVIDER_OUTCOME_MISMATCH", { field });
  });

  it("checks a polled final reply too", async () => {
    const result = await charge(sequence(json(202, { id: "transaction-123" }), json(200, approval({ amount: "79.90" }))));
    expect(result).toMatchObject({ success: false, error: "integrity_mismatch:amount" });
  });

  it("a declined reply that differs is not a decline either", async () => {
    const result = await charge(sequence(json(200, approval({ authorised: false, merchantReference: "OTHER" }))));
    expect(result).toMatchObject({ success: false, error: "integrity_mismatch:reference" });
  });
});

describe("provider redirects are never followed", () => {
  it("the session client asks its transport not to follow, and reads a redirect as unknown", async () => {
    const transport = jest.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 302, headers: { Location: "https://elsewhere.example.test/" } }));
    const client = createWindcaveClient({
      config: { mode: "uat", endpoint: UAT_WINDCAVE_ENDPOINT, username: "u", apiKey: "k", publicOrigin: "https://app.example.test" },
      transport, wait: async () => undefined, clock: () => new Date(0), audit: () => undefined, retryLimit: 0,
    });

    await expect(client.querySession("session-1")).resolves.toEqual({ kind: "unknown", reason: "unexpected_status" });
    expect(transport.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it.each([
    ["card setup", (request: jest.Mock) => windcave.createCardStorageSession("x", "R", "e@example.test", CALLBACK, NOTIFY, { request: request as any })],
    ["card read-back", (request: jest.Mock) => windcave.queryStoredCardSession("session-1", { request: request as any })],
    ["stored-card charge", (request: jest.Mock) => windcave.chargeStoredCard("x", "card-1", "7.99", "R", { request: request as any, wait: async () => undefined })],
  ])("the %s request does not follow redirects", async (_label, call) => {
    const request = jest.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 302 }));
    const result = await call(request);
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect((result as { approved?: boolean }).approved).toBeUndefined();
  });

  it("the wallet submit does not follow redirects", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 302 }));
    await windcave.submitGooglePayToken("https://uat.windcave.com/mh/FA0F7246SYNTHETIC", { signature: "synthetic" });
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });
});
