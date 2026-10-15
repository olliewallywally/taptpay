// R2-T2 (plan v2.2 §9.2): exact validation of every Windcave link and of the
// addresses TaptPay asks Windcave to call back. Parsed with URL, never matched as a
// substring. Relations and paths follow Windcave's public REST and Hosted Fields
// pages; anything else is rejected rather than guessed at.
import type { PaymentMode } from "./config";

export type WindcaveLinkRelation =
  | "self"
  | "hpp"
  | "seamless_hpp"
  | "submitCard"
  | "ajaxSubmitCard"
  | "ajaxSubmitApplePay"
  | "ajaxSubmitGooglePay";

const RELATION_PATH: Readonly<Record<WindcaveLinkRelation, string>> = Object.freeze({
  self: "/api/v1/sessions/",
  hpp: "/pxmi3/",
  seamless_hpp: "/pxmi3/",
  submitCard: "/pxmi3/",
  ajaxSubmitCard: "/mh/",
  ajaxSubmitApplePay: "/mh/",
  ajaxSubmitGooglePay: "/mh/",
});

const MODE_HOST: Readonly<Partial<Record<PaymentMode, string>>> = Object.freeze({
  uat: "uat.windcave.com",
  production: "sec.windcave.com",
});

/** The relations the payment pages use; the others are validated but not handed out. */
const SELECTED: readonly WindcaveLinkRelation[] = ["hpp", "ajaxSubmitCard", "ajaxSubmitApplePay", "ajaxSubmitGooglePay"];

// One opaque token segment: no further slashes, dots-only segments or encoded separators.
const TOKEN = /^[A-Za-z0-9_-]+$/;

export type LinkCheck = { ok: true; href: string } | { ok: false; reason: string };

export function validateWindcaveLink(href: unknown, relation: WindcaveLinkRelation, mode: PaymentMode): LinkCheck {
  const prefix = Object.prototype.hasOwnProperty.call(RELATION_PATH, relation) ? RELATION_PATH[relation] : undefined;
  if (!prefix) return { ok: false, reason: "relation" };
  const host = MODE_HOST[mode];
  if (!host) return { ok: false, reason: "mode" };
  // URL forgives leading/trailing spaces and backslashes; a provider link has neither.
  if (typeof href !== "string" || href.length === 0 || /[\s\\]/.test(href)) return { ok: false, reason: "form" };
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { ok: false, reason: "form" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "protocol" };
  if (url.username || url.password) return { ok: false, reason: "userinfo" };
  if (url.hostname !== host) return { ok: false, reason: "host" };
  if (url.port !== "") return { ok: false, reason: "port" };
  if (url.search || url.hash || href.includes("#") || href.includes("?")) return { ok: false, reason: "query" };
  if (!url.pathname.startsWith(prefix)) return { ok: false, reason: "path" };
  if (!TOKEN.test(url.pathname.slice(prefix.length))) return { ok: false, reason: "path" };
  // Only a link that is already in its canonical form is handed on unchanged.
  if (url.href !== href) return { ok: false, reason: "form" };
  return { ok: true, href };
}

export interface SessionLinks {
  hpp?: string;
  ajaxSubmitCard?: string;
  ajaxSubmitApplePay?: string;
  ajaxSubmitGooglePay?: string;
}

/**
 * The links the payment pages may use, each taken only from its own relation and only
 * when valid for the mode. A relation given more than once is ambiguous and dropped.
 * `rejected` counts invalid or ambiguous links among the selected relations.
 */
export function selectSessionLinks(
  links: ReadonlyArray<{ rel: string; href: string; method?: string }>,
  mode: PaymentMode,
): { links: SessionLinks; rejected: number } {
  const selected: SessionLinks = {};
  let rejected = 0;
  for (const relation of SELECTED) {
    const matches = links.filter((link) => link.rel === relation);
    if (matches.length === 0) continue;
    if (matches.length > 1) {
      rejected += matches.length;
      continue;
    }
    const check = validateWindcaveLink(matches[0].href, relation, mode);
    if (check.ok) selected[relation as keyof SessionLinks] = check.href;
    else rejected += 1;
  }
  return { links: selected, rejected };
}

/**
 * A callback or notification address TaptPay sends to Windcave: https on exactly the
 * configured PUBLIC_ORIGIN, no userinfo or fragment. A callback base must already
 * carry a query, because the provider result is appended with `&result=`.
 */
export function validateCallbackAddress(
  address: string,
  publicOrigin: string | undefined,
  { needsQuery }: { needsQuery: boolean },
): boolean {
  if (!publicOrigin || typeof address !== "string" || /[\s\\]/.test(address)) return false;
  let url: URL;
  let origin: URL;
  try {
    url = new URL(address);
    origin = new URL(publicOrigin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || address.includes("#")) return false;
  if (url.origin !== origin.origin) return false;
  return needsQuery ? url.search.length > 1 : true;
}

/** Which Windcave script host the payment pages load: production only in production mode. */
export function windcaveScriptEnv(mode: PaymentMode): "uat" | "sec" {
  return mode === "production" ? "sec" : "uat";
}
