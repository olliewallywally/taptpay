import "./support/test-env";

import request from "supertest";
import { createAdminPrincipal, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage, storageSnapshot } from "./support/http-harness";
import { observeRefusalEffects } from "./support/refusal-effects";

beforeEach(() => resetTestStorage());

async function setup() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  const transaction = await storage.createTransaction({ merchantId: owner.merchantId, itemName: "Synthetic sale", price: "10.00", status: "pending" } as any);
  return { app, owner, other, transaction };
}

test.each(["cancel", "refunds"])("foreign %s has the same refusal as missing and no effects", async (action) => {
  const { app, other, transaction } = await setup();
  const before = storageSnapshot();
  const effects = observeRefusalEffects();
  try {
    const send = (id: number) => action === "cancel"
      ? request(app).post(`/api/transactions/${id}/cancel`).set(signedIn(other))
      : request(app).get(`/api/transactions/${id}/refunds`).set(signedIn(other));
    const res = await send(transaction.id);
    const missing = await send(999999);
    expect(res.status).toBe(404);
    expect({ status: res.status, body: res.body }).toEqual({ status: missing.status, body: missing.body });
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
  } finally { effects.restore(); }
});

test.each(["owner", "member", "admin"])("%s can cancel; merchants use no global lookup", async (role) => {
  const { app, owner, transaction } = await setup();
  const caller = role === "admin" ? await createAdminPrincipal()
    : role === "member" ? await createMemberPrincipal(owner.merchantId) : owner;
  const globalRead = jest.spyOn(storage, "getTransaction");
  const res = await request(app).post(`/api/transactions/${transaction.id}/cancel`).set(signedIn(caller));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: transaction.id, merchantId: owner.merchantId, status: "cancelled" });
  if (role !== "admin") expect(globalRead).not.toHaveBeenCalled();
  const before = storageSnapshot();
  const effects = observeRefusalEffects();
  try {
    const retry = await request(app).post(`/api/transactions/${transaction.id}/cancel`).set(signedIn(caller));
    expect(retry.status).toBe(400);
    expect(retry.body).toEqual({ message: "Cannot cancel transaction with status: cancelled" });
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
  } finally { effects.restore(); }
});

test.each(["ownership", "completed"])("cancellation refuses a concurrent %s change after the route read", async (change) => {
  const { app, owner, other, transaction } = await setup();
  const held = storage as any;
  const reader = typeof held.getTransactionForMerchant === "function" ? "getTransactionForMerchant" : "getTransaction";
  const original = held[reader].bind(storage);
  let afterChange: string | undefined;
  jest.spyOn(held, reader).mockImplementation(async (...args: any[]) => {
    const row = await original(...args);
    if (!row || row.id !== transaction.id) return row;
    const stale = { ...row };
    const current = held.transactions.get(transaction.id);
    if (change === "ownership") current.merchantId = other.merchantId;
    else { current.status = "completed"; current.completedAt = new Date(0); }
    afterChange = storageSnapshot();
    return stale;
  });
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post(`/api/transactions/${transaction.id}/cancel`).set(signedIn(owner));
    expect(afterChange).toBeDefined();
    expect(res.status).toBe(change === "ownership" ? 404 : 400);
    expect(storageSnapshot()).toBe(afterChange);
    effects.assertNone();
  } finally { effects.restore(); }
});

test("refund read rechecks parent ownership after the route read", async () => {
  const { app, owner, other, transaction } = await setup();
  await storage.createRefund({ transactionId: transaction.id, merchantId: owner.merchantId, refundAmount: "1.00" });
  const held = storage as any;
  const reader = typeof held.getTransactionForMerchant === "function" ? "getTransactionForMerchant" : "getTransaction";
  const original = held[reader].bind(storage);
  let afterChange: string | undefined;
  jest.spyOn(held, reader).mockImplementation(async (...args: any[]) => {
    const row = await original(...args);
    if (!row) return row;
    const stale = { ...row };
    held.transactions.get(transaction.id).merchantId = other.merchantId;
    afterChange = storageSnapshot();
    return stale;
  });
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).get(`/api/transactions/${transaction.id}/refunds`).set(signedIn(owner));
    expect(afterChange).toBeDefined();
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(storageSnapshot()).toBe(afterChange);
    effects.assertNone();
  } finally { effects.restore(); }
});

test.each(["owner", "member"])("%s's refund read never uses a global transaction lookup", async (role) => {
  const { app, owner, transaction } = await setup();
  const refund = await storage.createRefund({ transactionId: transaction.id, merchantId: owner.merchantId, refundAmount: "1.00" });
  const caller = role === "member" ? await createMemberPrincipal(owner.merchantId) : owner;
  const globalRead = jest.spyOn(storage, "getTransaction");
  const res = await request(app).get(`/api/transactions/${transaction.id}/refunds`).set(signedIn(caller));
  expect(res.status).toBe(200);
  expect(res.body.map((row: any) => row.id)).toEqual([refund.id]);
  expect(globalRead).not.toHaveBeenCalled();
});
