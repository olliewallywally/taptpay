/**
 * gst-invoice.ts — emails a NZ GST tax invoice/receipt to every payer after a
 * rent payment settles (head tenant + any co-tenants + split-share payers).
 *
 * GST is computed as 15% inclusive of the amount paid (NZ standard rate):
 *   gst = round(total * 3 / 23),  net = total - gst.
 */

import { sendEmail } from "./email-service";

function fmtCents(c: number): string { return `$${(c / 100).toFixed(2)}`; }
function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Pull any email addresses out of free text (e.g. the co-tenants field). */
export function extractEmails(text?: string | null): string[] {
  if (!text) return [];
  return (text.match(EMAIL_RE) || []).map((e) => e.toLowerCase());
}

function buildGstInvoiceEmail(opts: {
  merchantName: string; gstNumber?: string | null;
  tenantName: string; propertyAddress: string;
  amountCents: number; netCents: number; gstCents: number;
  paidAt: Date; reference: string;
}): { subject: string; html: string; text: string } {
  const { merchantName, gstNumber, tenantName, propertyAddress, amountCents, netCents, gstCents, paidAt, reference } = opts;
  const total = fmtCents(amountCents);
  const net   = fmtCents(netCents);
  const gst   = fmtCents(gstCents);
  const paid  = fmtDate(paidAt);
  const subject = `Tax invoice — rent payment ${total} · ${reference}`;

  // Escape merchant/tenant-supplied text before interpolating into invoice HTML.
  const esc = (s: string | null | undefined) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const mName = esc(merchantName), tName = esc(tenantName), pAddr = esc(propertyAddress);

  const gstLine = gstNumber
    ? `<p style="margin:0;font-size:12px;color:#8C8C8C">GST no. ${esc(gstNumber)}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F4;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#040D6D;border-radius:16px 16px 0 0;padding:32px 36px 26px">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#58ABFF">tax invoice</p>
          <p style="margin:0 0 18px;font-size:15px;font-weight:600;color:#fff">${mName}</p>
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(88,171,255,0.6)">paid in full</p>
          <p style="margin:0;font-size:48px;font-weight:700;letter-spacing:-2px;color:#58ABFF;line-height:1">${total}</p>
        </td></tr>
        <tr><td style="background:#fff;padding:26px 36px 30px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding-bottom:14px">
              <p style="margin:0 0 2px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#8C8C8C">billed to</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#040D6D">${tName}</p>
              <p style="margin:2px 0 0;font-size:13px;color:#8C8C8C">${pAddr}</p>
            </td></tr>
            <tr><td style="padding:14px 0;border-top:1px solid #F0F0F0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="font-size:13px;color:#8C8C8C;padding-bottom:8px">Rent (excl. GST)</td><td align="right" style="font-size:13px;color:#040D6D;padding-bottom:8px">${net}</td></tr>
                <tr><td style="font-size:13px;color:#8C8C8C;padding-bottom:8px">GST (15%)</td><td align="right" style="font-size:13px;color:#040D6D;padding-bottom:8px">${gst}</td></tr>
                <tr><td style="font-size:14px;font-weight:700;color:#040D6D;padding-top:8px;border-top:1px solid #F0F0F0">Total paid</td><td align="right" style="font-size:14px;font-weight:700;color:#040D6D;padding-top:8px;border-top:1px solid #F0F0F0">${total}</td></tr>
              </table>
            </td></tr>
            <tr><td style="padding-top:14px;border-top:1px solid #F0F0F0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="font-size:12px;color:#8C8C8C;padding-bottom:4px">Reference</td><td align="right" style="font-size:12px;color:#040D6D;padding-bottom:4px">${reference}</td></tr>
                <tr><td style="font-size:12px;color:#8C8C8C">Date paid</td><td align="right" style="font-size:12px;color:#040D6D">${paid}</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#F4F4F4;border-radius:0 0 16px 16px;padding:16px 36px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;color:#040D6D;font-weight:600">${mName}</p>
          ${gstLine}
          <p style="margin:8px 0 0;font-size:11px;color:#8C8C8C">This is your tax invoice for rent paid via taptpay. Keep it for your records.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `TAX INVOICE — ${merchantName}\n\nBilled to: ${tenantName}\nProperty: ${propertyAddress}\n\nRent (excl. GST): ${net}\nGST (15%):        ${gst}\nTotal paid:       ${total}\n\nReference: ${reference}\nDate paid: ${paid}\n${gstNumber ? `GST no. ${gstNumber}\n` : ""}\nThis is your tax invoice for rent paid via taptpay.\n`;
  return { subject, html, text };
}

/** Send the GST tax invoice to every recipient. Returns how many were sent. */
export async function sendGstInvoices(opts: {
  recipients: string[];
  merchantName: string; gstNumber?: string | null;
  tenantName: string; propertyAddress: string;
  amountCents: number; paidAt: Date; reference: string;
}): Promise<number> {
  const gstCents = Math.round((opts.amountCents * 3) / 23); // 15% inclusive
  const netCents = opts.amountCents - gstCents;
  const email = buildGstInvoiceEmail({ ...opts, gstCents, netCents });

  let sent = 0;
  for (const to of opts.recipients) {
    const ok = await sendEmail({ to, from: "noreply@taptpay.co.nz", subject: email.subject, html: email.html, text: email.text });
    if (ok) sent++;
  }
  return sent;
}
