/**
 * normalize.ts — pure normalization + dedupe helpers for the lead engine.
 *
 * No I/O. Shared by the import route, the storage suppression checks, and (later)
 * the sourcing/enrichment connectors so the same business is keyed identically
 * everywhere.
 */

/** Lowercased registrable-ish domain from a URL or email. Strips scheme, `www.`,
 *  path, query, fragment and port. Returns undefined if nothing usable. */
export function normalizeDomain(input?: string | null): string | undefined {
  if (!input) return undefined;
  let s = input.trim().toLowerCase();
  if (!s) return undefined;
  // Email → take the host part.
  if (s.includes("@") && !s.includes("/")) s = s.split("@")[1] ?? "";
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0].split(":")[0].trim();
  return s || undefined;
}

/** Lowercased, trimmed email. Returns undefined if it isn't email-shaped. */
export function normalizeEmail(input?: string | null): string | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  return s.includes("@") ? s : undefined;
}

/** Digits-only phone, preserving a leading `+` for international form. */
export function normalizePhone(input?: string | null): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^0-9]/g, "");
  return digits ? plus + digits : undefined;
}

function slug(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "-");
}

/**
 * A stable key used to avoid importing the same business twice. Prefers the
 * domain (`d:example.co.nz`); otherwise falls back to business name + locality
 * (`n:joes-cafe@wellington`).
 */
export function deriveDedupeKey(input: {
  businessName: string;
  domain?: string | null;
  website?: string | null;
  email?: string | null;
  suburb?: string | null;
  city?: string | null;
}): string {
  const domain = normalizeDomain(input.domain || input.website || input.email);
  if (domain) return `d:${domain}`;
  const place = slug(input.suburb || input.city || "");
  return `n:${slug(input.businessName)}${place ? "@" + place : ""}`;
}

const SEGMENT_BY_KEYWORD: Array<[string, string]> = [
  ["cafe", "hospitality"], ["café", "hospitality"], ["coffee", "hospitality"],
  ["restaurant", "hospitality"], ["bar", "hospitality"], ["takeaway", "hospitality"],
  ["bakery", "hospitality"], ["catering", "hospitality"], ["food", "hospitality"],
  ["salon", "retail"], ["barber", "retail"], ["boutique", "retail"], ["grocery", "retail"],
  ["retail", "retail"], ["shop", "retail"], ["store", "retail"],
  ["plumb", "trades"], ["electric", "trades"], ["builder", "trades"], ["building", "trades"],
  ["landscap", "trades"], ["paint", "trades"], ["mechanic", "trades"], ["roof", "trades"], ["trade", "trades"],
  ["property manage", "property"], ["property", "property"], ["landlord", "property"], ["real estate", "property"], ["realty", "property"],
];

/** Best-effort segment guess from a free-text category. */
export function inferSegment(category?: string | null): string | undefined {
  if (!category) return undefined;
  const c = category.toLowerCase();
  for (const [kw, seg] of SEGMENT_BY_KEYWORD) {
    if (c.includes(kw)) return seg;
  }
  return undefined;
}
