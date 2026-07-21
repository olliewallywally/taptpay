export const BILLING_CARD_REQUIRED = {
  code: "BILLING_CARD_REQUIRED",
  message: "Please enter a valid credit or debit card in Settings before sending payments.",
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

export function billingCardIsReady(merchant: any, now: Date = new Date()): boolean {
  return Boolean(
    merchant &&
    /^\d{4}$/.test(String(merchant.billingCardLast4 || "")) &&
    ["Visa", "Mastercard", "Amex"].includes(String(merchant.billingCardBrand || "")) &&
    isCardExpiryValid(merchant.billingCardExpiry, now)
  );
}
