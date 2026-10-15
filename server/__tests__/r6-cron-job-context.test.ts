import './support/test-env';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { getOperationContext } from '../operation-context';
import { runTradesGeneratePass } from '../trades-cron';
import {
  createTestApp,
  cronHeader,
  resetTestStorage,
} from './support/http-harness';
const contexts: ReturnType<typeof getOperationContext>[] = [];
let release!: () => void;
let barrier: Promise<void>;
const observe = () => {
  contexts.push({ ...getOperationContext() });
  return { count: 0 };
};
jest.mock('../property-cron', () => ({
  runGeneratePass: jest.fn(async () => {
    release();
    return observe();
  }),
  runDispatchPass: jest.fn(async () => observe()),
  runOverduePass: jest.fn(async () => observe()),
  runReminderPass: jest.fn(async () => observe()),
}));
jest.mock('../subscription-cron', () => ({
  runSubscriptionBillingPass: jest.fn(async () => {
    await barrier;
    return observe();
  }),
}));
jest.mock('../trades-cron', () => ({
  runTradesGeneratePass: jest.fn(async () => observe()),
}));
jest.mock('../trades-delivery', () => ({
  runTradesDispatchPass: jest.fn(async () => observe()),
  runTradesOverduePass: jest.fn(async () => observe()),
  runTradesReminderPass: jest.fn(async () => observe()),
}));
jest.mock('../daily-payout-notifications', () => ({
  runDailyPayoutNotificationPass: jest.fn(async () => observe()),
}));
jest.mock('../upload-lifecycle', () => ({
  runUploadScanPass: jest.fn(async () => observe()),
  runUploadRetentionPass: jest.fn(async () => observe()),
}));
test('actual cron HTTP trigger gives each pass its own job ID and preserves request context across overlapping passes', async () => {
  resetTestStorage();
  contexts.length = 0;
  barrier = new Promise<void>(r => {
    release = r;
  });
  const { app } = await createTestApp(),
    requestId = randomUUID();
  const response = await request(app)
    .post('/api/internal/cron')
    .set(cronHeader())
    .set('X-Request-Id', requestId);
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(contexts).toHaveLength(12);
  expect(contexts.every(c => c.requestId === requestId)).toBe(true);
  expect(
    contexts.every(
      c => typeof c.jobId === 'string' && /^[0-9a-f-]{36}$/.test(c.jobId)
    )
  ).toBe(true);
  expect(new Set(contexts.map(c => c.jobId)).size).toBe(12);
  expect(getOperationContext()).toEqual({});
});
test('a failing cron pass logs its own sanitized job context and later passes still run', async () => {
  resetTestStorage();
  contexts.length = 0;
  barrier = new Promise<void>(r => {
    release = r;
  });
  (runTradesGeneratePass as jest.Mock).mockRejectedValueOnce(
    new Error('private-upstream-provider-token')
  );
  const logged = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  try {
    const { app } = await createTestApp(),
      requestId = randomUUID();
    const response = await request(app)
      .post('/api/internal/cron')
      .set(cronHeader())
      .set('X-Request-Id', requestId);
    expect(response.status).toBe(207);
    expect(response.body.failedPasses).toEqual(['tradesGenerate']);
    expect(contexts).toHaveLength(11);
    const lines = logged.mock.calls.map(([line]) => line),
      entries = lines.map(line => JSON.parse(line));
    const failed = entries.find(e => e.event === 'cron_pass_failed');
    expect(failed).toMatchObject({
      level: 'error',
      job: 'tradesGenerate',
      requestId,
    });
    expect(failed.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines.join('')).not.toContain('private-');
    expect(contexts.some(c => c.jobId === failed.jobId)).toBe(false);
    expect(getOperationContext()).toEqual({});
  } finally {
    logged.mockRestore();
  }
});
