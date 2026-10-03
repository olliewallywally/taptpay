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
  jest.spyOn(delivery, 'sendTradeQuoteForMerchant').mockResolvedValue({ sent: false, reason: 'no-contact' } as any);
  // One scoped storage call makes the hidden prospect, the quote and its history (R1-T7 S4b2); the
  // answer is the quote read back through the business's scope.
  const made = new Map<string, any>();
  jest.spyOn(storage, 'createQuoteForMerchant').mockImplementation(async (merchantId, _client, data) => {
    const quote = { ...data, id: 'quote-id', merchantId, clientProfileId: clientId, token: 'made-token', status: 'sent' } as any;
    made.set(quote.id, quote);
    return { kind: 'ok', quote, client: { id: clientId, merchantId, status: 'prospect' } as any };
  });
  jest.spyOn(storage, 'getQuoteDeliveryForMerchant').mockImplementation(async (id, merchantId) =>
    made.get(id)?.merchantId === merchantId ? { quote: made.get(id), client: { id: clientId, merchantId } as any } : undefined);
  jest.spyOn(storage, 'recordQuoteDeliveryForMerchant').mockResolvedValue(true);
  jest.spyOn(storage, 'createClientProfileForMerchant');
});
test.each([{ skipClient: true }, { recipient: { name: 'Sam Smith', email: 'sam@example.test', address: '1 Road' } }])('creates a merchant-owned hidden prospect and shareable quote for %j', async mode => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const result = await request(app).post('/api/trades/quotes').set(signedIn(owner)).send({ ...base, ...mode });
  expect(result.status).toBe(201);
  expect(result.body.token).toBeTruthy();
  expect(result.body.totalCents).toBe(10000);
  expect(result.body.clientProfileId).toBe(clientId);
  expect(storage.createQuoteForMerchant).toHaveBeenCalledWith(owner.merchantId,
    { prospect: expect.objectContaining({ email: 'recipient' in mode ? mode.recipient?.email : null, phone: null, preferredChannel: 'email' }) },
    expect.objectContaining({ totalCents: 10000 }));
  expect(storage.createClientProfileForMerchant).not.toHaveBeenCalled();
  // The undelivered quote is logged for the client storage made it for.
  expect(storage.recordQuoteDeliveryForMerchant).toHaveBeenCalledWith('quote-id', owner.merchantId, clientId, { sent: false, reason: 'no-contact' });
});
test('existing client must belong to the merchant; rejection writes nothing', async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  // Another business's client: the scoped read finds it only for its own business.
  const scoped = jest.spyOn(storage, 'getClientProfileForMerchant').mockImplementation(async (id, merchantId) =>
    merchantId === owner.merchantId + 1 ? { id, merchantId } as any : undefined);
  const result = await request(app).post('/api/trades/quotes').set(signedIn(owner)).send({ ...base, clientProfileId: clientId });
  expect(result.status).toBe(404);
  expect(scoped).toHaveBeenCalledWith(clientId, owner.merchantId);
  expect(storage.createClientProfileForMerchant).not.toHaveBeenCalled();
  expect(storage.createQuoteForMerchant).not.toHaveBeenCalled();
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
  expect(storage.createQuoteForMerchant).not.toHaveBeenCalled();
});
