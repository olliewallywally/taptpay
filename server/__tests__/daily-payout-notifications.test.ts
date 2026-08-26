import {
  getDailyPayoutWindow,
  runDailyPayoutNotificationPass,
} from "../daily-payout-notifications";

describe("daily payout notification scheduling", () => {
  test("uses the previous Auckland calendar day across summer and winter offsets", () => {
    const summer = getDailyPayoutWindow(new Date("2026-01-16T00:00:00.000Z"));
    expect(summer).toEqual({
      localDate: "2026-01-15",
      start: new Date("2026-01-14T11:00:00.000Z"),
      end: new Date("2026-01-15T11:00:00.000Z"),
    });

    const winter = getDailyPayoutWindow(new Date("2026-07-16T00:00:00.000Z"));
    expect(winter).toEqual({
      localDate: "2026-07-15",
      start: new Date("2026-07-14T12:00:00.000Z"),
      end: new Date("2026-07-15T12:00:00.000Z"),
    });

    expect(getDailyPayoutWindow(new Date("2026-01-15T19:00:00.000Z"))).toBeNull();
  });

  test("claims merchant/date once before sending and records completion", async () => {
    const getDailyPushPaymentSummaries = jest.fn().mockResolvedValue([
      { merchantId: 42, amount: "37.50", paymentCount: 3 },
    ]);
    const claimPushNotificationDelivery = jest.fn()
      .mockResolvedValueOnce("claim-one")
      .mockResolvedValueOnce(null);
    const completePushNotificationDelivery = jest.fn().mockResolvedValue(undefined);
    const sendPush = jest.fn().mockResolvedValue({
      eligibleSubscriptions: 1,
      attempted: 1,
      delivered: 1,
      failed: 0,
    });
    const dependencies = {
      storage: {
        getDailyPushPaymentSummaries,
        claimPushNotificationDelivery,
        completePushNotificationDelivery,
      },
      sendPush,
    } as any;
    const now = new Date("2026-07-16T00:00:00.000Z");

    await expect(runDailyPayoutNotificationPass(now, dependencies)).resolves.toEqual({
      beforeCutoff: false,
      processed: 1,
      skipped: 0,
      failed: 0,
    });
    await expect(runDailyPayoutNotificationPass(now, dependencies)).resolves.toEqual({
      beforeCutoff: false,
      processed: 0,
      skipped: 1,
      failed: 0,
    });

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(42, {
      type: "daily_payout_summary",
      localDate: "2026-07-15",
      amount: "37.50",
      paymentCount: 3,
    });
    expect(completePushNotificationDelivery).toHaveBeenCalledWith(
      42,
      "daily_payout_summary",
      "2026-07-15",
      "claim-one",
      "processed",
    );
  });

  test("records unavailable delivery as failed so a later configured run can retry", async () => {
    const storage = {
      getDailyPushPaymentSummaries: jest.fn().mockResolvedValue([
        { merchantId: 42, amount: "10.00", paymentCount: 1 },
      ]),
      claimPushNotificationDelivery: jest.fn()
        .mockResolvedValueOnce("claim-one")
        .mockResolvedValueOnce("claim-two"),
      completePushNotificationDelivery: jest.fn().mockResolvedValue(undefined),
    };
    const sendPush = jest.fn()
      .mockResolvedValueOnce({
        eligibleSubscriptions: 1,
        attempted: 0,
        delivered: 0,
        failed: 0,
      })
      .mockResolvedValueOnce({
        eligibleSubscriptions: 1,
        attempted: 1,
        delivered: 1,
        failed: 0,
      });
    const dependencies = { storage, sendPush } as any;
    const now = new Date("2026-07-16T00:00:00.000Z");

    await expect(runDailyPayoutNotificationPass(now, dependencies))
      .resolves.toMatchObject({ failed: 1 });
    await expect(runDailyPayoutNotificationPass(now, dependencies))
      .resolves.toMatchObject({ processed: 1 });
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(storage.completePushNotificationDelivery).toHaveBeenNthCalledWith(
      1, 42, "daily_payout_summary", "2026-07-15", "claim-one", "failed",
    );
  });
});
