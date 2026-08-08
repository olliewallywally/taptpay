export const BILLING_CARD_REQUIRED = {
  code: "BILLING_CARD_REQUIRED",
  message: "Add a payment method in Settings to activate your subscription before sending payments.",
} as const;

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

/**
 * Whether a merchant's subscription can bill, and therefore whether they may
 * send payment requests.
 *
 * Reads the subscription row, which is where the Windcave card-on-file lives.
 * A suspended subscription fails even with a valid card: billing has already
 * exhausted its retries against it.
 *
 * The expiry check is deliberately lenient about *format* — Windcave supplies
 * the masked expiry and an unparseable one should not lock a paying merchant
 * out of their own terminal. A card Windcave has stored is a card Windcave will
 * try to charge.
 */
export function billingCardIsReady(subscription: any, now: Date = new Date()): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "past_due") return false;
  // A card token alone is not activation: the first monthly charge must have
  // succeeded and established a paid period.
  if (!subscription.lastBillingDate) return false;
  if (!subscription.windcaveCardId) return false;
  if (
    subscription.cancelAtPeriodEnd
    && subscription.currentPeriodEnd
    && new Date(subscription.currentPeriodEnd) <= now
  ) {
    return false;
  }
  const expiry = subscription.cardExpiry;
  if (expiry && /^\d{2}\/\d{2}$/.test(String(expiry)) && !isCardExpiryValid(expiry, now)) {
    return false;
  }
  return true;
}
