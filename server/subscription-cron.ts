import {logOperation} from "./structured-log";
import {storage as defaultStorage,type IStorage} from './storage';
import {getSubscriptionPaymentRuntime} from './subscription-payment-runtime';
import type {DurableSubscriptionBilling} from './durable-subscription-billing';
import {billingIdempotencyKey,billingReference,decideBilling,nextBillingPeriodStart,renewalPlan} from './subscription-billing';

export interface SubscriptionBillingPassResult {charged:number;failed:number;skipped:number;errors:number;expired:number}
type BillingStore=Pick<IStorage,'expireCancelledSubscriptions'|'claimSubscriptionsDueForBilling'|'releaseSubscriptionBillingClaim'>;
type BillingEngine=Pick<DurableSubscriptionBilling,'canInitiate'|'charge'|'recordMissingPaymentMethod'>;
/** Only the durable engine applies a provider result. Cron selects due owners
 * and delegates their frozen period intent; it never sends an unkeyed email or
 * runs a second subscription/history finalizer. */
export async function runSubscriptionBillingPass(now=new Date(),options:{storage?:BillingStore;billing?:BillingEngine}={}):Promise<SubscriptionBillingPassResult>{
  const result:SubscriptionBillingPassResult={charged:0,failed:0,skipped:0,errors:0,expired:0};
  const storage=options.storage??defaultStorage,billing=options.billing??getSubscriptionPaymentRuntime()?.billing;
  try{result.expired=await storage.expireCancelledSubscriptions(now);}catch{logOperation("error","SUBSCRIPTION_EXPIRY_UNAVAILABLE");result.errors++;}
  if(!billing||!billing.canInitiate())return result;
  let due:Awaited<ReturnType<BillingStore['claimSubscriptionsDueForBilling']>>;
  try{due=await storage.claimSubscriptionsDueForBilling(now);}catch{logOperation("error","SUBSCRIPTION_CLAIM_UNAVAILABLE");result.errors++;return result;}
  for(const subscription of due){
    const token=subscription.billingClaimToken;if(!token){result.errors++;continue;}
    try{
      const decision=decideBilling(subscription,now);if(decision.action==='skip'){result.skipped++;continue;}
      const periodStart=nextBillingPeriodStart(subscription,now),plan=renewalPlan(subscription),attemptNumber=(subscription.failedPaymentCount??0)+1;
      const intent={subscriptionId:subscription.id,merchantId:subscription.merchantId,kind:'renewal' as const,planId:plan.id,
        amountCents:subscription.pendingPlanId?plan.priceCents:subscription.priceCents??plan.priceCents,
        idempotencyKey:billingIdempotencyKey(subscription.id,periodStart,attemptNumber),reference:billingReference(subscription.merchantId,plan.id,periodStart)};
      const outcome=decision.action==='record_failure'?await billing.recordMissingPaymentMethod(intent):await billing.charge({...intent,cardId:subscription.windcaveCardId!});
      if(outcome.reused||!outcome.applied){if(outcome.kind==='processing')result.errors++;else result.skipped++;}
      else if(outcome.kind==='approved')result.charged++;else if(outcome.kind==='declined')result.failed++;else result.skipped++;
    }catch{logOperation("error","SUBSCRIPTION_BILLING_UNCONFIRMED");result.errors++;}
    finally{await storage.releaseSubscriptionBillingClaim(subscription.id,token).catch(()=>{result.errors++;});}
  }
  return result;
}
