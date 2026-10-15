import { createHash } from 'node:crypto';
import {
  ENTITLEMENT_SOURCES,
  explicitEntitlementAccess,
  entitlementTime,
  type EntitlementSource,
} from './entitlement-policy';
import { inventoryEntitlements } from './entitlement-inventory';
import type { PreflightClient, PreflightTarget } from './encryption-preflight';
interface PeriodInput {
  subscriptionId: number;
  merchantId: number;
  source: EntitlementSource;
  start: string;
  end: string;
  billingHistoryId?: number;
}
interface RevocationInput {
  entitlementId: string;
  subscriptionId: number;
  merchantId: number;
}
export interface EntitlementManifest {
  version: 1;
  periods: PeriodInput[];
  revocations: RevocationInput[];
}
const fail = (): never => {
  throw Error('R6_ENTITLEMENT_OPERATION_REFUSED');
};
const positive = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 2147483647;
const keys = (v: any, allowed: string[]) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).every(k => allowed.includes(k));
export function parseEntitlementManifest(input: unknown): EntitlementManifest {
  if (!keys(input, ['version', 'periods', 'revocations'])) fail();
  const m = input as EntitlementManifest;
  if (
    m.version !== 1 ||
    !Array.isArray(m.periods) ||
    !Array.isArray(m.revocations) ||
    m.periods.length + m.revocations.length > 500
  )
    fail();
  for (const p of m.periods) {
    if (
      !keys(p, [
        'subscriptionId',
        'merchantId',
        'source',
        'start',
        'end',
        'billingHistoryId',
      ]) ||
      !positive(p.subscriptionId) ||
      !positive(p.merchantId) ||
      !ENTITLEMENT_SOURCES.includes(p.source) ||
      typeof p.start !== 'string' ||
      typeof p.end !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(p.start) ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(p.end) ||
      !Number.isFinite(entitlementTime(p.start)) ||
      !Number.isFinite(entitlementTime(p.end)) ||
      entitlementTime(p.start) >= entitlementTime(p.end) ||
      (p.source === 'paid'
        ? !positive(p.billingHistoryId)
        : p.billingHistoryId !== undefined)
    )
      fail();
    // Reject Date's rollover normalization (for example February30).
    if (
      new Date(p.start).toISOString() !==
        p.start.replace(/Z$/, p.start.includes('.') ? 'Z' : '.000Z') ||
      new Date(p.end).toISOString() !==
        p.end.replace(/Z$/, p.end.includes('.') ? 'Z' : '.000Z')
    )
      fail();
  }
  for (const r of m.revocations)
    if (
      !keys(r, ['entitlementId', 'subscriptionId', 'merchantId']) ||
      !positive(r.subscriptionId) ||
      !positive(r.merchantId) ||
      typeof r.entitlementId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        r.entitlementId
      )
    )
      fail();
  const identities = m.periods
    .map(periodSourceKey)
    .concat(m.revocations.map(r => 'revoke:' + r.entitlementId));
  if (new Set(identities).size !== identities.length) fail();
  return m;
}
function periodSourceKey(p: PeriodInput) {
  return (
    'review:' +
    createHash('sha256')
      .update(
        JSON.stringify([
          p.subscriptionId,
          p.merchantId,
          p.source,
          new Date(p.start).toISOString(),
          new Date(p.end).toISOString(),
          p.billingHistoryId ?? null,
        ])
      )
      .digest('hex')
  );
}
async function boundAccess(
  client: PreflightClient,
  subscriptionId: number,
  merchantId: number,
  now: Date
) {
  const row = (
    await client.query(
      `SELECT s.status,s.current_period_start,s.current_period_end,s.failed_payment_count,
   (SELECT jsonb_build_object('periods',COALESCE(jsonb_agg(jsonb_build_object('source',e.source,'start',e.period_start,'end',e.period_end)),'[]'::jsonb))
    FROM public.subscription_entitlements e WHERE e.subscription_id=s.id AND e.merchant_id=s.merchant_id
     AND e.period_end>current_timestamp-interval '8 days'
     AND NOT EXISTS(SELECT 1 FROM public.subscription_entitlement_revocations r WHERE r.entitlement_id=e.id)) AS entitlement
   FROM public.merchant_subscriptions s WHERE s.id=$1 AND s.merchant_id=$2`,
      [subscriptionId, merchantId]
    )
  ).rows[0];
  if (!row) fail();
  return explicitEntitlementAccess(
    {
      status: row.status,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      failedPaymentCount: row.failed_payment_count,
      entitlement: row.entitlement,
    },
    now
  );
}
export async function operateEntitlements(
  client: PreflightClient,
  target: PreflightTarget,
  input: unknown,
  options: {
    action: 'classify' | 'activate';
    reviewDigest: string;
    execute?: boolean;
    acknowledgeReleaseChecks?: boolean;
  }
) {
  const manifest = parseEntitlementManifest(input),
    execute = options.execute === true;
  if (
    !/^[0-9a-f]{64}$/.test(options.reviewDigest) ||
    !['classify', 'activate'].includes(options.action) ||
    (options.action === 'activate' &&
      (manifest.periods.length + manifest.revocations.length > 0 ||
        (execute && !options.acknowledgeReleaseChecks)))
  )
    fail();
  await client.query(
    execute
      ? 'BEGIN'
      : 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
  );
  try {
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='15s'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query('SET LOCAL search_path=pg_catalog');
    const identity = (
      await client.query(
        'SELECT current_database() AS database,current_timestamp AS now'
      )
    ).rows[0];
    const now = new Date(identity?.now);
    if (
      identity?.database !== target.database ||
      !Number.isFinite(now.getTime())
    )
      fail();
    const control = (
      await client.query(
        'SELECT stage FROM public.subscription_entitlement_control WHERE id=1' +
          (execute ? ' FOR UPDATE' : '')
      )
    ).rows[0];
    if (!control || !['legacy', 'enforced'].includes(control.stage)) fail();
    const affected = [
      ...new Map(
        [...manifest.periods, ...manifest.revocations].map(p => [
          p.subscriptionId,
          p,
        ])
      ).values(),
    ].sort((a, b) => a.subscriptionId - b.subscriptionId);
    const accessBefore = new Map<number, boolean>();
    if (
      execute &&
      control.stage === 'enforced' &&
      options.action === 'classify'
    ) {
      for (const p of affected) {
        if (
          !(
            await client.query(
              'SELECT id FROM public.merchant_subscriptions WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
              [p.subscriptionId, p.merchantId]
            )
          ).rows.length
        )
          fail();
        accessBefore.set(
          p.subscriptionId,
          await boundAccess(client, p.subscriptionId, p.merchantId, now)
        );
      }
    }
    let inserted = 0,
      revoked = 0,
      unchanged = 0;
    if (options.action === 'classify') {
      for (const p of [...manifest.periods].sort(
        (a, b) => a.subscriptionId - b.subscriptionId
      )) {
        const parent = (
          await client.query(
            'SELECT current_period_start,current_period_end FROM public.merchant_subscriptions WHERE id=$1 AND merchant_id=$2' +
              (execute ? ' FOR UPDATE' : ''),
            [p.subscriptionId, p.merchantId]
          )
        ).rows[0];
        if (!parent) fail();
        if (p.source === 'paid') {
          if (
            !(
              await client.query(
                `SELECT 1 FROM public.subscription_billing_history WHERE id=$1 AND subscription_id=$2 AND merchant_id=$3
           AND status='succeeded' AND billing_type='monthly_subscription' AND paid_at IS NOT NULL AND windcave_transaction_id IS NOT NULL AND amount>0
           AND billing_period_start AT TIME ZONE 'UTC'=$4::timestamptz AND billing_period_end AT TIME ZONE 'UTC'=$5::timestamptz`,
                [
                  p.billingHistoryId,
                  p.subscriptionId,
                  p.merchantId,
                  p.start,
                  p.end,
                ]
              )
            ).rows.length
          )
            fail();
        } else if (
          entitlementTime(parent.current_period_start) !==
            entitlementTime(p.start) ||
          entitlementTime(parent.current_period_end) !== entitlementTime(p.end)
        )
          fail();
        const key = periodSourceKey(p);
        const existing = (
          await client.query(
            'SELECT source_key FROM public.subscription_entitlements WHERE source_key=$1 OR ($2::integer IS NOT NULL AND billing_history_id=$2)',
            [key, p.billingHistoryId ?? null]
          )
        ).rows;
        if (existing.length) {
          if (existing.length !== 1 || existing[0].source_key !== key) fail();
          unchanged++;
          continue;
        }
        if (execute)
          await client.query(
            `INSERT INTO public.subscription_entitlements(subscription_id,merchant_id,source,source_key,period_start,period_end,billing_history_id,review_digest)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              p.subscriptionId,
              p.merchantId,
              p.source,
              key,
              p.start,
              p.end,
              p.billingHistoryId ?? null,
              options.reviewDigest,
            ]
          );
        inserted++;
      }
      for (const r of manifest.revocations) {
        const row = (
          await client.query(
            'SELECT id FROM public.subscription_entitlements WHERE id=$1 AND subscription_id=$2 AND merchant_id=$3',
            [r.entitlementId, r.subscriptionId, r.merchantId]
          )
        ).rows[0];
        if (!row) fail();
        if (
          (
            await client.query(
              'SELECT 1 FROM public.subscription_entitlement_revocations WHERE entitlement_id=$1',
              [r.entitlementId]
            )
          ).rows.length
        ) {
          unchanged++;
          continue;
        }
        if (execute)
          await client.query(
            'INSERT INTO public.subscription_entitlement_revocations(entitlement_id,review_digest) VALUES($1,$2)',
            [r.entitlementId, options.reviewDigest]
          );
        revoked++;
      }
    }
    if (options.action === 'activate' && execute) {
      // READ COMMITTED plus these locks sees all earlier committed writes and
      // prevents parent/provenance/coverage changes until comparison+activation commit.
      await client.query(
        'LOCK TABLE public.merchants,public.merchant_subscriptions,public.subscription_entitlements,public.subscription_entitlement_revocations IN SHARE MODE'
      );
    }
    for (const p of affected)
      if (
        accessBefore.get(p.subscriptionId) &&
        !(await boundAccess(client, p.subscriptionId, p.merchantId, now))
      )
        fail();
    const report = await inventoryEntitlements(client, target, 25, {
      inTransaction: true,
    });
    if (execute && control.stage === 'enforced' && !report.safeToActivate)
      fail();
    if (options.action === 'activate') {
      if (!report.safeToActivate) fail();
      if (execute && control.stage === 'legacy')
        await client.query(
          "UPDATE public.subscription_entitlement_control SET stage='enforced',activated_at=clock_timestamp(),review_digest=$1 WHERE id=1 AND stage='legacy'",
          [options.reviewDigest]
        );
    }
    const result = {
      action: options.action,
      executed: execute,
      periods: inserted,
      revocations: revoked,
      unchanged,
      stage:
        options.action === 'activate' && execute ? 'enforced' : control.stage,
      report,
    };
    await client.query(execute ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
