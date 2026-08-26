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

function subscription(id: number, failedPaymentAlerts: boolean) {
  return {
    id,
    merchantId: 42,
    endpoint: `https://push.example.test/${id}`,
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
});
