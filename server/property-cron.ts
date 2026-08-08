/**
 * property-cron.ts — automation engine for the property management vertical.
 *
 * Idempotent passes:
 *   1. generatePass  — create invoices for due recurring schedules
 *   2. dispatchPass  — deliver pending_dispatch invoices to tenants
 *   3. overduePass   — mark dispatched invoices overdue once dueAt has passed
 *   4. reminderPass  — auto-resend reminders for overdue invoices
 *
 * Delivery is channel-aware (email, WhatsApp or SMS) via deliverInvoice(). For split
 * invoices, reminders chase only the remaining (owing) amount.
 *
 * Triggered via POST /api/internal/cron (x-cron-secret header).
 */

import { storage } from "./storage";
import { sendEmail } from "./email-service";
import { isWhatsAppConfigured, sendWhatsApp } from "./whatsapp-service";
import { isSmsConfigured, sendSms } from "./sms-service";
import { billingCardIsReady } from "./billing-card";

// Remaining owing on a split invoice (null for non-split). Shares 1..n-1 are
// each floor(total/n); the remainder lands on the final share, so after k
// payments exactly k*base has been collected.
function splitOwing(invoice: any): { owingCents: number; paid: number; count: number; sharesLeft: number } | null {
  if (!invoice?.splitEnabled || !invoice?.splitCount || invoice.splitCount <= 1) return null;
  const base = Math.floor(invoice.amountCents / invoice.splitCount);
  const paid = invoice.splitPaidCount || 0;
  return { owingCents: invoice.amountCents - paid * base, paid, count: invoice.splitCount, sharesLeft: invoice.splitCount - paid };
}

// UTC-based math so the run time doesn't drift an hour across DST boundaries.
function computeNextRunDate(from: Date, frequency: string): Date {
  const d = new Date(from);
  if (frequency === "weekly")           d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === "fortnightly") d.setUTCDate(d.getUTCDate() + 14);
  else                                  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function addDaysUTC(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function generateToken(): string {
  const { randomBytes } = require("crypto");
  return randomBytes(20).toString("base64url");
}

function fmtCents(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }
function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });
}
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The noun phrase a payment request is "for" — "rent" for rent invoices, or the
// one-off charge's label (description / charge type) for non-rent charges. Keeps
// the rent wording byte-identical while letting charges read correctly.
function billNoun(invoice: { kind?: string | null; description?: string | null; chargeType?: string | null }): string {
  if (invoice.kind !== "charge") return "rent";
  const byType: Record<string, string> = {
    utilities: "utilities", late_fee: "late fee", cleaning: "cleaning fee", damages: "damages", other: "charge",
  };
  const d = (invoice.description || "").trim();
  return d || byType[invoice.chargeType || "other"] || "charge";
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function buildRentEmail(opts: {
  tenantName: string; merchantName: string; propertyAddress: string;
  amountCents: number; dueAt: Date; paymentUrl: string; reminder?: boolean;
  splitNote?: string; payLabel?: string; label?: string;
}): { subject: string; html: string; text: string } {
  const { tenantName, merchantName, propertyAddress, amountCents, dueAt, paymentUrl, reminder, splitNote, payLabel } = opts;
  const amount = fmtCents(amountCents);
  const due    = fmtDate(dueAt);
  const noun = opts.label || "rent";
  const Noun = capitalize(noun);
  const kicker  = reminder ? "overdue reminder" : `${noun} payment`;
  const amountLabel = reminder ? "amount still owing" : "amount due";
  const payText = payLabel || `pay ${amount}`;
  const subject = reminder
    ? `Reminder: ${noun} overdue — ${amount}${splitNote ? ` (${splitNote})` : ""}`
    : `${Noun} payment due — ${amount} by ${due}`;
  const splitHtml = splitNote
    ? `<p style="margin:8px 0 0;font-size:12px;color:rgba(88,171,255,0.8)">${splitNote}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F4;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#040D6D;border-radius:16px 16px 0 0;padding:32px 36px 28px">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#58ABFF">${kicker}</p>
          <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#fff">${esc(merchantName)}</p>
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(88,171,255,0.6)">${amountLabel}</p>
          <p style="margin:0;font-size:58px;font-weight:700;letter-spacing:-2px;color:#58ABFF;line-height:1">${amount}</p>
          ${splitHtml}
        </td></tr>
        <tr><td style="background:#fff;padding:28px 36px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding-bottom:16px">
              <p style="margin:0 0 2px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#8C8C8C">hi</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#040D6D">${esc(tenantName)}</p>
            </td></tr>
            <tr><td style="padding:16px 0;border-top:1px solid #F4F4F4">
              <p style="margin:0 0 2px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#8C8C8C">property</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#040D6D">${esc(propertyAddress)}</p>
            </td></tr>
            <tr><td style="padding:16px 0 24px;border-top:1px solid #F4F4F4">
              <p style="margin:0 0 2px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#8C8C8C">due</p>
              <p style="margin:0;font-size:14px;color:#040D6D">${due}</p>
            </td></tr>
            <tr><td align="center" style="padding-bottom:8px">
              <a href="${paymentUrl}" style="display:inline-block;background:#040D6D;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:14px">
                ${payText}
              </a>
            </td></tr>
            <tr><td align="center">
              <p style="margin:12px 0 0;font-size:11px;color:#8C8C8C">&#x1F512; secured by windcave &middot; apple pay &amp; google pay accepted</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#F4F4F4;border-radius:0 0 16px 16px;padding:16px 36px">
          <p style="margin:0;font-size:11px;color:#8C8C8C;text-align:center">
            sent by ${esc(merchantName)} via taptpay &middot; contact your property manager with any questions.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${reminder ? `${Noun} reminder` : `${Noun} payment due`} — ${amount}${reminder ? "" : ` by ${due}`}\n\nHi ${tenantName},\n\n${merchantName} ${reminder ? `is following up on your outstanding ${noun}` : `has sent you a ${noun} payment request`}.\n${splitNote ? `\n${splitNote}\n` : ""}\nProperty: ${propertyAddress}\n${amountLabel}: ${amount}\nDue:      ${due}\n\nPay now: ${paymentUrl}\n`;
  return { subject, html, text };
}

// WhatsApp message body — short and link-first.
function buildRentWhatsAppText(opts: {
  tenantName: string; merchantName: string; propertyAddress: string;
  amountCents: number; dueAt: Date; paymentUrl: string; reminder?: boolean; splitNote?: string; label?: string;
}): string {
  const amount = fmtCents(opts.amountCents);
  const due = fmtDate(opts.dueAt);
  const noun = opts.label || "rent";
  if (opts.reminder) {
    return `Hi ${opts.tenantName}, a reminder that ${amount} ${noun} is still outstanding for ${opts.propertyAddress}.` +
      `${opts.splitNote ? ` (${opts.splitNote})` : ""}\nPay here: ${opts.paymentUrl}\n— ${opts.merchantName} via taptpay`;
  }
  return `Hi ${opts.tenantName}, your ${noun} of ${amount} for ${opts.propertyAddress} is due ${due}.` +
    `\nPay securely here: ${opts.paymentUrl}\n— ${opts.merchantName} via taptpay`;
}

// Channel-aware delivery for one invoice. Tries WhatsApp when that's the chosen
// channel and it's configured + a phone exists, otherwise falls back to email.
// Returns { sent, channel, reason }.
async function deliverInvoice(invoice: any, baseUrl: string, opts: { reminder?: boolean; amountCents?: number; splitNote?: string; payLabel?: string } = {}): Promise<{ sent: boolean; channel?: string; reason?: string; messageId?: string }> {
  const [merchant, tenant] = await Promise.all([
    storage.getMerchant(invoice.merchantId),
    storage.getTenantProfile(invoice.tenantProfileId),
  ]);
  if (!merchant || !tenant) return { sent: false, reason: "missing_data" };

  const channel = invoice.deliveryChannel || tenant.preferredChannel || "email";
  const paymentUrl = `${baseUrl}/r/${invoice.token}`;
  const merchantName = merchant.businessName || merchant.name;
  const amountCents = opts.amountCents ?? invoice.amountCents;
  // "rent" for rent invoices, or the charge's label for one-off charges.
  const label = billNoun(invoice);

  // WhatsApp (preferred when selected + available)
  if (channel === "whatsapp" && isWhatsAppConfigured() && tenant.phone) {
    const text = buildRentWhatsAppText({
      tenantName: tenant.firstName, merchantName, propertyAddress: tenant.propertyAddress,
      amountCents, dueAt: new Date(invoice.dueAt), paymentUrl, reminder: opts.reminder, splitNote: opts.splitNote, label,
    });
    const result = await sendWhatsApp({ toPhone: tenant.phone, text });
    if (result.ok) return { sent: true, channel: "whatsapp", messageId: result.messageId };
    // else fall through to email fallback
  }

  // SMS (when selected + available). Reuses the short, link-first WhatsApp copy.
  if (channel === "sms" && isSmsConfigured() && tenant.phone) {
    const text = buildRentWhatsAppText({
      tenantName: tenant.firstName, merchantName, propertyAddress: tenant.propertyAddress,
      amountCents, dueAt: new Date(invoice.dueAt), paymentUrl, reminder: opts.reminder, splitNote: opts.splitNote, label,
    });
    const result = await sendSms({ toPhone: tenant.phone, text });
    if (result.ok) return { sent: true, channel: "sms", messageId: result.messageId };
    // else fall through to email fallback
  }

  // Email (default + fallback)
  if (tenant.email) {
    const email = buildRentEmail({
      tenantName: `${tenant.firstName} ${tenant.lastName}`, merchantName, propertyAddress: tenant.propertyAddress,
      amountCents, dueAt: new Date(invoice.dueAt), paymentUrl, reminder: opts.reminder, splitNote: opts.splitNote, payLabel: opts.payLabel, label,
    });
    const ok = await sendEmail({ to: tenant.email, from: "noreply@taptpay.co.nz", subject: email.subject, html: email.html, text: email.text });
    return { sent: ok, channel: "email", reason: ok ? undefined : "send_failed" };
  }

  return { sent: false, reason: "no_deliverable" };
}

// Manually (re)send an invoice's payment-link email immediately. Used by the
// terminal "send"/resend actions so an existing unpaid invoice is re-delivered
// rather than duplicated. Refuses already-settled invoices.
// Build the delivery options for an invoice, chasing only the owing amount when
// it's a partially-paid split.
function deliverOptsFor(invoice: any, reminder: boolean): { reminder: boolean; amountCents?: number; splitNote?: string; payLabel?: string } {
  const owing = splitOwing(invoice);
  if (!owing || owing.paid === 0) return { reminder };
  return {
    reminder,
    amountCents: owing.owingCents,
    splitNote: `${owing.paid} of ${owing.count} flatmates paid · ${fmtCents(owing.owingCents)} of ${fmtCents(invoice.amountCents)} still owing`,
    payLabel: "pay your share",
  };
}

export async function resendInvoiceEmail(invoiceId: string, baseUrl: string): Promise<{ ok: boolean; reason?: string; invoice?: any }> {
  const invoice = await storage.getInvoiceRentRequest(invoiceId);
  if (!invoice) return { ok: false, reason: "not_found" };
  if (["paid", "paid_external", "voided"].includes(invoice.status)) return { ok: false, reason: "not_payable" };
  if (!billingCardIsReady(await storage.getSubscription(invoice.merchantId))) {
    return { ok: false, reason: "billing_card_required" };
  }

  const delivery = await deliverInvoice(invoice, baseUrl, deliverOptsFor(invoice, invoice.status === "overdue"));
  if (!delivery.sent) return { ok: false, reason: delivery.reason || "send_failed" };

  const updates: any = { dispatchedAt: new Date(), sentAt: new Date() };
  if (delivery.messageId && delivery.channel === "whatsapp") updates.whatsappMessageId = delivery.messageId;
  // pending/failed invoices move to "dispatched"; dispatched/overdue keep their status.
  if (invoice.status === "pending_dispatch" || invoice.status === "dispatch_failed") updates.status = "dispatched";
  const updated = await storage.updateInvoiceRentRequest(invoiceId, updates);

  await storage.logTransactionEvent({
    merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId,
    invoiceId, eventType: "Invoice_Resent", payload: { channel: delivery.channel, status: updated?.status },
  });
  return { ok: true, invoice: updated };
}

// ── Pass 1: generate invoices for due schedules ───────────────────────────────

export async function runGeneratePass(now: Date = new Date()): Promise<{ generated: number; skipped: number; errors: number }> {
  const result = { generated: 0, skipped: 0, errors: 0 };
  const dueSchedules = await storage.getDueActiveSchedules(now);

  for (const schedule of dueSchedules) {
    try {
      if (!billingCardIsReady(await storage.getSubscription(schedule.merchantId))) {
        result.skipped++;
        continue;
      }
      const billingPeriodStart = schedule.nextRunDate;
      const invoice = await storage.createInvoiceRentRequest({
        merchantId: schedule.merchantId, tenantProfileId: schedule.tenantProfileId,
        scheduleId: schedule.id, token: generateToken(),
        amountCents: schedule.amountCents, dueAt: billingPeriodStart,
        billingPeriodStart, status: "pending_dispatch",
        deliveryChannel: schedule.deliveryChannel || "email",
      });

      await storage.updateActiveSchedule(schedule.id, {
        nextRunDate: computeNextRunDate(billingPeriodStart, schedule.frequency),
        lastRunDate: billingPeriodStart,
      });
      await storage.logTransactionEvent({
        merchantId: schedule.merchantId, tenantProfileId: schedule.tenantProfileId,
        scheduleId: schedule.id, invoiceId: invoice.id, eventType: "Invoice_Generated",
        payload: { amountCents: invoice.amountCents, billingPeriodStart },
      });
      result.generated++;
    } catch (err) {
      console.error(`[CRON_GENERATE] schedule=${schedule.id}`, err);
      result.errors++;
    }
  }
  return result;
}

// ── Pass 2: dispatch pending invoices (channel-aware) ─────────────────────────

export async function runDispatchPass(baseUrl: string): Promise<{ dispatched: number; failed: number; errors: number }> {
  const result = { dispatched: 0, failed: 0, errors: 0 };
  const invoices = await storage.getPendingDispatchInvoices();

  for (const invoice of invoices) {
    try {
      if (!billingCardIsReady(await storage.getSubscription(invoice.merchantId))) {
        result.failed++;
        continue;
      }
      const delivery = await deliverInvoice(invoice, baseUrl);
      // Missing merchant/tenant is transient (data may appear) — leave pending to retry.
      if (delivery.reason === "missing_data") { result.failed++; continue; }
      // No deliverable channel (no email, and no WhatsApp/phone) — can never be
      // sent, so mark it failed instead of retrying forever.
      if (delivery.reason === "no_deliverable") {
        await storage.updateInvoiceRentRequest(invoice.id, { status: "dispatch_failed" });
        await storage.logTransactionEvent({
          merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId,
          invoiceId: invoice.id, eventType: "Invoice_Dispatch_Failed",
          payload: { reason: "no_deliverable_channel" },
        });
        result.failed++; continue;
      }

      if (delivery.sent) {
        const dispatchUpdates: any = { status: "dispatched", dispatchedAt: new Date() };
        if (delivery.messageId && delivery.channel === "whatsapp") dispatchUpdates.whatsappMessageId = delivery.messageId;
        await storage.updateInvoiceRentRequest(invoice.id, dispatchUpdates);
        await storage.logTransactionEvent({
          merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId,
          invoiceId: invoice.id, eventType: "Invoice_Sent",
          payload: { channel: delivery.channel },
        });
        result.dispatched++;
      } else { result.failed++; }
    } catch (err) {
      console.error(`[CRON_DISPATCH] invoice=${invoice.id}`, err);
      result.errors++;
    }
  }
  return result;
}

// ── Pass 3: mark overdue invoices ─────────────────────────────────────────────

export async function runOverduePass(now: Date = new Date()): Promise<{ markedOverdue: number; errors: number }> {
  const result = { markedOverdue: 0, errors: 0 };
  const eligible = await storage.getOverdueEligibleInvoices(now);

  for (const invoice of eligible) {
    try {
      await storage.updateInvoiceRentRequest(invoice.id, { status: "overdue" });
      await storage.logTransactionEvent({
        merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId,
        invoiceId: invoice.id, eventType: "Invoice_Overdue",
        payload: { dueAt: invoice.dueAt, amountCents: invoice.amountCents },
      });
      result.markedOverdue++;
    } catch (err) {
      console.error(`[CRON_OVERDUE] invoice=${invoice.id}`, err);
      result.errors++;
    }
  }
  return result;
}

// ── Pass 4: auto-resend reminders for overdue invoices ────────────────────────
// Applies each merchant's reminder policy:
//   • first reminder once `now >= dueAt + rentReminderDelayDays`
//   • subsequent reminders every `rentReminderIntervalDays`
//   • stops after `rentReminderMaxCount` (0 = unlimited) or when paid/voided

export async function runReminderPass(baseUrl: string, now: Date = new Date()): Promise<{ sent: number; skipped: number; errors: number }> {
  const result = { sent: 0, skipped: 0, errors: 0 };
  const invoices = await storage.getReminderEligibleInvoices();
  const merchantCache = new Map<number, any>();

  for (const invoice of invoices) {
    try {
      let merchant = merchantCache.get(invoice.merchantId);
      if (!merchant) {
        merchant = await storage.getMerchant(invoice.merchantId);
        if (merchant) merchantCache.set(invoice.merchantId, merchant);
      }
      if (!merchant || merchant.rentReminderEnabled === false) { result.skipped++; continue; }

      const delayDays    = merchant.rentReminderDelayDays ?? 3;
      const intervalDays = merchant.rentReminderIntervalDays ?? 3;
      const maxCount     = merchant.rentReminderMaxCount ?? 3;
      const sentCount    = invoice.reminderCount ?? 0;

      if (maxCount > 0 && sentCount >= maxCount) { result.skipped++; continue; }

      // Not yet time for the first reminder
      if (now < addDaysUTC(new Date(invoice.dueAt), delayDays)) { result.skipped++; continue; }
      // Not yet time for the next reminder in the cadence
      if (invoice.lastReminderSentAt && now < addDaysUTC(new Date(invoice.lastReminderSentAt), intervalDays)) {
        result.skipped++; continue;
      }

      // Chase only the outstanding amount on a partially-paid split.
      const delivery = await deliverInvoice(invoice, baseUrl, deliverOptsFor(invoice, true));
      if (delivery.reason === "no_deliverable") { result.skipped++; continue; }

      if (delivery.sent) {
        const owing = splitOwing(invoice);
        const reminderUpdates: any = { lastReminderSentAt: now, reminderCount: sentCount + 1 };
        if (delivery.messageId && delivery.channel === "whatsapp") reminderUpdates.whatsappMessageId = delivery.messageId;
        await storage.updateInvoiceRentRequest(invoice.id, reminderUpdates);
        await storage.logTransactionEvent({
          merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId,
          invoiceId: invoice.id, eventType: "Reminder_Sent",
          payload: { channel: delivery.channel, reminderNumber: sentCount + 1, owingCents: owing ? owing.owingCents : invoice.amountCents, sharesLeft: owing ? owing.sharesLeft : null },
        });
        result.sent++;
      } else { result.errors++; }
    } catch (err) {
      console.error(`[CRON_REMINDER] invoice=${invoice.id}`, err);
      result.errors++;
    }
  }
  return result;
}
