import { normalizeSessionQuery, parseCentsExact } from "../windcave-query";

/**
 * R2-T3 (plan v2.2 §9.3; review pass 2): a session query is parsed strictly and money
 * is converted to integer cents without floating point. Approved only for exactly one
 * authorised purchase; declined only when the session is complete and every transaction
 * is unauthorised; everything else is pending, ambiguous, malformed or an integrity
 * mismatch — never a decision. Shapes follow Windcave's REST page; IDs are synthetic.
 */

describe("parseCentsExact", () => {
  it.each([
    ["0", 0], ["0.00", 0], ["1", 100], ["1.5", 150], ["1.05", 105], ["12.34", 1234],
    ["99999999.99", 9_999_999_999], ["100.00", 10_000],
  ])("reads %p as %p cents", (value, cents) => {
    expect(parseCentsExact(value)).toEqual({ ok: true, cents });
  });

  it.each([
    ["more than two fraction digits", "1.005"],
    ["exponent notation", "1e3"],
    ["a sign", "-1.00"],
    ["a plus sign", "+1.00"],
    ["a leading zero", "01.00"],
    ["a trailing point", "1."],
    ["a leading point", ".50"],
    ["a thousands separator", "1,000.00"],
    ["whitespace", " 1.00"],
    ["overflow past the ledger's decimal(10,2)", "100000000.00"],
    ["an empty string", ""],
    ["a number rather than a decimal string", 12.34],
    ["an integer number", 100],
    ["null", null],
    ["NaN text", "NaN"],
    ["Infinity text", "Infinity"],
  ])("rejects %s", (_label, value) => {
    expect(parseCentsExact(value)).toMatchObject({ ok: false });
  });
});

const SESSION_ID = "0000120000000000a1b2c3d4e5f60718";

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "0000000c00000001",
    username: "SyntheticUser",
    authorised: true,
    reCo: "00",
    responseText: "APPROVED",
    type: "purchase",
    amount: "12.34",
    currency: "NZD",
    merchantReference: "TAPT_synthetic-attempt",
    sessionId: SESSION_ID,
    ...overrides,
  };
}

function session(transactions: unknown, overrides: Record<string, unknown> = {}) {
  return { id: SESSION_ID, state: "complete", transactions, ...overrides };
}

describe("normalizeSessionQuery", () => {
  it("approves exactly one authorised purchase, with exact cents and its identities", () => {
    expect(normalizeSessionQuery(session([transaction()]), SESSION_ID)).toEqual({
      kind: "approved",
      sessionId: SESSION_ID,
      transactionCount: 1,
      transaction: {
        id: "0000000c00000001",
        authorised: true,
        type: "purchase",
        amountCents: 1234,
        currency: "NZD",
        merchantReference: "TAPT_synthetic-attempt",
        sessionId: SESSION_ID,
        username: "SyntheticUser",
      },
    });
  });

  it("approves one authorised purchase after an earlier declined attempt in the same session", () => {
    const declined = transaction({ id: "0000000c00000001", authorised: false, reCo: "51" });
    const approved = transaction({ id: "0000000c00000002" });
    expect(normalizeSessionQuery(session([declined, approved]), SESSION_ID)).toMatchObject({
      kind: "approved",
      transactionCount: 2,
      transaction: { id: "0000000c00000002" },
    });
  });

  it.each([
    ["one unauthorised transaction", [transaction({ authorised: false, reCo: "51" })]],
    ["several unauthorised transactions", [transaction({ id: "a1", authorised: false }), transaction({ id: "a2", authorised: false })]],
  ])("declines a complete session with %s", (_label, transactions) => {
    expect(normalizeSessionQuery(session(transactions), SESSION_ID)).toEqual({
      kind: "declined",
      sessionId: SESSION_ID,
      transactionCount: transactions.length,
    });
  });

  it.each(["init", "pending", "processing"])("leaves a session in state %p pending", (state) => {
    expect(normalizeSessionQuery(session([], { state }), SESSION_ID)).toEqual({ kind: "pending", sessionId: SESSION_ID });
  });

  it.each([
    ["no transaction in a complete session", [], "no_transaction"],
    ["two authorised transactions", [transaction({ id: "b1" }), transaction({ id: "b2" })], "multiple_authorised"],
    ["an authorised transaction that is not a purchase", [transaction({ type: "refund" })], "type"],
  ])("calls %s ambiguous, never approved or declined", (_label, transactions, reason) => {
    expect(normalizeSessionQuery(session(transactions), SESSION_ID)).toEqual({ kind: "ambiguous", reason });
  });

  it.each([
    ["the session ID returned", session([transaction()], { id: "0000120000000000ffffffffffffffff" }), "session"],
    ["a transaction's session ID", session([transaction({ sessionId: "0000120000000000ffffffffffffffff" })]), "session"],
  ])("reports a mismatch in %s as an integrity mismatch", (_label, body, reason) => {
    expect(normalizeSessionQuery(body, SESSION_ID)).toEqual({ kind: "integrity_mismatch", reason });
  });

  it.each([
    ["no body", null],
    ["a list", []],
    ["a string", "complete"],
    ["no session ID", { state: "complete", transactions: [transaction()] }],
    ["no state", { id: SESSION_ID, transactions: [transaction()] }],
    ["transactions that are not a list", session({})],
    ["a transaction with no ID", session([transaction({ id: undefined })])],
    ["a transaction whose authorised is not a boolean", session([transaction({ authorised: "true" })])],
    ["a transaction with no type", session([transaction({ type: undefined })])],
    ["an amount with three decimals", session([transaction({ amount: "12.345" })])],
    ["a numeric amount", session([transaction({ amount: 12.34 })])],
    ["a lowercase currency", session([transaction({ currency: "nzd" })])],
    ["a non-ISO currency", session([transaction({ currency: "NZ$" })])],
    ["a non-string merchant reference", session([transaction({ merchantReference: 7 })])],
    ["an unauthorised transaction that is malformed", session([transaction({ authorised: false, amount: "x" })])],
  ])("calls a reply with %s malformed", (_label, body) => {
    expect(normalizeSessionQuery(body, SESSION_ID)).toMatchObject({ kind: "malformed" });
  });
});
