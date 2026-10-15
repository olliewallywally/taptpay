import './support/test-env';
import request from 'supertest';
test('missing configured secret returns 503 before any coordinator or status query', async () => {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    await jest.isolateModulesAsync(async () => {
      const { createTestApp } = await import('./support/http-harness');
      const cron = { run: jest.fn(), status: jest.fn(), stop: jest.fn() };
      const { app } = await createTestApp({ cron });
      expect(
        (
          await request(app)
            .get('/api/internal/cron/status')
            .set('x-cron-secret', 'anything')
        ).status
      ).toBe(503);
      expect(
        (
          await request(app)
            .post('/api/internal/cron')
            .set('x-cron-secret', 'anything')
        ).status
      ).toBe(503);
      expect(cron.run).not.toHaveBeenCalled();
      expect(cron.status).not.toHaveBeenCalled();
    });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
