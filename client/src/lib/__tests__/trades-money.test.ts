import {
  tradesInvoiceRemainingCents,
  tradesOutstandingCents,
  type TradesBalanceInvoice,
} from "../trades-money";

const openInvoice = (
  overrides: Partial<TradesBalanceInvoice> = {},
): TradesBalanceInvoice => ({
  amountCents: 100_001,
  status: "dispatched",
  splitEnabled: false,
  splitCount: null,
  splitPaidCount: 0,
  ...overrides,
});

describe("tradesInvoiceRemainingCents", () => {
  it.each(["paid", "paid_external", "voided", "deposit_paid"])(
    "returns zero for closed status %s",
    (status) => {
      expect(
        tradesInvoiceRemainingCents(
          openInvoice({
            status,
            splitEnabled: true,
            splitCount: 3,
            splitPaidCount: 1,
          }),
        ),
      ).toBe(0);
    },
  );

  it("returns the full amount for an open unsplit invoice", () => {
    expect(tradesInvoiceRemainingCents(openInvoice())).toBe(100_001);
    expect(
      tradesInvoiceRemainingCents(
        openInvoice({ splitEnabled: false, splitCount: 4, splitPaidCount: 2 }),
      ),
    ).toBe(100_001);
  });

  it.each([null, 0, 1, 2.5])(
    "returns the full amount for invalid split count %s",
    (splitCount) => {
      expect(
        tradesInvoiceRemainingCents(
          openInvoice({
            splitEnabled: true,
            splitCount,
            splitPaidCount: 1,
          }),
        ),
      ).toBe(100_001);
    },
  );

  it("preserves every remainder cent through 0, 1, penultimate and final shares", () => {
    const split = {
      splitEnabled: true,
      splitCount: 3,
      amountCents: 100_001,
    } satisfies Partial<TradesBalanceInvoice>;

    expect(
      tradesInvoiceRemainingCents(openInvoice({ ...split, splitPaidCount: 0 })),
    ).toBe(100_001);
    expect(
      tradesInvoiceRemainingCents(openInvoice({ ...split, splitPaidCount: 1 })),
    ).toBe(66_668);
    expect(
      tradesInvoiceRemainingCents(openInvoice({ ...split, splitPaidCount: 2 })),
    ).toBe(33_335);
    expect(
      tradesInvoiceRemainingCents(openInvoice({ ...split, splitPaidCount: 3 })),
    ).toBe(0);
  });

  it("clamps negative and corrupt-overcount paid shares", () => {
    const split = {
      splitEnabled: true,
      splitCount: 3,
      amountCents: 10_001,
    } satisfies Partial<TradesBalanceInvoice>;

    expect(
      tradesInvoiceRemainingCents(openInvoice({ ...split, splitPaidCount: -2 })),
    ).toBe(10_001);
    expect(
      tradesInvoiceRemainingCents(openInvoice({ ...split, splitPaidCount: 99 })),
    ).toBe(0);
  });

  it("uses the exact final-share remainder for a non-divisible total", () => {
    expect(
      tradesInvoiceRemainingCents(
        openInvoice({
          amountCents: 1_000,
          splitEnabled: true,
          splitCount: 3,
          splitPaidCount: 2,
        }),
      ),
    ).toBe(334);
  });
});

describe("tradesOutstandingCents", () => {
  it("sums remaining balances rather than gross open invoice amounts", () => {
    expect(
      tradesOutstandingCents([
        openInvoice({ amountCents: 10_001 }),
        openInvoice({
          amountCents: 10_001,
          splitEnabled: true,
          splitCount: 3,
          splitPaidCount: 1,
        }),
        openInvoice({ amountCents: 50_000, status: "paid" }),
      ]),
    ).toBe(16_669);
  });
});
