import {
  cronMetrics,
  cronJobDisposition,
  CRON_JOB_NAMES,
} from '../cron-contract';
test('history retains only bounded fixed count/boolean fields without invoking getters or serializing payloads', () => {
  const getter = jest.fn(() => {
    throw Error('private-getter');
  });
  const result: any = {
    generated: 3,
    errors: 0,
    scannerAvailable: true,
    providerSessionId: 'private-session',
    body: { token: 'private-token' },
  };
  Object.defineProperty(result, 'sent', {
    enumerable: true,
    configurable: true,
    get: getter,
  });
  expect(() => cronMetrics(result)).toThrow('invalid_job_result');
  expect(getter).not.toHaveBeenCalled();
  delete result.sent;
  expect(cronMetrics(result)).toEqual({
    generated: 3,
    errors: 0,
    scannerAvailable: true,
  });
  expect(JSON.stringify(cronMetrics(result))).not.toContain('private-');
});
test.each([-1, NaN, Infinity, 0.5, 2147483648, '3', null])(
  'invalid numeric metrics fail closed: %p',
  value => {
    expect(() => cronMetrics({ generated: value })).toThrow(
      'invalid_job_result'
    );
  }
);
test('confirmed billing declines are business outcomes; unsafe uncertainty is held and safe maintenance can retry', () => {
  expect(
    cronJobDisposition('subscriptionBilling', {
      charged: 0,
      failed: 2,
      errors: 0,
    })
  ).toBe('succeeded');
  expect(cronJobDisposition('subscriptionBilling', { errors: 1 })).toBe(
    'failed'
  );
  expect(cronJobDisposition('dispatch', { failed: 2, errors: 0 })).toBe(
    'succeeded'
  );
  expect(cronJobDisposition('dispatch', { uncertain: 1 })).toBe('held');
  expect(cronJobDisposition('reminders', { errors: 1 })).toBe('held');
  expect(cronJobDisposition('uploadScans', { scannerAvailable: false })).toBe(
    'failed'
  );
  expect(CRON_JOB_NAMES).toHaveLength(12);
});
