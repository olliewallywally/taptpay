/**
 * whatsapp-service.ts — thin seam over a self-hosted Evolution API instance
 * (https://github.com/evolution-foundation/evolution-api) for sending rent
 * links / reminders over WhatsApp. Mirrors the shape of email-service so the
 * delivery layer can switch channels without caring about the transport.
 *
 * Config (all server-side):
 *   EVOLUTION_API_URL   e.g. https://evo.example.com
 *   EVOLUTION_API_KEY   the instance/global apikey
 *   EVOLUTION_INSTANCE  default instance name (per-merchant override possible)
 */

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);
}

/**
 * Normalize a phone number to bare international digits (no '+'), defaulting to
 * the NZ country code (64). Returns null if it can't be made sense of.
 */
export function normalizeNzPhone(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "64" + d.slice(1);          // 021… → 6421…
  else if (!d.startsWith("64") && d.length >= 8 && d.length <= 10) d = "64" + d; // bare local number
  if (d.length < 10 || d.length > 13) return null;
  return d;
}

/**
 * Send a plain-text WhatsApp message. Returns true when Evolution accepts it.
 * Never throws — logs and returns false so callers can fall back to email.
 */
export async function sendWhatsApp(opts: { toPhone: string; text: string; instance?: string }): Promise<boolean> {
  if (!isWhatsAppConfigured()) {
    console.log(`[WHATSAPP] not configured — skipping send to ${opts.toPhone}`);
    return false;
  }
  const number = normalizeNzPhone(opts.toPhone);
  if (!number) {
    console.warn(`[WHATSAPP] unparseable number: ${opts.toPhone}`);
    return false;
  }
  const base = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
  const instance = opts.instance || process.env.EVOLUTION_INSTANCE || "default";
  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({ number, text: opts.text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[WHATSAPP] send failed ${res.status}: ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[WHATSAPP] send error: ${err?.message || err}`);
    return false;
  }
}
