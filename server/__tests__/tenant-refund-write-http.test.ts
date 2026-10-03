import "./support/test-env";
process.env.FEATURE_REFUND_INITIATION = "true";
process.env.ENV_VALIDATION_MODE = "enforce";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn, storageSnapshot } from "./support/http-harness";
import * as windcave from "../windcave";
import { sseBroker } from "../sse-broker";
import * as push from "../push";

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());
async function fixture() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  const row = await storage.createTransaction({ merchantId: owner.merchantId, itemName: "Synthetic", price: "10.00", status: "completed" } as any);
  (storage as any).transactions.get(row.id).windcaveTransactionId = "synthetic-capture";
  jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
  const provider = jest.spyOn(windcave, "createWindcaveRefund").mockResolvedValue({ success: true, refundTransactionId: "synthetic-refund" });
  const send = () => request(app).post(`/api/transactions/${row.id}/refunds`).set(signedIn(owner))
    .send({ refundAmount: "2.00", refundReason: "Synthetic return" });
  return { owner, other, row, provider, send };
}

test("ownership change after lookup refuses reservation before provider/creation", async () => {
  const { owner, other, row, provider, send } = await fixture();
  const read = storage.getTransactionForMerchant.bind(storage);
  let before: string | undefined;
  jest.spyOn(storage, "getTransactionForMerchant").mockImplementation(async (...args) => {
    const result = await read(...args);
    const stale = { ...result! };
    (storage as any).transactions.get(row.id).merchantId = other.merchantId;
    before = storageSnapshot();
    return stale;
  });
  const res = await send();
  expect(res.status).toBe(409);
  expect(provider).not.toHaveBeenCalled();
  expect(storageSnapshot()).toBe(before);
});

test("successful provider result cannot publish when parent ownership changed", async () => {
  const { other, row, provider, send } = await fixture();
  provider.mockImplementation(async () => {
    (storage as any).transactions.get(row.id).merchantId = other.merchantId;
    return { success: true, refundTransactionId: "synthetic-refund" };
  });
  const stream = jest.spyOn(sseBroker, "broadcast");
  const notify = jest.spyOn(push, "sendPushToMerchant");
  const res = await send();
  expect(res.status).toBe(503);
  expect(res.body.code).toBe("REFUND_RECONCILIATION_REQUIRED");
  expect(stream).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
  expect([...((storage as any).refunds.values())][0].status).toBe("pending");
});

test("provider failure cannot release another tenant's balance", async () => {
  const { other, row, provider, send } = await fixture();
  let afterProvider: string | undefined;
  provider.mockImplementation(async () => {
    (storage as any).transactions.get(row.id).merchantId = other.merchantId;
    afterProvider = storageSnapshot();
    return { success: false, error: "Synthetic refusal" };
  });
  const res = await send();
  expect(res.status).toBe(503);
  expect(res.body.code).toBe("REFUND_RECONCILIATION_REQUIRED");
  expect(storageSnapshot()).toBe(afterProvider);
});

test("owner's ordinary refund retains response and balance", async () => {
  const { row, provider, send } = await fixture();
  const res = await send();
  expect(res.status).toBe(200);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(res.body).toMatchObject({ success: true, refund: { status: "completed" }, transaction: { id: row.id, totalRefunded: "2.00" } });
});
