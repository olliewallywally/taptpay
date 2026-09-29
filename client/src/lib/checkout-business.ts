import type { CheckoutRouteKind } from "@/lib/payment-addressing";

/** What the checkout page shows about the business: its name (Apple Pay's label) and logo. */
export type CheckoutBusiness = { businessName?: string | null; customLogoUrl?: string | null };

/**
 * Where the checkout page's business details come from, for each kind of checkout. Owner decision
 * 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 3): with what the
 * page already holds — a payment link's answer, an invoice's, or a board sale's own read — and
 * never from the retired by-number business read. A quote shows TaptPay's.
 */
export function checkoutBusiness(
  kind: CheckoutRouteKind | undefined,
  held: { tokenPayment?: any; invoiceData?: any; rawTransaction?: any },
): CheckoutBusiness | undefined {
  switch (kind) {
    case "retail-token":
      return held.tokenPayment?.merchant ?? undefined;
    case "invoice-token":
      return held.invoiceData
        ? { businessName: held.invoiceData.merchantName, customLogoUrl: held.invoiceData.customLogoUrl ?? null }
        : undefined;
    case "retail-legacy":
      return held.rawTransaction?.merchant ?? undefined;
    default:
      return undefined;
  }
}
