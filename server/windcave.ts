// Windcave RESTful API Integration
import crypto from "crypto";
import { redactSensitive } from "./request-log";

const WINDCAVE_ENDPOINT = process.env.WINDCAVE_ENDPOINT || "https://uat.windcave.com/api/v1";
const SESSION_URL = `${WINDCAVE_ENDPOINT}/sessions`;
const TRANSACTION_URL = `${WINDCAVE_ENDPOINT}/transactions`;
const REQUEST_TIMEOUT = 15000;
const RETRY_LIMIT = 5;

export function getWindcaveEnv(): "uat" | "sec" {
  const endpoint = process.env.WINDCAVE_ENDPOINT || "";
  return endpoint.includes("sec.windcave.com") ? "sec" : "uat";
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

function buildAuthHeader(): string {
  const username = process.env.WINDCAVE_USERNAME || "";
  const apiKey = process.env.WINDCAVE_API_KEY || "";
  return `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`;
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
  error?: string;
}

// Create a Windcave payment session — returns all available submission URLs
export async function createWindcaveSession(
  xId: string,
  amount: string,
  merchantReference: string,
  customerEmail: string,
  baseUrl: string,
  transactionId: number,
  retries = 0,
  // Optional override for non-retail flows (e.g. property rent checkout) that need
  // their own callback/notification routes. callbackBase must already contain a `?`
  // query string so `&result=...` can be appended.
  callbacks?: { callbackBase: string; notificationUrl: string }
): Promise<CreateSessionResult> {
  const callbackBase = callbacks?.callbackBase ?? `${baseUrl}/api/windcave/callback?transactionId=${transactionId}`;
  const notificationUrl = callbacks?.notificationUrl ?? `${baseUrl}/api/windcave/notification`;
  const body = {
    type: "purchase",
    amount,
    currency: "NZD",
    merchantReference,
    customer: {
      email: customerEmail,
    },
    callbackUrls: {
      approved: `${callbackBase}&result=approved`,
      declined: `${callbackBase}&result=declined`,
      cancelled: `${callbackBase}&result=cancelled`,
    },
    notificationUrl,
  };

  logAudit("CREATE_SESSION_REQUEST", { xId, merchantReference, amount, retries });

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
    const isTimeout = err.name === "AbortError";
    logAudit("CREATE_SESSION_NETWORK_ERROR", { xId, error: err.message, isTimeout });
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return createWindcaveSession(xId, amount, merchantReference, customerEmail, baseUrl, transactionId, retries + 1, callbacks);
    }
    return { success: false, error: err.message };
  }

  if (response.status === 200) {
    // Duplicate X-ID — session already complete
    const data = await response.json();
    const tx = data.transactions?.[0];
    const approved = tx?.authorised === true;
    logAudit("CREATE_SESSION_DUPLICATE_XID", { xId, approved, txId: tx?.id });
    return {
      success: true,
      sessionId: data.id,
      alreadyComplete: true,
      approved,
      windcaveTransactionId: approved ? tx?.id : undefined,
    };
  }

  if (response.status === 202) {
    const data = await response.json();
    const links: any[] = data.links || [];

    const findHref = (rel: string) =>
      links.find((l) => l.rel === rel)?.href;

    const hppUrl = findHref("hpp") || links.find((l) => l.method === "REDIRECT")?.href;
    const ajaxSubmitCardUrl = findHref("ajaxSubmitCard");
    const ajaxSubmitApplePayUrl = findHref("ajaxSubmitApplePay");
    const ajaxSubmitGooglePayUrl = findHref("ajaxSubmitGooglePay");

    logAudit("CREATE_SESSION_PENDING", {
      xId,
      sessionId: data.id,
      hppUrl,
      ajaxSubmitCardUrl: !!ajaxSubmitCardUrl,
      ajaxSubmitApplePayUrl: !!ajaxSubmitApplePayUrl,
      ajaxSubmitGooglePayUrl: !!ajaxSubmitGooglePayUrl,
    });

    return {
      success: true,
      sessionId: data.id,
      hppUrl,
      ajaxSubmitCardUrl,
      ajaxSubmitApplePayUrl,
      ajaxSubmitGooglePayUrl,
      alreadyComplete: false,
    };
  }

  if (response.status >= 400 && response.status < 500) {
    const errorBody = await response.text().catch(() => "");
    logAudit("CREATE_SESSION_4XX", { xId, status: response.status, errorBody });
    return { success: false, error: `Windcave ${response.status}: ${errorBody}` };
  }

  if (response.status >= 500) {
    logAudit("CREATE_SESSION_5XX", { xId, status: response.status, retries });
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return createWindcaveSession(xId, amount, merchantReference, customerEmail, baseUrl, transactionId, retries + 1, callbacks);
    }
    return { success: false, error: `Windcave server error ${response.status}` };
  }

  return { success: false, error: `Unexpected status ${response.status}` };
}

// Query a session to determine the payment outcome
export async function queryWindcaveSession(
  sessionId: string,
  retries = 0
): Promise<QuerySessionResult> {
  logAudit("QUERY_SESSION", { sessionId, retries });

  let response: Response;
  try {
    response = await fetchWithTimeout(`${SESSION_URL}/${sessionId}`, {
      method: "GET",
      headers: { Authorization: buildAuthHeader() },
    });
  } catch (err: any) {
    logAudit("QUERY_SESSION_NETWORK_ERROR", { sessionId, error: err.message });
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return queryWindcaveSession(sessionId, retries + 1);
    }
    return { success: false, error: err.message };
  }

  if (response.status === 200) {
    const data = await response.json();
    const tx = data.transactions?.[0];
    const approved = tx?.authorised === true;
    logAudit("QUERY_SESSION_RESULT", { sessionId, approved, txId: tx?.id });
    return {
      success: true,
      approved,
      windcaveTransactionId: approved ? tx?.id : undefined,
    };
  }

  if (response.status === 202) {
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return queryWindcaveSession(sessionId, retries + 1);
    }
    return { success: false, error: "Session still processing after max retries" };
  }

  if (response.status >= 400 && response.status < 500) {
    const errorBody = await response.text().catch(() => "");
    logAudit("QUERY_SESSION_4XX", { sessionId, status: response.status, errorBody });
    return { success: false, error: `Windcave ${response.status}: ${errorBody}` };
  }

  if (response.status >= 500) {
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return queryWindcaveSession(sessionId, retries + 1);
    }
    return { success: false, error: `Windcave server error ${response.status}` };
  }

  return { success: false, error: `Unexpected status ${response.status}` };
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

  logAudit("STORE_CARD_SESSION_REQUEST", { xId, merchantReference });

  let response: Response;
  try {
    const request = options.request ?? fetchWithTimeout;
    response = await request(SESSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
        "X-ID": xId,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    logAudit("STORE_CARD_SESSION_NETWORK_ERROR", { xId, error: err.message });
    return { success: false, error: err.message };
  }

  const text = await response.text();
  if (response.status === 202 || response.status === 200) {
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    const links: any[] = data.links || [];
    const hppUrl =
      links.find((l) => l.rel === "hpp")?.href ||
      links.find((l) => l.method === "REDIRECT")?.href;
    logAudit("STORE_CARD_SESSION_CREATED", { xId, sessionId: data.id, hppUrl });
    return { success: true, sessionId: data.id, hppUrl };
  }

  logAudit("STORE_CARD_SESSION_ERROR", { xId, status: response.status, body: text.slice(0, 300) });
  return { success: false, error: `Windcave ${response.status}: ${text.slice(0, 200)}` };
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
      headers: { Authorization: buildAuthHeader() },
    });
  } catch (err: any) {
    logAudit("STORE_CARD_QUERY_NETWORK_ERROR", { sessionId, error: err.message });
    return { success: false, error: err.message };
  }

  const text = await response.text();
  if (response.status === 202) {
    // Shopper has not finished yet — not an error, just not ready.
    return { success: true, complete: false };
  }
  if (response.status !== 200) {
    logAudit("STORE_CARD_QUERY_ERROR", { sessionId, status: response.status });
    return { success: false, error: `Windcave ${response.status}: ${text.slice(0, 200)}` };
  }

  const data = parseWindcaveJson(text);
  const tx = Array.isArray(data?.transactions) ? data.transactions[0] : undefined;
  if (!tx || typeof tx.authorised !== "boolean") {
    logAudit("STORE_CARD_QUERY_INVALID_RESULT", { sessionId });
    return {
      success: false,
      error: "Windcave stored-card session response did not include a final transaction result",
    };
  }

  const approved = tx.authorised;
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
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
        "X-ID": xId,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    logAudit("CHARGE_STORED_CARD_NETWORK_ERROR", { xId, error: err.message });
    return { success: false, error: err.message };
  }

  const text = await response.text();
  if (response.status === 202) {
    const pending = parseWindcaveJson(text);
    const pollUrl = transactionPollUrl(pending);
    if (!pollUrl) {
      logAudit("CHARGE_STORED_CARD_PENDING_INVALID", { xId, body: text.slice(0, 300) });
      return { success: false, error: "Windcave returned a pending transaction without an id" };
    }
    return pollStoredCardCharge(xId, pollUrl, pending?.id ?? pending?.transactionId, options);
  }

  if (response.status !== 200 && response.status !== 201) {
    logAudit("CHARGE_STORED_CARD_ERROR", { xId, status: response.status, body: text.slice(0, 300) });
    return { success: false, error: `Windcave ${response.status}: ${text.slice(0, 200)}` };
  }

  return finalStoredCardChargeResult(xId, parseWindcaveJson(text));
}

function parseWindcaveJson(text: string): any | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function finalStoredCardChargeResult(
  xId: string,
  data: any,
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
        headers: { Authorization: buildAuthHeader() },
      });
    } catch (err: any) {
      logAudit("CHARGE_STORED_CARD_POLL_NETWORK_ERROR", { xId, pollAttempt: attempt, error: err.message });
      return { success: false, windcaveTransactionId: fallbackId, error: err.message };
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
        body: text.slice(0, 300),
      });
      return {
        success: false,
        windcaveTransactionId: fallbackId,
        error: `Windcave ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    return finalStoredCardChargeResult(xId, parseWindcaveJson(text), fallbackId);
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
    logAudit("GOOGLEPAY_RESPONSE", { status: response.status, body: text });

    if (response.ok) {
      let data: any = {};
      try { data = JSON.parse(text); } catch {}

      // Windcave returns { links: [{ rel: "done"|"3DSecure", href: "..." }] }
      if (data.links && Array.isArray(data.links) && data.links.length > 0) {
        const link = data.links[0];
        logAudit("GOOGLEPAY_LINK", { rel: link.rel, href: link.href?.slice(0, 200) });

        if (link.rel === "done") {
          // href is our callback URL — result is embedded in the query string
          const approved = typeof link.href === "string" && link.href.includes("result=approved");
          return { success: true, approved };
        }

        if (link.rel === "3DSecure") {
          // 3DS not supported in server-side submission — log and fall back to session query
          logAudit("GOOGLEPAY_3DS_REQUIRED", { href: link.href?.slice(0, 200) });
          return { success: false, error: "3DS_REQUIRED" };
        }
      }

      // Fallback: try legacy response fields
      const approved = data.authorised === true || data.approved === true || data.responseCode === "00";
      return { success: true, approved, windcaveTransactionId: data.id || data.transactionId };
    }

    logAudit("GOOGLEPAY_ERROR_BODY", { status: response.status, body: text });
    return { success: false, error: `Windcave GooglePay ${response.status}: ${text}` };
  } catch (err: any) {
    logAudit("GOOGLEPAY_ERROR", { error: err.message });
    return { success: false, error: err.message };
  }
}

// Process a refund against an approved transaction
export async function createWindcaveRefund(
  originalTransactionId: string,
  amount: string,
  merchantReference: string
): Promise<RefundResult> {
  const xId = crypto.randomBytes(8).toString("hex");
  logAudit("REFUND_REQUEST", { originalTransactionId, amount, merchantReference });

  const body = {
    type: "refund",
    amount,
    currency: "NZD",
    merchantReference,
    transaction2Id: originalTransactionId,
  };

  try {
    const response = await fetchWithTimeout(TRANSACTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
        "X-ID": xId,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      logAudit("REFUND_SUCCESS", { refundTxId: data.id });
      return { success: true, refundTransactionId: data.id };
    }

    const errorBody = await response.text().catch(() => "");
    logAudit("REFUND_FAILED", { status: response.status, errorBody });
    return { success: false, error: `Refund failed: ${response.status} ${errorBody}` };
  } catch (err: any) {
    logAudit("REFUND_ERROR", { error: err.message });
    return { success: false, error: err.message };
  }
}

export function isWindcaveConfigured(): boolean {
  return !!(process.env.WINDCAVE_USERNAME && process.env.WINDCAVE_API_KEY);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Simulation mode (used when credentials are not set) ──────────────────────

export function simulateCreateSession(merchantReference: string, baseUrl: string): CreateSessionResult {
  const sessionId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  logAudit("SIMULATE_SESSION", { sessionId, merchantReference });
  const hppUrl = `${baseUrl}/api/windcave/callback?result=approved&sessionid=${sessionId}&sim=1`;
  return {
    success: true,
    sessionId,
    hppUrl,
    // Fake AJAX submit URLs — the checkout page will detect sim mode and handle accordingly
    ajaxSubmitCardUrl: `${baseUrl}/api/windcave/sim-submit?sessionId=${sessionId}&method=card`,
    ajaxSubmitApplePayUrl: `${baseUrl}/api/windcave/sim-submit?sessionId=${sessionId}&method=applepay`,
    ajaxSubmitGooglePayUrl: `${baseUrl}/api/windcave/sim-submit?sessionId=${sessionId}&method=googlepay`,
    alreadyComplete: false,
  };
}

// Simulated session for the property rent checkout — points the HPP redirect at
// the rent callback (/api/checkout/callback) instead of the retail one.
export function simulateRentSession(token: string, baseUrl: string): CreateSessionResult {
  const sessionId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  logAudit("SIMULATE_RENT_SESSION", { sessionId, token });
  return {
    success: true,
    sessionId,
    hppUrl: `${baseUrl}/api/checkout/callback?token=${token}&result=approved&sim=1`,
    alreadyComplete: false,
  };
}

export function simulateQuerySession(sessionId: string): QuerySessionResult {
  const approved = !sessionId.includes("decline");
  return {
    success: true,
    approved,
    windcaveTransactionId: approved ? `SIMTXN_${Date.now()}` : undefined,
  };
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
    logAudit("ATTENDED_SESSION_NETWORK_ERROR", { xId, error: err.message });
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return createAttendedSession(amount, merchantReference, retries + 1, xId);
    }
    return { success: false, error: err.message };
  }

  const text = await response.text();
  logAudit("ATTENDED_SESSION_RESPONSE", { status: response.status, body: text.slice(0, 400) });

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

  return { success: false, error: `Windcave ${response.status}: ${text.slice(0, 200)}` };
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
    logAudit("TAP_TO_PAY_NETWORK_ERROR", { xId, error: err.message });
    if (retries < RETRY_LIMIT) {
      await delay(5000);
      return submitTapToPayToken(sessionId, windcaveToken, retries + 1, xId);
    }
    return { success: false, error: err.message };
  }

  const text = await response.text();
  logAudit("TAP_TO_PAY_RESPONSE", { status: response.status, body: text.slice(0, 400) });

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

  return { success: false, error: `Windcave ${response.status}: ${text.slice(0, 200)}` };
}

/**
 * Simulation-only helper — only called when Windcave credentials are NOT configured.
 * Never used in production (isWindcaveConfigured() guards all real paths).
 */
export function simulateAttendedTapToPay(merchantReference: string): AttendedPaymentResult {
  const approved = !merchantReference.includes("decline");
  logAudit("SIMULATE_TAP_TO_PAY", { merchantReference, approved });
  return {
    success: true,
    approved,
    windcaveTransactionId: approved ? `SIMTXN_TTP_${Date.now()}` : undefined,
  };
}

// Legacy service wrapper kept for backward compatibility with NFC routes
export class WindcaveService {
  isConfigured(): boolean {
    return isWindcaveConfigured();
  }
}

export const windcaveService = new WindcaveService();
