export const NZ_GST_RATE = 0.15;

export interface TradesBalanceInvoice {
  amountCents?: number | null;
  status?: string | null;
  splitEnabled?: boolean | null;
  splitCount?: number | null;
  splitPaidCount?: number | null;
}

const CLOSED_TRADES_INVOICE_STATUSES = new Set([
  "paid",
  "paid_external",
  "voided",
  // A deposit invoice in this legacy state is settled; any separately issued
  // balance is represented by its own invoice.
  "deposit_paid",
]);

export function formatNzd(cents: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format((cents || 0) / 100);
}

export function includedGstCents(amountCents: number): number {
  return Math.round((amountCents || 0) - (amountCents || 0) / (1 + NZ_GST_RATE));
}

/**
 * Exact amount still owed on one trades invoice.
 *
 * Split checkout charges floor(total / count) for each non-final share and puts
 * every remainder cent into the final share. Subtracting the paid base shares
 * from the original total therefore preserves that final remainder exactly.
 */
export function tradesInvoiceRemainingCents(
  invoice: TradesBalanceInvoice,
): number {
  const rawAmount = Number(invoice.amountCents);
  const total = Number.isFinite(rawAmount)
    ? Math.max(0, Math.trunc(rawAmount))
    : 0;
  if (CLOSED_TRADES_INVOICE_STATUSES.has(String(invoice.status ?? ""))) {
    return 0;
  }

  const rawCount = Number(invoice.splitCount);
  const hasValidSplit =
    invoice.splitEnabled === true &&
    Number.isInteger(rawCount) &&
    rawCount > 1;
  if (!hasValidSplit) return total;

  const rawPaid = Number(invoice.splitPaidCount);
  const paid = Math.min(
    rawCount,
    Math.max(0, Number.isFinite(rawPaid) ? Math.trunc(rawPaid) : 0),
  );
  if (paid >= rawCount) return 0;
  return total - Math.floor(total / rawCount) * paid;
}

export function tradesOutstandingCents(
  invoices: readonly TradesBalanceInvoice[],
): number {
  return invoices.reduce(
    (sum, invoice) => sum + tradesInvoiceRemainingCents(invoice),
    0,
  );
}
