/**
 * overpass.ts — discovery via the OpenStreetMap Overpass API.
 *
 * Free, no API key. Finds NZ local businesses (cafés, retail, tradies…) by
 * segment + region, which is exactly where paid B2B databases are thin. Endpoint
 * is overridable via OVERPASS_API_URL (use a mirror if the main instance is busy).
 */
import type { LeadCandidate } from "../types";

const OVERPASS_URL = process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";

// Curated OSM tag sets per segment. Power users can override with a single
// "key=value" category (e.g. "amenity=ice_cream").
const OSM_TAGS_BY_SEGMENT: Record<string, string[]> = {
  hospitality: ["amenity=cafe", "amenity=restaurant", "amenity=fast_food", "amenity=bar", "amenity=pub", "shop=bakery"],
  retail: ["shop=clothes", "shop=hairdresser", "shop=beauty", "shop=gift", "shop=florist", "shop=convenience", "shop=greengrocer", "shop=butcher"],
  trades: ["craft=plumber", "craft=electrician", "craft=carpenter", "craft=painter", "craft=builder", "craft=hvac", "shop=trade"],
  property: ["office=estate_agent", "office=property_management"],
};

function escapeOverpass(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildOverpassQuery(region: string, tags: string[], limit: number): string {
  const area = escapeOverpass(region);
  const filters = tags
    .map((t) => {
      const [k, v] = t.split("=");
      return `  nwr["${escapeOverpass(k)}"="${escapeOverpass(v)}"](area.searchArea);`;
    })
    .join("\n");
  return `[out:json][timeout:25];
area["name"="${area}"]->.searchArea;
(
${filters}
);
out tags center ${limit};`;
}

export interface OverpassParams {
  region: string;
  segment?: string;
  category?: string;
  limit?: number;
}

export async function fetchOverpassLeads(params: OverpassParams): Promise<LeadCandidate[]> {
  const region = (params.region || "").trim();
  if (!region) throw new Error('A region is required for an Overpass search (e.g. "Wellington").');

  let tags = params.segment ? OSM_TAGS_BY_SEGMENT[params.segment] : undefined;
  if (params.category && params.category.includes("=")) tags = [params.category];
  if (!tags || tags.length === 0) tags = Object.values(OSM_TAGS_BY_SEGMENT).flat();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  const query = buildOverpassQuery(region, tags, limit);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass's usage policy requires a UA identifying the app; without it
        // the edge returns 406/429. Accept keeps content negotiation happy.
        "User-Agent": process.env.OVERPASS_USER_AGENT || "TaptPay-LeadEngine/1.0 (+https://taptpay.co.nz)",
        Accept: "application/json",
      },
      body: "data=" + encodeURIComponent(query),
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new Error(
      err?.name === "AbortError"
        ? "Overpass timed out — try a smaller region or a lower limit."
        : `Overpass request failed: ${err?.message || err}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new Error("Overpass rate limit hit — wait a minute and retry.");
  if (!res.ok) throw new Error(`Overpass returned HTTP ${res.status}.`);

  const data: any = await res.json();
  const elements: any[] = Array.isArray(data?.elements) ? data.elements : [];
  return elements
    .map((el) => toCandidate(el, params))
    .filter((c): c is LeadCandidate => c !== null);
}

function toCandidate(el: any, params: OverpassParams): LeadCandidate | null {
  const tags = el?.tags || {};
  const businessName = String(tags.name || "").trim();
  if (!businessName) return null;
  const website = tags.website || tags["contact:website"] || undefined;
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ").trim();
  return {
    businessName,
    segment: params.segment,
    category: tags.amenity || tags.shop || tags.craft || tags.office || undefined,
    website,
    email: tags.email || tags["contact:email"] || undefined,
    phone: tags.phone || tags["contact:phone"] || tags["contact:mobile"] || undefined,
    address: street || undefined,
    suburb: tags["addr:suburb"] || tags["addr:neighbourhood"] || undefined,
    city: tags["addr:city"] || undefined,
    region: params.region,
    consentSourceUrl: website,
  };
}
