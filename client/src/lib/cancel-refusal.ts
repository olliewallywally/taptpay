/** Owner decision OI-1 (2026-10-13): the server refuses a cancel only when money has been taken
 * or Windcave has just confirmed a payment. R3's retail cancel answers PAYMENT_ACTIVE for money
 * taken (an approved attempt or a paid share); its message is shared with invoices, so the sale's
 * wording is given here. PAYMENT_CAPTURED and PAYMENT_COMPLETED carry their own message.
 * apiRequest throws "<status>: <body>". */
const MONEY_TAKEN = "A payment has already been taken on this sale. Refund it instead of cancelling.";

export function cancelRefusalMessage(error: unknown): string | null {
  const text = error instanceof Error ? error.message : "";
  const match = /^409: (.*)$/s.exec(text);
  if (!match) return null;
  try {
    const body = JSON.parse(match[1]);
    if (body?.code === "PAYMENT_ACTIVE") return MONEY_TAKEN;
    return (body?.code === "PAYMENT_CAPTURED" || body?.code === "PAYMENT_COMPLETED") && typeof body.message === "string"
      ? body.message
      : null;
  } catch {
    return null;
  }
}
