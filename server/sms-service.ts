/**
 * sms-service.ts — thin seam over Twilio's REST API for sending rent links /
 * reminders over SMS. Mirrors the shape of whatsapp-service / email-service so
 * the delivery layer can switch channels without caring about the transport.
 *
 * Config (all server-side):
 *   TWILIO_ACCOUNT_SID   the account SID (starts with "AC…")
 *   TWILIO_AUTH_TOKEN    the account auth token
 *   TWILIO_FROM_NUMBER   the sending number in E.164 (e.g. +6428…) — OR —
 *   TWILIO_MESSAGING_SERVICE_SID  a Messaging Service SID (starts with "MG…")
 */

import { normalizeNzPhone } from "./whatsapp-service";

export function isSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

/**
 * Send a plain-text SMS. Returns { ok, messageId } where messageId is Twilio's
 * message SID. Never throws — logs and returns { ok: false } so callers can fall
 * back to email.
 */
export async function sendSms(opts: { toPhone: string; text: string }): Promise<{ ok: boolean; messageId?: string }> {
  if (!isSmsConfigured()) {
    console.log(`[SMS] not configured — skipping send to ${opts.toPhone}`);
    return { ok: false };
  }
  // Twilio expects E.164 ("+64…"); normalizeNzPhone returns bare digits, so prefix "+".
  const digits = normalizeNzPhone(opts.toPhone);
  if (!digits) {
    console.warn(`[SMS] unparseable number: ${opts.toPhone}`);
    return { ok: false };
  }
  const to = `+${digits}`;
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", opts.text);
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    form.set("From", process.env.TWILIO_FROM_NUMBER as string);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: form.toString(),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[SMS] send failed ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false };
    }
    const json = (await res.json().catch(() => ({}))) as any;
    const messageId: string | undefined = json?.sid;
    return { ok: true, messageId };
  } catch (err: any) {
    console.error(`[SMS] send error: ${err?.message || err}`);
    return { ok: false };
  }
}
