/**
 * scheduler.ts — the outreach cron pass. Invoked from POST /api/internal/cron.
 *
 * For each due, active enrollment (within the campaign's daily cap): re-check
 * compliance (suppression + consent), render the step, send (or dry-run), record
 * the message, then advance the enrollment to the next step or complete it. A
 * send failure marks the enrollment "failed"; suppression marks it
 * "unsubscribed"; a missing draft/address pauses it. Idempotent per run.
 */
import { randomBytes } from "crypto";
import { storage } from "../../storage";
import { renderStepContent } from "./render";
import { sendEmailStep, sendWhatsAppStep } from "./send";

const PER_RUN_LIMIT = 100;
const DAY_MS = 86_400_000;

export interface OutreachPassResult {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runOutreachPass(baseUrl: string, now: Date = new Date()): Promise<OutreachPassResult> {
  const due = await storage.getDueEnrollments(now, PER_RUN_LIMIT);
  const base = (baseUrl || "").replace(/\/+$/, "");
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sentTodayByCampaign = new Map<number, number>();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const enr of due) {
    const campaign = await storage.getCampaign(enr.campaignId);
    if (!campaign || campaign.status !== "active") { skipped++; continue; }

    // Daily cap per campaign.
    let sentToday = sentTodayByCampaign.get(campaign.id);
    if (sentToday == null) {
      sentToday = await storage.countCampaignMessagesSince(campaign.id, startOfDay);
      sentTodayByCampaign.set(campaign.id, sentToday);
    }
    if (sentToday >= campaign.dailyCap) { skipped++; continue; } // defer; picked up next run/day

    const steps = await storage.getCampaignSteps(campaign.id);
    const step = steps[enr.currentStep];
    if (!step) {
      await storage.updateEnrollment(enr.id, { status: "completed", completedAt: now, nextSendAt: null });
      skipped++;
      continue;
    }

    const lead = await storage.getLead(enr.leadId);
    if (!lead) {
      await storage.updateEnrollment(enr.id, { status: "failed", note: "lead missing", nextSendAt: null });
      failed++;
      continue;
    }

    // ── Compliance gate (re-checked at send time) ──
    const toAddress = step.channel === "email" ? lead.email || "" : lead.phone || "";
    if (!toAddress) {
      await storage.updateEnrollment(enr.id, { status: "paused", note: `no ${step.channel} address`, nextSendAt: null });
      skipped++;
      continue;
    }
    if (step.channel === "email" && !lead.consentBasis) {
      await storage.updateEnrollment(enr.id, { status: "paused", note: "no consent basis", nextSendAt: null });
      skipped++;
      continue;
    }
    const suppressed = step.channel === "email"
      ? await storage.isSuppressed({ email: lead.email || undefined, domain: lead.domain || undefined })
      : await storage.isSuppressed({ phone: lead.phone || undefined });
    if (suppressed) {
      await storage.updateEnrollment(enr.id, { status: "unsubscribed", note: "suppressed", nextSendAt: null });
      skipped++;
      continue;
    }

    const content = renderStepContent(step, lead);
    if (!content) {
      await storage.updateEnrollment(enr.id, { status: "paused", note: "no content (approve a draft?)", nextSendAt: null });
      skipped++;
      continue;
    }

    const token = randomBytes(24).toString("base64url");
    const unsubscribeUrl = `${base}/unsubscribe?token=${token}`;
    const result = step.channel === "email"
      ? await sendEmailStep({ to: toAddress, subject: content.subject, body: content.body, unsubscribeUrl, fromOverride: campaign.fromIdentity })
      : await sendWhatsAppStep({ phone: toAddress, body: content.body });

    await storage.createOutreachMessage({
      enrollmentId: enr.id,
      campaignId: campaign.id,
      leadId: lead.id,
      stepOrder: enr.currentStep,
      channel: step.channel,
      toAddress,
      subject: content.subject,
      body: content.body,
      status: result.ok ? "sent" : "failed",
      providerId: result.providerId,
      unsubscribeToken: step.channel === "email" ? token : undefined,
      error: result.error,
      sentAt: result.ok ? now : undefined,
    });

    if (!result.ok) {
      await storage.updateEnrollment(enr.id, { status: "failed", note: result.error || "send failed" });
      failed++;
      continue;
    }

    sent++;
    sentTodayByCampaign.set(campaign.id, (sentTodayByCampaign.get(campaign.id) || 0) + 1);
    if (["new", "ready", "enriched", "enrolled"].includes(lead.status)) {
      await storage.updateLead(lead.id, { status: "contacted", lastContactedAt: now });
    }

    const nextIndex = enr.currentStep + 1;
    const nextStep = steps[nextIndex];
    if (!nextStep) {
      await storage.updateEnrollment(enr.id, { status: "completed", currentStep: nextIndex, lastSentAt: now, completedAt: now, nextSendAt: null });
    } else {
      const baseTime = enr.enrolledAt ? new Date(enr.enrolledAt).getTime() : now.getTime();
      const nextSendAt = new Date(baseTime + (nextStep.dayOffset || 0) * DAY_MS);
      await storage.updateEnrollment(enr.id, { currentStep: nextIndex, lastSentAt: now, nextSendAt });
    }
  }

  return { due: due.length, sent, skipped, failed };
}
