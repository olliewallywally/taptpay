import webpush from "web-push";
import http2 from "http2";
import jwt from "jsonwebtoken";
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
  data?: Record<string, any>;
}

function buildTransactionPayload(
  status: string,
  itemName: string,
  amount: string,
  transactionId: number
): PushPayload {
  const formattedAmount = `$${parseFloat(amount).toFixed(2)}`;

  const messages: Record<string, { title: string; body: string }> = {
    pending: {
      title: "New Transaction Created",
      body: `${itemName} - ${formattedAmount} awaiting payment`,
    },
    processing: {
      title: "Payment Processing",
      body: `${itemName} - ${formattedAmount} is being processed`,
    },
    completed: {
      title: "Payment Received",
      body: `${itemName} - ${formattedAmount} payment successful`,
    },
    failed: {
      title: "Payment Failed",
      body: `${itemName} - ${formattedAmount} payment was declined`,
    },
    cancelled: {
      title: "Transaction Cancelled",
      body: `${itemName} - ${formattedAmount} was cancelled`,
    },
    refunded: {
      title: "Refund Processed",
      body: `${itemName} - ${formattedAmount} has been refunded`,
    },
    partially_refunded: {
      title: "Partial Refund Processed",
      body: `${itemName} - partial refund processed`,
    },
  };

  const msg = messages[status] || {
    title: "Transaction Update",
    body: `${itemName} - ${formattedAmount} status: ${status}`,
  };

  return {
    ...msg,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `transaction-${transactionId}`,
    data: { transactionId, status, url: "/" },
  };
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
  nativeSubs: any[],
  payload: PushPayload
): Promise<void> {
  const hasCredentials = !!(
    process.env.APNS_KEY_P8 &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID
  );

  if (!hasCredentials) {
    return;
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
}

export async function sendPushToMerchant(
  merchantId: number,
  status: string,
  itemName: string,
  amount: string,
  transactionId: number
): Promise<void> {
  initPush();

  try {
    const subscriptions = await storage.getPushSubscriptionsByMerchant(merchantId);
    if (!subscriptions || subscriptions.length === 0) return;

    const payload = buildTransactionPayload(status, itemName, amount, transactionId);
    const payloadStr = JSON.stringify(payload);

    const webSubs = subscriptions.filter(
      (sub: any) => sub.isActive && !sub.endpoint.startsWith("apns://")
    );
    const nativeSubs = subscriptions.filter(
      (sub: any) => sub.isActive && sub.endpoint.startsWith("apns://")
    );

    if (pushInitialized && webSubs.length > 0) {
      const results = await Promise.allSettled(
        webSubs.map(async (sub: any) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payloadStr
            );
          } catch (error: any) {
            if (error.statusCode === 404 || error.statusCode === 410) {
              await storage.deactivatePushSubscription(sub.id);
            }
            throw error;
          }
        })
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.log(
          `Web push: ${results.length - failed}/${results.length} delivered for merchant ${merchantId}`
        );
      }
    }

    if (nativeSubs.length > 0) {
      await sendNativePushToMerchant(nativeSubs, payload).catch((err) => {
        console.error("APNs batch error:", err);
      });
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}
