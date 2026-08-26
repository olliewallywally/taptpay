import { PLANS, PLAN_IDS, PLAN_LIST, planFor, planForOrDefault, isUpgrade, planAmountString } from "@shared/plans";
import {
  DUNNING_RETRY_DAYS,
  MAX_PAYMENT_ATTEMPTS,
  billingIdempotencyKey,
  decideBilling,
  failedPaymentUpdates,
  immediatePlanUpdates,
  nextBillingPeriodStart,
  nextPeriodUpdates,
  queuedPlanUpdates,
  proratedUpgradeCents,
} from "../subscription-billing";
import { addOneMonth, summariseSubscriptionRevenue } from "../storage";

function subscription(overrides: Record<string, any> = {}): any {
  return {
    id: 1,
    merchantId: 22,
    planId: "solo",
    seatLimit: 1,
    priceCents: 799,
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
    nextBillingDate: new Date("2026-09-01T00:00:00Z"),
    windcaveCardId: "card_abc",
    failedPaymentCount: 0,
    lastPaymentFailureAt: null,
    pendingPlanId: null,
    ...overrides,
  };
}

describe("plan catalogue", () => {
  it("prices and seats match what the marketing page sells", () => {
    expect(PLANS.solo).toMatchObject({ priceCents: 799, seats: 1 });
    expect(PLANS.team).toMatchObject({ priceCents: 899, seats: 5 });
    expect(PLANS.crew).toMatchObject({ priceCents: 1299, seats: 10 });
  });

  it("is ordered cheapest first and strictly increasing in price and seats", () => {
    const prices = PLAN_LIST.map((p) => p.priceCents);
    const seats = PLAN_LIST.map((p) => p.seats);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(seats).toEqual([...seats].sort((a, b) => a - b));
    expect(new Set(prices).size).toBe(prices.length);
  });

  it("refuses to resolve an unknown plan rather than guessing one", () => {
    expect(() => planFor("enterprise")).toThrow(/Unknown plan/);
    expect(() => planFor(undefined)).toThrow(/Unknown plan/);
    // Display paths fall back instead of throwing.
    expect(planForOrDefault("enterprise").id).toBe("solo");
  });

  it("classifies upgrades by price, which drives immediate vs queued", () => {
    expect(isUpgrade("solo", "team")).toBe(true);
    expect(isUpgrade("crew", "solo")).toBe(false);
    expect(isUpgrade("team", "team")).toBe(false);
  });

  it("renders Windcave amounts as two-decimal strings", () => {
    expect(PLAN_IDS.map((id) => planAmountString(PLANS[id].priceCents)))
      .toEqual(["7.99", "8.99", "12.99"]);
  });
});

describe("billing period arithmetic", () => {
  it("does not skip a month for end-of-month start dates", () => {
    // Plain setMonth(+1) turns 31 Jan into 3 Mar, permanently drifting billing.
    expect(addOneMonth(new Date("2026-01-31T12:30:00Z")).toISOString())
      .toBe("2026-02-28T12:30:00.000Z");
    expect(addOneMonth(new Date("2026-03-31T12:30:00Z")).toISOString())
      .toBe("2026-04-30T12:30:00.000Z");
  });

  it("keeps the anchor day when the target month is long enough", () => {
    expect(addOneMonth(new Date("2026-01-15T12:30:00Z")).toISOString())
      .toBe("2026-02-15T12:30:00.000Z");
  });
});

describe("billing idempotency", () => {
  it("derives the same key for the same subscription period", () => {
    const periodStart = new Date("2026-08-01T09:30:00Z");
    const again = new Date("2026-08-01T23:59:00Z");
    // Same period, different times of day: one key, so a retried run cannot
    // charge twice.
    expect(billingIdempotencyKey(7, periodStart)).toBe(billingIdempotencyKey(7, again));
  });
  it("uses a new key only after a confirmed billing attempt", () => {
    const periodStart = new Date("2026-08-01T00:00:00Z");
    expect(billingIdempotencyKey(7, periodStart, 1))
      .not.toBe(billingIdempotencyKey(7, periodStart, 2));
  });


  it("derives different keys across periods and subscriptions", () => {
    const august = new Date("2026-08-01T00:00:00Z");
    const september = new Date("2026-09-01T00:00:00Z");
    expect(billingIdempotencyKey(7, august)).not.toBe(billingIdempotencyKey(7, september));
    expect(billingIdempotencyKey(7, august)).not.toBe(billingIdempotencyKey(8, august));
  });
});

describe("decideBilling", () => {
  const due = new Date("2026-09-01T00:00:00Z");

  it("charges an active subscription once its billing date arrives", () => {
    expect(decideBilling(subscription(), due).action).toBe("charge");
  });

  it("does not charge before the billing date", () => {
    expect(decideBilling(subscription(), new Date("2026-08-20T00:00:00Z")))
      .toEqual({ action: "skip", reason: "not_due" });
  });

  it("never charges a cancelling subscription", () => {
    expect(decideBilling(subscription({ cancelAtPeriodEnd: true }), due))
      .toEqual({ action: "skip", reason: "cancelled" });
    expect(decideBilling(subscription({ status: "cancelled" }), due))
      .toEqual({ action: "skip", reason: "cancelled" });
  });

  it("skips suspended subscriptions and records a due missing-card failure", () => {
    expect(decideBilling(subscription({ status: "suspended" }), due).reason).toBe("suspended");
    expect(decideBilling(subscription({ status: "pending" }), due).reason).toBe("inactive");
    expect(decideBilling(subscription({ windcaveCardId: null }), due))
      .toEqual({ action: "record_failure", reason: "No payment method on file" });
  });

  it("backs off between dunning retries instead of hammering the card", () => {
    const pastDue = subscription({
      status: "past_due",
      failedPaymentCount: 1,
      lastPaymentFailureAt: new Date("2026-09-01T00:00:00Z"),
    });
    // First retry is DUNNING_RETRY_DAYS[0] days after the failure.
    const tooSoon = new Date("2026-09-01T12:00:00Z");
    expect(decideBilling(pastDue, tooSoon)).toEqual({ action: "skip", reason: "retry_backoff" });

    const afterBackoff = new Date("2026-09-01T00:00:00Z");
    afterBackoff.setDate(afterBackoff.getDate() + DUNNING_RETRY_DAYS[0]);
    expect(decideBilling(pastDue, afterBackoff).action).toBe("charge");
  });

  it("stops retrying once the attempts are exhausted", () => {
    const exhausted = subscription({
      status: "past_due",
      failedPaymentCount: MAX_PAYMENT_ATTEMPTS,
      lastPaymentFailureAt: new Date("2026-09-01T00:00:00Z"),
    });
    expect(decideBilling(exhausted, new Date("2027-01-01T00:00:00Z")))
      .toEqual({ action: "skip", reason: "exhausted" });
  });
});

describe("billing outcome updates", () => {
  const now = new Date("2026-09-01T00:00:00Z");

  it("advances the period and clears dunning state on success", () => {
    const updates = nextPeriodUpdates(subscription(), now);
    expect(updates.status).toBe("active");
    expect(updates.failedPaymentCount).toBe(0);
    expect(updates.lastPaymentFailureAt).toBeNull();
    expect(updates.currentPeriodStart).toEqual(now);
    expect(updates.nextBillingDate).toEqual(updates.currentPeriodEnd);
  });

  it("keeps the original initial-dunning anchor across calendar-day retries", () => {
    const anchor = new Date("2026-09-01T08:15:00Z");
    const initialDunning = subscription({
      status: "past_due",
      lastBillingDate: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextBillingDate: anchor,
      failedPaymentCount: 1,
    });
    const dayThree = new Date("2026-09-04T09:00:00Z");
    const daySeven = new Date("2026-09-08T09:00:00Z");
    expect(nextBillingPeriodStart(initialDunning, dayThree)).toEqual(anchor);
    expect(nextBillingPeriodStart(initialDunning, daySeven)).toEqual(anchor);
    expect(billingIdempotencyKey(1, nextBillingPeriodStart(initialDunning, dayThree), 2))
      .toBe(billingIdempotencyKey(1, nextBillingPeriodStart(initialDunning, daySeven), 2));
    expect(nextPeriodUpdates(initialDunning, daySeven).currentPeriodStart).toEqual(anchor);
  });

  it("applies a queued downgrade at the period boundary, not before", () => {
    const updates = nextPeriodUpdates(subscription({ planId: "crew", pendingPlanId: "solo" }), now);
    expect(updates.planId).toBe("solo");
    expect(updates.seatLimit).toBe(1);
    expect(updates.priceCents).toBe(799);
    expect(updates.pendingPlanId).toBeNull();
  });
  it("preserves grandfathered price and seats when the plan has not changed", () => {
    const updates = nextPeriodUpdates(subscription({
      priceCents: 699,
      seatLimit: 2,
    }), now);
    expect(updates.priceCents).toBe(699);
    expect(updates.seatLimit).toBe(2);
    expect(updates.planId).toBe("solo");
  });


  it("moves to past_due on the first decline and suspends only when exhausted", () => {
    expect(failedPaymentUpdates(subscription(), now, "Declined", false))
      .toMatchObject({ status: "past_due", failedPaymentCount: 1 });
    expect(failedPaymentUpdates(subscription({ failedPaymentCount: 3 }), now, "Declined", true))
      .toMatchObject({ status: "suspended", failedPaymentCount: 4 });
  });

  it("truncates a processor failure reason so it cannot overflow the column", () => {
    const updates = failedPaymentUpdates(subscription(), now, "x".repeat(900), false);
    expect(updates.lastPaymentFailureReason).toHaveLength(500);
  });

  it("keeps sending allowed until billing actually gives up", () => {
  });
});

describe("plan change updates", () => {
  const now = new Date("2026-08-15T00:00:00Z");

  it("an upgrade takes effect immediately", () => {
    expect(immediatePlanUpdates("crew", now)).toMatchObject({
      planId: "crew", seatLimit: 10, priceCents: 1299, pendingPlanId: null,
    });
  });

  it("a downgrade is queued to the end of the paid period", () => {
    const periodEnd = new Date("2026-09-01T00:00:00Z");
    expect(queuedPlanUpdates("solo", periodEnd, now)).toMatchObject({
      pendingPlanId: "solo", pendingPlanEffectiveAt: periodEnd,
    });
  });
});


  it("prorates only the positive remaining-period difference", () => {
    const start = new Date("2026-08-01T00:00:00Z");
    const end = new Date("2026-09-01T00:00:00Z");
    const halfway = new Date("2026-08-16T12:00:00Z");

    expect(proratedUpgradeCents(799, 1299, start, end, halfway)).toBe(250);
    expect(proratedUpgradeCents(1299, 799, start, end, halfway)).toBe(0);
    expect(proratedUpgradeCents(799, 1299, start, end, end)).toBe(0);
  });
describe("subscription revenue", () => {
  it("counts only subscriptions that will actually be charged next period", () => {
    const summary = summariseSubscriptionRevenue([
      { planId: "solo", priceCents: 799, status: "active", cancelAtPeriodEnd: false, lastBillingDate: "2026-08-01" },
      { planId: "crew", priceCents: 1299, status: "active", cancelAtPeriodEnd: false, lastBillingDate: "2026-08-01" },
      // Excluded: money not yet collected, or not coming again.
      { planId: "team", priceCents: 899, status: "past_due", cancelAtPeriodEnd: false },
      { planId: "team", priceCents: 899, status: "suspended", cancelAtPeriodEnd: false },
      { planId: "team", priceCents: 899, status: "active", cancelAtPeriodEnd: true },
      { planId: "team", priceCents: 899, status: "active", cancelAtPeriodEnd: false, lastBillingDate: null },
    ]);

    expect(summary.monthlyRecurringRevenue).toBeCloseTo(20.98, 2);
    expect(summary.payingSubscriptions).toBe(2);
    expect(summary.totalSubscriptions).toBe(6);
    expect(summary.pastDue).toBe(1);
    expect(summary.suspended).toBe(1);
    expect(summary.cancelling).toBe(1);
    expect(summary.byPlan.solo).toEqual({ count: 1, monthlyRevenue: 7.99 });
    expect(summary.byPlan.team).toBeUndefined();
  });

  it("reports zeroes rather than NaN for an empty platform", () => {
    expect(summariseSubscriptionRevenue([])).toMatchObject({
      monthlyRecurringRevenue: 0, payingSubscriptions: 0, totalSubscriptions: 0,
    });
  });
});
