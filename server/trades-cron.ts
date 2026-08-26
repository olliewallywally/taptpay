import crypto from "crypto";
import { storage } from "./storage";
import { billingCardIsReady } from "./billing-card";

function nextRun(from: Date, frequency: string, anchorDom?: number): Date {
  const date = new Date(from);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === "fortnightly") date.setUTCDate(date.getUTCDate() + 14);
  else {
    // Monthly: advance one month and clamp the anchor day-of-month to the target
    // month's length. Plain setUTCMonth(+1) overflows for 29th–31st anchors
    // (e.g. Jan 31 -> Mar 3), skipping a month and permanently drifting the
    // billing date. Anchoring on the schedule's original day recovers the 31st
    // in months that have it.
    const dom = anchorDom ?? date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(dom, daysInMonth));
  }
  return date;
}

export async function runTradesGeneratePass(now: Date = new Date()): Promise<{ generated: number; skipped: number; errors: number }> {
  const result = { generated: 0, skipped: 0, errors: 0 };
  const schedules = await storage.getDueJobSchedules(now);

  for (const schedule of schedules) {
    try {
      if (!billingCardIsReady(await storage.getSubscription(schedule.merchantId))) {
        result.skipped++;
        continue;
      }
      const dueAt = new Date(schedule.nextRunDate);
      if (schedule.endDate && dueAt > new Date(schedule.endDate)) {
        await storage.terminateJobSchedule(schedule.id);
        result.skipped++;
        continue;
      }
      // Targeted existence check (no per-schedule full-table scan). The unique
      // index on (schedule_id, due_at) is the hard backstop: if a concurrent or
      // retried run slips past this check, the insert raises 23505 and we treat
      // it as an already-generated skip rather than billing the client twice.
      const existing = await storage.getJobInvoiceByScheduleAndDue(schedule.id, dueAt);
      if (existing) {
        result.skipped++;
      } else {
        try {
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
        } catch (insertError: any) {
          if (insertError?.code === "23505") result.skipped++;
          else throw insertError;
        }
      }

      const anchorDom = new Date(schedule.startDate).getUTCDate();
      const followingRun = nextRun(dueAt, schedule.frequency, anchorDom);
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
