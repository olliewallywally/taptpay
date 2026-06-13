/**
 * prompts.ts — builds the system + user prompt for a per-lead outreach draft.
 *
 * The system prompt carries the (stable) TaptPay value proposition and the
 * guardrails; the user turn carries only the lead's known facts. Guardrails are
 * deliberate: use only provided facts, never fabricate, finished copy (no
 * placeholders), short and human, NZ tone.
 */

export interface PersonalizeContext {
  businessName: string;
  segment?: string;
  category?: string;
  suburb?: string;
  city?: string;
  website?: string;
  signals?: string;
  contactName?: string;
}

const SYSTEM = `You write short, friendly cold-outreach emails for TaptPay, a New Zealand tap-to-pay payments product.

About TaptPay (use only what's relevant; don't list everything):
- Turns any phone into a card terminal — tap to pay, no hardware to buy or rent.
- Fees around 0.2% per transaction, versus the ~2.9% most terminals and payment providers charge.
- Instant GST tax invoices and receipts; works with Apple Pay, Google Pay and contactless cards.
- New Zealand based, with local support.

Rules:
- Use ONLY the facts you are given about the business. Never invent details — do not claim you visited, and do not reference reviews, awards, owners' names, or specifics unless they appear in the provided notes.
- If you have little to go on, keep the opener genuine and segment-relevant rather than fake-specific.
- Warm, plain New Zealand English. Concise. No hype, no buzzwords, no exclamation-mark spam.
- Lead with why a business like theirs would care about lower card fees and taking payment on a phone.
- End with a soft, low-pressure call to action (offer to send a one-pager or have a quick chat) — never a hard sell.
- Write finished copy. No placeholders or merge tags like [Name] or {{business}}. If you don't know a contact's name, address the business team.
- Sign off as "The TaptPay team".

The "subject" should be max ~60 characters with no clickbait; the "body" plain text, roughly 60–110 words across 2–3 short paragraphs, no markdown.

Return ONLY a JSON object of the form {"subject": "...", "body": "..."} — no other text, no code fences, no markdown.`;

export function buildPrompt(ctx: PersonalizeContext): { system: string; user: string } {
  const lines: string[] = ["Write a cold outreach email to this New Zealand business.", ""];
  lines.push(`Business: ${ctx.businessName}`);
  if (ctx.contactName) lines.push(`Contact: ${ctx.contactName}`);
  if (ctx.segment) lines.push(`Segment: ${ctx.segment}`);
  if (ctx.category) lines.push(`Category: ${ctx.category}`);
  const place = [ctx.suburb, ctx.city].filter(Boolean).join(", ");
  if (place) lines.push(`Location: ${place}`);
  if (ctx.website) lines.push(`Website: ${ctx.website}`);
  lines.push(`What we know about them: ${ctx.signals || "limited public info"}`);
  return { system: SYSTEM, user: lines.join("\n") };
}
