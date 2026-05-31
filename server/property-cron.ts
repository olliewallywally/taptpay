/**
 * property-cron.ts — automation engine for the property management vertical.
 *
 * Three idempotent passes:
 *   1. generatePass  — create invoices for due recurring schedules
 *   2. dispatchPass  — email pending_dispatch invoices to tenants
 *   3. overduePass   — mark dispatched invoices overdue once dueAt has passed
 *
 * Triggered via POST /api/internal/cron (x-cron-secret header).
 */

import { storage } from "./storage";
import { sendEmail } from "./email-service";

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

function buildRentEmail(opts: {
  tenantName: string; merchantName: string; propertyAddress: string;
  amountCents: number; dueAt: Date; paymentUrl: string; reminder?: boolean;
}): { subject: string; html: string; text: string } {
  const { tenantName, merchantName, propertyAddress, amountCents, dueAt, paymentUrl, reminder } = opts;
  const amount = fmtCents(amountCents);
  const due    = fmtDate(dueAt);
  const kicker  = reminder ? "overdue reminder" : "rent payment";
  const subject = reminder
    ? `Reminder: rent overdue — ${amount}`
    : `Rent payment due — ${amount} by ${due}`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F4;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#040D6D;border-radius:16px 16px 0 0;padding:32px 36px 28px">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#58ABFF">${kicker}</p>
          <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#fff">${merchantName}</p>
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(88,171,255,0.6)">amount due</p>
          <p style="margin:0;font-size:58px;font-weight:700;letter-spacing:-2px;color:#58ABFF;line-height:1">${amount}</p>
        </td></tr>
        <tr><td style="background:#fff;padding:28px 36px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding-bottom:16px">
              <p style="margin:0 0 2px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#8C8C8C">hi</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#040D6D">${tenantName}</p>
            </td></tr>
            <tr><td style="padding:16px 0;border-top:1px solid #F4F4F4">
              <p style="margin:0 0 2px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#8C8C8C">property</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#040D6D">${propertyAddress}</p>
            </td></tr>
            <tr><td style="padding:16px 0 24px;border-top:1px solid #F4F4F4">
              <p style="margin:0 0 2px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#8C8C8C">due</p>
              <p style="margin:0;font-size:14px;color:#040D6D">${due}</p>
            </td></tr>
            <tr><td align="center" style="padding-bottom:8px">
              <a href="${paymentUrl}" style="display:inline-block;background:#040D6D;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:14px">
                pay ${amount}
              </a>
            </td></tr>
            <tr><td align="center">
              <p style="margin:12px 0 0;font-size:11px;color:#8C8C8C">🔒 secured by windcave · apple pay &amp; google pay accepted</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#F4F4F4;border-radius:0 0 16px 16px;padding:16px 36px">
          <p style="margin:0;font-size:11px;color:#8C8C8C;text-align:center">
            sent by ${merchantName} via taptpay · contact your property manager with any questions.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Rent payment due — ${amount} by ${due}\n\nHi ${tenantName},\n\n${merchantName} has sent you a rent payment request.\n\nProperty: ${propertyAddress}\nAmount:   ${amount}\nDue:      ${due}\n\nPay now: ${paymentUrl}\n`;
  return { subject, html, text };
}

// ── Pass 1: generate invoices for due schedules ───────────────────────────────

export async function runGeneratePass(now: Date = new Date()): Promise<{ generated: number; skipped: number; errors: number }> {
  const result = { generated: 0, skipped: 0, errors: 0 };
  const dueSchedules = await storage.getDueActiveSchedules(now);

  for (const schedule of dueSchedules) {
    try {
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

// ── Pass 2: dispatch pending invoices via email ───────────────────────────────

export async function runDispatchPass(baseUrl: string): Promise<{ dispatched: number; failed: number; errors: number }> {
  const result = { dispatched: 0, failed: 0, errors: 0 };
  const invoices = await storage.getPendingDispatchInvoices();

  for (const invoice of invoices) {
    try {
      const [merchant, tenant] = await Promise.all([
        storage.getMerchant(invoice.merchantId),
        storage.getTenantProfile(invoice.tenantProfileId),
      ]);
      // Missing merchant/tenant is transient (data may appear) — leave pending to retry.
      if (!merchant || !tenant) { result.failed++; continue; }
      // No deliverable address. Email is the only live channel today, so an invoice
      // with no email can never be sent — mark it failed instead of retrying forever.
      if (!tenant.email) {
        await storage.updateInvoiceRentRequest(invoice.id, { status: "dispatch_failed" });
        await storage.logTransactionEvent({
          merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId,
          invoiceId: invoice.id, eventType: "Invoice_Dispatch_Failed",
          payload: { reason: "no_deliverable_email" },
        });
        result.failed++; continue;
      }

      const paymentUrl = `${baseUrl}/r/${invoice.token}`;
      const email = buildRentEmail({
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        merchantName: merchant.businessName || merchant.name,
        propertyAddress: tenant.propertyAddress,
        amountCents: invoice.amountCents,
        dueAt: new Date(invoice.dueAt),
        paymentUrl,
      });

      const sent = await sendEmail({
        to: tenant.email, from: "noreply@taptpay.co.nz",
        subject: email.subject, html: email.html, text: email.text,
      });

      if (sent) {
        await storage.updateInvoiceRentRequest(invoice.id, { status: "dispatched", dispatchedAt: new Date() });
        await storage.logTransactionEvent({
          merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId,
          invoiceId: invoice.id, eventType: "Invoice_Sent",
          payload: { channel: "email", to: tenant.email },
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

      const tenant = await storage.getTenantProfile(invoice.tenantProfileId);
      if (!tenant || !tenant.email) { result.skipped++; continue; }

      const paymentUrl = `${baseUrl}/r/${invoice.token}`;
      const email = buildRentEmail({
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        merchantName: merchant.businessName || merchant.name,
        propertyAddress: tenant.propertyAddress,
        amountCents: invoice.amountCents,
        dueAt: new Date(invoice.dueAt),
        paymentUrl,
        reminder: true,
      });

      const sent = await sendEmail({
        to: tenant.email, from: "noreply@taptpay.co.nz",
        subject: email.subject, html: email.html, text: email.text,
      });

      if (sent) {
        await storage.updateInvoiceRentRequest(invoice.id, { lastReminderSentAt: now, reminderCount: sentCount + 1 });
        await storage.logTransactionEvent({
          merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId,
          invoiceId: invoice.id, eventType: "Reminder_Sent",
          payload: { channel: "email", reminderNumber: sentCount + 1, to: tenant.email },
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
