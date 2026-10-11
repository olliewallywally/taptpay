// R2-T1 (plan v2.2 §9.1): the Windcave session client, built from validated
// configuration with its transport, waits, clock and audit sink passed in, so the
// provider contract is testable without environment variables or a network.
//
// It answers with typed outcomes and never decides a payment: a received query is
// returned for the strict parser (R2-T3) and the shared verifier (R2-T5). A timeout,
// a malformed reply, a session still processing or an unexpected status is never
// approved or declined. The X-ID is the caller's persisted attempt identity, reused
// on every retry so the provider can recognise a repeat; the client generates none.
import type { PaymentMode } from "./config";

export type WindcaveTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface WindcaveClientConfig {
  mode: PaymentMode;
  endpoint: string;
  username: string;
  apiKey: string;
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
  | { kind: "created"; sessionId: string; links: WindcaveLink[] }
  /** The X-ID was already used: confirm the session by querying it, never from this body. */
  | { kind: "duplicate"; body: unknown }
  | { kind: "rejected"; status: number }
  /** The provider may have accepted the session. */
  | { kind: "unknown"; reason: UnknownReason }
  | { kind: "malformed" }
  | { kind: "disabled" };

export type QuerySessionOutcome =
  | { kind: "reply"; body: unknown }
  | { kind: "pending" }
  | { kind: "rejected"; status: number }
  | { kind: "unknown"; reason: UnknownReason }
  | { kind: "malformed" }
  | { kind: "disabled" };

export interface WindcaveClient {
  createSession(request: CreateSessionRequest): Promise<CreateSessionOutcome>;
  querySession(sessionId: string): Promise<QuerySessionOutcome>;
}

const DEFAULT_RETRY_LIMIT = 5;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_TIMEOUT_MS = 15000;

type Exchange =
  | { kind: "response"; status: number; text: string }
  | { kind: "failed"; reason: "timeout" | "network" };

function isConfigured(config: WindcaveClientConfig): boolean {
  return (config.mode === "uat" || config.mode === "production") &&
    !!config.endpoint && !!config.username && !!config.apiKey;
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
      const response = await transport(url, { ...init, signal: controller.signal });
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
        record("CREATE_SESSION_CREATED", { links: links.length });
        return { kind: "created", sessionId, links };
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
  };
}
