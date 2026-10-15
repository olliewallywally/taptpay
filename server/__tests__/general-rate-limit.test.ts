import './support/test-env';
import './support/trusted-proxy-env';
import request from 'supertest';
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from './support/http-harness';

beforeEach(() => resetTestStorage());

test('the general limiter groups a /64 and counts signup/payment calls in that same bucket', async () => {
  const { app } = await createTestApp();const owner = await createOwnerPrincipal();
  const board = await storage.createNextTaptStone(owner.merchantId);
  const url = `/api/merchants/${owner.merchantId}/active-transaction?stoneId=${board.id}`;
  for (let i = 0; i < 100; i++) expect((await request(app).get(url).set('X-Forwarded-For', '2001:db8:9911:8822::1')).status).toBe(200);
  expect((await request(app).get(url).set('X-Forwarded-For', '2001:db8:9911:8822::2')).status).toBe(429);
  expect((await request(app).post('/api/merchants/signup').set('X-Forwarded-For', '2001:db8:9911:8822::3').send({})).status).toBe(429);
  expect((await request(app).post('/api/transactions/999999/pay').set('X-Forwarded-For', '2001:db8:9911:8822::4').send({})).status).toBe(429);
  expect((await request(app).get(url).set('X-Forwarded-For', '2001:db8:9911:8823::1')).status).toBe(200);
});

test('spoofed preceding forwarded addresses cannot escape a trusted client bucket', async () => {
  const { app } = await createTestApp();const owner = await createOwnerPrincipal();const board = await storage.createNextTaptStone(owner.merchantId);
  const url = `/api/merchants/${owner.merchantId}/active-transaction?stoneId=${board.id}`;
  for (let i = 0; i < 100; i++) expect((await request(app).get(url).set('X-Forwarded-For', `203.0.113.${i + 1}, ::ffff:198.51.100.44`)).status).toBe(200);
  expect((await request(app).get(url).set('X-Forwarded-For', '203.0.113.222, 198.51.100.44')).status).toBe(429);
});
