// Windcave RESTful API Integration
import crypto from "crypto";
import { redactSensitive } from "./request-log";
import { config } from "./config";
import { createWindcaveClient, type RefundOutcome, type RefundRequest, type UnknownReason, type WindcaveClient } from "./windcave-client";
import { selectSessionLinks, validateCallbackAddress, validateWindcaveLink, windcaveScriptEnv } from "./windcave-links";
import { normalizeSessionQuery, parseCentsExact } from "./windcave-query";
import { verifyWindcaveOutcome, type WindcaveExpectedOutcome } from "./windcave-verify";
import { writeSecurityAuditEvent } from "./security-audit-log";

export type { WindcaveExpectedOutcome } from "./windcave-verify";

const WINDCAVE_ENDPOINT = config.windcave.endpoint || "";
const SESSION_URL = `${WINDCAVE_ENDPOINT}/sessions`;
const TRANSACTION_URL = `${WINDCAVE_ENDPOINT}/transactions`;
const REQUEST_TIMEOUT = 15000;
const RETRY_LIMIT = 5;

export function getWindcaveEnv(): "uat" | "sec" {
  return windcaveScriptEnv(config.paymentMode);
}

const PROCESSOR_AUDIT_VALUE_KEY = /(?:session|x[-_]?id|transactionId|txId|refundTxId|merchantReference|url|href|body)/i;

export function sanitizeWindcaveAuditDetails(details: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      PROCESSOR_AUDIT_VALUE_KEY.test(key) ? "[REDACTED]" : redactSensitive(value, key),
    ]),
  );
}

function logAudit(action: string, details: Record<string, any>) {
  const sanitized = sanitizeWindcaveAuditDetails(details);
  console.log(`[WINDCAVE] [${new Date().toISOString()}] ${action}:`, JSON.stringify(sanitized));
}

// R2-T6 (RF-6): what a failure may say outside this module. Provider reply text can echo
// request details (session IDs, references, tokens), and a transport error can name the
// request, so callers get a status or a category only; they log, store and show these.
function providerFailure(status: number, label = "Windcave"): string {
  return `${label} ${status}`;
}

function transportFailure(err: unknown): "timeout" | "network" {
  return (err as Error | undefined)?.name === "AbortError" ? "timeout" : "network";
}

function buildAuthHeader(): string {
  const username = config.windcave.username || "";
  const apiKey = config.windcave.apiKey || "";
  return `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`;
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    // R2-T6: never follow a redirect with credentials or a wallet token.
    return await fetch(url, { ...options, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export interface CreateSessionResult {
  success: boolean;
  // Legacy HPP URL (kept for backward compatibility)
  hppUrl?: string;
  // Hosted Fields — card form AJAX submission URL
  ajaxSubmitCardUrl?: string;
  // Apple Pay JS wrapper AJAX submission URL
  ajaxSubmitApplePayUrl?: string;
  // Google Pay AJAX submission URL
  ajaxSubmitGooglePayUrl?: string;
  sessionId?: string;
  alreadyComplete?: boolean;
  approved?: boolean;
  windcaveTransactionId?: string;
  error?: string;
}

export interface QuerySessionResult {
  success: boolean;
  approved?: boolean;
  windcaveTransactionId?: string;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  refundTransactionId?: string;
  /** A fixed code, never provider text (R2-T6). */
  error?: string;
  /** R4-T1: what the provider's reply established; the route acts on this. */
  outcome: RefundOutcome;
}

// Session creation and query run through the injectable client (R2-T1,
// server/windcave-client.ts). These wrappers keep the return shapes the routes use
// today; the routes move onto typed outcomes and the shared verifier in R2-T5.
let sessionClient: WindcaveClient | undefined;
let singleAttemptClient: WindcaveClient | undefined;

/** One exchange, no retries: for a merchant waiting on a decision (OI-1's cancel check).
 * "Cannot say yet" is a safe answer there, so a slow provider costs one timeout, not minutes. */
function singleAttemptSessionClient(): WindcaveClient {
  return singleAttemptClient ??= createWindcaveClient({
    config: {
      mode: config.paymentMode,
      endpoint: config.windcave.endpoint || "",
      username: config.windcave.username || "",
      apiKey: config.windcave.apiKey || "",
      publicOrigin: config.publicOrigin,
    },
    transport: (url, init) => fetch(url, init),
    wait: delay,
    clock: () => new Date(),
    audit: logAudit,
    retryLimit: 0,
  });
}

function defaultSessionClient(): WindcaveClient {
  return sessionClient ??= createWindcaveClient({
    config: {
      mode: config.paymentMode,
      endpoint: config.windcave.endpoint || "",
      username: config.windcave.username || "",
      apiKey: config.windcave.apiKey || "",
      publicOrigin: config.publicOrigin,
    },
    // Resolved per call, so the no-network test guard and fetch spies still apply.
    transport: (url, init) => fetch(url, init),
    wait: delay,
    clock: () => new Date(),
    audit: logAudit,
  });
}

function legacyFailure(outcome: { kind: "rejected"; status: number } | { kind: "unknown"; reason: UnknownReason } | { kind: "malformed" } | { kind: "invalid_request" } | { kind: "disabled" }): string {
  switch (outcome.kind) {
    // Provider text is not carried: it can echo request details (RF-6).
    case "rejected": return `Windcave ${outcome.status}`;
    case "unknown":
      return outcome.reason === "timeout" ? "Windcave request timed out"
        : outcome.reason === "network" ? "Windcave network error"
        : outcome.reason === "server_error" ? "Windcave server error"
        : "Unexpected Windcave status";
    case "malformed": return "Unreadable provider response body";
    case "invalid_request": return "Callback address is not on the public origin";
    case "disabled": return "Payment provider is not configured";
  }
}

// Create a Windcave payment session — returns all available submission URLs
export async function createWindcaveSession(
  xId: string,
  amount: string,
  merchantReference: string,
  customerEmail: string,
  baseUrl: string,
  transactionId: number,
  /** Unused: retries now happen inside the client, with the same X-ID. */
  _retries = 0,
  // Optional override for non-retail flows (e.g. property rent checkout) that need
  // their own callback/notification routes. callbackBase must already contain a `?`
  // query string so `&result=...` can be appended.
  callbacks?: { callbackBase: string; notificationUrl: string }
): Promise<CreateSessionResult> {
  const outcome = await defaultSessionClient().createSession({
    xId,
    amount,
    merchantReference,
    customerEmail,
    callbackBase: callbacks?.callbackBase ?? `${baseUrl}/api/windcave/callback?transactionId=${transactionId}`,
    notificationUrl: callbacks?.notificationUrl ?? `${baseUrl}/api/windcave/notification`,
  });

  if (outcome.kind === "created") {
    // Validated per relation (R2-T2); no other REDIRECT link stands in for the hosted page.
    return {
      success: true,
      sessionId: outcome.sessionId,
      hppUrl: outcome.links.hpp,
      ajaxSubmitCardUrl: outcome.links.ajaxSubmitCard,
      ajaxSubmitApplePayUrl: outcome.links.ajaxSubmitApplePay,
      ajaxSubmitGooglePayUrl: outcome.links.ajaxSubmitGooglePay,
      alreadyComplete: false,
    };
  }

  if (outcome.kind === "duplicate") {
    // R2-T5 (RF-3): an X-ID already used names a session that exists; whether it paid
    // is confirmed only by a verified query, never read from this reply.
    const data = outcome.body as { id?: unknown } | null;
    if (!data || typeof data !== "object" || typeof data.id !== "string" || data.id.length === 0) {
      return { success: false, error: legacyFailure({ kind: "malformed" }) };
    }
    return { success: true, sessionId: data.id, alreadyComplete: true };
  }

  return { success: false, error: legacyFailure(outcome) };
}

/** The environment this server's provider configuration targets. */
export function currentProviderEnvironment(): "uat" | "production" {
  return config.paymentMode === "production" ? "production" : "uat";
}

// Query a session and settle only on an outcome verified against what the payment
// expected (R2-T5, plan §9.5). success:true means a verified approval or decline; every
// other answer (pending, unverifiable, mismatch, provider failure) leaves the payment
// reconcilable. A mismatch is recorded as a sanitized security event (field only).
export async function queryWindcaveSession(
  sessionId: string,
  expected: WindcaveExpectedOutcome | null,
  options: { singleAttempt?: boolean } = {},
): Promise<QuerySessionResult> {
  if (!expected) return { success: false, error: "unverifiable:no_expected" };
  if (expected.sessionId !== sessionId) {
    writeSecurityAuditEvent("PROVIDER_OUTCOME_MISMATCH", { field: "session" });
    return { success: false, error: "integrity_mismatch:session" };
  }
  const outcome = await (options.singleAttempt ? singleAttemptSessionClient() : defaultSessionClient()).querySession(sessionId);
  if (outcome.kind === "pending") return { success: false, error: "Session still processing after max retries" };
  if (outcome.kind !== "reply") return { success: false, error: legacyFailure(outcome) };

  const verified = verifyWindcaveOutcome(expected, normalizeSessionQuery(outcome.body, sessionId), {
    providerEnvironment: currentProviderEnvironment(),
    accountUsername: config.windcave.username || "",
  });
  switch (verified.kind) {
    case "approved":
      return { success: true, approved: true, windcaveTransactionId: verified.providerTransactionId };
    case "declined":
      return { success: true, approved: false };
    case "pending":
      return { success: false, error: "pending" };
    case "unverifiable":
      return { success: false, error: `unverifiable:${verified.reason}` };
    case "mismatch":
      writeSecurityAuditEvent("PROVIDER_OUTCOME_MISMATCH", { field: verified.field });
      return { success: false, error: `integrity_mismatch:${verified.field}` };
  }
}

// ---------------------------------------------------------------------------
// Card-on-file — TaptPay's own subscription billing
// ---------------------------------------------------------------------------
//
// These calls bill the *merchant* for their TaptPay subscription, so they run on
// TaptPay's platform Windcave credentials (WINDCAVE_USERNAME / WINDCAVE_API_KEY),
// not on any merchant's own Windcave account. The merchant is the cardholder.
//
// These values follow Windcave REST v1's Stored Card Implementation contract for
// a fixed monthly recurring sequence. A real UAT run is still required before
// production credentials are used: the REST user must have stored cards and
// non-payment authentication enabled.
const CARD_ON_FILE_FIELDS = {
  /** Zero-dollar validation stores the card without placing a hold. */
  storeSessionType: "validate",
  storeCardFlag: "storeCard",
  initialStoredCardIndicator: "recurringfixedinitial",
  establishedStoredCardIndicator: "recurringfixed",
  recurringExpiry: "9999-12-31",
  recurringFrequency: "monthly",
} as const;

const TRANSACTION_POLL_LIMIT = 5;
const TRANSACTION_POLL_INTERVAL_MS = 5000;

type WindcaveRequest = (url: string, options: RequestInit) => Promise<Response>;

interface CardOnFileRequestOptions {
  /** Injectable transport/wait hooks keep the provider contract deterministic in tests. */
  request?: WindcaveRequest;
  wait?: (ms: number) => Promise<void>;
  transactionPollLimit?: number;
}

export interface StoreCardSessionResult {
  success: boolean;
  sessionId?: string;
  hppUrl?: string;
  error?: string;
}

export interface StoredCard {
  cardId: string;
  brand: string | null;
  last4: string | null;
  /** MM/YY */
  expiry: string | null;
}

export interface StoredCardSessionResult {
  success: boolean;
  /** True once the shopper has completed the hosted card form. */
  complete?: boolean;
  approved?: boolean;
  card?: StoredCard;
  error?: string;
}

export interface ChargeStoredCardResult {
  success: boolean;
  approved?: boolean;
  windcaveTransactionId?: string;
  /** Windcave's decline text, safe to log; never shown verbatim to a merchant. */
  declineReason?: string;
  error?: string;
}

/** Maps Windcave's card type strings onto the brands we display. */
function normaliseCardBrand(raw: unknown): string | null {
  const value = String(raw || "").toLowerCase();
  if (!value) return null;
  if (value.includes("visa")) return "Visa";
  if (value.includes("master")) return "Mastercard";
  if (value.includes("amex") || value.includes("american")) return "Amex";
  return String(raw);
}

function extractStoredCard(tx: any): StoredCard | undefined {
  const card = tx?.card;
  const cardId = String(card?.id ?? "").trim();
  if (!cardId) return undefined;

  const expiryMonth = Number(card?.dateExpiryMonth);
  const expiryYear = String(card?.dateExpiryYear ?? "").trim();
  const month = Number.isInteger(expiryMonth) && expiryMonth >= 1 && expiryMonth <= 12
    ? String(expiryMonth).padStart(2, "0")
    : "";
  const year = /^\d{2}(?:\d{2})?$/.test(expiryYear) ? expiryYear.slice(-2) : "";
  const masked = String(card?.cardNumber ?? "");
  const last4 = masked.replace(/\D/g, "").slice(-4) || null;
  return {
    cardId,
    brand: normaliseCardBrand(card?.type ?? card?.cardType),
    last4,
    expiry: month && year ? `${month}/${year}` : null,
  };
}

/**
 * Opens a hosted Windcave page that captures a card and stores it for reuse. The
 * PAN never reaches this server, which is the whole point: we keep only the
 * token and the masked metadata Windcave hands back.
 */
export async function createCardStorageSession(
  xId: string,
  merchantReference: string,
  customerEmail: string,
  callbackBase: string,
  notificationUrl: string,
  options: CardOnFileRequestOptions = {},
): Promise<StoreCardSessionResult> {
  const body = {
    type: CARD_ON_FILE_FIELDS.storeSessionType,
    amount: "0.00",
    currency: "NZD",
    merchantReference,
    methods: ["card"],
    [CARD_ON_FILE_FIELDS.storeCardFlag]: true,
    storedCardIndicator: CARD_ON_FILE_FIELDS.initialStoredCardIndicator,
    recurringExpiry: CARD_ON_FILE_FIELDS.recurringExpiry,
    recurringFrequency: CARD_ON_FILE_FIELDS.recurringFrequency,
    customer: { email: customerEmail },
    callbackUrls: {
      approved: `${callbackBase}&result=approved`,
      declined: `${callbackBase}&result=declined`,
      cancelled: `${callbackBase}&result=cancelled`,
    },
    notificationUrl,
  };

  // R2-T6: the addresses the provider calls back are on exactly PUBLIC_ORIGIN (R2-T2).
  if (!validateCallbackAddress(callbackBase, config.publicOrigin, { needsQuery: true }) ||
      !validateCallbackAddress(notificationUrl, config.publicOrigin, { needsQuery: false })) {
    logAudit("STORE_CARD_SESSION_INVALID_REQUEST", { reason: "callback_origin" });
    return { success: false, error: "invalid_request" };
  }

  logAudit("STORE_CARD_SESSION_REQUEST", { xId, merchantReference });

  let response: Response;
  try {
    const request = options.request ?? fetchWithTimeout;
    response = await request(SESSION_URL, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
        "X-ID": xId,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    logAudit("STORE_CARD_SESSION_NETWORK_ERROR", { xId, error: transportFailure(err) });
    return { success: false, error: transportFailure(err) };
  }

  const text = await response.text();
  if (response.status === 202 || response.status === 200) {
    const data = parseWindcaveJson(text);
    // R2-T6: only the `hpp` relation, valid for this mode (R2-T2), goes to the browser;
    // no other REDIRECT link stands in for it.
    const links = Array.isArray(data?.links)
      ? data.links.filter((link: any) => typeof link?.rel === "string" && typeof link?.href === "string")
      : [];
    const selected = selectSessionLinks(links, config.paymentMode);
    if (typeof data?.id !== "string" || data.id.length === 0 || !selected.links.hpp) {
      logAudit("STORE_CARD_SESSION_LINK_REJECTED", { xId, rejectedLinks: selected.rejected });
      return { success: false, error: "Windcave card setup reply had no valid hosted page" };
    }
    logAudit("STORE_CARD_SESSION_CREATED", { xId, sessionId: data.id, rejectedLinks: selected.rejected });
    return { success: true, sessionId: data.id, hppUrl: selected.links.hpp };
  }

  logAudit("STORE_CARD_SESSION_ERROR", { xId, status: response.status, bytes: text.length });
  return { success: false, error: providerFailure(response.status) };
}

/** Reads back the card token once the shopper has finished the hosted form. */
export async function queryStoredCardSession(
  sessionId: string,
  options: Pick<CardOnFileRequestOptions, "request"> = {},
): Promise<StoredCardSessionResult> {
  logAudit("STORE_CARD_QUERY", { sessionId });
  // Provider ids are opaque path segments, never paths. Reject traversal-like
  // values here as a second line of defence behind the API request schema.
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(sessionId)) {
    return { success: false, error: "Invalid Windcave session id" };
  }

  let response: Response;
  try {
    const request = options.request ?? fetchWithTimeout;
    response = await request(`${SESSION_URL}/${encodeURIComponent(sessionId)}`, {
      method: "GET",
      redirect: "manual",
      headers: { Authorization: buildAuthHeader() },
    });
  } catch (err: any) {
    logAudit("STORE_CARD_QUERY_NETWORK_ERROR", { sessionId, error: transportFailure(err) });
    return { success: false, error: transportFailure(err) };
  }

  const text = await response.text();
  if (response.status === 202) {
    // Shopper has not finished yet — not an error, just not ready.
    return { success: true, complete: false };
  }
  if (response.status !== 200) {
    logAudit("STORE_CARD_QUERY_ERROR", { sessionId, status: response.status });
    return { success: false, error: providerFailure(response.status) };
  }

  const data = parseWindcaveJson(text);
  // R2-T6: a reply that names another session is never this card's (checked when the
  // reply names one; whether to require it waits on UAT, owner direction 2026-10-12).
  if (data && typeof data === "object" && data.id !== undefined && data.id !== sessionId) {
    logAudit("STORE_CARD_QUERY_MISMATCH", { field: "session" });
    writeSecurityAuditEvent("PROVIDER_OUTCOME_MISMATCH", { field: "session" });
    return { success: false, error: "integrity_mismatch:session" };
  }
  if (typeof data?.state === "string" && data.state !== "complete") {
    return { success: true, complete: false };
  }
  const transactions: any[] | undefined = Array.isArray(data?.transactions) ? data.transactions : undefined;
  if (!transactions || transactions.length === 0 || transactions.some((entry) => typeof entry?.authorised !== "boolean")) {
    logAudit("STORE_CARD_QUERY_INVALID_RESULT", { sessionId });
    return {
      success: false,
      error: "Windcave stored-card session response did not include a final transaction result",
    };
  }
  // One authorised result, or only declines; two authorised results are ambiguous.
  const authorisedEntries = transactions.filter((entry) => entry.authorised === true);
  if (authorisedEntries.length > 1) {
    logAudit("STORE_CARD_QUERY_AMBIGUOUS", { sessionId, authorised: authorisedEntries.length });
    return { success: false, error: "Windcave stored-card session response was ambiguous" };
  }
  const tx = authorisedEntries[0] ?? transactions[0];

  const approved = authorisedEntries.length === 1;
  const card = approved ? extractStoredCard(tx) : undefined;
  logAudit("STORE_CARD_QUERY_RESULT", { sessionId, approved, hasCard: !!card });

  if (!approved) {
    return { success: true, complete: true, approved: false };
  }
  if (!card) {
    return {
      success: false,
      error: "Windcave stored-card session response did not include a stored card",
    };
  }
  return { success: true, complete: true, approved: true, card };
}

/**
 * Charges a stored card for a subscription period.
 *
 * `xId` MUST be stable for a given subscription period — it is Windcave's
 * idempotency key, and it is the only thing standing between a retried request
 * and a double charge. Callers derive it from the subscription id plus the
 * period start, never from a random value.
 *
 * Retries are deliberately NOT automatic here. An ambiguous timeout on a charge
 * is safer to resolve by re-running the billing job (same X-ID) than by
 * hammering the endpoint inside one request.
 */
export async function chargeStoredCard(
  xId: string,
  cardId: string,
  amount: string,
  merchantReference: string,
  options: CardOnFileRequestOptions = {},
): Promise<ChargeStoredCardResult> {
  const body = {
    type: "purchase",
    amount,
    currency: "NZD",
    merchantReference,
    cardId,
    storedCardIndicator: CARD_ON_FILE_FIELDS.establishedStoredCardIndicator,
    recurringExpiry: CARD_ON_FILE_FIELDS.recurringExpiry,
    recurringFrequency: CARD_ON_FILE_FIELDS.recurringFrequency,
  };

  logAudit("CHARGE_STORED_CARD_REQUEST", { xId, merchantReference, amount });

  let response: Response;
  try {
    const request = options.request ?? fetchWithTimeout;
    response = await request(TRANSACTION_URL, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
        "X-ID": xId,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    logAudit("CHARGE_STORED_CARD_NETWORK_ERROR", { xId, error: transportFailure(err) });
    return { success: false, error: transportFailure(err) };
  }

  const text = await response.text();
  if (response.status === 202) {
    const pending = parseWindcaveJson(text);
    const pollUrl = transactionPollUrl(pending);
    if (!pollUrl) {
      logAudit("CHARGE_STORED_CARD_PENDING_INVALID", { xId, bytes: text.length });
      return { success: false, error: "Windcave returned a pending transaction without an id" };
    }
    return pollStoredCardCharge(xId, pollUrl, pending?.id ?? pending?.transactionId, { amount, merchantReference }, options);
  }

  if (response.status !== 200 && response.status !== 201) {
    logAudit("CHARGE_STORED_CARD_ERROR", { xId, status: response.status, bytes: text.length });
    return { success: false, error: providerFailure(response.status) };
  }

  return finalStoredCardChargeResult(xId, parseWindcaveJson(text), { amount, merchantReference });
}

function parseWindcaveJson(text: string): any | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** What a stored-card charge asked for: its reply must not say otherwise. */
interface StoredCardCharge {
  amount: string;
  merchantReference: string;
}

/**
 * R2-T6 (plan §9.5 for the card-on-file charge): the reply's type, exact amount, currency
 * and reference must be what was charged. Each is checked when the reply carries it;
 * requiring them waits on an official UAT reply (owner direction 2026-10-12).
 */
function storedCardChargeMismatch(data: any, charged: StoredCardCharge): "type" | "amount" | "currency" | "reference" | null {
  if (data.type !== undefined && data.type !== "purchase") return "type";
  if (data.amount !== undefined) {
    const replied = parseCentsExact(data.amount);
    const asked = parseCentsExact(charged.amount);
    if (!replied.ok || !asked.ok || replied.cents !== asked.cents) return "amount";
  }
  if (data.currency !== undefined && data.currency !== "NZD") return "currency";
  if (data.merchantReference !== undefined && data.merchantReference !== charged.merchantReference) return "reference";
  return null;
}

function finalStoredCardChargeResult(
  xId: string,
  data: any,
  charged: StoredCardCharge,
  fallbackTransactionId?: string,
): ChargeStoredCardResult {
  const rawTransactionId = data?.id ?? data?.transactionId ?? fallbackTransactionId;
  const windcaveTransactionId = rawTransactionId ? String(rawTransactionId) : undefined;

  // `authorised` is Windcave's documented final outcome. A final response without it is an
  // incomplete/malformed provider response, not a card decline (which would burn
  // a dunning attempt).
  if (typeof data?.authorised !== "boolean") {
    logAudit("CHARGE_STORED_CARD_INVALID_RESULT", { xId, txId: windcaveTransactionId });
    return {
      success: false,
      windcaveTransactionId,
      error: "Windcave transaction response did not include an authorised result",
    };
  }

  // A reply for something other than this charge is neither an approval nor a decline.
  const mismatch = storedCardChargeMismatch(data, charged);
  if (mismatch) {
    logAudit("CHARGE_STORED_CARD_MISMATCH", { xId, field: mismatch });
    writeSecurityAuditEvent("PROVIDER_OUTCOME_MISMATCH", { field: mismatch });
    return { success: false, windcaveTransactionId, error: `integrity_mismatch:${mismatch}` };
  }

  const approved = data.authorised;
  logAudit("CHARGE_STORED_CARD_RESULT", { xId, approved, txId: windcaveTransactionId });
  return {
    success: true,
    approved,
    windcaveTransactionId,
    declineReason: approved
      ? undefined
      : String(data.responseText || data.reCo || data.responseCode || "Declined"),
  };
}

/**
 * Windcave says to poll the 202 response's `rel=self` transaction URL. Only send
 * platform credentials back to the configured Windcave origin/path; if a
 * malformed response supplies another host, reconstruct the URL from its id.
 */
function transactionPollUrl(data: any): string | undefined {
  const selfHref = Array.isArray(data?.links)
    ? data.links.find((link: any) => link?.rel === "self" && (!link.method || link.method === "GET"))?.href
    : undefined;

  if (typeof selfHref === "string") {
    try {
      const candidate = new URL(selfHref);
      const configured = new URL(TRANSACTION_URL);
      const transactionPath = `${configured.pathname.replace(/\/+$/, "")}/`;
      if (candidate.origin === configured.origin && candidate.pathname.startsWith(transactionPath)) {
        return candidate.toString();
      }
    } catch {
      // Fall through to the provider transaction id below.
    }
  }

  const transactionId = data?.id ?? data?.transactionId;
  if (typeof transactionId !== "string" && typeof transactionId !== "number") return undefined;
  const value = String(transactionId).trim();
  return value ? `${TRANSACTION_URL}/${encodeURIComponent(value)}` : undefined;
}

async function pollStoredCardCharge(
  xId: string,
  pollUrl: string,
  fallbackTransactionId: unknown,
  charged: StoredCardCharge,
  options: CardOnFileRequestOptions,
): Promise<ChargeStoredCardResult> {
  const request = options.request ?? fetchWithTimeout;
  const wait = options.wait ?? delay;
  const configuredLimit = options.transactionPollLimit ?? TRANSACTION_POLL_LIMIT;
  const pollLimit = Number.isFinite(configuredLimit)
    ? Math.max(0, Math.floor(configuredLimit))
    : TRANSACTION_POLL_LIMIT;
  const fallbackId = fallbackTransactionId == null ? undefined : String(fallbackTransactionId);

  for (let attempt = 1; attempt <= pollLimit; attempt += 1) {
    await wait(TRANSACTION_POLL_INTERVAL_MS);

    let response: Response;
    try {
      response = await request(pollUrl, {
        method: "GET",
        redirect: "manual",
        headers: { Authorization: buildAuthHeader() },
      });
    } catch (err: any) {
      logAudit("CHARGE_STORED_CARD_POLL_NETWORK_ERROR", { xId, pollAttempt: attempt, error: transportFailure(err) });
      return { success: false, windcaveTransactionId: fallbackId, error: transportFailure(err) };
    }

    const text = await response.text();
    if (response.status === 202) {
      logAudit("CHARGE_STORED_CARD_PENDING", { xId, pollAttempt: attempt, txId: fallbackId });
      continue;
    }
    if (response.status !== 200) {
      logAudit("CHARGE_STORED_CARD_POLL_ERROR", {
        xId,
        pollAttempt: attempt,
        status: response.status,
        bytes: text.length,
      });
      return {
        success: false,
        windcaveTransactionId: fallbackId,
        error: providerFailure(response.status),
      };
    }

    return finalStoredCardChargeResult(xId, parseWindcaveJson(text), charged, fallbackId);
  }

  logAudit("CHARGE_STORED_CARD_POLL_EXHAUSTED", { xId, pollLimit, txId: fallbackId });
  return {
    success: false,
    windcaveTransactionId: fallbackId,
    error: `Windcave transaction still processing after ${pollLimit} polls`,
  };
}

// Submit a Google Pay token to Windcave's ajaxSubmitGooglePay endpoint
export async function submitGooglePayToken(
  ajaxSubmitGooglePayUrl: string,
  googlePayToken: object
): Promise<{ success: boolean; approved?: boolean; windcaveTransactionId?: string; error?: string }> {
  // R2-T2: the wallet token goes only to this mode's documented Google Pay link.
  // Thrown, as the route-level check it replaces did; the address is not logged.
  if (!validateWindcaveLink(ajaxSubmitGooglePayUrl, "ajaxSubmitGooglePay", config.paymentMode).ok) {
    throw new Error("Blocked a Google Pay link that is not this mode's Windcave address");
  }
  logAudit("GOOGLEPAY_SUBMIT", { url: ajaxSubmitGooglePayUrl });
  try {
    // Body format confirmed from Windcave's official SDK source:
    // windcavepayments-googlepay-v1.js → __submitTransaction():
    //   var tokenObject = { googlePay: JSON.parse(payment.paymentMethodData.tokenizationData.token) };
    //   var token = JSON.stringify(tokenObject);
    //   self.__ajaxPost(url, token, { "Content-Type": "application/json", "x-seamless": 1 })
    // Authorization header must NOT be sent — MHPP AJAX URLs authenticate via unique opaque URL.
    const response = await fetchWithTimeout(ajaxSubmitGooglePayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-seamless": "1",
      },
      body: JSON.stringify({ googlePay: googlePayToken }),
    });

    const text = await response.text();
    logAudit("GOOGLEPAY_RESPONSE", { status: response.status, bytes: text.length });

    if (response.ok) {
      let data: any = {};
      try { data = JSON.parse(text); } catch {}

      // Windcave returns { links: [{ rel: "done"|"3DSecure", href: "..." }] }
      if (data.links && Array.isArray(data.links) && data.links.length > 0) {
        const link = data.links[0];
        logAudit("GOOGLEPAY_LINK", { rel: link.rel });

        if (link.rel === "done") {
          // href is our callback URL — result is embedded in the query string
          const approved = typeof link.href === "string" && link.href.includes("result=approved");
          return { success: true, approved };
        }

        if (link.rel === "3DSecure") {
          // 3DS not supported in server-side submission — log and fall back to session query
          logAudit("GOOGLEPAY_3DS_REQUIRED", {});
          return { success: false, error: "3DS_REQUIRED" };
        }
      }

      // Fallback: try legacy response fields
      const approved = data.authorised === true || data.approved === true || data.responseCode === "00";
      return { success: true, approved, windcaveTransactionId: data.id || data.transactionId };
    }

    logAudit("GOOGLEPAY_ERROR_BODY", { status: response.status, bytes: text.length });
    return { success: false, error: providerFailure(response.status, "Windcave GooglePay") };
  } catch (err: any) {
    logAudit("GOOGLEPAY_ERROR", { error: transportFailure(err) });
    return { success: false, error: transportFailure(err) };
  }
}

// R4-T1 (plan §11.4): refund a captured transaction through the session client, under the
// caller's X-ID (never generated here), never resent, and successful only when the reply is
// strictly this refund. Everything else carries a typed outcome the route acts on.
export type { RefundOutcome, RefundRequest } from "./windcave-client";

function refundFailureCode(outcome: Exclude<RefundOutcome, { kind: "refunded" }>): string {
  switch (outcome.kind) {
    case "rejected": return `rejected_${outcome.status}`;
    case "unknown": return `unknown_${outcome.reason}`;
    case "mismatch": return `mismatch_${outcome.field}`;
    default: return outcome.kind;
  }
}

export async function createWindcaveRefund(request: RefundRequest): Promise<RefundResult> {
  const outcome = await defaultSessionClient().createRefund(request);
  if (outcome.kind === "mismatch") {
    writeSecurityAuditEvent("PROVIDER_OUTCOME_MISMATCH", { field: outcome.field });
  }
  if (outcome.kind === "refunded") {
    return { success: true, refundTransactionId: outcome.refundTransactionId, outcome };
  }
  return { success: false, error: refundFailureCode(outcome), outcome };
}

export function isWindcaveConfigured(): boolean {
  return !!(
    (config.paymentMode === "uat" || config.paymentMode === "production") &&
    config.windcave.endpoint &&
    config.windcave.username &&
    config.windcave.apiKey
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Attended (Tap to Pay on iPhone) ──────────────────────────────────────────

export interface AttendedSessionResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface AttendedPaymentResult {
  success: boolean;
  approved?: boolean;
  windcaveTransactionId?: string;
  error?: string;
}

/**
 * Step 1 (server-side): Create a Windcave attended session for Tap to Pay on iPhone.
 *
 * Flow ordering: the iOS SDK (WCPaymentSDK) has already captured the NFC card
 * data and returned a token to the JS bridge. This session is then created
 * server-side to provide a Windcave context for submitting that token.
 *
 * Windcave attended sessions use `type: "purchase"` with `attended: true` and
 * no callback URLs — the authorisation result is returned synchronously when
 * the token is submitted via submitTapToPayToken().
 */
export async function createAttendedSession(
  amount: string,
  merchantReference: string,
  retries = 0,
  // X-ID is Windcave's idempotency key. It MUST stay constant across retries so a
  // request that actually reached Windcave (but whose response we lost to a timeout)
  // is de-duplicated instead of creating a second session/charge.
  xId = crypto.randomBytes(8).toString("hex")
): Promise<AttendedSessionResult> {
  logAudit("ATTENDED_SESSION_CREATE", { merchantReference, amount, xId, retries });

  const body = {
    type: "purchase",
    amount,
    currency: "NZD",
    merchantReference,
    attended: true,
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(SESSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
        "X-ID": xId,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    logAudit("ATTENDED_SESSION_NETWORK_ERROR", { xId, error: transportFailure(err) });
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return createAttendedSession(amount, merchantReference, retries + 1, xId);
    }
    return { success: false, error: transportFailure(err) };
  }

  const text = await response.text();
  logAudit("ATTENDED_SESSION_RESPONSE", { status: response.status, bytes: text.length });

  if (response.status === 200 || response.status === 202) {
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    if (data.id) {
      return { success: true, sessionId: data.id };
    }
  }

  if (response.status >= 500 && retries < RETRY_LIMIT) {
    await delay(5000);
    return createAttendedSession(amount, merchantReference, retries + 1, xId);
  }

  return { success: false, error: providerFailure(response.status) };
}

/**
 * Step 2: Submit the NFC payment token captured by the Windcave iOS SDK
 * (WCPaymentSDK.startTapToPaySession) against an existing attended session.
 *
 * The token is submitted to Windcave's transactions endpoint. Windcave
 * evaluates the contactless card data and returns an authorisation decision.
 */
export async function submitTapToPayToken(
  sessionId: string,
  windcaveToken: string,
  retries = 0,
  // Stable idempotency key across retries — prevents a lost-response retry from
  // submitting (and charging) the same card twice.
  xId = crypto.randomBytes(8).toString("hex")
): Promise<AttendedPaymentResult> {
  logAudit("TAP_TO_PAY_SUBMIT", { sessionId, xId, retries });

  const body = {
    type: "purchase",
    sessionId,
    method: "contactless",
    token: windcaveToken,
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(TRANSACTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
        "X-ID": xId,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    logAudit("TAP_TO_PAY_NETWORK_ERROR", { xId, error: transportFailure(err) });
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return submitTapToPayToken(sessionId, windcaveToken, retries + 1, xId);
    }
    return { success: false, error: transportFailure(err) };
  }

  const text = await response.text();
  logAudit("TAP_TO_PAY_RESPONSE", { status: response.status, bytes: text.length });

  if (response.ok) {
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    const approved = data.authorised === true || data.approved === true || data.responseCode === "00";
    return { success: true, approved, windcaveTransactionId: data.id || data.transactionId };
  }

  if (response.status >= 500 && retries < RETRY_LIMIT) {
    await delay(5000);
    return submitTapToPayToken(sessionId, windcaveToken, retries + 1, xId);
  }

  return { success: false, error: providerFailure(response.status) };
}

// Legacy service wrapper kept for backward compatibility with NFC routes
export class WindcaveService {
  isConfigured(): boolean {
    return isWindcaveConfigured();
  }
}

export const windcaveService = new WindcaveService();
