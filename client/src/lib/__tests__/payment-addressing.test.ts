import {
  bindPaymentIdempotencyKey,
  checkoutCompletionEndpoint,
  checkoutResolveEndpoint,
  checkoutSessionEndpoint,
  checkoutSourceForRoute,
  clearPaymentIdempotencyKey,
  currentTokenPaymentAmount,
  currentTokenShareIndex,
  forgetPaymentReturnState,
  getOrCreatePaymentIdempotencyKey,
  paymentReturnDestination,
  paymentIdempotencyKey,
  paymentTokenForReturnState,
  receiptDataEndpoint,
  receiptPdfEndpoint,
  receiptQrEndpoint,
  redactCustomerPaymentAddress,
  rememberPaymentReturnState,
  tokenEntryDestination,
  tokenCompletionRequest,
  tokenPaymentPath,
  tokenSessionRequest,
  tokenSplitEndpoint,
} from "@/lib/payment-addressing";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const token = "a".repeat(43);

describe("discriminated customer payment addressing", () => {
  test("resolves all four checkout source kinds without conflating tokens", () => {
    expect(checkoutSourceForRoute("retail-legacy", { transactionId: "42" })).toEqual({
      kind: "retail-legacy",
      transactionId: 42,
    });
    expect(checkoutSourceForRoute("retail-token", { token })).toEqual({ kind: "retail-token", token });
    expect(checkoutSourceForRoute("invoice-token", { token: "invoice" })).toEqual({ kind: "invoice-token", token: "invoice" });
    expect(checkoutSourceForRoute("quote-token", { token: "quote" })).toEqual({ kind: "quote-token", token: "quote" });
    expect(checkoutSourceForRoute("retail-legacy", { transactionId: "not-an-id" })).toBeNull();
  });

  test("routes resolve, session, and completion by source", () => {
    const legacy = { kind: "retail-legacy" as const, transactionId: 42 };
    const retailToken = { kind: "retail-token" as const, token };
    const invoice = { kind: "invoice-token" as const, token: "invoice" };
    const quote = { kind: "quote-token" as const, token: "quote" };

    expect(checkoutResolveEndpoint(legacy)).toBe("/api/transactions/42");
    expect(checkoutResolveEndpoint(retailToken)).toBe(`/api/pay/t/${token}`);
    expect(checkoutResolveEndpoint(invoice)).toBe("/api/checkout/resolve/invoice");
    expect(checkoutResolveEndpoint(quote)).toBe("/api/trades/quotes/token/quote");

    expect(checkoutSessionEndpoint(legacy)).toBe("/api/transactions/42/pay");
    expect(checkoutSessionEndpoint(retailToken)).toBe(`/api/pay/t/${token}/session`);
    expect(checkoutSessionEndpoint(invoice)).toBe("/api/checkout/invoice/session");
    expect(checkoutCompletionEndpoint(retailToken, "hosted-fields")).toBe(`/api/pay/t/${token}/hosted-fields-complete`);
    expect(checkoutCompletionEndpoint(retailToken, "googlepay")).toBe(`/api/pay/t/${token}/googlepay-complete`);
  });

  test("token session and completion bodies carry one UUID plus the bound share", () => {
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    expect(tokenSessionRequest(idempotencyKey)).toEqual({ idempotencyKey });
    expect(tokenCompletionRequest({
      idempotencyKey,
      sessionId: "session",
      shareIndex: 2,
    }, { paymentMethod: "apple_pay" })).toEqual({
      idempotencyKey,
      sessionId: "session",
      shareIndex: 2,
      paymentMethod: "apple_pay",
    });
  });

  test("token entry and split paths retain only the bearer address", () => {
    expect(tokenEntryDestination({ status: "pending", splitEnabled: false }, token)).toBe(`/checkout/t/${token}`);
    expect(tokenEntryDestination({ status: "pending", splitEnabled: true }, token)).toBe(`/split/t/${token}`);
    expect(tokenEntryDestination({ status: "completed", isSplit: true }, token)).toBe(`/split/t/${token}`);
    expect(tokenSplitEndpoint(token)).toBe(`/api/pay/t/${token}/split`);
    expect(tokenPaymentPath(token, "receipt", 3)).toBe(`/receipt/t/${token}?share=3`);
  });

  test("one UUID survives retries for the current share and rotates only after reconciliation", () => {
    const storage = new MemoryStorage();
    const source = { kind: "retail-token" as const, token };
    const randomUuid = jest.spyOn(global.crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
      .mockReturnValueOnce("33333333-3333-4333-8333-333333333333");

    expect(getOrCreatePaymentIdempotencyKey(source, 1, storage)).toBe("11111111-1111-4111-8111-111111111111");
    expect(paymentIdempotencyKey(source, 1, storage)).toBe("11111111-1111-4111-8111-111111111111");
    expect(getOrCreatePaymentIdempotencyKey(source, 1, storage)).toBe("11111111-1111-4111-8111-111111111111");
    expect(getOrCreatePaymentIdempotencyKey(source, 2, storage)).toBe("22222222-2222-4222-8222-222222222222");
    clearPaymentIdempotencyKey(source, 1, storage);
    expect(paymentIdempotencyKey(source, 1, storage)).toBeNull();
    expect(getOrCreatePaymentIdempotencyKey(source, 1, storage)).toBe("33333333-3333-4333-8333-333333333333");
    randomUuid.mockRestore();
  });

  test("rebinds a durable UUID when the server assigns a newer split share", () => {
    const storage = new MemoryStorage();
    const source = { kind: "retail-token" as const, token };
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    storage.setItem(`taptpay:payment-attempt:v1:retail-token:${token}:1`, idempotencyKey);

    bindPaymentIdempotencyKey(source, 1, 2, idempotencyKey, storage);

    expect(paymentIdempotencyKey(source, 1, storage)).toBeNull();
    expect(paymentIdempotencyKey(source, 2, storage)).toBe(idempotencyKey);
  });

  test("derives a transaction-local share index from token progress", () => {
    expect(currentTokenShareIndex({ isSplit: false })).toBe(0);
    expect(currentTokenShareIndex({ isSplit: true, totalSplits: 4, completedSplits: 0 })).toBe(1);
    expect(currentTokenShareIndex({ isSplit: true, totalSplits: 4, completedSplits: 3 })).toBe(4);
    expect(currentTokenShareIndex({ isSplit: true, totalSplits: 4, completedSplits: 99 })).toBe(4);
  });

  test("computes exact non-divisible current split shares in cents", () => {
    expect(currentTokenPaymentAmount({ price: "100.00", isSplit: false })).toBe("100.00");
    expect(currentTokenPaymentAmount({ price: "100.00", isSplit: true, totalSplits: 3, completedSplits: 0 })).toBe("33.33");
    expect(currentTokenPaymentAmount({ price: "100.00", isSplit: true, totalSplits: 3, completedSplits: 2 })).toBe("33.34");
  });

  test("maps HPP state back to token-only destinations and safely forgets it", () => {
    const storage = new MemoryStorage();
    rememberPaymentReturnState("state", token, storage);
    expect(paymentTokenForReturnState("state", storage)).toBe(token);
    expect(paymentReturnDestination({ outcome: "pending" }, token)).toBeNull();
    expect(paymentReturnDestination({ outcome: "approved", receiptShare: 2 }, token)).toBe(`/receipt/t/${token}?share=2`);
    expect(paymentReturnDestination({ outcome: "declined", receiptShare: null }, token)).toBe(`/pay/t/${token}`);
    expect(paymentReturnDestination({ outcome: "cancelled", receiptShare: null }, token)).toBe(`/pay/t/${token}`);
    forgetPaymentReturnState("state", storage);
    expect(paymentTokenForReturnState("state", storage)).toBeNull();
  });

  test("token receipt, PDF, and QR endpoints never downgrade to numeric APIs", () => {
    const source = { kind: "retail-token" as const, token, share: 2 };
    const paths = [receiptDataEndpoint(source), receiptPdfEndpoint(source), receiptQrEndpoint(source)];
    expect(paths).toEqual([
      `/api/pay/t/${token}/receipt?share=2`,
      `/api/pay/t/${token}/receipt-pdf?share=2`,
      `/api/pay/t/${token}/receipt-qr?share=2`,
    ]);
    for (const path of paths) {
      expect(path).not.toContain("/api/transactions/");
      expect(path).not.toContain("/api/split-payments/");
    }

    const legacy = { kind: "retail-legacy" as const, transactionId: 42, splitPaymentId: 9 };
    expect(receiptDataEndpoint(legacy)).toBe("/api/transactions/42");
    expect(receiptPdfEndpoint(legacy)).toBe("/api/transactions/42/receipt-pdf?splitId=9");
    expect(receiptQrEndpoint(legacy)).toBe("/api/transactions/42/receipt-qr?splitId=9");
  });

  test("redacts token and return-state browser paths before analytics or console logging", () => {
    expect(redactCustomerPaymentAddress(`https://pay.test/checkout/t/${token}?share=2`)).toBe("https://pay.test/checkout/t/:token");
    expect(redactCustomerPaymentAddress(`/api/pay/t/${token}/session`)).toBe("/api/pay/t/:token/session");
    expect(redactCustomerPaymentAddress("/pay/return/secret-state?source=hpp")).toBe("/pay/return/:state");
  });
});
