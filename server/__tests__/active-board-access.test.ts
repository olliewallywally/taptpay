import './support/test-env';
import request from 'supertest';
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from './support/http-harness';

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

test('inactive, foreign and missing boards return the same refusal', async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  const board = await storage.createTaptStone({ merchantId: owner.merchantId, name: 'Removed board', stoneNumber: 1 });
  const foreign = await storage.createTaptStone({ merchantId: other.merchantId, name: 'Other board', stoneNumber: 1 });
  await storage.deleteTaptStoneForMerchant(board.id, owner.merchantId);
  const lookup = jest.spyOn(storage, 'getActiveTransactionByMerchant');
  const responses = await Promise.all([board.id, foreign.id, 999999].map((id) =>
    request(app).get(`/api/merchants/${owner.merchantId}/active-transaction?stoneId=${id}`)));
  for (const response of responses) {
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Payment board not found' });
  }
  expect(lookup).not.toHaveBeenCalled();
});

test('a foreign transaction from storage is hidden like an absent transaction', async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  const board = await storage.createTaptStone({ merchantId: owner.merchantId, name: 'Live board', stoneNumber: 1 });
  const sale = await storage.createTransaction({ merchantId: other.merchantId, taptStoneId: board.id,
    itemName: 'Other sale', price: '1.00', status: 'pending', paymentMethod: 'qr_code', splitEnabled: false });
  const lookup = jest.spyOn(storage, 'getActiveTransactionByMerchant').mockResolvedValueOnce(sale);
  const url = `/api/merchants/${owner.merchantId}/active-transaction?stoneId=${board.id}`;
  const foreign = await request(app).get(url);
  lookup.mockResolvedValueOnce(undefined);
  const missing = await request(app).get(url);
  expect(foreign.status).toBe(200);
  expect(foreign.body).toBeNull();
  expect(foreign.body).toEqual(missing.body);
  expect(missing.status).toBe(200);
});
