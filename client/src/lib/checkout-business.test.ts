import { checkoutBusiness } from "./checkout-business";

/** Owner decision 2026-09-26 (answer 3): the business's details come with what the page holds. */
describe("the checkout page's business details", () => {
  const business = { businessName: "Kōwhai Café", customLogoUrl: "/uploads/logos/kowhai.png" };

  it("come with a payment link's answer", () => {
    expect(checkoutBusiness("retail-token", { tokenPayment: { merchant: business } })).toEqual(business);
  });

  it("come with an invoice's answer, which names the business as merchantName", () => {
    expect(
      checkoutBusiness("invoice-token", {
        invoiceData: { merchantName: "Kōwhai Café", customLogoUrl: "/uploads/logos/kowhai.png", merchantId: 7 },
      }),
    ).toEqual(business);
  });

  it("come with a board sale's own read", () => {
    expect(checkoutBusiness("retail-legacy", { rawTransaction: { id: 5, merchantId: 7, merchant: business } })).toEqual(business);
  });

  it("are absent for a quote, and until what the page holds has loaded", () => {
    expect(checkoutBusiness("quote-token", { rawTransaction: { merchant: business } })).toBeUndefined();
    expect(checkoutBusiness("invoice-token", {})).toBeUndefined();
    expect(checkoutBusiness(undefined, { tokenPayment: { merchant: business } })).toBeUndefined();
  });
});
