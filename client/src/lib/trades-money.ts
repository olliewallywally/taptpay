export const TRADES_FEE_RATE = 0.003;
export const NZ_GST_RATE = 0.15;

export function formatNzd(cents: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format((cents || 0) / 100);
}

export function tradesFeeCents(amountCents: number): number {
  return Math.round((amountCents || 0) * TRADES_FEE_RATE);
}

export function includedGstCents(amountCents: number): number {
  return Math.round((amountCents || 0) - (amountCents || 0) / (1 + NZ_GST_RATE));
}
