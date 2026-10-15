import crypto from "crypto";
import { storage } from "./storage";
import { billingCardIsReady } from "./billing-card";
import { nextJobRun } from "./trades-schedule";
// The cycle math lives in a module storage can use without importing this one (R1-T7 S4c).
export { nextJobRunDateAfter } from "./trades-schedule";

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
      const followingRun = nextJobRun(dueAt, schedule.frequency, anchorDom);
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
