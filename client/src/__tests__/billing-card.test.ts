import {
  billingCardIsReady,
  renewalPaymentMethodIsReady,
  isCardExpiryValid,
  isLuhnValid,
} from "../../../server/billing-card";

describe("billing card validation", () => {
  const now = new Date(2026, 6, 20);

  it("accepts supported Luhn-valid card numbers", () => {
    expect(isLuhnValid("4242424242424242")).toBe(true);
    expect(isLuhnValid("5555555555554444")).toBe(true);
  });

  it("rejects malformed and Luhn-invalid card numbers", () => {
    expect(isLuhnValid("4242424242424241")).toBe(false);
    expect(isLuhnValid("1234")).toBe(false);
  });

  it("requires a valid, unexpired MM/YY date", () => {
    expect(isCardExpiryValid("07/26", now)).toBe(true);
    expect(isCardExpiryValid("06/26", now)).toBe(false);
    expect(isCardExpiryValid("13/29", now)).toBe(false);
  });

  it("keeps paid access separate from renewal-card readiness", () => {
    const stored = {
      status: "active",
      windcaveCardId: "card_abc123",
      cardBrand: "Visa",
      cardLast4: "4242",
      cardExpiry: "12/29",
      lastBillingDate: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    };
    expect(billingCardIsReady(stored, now)).toBe(true);
    expect(renewalPaymentMethodIsReady(stored, now)).toBe(true);

    // Removing a renewal card cannot claw back the month already paid for.
    expect(billingCardIsReady({ ...stored, windcaveCardId: null }, now)).toBe(true);
    expect(renewalPaymentMethodIsReady({ ...stored, windcaveCardId: null }, now)).toBe(false);

    // An expired card needs replacement, but access still lasts to period end.
    expect(billingCardIsReady({ ...stored, cardExpiry: "06/26" }, now)).toBe(true);
    expect(renewalPaymentMethodIsReady({ ...stored, cardExpiry: "06/26" }, now)).toBe(false);

    // Suspended means billing already gave up retrying this card.
    expect(billingCardIsReady({ ...stored, status: "suspended" }, now)).toBe(false);

    // Past due gets a bounded dunning grace period.
    expect(billingCardIsReady({
      ...stored,
      status: "past_due",
      currentPeriodEnd: "2026-07-19T00:00:00.000Z",
      failedPaymentCount: 1,
    }, now)).toBe(true);
    expect(billingCardIsReady({
      ...stored,
      status: "past_due",
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
      failedPaymentCount: 1,
    }, now)).toBe(false);
    expect(billingCardIsReady({
      ...stored,
      status: "past_due",
      lastBillingDate: null,
      currentPeriodEnd: null,
      nextBillingDate: "2026-07-19T00:00:00.000Z",
      failedPaymentCount: 1,
    }, now)).toBe(false);

    expect(billingCardIsReady(null, now)).toBe(false);
  });

  it("does not reject a renewal token over an expiry format Windcave chose", () => {
    // Windcave supplies the masked expiry; an unparseable one is our problem, not
    // the merchant's, and the card is still chargeable.
    expect(renewalPaymentMethodIsReady({
      status: "active",
      windcaveCardId: "card_abc123",
      cardExpiry: "2029-12",
    }, now)).toBe(true);
    expect(renewalPaymentMethodIsReady({
      status: "active",
      windcaveCardId: "card_abc123",
      cardExpiry: null,
    }, now)).toBe(true);
  });
});
