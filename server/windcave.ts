// Windcave RESTful API Integration
import crypto from "crypto";

const WINDCAVE_ENDPOINT = process.env.WINDCAVE_ENDPOINT || "https://uat.windcave.com/api/v1";
const SESSION_URL = `${WINDCAVE_ENDPOINT}/sessions`;
const TRANSACTION_URL = `${WINDCAVE_ENDPOINT}/transactions`;
const REQUEST_TIMEOUT = 15000;
const RETRY_LIMIT = 5;

export function getWindcaveEnv(): "uat" | "sec" {
  const endpoint = process.env.WINDCAVE_ENDPOINT || "";
  return endpoint.includes("sec.windcave.com") ? "sec" : "uat";
}

function logAudit(action: string, details: Record<string, any>) {
  const sanitized = { ...details };
  if (sanitized.apiKey) sanitized.apiKey = "***";
  if (sanitized.authorization) sanitized.authorization = "***";
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
  retries = 0
): Promise<CreateSessionResult> {
  const callbackBase = `${baseUrl}/api/windcave/callback?transactionId=${transactionId}`;
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
    notificationUrl: `${baseUrl}/api/windcave/notification`,
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
      return createWindcaveSession(xId, amount, merchantReference, customerEmail, baseUrl, transactionId, retries + 1);
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
      return createWindcaveSession(xId, amount, merchantReference, customerEmail, baseUrl, transactionId, retries + 1);
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

export function simulateQuerySession(sessionId: string): QuerySessionResult {
  const approved = !sessionId.includes("decline");
  return {
    success: true,
    approved,
    windcaveTransactionId: approved ? `SIMTXN_${Date.now()}` : undefined,
  };
}

// ── Attended (Tap to Pay on iPhone) ──────────────────────────────────────────

export interface AttendedPaymentResult {
  success: boolean;
  approved?: boolean;
  windcaveTransactionId?: string;
  error?: string;
}

/**
 * Submit an NFC payment token obtained from the Windcave iOS SDK
 * (WCPaymentSDK.startTapToPaySession) to Windcave's attended transactions API.
 *
 * The iOS native plugin captures the card token and passes it to the JS bridge.
 * This function forwards it server-side so credentials are never exposed to
 * the client app.
 */
export async function submitAttendedTapToPayToken(
  windcaveToken: string,
  amount: string,
  merchantReference: string
): Promise<AttendedPaymentResult> {
  const xId = crypto.randomBytes(8).toString("hex");
  logAudit("TAP_TO_PAY_SUBMIT", { merchantReference, amount, xId });

  const body = {
    type: "purchase",
    amount,
    currency: "NZD",
    merchantReference,
    method: "contactless",
    token: windcaveToken,
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

    const text = await response.text();
    logAudit("TAP_TO_PAY_RESPONSE", { status: response.status, body: text.slice(0, 400) });

    if (response.ok) {
      let data: any = {};
      try { data = JSON.parse(text); } catch {}
      const approved = data.authorised === true || data.approved === true || data.responseCode === "00";
      return { success: true, approved, windcaveTransactionId: data.id || data.transactionId };
    }

    return { success: false, error: `Windcave ${response.status}: ${text.slice(0, 200)}` };
  } catch (err: any) {
    logAudit("TAP_TO_PAY_ERROR", { error: err.message });
    return { success: false, error: err.message };
  }
}

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
