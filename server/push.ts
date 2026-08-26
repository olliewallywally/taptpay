import webpush from "web-push";
import http2 from "http2";
import jwt from "jsonwebtoken";
import {
  normalizePushNotificationPreferences,
  type PushNotificationEventType,
  type PushSubscription,
} from "@shared/schema";
import { storage } from "./storage";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = "mailto:support@taptpay.co.nz";

const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || "nz.taptpay.app";
const APNS_HOST = "api.push.apple.com";

let pushInitialized = false;

function initPush() {
  if (pushInitialized) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("VAPID keys not configured - web push notifications disabled");
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  pushInitialized = true;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

type TransactionPushFields = {
  transactionId: number;
  itemName: string;
  amount: string;
};

export type MerchantPushEvent =
  | ({ type: "transaction_created" } & TransactionPushFields)
  | ({ type: "payment_received" } & TransactionPushFields)
  | ({ type: "payment_failed"; reason?: "failed" | "cancelled" } & TransactionPushFields)
  | ({ type: "refund_processed"; partial?: boolean } & TransactionPushFields)
  | {
      type: "daily_payout_summary";
      localDate: string;
      amount: string;
      paymentCount: number;
    };

export interface PushDeliveryResult {
  eligibleSubscriptions: number;
  attempted: number;
  delivered: number;
  failed: number;
}

function formatAmount(amount: string): string {
  const parsed = Number(amount);
  return `$${Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00"}`;
}

export function buildPushPayload(event: MerchantPushEvent): PushPayload {
  if (event.type === "daily_payout_summary") {
    const paymentLabel = event.paymentCount === 1 ? "payment" : "payments";
    return {
      title: "Daily payout summary",
      body: `${formatAmount(event.amount)} received across ${event.paymentCount} ${paymentLabel} yesterday`,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: `daily-payout-${event.localDate}`,
      data: { eventType: event.type, localDate: event.localDate, url: "/transactions" },
    };
  }

  const formattedAmount = formatAmount(event.amount);
  let title: string;
  let body: string;
  if (event.type === "transaction_created") {
    title = "New Transaction Created";
    body = `${event.itemName} - ${formattedAmount} awaiting payment`;
  } else if (event.type === "payment_received") {
    title = "Payment Received";
    body = `${event.itemName} - ${formattedAmount} payment successful`;
  } else if (event.type === "payment_failed") {
    const cancelled = event.reason === "cancelled";
    title = cancelled ? "Transaction Cancelled" : "Payment Failed";
    body = cancelled
      ? `${event.itemName} - ${formattedAmount} was cancelled`
      : `${event.itemName} - ${formattedAmount} payment was declined`;
  } else {
    title = event.partial ? "Partial Refund Processed" : "Refund Processed";
    body = event.partial
      ? `${event.itemName} - ${formattedAmount} partial refund processed`
      : `${event.itemName} - ${formattedAmount} has been refunded`;
  }

  return {
    title,
    body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `transaction-${event.transactionId}`,
    data: {
      eventType: event.type,
      transactionId: event.transactionId,
      url: "/transactions",
    },
  };
}

function subscriptionAllowsEvent(
  subscription: Pick<PushSubscription, "preferences">,
  eventType: PushNotificationEventType,
): boolean {
  const preferences = normalizePushNotificationPreferences(subscription.preferences);
  if (eventType === "payment_received") return preferences.paymentReceived;
  if (eventType === "payment_failed") return preferences.failedPaymentAlerts;
  if (eventType === "daily_payout_summary") return preferences.dailyPayoutSummary;
  return true;
}

let apnsJwtToken: string | null = null;
let apnsJwtIssuedAt = 0;

function getApnsJwt(): string | null {
  const APNS_KEY_P8 = process.env.APNS_KEY_P8;
  const APNS_KEY_ID = process.env.APNS_KEY_ID;
  const APNS_TEAM_ID = process.env.APNS_TEAM_ID;

  if (!APNS_KEY_P8 || !APNS_KEY_ID || !APNS_TEAM_ID) return null;

  const nowSecs = Math.floor(Date.now() / 1000);
  if (apnsJwtToken && nowSecs - apnsJwtIssuedAt < 3000) {
    return apnsJwtToken;
  }

  try {
    apnsJwtToken = jwt.sign({}, APNS_KEY_P8, {
      algorithm: "ES256",
      keyid: APNS_KEY_ID,
      issuer: APNS_TEAM_ID,
      expiresIn: "1h",
    });
    apnsJwtIssuedAt = nowSecs;
    return apnsJwtToken;
  } catch (err) {
    console.error("APNs JWT signing failed:", err);
    return null;
  }
}

async function sendApnsNotification(
  deviceToken: string,
  payload: PushPayload,
  subscriptionEndpoint: string
): Promise<void> {
  const token = getApnsJwt();
  if (!token) return;

  const apnsBody = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      badge: 1,
      sound: "default",
    },
    ...(payload.data || {}),
  });

  await new Promise<void>((resolve, reject) => {
    const client = http2.connect(`https://${APNS_HOST}`);
    client.on("error", (err) => {
      client.destroy();
      reject(err);
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "authorization": `bearer ${token}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(apnsBody),
    });

    req.write(apnsBody);
    req.end();

    let responseBody = "";
    req.on("data", (chunk: Buffer) => { responseBody += chunk.toString(); });

    req.on("response", (headers) => {
      const status = headers[":status"] as number;
      req.on("end", async () => {
        client.close();
        if (status === 200) {
          resolve();
        } else {
          if (status === 400 || status === 410) {
            try {
              const parsed = JSON.parse(responseBody);
              if (parsed.reason === "Unregistered" || parsed.reason === "BadDeviceToken") {
                await storage.deactivatePushSubscriptionByEndpoint(subscriptionEndpoint);
              }
            } catch { /* ignore parse errors */ }
          }
          reject(new Error(`APNs ${status}: ${responseBody}`));
        }
      });
    });

    req.on("error", (err: Error) => {
      client.destroy();
      reject(err);
    });
  });
}

async function sendNativePushToMerchant(
  nativeSubs: PushSubscription[],
  payload: PushPayload
): Promise<Pick<PushDeliveryResult, "attempted" | "delivered" | "failed">> {
  const hasCredentials = !!(
    process.env.APNS_KEY_P8 &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID
  );

  if (!hasCredentials) {
    return { attempted: 0, delivered: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    nativeSubs.map(async (sub) => {
      const deviceToken = sub.endpoint.replace("apns://", "");
      await sendApnsNotification(deviceToken, payload, sub.endpoint);
    })
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.log(`APNs: ${results.length - failed.length}/${results.length} delivered`);
    for (const f of failed) {
      if (f.status === "rejected") {
        console.error("APNs delivery error:", (f as PromiseRejectedResult).reason?.message);
      }
    }
  }
  return {
    attempted: results.length,
    delivered: results.length - failed.length,
    failed: failed.length,
  };
}

export async function sendPushToMerchant(
  merchantId: number,
  event: MerchantPushEvent,
): Promise<PushDeliveryResult> {
  initPush();
  const subscriptions = await storage.getPushSubscriptionsByMerchant(merchantId);
  const eligible = subscriptions.filter(
    (subscription) => subscription.isActive && subscriptionAllowsEvent(subscription, event.type),
  );
  const result: PushDeliveryResult = {
    eligibleSubscriptions: eligible.length,
    attempted: 0,
    delivered: 0,
    failed: 0,
  };
  if (eligible.length === 0) return result;

  const payload = buildPushPayload(event);
  const payloadStr = JSON.stringify(payload);
  const webSubs = eligible.filter((sub) => !sub.endpoint.startsWith("apns://"));
  const nativeSubs = eligible.filter((sub) => sub.endpoint.startsWith("apns://"));

  if (pushInitialized && webSubs.length > 0) {
    const results = await Promise.allSettled(
      webSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payloadStr,
          );
        } catch (error: unknown) {
          const statusCode = (error as { statusCode?: unknown }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await storage.deactivatePushSubscription(sub.id);
          }
          throw error;
        }
      }),
    );
    const failed = results.filter((delivery) => delivery.status === "rejected").length;
    result.attempted += results.length;
    result.delivered += results.length - failed;
    result.failed += failed;
    if (failed > 0) {
      console.log(
        `Web push: ${results.length - failed}/${results.length} delivered for merchant ${merchantId}`,
      );
    }
  }

  if (nativeSubs.length > 0) {
    const nativeResult = await sendNativePushToMerchant(nativeSubs, payload);
    result.attempted += nativeResult.attempted;
    result.delivered += nativeResult.delivered;
    result.failed += nativeResult.failed;
  }

  return result;
}
