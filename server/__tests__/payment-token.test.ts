import { createPaymentCredential, hashPaymentToken } from "../payment-credential";
import {
  createPaymentReturnState,
  PaymentTokenRateLimiter,
  resolvePaymentToken,
} from "../payment-token";

describe("payment token resolver", () => {
  test("hashes a valid token and returns only its exact transaction", async () => {
    const credential = createPaymentCredential();
    const transaction = { id: 91, paymentTokenHash: credential.hash } as any;
    const lookup = {
      getTransactionByPaymentTokenHash: jest.fn(async (hash: string) =>
        hash === credential.hash ? transaction : undefined,
      ),
    };

    await expect(resolvePaymentToken(lookup, credential.rawToken)).resolves.toBe(transaction);
    expect(lookup.getTransactionByPaymentTokenHash).toHaveBeenCalledWith(
      hashPaymentToken(credential.rawToken),
    );
  });

  test("malformed and unknown credentials share the same undefined result", async () => {
    const lookup = { getTransactionByPaymentTokenHash: jest.fn(async () => undefined) };
    await expect(resolvePaymentToken(lookup, "not-a-token")).resolves.toBeUndefined();
    expect(lookup.getTransactionByPaymentTokenHash).not.toHaveBeenCalled();

    const unknown = createPaymentCredential();
    await expect(resolvePaymentToken(lookup, unknown.rawToken)).resolves.toBeUndefined();
    expect(lookup.getTransactionByPaymentTokenHash).toHaveBeenCalledTimes(1);
  });

  test("return state is an independent 32-byte bearer value stored by digest", () => {
    const token = createPaymentCredential();
    const state = createPaymentReturnState();
    expect(state.rawToken).toHaveLength(43);
    expect(state.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.rawToken).not.toBe(token.rawToken);
    expect(state.hash).toBe(hashPaymentToken(state.rawToken));
  });

  test("derives a stable return state for the same attempt without storing plaintext", () => {
    const first = createPaymentReturnState("attempt-1", "return-state-secret");
    const replay = createPaymentReturnState("attempt-1", "return-state-secret");
    const otherAttempt = createPaymentReturnState("attempt-2", "return-state-secret");

    expect(first.rawToken).toHaveLength(43);
    expect(replay).toEqual(first);
    expect(otherAttempt.rawToken).not.toBe(first.rawToken);
    expect(first.hash).toBe(hashPaymentToken(first.rawToken));
  });

  test("requires both the attempt id and secret for deterministic return state", () => {
    expect(() => createPaymentReturnState("attempt-1")).toThrow(
      "attemptId and serverSecret must be supplied together",
    );
  });
});

describe("dedicated token rate limits", () => {
  test("isolates counters by endpoint family and IP", () => {
    const limiter = new PaymentTokenRateLimiter(1_000, {
      resolve: 2,
      qr: 1,
      session: 1,
      completion: 1,
    });
    expect(limiter.allow("ip-a", "resolve", 0)).toBe(true);
    expect(limiter.allow("ip-a", "resolve", 0)).toBe(true);
    expect(limiter.allow("ip-a", "resolve", 0)).toBe(false);
    expect(limiter.allow("ip-a", "session", 0)).toBe(true);
    expect(limiter.allow("ip-b", "resolve", 0)).toBe(true);
    expect(limiter.allow("ip-a", "resolve", 1_001)).toBe(true);
  });
});
