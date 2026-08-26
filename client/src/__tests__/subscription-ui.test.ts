import {
  cardSetupBillingDisclosure,
  hasPaidCurrentSubscriptionPeriod,
  planChangeBillingDisclosure,
  subscriptionCancellationState,
} from "@/lib/subscription-ui";

describe("subscription settings display contract", () => {
  const now = Date.parse("2026-08-07T12:00:00.000Z");

  it("keeps scheduled cancellation distinct from an ended subscription", () => {
    expect(subscriptionCancellationState({
      status: "active",
      cancelAtPeriodEnd: true,
    })).toBe("scheduled");

    expect(subscriptionCancellationState({
      status: "cancelled",
      cancelAtPeriodEnd: true,
    })).toBe("cancelled");

    expect(subscriptionCancellationState({
      status: "active",
      cancelAtPeriodEnd: false,
    })).toBe("active");
  });

  it("recognises only an active, unexpired period as already paid", () => {
    expect(hasPaidCurrentSubscriptionPeriod({
      status: "active",
      currentPeriodEnd: "2026-09-07T12:00:00.000Z",
    }, now)).toBe(true);
    expect(hasPaidCurrentSubscriptionPeriod({
      status: "active",
      currentPeriodEnd: "2026-08-01T12:00:00.000Z",
    }, now)).toBe(false);
    expect(hasPaidCurrentSubscriptionPeriod({
      status: "cancelled",
      currentPeriodEnd: "2026-09-07T12:00:00.000Z",
    }, now)).toBe(false);
  });

  it("discloses no immediate charge for a paid current card replacement", () => {
    expect(cardSetupBillingDisclosure({
      status: "active",
      currentPeriodEnd: "2026-09-07T12:00:00.000Z",
    }, "$8.99", now)).toBe(
      "You won't be charged today. Your $8.99 monthly renewal stays unchanged.",
    );
  });

  it.each(["pending", "suspended", "cancelled"])(
    "discloses today's charge before %s card setup",
    (status) => {
      expect(cardSetupBillingDisclosure({ status }, "$12.99", now)).toBe(
        "You'll be charged $12.99 today when your card is verified, then monthly. Cancel before renewal.",
      );
    },
  );

  it("discloses the immediate proration before changing a paid plan", () => {
    expect(planChangeBillingDisclosure({
      status: "active",
      currentPeriodEnd: "2026-09-07T12:00:00.000Z",
    }, now)).toBe(
      "Upgrades charge the prorated price difference immediately. Downgrades have no charge today and start at renewal.",
    );
  });

  it("defers an unpaid plan selection charge until card verification", () => {
    expect(planChangeBillingDisclosure({ status: "cancelled" }, now)).toBe(
      "Changing your plan selection has no charge today. The selected plan's full monthly price is charged when your card is verified.",
    );
  });
});
