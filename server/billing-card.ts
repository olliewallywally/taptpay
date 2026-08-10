export const BILLING_CARD_REQUIRED = {
  code: "BILLING_CARD_REQUIRED",
  message: "Your subscription needs attention before you can send payments. Open Billing in Settings.",
} as const;

const DUNNING_ACCESS_DAYS = 8;

export function isCardExpiryValid(expiry: unknown, now: Date = new Date()): boolean {
  const match = String(expiry || "").match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

export function isLuhnValid(cardNumber: string): boolean {
  if (!/^\d{13,19}$/.test(cardNumber)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = cardNumber.length - 1; index >= 0; index--) {
    let digit = Number(cardNumber[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

/** Whether the stored payment method is usable for the next renewal attempt. */
export function renewalPaymentMethodIsReady(
  subscription: any,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (!subscription.windcaveCardId) return false;
  const expiry = subscription.cardExpiry;
  if (expiry && /^\d{2}\/\d{2}$/.test(String(expiry)) && !isCardExpiryValid(expiry, now)) {
    return false;
  }
  return true;
}

/**
 * Whether the merchant currently has service entitlement.
 *
 * This deliberately does not depend on a stored card. Removing a renewal card
 * cannot claw back a month that has already been paid for. Active access ends
 * at the paid period boundary; past-due access has a bounded dunning grace
 * window and therefore cannot stay live forever if the scheduler stops.
 */
export function subscriptionHasPaidAccess(
  subscription: any,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (subscription.status === "past_due") {
    // Dunning grace extends an entitlement that was already paid for; an
    // initial charge failure must never manufacture a free trial period.
    if (
      !subscription.lastBillingDate
      || !subscription.currentPeriodEnd
      || (subscription.failedPaymentCount ?? 0) >= 4
    ) return false;
    const graceEndsAt = new Date(subscription.currentPeriodEnd);
    if (Number.isNaN(graceEndsAt.getTime())) return false;
    graceEndsAt.setUTCDate(graceEndsAt.getUTCDate() + DUNNING_ACCESS_DAYS);
    return now < graceEndsAt;
  }
  if (subscription.status !== "active") return false;
  if (!subscription.lastBillingDate || !subscription.currentPeriodEnd) return false;
  const periodEnd = new Date(subscription.currentPeriodEnd);
  return !Number.isNaN(periodEnd.getTime()) && now < periodEnd;
}

/**
 * Backwards-compatible name used by the payment-send gates. It now represents
 * subscription entitlement, not renewal-card presence.
 */
export function billingCardIsReady(subscription: any, now: Date = new Date()): boolean {
  return subscriptionHasPaidAccess(subscription, now);
}
