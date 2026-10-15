import './support/test-env';
process.env.FEATURE_TAP_TO_PAY = 'true';
process.env.ENV_VALIDATION_MODE = 'enforce';

import request from 'supertest';
import * as windcave from '../windcave';
import { signedIn, createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot } from './support/http-harness';

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

async function fixture() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const day = 86_400_000;
  jest.spyOn(storage, 'getOrCreateSubscription').mockResolvedValue({
    status: 'active', lastBillingDate: new Date(Date.now() - day), currentPeriodEnd: new Date(Date.now() + day),
  } as any);
  jest.spyOn(windcave, 'isWindcaveConfigured').mockReturnValue(true);
  const session = jest.spyOn(windcave, 'createAttendedSession').mockResolvedValue({ success: true, sessionId: 'local-session' });
  const submit = jest.spyOn(windcave, 'submitTapToPayToken').mockResolvedValue({ success: true, approved: true, windcaveTransactionId: 'local-payment' });
  const body = { merchantId: owner.merchantId, amount: 5.50, windcaveToken: 'opaque-token' };
  const send = (value: unknown) => request(app).post('/api/transactions/tap-to-pay').set(signedIn(owner)).send(value as any);
  return { app, owner, session, submit, body, send };
}

describe('Tap to Pay validates inputs before provider calls or writes', () => {
  test.each([5.50, '5.50', '5.5', 0.01, 99999999.99])('preserves a valid terminal amount %p', async (amount) => {
    const f = await fixture();
    const result = await f.send({ ...f.body, amount });
    expect(result.status).toBe(200);
    expect(f.session).toHaveBeenCalledWith(Number(amount).toFixed(2), expect.any(String));
    expect((await storage.getTransaction(result.body.transactionId))?.price).toBe(Number(amount).toFixed(2));
  });

  test.each([
    ['merchant suffix', { merchantId: '1abc' }],
    ['fractional merchant', { merchantId: 1.1 }],
    ['unsafe merchant', { merchantId: Number.MAX_SAFE_INTEGER + 1 }],
    ['transaction suffix', { transactionId: '1abc' }],
    ['fractional transaction', { transactionId: 1.1 }],
    ['unsafe transaction', { transactionId: Number.MAX_SAFE_INTEGER + 1 }],
    ['zero transaction', { transactionId: 0 }],
    ['amount suffix', { amount: '5.50abc' }],
    ['Infinity string', { amount: 'Infinity' }],
    ['numeric overflow string', { amount: '9'.repeat(400) }],
    ['outside decimal(10,2)', { amount: 100000000 }],
    ['sub-cent amount', { amount: 5.505 }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -1 }],
    ['exponent string', { amount: '5e2' }],
    ['null amount', { amount: null }],
    ['object token', { windcaveToken: { token: 'unexpected' } }],
    ['blank token', { windcaveToken: '   ' }],
    ['unexpected field', { merchantNet: '0.00' }],
  ])('refuses %s without effects', async (_label, patch) => {
    const f = await fixture();
    const before = storageSnapshot();
    const result = await f.send({ ...f.body, ...patch });
    expect(result.status).toBe(400);
    expect(f.session).not.toHaveBeenCalled();
    expect(f.submit).not.toHaveBeenCalled();
    expect(storageSnapshot()).toBe(before);
  });

  test('uses the named sale price and preserves an opaque token longer than 512 characters', async () => {
    const f = await fixture();
    const sale = await storage.createTransaction({ merchantId: f.owner.merchantId, itemName: 'Stored sale', price: '7.25', status: 'pending', paymentMethod: 'qr_code', splitEnabled: false });
    const lookup = jest.spyOn(storage, 'getTransactionForMerchant');
    const statusWrite = jest.spyOn(storage, 'updateTransactionStatusForMerchant');
    const methodWrite = jest.spyOn(storage, 'updateTransactionPaymentMethodForMerchant');
    const token = 'opaque'.repeat(200);
    const result = await f.send({ ...f.body, transactionId: sale.id, amount: 9.99, windcaveToken: token });
    expect(result.status).toBe(200);
    expect(f.session).toHaveBeenCalledWith('7.25', expect.any(String));
    expect(f.submit).toHaveBeenCalledWith('local-session', token);
    expect(lookup).toHaveBeenCalledWith(sale.id, f.owner.merchantId);
    expect(statusWrite).toHaveBeenCalledWith(sale.id, f.owner.merchantId, 'completed', 'local-payment');
    expect(methodWrite).toHaveBeenCalledWith(sale.id, f.owner.merchantId, 'tap_to_pay');
    expect(await storage.getTransaction(sale.id)).toMatchObject({ status: 'completed', price: '7.25', paymentMethod: 'tap_to_pay' });
  });

  test('requires the new session cookie and CSRF token before charging', async () => {
    const f = await fixture();
    const url = '/api/transactions/tap-to-pay';
    expect((await request(f.app).post(url).send(f.body)).status).toBe(401);
    expect((await request(f.app).post(url).set('Cookie', f.owner.cookie).send(f.body)).status).toBe(403);
    expect(f.session).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });

  test('retains the reconciliation refusal when a scoped post-charge write fails', async () => {
    const f = await fixture();
    const sale = await storage.createTransaction({ merchantId: f.owner.merchantId, itemName: 'Stored sale', price: '7.25', status: 'pending', paymentMethod: 'qr_code', splitEnabled: false });
    jest.spyOn(storage, 'updateTransactionPaymentMethodForMerchant').mockResolvedValueOnce(undefined);
    const result = await f.send({ ...f.body, transactionId: sale.id });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ message: 'Payment outcome needs reconciliation' });
  });

  test.each(['Infinity', '9'.repeat(400), '5abc', '0.00', '5.505', '100000000.00'])(
    'refuses an invalid stored charge amount %p without effects', async (price) => {
      const f = await fixture();
      const sale = await storage.createTransaction({ merchantId: f.owner.merchantId, itemName: 'Stored sale', price, status: 'pending', paymentMethod: 'qr_code', splitEnabled: false });
      const before = storageSnapshot();
      const result = await f.send({ ...f.body, transactionId: sale.id });
      expect(result.status).toBe(400);
      expect(f.session).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
      expect(storageSnapshot()).toBe(before);
    },
  );

  test('foreign and missing transactions receive the same refusal', async () => {
    const f = await fixture(); const other = await createOwnerPrincipal();
    const sale = await storage.createTransaction({ merchantId: other.merchantId, itemName: 'Other sale', price: '7.25', status: 'pending', paymentMethod: 'qr_code', splitEnabled: false });
    const foreign = await f.send({ ...f.body, transactionId: sale.id });
    const missing = await f.send({ ...f.body, transactionId: 999999 });
    expect(foreign.status).toBe(404); expect(missing.status).toBe(404); expect(foreign.body).toEqual(missing.body);
    expect(f.session).not.toHaveBeenCalled();
  });

  test('provider failure preserves the pending sale', async () => {
    const f = await fixture();
    const sale = await storage.createTransaction({ merchantId: f.owner.merchantId, itemName: 'Stored sale', price: '7.25', status: 'pending', paymentMethod: 'qr_code', splitEnabled: false });
    f.submit.mockResolvedValueOnce({ success: false, error: 'synthetic failure' });
    const before = storageSnapshot();
    const result = await f.send({ ...f.body, transactionId: sale.id });
    expect(result.status).toBe(502); expect(storageSnapshot()).toBe(before);
  });
});
