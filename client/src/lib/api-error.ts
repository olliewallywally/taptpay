/** Extract the HTTP status from errors thrown by `apiRequest`. */
export function apiErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.trim().match(/^(\d{3})(?::|\s|$)/);
  return match ? Number(match[1]) : null;
}

/**
 * `apiRequest` throws `"409: {\"message\":\"…\"}"` before callers can read
 * the Response body. Turn that back into the safe, actionable server message.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const raw = error.message.trim();
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const payload = JSON.parse(raw.slice(jsonStart));
      if (typeof payload?.message === "string" && payload.message.trim()) {
        return payload.message.trim();
      }
    } catch {
      // Fall through to the non-JSON message below.
    }
  }

  const withoutStatus = raw.replace(/^\d{3}:\s*/, "").trim();
  return withoutStatus || fallback;
}
