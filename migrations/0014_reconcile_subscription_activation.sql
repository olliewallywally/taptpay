-- Reconcile the subscription state introduced by 0013 with the approved
-- catalogue rollout. Email-verified merchants are entitled to an active Solo
-- subscription; card capture and the first charge remain separate operations.
--
-- This is deliberately a new forward migration. 0013 may already be recorded
-- in deployed ledgers and must remain immutable.

BEGIN;

UPDATE merchant_subscriptions AS subscription
SET status = 'active',
    current_period_start = COALESCE(subscription.current_period_start, now()),
    current_period_end = COALESCE(subscription.current_period_end, now() + interval '1 month'),
    next_billing_date = COALESCE(subscription.next_billing_date, now()),
    updated_at = now()
FROM merchants AS merchant
WHERE merchant.id = subscription.merchant_id
  AND merchant.status IN ('verified', 'active')
  AND subscription.status = 'pending';

COMMIT;
