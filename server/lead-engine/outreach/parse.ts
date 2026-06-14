/**
 * parse.ts — pure inbound-payload helpers (no I/O), kept separate from
 * replies.ts so they're unit-testable without loading the storage layer.
 */

/** Pull a sender address out of common inbound-parse payload shapes
 *  ("Joe <joe@x.com>" → joe@x.com). */
export function extractSender(body: any): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw = body.from ?? body.sender ?? body.From ?? body.from_email ?? body.envelope?.from ?? body.headers?.from;
  if (typeof raw !== "string") return undefined;
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1] : raw).trim();
}
