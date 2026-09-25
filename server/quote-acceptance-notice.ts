import { storage } from "./storage";
import { sendQuoteAcceptanceBlockedEmail } from "./email-service";

/**
 * The public quote route's answer when the business's subscription needs attention,
 * written for the customer: the business's own billing message is not theirs to read
 * (owner decision 2026-09-25, 2b). The quote page shows the same words.
 */
export const QUOTE_ACCEPTANCE_UNAVAILABLE = {
  code: "QUOTE_ACCEPTANCE_UNAVAILABLE",
  message: "This quote can't be accepted online right now. Please contact the business to go ahead.",
} as const;

const NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const noticeSentAt = new Map<string, number>();

function nzd(cents: number): string {
  return (cents / 100).toLocaleString("en-NZ", { style: "currency", currency: "NZD" });
}

/**
 * Tells the business by email that a customer tried to accept one of its quotes while
 * its subscription needed attention (owner decision 2026-09-25, 2a): at most once per
 * quote per day. The record is kept per process, so a restart or a second instance can
 * send one more. Never throws — the customer's answer must not depend on it — and a
 * notice that did not go out is not counted, so the next attempt tries again.
 */
export async function tellBusinessQuoteAcceptanceBlocked(
  quote: { id: string; merchantId: number; clientProfileId: string; totalCents: number },
  baseUrl: string,
): Promise<void> {
  const now = Date.now();
  for (const [quoteId, sentAt] of noticeSentAt) {
    if (now - sentAt >= NOTICE_INTERVAL_MS) noticeSentAt.delete(quoteId);
  }
  if (noticeSentAt.has(quote.id)) return;
  // Counted before any await, so two quick taps send one email.
  noticeSentAt.set(quote.id, now);

  let sent = false;
  try {
    const merchant = await storage.getMerchant(quote.merchantId);
    if (merchant) {
      const client = await storage.getClientProfile(quote.clientProfileId).catch(() => undefined);
      const clientName = client ? `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() : "";
      sent = await sendQuoteAcceptanceBlockedEmail({
        to: merchant.contactEmail || merchant.email,
        businessName: merchant.businessName || merchant.name,
        clientName: clientName || "A customer",
        total: nzd(quote.totalCents),
        billingUrl: `${baseUrl}/settings?section=billing`,
      });
    }
  } catch (error) {
    console.error(`[QUOTE_ACCEPTANCE_NOTICE] could not tell the business about quote ${quote.id}:`, error);
  }
  if (!sent) noticeSentAt.delete(quote.id);
}
