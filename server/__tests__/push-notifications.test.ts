// `../push` reads the frozen config when it is imported below, so web-push has
// to be configured HERE, above that import — not in beforeEach, which runs long
// after. These tests previously passed only because the developer machine
// happened to export real VAPID keys; with the ambient credential groups
// cleared for determinism (support/clear-ambient-credentials.ts) the 404/410
// deactivation path had no configured transport and never ran.
process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";

const getPushSubscriptionsByMerchant = jest.fn();
const deactivatePushSubscription = jest.fn();
const deactivatePushSubscriptionByEndpoint = jest.fn();

jest.mock("../storage", () => ({
  storage: {
    getPushSubscriptionsByMerchant,
    deactivatePushSubscription,
    deactivatePushSubscriptionByEndpoint,
  },
}));

jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

import { buildPushPayload, sendPushToMerchant } from "../push";
import webpush from "web-push";

function subscription(id: number, failedPaymentAlerts: boolean) {
  return {
    id,
    merchantId: 42,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: `public-key-${id}`,
    auth: `auth-secret-${id}`,
    userAgent: null,
    isActive: true,
    preferences: {
      paymentReceived: true,
      dailyPayoutSummary: true,
      failedPaymentAlerts,
    },
    createdAt: new Date(),
  };
}

describe("push notification preference filtering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("filters each subscription against the explicit event type", async () => {
    getPushSubscriptionsByMerchant.mockResolvedValue([
      subscription(1, false),
      subscription(2, true),
    ]);

    await expect(sendPushToMerchant(42, {
      type: "payment_failed",
      reason: "failed",
      itemName: "Safe sale",
      amount: "14.50",
      transactionId: 99,
    })).resolves.toMatchObject({ eligibleSubscriptions: 1 });

    await expect(sendPushToMerchant(42, {
      type: "payment_received",
      itemName: "Safe sale",
      amount: "14.50",
      transactionId: 99,
    })).resolves.toMatchObject({ eligibleSubscriptions: 2 });
  });

  // Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-5-owner-answers.md, answer 1):
  // a subscription stored before endpoints were checked is never contacted unless it is a browser
  // push service's; it is turned off instead.
  test("never contacts a stored endpoint that is not a push service's, and turns it off", async () => {
    const stored = { ...subscription(5, true), endpoint: "https://169.254.169.254/latest/meta-data" };
    getPushSubscriptionsByMerchant.mockResolvedValue([subscription(4, true), stored]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendPushToMerchant(42, {
      type: "payment_received",
      itemName: "Safe sale",
      amount: "14.50",
      transactionId: 99,
    })).resolves.toMatchObject({ attempted: 1, delivered: 1 });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect((webpush.sendNotification as jest.Mock).mock.calls[0][0].endpoint).toBe(subscription(4, true).endpoint);
    expect(deactivatePushSubscription).toHaveBeenCalledWith(5);
    log.mockRestore();
  });

  test("payload contains only the event DTO and no subscription secrets", () => {
    const payload = buildPushPayload({
      type: "daily_payout_summary",
      localDate: "2026-08-05",
      amount: "125.00",
      paymentCount: 4,
    });
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      title: "Daily payout summary",
      data: {
        eventType: "daily_payout_summary",
        localDate: "2026-08-05",
        url: "/transactions",
      },
    });
    expect(serialized).not.toContain("endpoint");
    expect(serialized).not.toContain("p256dh");
    expect(serialized).not.toContain("auth-secret");
  });

  test.each([404, 410])("deactivates a web subscription after push status %s", async (statusCode) => {
    getPushSubscriptionsByMerchant.mockResolvedValue([subscription(3, true)]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode });

    await expect(sendPushToMerchant(42, {
      type: "payment_received",
      itemName: "Safe sale",
      amount: "14.50",
      transactionId: 99,
    })).resolves.toMatchObject({ attempted: 1, failed: 1 });

    expect(deactivatePushSubscription).toHaveBeenCalledWith(3);
  });
});
