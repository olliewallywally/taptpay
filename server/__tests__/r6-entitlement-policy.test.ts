import {
  explicitEntitlementAccess,
  DUNNING_POLICY,
} from '../entitlement-policy';
import { billingCardIsReady } from '../billing-card';
const start = '2026-10-01T00:00:00.000Z',
  end = '2026-11-01T00:00:00.000Z';
const sub = (source = 'migration_grant', extra: any = {}) => ({
  status: 'active',
  lastBillingDate: null,
  currentPeriodStart: start,
  currentPeriodEnd: end,
  failedPaymentCount: 0,
  entitlement: { stage: 'enforced', periods: [{ source, start, end }] },
  ...extra,
});
test.each(['paid', 'migration_grant', 'complimentary', 'trial'])(
  '%s uses an explicit inclusive start and exclusive end',
  source => {
    expect(explicitEntitlementAccess(sub(source), new Date(start))).toBe(true);
    expect(
      explicitEntitlementAccess(sub(source), new Date(Date.parse(start) - 1))
    ).toBe(false);
    expect(
      explicitEntitlementAccess(sub(source), new Date(Date.parse(end) - 1))
    ).toBe(true);
    expect(explicitEntitlementAccess(sub(source), new Date(end))).toBe(false);
  }
);
test.each(['past_due', 'suspended'])(
  'a current grant survives %s billing state and exhausted attempts',
  status => {
    const value = sub('migration_grant', { status, failedPaymentCount: 4 });
    expect(billingCardIsReady(value, new Date(start))).toBe(true);
  }
);
test('missing billing date or a current status cannot manufacture a grant', () => {
  expect(
    explicitEntitlementAccess(
      { ...sub(), entitlement: { stage: 'enforced', periods: [] } },
      new Date(start)
    )
  ).toBe(false);
  expect(
    explicitEntitlementAccess(
      { ...sub(), entitlement: undefined },
      new Date(start)
    )
  ).toBe(false);
});
test.each(['unknown', 'dunning_grace'])(
  'untrusted %s provenance cannot grant a current period',
  source => {
    expect(explicitEntitlementAccess(sub(source), new Date(start))).toBe(false);
  }
);
test.each(['cancelled', 'pending', 'private-status'])(
  '%s preserves refusal even with an explicit period',
  status => {
    expect(
      billingCardIsReady(sub('migration_grant', { status }), new Date(start))
    ).toBe(false);
  }
);
test('paid grace is capped at eight UTC days and stops at the fourth failure', () => {
  const value = sub('paid', { status: 'past_due', failedPaymentCount: 1 });
  expect(explicitEntitlementAccess(value, new Date(end))).toBe(true);
  expect(
    explicitEntitlementAccess(value, new Date('2026-11-08T23:59:59.999Z'))
  ).toBe(true);
  expect(
    explicitEntitlementAccess(value, new Date('2026-11-09T00:00:00Z'))
  ).toBe(false);
  expect(
    explicitEntitlementAccess(
      { ...value, failedPaymentCount: 4 },
      new Date(end)
    )
  ).toBe(false);
  expect(DUNNING_POLICY).toEqual({
    retryDays: [1, 3, 7],
    maxAttempts: 4,
    accessDays: 8,
  });
});
test.each(['migration_grant', 'complimentary', 'trial'])(
  'expired %s never manufactures paid grace',
  source => {
    expect(
      explicitEntitlementAccess(
        sub(source, { status: 'past_due', failedPaymentCount: 1 }),
        new Date(end)
      )
    ).toBe(false);
  }
);
test('old paid history cannot grant grace for a different current period', () => {
  expect(
    explicitEntitlementAccess(
      sub('paid', {
        status: 'past_due',
        currentPeriodEnd: '2026-12-01T00:00:00Z',
      }),
      new Date(end)
    )
  ).toBe(false);
});
test.each([null, 'invalid', '2026-09-01T00:00:00Z'])(
  'invalid/reversed period ending %s is refused',
  bad => {
    expect(
      explicitEntitlementAccess(
        {
          ...sub(),
          entitlement: {
            stage: 'enforced',
            periods: [{ source: 'paid', start, end: bad }],
          },
        },
        new Date(start)
      )
    ).toBe(false);
  }
);
test('production invalid control fails closed while explicit legacy mode preserves the old gate', () => {
  const value = sub('paid', { lastBillingDate: start });
  expect(
    billingCardIsReady(
      { ...value, entitlement: { stage: 'invalid', periods: [] } },
      new Date(start)
    )
  ).toBe(false);
  expect(
    billingCardIsReady(
      { ...value, entitlement: { stage: 'legacy', periods: [] } },
      new Date(start)
    )
  ).toBe(true);
});
