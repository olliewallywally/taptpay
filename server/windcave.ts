// Windcave API Integration
import { z } from "zod";
import crypto from "crypto";

export interface WindcaveConfig {
  apiEndpoint: string;
  username: string;
  apiKey: string;
  webhookSecret: string;
}

export interface CreateSessionRequest {
  type: "purchase";
  amount: string;
  currency: string;
  merchantReference: string;
  language: string;
  callbackUrls: {
    approved: string;
    declined: string;
    cancelled: string;
  };
  notificationUrl: string;
}

export interface WindcaveSession {
  id: string;
  state: string;
  links: Array<{
    rel: string;
    href: string;
  }>;
}

export interface PaymentResult {
  id: string;
  type: string;
  amount: string;
  currency: string;
  merchantReference: string;
  status: "approved" | "declined" | "cancelled";
  responseText: string;
  dpsTxnRef: string;
  cardName?: string;
  cardNumber?: string;
}

const API_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

function logWindcaveAudit(action: string, details: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const sanitized = { ...details };
  if (sanitized.apiKey) sanitized.apiKey = '***REDACTED***';
  if (sanitized.cardNumber) sanitized.cardNumber = sanitized.cardNumber.replace(/\d(?=\d{4})/g, '*');
  console.log(`[WINDCAVE_AUDIT] [${timestamp}] ${action}:`, JSON.stringify(sanitized));
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = MAX_RETRIES,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      if (response.status >= 500) {
        lastError = new Error(`Windcave server error: ${response.status} ${response.statusText}`);
        logWindcaveAudit('RETRY_SERVER_ERROR', { attempt, status: response.status, url });
        if (attempt < maxRetries) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return response;
      }

      return response;
    } catch (error: any) {
      lastError = error;
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT';

      logWindcaveAudit('RETRY_ERROR', {
        attempt,
        error: error.message,
        isTimeout,
        isNetworkError,
        url,
      });

      if (attempt < maxRetries && (isTimeout || isNetworkError)) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('Windcave API request failed after retries');
}

export class WindcaveService {
  private config: WindcaveConfig;

  constructor() {
    this.config = {
      apiEndpoint: process.env.WINDCAVE_ENDPOINT || "https://uat.windcave.com/api/v1",
      username: process.env.WINDCAVE_USERNAME || "",
      apiKey: process.env.WINDCAVE_API_KEY || "",
      webhookSecret: process.env.WINDCAVE_WEBHOOK_SECRET || "",
    };

    if (!this.config.username || !this.config.apiKey) {
      console.warn("Windcave credentials not configured. Using simulation mode.");
    }
  }

  async createPaymentSession(
    amount: string,
    merchantReference: string,
    baseUrl: string
  ): Promise<WindcaveSession | null> {
    if (!this.config.username || !this.config.apiKey) {
      return this.simulateSession(merchantReference);
    }

    const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    logWindcaveAudit('CREATE_SESSION_REQUEST', {
      requestId,
      amount,
      merchantReference,
      baseUrl,
      endpoint: this.config.apiEndpoint,
    });

    try {
      const sessionData: CreateSessionRequest = {
        type: "purchase",
        amount: amount,
        currency: "NZD",
        merchantReference: merchantReference,
        language: "en",
        callbackUrls: {
          approved: `${baseUrl}/payment/success`,
          declined: `${baseUrl}/payment/declined`,
          cancelled: `${baseUrl}/payment/cancelled`,
        },
        notificationUrl: `${baseUrl}/api/windcave/notification`,
      };

      const response = await fetchWithRetry(`${this.config.apiEndpoint}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${Buffer.from(`${this.config.username}:${this.config.apiKey}`).toString('base64')}`,
        },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unable to read error body');
        logWindcaveAudit('CREATE_SESSION_ERROR', {
          requestId,
          status: response.status,
          statusText: response.statusText,
          errorBody,
        });
        throw new Error(`Windcave API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      logWindcaveAudit('CREATE_SESSION_SUCCESS', {
        requestId,
        sessionId: result.id,
        state: result.state,
      });
      return result;
    } catch (error: any) {
      logWindcaveAudit('CREATE_SESSION_FAILURE', {
        requestId,
        error: error.message,
      });
      console.error("Error creating Windcave session:", error);
      return null;
    }
  }

  async getSessionResult(sessionId: string): Promise<PaymentResult | null> {
    if (!this.config.username || !this.config.apiKey) {
      return this.simulatePaymentResult(sessionId);
    }

    const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    logWindcaveAudit('GET_SESSION_REQUEST', {
      requestId,
      sessionId,
    });

    try {
      const response = await fetchWithRetry(`${this.config.apiEndpoint}/sessions/${sessionId}`, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${this.config.username}:${this.config.apiKey}`).toString('base64')}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unable to read error body');
        logWindcaveAudit('GET_SESSION_ERROR', {
          requestId,
          sessionId,
          status: response.status,
          errorBody,
        });
        throw new Error(`Windcave API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      logWindcaveAudit('GET_SESSION_SUCCESS', {
        requestId,
        sessionId,
        status: result.status,
        dpsTxnRef: result.dpsTxnRef,
      });
      return result;
    } catch (error: any) {
      logWindcaveAudit('GET_SESSION_FAILURE', {
        requestId,
        sessionId,
        error: error.message,
      });
      console.error("Error getting Windcave session result:", error);
      return null;
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      logWindcaveAudit('WEBHOOK_VERIFY_SKIP', { reason: 'No webhook secret configured' });
      return true;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(rawBody)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );

      logWindcaveAudit('WEBHOOK_VERIFY', { isValid });
      return isValid;
    } catch (error: any) {
      logWindcaveAudit('WEBHOOK_VERIFY_ERROR', { error: error.message });
      return false;
    }
  }

  private simulateSession(merchantReference: string): WindcaveSession {
    const sessionId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logWindcaveAudit('SIMULATE_SESSION', { sessionId, merchantReference });
    return {
      id: sessionId,
      state: "active",
      links: [
        {
          rel: "self",
          href: `/api/windcave/sessions/${sessionId}`,
        }
      ],
    };
  }

  private simulatePaymentResult(sessionId: string): PaymentResult {
    const isSuccess = Math.random() > 0.1;
    logWindcaveAudit('SIMULATE_PAYMENT_RESULT', { sessionId, isSuccess });
    
    return {
      id: sessionId,
      type: "purchase",
      amount: "0.00",
      currency: "NZD",
      merchantReference: "SIM_" + sessionId,
      status: isSuccess ? "approved" : "declined",
      responseText: isSuccess ? "Transaction Approved" : "Transaction Declined",
      dpsTxnRef: `DPS_${Date.now()}`,
      cardName: isSuccess ? "Visa" : undefined,
      cardNumber: isSuccess ? "************1234" : undefined,
    };
  }

  isConfigured(): boolean {
    return !!(this.config.username && this.config.apiKey);
  }
}

export const windcaveService = new WindcaveService();
