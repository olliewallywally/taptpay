import fs from 'fs';
import { subscriptionHasPaidAccess, renewalPaymentMethodIsReady } from './server/billing-card';

const COLS = "id,merchant_id,tier,status,current_month_transactions,total_lifetime_transactions,month_start_date,billing_frequency,next_billing_date,unbilled_transaction_count,unbilled_amount,cancellation_requested_at,cancellation_effective_date,cancellation_reason,stripe_subscription_id,created_at,updated_at,stripe_customer_id,stripe_payment_method_id,last_billing_date,plan_id,seat_limit,price_cents,current_period_start,current_period_end,pending_plan_id,pending_plan_effective_at,cancel_at_period_end,windcave_card_id,windcave_billing_ref,card_brand,card_last4,card_expiry,failed_payment_count,last_payment_failure_at,last_payment_failure_reason,billing_claim_token,billing_claimed_at".split(",");
const camel = (s:string)=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());

const rows = fs.readFileSync('/tmp/claude-1000/-home-runner-workspace/43fc2657-5cdb-40c1-a803-8d84c7f60a3b/scratchpad/prodsubs.tsv','utf8')
  .split('\n').filter(l=>l.trim())
  .map(l=>{
    const f=l.split('\t'); const o:any={};
    COLS.forEach((c,i)=>{ o[camel(c)] = f[i]==='\\N' ? null : f[i]; });
    return o;
  });

const now = new Date();
console.log('PRODUCTION subscription rows (from neon backup 2026-08-15 05:48)\n');
const out = rows.map(r=>({
  merchant: r.merchantId,
  status: r.status,
  lastBillingDate: r.lastBillingDate ?? 'NULL',
  currentPeriodEnd: r.currentPeriodEnd ? String(r.currentPeriodEnd).slice(0,10) : 'NULL',
  card: r.cardLast4 ?? 'none',
  CAN_TAKE_PAYMENTS: subscriptionHasPaidAccess(r, now),
  renewalCardReady: renewalPaymentMethodIsReady(r, now),
}));
console.table(out);
const blocked = out.filter(o=>!o.CAN_TAKE_PAYMENTS).length;
console.log(`\n${blocked} of ${out.length} production merchants would be BLOCKED from taking payments once this branch deploys.`);
