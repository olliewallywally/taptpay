/**
 * nzbn.ts — discovery / validation via the NZ Business Number register.
 *
 * The NZBN API is free but requires a subscription key (sign up at
 * api.business.govt.nz). Without NZBN_API_KEY this connector no-ops cleanly so
 * the rest of the engine keeps working. The response mapping is best-effort and
 * may need tweaking against the live API once a key is configured.
 */
import type { LeadCandidate } from "../types";

const NZBN_BASE = process.env.NZBN_API_URL || "https://api.business.govt.nz/services/v4/nzbn/entities";

export interface NzbnParams {
  searchTerm: string;
  segment?: string;
  limit?: number;
}

export interface NzbnResult {
  configured: boolean;
  candidates: LeadCandidate[];
  message?: string;
}

export async function fetchNzbnLeads(params: NzbnParams): Promise<NzbnResult> {
  const key = process.env.NZBN_API_KEY;
  if (!key) {
    return {
      configured: false,
      candidates: [],
      message: "NZBN search needs an API key. Set NZBN_API_KEY (free from api.business.govt.nz) to enable it.",
    };
  }

  const term = (params.searchTerm || "").trim();
  if (!term) throw new Error("A search term is required for an NZBN search.");
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const url = `${NZBN_BASE}?search-term=${encodeURIComponent(term)}&page-size=${limit}&entity-status=Registered`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new Error(err?.name === "AbortError" ? "NZBN timed out." : `NZBN request failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new Error("NZBN rejected the API key (check NZBN_API_KEY).");
  if (!res.ok) throw new Error(`NZBN returned HTTP ${res.status}.`);

  const data: any = await res.json();
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const candidates = items
    .map((it) => toNzbnCandidate(it, params))
    .filter((c): c is LeadCandidate => c !== null);
  return { configured: true, candidates };
}

function toNzbnCandidate(it: any, params: NzbnParams): LeadCandidate | null {
  const businessName = String(it?.entityName || it?.tradingNames?.[0]?.name || "").trim();
  if (!businessName) return null;
  const addresses: any[] = it?.addresses?.addressList || [];
  const physical = addresses.find((a) => a?.purpose === "PHYSICAL") || addresses[0] || {};
  return {
    businessName,
    segment: params.segment,
    nzbn: it?.nzbn || undefined,
    address: physical?.address1 || undefined,
    suburb: physical?.address2 || undefined,
    city: physical?.address3 || undefined,
    consentSourceUrl: it?.nzbn ? `https://www.nzbn.govt.nz/mynzbn/nzbndetails/${it.nzbn}/` : undefined,
  };
}
