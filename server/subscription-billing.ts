import { DEFAULT_PLAN_ID, planAmountString, planFor, planForOrDefault, type PlanId } from "@shared/plans";
import type { MerchantSubscription } from "@shared/schema";
import { chargeStoredCard, isWindcaveConfigured } from "./windcave";
import { addOneMonth } from "./storage";

/**
 * Dunning schedule, in days after the first failure, before a subscription is
 * suspended. Three attempts over a week, then stop: retrying forever costs
 * Windcave fees and annoys the cardholder's bank.
 */
export const DUNNING_RETRY_DAYS = [1, 3, 7] as const;
export const MAX_PAYMENT_ATTEMPTS = DUNNING_RETRY_DAYS.length + 1;

export const SUBSCRIPTION_PAST_DUE = {
  code: "SUBSCRIPTION_PAST_DUE",
  message: "Your subscription payment failed. Update your card in Settings to keep sending payments.",
} as const;

export const SUBSCRIPTION_SUSPENDED = {
  code: "SUBSCRIPTION_SUSPENDED",
  message: "Your subscription is suspended. Update your card in Settings to reactivate your account.",
} as const;

/**
 * Windcave's idempotency key for one subscription period. Deriving it from the
 * subscription id and period start — never a random value — is what makes a
 * retried billing run charge once instead of twice. A confirmed decline advances
 * the attempt number; ambiguous transport retries deliberately reuse it.
 */
export function billingIdempotencyKey(
  subscriptionId: number,
  periodStart: Date,
  attemptNumber: number = 1,
): string {
  return `sub-${subscriptionId}-${periodStart.toISOString().slice(0, 10)}-a${attemptNumber}`;
}

export function billingReference(merchantId: number, planId: string, periodStart: Date): string {
  return `TAPTPAY-${planId.toUpperCase()}-M${merchantId}-${periodStart.toISOString().slice(0, 10)}`;
}

/** Only paid or temporarily past-due subscriptions may send payments. */
export function subscriptionAllowsSending(subscription: Pick<MerchantSubscription, "status"> | null | undefined): boolean {
  return subscription?.status === "active" || subscription?.status === "past_due";
}

export interface BillingDecision {
  action: "charge" | "skip";
  reason?: string;
}

/**
 * Whether a subscription is due to be charged now.
 *
 * Cancelled subscriptions are never charged — cancellation means "do not renew",
 * and access simply ends at `currentPeriodEnd`.
 */
export function decideBilling(
  subscription: MerchantSubscription,
  now: Date,
): BillingDecision {
  if (subscription.status === "cancelled" || subscription.cancelAtPeriodEnd) {
    return { action: "skip", reason: "cancelled" };
  }
  if (subscription.status === "suspended") {
    return { action: "skip", reason: "suspended" };
  }
  if (!subscription.windcaveCardId) {
    return { action: "skip", reason: "no_card" };
  }

  const due = subscription.nextBillingDate ?? subscription.currentPeriodEnd;
  if (!due) return { action: "skip", reason: "no_billing_date" };
  if (now < new Date(due)) return { action: "skip", reason: "not_due" };

  // Dunning dates are anchored to the original due date: day 1, day 3 and day
  // 7. Basing each on the previous failure would accidentally produce 1/4/11.
  if (subscription.status === "past_due") {
    const failures = subscription.failedPaymentCount ?? 0;
    if (failures >= MAX_PAYMENT_ATTEMPTS) {
      return { action: "skip", reason: "exhausted" };
    }
    if (failures > 0) {
      const retryDay = DUNNING_RETRY_DAYS[failures - 1];
      if (retryDay === undefined) return { action: "skip", reason: "exhausted" };
      const nextRetryAt = new Date(due);
      nextRetryAt.setUTCDate(nextRetryAt.getUTCDate() + retryDay);
      if (now < nextRetryAt) return { action: "skip", reason: "retry_backoff" };
    }
  }

  return { action: "charge" };
}

export interface SubscriptionChargeOutcome {
  charged: boolean;
  approved: boolean;
  windcaveTransactionId?: string;
  failureReason?: string;
  /** Terminal for this period: stop retrying and suspend. */
  exhausted?: boolean;
  idempotencyKey?: string;
  attemptNumber?: number;
  amountCents?: number;
  planId?: PlanId;
}

export function renewalPlan(subscription: MerchantSubscription) {
  return subscription.pendingPlanId
    ? planFor(subscription.pendingPlanId)
    : planForOrDefault(subscription.planId);
}
/**
 * A renewal continues from the paid period boundary. Initial activation and an
 * ended cancellation start a fresh month now; legacy fee-billing timestamps are
 * deliberately cleared by migration 0013 and therefore cannot create free time.
 */
export function nextBillingPeriodStart(
  subscription: MerchantSubscription,
  now: Date,
): Date {
  return subscription.status !== "cancelled"
    && !!subscription.lastBillingDate
    && !!subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : now;
}


/**
 * Charges one subscription period. Pure of storage: the caller persists the
 * outcome, which keeps the retry/suspend policy testable without a database.
 */
export async function chargeSubscriptionPeriod(
  subscription: MerchantSubscription,
  now: Date,
): Promise<SubscriptionChargeOutcome> {
  if (!subscription.windcaveCardId) {
    return { charged: false, approved: false, failureReason: "No card on file" };
  }
  if (!isWindcaveConfigured()) {
    return { charged: false, approved: false, failureReason: "Windcave is not configured" };
  }

  const periodStart = nextBillingPeriodStart(subscription, now);
  const plan = renewalPlan(subscription);
  const amountCents = subscription.pendingPlanId
    ? plan.priceCents
    : (subscription.priceCents ?? plan.priceCents);
  const attemptNumber = (subscription.failedPaymentCount ?? 0) + 1;
  const idempotencyKey = billingIdempotencyKey(subscription.id, periodStart, attemptNumber);

  const result = await chargeStoredCard(
    idempotencyKey,
    subscription.windcaveCardId,
    planAmountString(amountCents),
    billingReference(subscription.merchantId, plan.id, periodStart),
  );

  const metadata = { idempotencyKey, attemptNumber, amountCents, planId: plan.id };

  if (!result.success) {
    // A transport failure is not a decline — do not burn a dunning attempt on it.
    return { charged: false, approved: false, failureReason: result.error, ...metadata };
  }
  if (!result.approved) {
    const failures = (subscription.failedPaymentCount ?? 0) + 1;
    return {
      charged: true,
      approved: false,
      failureReason: result.declineReason ?? "Card declined",
      exhausted: failures >= MAX_PAYMENT_ATTEMPTS,
      windcaveTransactionId: result.windcaveTransactionId,
      ...metadata,
    };
  }
  return {
    charged: true,
    approved: true,
    windcaveTransactionId: result.windcaveTransactionId,
    ...metadata,
  };
}

/** Column updates that advance a subscription into its next paid period. */
export function nextPeriodUpdates(subscription: MerchantSubscription, now: Date) {
  // A queued downgrade lands at the period boundary, so the merchant keeps the
  // seats they paid for until the moment the cheaper plan starts.
  const pendingPlan = subscription.pendingPlanId as PlanId | null;
  const currentPlan = planForOrDefault(subscription.planId);
  const plan = pendingPlan ? planFor(pendingPlan) : currentPlan;
  // Preserve the calendar anchor when a cron runs late.
  const periodStart = nextBillingPeriodStart(subscription, now);
  const periodEnd = addOneMonth(periodStart);

  return {
    // A catalogue price change must not silently re-price an existing account.
    // Only a queued plan transition adopts today's catalogue values.
    planId: pendingPlan ? plan.id : (subscription.planId || currentPlan.id),
    seatLimit: pendingPlan ? plan.seats : (subscription.seatLimit ?? currentPlan.seats),
    priceCents: pendingPlan ? plan.priceCents : (subscription.priceCents ?? currentPlan.priceCents),
    pendingPlanId: null,
    pendingPlanEffectiveAt: null,
    status: "active" as const,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    nextBillingDate: periodEnd,
    lastBillingDate: now.toISOString(),
    failedPaymentCount: 0,
    lastPaymentFailureAt: null,
    lastPaymentFailureReason: null,
    updatedAt: now,
  };
}

/** Column updates recording a declined charge and the resulting dunning state. */
export function failedPaymentUpdates(
  subscription: MerchantSubscription,
  now: Date,
  reason: string,
  exhausted: boolean,
) {
  return {
    status: exhausted ? ("suspended" as const) : ("past_due" as const),
    failedPaymentCount: (subscription.failedPaymentCount ?? 0) + 1,
    lastPaymentFailureAt: now,
    lastPaymentFailureReason: reason.slice(0, 500),
    updatedAt: now,
  };
}

/** Column updates applying an immediate plan change (an upgrade). */
export function immediatePlanUpdates(planId: PlanId, now: Date) {
  const plan = planFor(planId);
  return {
    planId: plan.id,
    seatLimit: plan.seats,
    priceCents: plan.priceCents,
    pendingPlanId: null,
    pendingPlanEffectiveAt: null,
    updatedAt: now,
  };
}

/** Column updates queueing a downgrade to the end of the paid period. */
export function queuedPlanUpdates(
  planId: PlanId,
  periodEnd: Date | null,
  now: Date,
) {
  return {
    pendingPlanId: planId,
    pendingPlanEffectiveAt: periodEnd ?? addOneMonth(now),
    updatedAt: now,
  };
}


/** Amount due now for a mid-period upgrade, rounded to the nearest cent. */
export function proratedUpgradeCents(
  currentPriceCents: number,
  targetPriceCents: number,
  periodStart: Date,
  periodEnd: Date,
  now: Date,
): number {
  const difference = Math.max(0, targetPriceCents - currentPriceCents);
  const totalMs = periodEnd.getTime() - periodStart.getTime();
  if (difference === 0 || totalMs <= 0 || now >= periodEnd) return 0;
  const remainingMs = Math.min(
    totalMs,
    Math.max(0, periodEnd.getTime() - now.getTime()),
  );
  return Math.max(0, Math.round(difference * (remainingMs / totalMs)));
}
export const DEFAULT_PLAN = planFor(DEFAULT_PLAN_ID);
