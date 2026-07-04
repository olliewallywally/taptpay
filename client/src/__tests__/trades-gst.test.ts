import { computeQuoteTotals } from "@shared/trades-gst";

const lines = [
  { qty: 2, unitPriceCents: 5000 },
  { qty: 1, unitPriceCents: 1500 },
];

describe("computeQuoteTotals", () => {
  test("not registered: no GST, total equals line sum", () => {
    expect(
      computeQuoteTotals(lines, {
        gstRegistered: false,
        gstMode: "inclusive",
      }),
    ).toEqual({
      subtotalCents: 11500,
      gstCents: 0,
      totalCents: 11500,
      depositCents: null,
    });
  });

  test("inclusive: GST is the portion within the line sum", () => {
    const totals = computeQuoteTotals(lines, {
      gstRegistered: true,
      gstMode: "inclusive",
    });

    expect(totals.totalCents).toBe(11500);
    expect(totals.gstCents).toBe(1500);
    expect(totals.subtotalCents).toBe(10000);
  });

  test("exclusive: GST is added on top of the line sum", () => {
    const totals = computeQuoteTotals(lines, {
      gstRegistered: true,
      gstMode: "exclusive",
    });

    expect(totals.subtotalCents).toBe(11500);
    expect(totals.gstCents).toBe(1725);
    expect(totals.totalCents).toBe(13225);
  });

  test("percent deposit is a fraction of the mode-specific total", () => {
    const totals = computeQuoteTotals(lines, {
      gstRegistered: true,
      gstMode: "exclusive",
      depositEnabled: true,
      depositType: "percent",
      depositValue: 20,
    });

    expect(totals.depositCents).toBe(2645);
  });

  test("fixed deposit is clamped to total", () => {
    const totals = computeQuoteTotals(lines, {
      gstRegistered: false,
      gstMode: "inclusive",
      depositEnabled: true,
      depositType: "fixed",
      depositValue: 99999999,
    });

    expect(totals.depositCents).toBe(11500);
  });
});
