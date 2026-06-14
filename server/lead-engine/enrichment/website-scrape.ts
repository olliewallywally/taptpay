/**
 * website-scrape.ts — pull contact details + personalization signals from a
 * business's own website. Free, dependency-free (regex extraction), and polite:
 * identifies itself, honours a root robots Disallow, caps page count, size and
 * time. This is where local-SMB contact data actually lives.
 */

const UA = process.env.SCRAPER_USER_AGENT || "TaptPay-LeadEngine/1.0 (+https://taptpay.co.nz)";

export interface ScrapeResult {
  status: "ok" | "failed" | "blocked" | "no_site";
  url?: string;
  emails: string[];
  phones: string[];
  socials: { linkedin?: string; facebook?: string; instagram?: string; twitter?: string };
  title?: string;
  description?: string;
  signals?: string;
  error?: string;
}

function normalizeUrl(website: string): string | null {
  let u = (website || "").trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    return new URL(u).toString();
  } catch {
    return null;
  }
}

async function politeFetch(url: string, timeoutMs = 12_000, maxBytes = 1_500_000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct && !/text\/html|application\/xhtml|text\/plain/i.test(ct)) return null;
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function robotsAllows(origin: string): Promise<boolean> {
  const txt = await politeFetch(origin + "/robots.txt", 6_000, 100_000);
  if (!txt) return true; // no robots file → allowed
  let inStar = false;
  let disallowAll = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    const low = line.toLowerCase();
    if (low.startsWith("user-agent:")) {
      inStar = low.slice(11).trim() === "*";
    } else if (inStar && low.startsWith("disallow:")) {
      if (line.slice(line.indexOf(":") + 1).trim() === "/") disallowAll = true;
    }
  }
  return !disallowAll;
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?)$/i;
const EMAIL_DOMAIN_BLOCK = [
  "example.com", "example.org", "domain.com", "email.com", "yourdomain.com",
  "sentry.io", "wixpress.com", "wix.com", "squarespace.com", "godaddy.com",
  "schema.org", "w3.org", "sentry-next.wixpress.com",
];

function cleanEmails(raw: string[]): string[] {
  const out = new Set<string>();
  for (const e0 of raw) {
    const e = e0.toLowerCase().trim();
    if (ASSET_EXT.test(e)) continue;
    const domain = e.split("@")[1] || "";
    if (!domain || EMAIL_DOMAIN_BLOCK.some((b) => domain === b || domain.endsWith("." + b))) continue;
    if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(domain)) continue;
    out.add(e);
  }
  return Array.from(out);
}

function extractEmails(html: string): string[] {
  const fromMailto = Array.from(html.matchAll(/mailto:([^"'?>\s]+)/gi)).map((m) => decodeURIComponent(m[1]));
  const fromText = html.match(EMAIL_RE) || [];
  return cleanEmails([...fromMailto, ...fromText]);
}

function extractPhones(html: string): string[] {
  const out = new Set<string>();
  for (const m of Array.from(html.matchAll(/tel:([+0-9().\-\s]{6,})/gi))) {
    const plus = m[1].trim().startsWith("+") ? "+" : "";
    const digits = m[1].replace(/[^0-9]/g, "");
    if (digits.length >= 7) out.add(plus + digits);
  }
  return Array.from(out);
}

function firstMatch(html: string, re: RegExp, exclude: string[] = []): string | undefined {
  for (const m of Array.from(html.matchAll(re))) {
    const url = m[0].replace(/["'<>].*$/, "");
    if (exclude.some((x) => url.toLowerCase().includes(x))) continue;
    return url.startsWith("http") ? url : "https://" + url;
  }
  return undefined;
}

function extractSocials(html: string): ScrapeResult["socials"] {
  return {
    facebook: firstMatch(html, /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[A-Za-z0-9_.\-/]+/gi, ["sharer", "plugins", "/tr", "intent", "dialog"]),
    instagram: firstMatch(html, /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9_.\-/]+/gi, ["/p/", "/explore", "/accounts"]),
    linkedin: firstMatch(html, /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in|school)\/[A-Za-z0-9_.\-/]+/gi, ["sharearticle", "sharearticle", "/sharing"]),
    twitter: firstMatch(html, /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+/gi, ["intent", "share", "hashtag", "/home", "/search"]),
  };
}

const SIGNAL_KEYWORDS = ["family", "family-owned", "since 19", "since 20", "award", "organic", "artisan", "local", "handmade", "vegan", "specialty", "boutique"];

function extractSignals(html: string): { title?: string; description?: string; signals?: string } {
  const title = (html.match(/<title[^>]*>([^<]{1,160})<\/title>/i)?.[1] || "").trim() || undefined;
  const description = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{1,300})["']/i)?.[1] || "").trim() || undefined;
  const lower = html.toLowerCase();
  const hits = SIGNAL_KEYWORDS.filter((k) => lower.includes(k));
  const parts = [title, description, hits.length ? `signals: ${hits.join(", ")}` : ""].filter(Boolean);
  const signals = parts.join(" — ").slice(0, 500) || undefined;
  return { title, description, signals };
}

export async function scrapeWebsite(website: string): Promise<ScrapeResult> {
  const start = normalizeUrl(website);
  if (!start) return { status: "no_site", emails: [], phones: [], socials: {} };
  const origin = new URL(start).origin;

  if (!(await robotsAllows(origin))) {
    return { status: "blocked", url: start, emails: [], phones: [], socials: {}, error: "robots.txt disallows crawling" };
  }

  const home = await politeFetch(start);
  if (home === null) return { status: "failed", url: start, emails: [], phones: [], socials: {}, error: "could not fetch homepage" };

  let emails = extractEmails(home);
  const phones = extractPhones(home);
  const socials = extractSocials(home);
  const { title, description, signals } = extractSignals(home);

  // If the homepage had no email, try a couple of likely contact pages (politely capped).
  if (emails.length === 0) {
    for (const path of ["/contact", "/contact-us"]) {
      const page = await politeFetch(origin + path, 10_000);
      if (page) {
        emails = extractEmails(page);
        const p2 = extractPhones(page);
        for (const p of p2) if (!phones.includes(p)) phones.push(p);
      }
      if (emails.length > 0) break;
    }
  }

  return { status: "ok", url: start, emails, phones, socials, title, description, signals };
}
