import { inventoryEntitlements } from '../entitlement-inventory';
const target = { host: '127.0.0.1', port: 55440, database: 'owned' };
const now = new Date('2026-10-15T00:00:00Z');
function client(rows: any[], database = 'owned', withoutSubscription = 0) {
  return {
    query: jest.fn(async (q: string) => ({
      rows: q.includes('current_database()')
        ? [{ database, as_of: now }]
        : q.includes('AS merchants')
          ? [
              {
                merchants: String(rows.length + withoutSubscription),
                subscriptions: String(rows.length),
                without_subscription: String(withoutSubscription),
              },
            ]
          : q.includes('FROM public.merchant_subscriptions')
            ? rows
            : [],
    })),
  };
}
const active = (id: number, extra: any = {}) => ({
  id,
  status: 'active',
  current_period_start: new Date('2026-10-01Z'),
  current_period_end: new Date('2026-11-01Z'),
  last_billing_date: '2026-10-01T00:00:00Z',
  next_billing_date: new Date('2026-11-01Z'),
  failed_payment_count: 0,
  token_present: true,
  ...extra,
});
test('merchants with no subscription remain visible and blocked in the current-policy report', async () => {
  const r = await inventoryEntitlements(
    client([active(1)], 'owned', 2),
    target
  );
  expect((r as any).merchantCoverage).toEqual({
    merchants: 3,
    withoutSubscription: 2,
  });
  expect(r.currentGate).toEqual({ allowed: 1, blocked: 2 });
});
test('missing billing dates are unclassified and current access matches the shared gate; after-policy stays pending', async () => {
  const c = client([
    active(1),
    active(2, { last_billing_date: null }),
    active(3, {
      status: 'past_due',
      current_period_end: new Date('2026-10-14Z'),
      next_billing_date: new Date('2026-10-14Z'),
      failed_payment_count: 1,
    }),
    active(4, { status: 'suspended' }),
  ]);
  const report = await inventoryEntitlements(c, target);
  expect(report.subscriptions).toBe(4);
  expect(report.currentGate).toEqual({ allowed: 2, blocked: 2 });
  expect(report.activeWithoutBillingDate).toBe(1);
  expect(report.provenance.unclassified).toBe(4);
  expect(report.proposedGate).toEqual({
    assessment: 'pending_D9',
    blocked: null,
  });
  expect(report.overdue).toBe(1);
  expect(c.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
});
test('counts contain no raw fields or inferred grant/paid approval when claims are malformed', async () => {
  const c = client([
    active(1, {
      status: 'private-status-marker',
      last_billing_date: 'private-date-marker',
      token_present: false,
    }),
    active(2, { last_billing_date: 'invalid-date-claim' }),
  ]);
  const r = await inventoryEntitlements(c, target);
  expect(r.states.unknown).toBe(1);
  expect(r.invalidBillingDateClaims).toBe(2);
  expect(r.missingProviderToken).toBe(1);
  expect(JSON.stringify(r)).not.toMatch(/private-|invalid-date-claim/);
});
test('target mismatch refuses every row projection and still rolls back', async () => {
  const c = client([], 'other');
  await expect(inventoryEntitlements(c, target)).rejects.toThrow(
    'R6_ENTITLEMENT_TARGET_MISMATCH'
  );
  expect(
    c.query.mock.calls.some(([q]) =>
      q.includes('FROM public.merchant_subscriptions')
    )
  ).toBe(false);
  expect(c.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
});
