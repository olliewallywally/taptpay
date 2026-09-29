import { redactCustomerPaymentAddress } from "@/lib/payment-addressing";

/*
 * R1-T4 phase A — what a page view tells Google Analytics. GA4 fills
 * page_location and page_referrer from the address by default, query string
 * included, and addresses carry secrets: reset and invite links hold a token in
 * the query; payment, invoice and quote links hold one in the path (Google
 * sign-in used to put the account token in /login?token=). Only the redacted
 * path is sent, and of the referrer only its origin.
 */

export interface AnalyticsPageFields {
  page_path: string;
  page_location: string;
  page_referrer: string;
}

function referrerOrigin(referrer: string): string {
  if (!referrer) return "";
  try {
    return `${new URL(referrer).origin}/`;
  } catch {
    return "";
  }
}

export function analyticsPageView(location: string, origin: string, referrer: string): AnalyticsPageFields {
  const path = redactCustomerPaymentAddress(location);
  return { page_path: path, page_location: `${origin}${path}`, page_referrer: referrerOrigin(referrer) };
}

type Gtag = (...args: unknown[]) => void;

/**
 * `set` first, so any event GA4 sends on its own afterwards (enhanced measurement)
 * carries the redacted location too — then the page view itself.
 */
export function sendAnalyticsPageView(
  gtag: Gtag,
  location: string,
  page: { origin: string; referrer: string; title: string },
): void {
  const fields = analyticsPageView(location, page.origin, page.referrer);
  gtag("set", { page_location: fields.page_location, page_referrer: fields.page_referrer });
  gtag("event", "page_view", { ...fields, page_title: page.title });
}
