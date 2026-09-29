import { sendPushToMerchant, type PushDeliveryResult } from "./push";
import { storage, type IStorage } from "./storage";

export const DAILY_PAYOUT_TIME_ZONE = "Pacific/Auckland";
export const DAILY_PAYOUT_CUTOFF_HOUR = 9;

export type DailyPayoutWindow = {
  localDate: string;
  start: Date;
  end: Date;
};

type DailyPayoutStorage = Pick<
  IStorage,
  | "getDailyPushPaymentSummaries"
  | "claimPushNotificationDelivery"
  | "completePushNotificationDelivery"
>;

export type DailyPayoutNotificationDependencies = {
  storage: DailyPayoutStorage;
  sendPush: typeof sendPushToMerchant;
};

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_PAYOUT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
  };
}

function localDateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function previousCalendarDate(year: number, month: number, day: number) {
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return {
    year: previous.getUTCFullYear(),
    month: previous.getUTCMonth() + 1,
    day: previous.getUTCDate(),
  };
}

/** Convert an Auckland local midnight to UTC without assuming a fixed offset. */
function zonedMidnightUtc(year: number, month: number, day: number): Date {
  const desiredWallClock = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = desiredWallClock;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DAILY_PAYOUT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const representedWallClock = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    );
    const correction = desiredWallClock - representedWallClock;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

export function getDailyPayoutWindow(now: Date): DailyPayoutWindow | null {
  const current = zonedParts(now);
  if (current.hour < DAILY_PAYOUT_CUTOFF_HOUR) return null;
  const previous = previousCalendarDate(current.year, current.month, current.day);
  return {
    localDate: localDateString(previous.year, previous.month, previous.day),
    start: zonedMidnightUtc(previous.year, previous.month, previous.day),
    end: zonedMidnightUtc(current.year, current.month, current.day),
  };
}

export async function runDailyPayoutNotificationPass(
  now = new Date(),
  dependencies: DailyPayoutNotificationDependencies = {
    storage,
    sendPush: sendPushToMerchant,
  },
) {
  const window = getDailyPayoutWindow(now);
  if (!window) {
    return { beforeCutoff: true, processed: 0, skipped: 0, failed: 0 };
  }

  const summaries = await dependencies.storage.getDailyPushPaymentSummaries(
    window.start,
    window.end,
  );
  const result = { beforeCutoff: false, processed: 0, skipped: 0, failed: 0 };

  for (const summary of summaries) {
    const claimToken = await dependencies.storage.claimPushNotificationDelivery(
      summary.merchantId,
      "daily_payout_summary",
      window.localDate,
    );
    if (!claimToken) {
      result.skipped += 1;
      continue;
    }

    let deliveryStatus: "processed" | "skipped" | "failed" = "failed";
    try {
      const delivery: PushDeliveryResult = await dependencies.sendPush(summary.merchantId, {
        type: "daily_payout_summary",
        localDate: window.localDate,
        amount: summary.amount,
        paymentCount: summary.paymentCount,
      });
      deliveryStatus = delivery.eligibleSubscriptions === 0
        ? "skipped"
        : delivery.delivered > 0
          ? "processed"
          : "failed";
      result[deliveryStatus] += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[DAILY_PUSH] merchant=${summary.merchantId} delivery failed: ${message}`);
    } finally {
      await dependencies.storage.completePushNotificationDelivery(
        summary.merchantId,
        "daily_payout_summary",
        window.localDate,
        claimToken,
        deliveryStatus,
      );
    }
  }

  return result;
}
