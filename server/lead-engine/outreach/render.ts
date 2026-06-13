/**
 * render.ts — turn a campaign step into the actual message for a given lead.
 *
 * A "lead_draft" step uses the lead's approved AI/template draft (Phase 3); a
 * "template" step substitutes merge fields like {{businessName}} into the step's
 * own subject/body. Returns null when the step can't be rendered (e.g. a
 * lead_draft step on a lead with no approved draft) so the caller can pause.
 */
import type { Lead, CampaignStep } from "@shared/schema";

export function renderMerge(template: string, lead: Lead): string {
  const firstName = (lead.contactName || "").trim().split(/\s+/)[0] || "";
  const map: Record<string, string> = {
    businessName: lead.businessName || "",
    firstName,
    contactName: lead.contactName || "",
    suburb: lead.suburb || "",
    city: lead.city || lead.suburb || "",
    segment: lead.segment || "",
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => map[k] ?? "");
}

export function renderStepContent(step: CampaignStep, lead: Lead): { subject: string; body: string } | null {
  if (step.source === "lead_draft") {
    if (lead.draftStatus !== "approved" || !lead.draftBody) return null;
    return { subject: lead.draftSubject || `A note for ${lead.businessName}`, body: lead.draftBody };
  }
  if (!step.body) return null;
  return { subject: renderMerge(step.subject || "", lead), body: renderMerge(step.body, lead) };
}
