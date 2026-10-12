// R2-T1 (plan v2.2 §9.1): the Windcave session client, built from validated
// configuration with its transport, waits, clock and audit sink passed in, so the
// provider contract is testable without environment variables or a network.
//
// It answers with typed outcomes and never decides a payment: a received query is
// returned for the strict parser (R2-T3) and the shared verifier (R2-T5). A timeout,
// a malformed reply, a session still processing or an unexpected status is never
// approved or declined. The X-ID is the caller's persisted attempt identity, reused
// on every retry so the provider can recognise a repeat; the client generates none.
import { PRODUCTION_WINDCAVE_ENDPOINT, UAT_WINDCAVE_ENDPOINT, type PaymentMode } from "./config";
import { selectSessionLinks, validateCallbackAddress, type SessionLinks } from "./windcave-links";
import { normalizeTransaction, parseCentsExact } from "./windcave-query";

export type WindcaveTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface WindcaveClientConfig {
  mode: PaymentMode;
  endpoint: string;
  username: string;
  apiKey: string;
  /** Callback and notification addresses must be on exactly this origin (R2-T2). */
  publicOrigin: string | undefined;
}

export interface WindcaveClientDeps {
  config: WindcaveClientConfig;
  transport: WindcaveTransport;
  wait: (ms: number) => Promise<void>;
  clock: () => Date;
  /** Receives counts and categories only: never IDs, references, links or provider text. */
  audit: (action: string, details: Record<string, unknown>) => void;
  retryLimit?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  /** How many times a 202 refund is polled before it is left pending (R4-T1). */
  refundPollLimit?: number;
}

export interface WindcaveLink {
  rel: string;
  href: string;
  method?: string;
}

export interface CreateSessionRequest {
  xId: string;
  amount: string;
  merchantReference: string;
  customerEmail: string;
  /** Already carries a query string, so `&result=…` is appended. */
  callbackBase: string;
  notificationUrl: string;
}

export type UnknownReason = "timeout" | "network" | "server_error" | "unexpected_status";

export type CreateSessionOutcome =
  /** Only links valid for their relation and mode (R2-T2); `rejectedLinks` counts the rest. */
  | { kind: "created"; sessionId: string; links: SessionLinks; rejectedLinks: number }
  /** The X-ID was already used: confirm the session by querying it, never from this body. */
  | { kind: "duplicate"; body: unknown }
  | { kind: "rejected"; status: number }
  /** The provider may have accepted the session. */
  | { kind: "unknown"; reason: UnknownReason }
  | { kind: "malformed" }
  /** A callback or notification address is not on PUBLIC_ORIGIN; nothing was sent. */
  | { kind: "invalid_request" }
  | { kind: "disabled" };

export type QuerySessionOutcome =
  | { kind: "reply"; body: unknown }
  | { kind: "pending" }
  | { kind: "rejected"; status: number }
  | { kind: "unknown"; reason: UnknownReason }
  | { kind: "malformed" }
  | { kind: "disabled" };

/**
 * R4-T1 (plan §11.4): a refund of a captured transaction. The X-ID is the caller's
 * persisted refund identity; the client never makes one and never resends.
 */
export interface RefundRequest {
  xId: string;
  originalTransactionId: string;
  /** A canonical two-decimal amount, as charged. */
  amount: string;
  merchantReference: string;
}

export type RefundMismatchField = "type" | "amount" | "currency" | "reference" | "account";

export type RefundOutcome =
  /** The provider refunded exactly what was asked. */
  | { kind: "refunded"; refundTransactionId: string }
  /** The provider declined exactly this refund: no money moved. */
  | { kind: "declined"; refundTransactionId?: string }
  /** Accepted and still processing after the polls: reconcile, never release. */
  | { kind: "pending"; refundTransactionId?: string }
  /** The provider refused the request (4xx other than 409/429): no money moved. */
  | { kind: "rejected"; status: number }
  /** The provider may have refunded: reconcile, never release. */
  | { kind: "unknown"; reason: UnknownReason }
  | { kind: "malformed" }
  /** A reply that is not this refund: neither refunded nor declined. */
  | { kind: "mismatch"; field: RefundMismatchField }
  /** The request was not sent: a missing or malformed field. */
  | { kind: "invalid_request" }
  | { kind: "disabled" };

export interface WindcaveClient {
  createSession(request: CreateSessionRequest): Promise<CreateSessionOutcome>;
  querySession(sessionId: string): Promise<QuerySessionOutcome>;
  createRefund(request: RefundRequest): Promise<RefundOutcome>;
}

const DEFAULT_RETRY_LIMIT = 5;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_REFUND_POLL_LIMIT = 3;
// A provider transaction ID is one opaque path segment.
const TRANSACTION_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

type Exchange =
  | { kind: "response"; status: number; text: string }
  | { kind: "failed"; reason: "timeout" | "network" };

const PINNED_ENDPOINT: Readonly<Partial<Record<PaymentMode, string>>> = Object.freeze({
  uat: UAT_WINDCAVE_ENDPOINT,
  production: PRODUCTION_WINDCAVE_ENDPOINT,
});

// Configuration already pins the endpoint per mode; the client holds to it again so
// it can never be built against another host, port or path.
function isConfigured(config: WindcaveClientConfig): boolean {
  const pinned = PINNED_ENDPOINT[config.mode];
  return !!pinned && config.endpoint === pinned &&
    !!config.username && !!config.apiKey && !!config.publicOrigin;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function wellFormedLinks(value: unknown): WindcaveLink[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { rel, href, method } = entry as Record<string, unknown>;
    if (typeof rel !== "string" || typeof href !== "string") return [];
    return [typeof method === "string" ? { rel, href, method } : { rel, href }];
  });
}

export function createWindcaveClient(deps: WindcaveClientDeps): WindcaveClient {
  const { config, transport, wait, clock, audit } = deps;
  const retryLimit = deps.retryLimit ?? DEFAULT_RETRY_LIMIT;
  const retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const configured = isConfigured(config);
  const authorization = `Basic ${Buffer.from(`${config.username}:${config.apiKey}`).toString("base64")}`;
  const sessionsUrl = `${config.endpoint}/sessions`;

  const record = (action: string, details: Record<string, unknown>) =>
    audit(action, { ...details, at: clock().toISOString() });

  async function exchange(url: string, init: RequestInit): Promise<Exchange> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // R2-T6 (§9.6 "redirect"): a redirect is never followed with credentials; its 3xx
      // comes back as an unexpected status, which is unknown, never a decision.
      const response = await transport(url, { ...init, redirect: "manual", signal: controller.signal });
      const text = await response.text();
      return { kind: "response", status: response.status, text };
    } catch (error) {
      return { kind: "failed", reason: (error as Error)?.name === "AbortError" ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async createSession(request) {
      if (!configured) return { kind: "disabled" };
      if (!validateCallbackAddress(request.callbackBase, config.publicOrigin, { needsQuery: true }) ||
          !validateCallbackAddress(request.notificationUrl, config.publicOrigin, { needsQuery: false })) {
        record("CREATE_SESSION_INVALID_REQUEST", { reason: "callback_origin" });
        return { kind: "invalid_request" };
      }
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization, "X-ID": request.xId },
        body: JSON.stringify({
          type: "purchase",
          amount: request.amount,
          currency: "NZD",
          merchantReference: request.merchantReference,
          customer: { email: request.customerEmail },
          callbackUrls: {
            approved: `${request.callbackBase}&result=approved`,
            declined: `${request.callbackBase}&result=declined`,
            cancelled: `${request.callbackBase}&result=cancelled`,
          },
          notificationUrl: request.notificationUrl,
        }),
      };

      for (let attempt = 0; ; attempt++) {
        const result = await exchange(sessionsUrl, init);
        const retryable = result.kind === "failed" || result.status >= 500;
        if (retryable && attempt < retryLimit) {
          record("CREATE_SESSION_RETRY", { attempt: attempt + 1, cause: result.kind === "failed" ? result.reason : result.status });
          await wait(retryDelayMs);
          continue;
        }
        if (result.kind === "failed") {
          record("CREATE_SESSION_UNKNOWN", { reason: result.reason, attempts: attempt + 1 });
          return { kind: "unknown", reason: result.reason };
        }
        const { status, text } = result;
        if (status >= 500) {
          record("CREATE_SESSION_UNKNOWN", { reason: "server_error", status, attempts: attempt + 1 });
          return { kind: "unknown", reason: "server_error" };
        }
        if (status >= 400) {
          record("CREATE_SESSION_REJECTED", { status });
          return { kind: "rejected", status };
        }
        if (status !== 200 && status !== 202) {
          record("CREATE_SESSION_UNKNOWN", { reason: "unexpected_status", status });
          return { kind: "unknown", reason: "unexpected_status" };
        }
        const parsed = parseJson(text);
        if (!parsed.ok) {
          record("CREATE_SESSION_MALFORMED", { status });
          return { kind: "malformed" };
        }
        if (status === 200) {
          record("CREATE_SESSION_DUPLICATE", { status });
          return { kind: "duplicate", body: parsed.value };
        }
        const body = parsed.value as Record<string, unknown> | null;
        const sessionId = body && typeof body === "object" ? body.id : undefined;
        const links = body && typeof body === "object" ? wellFormedLinks(body.links) : null;
        if (typeof sessionId !== "string" || sessionId.length === 0 || !links) {
          record("CREATE_SESSION_MALFORMED", { status });
          return { kind: "malformed" };
        }
        const selected = selectSessionLinks(links, config.mode);
        record("CREATE_SESSION_CREATED", { links: links.length, rejectedLinks: selected.rejected });
        return { kind: "created", sessionId, links: selected.links, rejectedLinks: selected.rejected };
      }
    },

    async querySession(sessionId) {
      if (!configured) return { kind: "disabled" };
      // One encoded path segment: callers may pass an ID a browser sent.
      const url = `${sessionsUrl}/${encodeURIComponent(sessionId)}`;
      const init: RequestInit = { method: "GET", headers: { Authorization: authorization } };

      for (let attempt = 0; ; attempt++) {
        const result = await exchange(url, init);
        const retryable = result.kind === "failed" || result.status >= 500 || result.status === 202;
        if (retryable && attempt < retryLimit) {
          record("QUERY_SESSION_RETRY", { attempt: attempt + 1, cause: result.kind === "failed" ? result.reason : result.status });
          await wait(retryDelayMs);
          continue;
        }
        if (result.kind === "failed") {
          record("QUERY_SESSION_UNKNOWN", { reason: result.reason, attempts: attempt + 1 });
          return { kind: "unknown", reason: result.reason };
        }
        const { status, text } = result;
        if (status === 202) {
          record("QUERY_SESSION_PENDING", { attempts: attempt + 1 });
          return { kind: "pending" };
        }
        if (status >= 500) {
          record("QUERY_SESSION_UNKNOWN", { reason: "server_error", status, attempts: attempt + 1 });
          return { kind: "unknown", reason: "server_error" };
        }
        if (status >= 400) {
          record("QUERY_SESSION_REJECTED", { status });
          return { kind: "rejected", status };
        }
        if (status !== 200) {
          record("QUERY_SESSION_UNKNOWN", { reason: "unexpected_status", status });
          return { kind: "unknown", reason: "unexpected_status" };
        }
        const parsed = parseJson(text);
        if (!parsed.ok) {
          record("QUERY_SESSION_MALFORMED", { status });
          return { kind: "malformed" };
        }
        record("QUERY_SESSION_REPLY", { status });
        return { kind: "reply", body: parsed.value };
      }
    },

    async createRefund(request) {
      if (!configured) return { kind: "disabled" };
      const asked = parseCentsExact(request.amount);
      if (
        typeof request.xId !== "string" || request.xId.length === 0 || request.xId.length > 64 ||
        !asked.ok || asked.cents <= 0 ||
        !TRANSACTION_TOKEN.test(request.originalTransactionId ?? "") ||
        typeof request.merchantReference !== "string" ||
        request.merchantReference.length === 0 || request.merchantReference.length > 64
      ) {
        record("REFUND_INVALID_REQUEST", {});
        return { kind: "invalid_request" };
      }
      const transactionsUrl = `${config.endpoint}/transactions`;
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization, "X-ID": request.xId },
        // The field naming the original transaction is as it was before R4; it is not
        // confirmed against Windcave's reference and is checked in UAT (R4-T1 review).
        body: JSON.stringify({
          type: "refund",
          amount: request.amount,
          currency: "NZD",
          merchantReference: request.merchantReference,
          transaction2Id: request.originalTransactionId,
        }),
      };

      // Never resent here: a lost reply may still be a refund at the provider.
      const first = await exchange(transactionsUrl, init);
      const settled = classifyRefundReply(first);
      if (settled.kind !== "processing") return settled.outcome;

      // A 202: poll the transaction itself, only on the configured endpoint.
      const pollUrl = refundPollUrl(settled.body, transactionsUrl);
      const pendingId = refundTransactionIdOf(settled.body);
      if (!pollUrl) {
        record("REFUND_PENDING", { polls: 0 });
        return pendingId ? { kind: "pending", refundTransactionId: pendingId } : { kind: "pending" };
      }
      const pollLimit = deps.refundPollLimit ?? DEFAULT_REFUND_POLL_LIMIT;
      for (let poll = 1; poll <= pollLimit; poll++) {
        await wait(retryDelayMs);
        const polled = classifyRefundReply(await exchange(pollUrl, { method: "GET", headers: { Authorization: authorization } }));
        if (polled.kind !== "processing") return polled.outcome;
      }
      record("REFUND_PENDING", { polls: pollLimit });
      return pendingId ? { kind: "pending", refundTransactionId: pendingId } : { kind: "pending" };

      function classifyRefundReply(result: Exchange):
        | { kind: "processing"; body: unknown }
        | { kind: "final"; outcome: RefundOutcome } {
        if (result.kind === "failed") {
          record("REFUND_UNKNOWN", { reason: result.reason });
          return { kind: "final", outcome: { kind: "unknown", reason: result.reason } };
        }
        const { status, text } = result;
        if (status === 202) {
          const parsed = parseJson(text);
          return { kind: "processing", body: parsed.ok ? parsed.value : null };
        }
        if (status >= 500) {
          record("REFUND_UNKNOWN", { reason: "server_error", status });
          return { kind: "final", outcome: { kind: "unknown", reason: "server_error" } };
        }
        // 409 (same X-ID, another payload) and 429 (same X-ID at once) do not say the
        // refund did not happen: unknown, never a refusal that releases money.
        if (status === 409 || status === 429 || (status !== 200 && status !== 201 && status < 400)) {
          record("REFUND_UNKNOWN", { reason: "unexpected_status", status });
          return { kind: "final", outcome: { kind: "unknown", reason: "unexpected_status" } };
        }
        if (status >= 400) {
          record("REFUND_REJECTED", { status });
          return { kind: "final", outcome: { kind: "rejected", status } };
        }
        const parsed = parseJson(text);
        const transaction = parsed.ok ? normalizeTransaction(parsed.value) : null;
        if (!transaction) {
          record("REFUND_MALFORMED", { status });
          return { kind: "final", outcome: { kind: "malformed" } };
        }
        const field: RefundMismatchField | null =
          transaction.type !== "refund" ? "type"
            : transaction.amountCents !== (asked.ok ? asked.cents : -1) ? "amount"
              : transaction.currency !== "NZD" ? "currency"
                : transaction.merchantReference !== request.merchantReference ? "reference"
                  : transaction.username !== undefined && transaction.username !== config.username ? "account"
                    : null;
        if (field) {
          record("REFUND_MISMATCH", { field });
          return { kind: "final", outcome: { kind: "mismatch", field } };
        }
        record(transaction.authorised ? "REFUND_REFUNDED" : "REFUND_DECLINED", {});
        return {
          kind: "final",
          outcome: transaction.authorised
            ? { kind: "refunded", refundTransactionId: transaction.id }
            : { kind: "declined", refundTransactionId: transaction.id },
        };
      }
    },
  };
}

/** A 202 reply's own transaction ID, when it is one opaque token. */
function refundTransactionIdOf(body: unknown): string | undefined {
  const id = body && typeof body === "object" ? (body as Record<string, unknown>).id : undefined;
  return typeof id === "string" && TRANSACTION_TOKEN.test(id) ? id : undefined;
}

/**
 * Where a 202 refund is polled: its `self` link only when it is exactly a transaction on
 * the configured endpoint, else that endpoint plus the reply's own ID; else nowhere.
 */
function refundPollUrl(body: unknown, transactionsUrl: string): string | undefined {
  const links = body && typeof body === "object" ? wellFormedLinks((body as Record<string, unknown>).links) : null;
  const self = links?.find((link) => link.rel === "self" && (!link.method || link.method === "GET"))?.href;
  if (self) {
    try {
      const url = new URL(self);
      const base = new URL(transactionsUrl);
      const token = url.pathname.startsWith(`${base.pathname}/`) ? url.pathname.slice(base.pathname.length + 1) : "";
      if (url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash &&
          TRANSACTION_TOKEN.test(token) && url.href === self) {
        return self;
      }
    } catch {
      // Fall through to the reply's own ID.
    }
  }
  const id = refundTransactionIdOf(body);
  return id ? `${transactionsUrl}/${encodeURIComponent(id)}` : undefined;
}

