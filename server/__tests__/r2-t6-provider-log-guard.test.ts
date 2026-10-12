import "./support/test-env";

// The real provider module runs; only the network is stubbed. The session client never
// calls the provider while payments are disabled (R2-T1), so this suite runs as UAT.
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

import request from "supertest";
import * as windcave from "../windcave";
import * as securityAuditLog from "../security-audit-log";
import { sseBroker } from "../sse-broker";
import * as push from "../push";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * R2-T6 (plan v2.2 §9.6 exit: "no raw provider body/session/token is logged"; preflight
 * RF-6). Every provider function and every provider route runs here with marker values:
 * a provider session ID, provider reply text, a wallet token and an X-ID. None may reach a
 * log line, a security event, an error string a caller can log or store, or a browser
 * response. Internal sale and invoice IDs may be logged; the provider's may not.
 */

const SESSION = "zzSESSIONMARKzz0000000000000001";
const BODY = "zzBODYMARKzz";
const TOKEN = "zzTOKENMARKzz";
const XID = "zzXIDMARKzz";
const MARKERS = [SESSION, BODY, TOKEN, XID];

// A documented UAT Google Pay submit link (R2-T2).
const UAT_GOOGLE_PAY = "https://uat.windcave.com/mh/FA0F7246SYNTHETIC";

let written: string[];
let audit: jest.SpyInstance;

function captureLogs() {
  written = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      written.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}\n${arg.stack}` : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    });
  }
  audit = jest.spyOn(securityAuditLog, "writeSecurityAuditEvent").mockImplementation(() => undefined);
}

function leaks(text: string) {
  return MARKERS.filter((marker) => text.includes(marker));
}

/** A provider function's result keeps provider IDs a caller stores (its transaction ID), but its
 * error text is what callers log, store as a failure reason or show: that is what is checked. */
const errorOf = (result: { error?: string }) => ({ error: result.error });

/** Everything the run wrote, every security event, and whatever the caller got back. */
function expectNoMarker(...returned: unknown[]) {
  const seen = [...written, ...audit.mock.calls.map((call) => JSON.stringify(call)), ...returned.map((value) => JSON.stringify(value) ?? "")];
  expect(seen.flatMap((text) => leaks(text).map((marker) => `${marker} in: ${text.slice(0, 160)}`))).toEqual([]);
}

const reply = (status: number, body: string) => async () => new Response(body, { status });
const providerText = (status: number) => reply(status, `{"message":"rejected ${BODY}","echo":"${SESSION} ${TOKEN}"}`);
const sessionReply = (body: Record<string, unknown>) =>
  reply(200, JSON.stringify({ id: SESSION, state: "complete", ...body }));

beforeEach(() => {
  resetTestStorage();
  captureLogs();
  jest.spyOn(sseBroker, "broadcast").mockImplementation(() => {});
  jest.spyOn(push, "sendPushToMerchant").mockResolvedValue({ eligibleSubscriptions: 0, attempted: 0, delivered: 0, failed: 0 });
});

describe("the provider module never passes on provider text or IDs", () => {
  const EXPECTED = { sessionId: SESSION, amountCents: 1234, currency: "NZD", merchantReference: "TXN_1", providerEnvironment: "uat" as const };

  it.each([
    ["a 4xx with text", providerText(400)],
    ["a malformed reply", reply(200, `not json ${BODY}`)],
    ["a mismatched approval", sessionReply({ transactions: [{ id: `tx-${BODY}`, authorised: true, type: "purchase", amount: "99.99", currency: "NZD", merchantReference: `ref-${BODY}` }] })],
    // A transport failure is reduced to a category by the T1 client (windcave-client.test.ts);
    // here it would only wait out the wrapper's real retry delays.
  ])("queryWindcaveSession on %s", async (_label, transport) => {
    jest.spyOn(global, "fetch").mockImplementation(transport as any);
    expectNoMarker(errorOf(await windcave.queryWindcaveSession(SESSION, EXPECTED)));
  });

  it("createWindcaveSession on a 4xx with text", async () => {
    jest.spyOn(global, "fetch").mockImplementation(providerText(422) as any);
    expectNoMarker(errorOf(await windcave.createWindcaveSession(XID, "12.34", "TXN_1", "payer@example.test", "https://app.example.test", 1)));
  });

  it.each([
    ["a 4xx with text", providerText(402)],
    ["a transport failure", async () => { throw new Error(`socket closed ${BODY}`); }],
  ])("submitGooglePayToken on %s", async (_label, transport) => {
    jest.spyOn(global, "fetch").mockImplementation(transport as any);
    expectNoMarker(errorOf(await windcave.submitGooglePayToken(UAT_GOOGLE_PAY, { signature: TOKEN })));
  });

  it("createWindcaveRefund on a 4xx with text (refunds are off, R4)", async () => {
    jest.spyOn(global, "fetch").mockImplementation(providerText(400) as any);
    expectNoMarker(errorOf(await windcave.createWindcaveRefund(`tx-${BODY}`, "1.00", "REFUND_1")));
  });

  it("createAttendedSession and submitTapToPayToken on a 4xx with text (Tap to Pay is off, R7)", async () => {
    jest.spyOn(global, "fetch").mockImplementation(providerText(400) as any);
    expectNoMarker(
      errorOf(await windcave.createAttendedSession("1.00", "TAP_1", 0, XID)),
      errorOf(await windcave.submitTapToPayToken(SESSION, TOKEN, 0, XID)),
    );
  });

  it.each([
    ["a 4xx with text", providerText(400)],
    ["a transport failure", async () => { throw new Error(`refused ${BODY}`); }],
  ])("the card-on-file calls on %s", async (_label, transport) => {
    const requestFn = jest.fn(transport as any);
    expectNoMarker(
      errorOf(await windcave.createCardStorageSession(XID, "TAPTPAY-CARD-M1", "owner@example.test", "https://app.example.test/api/billing/card/callback?merchantId=1", "https://app.example.test/api/billing/card/notification", { request: requestFn as any })),
      errorOf(await windcave.queryStoredCardSession(SESSION, { request: requestFn as any })),
      errorOf(await windcave.chargeStoredCard(XID, "card-1", "7.99", "TAPTPAY-SOLO-M1", { request: requestFn as any, wait: async () => undefined })),
    );
  });

  it("a stored-card charge still processing after its polls", async () => {
    const requestFn = jest.fn(reply(202, JSON.stringify({ id: `tx-${BODY}` })) as any);
    expectNoMarker(errorOf(await windcave.chargeStoredCard(XID, "card-1", "7.99", "TAPTPAY-SOLO-M1", { request: requestFn as any, wait: async () => undefined, transactionPollLimit: 1 })));
  });
});

describe("the provider routes never log the provider's session, query or reply", () => {
  async function boundSale() {
    const owner = await createOwnerPrincipal();
    const sale = await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Guard fixture", price: "12.34", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false,
    } as any);
    await storage.updateTransactionWindcaveSession(sale.id, SESSION, "pending", XID);
    return sale;
  }

  async function settle() {
    for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
  }

  it.each([
    ["an unusable reply", providerText(400)],
    ["a mismatched approval", sessionReply({ transactions: [{ id: `tx-${BODY}`, authorised: true, type: "purchase", amount: "1.00", currency: "NZD", merchantReference: `ref-${BODY}` }] })],
  ])("the numbered notification, callback and completion on %s", async (_label, transport) => {
    const { app } = await createTestApp();
    const sale = await boundSale();
    jest.spyOn(global, "fetch").mockImplementation(transport as any);

    const responses = [
      await request(app).get("/api/windcave/notification").query({ sessionid: SESSION, extra: BODY }),
      await request(app).post("/api/windcave/notification").send({ sessionId: SESSION, extra: BODY }),
      await request(app).get("/api/windcave/callback").query({ transactionId: sale.id, sessionid: SESSION }),
      await request(app).get("/api/windcave/callback").query({ transactionId: sale.id, sessionid: SESSION, result: "cancelled" }),
      await request(app).post(`/api/transactions/${sale.id}/hosted-fields-complete`).send({ sessionId: SESSION }),
    ];
    await settle();

    expectNoMarker(...responses.map((r) => ({ status: r.status, body: r.body, text: r.text, location: r.headers.location })));
  });

  it("the numbered notification for a session nobody holds, and one with no session", async () => {
    const { app } = await createTestApp();
    await request(app).get("/api/windcave/notification").query({ sessionid: SESSION });
    await request(app).post("/api/windcave/notification").send({ note: BODY });
    await request(app).get("/api/windcave/callback").query({ sessionid: SESSION, result: BODY });
    await settle();
    expectNoMarker();
  });

  it.each(["/api/windcave/rent-notification", "/api/windcave/trades-notification"])("%s for a session nobody holds, with no session, and on an unusable reply", async (path) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const invoice: any = { id: "prop-inv-1", merchantId: owner.merchantId, status: "sent", amountCents: 1234, splitEnabled: false, windcaveSessionId: SESSION, token: "t" };
    const held = path.includes("rent") ? "getInvoiceRentRequestByWindcaveSessionId" : "getJobInvoiceByWindcaveSessionId";
    jest.spyOn(storage, "getInvoiceRentRequestByWindcaveSessionId").mockResolvedValue(undefined as any);
    jest.spyOn(storage, "getJobInvoiceByWindcaveSessionId").mockResolvedValue(undefined as any);
    jest.spyOn(storage, "getInvoiceSplitSession").mockResolvedValue(undefined as any);
    jest.spyOn(global, "fetch").mockImplementation(providerText(400) as any);

    await request(app).get(path).query({ sessionid: SESSION });
    await request(app).get(path).query({ note: BODY });
    jest.spyOn(storage, held).mockResolvedValue(invoice);
    await request(app).get(path).query({ sessionid: SESSION });
    await settle();

    expectNoMarker();
  });
});
