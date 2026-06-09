/**
 * ingest.ts — the single path every lead takes into the database.
 *
 * Records the batch's provenance (lead_sources), dedupes both within the batch
 * and against existing leads, normalizes contact fields, and inserts. Shared by
 * the CSV import and every sourcing connector so behaviour is identical.
 */
import { storage } from "../storage";
import { deriveDedupeKey, normalizeDomain, normalizeEmail, inferSegment } from "./normalize";
import type { LeadCandidate } from "./types";

export interface IngestOptions {
  provider: string;             // csv | overpass | nzbn | …
  label?: string;
  params?: unknown;             // the query/import params, stored for provenance
  segment?: string;             // batch-level segment override
  consentBasis?: string;        // lawful-basis marker (CSV: "manual"; sourced: undefined until enriched)
  createdBy?: string | null;
}

export interface IngestResult {
  found: number;
  imported: number;
  duplicates: number;
  sourceId: number;
}

export async function ingestLeads(candidates: LeadCandidate[], opts: IngestOptions): Promise<IngestResult> {
  const source = await storage.createLeadSource({
    provider: opts.provider,
    label: opts.label ?? `${opts.provider} ${new Date().toISOString().slice(0, 10)}`,
    params: (opts.params ?? null) as any,
    totalFound: candidates.length,
    totalImported: 0,
    createdBy: opts.createdBy ?? null,
  });

  let imported = 0;
  let duplicates = 0;
  const seen = new Set<string>();

  for (const c of candidates) {
    if (!c.businessName) continue;
    const dedupeKey = deriveDedupeKey(c);
    if (seen.has(dedupeKey)) { duplicates++; continue; }
    seen.add(dedupeKey);
    if (await storage.getLeadByDedupeKey(dedupeKey)) { duplicates++; continue; }

    await storage.createLead({
      businessName: c.businessName,
      segment: opts.segment ?? c.segment ?? inferSegment(c.category),
      category: c.category,
      website: c.website,
      domain: normalizeDomain(c.website || c.email),
      email: normalizeEmail(c.email),
      phone: c.phone,
      contactName: c.contactName,
      address: c.address,
      suburb: c.suburb,
      city: c.city,
      region: c.region,
      nzbn: c.nzbn,
      dedupeKey,
      sourceId: source.id,
      consentBasis: opts.consentBasis,
      consentSourceUrl: c.consentSourceUrl,
      status: "new",
    });
    imported++;
  }

  await storage.updateLeadSource(source.id, { totalImported: imported });
  return { found: candidates.length, imported, duplicates, sourceId: source.id };
}
