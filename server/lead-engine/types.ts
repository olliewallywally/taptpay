/**
 * types.ts — the shared lead shape every source (CSV, Overpass, NZBN, …) maps
 * onto before it's ingested. Keeping one shape means dedupe + insert logic lives
 * in a single place (see ingest.ts).
 */
export interface LeadCandidate {
  businessName: string;
  segment?: string;
  category?: string;
  website?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  address?: string;
  suburb?: string;
  city?: string;
  region?: string;
  nzbn?: string;
  /** URL where the contact detail is publicly published — evidence for the
   *  lawful-basis check before any outreach (set during enrichment). */
  consentSourceUrl?: string;
}
