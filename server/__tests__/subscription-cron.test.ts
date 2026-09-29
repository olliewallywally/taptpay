const storageMock = {
  expireCancelledSubscriptions: jest.fn(),
  claimSubscriptionsDueForBilling: jest.fn(),
  releaseSubscriptionBillingClaim: jest.fn(),
  finalizeSubscriptionBillingClaim: jest.fn(),
  getMerchant: jest.fn(),
};

const chargeStoredCardMock = jest.fn();
const sendFailureEmailMock = jest.fn();

jest.mock("../storage", () => ({
  storage: storageMock,
  addOneMonth: (value: Date) => {
    const result = new Date(value);
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(
      result.getUTCFullYear(),
      result.getUTCMonth() + 1,
      0,
    )).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
  },
}));

jest.mock("../windcave", () => ({
  isWindcaveConfigured: () => true,
  chargeStoredCard: (...args: unknown[]) => chargeStoredCardMock(...args),
}));

jest.mock("../email-service", () => ({
  sendSubscriptionPaymentFailedEmail: (...args: unknown[]) =>
    sendFailureEmailMock(...args),
}));

import { runSubscriptionBillingPass } from "../subscription-cron";

function dueSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    merchantId: 22,
    planId: "solo",
    seatLimit: 1,
    priceCents: 799,
    status: "past_due",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingDate: new Date("2026-09-01T08:15:00.000Z"),
    lastBillingDate: null,
    pendingPlanId: null,
    pendingPlanEffectiveAt: null,
    cancelAtPeriodEnd: false,
    windcaveCardId: "card-token",
    failedPaymentCount: 1,
    billingClaimToken: "claim-token",
    billingClaimedAt: new Date("2026-09-04T09:00:00.000Z"),
    ...overrides,
  } as any;
}

describe("subscription billing cron reconciliation", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    storageMock.expireCancelledSubscriptions.mockResolvedValue(0);
    storageMock.releaseSubscriptionBillingClaim.mockResolvedValue(undefined);
    storageMock.finalizeSubscriptionBillingClaim.mockResolvedValue(true);
    storageMock.getMerchant.mockResolvedValue({
      email: "owner@example.test",
      businessName: "Example Store",
    });
    sendFailureEmailMock.mockResolvedValue(true);
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test("reuses the persisted initial-period key after lost responses on later days", async () => {
    const subscription = dueSubscription();
    storageMock.claimSubscriptionsDueForBilling.mockResolvedValue([subscription]);
    chargeStoredCardMock.mockResolvedValue({
      success: false,
      error: "response lost",
    });

    await runSubscriptionBillingPass(new Date("2026-09-04T09:00:00.000Z"));
    await runSubscriptionBillingPass(new Date("2026-09-05T09:00:00.000Z"));

    expect(chargeStoredCardMock).toHaveBeenCalledTimes(2);
    expect(chargeStoredCardMock.mock.calls[0][0])
      .toBe("sub-41-2026-09-01-a2");
    expect(chargeStoredCardMock.mock.calls[1][0])
      .toBe(chargeStoredCardMock.mock.calls[0][0]);
    expect(storageMock.finalizeSubscriptionBillingClaim).not.toHaveBeenCalled();
    expect(storageMock.releaseSubscriptionBillingClaim).toHaveBeenCalledTimes(2);
  });

  test("moves a due cardless subscription into dunning instead of skipping it", async () => {
    const subscription = dueSubscription({
      status: "active",
      failedPaymentCount: 0,
      windcaveCardId: null,
    });
    storageMock.claimSubscriptionsDueForBilling.mockResolvedValue([subscription]);

    const result = await runSubscriptionBillingPass(
      new Date("2026-09-01T08:15:00.000Z"),
    );

    expect(chargeStoredCardMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ failed: 1, skipped: 0, errors: 0 });
    expect(storageMock.finalizeSubscriptionBillingClaim).toHaveBeenCalledWith(
      41,
      "claim-token",
      expect.objectContaining({
        status: "past_due",
        failedPaymentCount: 1,
        lastPaymentFailureReason: "No payment method on file",
      }),
      expect.objectContaining({
        billingPeriodStart: new Date("2026-09-01T08:15:00.000Z"),
        idempotencyKey: "sub-41-2026-09-01-a1",
        status: "failed",
      }),
    );
  });
});
