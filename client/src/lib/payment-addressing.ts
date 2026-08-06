export type CheckoutSource =
  | { kind: "retail-legacy"; transactionId: number }
  | { kind: "retail-token"; token: string }
  | { kind: "invoice-token"; token: string }
  | { kind: "quote-token"; token: string };

export type CheckoutRouteKind = CheckoutSource["kind"];
export type PaymentCheckoutSource = Exclude<CheckoutSource, { kind: "quote-token" }>;

export type ReceiptSource =
  | { kind: "retail-legacy"; transactionId: number; splitPaymentId?: number | null }
  | { kind: "retail-token"; token: string; share?: number | null };

export type TokenPaymentSummary = {
  price?: string | null;
  status?: string | null;
  splitEnabled?: boolean | null;
  isSplit?: boolean | null;
  totalSplits?: number | null;
  completedSplits?: number | null;
};

export type PaymentReturnOutcome = {
  outcome: "approved" | "declined" | "cancelled" | "pending";
  receiptShare?: number | null;
};

export type TokenClientSession = {
  sessionId: string;
  shareIndex: number;
  idempotencyKey: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const ATTEMPT_STORAGE_PREFIX = "taptpay:payment-attempt:v1";
const RETURN_STATE_STORAGE_KEY = "taptpay:payment-return-map:v1";

function opaquePart(value: string): string {
  return encodeURIComponent(value);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

export function checkoutSourceForRoute(
  kind: CheckoutRouteKind,
  params: { transactionId?: string; token?: string },
): CheckoutSource | null {
  if (kind === "retail-legacy") {
    const transactionId = Number(params.transactionId);
    return Number.isInteger(transactionId) && transactionId > 0
      ? { kind, transactionId }
      : null;
  }

  const token = params.token;
  return token ? { kind, token } : null;
}

export function checkoutResolveEndpoint(source: CheckoutSource): string {
  switch (source.kind) {
    case "retail-legacy":
      return `/api/transactions/${source.transactionId}`;
    case "retail-token":
      return `/api/pay/t/${opaquePart(source.token)}`;
    case "invoice-token":
      return `/api/checkout/resolve/${opaquePart(source.token)}`;
    case "quote-token":
      return `/api/trades/quotes/token/${opaquePart(source.token)}`;
  }
}

export function checkoutSessionEndpoint(source: PaymentCheckoutSource): string {
  switch (source.kind) {
    case "retail-legacy":
      return `/api/transactions/${source.transactionId}/pay`;
    case "retail-token":
      return `/api/pay/t/${opaquePart(source.token)}/session`;
    case "invoice-token":
      return `/api/checkout/${opaquePart(source.token)}/session`;
  }
}

export function checkoutCompletionEndpoint(
  source: PaymentCheckoutSource,
  method: "hosted-fields" | "googlepay",
): string {
  const suffix = method === "hosted-fields"
    ? "hosted-fields-complete"
    : "googlepay-complete";

  switch (source.kind) {
    case "retail-legacy":
      return `/api/transactions/${source.transactionId}/${suffix}`;
    case "retail-token":
      return `/api/pay/t/${opaquePart(source.token)}/${suffix}`;
    case "invoice-token":
      return `/api/checkout/${opaquePart(source.token)}/${suffix}`;
  }
}

export function tokenSplitEndpoint(token: string): string {
  return `/api/pay/t/${opaquePart(token)}/split`;
}

export function tokenSessionRequest(idempotencyKey: string, amount?: string): {
  idempotencyKey: string;
  amount?: string;
} {
  return amount === undefined ? { idempotencyKey } : { idempotencyKey, amount };
}

export function tokenCompletionRequest<T extends Record<string, unknown>>(
  session: TokenClientSession,
  extra: T,
): TokenClientSession & T {
  return { ...session, ...extra };
}

export function tokenPaymentPath(
  token: string,
  destination: "entry" | "split" | "checkout" | "receipt",
  share?: number | null,
): string {
  const prefix = destination === "entry" ? "/pay/t"
    : destination === "split" ? "/split/t"
    : destination === "checkout" ? "/checkout/t"
    : "/receipt/t";
  const base = `${prefix}/${opaquePart(token)}`;
  if (destination !== "receipt" || share == null) return base;
  assertPositiveInteger(share, "share");
  return `${base}?share=${share}`;
}

export function tokenEntryDestination(payment: TokenPaymentSummary, token: string): string {
  if (["completed", "partially_refunded", "refunded"].includes(payment.status ?? "")) {
    // A shared split token cannot identify which payer's receipt is being
    // requested. Only a direct completion/HPP outcome may append its local
    // `share=N`; revisiting the original link shows aggregate split status.
    return payment.isSplit
      ? tokenPaymentPath(token, "split")
      : tokenPaymentPath(token, "receipt");
  }
  if (payment.splitEnabled || payment.isSplit) {
    return tokenPaymentPath(token, "split");
  }
  return tokenPaymentPath(token, "checkout");
}

export function currentTokenShareIndex(payment: TokenPaymentSummary): number {
  const total = Number(payment.totalSplits ?? 0);
  const completed = Number(payment.completedSplits ?? 0);
  if (!payment.isSplit || !Number.isInteger(total) || total < 2) return 0;
  return Math.min(Math.max(0, completed) + 1, total);
}

export function currentTokenPaymentAmount(payment: TokenPaymentSummary): string {
  const totalCents = Math.max(0, Math.round(Number(payment.price ?? 0) * 100));
  const totalSplits = Number(payment.totalSplits ?? 0);
  const completed = Math.max(0, Number(payment.completedSplits ?? 0));
  if (!payment.isSplit || !Number.isInteger(totalSplits) || totalSplits < 2) {
    return (totalCents / 100).toFixed(2);
  }
  const baseCents = Math.floor(totalCents / totalSplits);
  const shareCents = completed >= totalSplits - 1
    ? totalCents - baseCents * (totalSplits - 1)
    : baseCents;
  return (shareCents / 100).toFixed(2);
}

export function receiptDataEndpoint(source: ReceiptSource): string {
  if (source.kind === "retail-legacy") {
    return `/api/transactions/${source.transactionId}`;
  }
  const base = `/api/pay/t/${opaquePart(source.token)}/receipt`;
  return source.share == null ? base : `${base}?share=${source.share}`;
}

export function receiptPdfEndpoint(source: ReceiptSource): string {
  if (source.kind === "retail-legacy") {
    const base = `/api/transactions/${source.transactionId}/receipt-pdf`;
    return source.splitPaymentId ? `${base}?splitId=${source.splitPaymentId}` : base;
  }
  const base = `/api/pay/t/${opaquePart(source.token)}/receipt-pdf`;
  return source.share == null ? base : `${base}?share=${source.share}`;
}

export function receiptQrEndpoint(source: ReceiptSource): string {
  if (source.kind === "retail-legacy") {
    const base = `/api/transactions/${source.transactionId}/receipt-qr`;
    return source.splitPaymentId ? `${base}?splitId=${source.splitPaymentId}` : base;
  }
  const base = `/api/pay/t/${opaquePart(source.token)}/receipt-qr`;
  return source.share == null ? base : `${base}?share=${source.share}`;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function sourceStorageIdentity(source: CheckoutSource): string {
  return source.kind === "retail-legacy"
    ? `${source.kind}:${source.transactionId}`
    : `${source.kind}:${source.token}`;
}

function attemptStorageKey(source: CheckoutSource, shareIndex: number): string {
  if (!Number.isInteger(shareIndex) || shareIndex < 0) {
    throw new Error("shareIndex must be a non-negative integer");
  }
  return `${ATTEMPT_STORAGE_PREFIX}:${sourceStorageIdentity(source)}:${shareIndex}`;
}

export function getOrCreatePaymentIdempotencyKey(
  source: CheckoutSource,
  shareIndex: number,
  storage: StorageLike = window.sessionStorage,
): string {
  const key = attemptStorageKey(source, shareIndex);
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = uuid();
  storage.setItem(key, created);
  return created;
}

export function paymentIdempotencyKey(
  source: CheckoutSource,
  shareIndex: number,
  storage: StorageLike = window.sessionStorage,
): string | null {
  return storage.getItem(attemptStorageKey(source, shareIndex));
}

export function clearPaymentIdempotencyKey(
  source: CheckoutSource,
  shareIndex: number,
  storage: StorageLike = window.sessionStorage,
): void {
  storage.removeItem(attemptStorageKey(source, shareIndex));
}

/**
 * Move a locally-created attempt key onto the share index authoritatively
 * assigned by the server. The resolver snapshot can be stale when another
 * payer completes a share between resolve and session creation.
 */
export function bindPaymentIdempotencyKey(
  source: CheckoutSource,
  requestedShareIndex: number,
  assignedShareIndex: number,
  idempotencyKey: string,
  storage: StorageLike = window.sessionStorage,
): void {
  const requestedKey = attemptStorageKey(source, requestedShareIndex);
  const assignedKey = attemptStorageKey(source, assignedShareIndex);
  storage.setItem(assignedKey, idempotencyKey);
  if (requestedKey !== assignedKey && storage.getItem(requestedKey) === idempotencyKey) {
    storage.removeItem(requestedKey);
  }
}

function readReturnMap(storage: StorageLike): Record<string, string> {
  try {
    const raw = storage.getItem(RETURN_STATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberPaymentReturnState(
  returnState: string,
  token: string,
  storage: StorageLike = window.sessionStorage,
): void {
  const map = readReturnMap(storage);
  map[returnState] = token;
  storage.setItem(RETURN_STATE_STORAGE_KEY, JSON.stringify(map));
}

export function paymentTokenForReturnState(
  returnState: string,
  storage: StorageLike = window.sessionStorage,
): string | null {
  return readReturnMap(storage)[returnState] ?? null;
}

export function forgetPaymentReturnState(
  returnState: string,
  storage: StorageLike = window.sessionStorage,
): void {
  const map = readReturnMap(storage);
  delete map[returnState];
  if (Object.keys(map).length === 0) storage.removeItem(RETURN_STATE_STORAGE_KEY);
  else storage.setItem(RETURN_STATE_STORAGE_KEY, JSON.stringify(map));
}

export function paymentReturnDestination(
  result: PaymentReturnOutcome,
  token: string,
): string | null {
  if (result.outcome === "pending") return null;
  if (result.outcome === "approved") {
    return tokenPaymentPath(token, "receipt", result.receiptShare ?? null);
  }
  return tokenPaymentPath(token, "entry");
}

export function parsePositiveShare(value: string | null): number | null {
  if (value == null || value === "") return null;
  const share = Number(value);
  return Number.isInteger(share) && share > 0 ? share : null;
}

export function redactCustomerPaymentAddress(value: string): string {
  return value
    .replace(/\/(api\/)?pay\/t\/[^/?#\s]+/g, (_match, api: string | undefined) => `/${api ?? ""}pay/t/:token`)
    .replace(/\/(split|checkout|receipt)\/t\/[^/?#\s]+/g, "/$1/t/:token")
    .replace(/\/(api\/)?pay\/return\/[^/?#\s]+/g, (_match, api: string | undefined) => `/${api ?? ""}pay/return/:state`)
    .replace(/[?#].*$/, "");
}
