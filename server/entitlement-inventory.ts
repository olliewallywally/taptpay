import { subscriptionHasPaidAccess } from './billing-card';
import {
  type PreflightClient,
  type PreflightTarget,
  MAX_PREFLIGHT_BATCH_SIZE,
} from './encryption-preflight';
const STATES = [
  'pending',
  'active',
  'past_due',
  'suspended',
  'cancelled',
  'unknown',
] as const;
export interface EntitlementInventory {
  asOf: string;
  subscriptions: number;
  merchantCoverage: { merchants: number; withoutSubscription: number };
  states: Record<(typeof STATES)[number], number>;
  currentGate: { allowed: number; blocked: number };
  provenance: { unclassified: number };
  activeWithoutBillingDate: number;
  missingProviderToken: number;
  due: number;
  overdue: number;
  periodClaims: {
    current: number;
    expired: number;
    future: number;
    missingOrInvalid: number;
  };
  invalidBillingDateClaims: number;
  proposedGate: { assessment: 'pending_D9'; blocked: null };
}
const date = (value: unknown): Date | undefined => {
  if (!(value instanceof Date) && typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
};
export const ENTITLEMENT_INVENTORY_PAGE = `SELECT id,
 CASE WHEN octet_length(status)<=32 THEN status ELSE 'unknown' END AS status,
 current_period_start,current_period_end,
 CASE WHEN octet_length(last_billing_date)<=128 THEN last_billing_date ELSE CASE WHEN last_billing_date IS NULL THEN NULL ELSE 'invalid_date_claim' END END AS last_billing_date,
 next_billing_date,failed_payment_count,cancel_at_period_end,
 (windcave_card_id IS NOT NULL AND windcave_card_id <> '') AS token_present
 FROM public.merchant_subscriptions WHERE id>$1 ORDER BY id LIMIT $2`;
export const ENTITLEMENT_INVENTORY_COUNTS = `SELECT
 (SELECT count(*)::text FROM public.merchants) AS merchants,
 (SELECT count(*)::text FROM public.merchant_subscriptions) AS subscriptions,
 (SELECT count(*)::text FROM public.merchants m WHERE NOT EXISTS
   (SELECT 1 FROM public.merchant_subscriptions s WHERE s.merchant_id=m.id)) AS without_subscription`;
/** A read-only inventory of claims and the existing gate, never an inferred grant. */
export async function inventoryEntitlements(
  client: PreflightClient,
  target: PreflightTarget,
  batchSize = 25
): Promise<EntitlementInventory> {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_PREFLIGHT_BATCH_SIZE
  )
    throw Error('R6_ENTITLEMENT_INVALID_ARGUMENTS');
  await client.query(
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
  );
  try {
    await client.query('SET LOCAL search_path=pg_catalog');
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    const identity = (
      await client.query(
        'SELECT current_database() AS database,current_timestamp AS as_of'
      )
    ).rows[0];
    if (identity?.database !== target.database)
      throw Error('R6_ENTITLEMENT_TARGET_MISMATCH');
    const now = date(identity.as_of);
    if (!now) throw Error('R6_ENTITLEMENT_INVALID_CLOCK');
    const counts = (await client.query(ENTITLEMENT_INVENTORY_COUNTS)).rows[0];
    const values = ['merchants', 'subscriptions', 'without_subscription'].map(
      key => {
        const raw = counts?.[key];
        if (typeof raw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(raw))
          throw Error('R6_ENTITLEMENT_INVALID_COUNTS');
        const n = Number(raw);
        if (!Number.isSafeInteger(n))
          throw Error('R6_ENTITLEMENT_INVALID_COUNTS');
        return n;
      }
    );
    const [merchants, subscriptions, withoutSubscription] = values;
    if (subscriptions + withoutSubscription !== merchants)
      throw Error('R6_ENTITLEMENT_INVALID_COUNTS');
    const report: EntitlementInventory = {
      asOf: now.toISOString(),
      subscriptions: 0,
      merchantCoverage: { merchants, withoutSubscription },
      states: Object.fromEntries(
        STATES.map(s => [s, 0])
      ) as EntitlementInventory['states'],
      currentGate: { allowed: 0, blocked: withoutSubscription },
      provenance: { unclassified: 0 },
      activeWithoutBillingDate: 0,
      missingProviderToken: 0,
      due: 0,
      overdue: 0,
      periodClaims: { current: 0, expired: 0, future: 0, missingOrInvalid: 0 },
      invalidBillingDateClaims: 0,
      proposedGate: { assessment: 'pending_D9', blocked: null },
    };
    let cursor = 0;
    while (true) {
      const { rows } = await client.query(ENTITLEMENT_INVENTORY_PAGE, [
        cursor,
        batchSize,
      ]);
      if (rows.length > batchSize) throw Error('R6_ENTITLEMENT_INVALID_PAGE');
      for (const row of rows) {
        if (
          !Number.isSafeInteger(row.id) ||
          row.id <= cursor ||
          typeof row.token_present !== 'boolean'
        )
          throw Error('R6_ENTITLEMENT_INVALID_PAGE');
        cursor = row.id;
        const state = STATES.includes(row.status) ? row.status : 'unknown';
        report.states[state as (typeof STATES)[number]]++;
        report.subscriptions++;
        report.provenance.unclassified++;
        const subscription = {
          status: row.status,
          lastBillingDate: row.last_billing_date,
          currentPeriodEnd: row.current_period_end,
          failedPaymentCount: row.failed_payment_count,
        };
        report.currentGate[
          subscriptionHasPaidAccess(subscription, now) ? 'allowed' : 'blocked'
        ]++;
        if (row.status === 'active' && !row.last_billing_date)
          report.activeWithoutBillingDate++;
        if (row.last_billing_date && !date(row.last_billing_date))
          report.invalidBillingDateClaims++;
        if (!row.token_present) report.missingProviderToken++;
        const start = date(row.current_period_start),
          end = date(row.current_period_end);
        if (!start || !end || end <= start)
          report.periodClaims.missingOrInvalid++;
        else if (end <= now) report.periodClaims.expired++;
        else if (start > now) report.periodClaims.future++;
        else report.periodClaims.current++;
        if (
          ['active', 'past_due'].includes(row.status) &&
          row.cancel_at_period_end !== true
        ) {
          const due = date(row.next_billing_date ?? row.current_period_end);
          if (due && due <= now) report.due++;
          if (due && due < now) report.overdue++;
        }
      }
      if (rows.length < batchSize) break;
    }
    if (report.subscriptions !== subscriptions)
      throw Error('R6_ENTITLEMENT_INCONSISTENT_COUNTS');
    return report;
  } finally {
    await client.query('ROLLBACK');
  }
}
