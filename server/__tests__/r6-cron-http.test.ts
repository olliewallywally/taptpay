import './support/test-env';
import request from 'supertest';
import crypto from 'node:crypto';
import {
  createTestApp,
  cronHeader,
  resetTestStorage,
} from './support/http-harness';
beforeEach(() => resetTestStorage());
function fixture() {
  const cron = {
    run: jest.fn(),
    status: jest.fn(async () => ({
      configured: true,
      running: false,
      startedAt: null,
      counts: { heldJobs: 0 },
    })),
    stop: jest.fn(),
  };
  return cron;
}
test('missing and wrong cron header never reach coordination or ops queries', async () => {
  const cron = fixture(),
    { app } = await createTestApp({ cron });
  expect((await request(app).post('/api/internal/cron')).status).toBe(401);
  expect(
    (
      await request(app)
        .get('/api/internal/cron/status')
        .set('x-cron-secret', 'wrong')
    ).status
  ).toBe(401);
  expect(cron.run).not.toHaveBeenCalled();
  expect(cron.status).not.toHaveBeenCalled();
});
test('authenticated status uses durable ops data, timing-safe comparison and no-store', async () => {
  const cron = fixture(),
    compare = jest.spyOn(crypto, 'timingSafeEqual'),
    { app } = await createTestApp({ cron });
  try {
    const response = await request(app)
      .get('/api/internal/cron/status')
      .set(cronHeader());
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(cron.status).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalled();
  } finally {
    compare.mockRestore();
  }
});
test.each([
  ['busy', 409],
  ['unavailable', 503],
] as const)(
  'coordinator %s fails closed before any uncoordinated pass',
  async (kind, status) => {
    const cron = fixture();
    cron.run.mockResolvedValue({ kind });
    const { app } = await createTestApp({ cron });
    const response = await request(app)
      .post('/api/internal/cron')
      .set(cronHeader());
    expect(response.status).toBe(status);
    expect(cron.run).toHaveBeenCalledTimes(1);
    const jobs = cron.run.mock.calls[0][0];
    expect(jobs).toHaveLength(12);
    expect(jobs[0].name).toBe('subscriptionBilling');
  }
);
test('coordinator/ops errors expose neither raw database messages nor credentials', async () => {
  const cron = fixture();
  cron.status.mockRejectedValue(new Error('private-database-credential'));
  const { app } = await createTestApp({ cron });
  const response = await request(app)
    .get('/api/internal/cron/status')
    .set(cronHeader());
  expect(response.status).toBe(503);
  expect(JSON.stringify(response.body)).not.toContain('private-');
});
test('an unavailable durable backend never falls back to process-local cron execution', async () => {
  const { app } = await createTestApp({ cron: undefined });
  expect(
    (await request(app).post('/api/internal/cron').set(cronHeader())).status
  ).toBe(503);
  expect(
    (await request(app).get('/api/internal/cron/status').set(cronHeader()))
      .status
  ).toBe(503);
});
