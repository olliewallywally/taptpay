import crypto from "crypto";
import { storage } from "./storage";

function nextRun(from: Date, frequency: string): Date {
  const date = new Date(from);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === "fortnightly") date.setUTCDate(date.getUTCDate() + 14);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date;
}

export async function runTradesGeneratePass(now: Date = new Date()): Promise<{ generated: number; skipped: number; errors: number }> {
  const result = { generated: 0, skipped: 0, errors: 0 };
  const schedules = await storage.getDueJobSchedules(now);

  for (const schedule of schedules) {
    try {
      const dueAt = new Date(schedule.nextRunDate);
      if (schedule.endDate && dueAt > new Date(schedule.endDate)) {
        await storage.terminateJobSchedule(schedule.id);
        result.skipped++;
        continue;
      }
      const invoices = await storage.getJobInvoicesByMerchant(schedule.merchantId, { clientProfileId: schedule.clientProfileId });
      const exists = invoices.some((invoice: any) =>
        invoice.scheduleId === schedule.id && new Date(invoice.dueAt).getTime() === dueAt.getTime());

      if (!exists) {
        const invoice = await storage.createJobInvoice({
          merchantId: schedule.merchantId,
          clientProfileId: schedule.clientProfileId,
          scheduleId: schedule.id,
          quoteId: null,
          kind: "recurring",
          amountCents: schedule.amountCents,
          token: crypto.randomBytes(20).toString("base64url"),
          deliveryChannel: schedule.deliveryChannel || "email",
          status: "pending_dispatch",
          dueAt,
        });
        await storage.createJobEvent({
          merchantId: schedule.merchantId,
          clientProfileId: schedule.clientProfileId,
          scheduleId: schedule.id,
          jobInvoiceId: invoice.id,
          eventType: "recurring_invoice_generated",
          payload: { amountCents: invoice.amountCents, dueAt },
        });
        result.generated++;
      } else {
        result.skipped++;
      }

      const followingRun = nextRun(dueAt, schedule.frequency);
      if (schedule.endDate && followingRun > new Date(schedule.endDate)) {
        await storage.updateJobSchedule(schedule.id, {
          lastRunDate: dueAt,
          nextRunDate: followingRun,
          status: "terminated",
          terminatedAt: new Date(),
        });
      } else await storage.updateJobSchedule(schedule.id, {
        lastRunDate: dueAt,
        nextRunDate: followingRun,
      });
    } catch (error) {
      console.error(`[TRADES_CRON_GENERATE] schedule=${schedule.id}`, error);
      result.errors++;
    }
  }
  return result;
}
