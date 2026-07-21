import { storage } from './storage';
import { sendEmail } from './email-service';
import { isWhatsAppConfigured, sendWhatsApp } from './whatsapp-service';
import { isSmsConfigured, sendSms } from './sms-service';
import { GST_RATE } from '@shared/schema';
import { generateQuotePdf } from './trades-quote-pdf';
import { billingCardIsReady } from './billing-card';

type DeliveryResult = {
  sent: boolean;
  channel?: string;
  reason?: string;
  messageId?: string;
};

type EmailAttachment = {
  filename: string;
  content: Buffer | string;
};

type DeliveryCopy = {
  subject: string;
  text: string;
  html: string;
  short: string;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const date = (value: Date | string) =>
  new Date(value).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
const esc = (value: string | null | undefined) =>
  (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function paymentLabel(invoice: any): string {
  if (invoice.jobDetails) return invoice.jobDetails;
  if (invoice.kind === 'deposit') return 'Job deposit';
  if (invoice.kind === 'balance') return 'Job balance';
  if (invoice.kind === 'recurring') return 'Recurring service invoice';
  return 'Job invoice';
}

function invoiceCopy(
  invoice: any,
  client: any,
  merchant: any,
  baseUrl: string,
  reminder = false
) {
  const amount = money(invoice.amountCents);
  const merchantName = merchant.businessName || merchant.name;
  const label = paymentLabel(invoice);
  const paymentUrl = `${baseUrl}/r/${invoice.token}`;
  const subject = reminder
    ? `Reminder: ${label} overdue - ${amount}`
    : `${label} - ${amount} due ${date(invoice.dueAt)}`;
  const text = `Hi ${client.firstName}, ${merchantName} ${reminder ? 'is following up on' : 'has sent'} your ${label.toLowerCase()} for ${client.siteAddress}. Amount: ${amount}. Due: ${date(invoice.dueAt)}. Pay securely: ${paymentUrl}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#1a1d21"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#1a1d21;padding:30px 34px;color:#fff"><div style="color:#ff7a1a;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">${reminder ? 'payment reminder' : 'invoice'}</div><h1 style="margin:10px 0 4px;font-size:42px;color:#ff7a1a">${amount}</h1><div>${esc(label)}</div></td></tr><tr><td style="padding:28px 34px"><p>Hi ${esc(client.firstName)},</p><p>${esc(merchantName)} ${reminder ? 'is following up on' : 'has sent'} this invoice.</p><p><strong>Site:</strong> ${esc(client.siteAddress)}<br><strong>Due:</strong> ${date(invoice.dueAt)}</p><p style="text-align:center;margin:28px 0"><a href="${paymentUrl}" style="display:inline-block;background:#1a1d21;color:#fff;text-decoration:none;font-weight:700;padding:15px 30px;border-radius:12px">Pay ${amount}</a></p></td></tr></table></td></tr></table></body></html>`;
  const short = `Hi ${client.firstName}, ${reminder ? 'a reminder that' : 'your'} ${label.toLowerCase()} of ${amount} for ${client.siteAddress} ${reminder ? 'is still outstanding' : `is due ${date(invoice.dueAt)}`}.
Pay securely: ${paymentUrl}
- ${merchantName} via TaptPay`;
  return { subject, text, html, short };
}

function quoteCopy(quote: any, client: any, merchant: any, baseUrl: string) {
  const amount = money(quote.totalCents);
  const merchantName = merchant.businessName || merchant.name;
  const quoteUrl = `${baseUrl}/trades/quote/${quote.token}`;
  const subject = `Quote from ${merchantName} - ${amount}`;
  const text = `Hi ${client.firstName}, ${merchantName} has sent you a quote for ${client.siteAddress}. Total: ${amount}. Review and respond: ${quoteUrl}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#1a1d21"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#1a1d21;padding:30px 34px;color:#fff"><div style="color:#ff7a1a;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">quote</div><h1 style="margin:10px 0 4px;font-size:42px;color:#ff7a1a">${amount}</h1><div>${esc(merchantName)}</div></td></tr><tr><td style="padding:28px 34px"><p>Hi ${esc(client.firstName)},</p><p>A quote is ready for work at ${esc(client.siteAddress)}.</p><p style="text-align:center;margin:28px 0"><a href="${quoteUrl}" style="display:inline-block;background:#1a1d21;color:#fff;text-decoration:none;font-weight:700;padding:15px 30px;border-radius:12px">Review quote</a></p></td></tr></table></td></tr></table></body></html>`;
  const short = `Hi ${client.firstName}, ${merchantName} sent you a quote for ${client.siteAddress}. Total ${amount}. Review it here: ${quoteUrl}`;
  return { subject, text, html, short };
}

async function deliver(
  channel: string,
  client: any,
  copy: DeliveryCopy,
  attachments: EmailAttachment[] = []
): Promise<DeliveryResult> {
  if (channel === 'whatsapp' && client.phone && isWhatsAppConfigured()) {
    const result = await sendWhatsApp({
      toPhone: client.phone,
      text: copy.short,
    });
    if (result.ok)
      return { sent: true, channel: 'whatsapp', messageId: result.messageId };
  }
  if (channel === 'sms' && client.phone && isSmsConfigured()) {
    const result = await sendSms({ toPhone: client.phone, text: copy.short });
    if (result.ok)
      return { sent: true, channel: 'sms', messageId: result.messageId };
  }
  if (client.email) {
    const sent = await sendEmail({
      to: client.email,
      from: 'noreply@taptpay.co.nz',
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
      attachments,
    });
    return { sent, channel: 'email', reason: sent ? undefined : 'send_failed' };
  }
  return { sent: false, reason: 'no_deliverable' };
}

export async function sendTradeQuote(
  quoteId: string,
  baseUrl: string
): Promise<DeliveryResult> {
  const quote = await storage.getQuote(quoteId);
  if (!quote) return { sent: false, reason: 'not_found' };
  const [client, merchant] = await Promise.all([
    storage.getClientProfile(quote.clientProfileId),
    storage.getMerchant(quote.merchantId),
  ]);
  if (!client || !merchant) return { sent: false, reason: 'missing_data' };
  if (!billingCardIsReady(merchant)) return { sent: false, reason: 'billing_card_required' };
  const ref = String(quote.token || quote.id).slice(0, 8).toUpperCase();
  const pdf = generateQuotePdf(quote, client, merchant, baseUrl);
  const result = await deliver(
    quote.deliveryChannel || client.preferredChannel || 'email',
    client,
    quoteCopy(quote, client, merchant, baseUrl),
    [{ filename: `quote-${ref}.pdf`, content: pdf }]
  );
  await storage.createJobEvent({
    merchantId: quote.merchantId,
    clientProfileId: quote.clientProfileId,
    quoteId,
    eventType: result.sent ? 'quote_dispatched' : 'quote_dispatch_failed',
    payload: { channel: result.channel, reason: result.reason },
  });
  return result;
}

export async function resendTradeInvoice(
  invoiceId: string,
  baseUrl: string,
  reminder = false
): Promise<DeliveryResult & { invoice?: any }> {
  const invoice = await storage.getJobInvoice(invoiceId);
  if (!invoice) return { sent: false, reason: 'not_found' };
  if (['paid', 'paid_external', 'voided'].includes(invoice.status))
    return { sent: false, reason: 'not_payable' };
  const [client, merchant] = await Promise.all([
    storage.getClientProfile(invoice.clientProfileId),
    storage.getMerchant(invoice.merchantId),
  ]);
  if (!client || !merchant) return { sent: false, reason: 'missing_data' };
  const result = await deliver(
    invoice.deliveryChannel || client.preferredChannel || 'email',
    client,
    invoiceCopy(invoice, client, merchant, baseUrl, reminder)
  );
  if (!result.sent) return result;
  const updates: any = { dispatchedAt: new Date(), sentAt: new Date() };
  if (['pending_dispatch', 'dispatch_failed'].includes(invoice.status))
    updates.status = 'dispatched';
  if (result.messageId && result.channel === 'whatsapp')
    updates.whatsappMessageId = result.messageId;
  const updated = await storage.updateJobInvoice(invoiceId, updates);
  await storage.createJobEvent({
    merchantId: invoice.merchantId,
    clientProfileId: invoice.clientProfileId,
    jobInvoiceId: invoiceId,
    eventType: reminder ? 'reminder_sent' : 'invoice_dispatched',
    payload: { channel: result.channel },
  });
  return { ...result, invoice: updated };
}

export async function runTradesDispatchPass(
  baseUrl: string
): Promise<{ dispatched: number; failed: number; errors: number }> {
  const result = { dispatched: 0, failed: 0, errors: 0 };
  for (const invoice of await storage.getPendingDispatchJobInvoices()) {
    try {
      if (
        invoice.scheduledSendAt &&
        new Date(invoice.scheduledSendAt) > new Date()
      )
        continue;
      const delivery = await resendTradeInvoice(invoice.id, baseUrl);
      if (delivery.sent) result.dispatched++;
      else {
        result.failed++;
        if (delivery.reason === 'no_deliverable')
          await storage.updateJobInvoice(invoice.id, {
            status: 'dispatch_failed',
          });
      }
    } catch (error) {
      console.error(`[TRADES_DISPATCH] invoice=${invoice.id}`, error);
      result.errors++;
    }
  }
  return result;
}

export async function runTradesOverduePass(
  now: Date = new Date()
): Promise<{ markedOverdue: number; errors: number }> {
  const result = { markedOverdue: 0, errors: 0 };
  for (const invoice of await storage.getOverdueEligibleJobInvoices(now)) {
    try {
      await storage.updateJobInvoice(invoice.id, { status: 'balance_due' });
      await storage.createJobEvent({
        merchantId: invoice.merchantId,
        clientProfileId: invoice.clientProfileId,
        jobInvoiceId: invoice.id,
        eventType: 'invoice_overdue',
        payload: { dueAt: invoice.dueAt },
      });
      result.markedOverdue++;
    } catch (error) {
      console.error(`[TRADES_OVERDUE] invoice=${invoice.id}`, error);
      result.errors++;
    }
  }
  return result;
}

function addDays(value: Date | string, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function runTradesReminderPass(
  baseUrl: string,
  now: Date = new Date()
): Promise<{ sent: number; skipped: number; errors: number }> {
  const result = { sent: 0, skipped: 0, errors: 0 };
  const merchantCache = new Map<number, any>();
  for (const invoice of await storage.getReminderEligibleJobInvoices()) {
    try {
      let merchant = merchantCache.get(invoice.merchantId);
      if (!merchant) {
        merchant = await storage.getMerchant(invoice.merchantId);
        if (merchant) merchantCache.set(invoice.merchantId, merchant);
      }
      if (!merchant || merchant.tradeRemindersEnabled === false) {
        result.skipped++;
        continue;
      }
      const sentCount = invoice.reminderCount || 0;
      const max = merchant.rentReminderMaxCount ?? 3;
      if (
        (max > 0 && sentCount >= max) ||
        now < addDays(invoice.dueAt, merchant.rentReminderDelayDays ?? 3) ||
        (invoice.lastReminderSentAt &&
          now <
            addDays(
              invoice.lastReminderSentAt,
              merchant.rentReminderIntervalDays ?? 3
            ))
      ) {
        result.skipped++;
        continue;
      }
      const delivery = await resendTradeInvoice(invoice.id, baseUrl, true);
      if (!delivery.sent) {
        delivery.reason === 'no_deliverable'
          ? result.skipped++
          : result.errors++;
        continue;
      }
      await storage.updateJobInvoice(invoice.id, {
        lastReminderSentAt: now,
        reminderCount: sentCount + 1,
      });
      result.sent++;
    } catch (error) {
      console.error(`[TRADES_REMINDER] invoice=${invoice.id}`, error);
      result.errors++;
    }
  }
  return result;
}

export async function sendTradePaymentInvoice(invoice: any): Promise<number> {
  const [client, merchant] = await Promise.all([
    storage.getClientProfile(invoice.clientProfileId),
    storage.getMerchant(invoice.merchantId),
  ]);
  if (!client?.email || !merchant) return 0;
  const total = invoice.amountCents;
  const gst = merchant.gstRegistered ? Math.round(total - total / (1 + GST_RATE)) : 0;
  const net = total - gst;
  const merchantName = merchant.businessName || merchant.name;
  const label = paymentLabel(invoice);
  const reference = `JOB-${invoice.id.slice(0, 8).toUpperCase()}`;
  const gstHtml = merchant.gstRegistered
    ? `<tr><td>GST (15%) incl.</td><td align="right">${money(gst)}</td></tr>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#1a1d21"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#1a1d21;padding:30px 34px;color:#fff"><div style="color:#ff7a1a;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">invoice</div><h1 style="margin:10px 0 4px;font-size:42px;color:#ff7a1a">${money(total)}</h1><div>Paid in full</div></td></tr><tr><td style="padding:28px 34px"><p><strong>Billed to:</strong> ${esc(`${client.firstName} ${client.lastName}`)}<br><strong>Site:</strong> ${esc(client.siteAddress)}</p><table width="100%" cellpadding="6" cellspacing="0"><tr><td>${esc(label)}${merchant.gstRegistered ? ' (excl. GST)' : ''}</td><td align="right">${money(net)}</td></tr>${gstHtml}<tr><td style="font-weight:700">Total paid</td><td align="right" style="font-weight:700">${money(total)}</td></tr></table><p style="font-size:12px;color:#687078">Reference: ${reference}<br>Date paid: ${date(invoice.paidAt || new Date())}${merchant.gstNumber ? `<br>GST no. ${esc(merchant.gstNumber)}` : ''}</p></td></tr></table></td></tr></table></body></html>`;
  const text = `INVOICE - ${merchantName}. Billed to ${client.firstName} ${client.lastName}, ${client.siteAddress}. ${label}: ${money(net)}. ${merchant.gstRegistered ? `GST (15%) incl.: ${money(gst)}. ` : ''}Total paid: ${money(total)}. Reference: ${reference}.`;
  const sent = await sendEmail({
    to: client.email,
    from: 'noreply@taptpay.co.nz',
    subject: `Invoice - ${label} ${money(total)} - ${reference}`,
    html,
    text,
  });
  await storage.createJobEvent({
    merchantId: invoice.merchantId,
    clientProfileId: invoice.clientProfileId,
    jobInvoiceId: invoice.id,
    eventType: sent ? 'invoice_email_sent' : 'invoice_email_failed',
    payload: { reference },
  });
  return sent ? 1 : 0;
}
