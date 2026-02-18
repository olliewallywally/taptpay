import webpush from "web-push";
import { storage } from "./storage";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = "mailto:support@taptpay.co.nz";

let pushInitialized = false;

function initPush() {
  if (pushInitialized) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("VAPID keys not configured - push notifications disabled");
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
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: `transaction-${transactionId}`,
    data: { transactionId, status, url: "/" },
  };
}

export async function sendPushToMerchant(
  merchantId: number,
  status: string,
  itemName: string,
  amount: string,
  transactionId: number
): Promise<void> {
  initPush();
  if (!pushInitialized) return;

  try {
    const subscriptions = await storage.getPushSubscriptionsByMerchant(merchantId);
    if (!subscriptions || subscriptions.length === 0) return;

    const payload = buildTransactionPayload(status, itemName, amount, transactionId);
    const payloadStr = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscriptions
        .filter((sub) => sub.isActive)
        .map(async (sub) => {
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
      console.log(`Push: ${results.length - failed}/${results.length} delivered for merchant ${merchantId}`);
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}
