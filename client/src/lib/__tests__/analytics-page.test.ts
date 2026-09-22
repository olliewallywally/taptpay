import { analyticsPageView, sendAnalyticsPageView } from "../analytics-page";

/*
 * R1-T4 phase A. GA4 fills page_location and page_referrer from the address by
 * default, query strings included — and addresses carry secrets: Google sign-in
 * put the account token in /login?token=, reset and invite links carry theirs in
 * the query, and payment, invoice and quote links carry theirs in the path.
 */
describe("what a page view tells analytics", () => {
  it("sends the path without its query, as location and path alike", () => {
    expect(analyticsPageView("/login?token=secret.jwt.value&merchantId=1", "https://taptpay.test", "")).toEqual({
      page_path: "/login",
      page_location: "https://taptpay.test/login",
      page_referrer: "",
    });
    expect(analyticsPageView("/reset-password?token=reset-secret", "https://taptpay.test", "").page_location)
      .toBe("https://taptpay.test/reset-password");
  });

  it("redacts every token-bearing path", () => {
    for (const [path, redacted] of [
      ["/pay/t/tok_abc", "/pay/t/:token"],
      ["/r/invoice-token", "/r/:token"],
      ["/trades/quote/quote-token", "/trades/quote/:token"],
      ["/checkout/t/tok_abc", "/checkout/t/:token"],
      ["/receipt/t/tok_abc", "/receipt/t/:token"],
    ]) {
      expect(analyticsPageView(path, "https://taptpay.test", "")).toMatchObject({
        page_path: redacted,
        page_location: `https://taptpay.test${redacted}`,
      });
    }
  });

  it("keeps only the referring site's origin", () => {
    expect(analyticsPageView("/dashboard", "https://taptpay.test", "https://taptpay.test/login?token=secret").page_referrer)
      .toBe("https://taptpay.test/");
    expect(analyticsPageView("/", "https://taptpay.test", "https://www.google.com/search?q=eftpos").page_referrer)
      .toBe("https://www.google.com/");
    expect(analyticsPageView("/", "https://taptpay.test", "not a url").page_referrer).toBe("");
  });

  it("sets the redacted location for every later event, then sends the page view", () => {
    const gtag = jest.fn();
    sendAnalyticsPageView(gtag, "/r/invoice-token?x=1", { origin: "https://taptpay.test", referrer: "", title: "Pay" });
    expect(gtag.mock.calls).toEqual([
      ["set", { page_location: "https://taptpay.test/r/:token", page_referrer: "" }],
      ["event", "page_view", {
        page_path: "/r/:token", page_location: "https://taptpay.test/r/:token", page_referrer: "", page_title: "Pay",
      }],
    ]);
    expect(JSON.stringify(gtag.mock.calls)).not.toContain("invoice-token");
  });
});
