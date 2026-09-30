import type { NextFunction, Request, Response } from "express";
import { config } from "./config";

/**
 * R1-T4 phase E — other websites cannot make a signed-in browser act, and only the site's own origin
 * may read its answers (owner decisions 2026-09-29 and 2026-09-30,
 * docs/PLAN-2026-09-29-r1-t4-phase-e-sessions.md §2.2–2.3).
 *
 * A sign-in is a cookie the browser sends by itself, so a change (POST, PUT, PATCH, DELETE) is refused
 * before anything else when its Origin is not the site's own (`null` included), or, with no Origin,
 * when Sec-Fetch-Site says another site sent it. The one way through is CROSS_SITE_CALLBACKS below.
 * A request with neither header comes from a server (a provider, the scheduler, the ecommerce API) and
 * is treated as before; a change on a cookie session still needs the page's CSRF token
 * (server/auth.ts).
 *
 * CORS: the site's own origin, exactly, gets `Access-Control-Allow-Origin` with credentials, and its
 * preflights are answered here; any other origin gets no CORS header and its preflight is refused. No
 * answer says `*` or names an origin because it was sent.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CORS_ALLOWED_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE";
export const CORS_ALLOWED_HEADERS = "Content-Type, X-CSRF-Token";
const PREFLIGHT_MAX_AGE_SECONDS = 600;

export interface CrossSiteCallback {
  method: string;
  path: string;
  /** The other sites' exact origins; "any" only for a route that changes nothing. */
  origins: readonly string[] | "any";
  why: string;
}

/**
 * Callbacks that legitimately arrive from another site, by exact method and path. Sign in with Apple
 * (R1-T5) will add Apple's form post.
 */
export const CROSS_SITE_CALLBACKS: readonly CrossSiteCallback[] = [
  {
    method: "POST",
    path: "/api/billing/card/callback",
    origins: "any",
    why:
      "Windcave's card capture may send the browser back with a form post (and a page with no referrer sends Origin: null); " +
      "the route changes nothing: it only redirects to billing settings with one of four fixed words",
  },
];

/** The site's own origins: PUBLIC_ORIGIN; in development without one, the address the request came to. */
export function siteOrigins(req: Request): string[] {
  if (config.publicOrigin) return [new URL(config.publicOrigin).origin];
  const host = req.headers.host;
  return host ? [`${req.protocol}://${host}`] : [];
}

function listedCallback(req: Request, origin: string | null): boolean {
  return CROSS_SITE_CALLBACKS.some((callback) =>
    callback.method === req.method &&
    callback.path === req.path &&
    (callback.origins === "any" || (origin !== null && callback.origins.includes(origin))));
}

function refuse(res: Response) {
  return res.status(403).json({
    code: "CROSS_SITE_REJECTED",
    message: "This request came from another website, so it was refused.",
  });
}

export function crossSiteGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const preflight = req.method === "OPTIONS" && req.headers["access-control-request-method"] !== undefined;
    const change = !SAFE_METHODS.has(req.method);

    if (typeof origin === "string") {
      res.vary("Origin");
      if (siteOrigins(req).includes(origin)) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Access-Control-Allow-Credentials", "true");
        if (preflight) {
          res.set("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
          res.set("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
          res.set("Access-Control-Max-Age", String(PREFLIGHT_MAX_AGE_SECONDS));
          return res.status(204).end();
        }
        return next();
      }
      if (preflight) return refuse(res);
      if (change && !listedCallback(req, origin)) return refuse(res);
      return next();
    }

    if (change) {
      const site = req.headers["sec-fetch-site"];
      if ((site === "cross-site" || site === "same-site") && !listedCallback(req, null)) return refuse(res);
    }
    return next();
  };
}
