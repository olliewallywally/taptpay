/** Owner-approved D9 policy. Service periods never depend on card presence. */
export const DUNNING_POLICY = Object.freeze({
  retryDays: Object.freeze([1, 3, 7] as const),
  maxAttempts: 4,
  accessDays: 8,
});
export const ENTITLEMENT_SOURCES = [
  'paid',
  'migration_grant',
  'complimentary',
  'trial',
] as const;
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];
export interface EntitlementPeriod {
  source: EntitlementSource;
  start: string | Date;
  end: string | Date;
}
export interface EntitlementContext {
  stage: 'legacy' | 'enforced';
  periods: EntitlementPeriod[];
}
interface AccessSubscription {
  status?: unknown;
  currentPeriodStart?: unknown;
  currentPeriodEnd?: unknown;
  lastBillingDate?: unknown;
  failedPaymentCount?: unknown;
  entitlement?: unknown;
}
export function entitlementTime(value: unknown): number {
  if (
    !(value instanceof Date) &&
    (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]/.test(value))
  )
    return NaN;
  return new Date(value).getTime();
}
/** Frozen pre-D9 behavior, retained for the before report and staged rollout. */
export function legacySubscriptionAccess(
  subscription: AccessSubscription | null | undefined,
  now = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status === 'past_due') {
    if (
      !subscription.lastBillingDate ||
      !subscription.currentPeriodEnd ||
      Number(subscription.failedPaymentCount ?? 0) >= 4
    )
      return false;
    const end = new Date(subscription.currentPeriodEnd as string | Date);
    if (!Number.isFinite(end.getTime())) return false;
    end.setUTCDate(end.getUTCDate() + 8);
    return now < end;
  }
  if (
    subscription.status !== 'active' ||
    !subscription.lastBillingDate ||
    !subscription.currentPeriodEnd
  )
    return false;
  const end = new Date(subscription.currentPeriodEnd as string | Date);
  return Number.isFinite(end.getTime()) && now < end;
}
/** Explicit recorded periods only. Billing failures cannot erase unpaid grants. */
export function explicitEntitlementAccess(
  subscription: AccessSubscription | null | undefined,
  now = new Date()
): boolean {
  if (
    !subscription ||
    !['active', 'past_due', 'suspended'].includes(
      String(subscription.status)
    ) ||
    !Number.isFinite(now.getTime())
  )
    return false;
  const context = subscription.entitlement as EntitlementContext | undefined;
  if (!context || !Array.isArray(context.periods)) return false;
  for (const period of context.periods) {
    if (!period || !ENTITLEMENT_SOURCES.includes(period.source)) continue;
    const start = entitlementTime(period.start),
      end = entitlementTime(period.end),
      time = now.getTime();
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start >= end ||
      time < start
    )
      continue;
    if (
      time < end &&
      (period.source !== 'paid' || subscription.status !== 'suspended')
    )
      return true;
    const failures = subscription.failedPaymentCount ?? 0;
    if (
      period.source === 'paid' &&
      subscription.status === 'past_due' &&
      Number.isInteger(failures) &&
      Number(failures) >= 0 &&
      Number(failures) < DUNNING_POLICY.maxAttempts &&
      entitlementTime(subscription.currentPeriodStart) === start &&
      entitlementTime(subscription.currentPeriodEnd) === end &&
      time >= end &&
      time < end + DUNNING_POLICY.accessDays * 86400000
    )
      return true;
  }
  return false;
}
export function subscriptionAccess(
  subscription: AccessSubscription | null | undefined,
  now = new Date()
): boolean {
  if (!subscription) return false;
  // Old local harness objects have no policy projection. Production database
  // getters always project it; missing/invalid control returns a null context.
  if (subscription.entitlement === undefined)
    return legacySubscriptionAccess(subscription, now);
  const stage = (subscription.entitlement as EntitlementContext | null)?.stage;
  return stage === 'legacy'
    ? legacySubscriptionAccess(subscription, now)
    : stage === 'enforced'
      ? explicitEntitlementAccess(subscription, now)
      : false;
}
