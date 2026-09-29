import { createHash } from "node:crypto";

// A per-link budget, shared across processes in DatabaseStorage and separate
// from checkout/payment requests. Only real invoices are counted: the route
// looks the link up first (owner decision 2026-09-21), so made-up links create
// no rows and there is no platform-wide pool for them to use up.
export const DOCUMENT_READ_WINDOW_MS = 60_000;
export const DOCUMENT_READ_TOKEN_LIMIT = 10;

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
