/**
 * enrichment/index.ts — turn a sourced lead (often just name + website) into a
 * contactable, scored, send-ready lead.
 *
 * Waterfall (Phase 2): website scrape → (future: NZBN, paid fallback). Caches by
 * domain. Sets consentBasis to "published_on_website" only when an email is found
 * on the business's own site — the lawful-basis gate every send later checks.
 */
import { storage } from "../../storage";
import { normalizeDomain, normalizeEmail } from "../normalize";
import { scrapeWebsite, type ScrapeResult } from "./website-scrape";
import type { Lead } from "@shared/schema";

const CACHE_TTL_MS = 30 * 24 * 3_600 * 1_000; // 30 days
const FREE_PROVIDERS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "xtra.co.nz", "me.com"];

// Brand root = the registrable name minus its public suffix. Handles NZ's
// two-level suffixes (.co.nz/.org.nz) so fixandfogg.com and fixandfogg.co.nz
// resolve to the same root "fixandfogg".
const TWO_LEVEL_SLD = ["co", "org", "ac", "govt", "gov", "net", "school", "geek", "gen", "kiwi", "maori", "iwi"];
function rootOf(domain?: string): string | undefined {
  if (!domain) return undefined;
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return parts[0];
  if (parts.length >= 3 && parts[parts.length - 1].length === 2 && TWO_LEVEL_SLD.includes(parts[parts.length - 2])) {
    return parts[parts.length - 3];
  }
  return parts[parts.length - 2];
}

function pickBestEmail(emails: string[], siteDomain?: string): { email?: string; confidence: "high" | "medium" | "low" | "none" } {
  if (!emails.length) return { confidence: "none" };
  const domOf = (e: string) => e.split("@")[1] || "";
  if (siteDomain) {
    const exact = emails.find((e) => domOf(e) === siteDomain || domOf(e).endsWith("." + siteDomain));
    if (exact) return { email: exact, confidence: "high" };
  }
  const siteRoot = rootOf(siteDomain);
  if (siteRoot) {
    const sameRoot = emails.find((e) => rootOf(domOf(e)) === siteRoot);
    if (sameRoot) return { email: sameRoot, confidence: "high" };
  }
  const free = emails.find((e) => FREE_PROVIDERS.includes(domOf(e)));
  if (free) return { email: free, confidence: "medium" };
  return { email: emails[0], confidence: "low" };
}

function scoreLead(opts: { confidence: string; email?: string; phone?: string; website?: string; hasLocation: boolean; hasSocial: boolean; nzbn?: string | null }): number {
  let score = 0;
  if (opts.confidence === "high") score += 45;
  else if (opts.email) score += 25;
  if (opts.phone) score += 15;
  if (opts.website) score += 10;
  if (opts.hasLocation) score += 10;
  if (opts.hasSocial) score += 10;
  if (opts.nzbn) score += 5;
  return Math.min(100, score);
}

/** Enrich a single lead and persist the result. Returns the updated lead. */
export async function enrichLead(leadId: number): Promise<Lead> {
  const lead = await storage.getLead(leadId);
  if (!lead) throw new Error("Lead not found");

  const website = lead.website || (lead.domain ? `https://${lead.domain}` : undefined);
  const siteDomain = normalizeDomain(website || undefined);

  let scrape: ScrapeResult;
  if (website && siteDomain) {
    const cached = await storage.getEnrichmentByDomain(siteDomain);
    if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS && cached.payload) {
      scrape = cached.payload as ScrapeResult;
    } else {
      scrape = await scrapeWebsite(website);
      await storage.upsertEnrichment({ domain: siteDomain, url: website, status: scrape.status, payload: scrape as any });
    }
  } else {
    scrape = { status: "no_site", emails: [], phones: [], socials: {} };
  }

  const best = pickBestEmail(scrape.emails, siteDomain);
  const email = normalizeEmail(lead.email) || best.email;
  // Confidence reflects the chosen email; if the lead already had an email we
  // didn't verify on-site, treat it as unknown ("low") unless the scrape matched.
  const emailConfidence = lead.email && lead.email === best.email ? best.confidence : lead.email ? "low" : best.confidence;
  const phone = lead.phone || scrape.phones[0];
  const socials = scrape.socials || {};
  const hasSocial = !!(socials.facebook || socials.instagram || socials.linkedin || socials.twitter);
  const hasLocation = !!(lead.suburb || lead.city || lead.address);

  // Lawful basis: only when we actually found an email published on their own site.
  const foundOnOwnSite = scrape.status === "ok" && best.email && best.confidence !== "low";
  const consentBasis = lead.consentBasis || (foundOnOwnSite ? "published_on_website" : undefined);

  const score = scoreLead({ confidence: best.confidence, email, phone, website: website || undefined, hasLocation, hasSocial, nzbn: lead.nzbn });

  // Status: only promote forward from the early stages.
  let status = lead.status;
  if (["new", "enriching", "enriched"].includes(status)) status = email ? "ready" : "enriched";

  const updated = await storage.updateLead(leadId, {
    email,
    phone,
    emailConfidence,
    consentBasis,
    consentSourceUrl: lead.consentSourceUrl || (foundOnOwnSite ? scrape.url : undefined),
    linkedinUrl: socials.linkedin,
    facebookUrl: socials.facebook,
    instagramUrl: socials.instagram,
    signals: scrape.signals,
    score,
    status,
    enrichedAt: new Date(),
  });
  return updated!;
}

export interface BulkEnrichResult {
  processed: number;
  withEmail: number;
  failed: number;
}

/** Enrich a batch of leads (default: the oldest "new" ones). Sequential + a
 *  small delay to stay polite; capped for request-time safety. */
export async function enrichLeads(opts: { status?: string; limit?: number }): Promise<BulkEnrichResult> {
  const all = await storage.listLeads(opts.status ? { status: opts.status } : undefined);
  const batch = all.slice(0, Math.min(opts.limit ?? 10, 25));
  let processed = 0;
  let withEmail = 0;
  let failed = 0;
  for (const l of batch) {
    try {
      const updated = await enrichLead(l.id);
      processed++;
      if (updated.email) withEmail++;
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { processed, withEmail, failed };
}
