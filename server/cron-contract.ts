export const CRON_JOB_NAMES = [
  'subscriptionBilling',
  'generate',
  'tradesGenerate',
  'dispatch',
  'tradesDispatch',
  'overdue',
  'tradesOverdue',
  'reminders',
  'tradesReminders',
  'dailyPayoutNotifications',
  'uploadScans',
  'uploadRetention',
] as const;
export type CronJobName = (typeof CRON_JOB_NAMES)[number];
export type CronMetrics = Record<string, number | boolean>;
export const CRON_INTERVAL_MS = 300000,
  CRON_LEASE_MS = 45000,
  CRON_HEARTBEAT_MS = 15000,
  CRON_BUDGET_MS = 240000;
export const CRON_COUNT_FIELDS = [
  'generated',
  'skipped',
  'errors',
  'dispatched',
  'failed',
  'markedOverdue',
  'sent',
  'processed',
  'charged',
  'expired',
  'deleted',
  'scanned',
  'clean',
  'blocked',
  'noVerdict',
  'uncertain',
  'count',
] as const;
export const CRON_BOOLEAN_FIELDS = [
  'scannerAvailable',
  'beforeCutoff',
] as const;
export const cronJobName = (name: unknown): name is CronJobName =>
  typeof name === 'string' &&
  (CRON_JOB_NAMES as readonly string[]).includes(name);
/** Do not spread arbitrary job/provider objects or execute their accessors. */
export function cronMetrics(value: unknown): CronMetrics {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('invalid_job_result');
  const metrics: CronMetrics = {};
  for (const key of [...CRON_COUNT_FIELDS, ...CRON_BOOLEAN_FIELDS]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!('value' in descriptor)) throw Error('invalid_job_result');
    const item = descriptor.value;
    if ((CRON_BOOLEAN_FIELDS as readonly string[]).includes(key)) {
      if (typeof item !== 'boolean') throw Error('invalid_job_result');
    } else if (
      typeof item !== 'number' ||
      !Number.isInteger(item) ||
      item < 0 ||
      item > 2147483647
    )
      throw Error('invalid_job_result');
    metrics[key] = item;
  }
  return metrics;
}
/** Only these existing engines have reviewed replay-safe financial/CAS identities. */
export function cronReplaySafe(name: CronJobName) {
  return ['subscriptionBilling', 'uploadScans', 'uploadRetention'].includes(
    name
  );
}
export function cronJobDisposition(
  name: CronJobName,
  metrics: CronMetrics
): 'succeeded' | 'failed' | 'held' {
  const failure =
    Number(metrics.errors ?? 0) > 0 ||
    Number(metrics.uncertain ?? 0) > 0 ||
    metrics.scannerAvailable === false ||
    Number(metrics.noVerdict ?? 0) > 0 ||
    (name === 'dailyPayoutNotifications' && Number(metrics.failed ?? 0) > 0);
  return failure ? (cronReplaySafe(name) ? 'failed' : 'held') : 'succeeded';
}
