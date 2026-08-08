import { addOneMonth, storage } from "./storage";
import { planFor } from "@shared/plans";
import { sendSubscriptionPaymentFailedEmail } from "./email-service";
import {
  chargeSubscriptionPeriod,
  decideBilling,
  DUNNING_RETRY_DAYS,
  failedPaymentUpdates,
  nextBillingPeriodStart,
  nextPeriodUpdates,
} from "./subscription-billing";

export interface SubscriptionBillingPassResult {
  charged: number;
  failed: number;
  skipped: number;
  errors: number;
  expired: number;
}

async function expireCancelledSubscriptions(now: Date): Promise<number> {
  // The predicate and update are one statement, so a concurrent resume cannot
  // be overwritten by a stale row read from an earlier pass.
  return await storage.expireCancelledSubscriptions(now);
}

/**
 * Charges every subscription whose period has rolled over.
 *
 * Each subscription is charged independently and a failure on one never stops
 * the pass: one merchant's declined card must not delay everybody else's
 * renewal. Windcave idempotency (see `billingIdempotencyKey`) is what makes a
 * re-run of this pass safe.
 */
export async function runSubscriptionBillingPass(
  now: Date = new Date(),
): Promise<SubscriptionBillingPassResult> {
  const result: SubscriptionBillingPassResult = {
    charged: 0, failed: 0, skipped: 0, errors: 0, expired: 0,
  };

  try {
    result.expired = await expireCancelledSubscriptions(now);
  } catch (err) {
    console.error("[SUBSCRIPTION_CRON] expiry pass failed:", err);
    result.errors++;
  }

  let due: Awaited<ReturnType<typeof storage.claimSubscriptionsDueForBilling>>;
  try {
    due = await storage.claimSubscriptionsDueForBilling(now);
  } catch (err) {
    console.error("[SUBSCRIPTION_CRON] could not claim due subscriptions:", err);
    result.errors++;
    return result;
  }

  for (const subscription of due) {
    const claimToken = subscription.billingClaimToken;
    if (!claimToken) {
      result.errors++;
      continue;
    }

    try {
      const decision = decideBilling(subscription, now);
      if (decision.action === "skip") {
        await storage.releaseSubscriptionBillingClaim(subscription.id, claimToken);
        result.skipped++;
        continue;
      }

      const outcome = await chargeSubscriptionPeriod(subscription, now);

      if (!outcome.charged) {
        await storage.releaseSubscriptionBillingClaim(subscription.id, claimToken);
        console.error(
          `[SUBSCRIPTION_CRON] subscription ${subscription.id} could not be charged:`,
          outcome.failureReason,
        );
        result.errors++;
        continue;
      }

      if (!outcome.planId || !outcome.amountCents || !outcome.idempotencyKey || !outcome.attemptNumber) {
        throw new Error("Charge outcome omitted reconciliation metadata");
      }
      const plan = planFor(outcome.planId);
      const periodStart = new Date(
        subscription.currentPeriodEnd ?? subscription.nextBillingDate ?? now,
      );
      const periodEnd = addOneMonth(periodStart);
      const historyBase = {
        merchantId: subscription.merchantId,
        subscriptionId: subscription.id,
        billingType: "monthly_subscription",
        amount: (outcome.amountCents / 100).toFixed(2),
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        windcaveTransactionId: outcome.windcaveTransactionId ?? null,
        idempotencyKey: outcome.idempotencyKey,
        attemptNumber: outcome.attemptNumber,
      };

      if (outcome.approved) {
        const applied = await storage.finalizeSubscriptionBillingClaim(
          subscription.id,
          claimToken,
          nextPeriodUpdates(subscription, now),
          {
            ...historyBase,
            status: "succeeded",
            description: `${plan.name} plan — ${periodStart.toLocaleDateString("en-NZ")}`,
            paidAt: now,
          },
        );
        if (applied) result.charged++;
        else result.skipped++;
      } else {
        const reason = outcome.failureReason ?? "Card declined";
        const exhausted = outcome.exhausted === true;
        const applied = await storage.finalizeSubscriptionBillingClaim(
          subscription.id,
          claimToken,
          failedPaymentUpdates(subscription, now, reason, exhausted),
          {
            ...historyBase,
            status: "failed",
            description: `${plan.name} plan — payment failed`,
            failureReason: reason.slice(0, 500),
          },
        );
        if (!applied) {
          result.skipped++;
          continue;
        }
        result.failed++;

        const failureCount = (subscription.failedPaymentCount ?? 0) + 1;
        const retryDay = exhausted ? undefined : DUNNING_RETRY_DAYS[failureCount - 1];
        const nextRetryAt = retryDay === undefined ? null : new Date(periodStart);
        if (nextRetryAt && retryDay !== undefined) {
          nextRetryAt.setUTCDate(nextRetryAt.getUTCDate() + retryDay);
        }
        const merchant = await storage.getMerchant(subscription.merchantId);
        if (merchant) {
          const emailed = await sendSubscriptionPaymentFailedEmail({
            to: merchant.contactEmail || merchant.email,
            businessName: merchant.businessName || merchant.name,
            planName: plan.name,
            amount: (outcome.amountCents / 100).toFixed(2),
            nextRetryAt,
            suspended: exhausted,
          });
          if (!emailed) console.error(`[SUBSCRIPTION_CRON] failure email not delivered for ${subscription.id}`);
        }
      }
    } catch (err) {
      await storage.releaseSubscriptionBillingClaim(subscription.id, claimToken).catch(() => {});
      console.error(`[SUBSCRIPTION_CRON] subscription ${subscription.id} errored:`, err);
      result.errors++;
    }
  }

  return result;
}
