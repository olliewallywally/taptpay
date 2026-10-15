import { createWindcaveClient, type WindcaveTransport } from "../windcave-client";

/**
 * R4-T1 (plan v2.2 §11.4; R4 preflight RD-1–RD-3): a refund goes out under the X-ID the
 * caller persisted, is never resent by the client, and counts as refunded only when the
 * provider's reply is strictly a refund of exactly what was asked. A decline or a refusal
 * is the only answer that says money did not move; everything ambiguous is unknown or
 * pending, for reconciliation. Shapes follow Windcave's REST transaction resource; IDs are
 * synthetic. The request field naming the original transaction is unconfirmed (UAT).
 */

const ENDPOINT = "https://uat.windcave.com/api/v1";
const X_ID = "0f3c6a1e9b2d4c7f8a5e1d3b6c9f2a4e";
const REFERENCE = "REFUND_00000000-0000-4000-8000-000000000001";
const REQUEST = { xId: X_ID, originalTransactionId: "0000000a0123456b", amount: "2.50", merchantReference: REFERENCE };

function refund(over: Record<string, unknown> = {}) {
  return {
    id: "0000000a0999999r", username: "SyntheticUser", authorised: true, reCo: "00", responseText: "APPROVED",
    type: "refund", method: "card", amount: "2.50", currency: "NZD", merchantReference: REFERENCE, ...over,
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const raw = (status: number, text: string | null = null) => new Response(text, { status });
function abort(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function harness(replies: Array<Response | Error>, opts: { mode?: "uat" | "disabled" } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport: WindcaveTransport = async (url, init) => {
    calls.push({ url, init });
    const next = replies.shift();
    if (!next) throw new Error("no reply left");
    if (next instanceof Error) throw next;
    return next;
  };
  const audit: Array<{ action: string; details: Record<string, unknown> }> = [];
  const client = createWindcaveClient({
    config: { mode: opts.mode ?? "uat", endpoint: ENDPOINT, username: "SyntheticUser", apiKey: "synthetic-key", publicOrigin: "https://app.example.test" },
    transport, wait: async () => undefined, clock: () => new Date(0), audit: (action, details) => audit.push({ action, details }),
    retryLimit: 3,
  });
  return { client, calls, audit };
}

describe("R4-T1 refund client", () => {
  it("sends the caller's X-ID, once, to the transactions endpoint and does not follow redirects", async () => {
    const { client, calls } = harness([json(201, refund())]);
    await client.createRefund(REQUEST);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ENDPOINT}/transactions`);
    expect(calls[0].init).toMatchObject({ method: "POST", redirect: "manual", headers: expect.objectContaining({ "X-ID": X_ID }) });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      type: "refund", amount: "2.50", currency: "NZD", merchantReference: REFERENCE, transaction2Id: "0000000a0123456b",
    });
  });

  it.each([200, 201])("a %i refund of exactly what was asked is refunded", async (status) => {
    const { client } = harness([json(status, refund())]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "refunded", refundTransactionId: "0000000a0999999r" });
  });

  it("an unauthorised refund of exactly what was asked is declined", async () => {
    const { client } = harness([json(201, refund({ authorised: false, reCo: "51", responseText: "DECLINED" }))]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "declined", refundTransactionId: "0000000a0999999r" });
  });

  it.each([
    ["a purchase instead of a refund", { type: "purchase" }, "type"],
    ["another amount", { amount: "25.00" }, "amount"],
    ["another currency", { currency: "AUD" }, "currency"],
    ["another reference", { merchantReference: "REFUND_other" }, "reference"],
    ["another provider account", { username: "AnotherUser" }, "account"],
  ])("a reply with %s is a mismatch, never refunded or declined", async (_label, over, field) => {
    const { client } = harness([json(201, refund(over))]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "mismatch", field });
  });

  it.each([
    ["no authorised result", refund({ authorised: undefined })],
    ["an inexact amount", refund({ amount: "2.500" })],
    ["no reference", refund({ merchantReference: undefined })],
  ])("a reply with %s is malformed", async (_label, body) => {
    const { client } = harness([json(201, body)]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "malformed" });
  });

  it("a reply that is not JSON is malformed", async () => {
    const { client } = harness([raw(201, "<html>ok</html>")]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "malformed" });
  });

  it("a 202 is polled at its validated self link until final", async () => {
    const self = `${ENDPOINT}/transactions/0000000a0999999r`;
    const { client, calls } = harness([
      json(202, { id: "0000000a0999999r", links: [{ rel: "self", method: "GET", href: self }] }),
      json(202, { id: "0000000a0999999r" }),
      json(200, refund()),
    ]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "refunded", refundTransactionId: "0000000a0999999r" });
    expect(calls.slice(1).map((c) => [c.url, c.init.method, c.init.redirect])).toEqual([[self, "GET", "manual"], [self, "GET", "manual"]]);
  });

  it("a 202 whose self link is on another host is polled at its own ID on the configured endpoint", async () => {
    const { client, calls } = harness([
      json(202, { id: "0000000a0999999r", links: [{ rel: "self", method: "GET", href: "https://elsewhere.example.test/api/v1/transactions/0000000a0999999r" }] }),
      json(200, refund()),
    ]);
    await client.createRefund(REQUEST);
    expect(calls[1].url).toBe(`${ENDPOINT}/transactions/0000000a0999999r`);
  });

  it("a refund still processing after its polls is pending, not declined", async () => {
    const { client } = harness([json(202, { id: "0000000a0999999r" }), json(202, {}), json(202, {}), json(202, {})]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "pending", refundTransactionId: "0000000a0999999r" });
  });

  it("a 202 with no usable ID is pending without polling", async () => {
    const { client, calls } = harness([json(202, { id: "../../sessions/x" })]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "pending" });
    expect(calls).toHaveLength(1);
  });

  it.each<[string, Array<Response | Error>, unknown]>([
    ["a timeout", [abort()], { kind: "unknown", reason: "timeout" }],
    ["a network failure", [new TypeError("fetch failed")], { kind: "unknown", reason: "network" }],
    ["a server error", [raw(500, "error")], { kind: "unknown", reason: "server_error" }],
    ["a redirect", [raw(302)], { kind: "unknown", reason: "unexpected_status" }],
    ["a duplicate-request conflict", [raw(409, "{}")], { kind: "unknown", reason: "unexpected_status" }],
    ["too many requests", [raw(429, "{}")], { kind: "unknown", reason: "unexpected_status" }],
  ])("%s is unknown and is not resent", async (_label, replies, expected) => {
    const { client, calls } = harness(replies);
    await expect(client.createRefund(REQUEST)).resolves.toEqual(expected);
    expect(calls).toHaveLength(1);
  });

  it.each([400, 401, 403, 404, 422])("a %i refusal is rejected", async (status) => {
    const { client } = harness([raw(status, "{\"message\":\"refused\"}")]);
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "rejected", status });
  });

  it.each([
    ["no X-ID", { xId: "" }],
    ["an amount that is not exact", { amount: "2.5000" }],
    ["a zero amount", { amount: "0.00" }],
    ["no original transaction", { originalTransactionId: "" }],
    ["an original transaction that is a path", { originalTransactionId: "../x" }],
    ["no reference", { merchantReference: "" }],
  ])("refuses a request with %s before calling the provider", async (_label, over) => {
    const { client, calls } = harness([]);
    await expect(client.createRefund({ ...REQUEST, ...over })).resolves.toEqual({ kind: "invalid_request" });
    expect(calls).toHaveLength(0);
  });

  it("does nothing while payments are disabled", async () => {
    const { client, calls } = harness([], { mode: "disabled" });
    await expect(client.createRefund(REQUEST)).resolves.toEqual({ kind: "disabled" });
    expect(calls).toHaveLength(0);
  });

  it("audits categories only: no X-ID, reference, transaction IDs or reply text", async () => {
    const { client, audit } = harness([json(201, refund({ merchantReference: "REFUND_other" }))]);
    await client.createRefund(REQUEST);
    const text = JSON.stringify(audit);
    for (const value of [X_ID, REFERENCE, "0000000a0123456b", "0000000a0999999r", "REFUND_other", "APPROVED"]) {
      expect(text).not.toContain(value);
    }
  });
});
