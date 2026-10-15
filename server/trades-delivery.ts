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

/**
 * Sends a quote for the signed-in business that made it (R1-T7 S4b2). The quote and its client are
 * read together and must both be that business's; the message goes to that captured contact, and
 * its history line is written only while both still are. No database lock is held across a
 * provider call. After an attempted send, an uncertain outcome is "reconciliation_required":
 * never a success, and never a claim that nothing was sent.
 */
export async function sendTradeQuoteForMerchant(
  quoteId: string,
  merchantId: number,
  baseUrl: string
): Promise<DeliveryResult> {
  const [merchant, subscription] = await Promise.all([
    storage.getMerchant(merchantId),
    storage.getSubscription(merchantId),
  ]);
  // Read both owned rows together after the other awaited prerequisites. Delivery
  // uses this captured contact; it never refetches the client through a global key.
  const snapshot = await storage.getQuoteDeliveryForMerchant(quoteId, merchantId);
  if (!snapshot) return { sent: false, reason: 'not_found' };
  if (!merchant) return { sent: false, reason: 'missing_data' };
  if (!billingCardIsReady(subscription)) {
    return { sent: false, reason: 'billing_card_required' };
  }
  const { quote, client } = snapshot;
  const ref = String(quote.token || quote.id).slice(0, 8).toUpperCase();
  const pdf = generateQuotePdf(quote, client, merchant, baseUrl);
  let result: DeliveryResult;
  try {
    result = await deliver(
      quote.deliveryChannel || client.preferredChannel || 'email',
      client,
      quoteCopy(quote, client, merchant, baseUrl),
      [{ filename: `quote-${ref}.pdf`, content: pdf }]
    );
  } catch {
    // An attempted provider call may have succeeded despite its exception. Do
    // not retry it here or report a delivery either way.
    return { sent: false, reason: 'reconciliation_required' };
  }
  const record = { sent: result.sent, channel: result.channel, reason: result.reason };
  if (!result.sent) {
    // A known failed send: its line is logged as before; nothing was delivered.
    await storage.recordQuoteDeliveryForMerchant(quoteId, merchantId, quote.clientProfileId, record);
    return result;
  }
  try {
    const recorded = await storage.recordQuoteDeliveryForMerchant(quoteId, merchantId, quote.clientProfileId, record);
    // The message was sent, but its scoped history was refused.
    if (!recorded) return { sent: false, reason: 'reconciliation_required' };
    return result;
  } catch {
    // The message was sent, but its scoped history did not commit.
    return { sent: false, reason: 'reconciliation_required' };
  }
}

/**
 * Sends an invoice's payment link for the signed-in business that made it (R1-T7 S4b2): the same
 * snapshot, captured contact and reconciliation rule as the quote above. The delivery record
 * locks the client then the invoice and saves its state and history together.
 */
export async function resendTradeInvoiceForMerchant(
  invoiceId: string,
  merchantId: number,
  baseUrl: string
): Promise<DeliveryResult & { invoice?: any }> {
  const merchant = await storage.getMerchant(merchantId);
  const snapshot = await storage.getJobInvoiceDeliveryForMerchant(invoiceId, merchantId);
  if (!snapshot) return { sent: false, reason: 'not_found' };
  const { invoice, client } = snapshot;
  if (['paid', 'paid_external', 'voided'].includes(invoice.status))
    return { sent: false, reason: 'not_payable' };
  if (!merchant) return { sent: false, reason: 'missing_data' };
  let result: DeliveryResult;
  try {
    result = await deliver(
      invoice.deliveryChannel || client.preferredChannel || 'email',
      client,
      invoiceCopy(invoice, client, merchant, baseUrl)
    );
  } catch {
    return { sent: false, reason: 'reconciliation_required' };
  }
  if (!result.sent) return result;
  try {
    const recorded = await storage.recordJobInvoiceDeliveryForMerchant(invoiceId, merchantId, invoice.clientProfileId, {
      channel: result.channel,
      messageId: result.messageId,
    });
    if (recorded.kind !== 'ok') return { sent: false, reason: 'reconciliation_required' };
    return { ...result, invoice: recorded.invoice };
  } catch {
    return { sent: false, reason: 'reconciliation_required' };
  }
}

/** The public quote acceptance's and the cron's sender: the invoice is read by its own id. */
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

/** The receipt's email for one paid invoice, its client and its business: the same for both lanes below. */
function paymentReceipt(invoice: any, client: any, merchant: any) {
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
  return { reference, subject: `Invoice - ${label} ${money(total)} - ${reference}`, html, text };
}

/** The payment lane's receipt (the provider's completion): the invoice it was handed, read by its own ids. */
export async function sendTradePaymentInvoice(invoice: any): Promise<number> {
  const [client, merchant] = await Promise.all([
    storage.getClientProfile(invoice.clientProfileId),
    storage.getMerchant(invoice.merchantId),
  ]);
  if (!client?.email || !merchant) return 0;
  const receipt = paymentReceipt(invoice, client, merchant);
  const sent = await sendEmail({
    to: client.email,
    from: 'noreply@taptpay.co.nz',
    subject: receipt.subject,
    html: receipt.html,
    text: receipt.text,
  });
  await storage.createJobEvent({
    merchantId: invoice.merchantId,
    clientProfileId: invoice.clientProfileId,
    jobInvoiceId: invoice.id,
    eventType: sent ? 'invoice_email_sent' : 'invoice_email_failed',
    payload: { reference: receipt.reference },
  });
  return sent ? 1 : 0;
}

/**
 * The receipt after a signed-in business marks its invoice paid outside TaptPay (R1-T7 S4b1).
 * The invoice and its client are read together and must both be that business's; the receipt
 * goes to that captured contact, and its history line is written only while both still are.
 */
export async function sendTradePaymentInvoiceForMerchant(invoiceId: string, merchantId: number): Promise<number> {
  const merchant = await storage.getMerchant(merchantId);
  // Read both owned rows together after the other awaited prerequisite. The receipt
  // uses this captured contact; it never refetches the client through a global key.
  const snapshot = await storage.getJobInvoiceDeliveryForMerchant(invoiceId, merchantId);
  if (!snapshot?.client.email || !merchant) return 0;
  const receipt = paymentReceipt(snapshot.invoice, snapshot.client, merchant);
  const sent = await sendEmail({
    to: snapshot.client.email,
    from: 'noreply@taptpay.co.nz',
    subject: receipt.subject,
    html: receipt.html,
    text: receipt.text,
  });
  const recorded = await storage.recordJobInvoiceReceiptForMerchant(invoiceId, merchantId, snapshot.invoice.clientProfileId, { sent, reference: receipt.reference });
  // The email went to the contact owned when it was read. A line refused afterwards is
  // never written through a global key; the id says which invoice to reconcile.
  if (!recorded) console.error(`[TRADES_RECEIPT_UNRECORDED] invoice=${invoiceId}`);
  return sent ? 1 : 0;
}
