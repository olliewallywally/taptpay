import { insertRefundSchema } from "@shared/schema";
import { MemStorage } from "../storage";

/**
 * R4-T2 (docs/decisions/2026-10-14-r4-t2-refund-operation-schema.md): legacy refunds stay legacy.
 * Every refund gets an operation ID; nothing a legacy writer passes can set operation fields,
 * which only R4-T3's atomic claim may write.
 */
describe("R4-T2: refund operations leave legacy refunds alone", () => {
  it("a legacy refund in memory gets an operation ID and no operation fields", async () => {
    const repo = new MemStorage();
    const refund = await repo.createRefund({ transactionId: 1, merchantId: 1, refundAmount: "10.50" });
    expect(refund.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(refund).toMatchObject({ state: null, amountCents: null, processorXId: null, attemptCount: 0, providerRefundTransactionId: null });
    const other = await repo.createRefund({ transactionId: 1, merchantId: 1, refundAmount: "1.00" });
    expect(other.operationId).not.toBe(refund.operationId);
  });

  it("the legacy insert shape cannot carry operation fields", () => {
    const parsed = insertRefundSchema.parse({ transactionId: 1, merchantId: 1, refundAmount: "1.00",
      state: "succeeded", amountCents: 100, processorXId: "x", providerRefundTransactionId: "r", operationId: "00000000-0000-4000-8000-000000000000" });
    for (const field of ["state", "amountCents", "processorXId", "providerRefundTransactionId", "operationId"]) {
      expect(parsed).not.toHaveProperty(field);
    }
  });
});
