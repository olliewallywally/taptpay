/**
 * enroll.ts — add leads to a campaign, enforcing eligibility up front so the
 * scheduler only ever sees sendable enrollments.
 *
 * A lead is eligible only if it has the channel's contact detail, a lawful
 * consent basis (email), isn't suppressed, isn't already enrolled, and — when
 * the first step uses the AI draft — has an approved draft.
 */
import { storage } from "../../storage";
import type { Lead, CampaignStep } from "@shared/schema";

export interface EnrollResult {
  enrolled: number;
  skipped: number;
  reasons: Record<string, number>;
}

function bump(r: Record<string, number>, key: string) {
  r[key] = (r[key] || 0) + 1;
}

/** Returns a skip-reason string if INELIGIBLE, or null if eligible. */
async function ineligibleReason(lead: Lead, firstStep: CampaignStep, campaignSegment?: string | null): Promise<string | null> {
  if (campaignSegment && lead.segment && lead.segment !== campaignSegment) return "wrong_segment";
  if (firstStep.channel === "email") {
    if (!lead.email) return "no_email";
    if (!lead.consentBasis) return "no_consent_basis";
    if (await storage.isSuppressed({ email: lead.email, domain: lead.domain || undefined })) return "suppressed";
  } else if (firstStep.channel === "whatsapp") {
    if (!lead.phone) return "no_phone";
    if (await storage.isSuppressed({ phone: lead.phone })) return "suppressed";
  }
  if (firstStep.source === "lead_draft" && (lead.draftStatus !== "approved" || !lead.draftBody)) return "no_approved_draft";
  return null;
}

export async function enrollLeads(
  campaignId: number,
  opts: { status?: string; leadIds?: number[]; limit?: number },
): Promise<EnrollResult> {
  const campaign = await storage.getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const steps = await storage.getCampaignSteps(campaignId);
  if (steps.length === 0) throw new Error("Campaign has no steps — add at least one step first");
  const firstStep = steps[0];

  let leads: Lead[];
  if (opts.leadIds && opts.leadIds.length) {
    leads = [];
    for (const id of opts.leadIds) {
      const l = await storage.getLead(id);
      if (l) leads.push(l);
    }
  } else {
    leads = await storage.listLeads({ status: opts.status || "ready" });
  }
  leads = leads.slice(0, Math.min(opts.limit ?? 500, 1000));

  const reasons: Record<string, number> = {};
  let enrolled = 0;
  let skipped = 0;
  for (const lead of leads) {
    const reason = await ineligibleReason(lead, firstStep, campaign.segment);
    if (reason) {
      bump(reasons, reason);
      skipped++;
      continue;
    }
    if (await storage.getEnrollmentByLeadCampaign(campaignId, lead.id)) {
      bump(reasons, "already_enrolled");
      skipped++;
      continue;
    }
    const nextSendAt = new Date(Date.now() + (firstStep.dayOffset || 0) * 86_400_000);
    await storage.createEnrollment({ campaignId, leadId: lead.id, status: "active", currentStep: 0, nextSendAt, enrolledAt: new Date() });
    if (lead.status === "ready" || lead.status === "enriched" || lead.status === "new") {
      await storage.updateLead(lead.id, { status: "enrolled" });
    }
    enrolled++;
  }
  return { enrolled, skipped, reasons };
}
