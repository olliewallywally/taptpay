import './support/test-env';
import request from 'supertest';
import { signedIn, createOwnerPrincipal, createTestApp, resetTestStorage, storage } from './support/http-harness';
import * as delivery from '../trades-delivery';
import * as billing from '../billing-card';

const base = { lineItems: [{ description: 'Repair', qty: 1, unitPriceCents: 10000, lineTotalCents: 1 }] };
const clientId = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  resetTestStorage();
  jest.spyOn(billing, 'billingCardIsReady').mockReturnValue(true);
  jest.spyOn(delivery, 'sendTradeQuote').mockResolvedValue({ sent: false, reason: 'no-contact' } as any);
  jest.spyOn(storage, 'createClientProfileForMerchant').mockImplementation(async (merchantId, data) => ({ ...data, merchantId, id: clientId }));
  jest.spyOn(storage, 'createQuote').mockImplementation(async data => ({ ...data, id: 'quote-id' }));
  jest.spyOn(storage, 'createJobEvent').mockResolvedValue({} as any);
});
test.each([{ skipClient: true }, { recipient: { name: 'Sam Smith', email: 'sam@example.test', address: '1 Road' } }])('creates a merchant-owned hidden prospect and shareable quote for %j', async mode => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const result = await request(app).post('/api/trades/quotes').set(signedIn(owner)).send({ ...base, ...mode });
  expect(result.status).toBe(201);
  expect(result.body.token).toBeTruthy();
  expect(result.body.totalCents).toBe(10000);
  expect(result.body.clientProfileId).toBe(clientId);
  expect(storage.createClientProfileForMerchant).toHaveBeenCalledWith(owner.merchantId, expect.objectContaining({ status: 'prospect', email: 'recipient' in mode ? mode.recipient?.email : null }));
});
test('existing client must belong to the merchant; rejection writes nothing', async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  jest.spyOn(storage, 'getClientProfile').mockResolvedValue({ id: clientId, merchantId: owner.merchantId + 1 } as any);
  const result = await request(app).post('/api/trades/quotes').set(signedIn(owner)).send({ ...base, clientProfileId: clientId });
  expect(result.status).toBe(404);
  expect(storage.createClientProfileForMerchant).not.toHaveBeenCalled();
  expect(storage.createQuote).not.toHaveBeenCalled();
});
test('billing and invalid client combinations reject before creating prospects', async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const invalid = await request(app).post('/api/trades/quotes').set(signedIn(owner)).send({ ...base, skipClient: true, clientProfileId: clientId });
  expect(invalid.status).toBe(400);
  jest.mocked(billing.billingCardIsReady).mockReturnValue(false);
  const blocked = await request(app).post('/api/trades/quotes').set(signedIn(owner)).send({ ...base, skipClient: true });
  expect(blocked.status).toBe(402);
  expect(storage.createClientProfileForMerchant).not.toHaveBeenCalled();
  expect(storage.createQuote).not.toHaveBeenCalled();
});
