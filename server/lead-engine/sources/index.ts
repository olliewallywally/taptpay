/**
 * sources/index.ts — the source registry. `runSource` dispatches a search to the
 * right connector and returns a uniform result the ingest pipeline understands.
 */
import type { LeadCandidate } from "../types";
import { fetchOverpassLeads } from "./overpass";
import { fetchNzbnLeads } from "./nzbn";

export type SourceProvider = "overpass" | "nzbn";

export interface SourceParams {
  provider: SourceProvider;
  region?: string;
  segment?: string;
  category?: string;
  searchTerm?: string;
  limit?: number;
}

export interface SourceRunResult {
  configured: boolean;
  candidates: LeadCandidate[];
  message?: string;
}

export async function runSource(params: SourceParams): Promise<SourceRunResult> {
  switch (params.provider) {
    case "overpass": {
      const candidates = await fetchOverpassLeads({
        region: params.region || "",
        segment: params.segment,
        category: params.category,
        limit: params.limit,
      });
      return { configured: true, candidates };
    }
    case "nzbn":
      return await fetchNzbnLeads({
        searchTerm: params.searchTerm || params.region || "",
        segment: params.segment,
        limit: params.limit,
      });
    default:
      throw new Error(`Unknown source provider: ${(params as { provider: string }).provider}`);
  }
}
