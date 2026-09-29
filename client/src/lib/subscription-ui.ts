export type SubscriptionUiSnapshot = {
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: string | Date | null;
};

export type SubscriptionCancellationState = "active" | "scheduled" | "cancelled";

export function subscriptionCancellationState(
  subscription?: SubscriptionUiSnapshot | null,
): SubscriptionCancellationState {
  if (subscription?.status === "cancelled") return "cancelled";
  if (subscription?.cancelAtPeriodEnd === true) return "scheduled";
  return "active";
}

export function hasPaidCurrentSubscriptionPeriod(
  subscription?: SubscriptionUiSnapshot | null,
  nowMs = Date.now(),
): boolean {
  if (subscription?.status !== "active" || !subscription.currentPeriodEnd) return false;
  const periodEndMs = new Date(subscription.currentPeriodEnd).getTime();
  return Number.isFinite(periodEndMs) && periodEndMs > nowMs;
}

export function cardSetupBillingDisclosure(
  subscription: SubscriptionUiSnapshot | null | undefined,
  formattedMonthlyPrice: string,
  nowMs = Date.now(),
): string {
  if (hasPaidCurrentSubscriptionPeriod(subscription, nowMs)) {
    return `You won't be charged today. Your ${formattedMonthlyPrice} monthly renewal stays unchanged.`;
  }
  return `You'll be charged ${formattedMonthlyPrice} today when your card is verified, then monthly. Cancel before renewal.`;
}

export function planChangeBillingDisclosure(
  subscription?: SubscriptionUiSnapshot | null,
  nowMs = Date.now(),
): string {
  if (hasPaidCurrentSubscriptionPeriod(subscription, nowMs)) {
    return "Upgrades charge the prorated price difference immediately. Downgrades have no charge today and start at renewal.";
  }
  return "Changing your plan selection has no charge today. The selected plan's full monthly price is charged when your card is verified.";
}
