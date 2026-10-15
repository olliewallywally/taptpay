import { createWindcaveClient, type WindcaveTransport } from "../windcave-client";
import { normalizeSessionQuery } from "../windcave-query";
import { verifyWindcaveOutcome, type WindcaveExpectedOutcome, type WindcaveVerificationContext } from "../windcave-verify";

/**
 * R2-T6 — the plan v2.2 §9.6 test matrix, in one place. Every case runs through the real
 * session client (R2-T1, with its link validation from R2-T2), the strict parser (R2-T3)
 * and the shared verifier (R2-T5), with a fake transport and no network or environment
 * variables. Only "approved" and "declined" may settle money; every other row must end
 * as pending, unknown, malformed, unverifiable or a mismatch.
 *
 * Fixtures follow the field set of Windcave's published REST session example; every ID
 * and value is synthetic. They are to be checked against an official UAT reply when one
 * is captured (owner/provider gate). Route-level rows (replay, duplicate provider
 * transaction IDs) cite the suites that drive the routes; see R2-T6 evidence.
 */

const SESSION = "0000120000000000a1b2c3d4e5f60718";
const OTHER_SESSION = "0000120000000000ffffffffffffffff";
const X_ID = "11111111-2222-4333-8444-555555555555";
const REFERENCE = "TAPT_00000000-0000-4000-8000-000000000001";

const EXPECTED: WindcaveExpectedOutcome = {
  sessionId: SESSION, amountCents: 103, currency: "NZD", merchantReference: REFERENCE, providerEnvironment: "uat",
};
const CONTEXT: WindcaveVerificationContext = { providerEnvironment: "uat", accountUsername: "SyntheticUser" };

function transaction(over: Record<string, unknown> = {}) {
  return {
    id: "0000000a0123456b", username: "SyntheticUser", authorised: true, allowRetry: false, reCo: "00",
    responseText: "APPROVED", authCode: "123456", type: "purchase", method: "card", amount: "1.03",
    balanceAmount: "0.00", currency: "NZD", currencyNumeric: 554, clientType: "internet",
    merchantReference: REFERENCE, sessionId: SESSION, isSurcharge: false, liabilityIndicator: "standard",
    card: { cardHolderName: "SYNTHETIC", cardNumber: "411111........11", dateExpiryMonth: "12", dateExpiryYear: "30", type: "visa" },
    ...over,
  };
}

function session(transactions: unknown, over: Record<string, unknown> = {}) {
  return {
    id: SESSION, state: "complete", type: "purchase", amount: "1.03", currency: "NZD", currencyNumeric: 554,
    merchantReference: REFERENCE, methods: ["card"], transactions, ...over,
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const raw = (status: number, text: string | null) => new Response(text, { status });
function abort(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function harness(replies: Array<Response | Error>) {
  const calls: RequestInit[] = [];
  const transport: WindcaveTransport = async (_url, init) => {
    calls.push(init);
    const next = replies.shift();
    if (!next) throw new Error("no reply left");
    if (next instanceof Error) throw next;
    return next;
  };
  const client = createWindcaveClient({
    config: { mode: "uat", endpoint: "https://uat.windcave.com/api/v1", username: "SyntheticUser", apiKey: "synthetic-key", publicOrigin: "https://app.example.test" },
    transport, wait: async () => undefined, clock: () => new Date(0), audit: () => undefined, retryLimit: 1,
  });
  return { client, calls };
}

/** What a completion path sees: the client's outcome, or the verified outcome of its reply. */
async function settle(replies: Array<Response | Error>, expected = EXPECTED, context = CONTEXT) {
  const { client, calls } = harness(replies);
  const outcome = await client.querySession(SESSION);
  const result = outcome.kind === "reply"
    ? verifyWindcaveOutcome(expected, normalizeSessionQuery(outcome.body, SESSION), context)
    : outcome;
  return { result, calls };
}

const SETTLES = new Set(["approved", "declined"]);

describe("§9.6 — querying a session", () => {
  it.each<[string, Array<Response | Error>, unknown, Partial<{ expected: WindcaveExpectedOutcome; context: WindcaveVerificationContext }>?]>([
    ["approved", [json(200, session([transaction()]))], { kind: "approved", providerTransactionId: "0000000a0123456b" }],
    ["declined", [json(200, session([transaction({ authorised: false, reCo: "51", responseText: "DECLINED" })]))], { kind: "declined" }],
    ["cancelled: completed with no transaction", [json(200, session([]))], { kind: "unverifiable", reason: "no_transaction" }],
    ["cancelled or abandoned: never completed", [json(200, session([], { state: "init" }))], { kind: "pending" }],
    ["pending: the provider still processing", [raw(202, null), raw(202, null)], { kind: "pending" }],
    ["missing transaction list", [json(200, { ...session([]), transactions: undefined })], { kind: "unverifiable", reason: "malformed" }],
    ["multiple transactions: two authorised", [json(200, session([transaction(), transaction({ id: "0000000a0123456c" })]))], { kind: "unverifiable", reason: "multiple_authorised" }],
    ["multiple transactions: a decline, then this approval", [json(200, session([transaction({ id: "0000000a01234500", authorised: false }), transaction()]))], { kind: "approved", providerTransactionId: "0000000a0123456b" }],
    ["multiple transactions: another payment's decline in the session", [json(200, session([transaction(), transaction({ id: "0000000a01234500", authorised: false, merchantReference: "TAPT_other" })]))], { kind: "mismatch", field: "reference" }],
    ["amount mismatch", [json(200, session([transaction({ amount: "1.04" })]))], { kind: "mismatch", field: "amount" }],
    ["amount that is not an exact decimal", [json(200, session([transaction({ amount: "1.030" })]))], { kind: "unverifiable", reason: "malformed" }],
    ["currency mismatch", [json(200, session([transaction({ currency: "AUD" })]))], { kind: "mismatch", field: "currency" }],
    ["reference mismatch", [json(200, session([transaction({ merchantReference: "TAPT_other" })]))], { kind: "mismatch", field: "reference" }],
    ["session mismatch: the reply names another session", [json(200, session([transaction()], { id: OTHER_SESSION }))], { kind: "mismatch", field: "session" }],
    ["session mismatch: a transaction of another session", [json(200, session([transaction({ sessionId: OTHER_SESSION })]))], { kind: "mismatch", field: "session" }],
    ["session mismatch: the payment expected another session", [json(200, session([transaction()]))], { kind: "mismatch", field: "session" }, { expected: { ...EXPECTED, sessionId: OTHER_SESSION } }],
    ["type mismatch: an authorised refund", [json(200, session([transaction({ type: "refund" })]))], { kind: "unverifiable", reason: "type" }],
    ["wrong environment", [json(200, session([transaction()]))], { kind: "mismatch", field: "environment" }, { context: { ...CONTEXT, providerEnvironment: "production" } }],
    ["wrong account", [json(200, session([transaction({ username: "AnotherUser" })]))], { kind: "mismatch", field: "account" }],
    ["malformed JSON", [raw(200, "<html>Service unavailable</html>")], { kind: "malformed" }],
    ["redirect", [raw(302, null)], { kind: "unknown", reason: "unexpected_status" }],
    ["timeout", [abort(), abort()], { kind: "unknown", reason: "timeout" }],
    ["provider error", [raw(500, "error"), raw(500, "error")], { kind: "unknown", reason: "server_error" }],
    ["provider refusal", [raw(404, "not found")], { kind: "rejected", status: 404 }],
  ])("%s", async (_label, replies, expected, overrides = {}) => {
    const { result, calls } = await settle(replies, overrides.expected, overrides.context);
    expect(result).toEqual(expected);
    // Only a verified approval or decline may settle money.
    const settles = SETTLES.has((result as { kind: string }).kind);
    expect(settles).toBe(["approved", "declined"].includes((expected as { kind: string }).kind));
    // No request ever follows a redirect.
    for (const init of calls) expect(init.redirect).toBe("manual");
  });

  it("replay: the same reply verified again gives the same answer and holds no state", async () => {
    const first = await settle([json(200, session([transaction()]))]);
    const again = await settle([json(200, session([transaction()]))]);
    expect(again.result).toEqual(first.result);
    // Settling once per payment is the routes' and the attempt engine's job: see
    // r2-t5-split-share-replay, payment-attempt-service (claimFinalization) and
    // payment-attempt-expected-values (one provider transaction, one attempt).
  });
});

describe("§9.6 — creating a session", () => {
  const request = {
    xId: X_ID, amount: "1.03", merchantReference: REFERENCE, customerEmail: "payer@example.test",
    callbackBase: "https://app.example.test/api/pay/return/state?source=hpp", notificationUrl: "https://app.example.test/api/pay/notification/state",
  };
  const created = (links: unknown) => json(202, { id: SESSION, state: "init", links });

  it("unexpected link: a lookalike host or an unknown relation is never handed out", async () => {
    const { client } = harness([created([
      { rel: "self", method: "GET", href: `https://uat.windcave.com/api/v1/sessions/${SESSION}` },
      { rel: "hpp", method: "REDIRECT", href: "https://uat.windcave.com.example.test/pxmi3/EF4C8D1" },
      { rel: "ajaxSubmitCard", method: "AJAX_POST", href: "https://uat.windcave.com/mh/F3A9" },
      { rel: "elsewhere", method: "REDIRECT", href: "https://pay.example.test/pxmi3/X1" },
    ])]);
    await expect(client.createSession(request)).resolves.toEqual({
      kind: "created", sessionId: SESSION, links: { ajaxSubmitCard: "https://uat.windcave.com/mh/F3A9" }, rejectedLinks: 1,
    });
  });

  it("duplicate IDs: an X-ID already used is a duplicate to confirm by query, never an approval", async () => {
    const { client } = harness([json(200, session([transaction()]))]);
    const outcome = await client.createSession(request);
    expect(outcome.kind).toBe("duplicate");
  });

  it("timeout before the request reached the provider: the retry carries the same X-ID", async () => {
    const network = new TypeError("fetch failed");
    const { client, calls } = harness([network, created([{ rel: "hpp", method: "REDIRECT", href: "https://uat.windcave.com/pxmi3/EF4C8D1" }])]);
    await expect(client.createSession(request)).resolves.toMatchObject({ kind: "created", links: { hpp: "https://uat.windcave.com/pxmi3/EF4C8D1" } });
    expect(calls.map((init) => (init.headers as Record<string, string>)["X-ID"])).toEqual([X_ID, X_ID]);
  });

  it("timeout after the provider may have accepted: the retry's duplicate is confirmed by query, never trusted", async () => {
    const { client, calls } = harness([abort(), json(200, session([transaction()]))]);
    await expect(client.createSession(request)).resolves.toMatchObject({ kind: "duplicate" });
    expect(calls.map((init) => (init.headers as Record<string, string>)["X-ID"])).toEqual([X_ID, X_ID]);
  });

  it("timeout with no answer at all is unknown: the provider may have the session", async () => {
    const { client } = harness([abort(), abort()]);
    await expect(client.createSession(request)).resolves.toEqual({ kind: "unknown", reason: "timeout" });
  });

  it("redirect on creation is unknown and not followed", async () => {
    const { client, calls } = harness([raw(302, null)]);
    await expect(client.createSession(request)).resolves.toEqual({ kind: "unknown", reason: "unexpected_status" });
    expect(calls[0].redirect).toBe("manual");
  });
});
