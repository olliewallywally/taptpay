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

/**
 * The page a phone opens from a business's old no-board NFC tag (`/nfc/:merchantId`): the
 * customer notice, with no script and no link onward — there is no business-wide page left
 * to send them to.
 */
export function noBoardAddressRetiredHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TaptPay</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#000a36;font-family:system-ui,sans-serif;color:#fff;text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}p{opacity:.7;font-size:15px;max-width:320px;margin:0 auto}</style></head><body><main><h1>Ask for your payment link</h1><p>Each sale now has its own payment link. Ask the business to show you the QR code for your sale.</p></main></body></html>`;
}
