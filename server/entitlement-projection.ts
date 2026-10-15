import { sql } from 'drizzle-orm';
import type { EntitlementContext } from './entitlement-policy';
/** Same statement/snapshot as the parent; missing control is explicit null.
 * Only potentially live periods are fetched, using the indexed parent/end key.
 * No review/provider identities are put in application subscription projections. */
export const subscriptionEntitlementProjection = sql<EntitlementContext | null>`(
 SELECT jsonb_build_object('stage',c.stage,'periods',COALESCE((
  SELECT jsonb_agg(jsonb_build_object('source',e.source,'start',e.period_start,'end',e.period_end) ORDER BY e.period_start,e.id)
  FROM public.subscription_entitlements e
  WHERE e.subscription_id="merchant_subscriptions"."id" AND e.merchant_id="merchant_subscriptions"."merchant_id"
   AND e.period_end > current_timestamp - interval '8 days'
   AND NOT EXISTS(SELECT 1 FROM public.subscription_entitlement_revocations r WHERE r.entitlement_id=e.id)
 ),'[]'::jsonb)) FROM public.subscription_entitlement_control c WHERE c.id=1
)`;
