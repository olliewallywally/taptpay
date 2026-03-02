// Windcave RESTful API Integration
// Following pseudo code v1.5 - HPP Purchase flow
import crypto from "crypto";

const SESSION_URL = `${process.env.WINDCAVE_ENDPOINT || "https://uat.windcave.com/api/v1"}/sessions`;
const TRANSACTION_URL = `${process.env.WINDCAVE_ENDPOINT || "https://uat.windcave.com/api/v1"}/transactions`;
const REQUEST_TIMEOUT = 15000;
const RETRY_LIMIT = 5;

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
  hppUrl?: string;
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

// Create a Windcave payment session (HPP flow)
export async function createWindcaveSession(
  xId: string,
  amount: string,
  merchantReference: string,
  customerEmail: string,
  baseUrl: string,
  transactionId: number,
  retries = 0
): Promise<CreateSessionResult> {
  // Use transaction ID in callback URLs (Windcave does not reliably substitute {id} template vars)
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
    // Session created and pending — extract HPP link
    const data = await response.json();
    const hppLink = data.links?.find(
      (l: any) => l.rel === "hpp" || l.method === "REDIRECT" || l.rel === "redirect"
    );
    const hppUrl = hppLink?.href;
    logAudit("CREATE_SESSION_PENDING", { xId, sessionId: data.id, hppUrl });
    return {
      success: true,
      sessionId: data.id,
      hppUrl,
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
    // Still processing — retry
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
  // In simulation, return a fake HPP URL pointing to our own success callback
  const hppUrl = `${baseUrl}/api/windcave/callback?result=approved&sessionid=${sessionId}&sim=1`;
  return { success: true, sessionId, hppUrl, alreadyComplete: false };
}

export function simulateQuerySession(sessionId: string): QuerySessionResult {
  const approved = !sessionId.includes("decline");
  return {
    success: true,
    approved,
    windcaveTransactionId: approved ? `SIMTXN_${Date.now()}` : undefined,
  };
}

// Legacy service wrapper kept for backward compatibility with NFC routes
export class WindcaveService {
  isConfigured(): boolean {
    return isWindcaveConfigured();
  }
}

export const windcaveService = new WindcaveService();
