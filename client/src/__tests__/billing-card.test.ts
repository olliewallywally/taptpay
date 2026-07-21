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

  it("only marks supported cards with masked metadata as ready", () => {
    expect(billingCardIsReady({
      billingCardLast4: "4242",
      billingCardBrand: "Visa",
      billingCardExpiry: "12/29",
    }, now)).toBe(true);
    expect(billingCardIsReady({
      billingCardLast4: "4242",
      billingCardBrand: "Card",
      billingCardExpiry: "12/29",
    }, now)).toBe(false);
  });
});
