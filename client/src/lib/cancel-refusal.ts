/** Owner decision OI-1 (2026-10-13): the server refuses a cancel only when money has been taken
 * (PAYMENT_CAPTURED) or Windcave has just confirmed a payment (PAYMENT_COMPLETED). Its message
 * says which; show it rather than a generic failure. apiRequest throws "<status>: <body>". */
export function cancelRefusalMessage(error: unknown): string | null {
  const text = error instanceof Error ? error.message : "";
  const match = /^409: (.*)$/s.exec(text);
  if (!match) return null;
  try {
    const body = JSON.parse(match[1]);
    return (body?.code === "PAYMENT_CAPTURED" || body?.code === "PAYMENT_COMPLETED") && typeof body.message === "string"
      ? body.message
      : null;
  } catch {
    return null;
  }
}
