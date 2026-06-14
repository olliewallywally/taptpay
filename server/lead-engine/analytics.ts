/**
 * analytics.ts — assemble the lead-engine funnel report for the cockpit:
 * pipeline funnel, per-segment performance, per-campaign performance, sending
 * stats, and the conversion rate. Computed from storage; fine at lean volume.
 */
import { storage } from "../storage";

const FUNNEL_ORDER = ["new", "enriching", "enriched", "ready", "enrolled", "contacted", "replied", "converted"] as const;

export interface LeadAnalytics {
  total: number;
  converted: number;
  conversionRate: number;
  funnel: Array<{ status: string; count: number }>;
  other: { suppressed: number; rejected: number };
  bySegment: Array<{ segment: string; total: number; contacted: number; converted: number }>;
  campaigns: Array<{ id: number; name: string; status: string; enrolled: number; sent: number; active: number; replied: number; completed: number; unsubscribed: number }>;
  outreach: { total: number; sent: number; failed: number; emailSent: number; whatsappSent: number; last7dSent: number };
  aiDrafts: { drafted: number; approved: number };
}

export async function getLeadAnalytics(): Promise<LeadAnalytics> {
  const [counts, leads, campaigns, outreach] = await Promise.all([
    storage.getLeadCountsByStatus(),
    storage.listLeads(),
    storage.listCampaigns(),
    storage.getOutreachMessageStats(),
  ]);

  const total = leads.length;
  const converted = counts["converted"] || 0;

  const funnel = FUNNEL_ORDER.map((s) => ({ status: s, count: counts[s] || 0 }));
  const other = { suppressed: counts["suppressed"] || 0, rejected: counts["rejected"] || 0 };

  const segMap: Record<string, { segment: string; total: number; contacted: number; converted: number }> = {};
  let drafted = 0;
  let approved = 0;
  for (const l of leads) {
    const seg = l.segment || "unknown";
    (segMap[seg] ||= { segment: seg, total: 0, contacted: 0, converted: 0 });
    segMap[seg].total++;
    if (l.status === "contacted" || l.status === "replied") segMap[seg].contacted++;
    if (l.status === "converted") segMap[seg].converted++;
    if (l.draftStatus === "draft" || l.draftStatus === "approved") drafted++;
    if (l.draftStatus === "approved") approved++;
  }
  const bySegment = Object.values(segMap).sort((a, b) => b.total - a.total);

  const campaignStats: LeadAnalytics["campaigns"] = [];
  for (const c of campaigns) {
    const enrollments = await storage.listEnrollmentsByCampaign(c.id);
    const byStatus: Record<string, number> = {};
    for (const e of enrollments) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    const sent = await storage.countCampaignMessagesSince(c.id, new Date(0));
    campaignStats.push({
      id: c.id,
      name: c.name,
      status: c.status,
      enrolled: enrollments.length,
      sent,
      active: byStatus["active"] || 0,
      replied: byStatus["replied"] || 0,
      completed: byStatus["completed"] || 0,
      unsubscribed: byStatus["unsubscribed"] || 0,
    });
  }

  return {
    total,
    converted,
    conversionRate: total ? converted / total : 0,
    funnel,
    other,
    bySegment,
    campaigns: campaignStats,
    outreach,
    aiDrafts: { drafted, approved },
  };
}
