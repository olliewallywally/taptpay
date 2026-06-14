/**
 * templates.ts — segment-aware merge-field fallback used when AI personalization
 * isn't configured (no ANTHROPIC_API_KEY) or a generation fails. Keeps the
 * pipeline fully functional without the one paid dependency.
 */
import type { PersonalizeContext } from "./prompts";

const SEGMENT_HOOK: Record<string, string> = {
  hospitality: "Running a café or eatery means card fees quietly eat into every sale.",
  retail: "For a retail shop, the card fees on every sale add up fast.",
  trades: "On the tools, taking payment on the spot shouldn't mean a pricey terminal or big fees.",
  property: "Collecting rent and invoices shouldn't mean high card fees or clunky hardware.",
  other: "Card fees on every sale quietly add up.",
};

export function renderTemplate(ctx: PersonalizeContext): { subject: string; body: string } {
  const place = ctx.suburb || ctx.city;
  const hook = SEGMENT_HOOK[ctx.segment || "other"] || SEGMENT_HOOK.other;
  const subject = `Lower card fees for ${ctx.businessName}`.slice(0, 120);
  const body = [
    `Hi ${ctx.businessName} team,`,
    "",
    `${hook} TaptPay turns any phone into a card terminal — no hardware to buy — with fees around 0.2% instead of the ~2.9% most terminals charge, plus instant GST invoices and receipts.`,
    "",
    `${place ? `We're helping NZ businesses around ${place} keep more of every sale. ` : "We're helping NZ businesses keep more of every sale. "}Want me to send a quick one-pager, or set up a 10-minute call?`,
    "",
    "Cheers,",
    "The TaptPay team",
  ].join("\n");
  return { subject, body };
}
