/**
 * personalize/index.ts — generate and persist an outreach draft per lead.
 *
 * Tries Claude (Haiku) first; falls back to a segment template when AI isn't
 * configured or generation fails, so the cockpit always produces a draft. Drafts
 * land in draft_* columns and start at status "draft" for human review/approve
 * before anything is ever enrolled to send (Phase 4).
 */
import { storage } from "../../storage";
import type { Lead } from "@shared/schema";
import { generateDraftWithClaude, isAiConfigured } from "./claude";
import { renderTemplate } from "./templates";
import type { PersonalizeContext } from "./prompts";

function buildContext(lead: Lead): PersonalizeContext {
  return {
    businessName: lead.businessName,
    segment: lead.segment ?? undefined,
    category: lead.category ?? undefined,
    suburb: lead.suburb ?? undefined,
    city: lead.city ?? undefined,
    website: lead.website ?? undefined,
    signals: lead.signals ?? undefined,
    contactName: lead.contactName ?? undefined,
  };
}

/** Draft (or re-draft) the outreach message for one lead. Returns the lead. */
export async function personalizeLead(leadId: number): Promise<Lead> {
  const lead = await storage.getLead(leadId);
  if (!lead) throw new Error("Lead not found");

  const ctx = buildContext(lead);
  const ai = await generateDraftWithClaude(ctx);
  const draft = ai ?? { ...renderTemplate(ctx), model: "template" };

  const updated = await storage.updateLead(leadId, {
    draftSubject: draft.subject,
    draftBody: draft.body,
    draftStatus: "draft",
    draftModel: draft.model,
    draftGeneratedAt: new Date(),
  });
  return updated!;
}

export interface BulkPersonalizeResult {
  processed: number;
  drafted: number;
  failed: number;
  usedAi: boolean;
}

/** Draft for a batch of leads (default: "ready"), skipping already-approved
 *  drafts. Capped for request-time safety; AI calls are sequential. */
export async function personalizeLeads(opts: { status?: string; limit?: number }): Promise<BulkPersonalizeResult> {
  const all = await storage.listLeads(opts.status ? { status: opts.status } : undefined);
  const batch = all.filter((l) => l.draftStatus !== "approved").slice(0, Math.min(opts.limit ?? 8, 15));
  let processed = 0;
  let drafted = 0;
  let failed = 0;
  for (const l of batch) {
    try {
      const updated = await personalizeLead(l.id);
      processed++;
      if (updated.draftSubject) drafted++;
    } catch {
      failed++;
    }
  }
  return { processed, drafted, failed, usedAi: isAiConfigured() };
}

export { isAiConfigured };
