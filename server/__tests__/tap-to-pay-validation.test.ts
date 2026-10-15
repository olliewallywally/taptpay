import './support/test-env';
import request from 'supertest';
import { tapToPayAmountSchema } from '../tap-to-pay-request';
import {
  signedIn,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
  storageSnapshot,
} from './support/http-harness';
beforeEach(() => resetTestStorage());
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
  ['overflow', { amount: '9'.repeat(400) }],
  ['amount capacity', { amount: 100000000 }],
  ['sub-cent', { amount: 5.505 }],
  ['zero amount', { amount: 0 }],
  ['negative amount', { amount: -1 }],
  ['exponent', { amount: '5e2' }],
  ['null amount', { amount: null }],
  ['object token', { windcaveToken: { token: 'invalid' } }],
  ['blank token', { windcaveToken: '   ' }],
  ['unexpected field', { merchantNet: '0.00' }],
])('strict HTTP input refuses %s without effects', async (_label, patch) => {
  const { app } = await createTestApp(),
    owner = await createOwnerPrincipal(),
    before = storageSnapshot();
  const response = await request(app)
    .post('/api/transactions/tap-to-pay')
    .set(signedIn(owner))
    .send({ merchantId: owner.merchantId, amount: '5.50', ...patch });
  expect(response.status).toBe(400);
  expect(storageSnapshot()).toBe(before);
});
test.each([5.5, '5.50', '5.5', 0.01, 99999999.99])(
  'retains strict amount normalization for %p',
  amount => {
    expect(tapToPayAmountSchema.parse(amount)).toBe(Number(amount).toFixed(2));
  }
);
test.each([
  '5.50abc',
  'Infinity',
  '9'.repeat(400),
  100000000,
  5.505,
  0,
  -1,
  '5e2',
  null,
])('refuses malformed amount %p', amount => {
  expect(tapToPayAmountSchema.safeParse(amount).success).toBe(false);
});
test('valid owned attempts stay unavailable without provider, billing or transaction effects', async () => {
  const { app } = await createTestApp(),
    owner = await createOwnerPrincipal();
  const sale = await storage.createTransaction({
    merchantId: owner.merchantId,
    itemName: 'Synthetic sale',
    price: '5.50',
    status: 'pending',
    paymentMethod: 'qr_code',
    splitEnabled: false,
  });
  const before = storageSnapshot(),
    transport = jest.spyOn(globalThis, 'fetch'),
    billing = jest.spyOn(storage, 'getOrCreateSubscription');
  const replies = await Promise.all(
    Array.from({ length: 10 }, () =>
      request(app)
        .post('/api/transactions/tap-to-pay')
        .set(signedIn(owner))
        .send({
          merchantId: owner.merchantId,
          transactionId: sale.id,
          amount: '5.50',
          windcaveToken: 'untrusted-token',
        })
    )
  );
  for (const r of replies) {
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('TAP_TO_PAY_DISABLED');
    expect(r.body.approved).toBeUndefined();
  }
  expect(transport).not.toHaveBeenCalled();
  expect(billing).not.toHaveBeenCalled();
  expect(storageSnapshot()).toBe(before);
});
test('validation, cookie/CSRF and ownership checks remain ahead of unavailability', async () => {
  const { app } = await createTestApp(),
    owner = await createOwnerPrincipal(),
    other = await createOwnerPrincipal();
  const body = { merchantId: owner.merchantId, amount: '5.50' },
    url = '/api/transactions/tap-to-pay';
  expect((await request(app).post(url).send(body)).status).toBe(401);
  expect(
    (await request(app).post(url).set('Cookie', owner.cookie).send(body)).status
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(url)
        .set(signedIn(owner))
        .send({ ...body, amount: '5abc' })
    ).status
  ).toBe(400);
  expect(
    (
      await request(app)
        .post(url)
        .set(signedIn(owner))
        .send({ ...body, merchantId: other.merchantId })
    ).status
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(url)
        .set(signedIn(owner))
        .send({ ...body, transactionId: '1abc' })
    ).status
  ).toBe(400);
});
