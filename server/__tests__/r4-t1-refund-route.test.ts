import "./support/test-env";
process.env.FEATURE_REFUND_INITIATION = "true";
process.env.ENV_VALIDATION_MODE = "enforce";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn } from "./support/http-harness";
import * as windcave from "../windcave";

/**
 * R4-T1 (plan §11.4; R4 preflight RD-2, RD-3): the refund route lets go of the amount it
 * reserved only when the provider definitely did not move money (a decline, a refusal, or
 * a request never sent). Anything ambiguous — a timeout, a pending refund, a reply that is
 * not this refund — keeps the reservation and the refund unsettled for reconciliation, and
 * says so; it used to release the balance and invite a second refund. The flag that gates
 * refunds (FEATURE_REFUND_INITIATION) stays off in every environment; it is on here only to
 * reach the route.
 */

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

async function fixture(outcome: windcave.RefundResult["outcome"]) {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const row = await storage.createTransaction({ merchantId: owner.merchantId, itemName: "Synthetic", price: "10.00", status: "completed" } as any);
  (storage as any).transactions.get(row.id).windcaveTransactionId = "synthetic-capture";
  jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
  const provider = jest.spyOn(windcave, "createWindcaveRefund").mockResolvedValue({
    success: outcome.kind === "refunded",
    ...(outcome.kind === "refunded" ? { refundTransactionId: outcome.refundTransactionId } : { error: outcome.kind }),
    outcome,
  });
  const send = () => request(app).post(`/api/transactions/${row.id}/refunds`).set(signedIn(owner))
    .send({ refundAmount: "2.00", refundReason: "Synthetic return" });
  const sale = async () => (await storage.getTransaction(row.id))!;
  const refunds = () => [...((storage as any).refunds.values())];
  return { row, provider, send, sale, refunds };
}

it("asks the provider with an X-ID of its own and the capture, amount and reference", async () => {
  const { provider, send } = await fixture({ kind: "refunded", refundTransactionId: "synthetic-refund" });
  const res = await send();
  expect(res.status).toBe(200);
  expect(provider).toHaveBeenCalledWith({
    xId: expect.stringMatching(/^[0-9a-f]{32}$/),
    originalTransactionId: "synthetic-capture",
    amount: "2.00",
    merchantReference: expect.stringMatching(/^REFUND-\d+-\d+$/),
  });
});

it("a verified refund completes it", async () => {
  const { send, refunds, sale } = await fixture({ kind: "refunded", refundTransactionId: "synthetic-refund" });
  expect((await send()).status).toBe(200);
  expect(refunds()[0]).toMatchObject({ status: "completed", windcaveRefundId: "synthetic-refund" });
  expect(await sale()).toMatchObject({ totalRefunded: "2.00" });
});

it.each<[string, windcave.RefundResult["outcome"]]>([
  ["a decline", { kind: "declined" }],
  ["a refusal", { kind: "rejected", status: 400 }],
  ["a request never sent", { kind: "invalid_request" }],
  ["payments disabled", { kind: "disabled" }],
])("%s releases the reservation and fails the refund, with a fixed message", async (_label, outcome) => {
  const { send, refunds, sale } = await fixture(outcome);
  const res = await send();
  expect(res.status).toBe(502);
  expect(res.body).toEqual({ message: "The refund was not made. Please try again." });
  expect(refunds()[0]).toMatchObject({ status: "failed" });
  expect(await sale()).toMatchObject({ status: "completed", totalRefunded: "0.00" });
});

it.each<[string, windcave.RefundResult["outcome"]]>([
  ["a timeout", { kind: "unknown", reason: "timeout" }],
  ["a server error", { kind: "unknown", reason: "server_error" }],
  ["a refund still processing", { kind: "pending", refundTransactionId: "synthetic-refund" }],
  ["a malformed reply", { kind: "malformed" }],
  ["a reply for another amount", { kind: "mismatch", field: "amount" }],
])("%s keeps the reservation and leaves the refund for reconciliation (it used to release it)", async (_label, outcome) => {
  const { send, refunds, sale } = await fixture(outcome);
  const res = await send();
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ code: "REFUND_RECONCILIATION_REQUIRED", message: "The refund is being checked. Do not try again." });
  expect(refunds()[0].status).not.toMatch(/^(failed|completed)$/);
  expect(await sale()).toMatchObject({ totalRefunded: "2.00" });
});
