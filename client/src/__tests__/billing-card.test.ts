import { billingCardIsReady, isCardExpiryValid, isLuhnValid } from "../../../server/billing-card";

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

  it("is ready only with a stored Windcave card on a live subscription", () => {
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

    // No token means Windcave has nothing to charge, whatever the masked data says.
    expect(billingCardIsReady({ ...stored, windcaveCardId: null }, now)).toBe(false);

    // An expired stored card cannot be charged next period.
    expect(billingCardIsReady({ ...stored, cardExpiry: "06/26" }, now)).toBe(false);

    // Suspended means billing already gave up retrying this card.
    expect(billingCardIsReady({ ...stored, status: "suspended" }, now)).toBe(false);

    // Past due still sends: the merchant has a live card and days to fix it.
    expect(billingCardIsReady({ ...stored, status: "past_due" }, now)).toBe(true);

    expect(billingCardIsReady(null, now)).toBe(false);
  });

  it("does not lock a merchant out over an expiry format Windcave chose", () => {
    // Windcave supplies the masked expiry; an unparseable one is our problem, not
    // the merchant's, and the card is still chargeable.
    expect(billingCardIsReady({
      status: "active",
      windcaveCardId: "card_abc123",
      cardExpiry: "2029-12",
      lastBillingDate: "2026-07-01T00:00:00.000Z",
    }, now)).toBe(true);
    expect(billingCardIsReady({
      status: "active",
      windcaveCardId: "card_abc123",
      cardExpiry: null,
      lastBillingDate: "2026-07-01T00:00:00.000Z",
    }, now)).toBe(true);
  });
});
