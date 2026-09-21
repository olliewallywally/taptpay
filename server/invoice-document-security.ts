import { createHash } from "node:crypto";

// Shared across processes in DatabaseStorage. The aggregate gate runs first:
// arbitrary distinct tokens cannot create an unbounded number of database rows.
// This budget is separate from checkout/payment requests.
export const DOCUMENT_READ_WINDOW_MS = 60_000;
export const DOCUMENT_READ_TOKEN_LIMIT = 10;
export const DOCUMENT_READ_GLOBAL_LIMIT = 600;
export const DOCUMENT_READ_GLOBAL_KEY = "invoice-documents:global";

export function documentReadTokenKey(token: string): string {
  // Checkout tokens have high entropy. Persist neither bearer tokens nor IPs.
  return `invoice-documents:token:${createHash("sha256").update(token).digest("hex")}`;
}

// A successful upload must always yield a name accepted by upload-policy.ts.
// originalname is a display label only, never part of a storage key.
export const INVOICE_DOCUMENT_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/heic": ".heic",
});
