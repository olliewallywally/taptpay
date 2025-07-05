// Windcave API Integration
import { z } from "zod";

export interface WindcaveConfig {
  apiEndpoint: string;
  username: string;
  apiKey: string;
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

export class WindcaveService {
  private config: WindcaveConfig;

  constructor() {
    this.config = {
      // Use sandbox URL for development, production URL for live
      apiEndpoint: process.env.WINDCAVE_ENDPOINT || "https://uat.windcave.com/api/v1",
      username: process.env.WINDCAVE_USERNAME || "",
      apiKey: process.env.WINDCAVE_API_KEY || "",
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
      // Return simulation data when credentials aren't configured
      return this.simulateSession(merchantReference);
    }

    try {
      const sessionData: CreateSessionRequest = {
        type: "purchase",
        amount: amount,
        currency: "NZD", // Default to NZD, could be configurable
        merchantReference: merchantReference,
        language: "en",
        callbackUrls: {
          approved: `${baseUrl}/payment/success`,
          declined: `${baseUrl}/payment/declined`,
          cancelled: `${baseUrl}/payment/cancelled`,
        },
        notificationUrl: `${baseUrl}/api/windcave/notification`,
      };

      const response = await fetch(`${this.config.apiEndpoint}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${Buffer.from(`${this.config.username}:${this.config.apiKey}`).toString('base64')}`,
        },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        throw new Error(`Windcave API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating Windcave session:", error);
      return null;
    }
  }

  async getSessionResult(sessionId: string): Promise<PaymentResult | null> {
    if (!this.config.username || !this.config.apiKey) {
      // Return simulation data when credentials aren't configured
      return this.simulatePaymentResult(sessionId);
    }

    try {
      const response = await fetch(`${this.config.apiEndpoint}/sessions/${sessionId}`, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${this.config.username}:${this.config.apiKey}`).toString('base64')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Windcave API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error getting Windcave session result:", error);
      return null;
    }
  }

  private simulateSession(merchantReference: string): WindcaveSession {
    const sessionId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    // Simulate 90% success rate for demo
    const isSuccess = Math.random() > 0.1;
    
    return {
      id: sessionId,
      type: "purchase",
      amount: "0.00", // This would be set from the actual session
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