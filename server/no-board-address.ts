/**
 * Owner decision 2026-09-25
 * (docs/decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md, item 1): with a
 * payment board, the board's own page and stream; without one, every sale has its own private
 * link (`/pay/t/<token>`), the way property and trades bill.
 *
 * The business-wide no-board address (`/pay/:merchantId`, its live feed, its "current sale"
 * read, its QR code and NFC tag) is retired. Each of those answers 410 with this body: a
 * compatibility tombstone (plan §5.4) for anything still holding the old address.
 */
export const NO_BOARD_ADDRESS_RETIRED = {
  code: "NO_BOARD_ADDRESS_RETIRED",
  message:
    "Sales without a payment board now each have their own payment link. Ask the business for the link to your sale.",
} as const;

/** A request for a shared no-board sale: `linkMode: "legacy"` with no board. */
export const NO_BOARD_SALE_NEEDS_OWN_LINK = {
  code: "NO_BOARD_SALE_NEEDS_OWN_LINK",
  message: "A sale without a payment board gets its own payment link. Reload TaptPay and try again.",
} as const;
