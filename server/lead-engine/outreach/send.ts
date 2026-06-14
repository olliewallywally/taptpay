/**
 * send.ts — the channel send layer for outreach.
 *
 * Email goes out from a SEPARATE sending identity (OUTREACH_FROM_EMAIL) to keep
 * taptpay.co.nz's transactional reputation clean, with a mandatory unsubscribe
 * footer (UEMA 2007). When no sending identity is configured, or
 * LEAD_OUTREACH_DRY_RUN=true, sends are simulated (logged) so the engine can be
 * exercised end-to-end without emailing real businesses.
 */
import { sendEmail } from "../../email-service";
import { sendWhatsApp, isWhatsAppConfigured, normalizeNzPhone } from "../../whatsapp-service";

export interface SendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  simulated?: boolean;
}

export function outreachFromEmail(override?: string | null): string | undefined {
  return override || process.env.OUTREACH_FROM_EMAIL || undefined;
}
export function outreachFromName(): string {
  return process.env.OUTREACH_FROM_NAME || "TaptPay";
}
export function emailDryRun(fromOverride?: string | null): boolean {
  return process.env.LEAD_OUTREACH_DRY_RUN === "true" || !outreachFromEmail(fromOverride);
}
export function whatsappDryRun(): boolean {
  return process.env.LEAD_OUTREACH_DRY_RUN === "true" || !isWhatsAppConfigured();
}

function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(text)
    .split(/\n/)
    .map((l) => (l.trim() === "" ? "<br/>" : `<p style="margin:0 0 10px">${l}</p>`))
    .join("\n");
}

export async function sendEmailStep(opts: {
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
  oneClickUrl?: string; // RFC 8058 one-click unsubscribe endpoint (List-Unsubscribe header)
  fromOverride?: string | null;
}): Promise<SendResult> {
  const fromEmail = outreachFromEmail(opts.fromOverride);
  const fromName = outreachFromName();
  const address = process.env.OUTREACH_SENDER_ADDRESS ? ` · ${process.env.OUTREACH_SENDER_ADDRESS}` : "";
  const footer = `\n\n—\nYou received this because your business contact is publicly listed. Unsubscribe: ${opts.unsubscribeUrl}\n${fromName}, New Zealand${address}`;
  const text = `${opts.body}${footer}`;

  // List-Unsubscribe (+ one-click) improves deliverability and meets Gmail/Yahoo
  // bulk-sender expectations.
  const headers: Record<string, string> = {};
  if (opts.oneClickUrl) {
    headers["List-Unsubscribe"] = `<${opts.oneClickUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  if (emailDryRun(opts.fromOverride)) {
    console.log(`[outreach dry-run] EMAIL → ${opts.to} | ${opts.subject}`);
    return { ok: true, providerId: "dry-run", simulated: true };
  }
  const ok = await sendEmail({ to: opts.to, from: `${fromName} <${fromEmail}>`, subject: opts.subject, text, html: textToHtml(text), headers });
  return ok ? { ok: true, providerId: "resend" } : { ok: false, error: "email provider rejected the send" };
}

export async function sendWhatsAppStep(opts: { phone: string; body: string }): Promise<SendResult> {
  const number = normalizeNzPhone(opts.phone);
  if (!number) return { ok: false, error: "unparseable phone number" };
  if (whatsappDryRun()) {
    console.log(`[outreach dry-run] WHATSAPP → ${number}`);
    return { ok: true, providerId: "dry-run", simulated: true };
  }
  const res = await sendWhatsApp({ toPhone: opts.phone, text: opts.body });
  return res.ok ? { ok: true, providerId: res.messageId || "evolution" } : { ok: false, error: "whatsapp send failed" };
}
