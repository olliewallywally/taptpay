/**
 * webhook-verify.ts — verify a Resend/Svix-signed webhook (HMAC-SHA256).
 *
 * Pure and testable. Returns true only when a `v1` signature matches the signing
 * secret AND the timestamp is within tolerance (replay protection). The outreach
 * webhook refuses to process events unless this passes, so an unauthenticated
 * caller can't suppress arbitrary addresses.
 */
import { createHmac, timingSafeEqual } from "crypto";

function headerValue(headers: Record<string, string | string[] | undefined>, key: string): string {
  const v = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export function verifyWebhookSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  toleranceSec = 300,
  nowMs: number = Date.now(),
): boolean {
  if (!secret) return false;
  const id = headerValue(headers, "svix-id");
  const ts = headerValue(headers, "svix-timestamp");
  const sigHeader = headerValue(headers, "svix-signature");
  if (!id || !ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(nowMs / 1000 - tsNum) > toleranceSec) return false; // reject stale/replayed

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${ts}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  // svix-signature is a space-delimited list of "v1,<base64sig>" entries.
  for (const part of sigHeader.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) return true;
  }
  return false;
}
