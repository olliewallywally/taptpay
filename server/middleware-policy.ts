/**
 * R1-T2 (C10) — policy for every middleware registration (`app.use`) on the
 * app production serves, per registration file, in registration order.
 *
 * route-policy-inventory.test.ts compares this with a fresh AST read of each
 * file (server/route-inventory.ts, middlewarePolicyDiff): a middleware or a
 * mounted router added without an entry here, a listed one removed, or one
 * moved fails the test. The same test compares the app the server tests build
 * (server/app.ts, then server/routes.ts, then the error handler) with the
 * `runtimeName`s below, layer by layer.
 *
 * Routes (`app.get` … `app.all`) are policed separately, in route-policy.ts.
 * Hand-written: there are few of these and each needs a sentence, not a
 * heuristic.
 */
import type { RegistrationFile } from "./route-inventory";

export interface MiddlewarePolicyEntry {
  /** The mount path, or null for every path. */
  path: string | null;
  /** What is mounted, as the inventory names it (see MiddlewareUse.mounts). */
  mounts: string;
  /** Whether this registration runs in every environment or only in one. */
  when: "always" | "development" | "production";
  /**
   * The layer's name on the running app's stack, for the registrations the
   * server tests' app includes (the pipeline and the error handler).
   */
  runtimeName?: string;
  purpose: string;
  security: string;
}

export const MIDDLEWARE_POLICY: Record<RegistrationFile, readonly MiddlewarePolicyEntry[]> = {
  "server/app.ts": [
    {
      path: null,
      mounts: "helmet(…)",
      when: "always",
      runtimeName: "helmetMiddleware",
      purpose: "Security headers on every response.",
      security:
        "Content-Security-Policy, frame denial and HSTS in production only (off in development for the Replit webview); " +
        "nosniff, no X-Powered-By, strict-origin-when-cross-origin referrers and no DNS prefetch everywhere.",
    },
    {
      path: null,
      mounts: "compression(…)",
      when: "always",
      runtimeName: "compression",
      purpose: "Gzip for responses of 1 KB or more.",
      security:
        "Never an event stream (text/event-stream): compressing one held every live update back until the " +
        "R1-T1 audit (3fac8ac8).",
    },
    {
      path: null,
      mounts: "inline function",
      when: "always",
      runtimeName: "<anonymous>",
      purpose: "No caching and no referrer for bearer-addressed pages.",
      security:
        "/accept-invite, /pay|split|checkout|receipt/t/…, /pay/return/… and /api/pay/t|return/… get " +
        "Cache-Control: private, no-store and Referrer-Policy: no-referrer, so a link's token never reaches " +
        "a shared cache or another site's referrer. Runs before the routes and the static/Vite serving.",
    },
    {
      path: null,
      mounts: "inline function",
      when: "always",
      runtimeName: "<anonymous>",
      purpose: "JSON request bodies, except on /api/windcave/notification and /api/board-builder/submit.",
      security:
        "express.json() with its default 100 KB limit. The Windcave notification route parses its own " +
        "(urlencoded and JSON) and trusts none of it: it only re-queries the provider. The board builder's " +
        "Send to Print parses its own, up to 3 MB, only after authenticateToken (server/board-print.ts), so " +
        "no one signed out can make the server read a large body.",
    },
    {
      path: null,
      mounts: "express.urlencoded(…)",
      when: "always",
      runtimeName: "urlencodedParser",
      purpose: "Form-encoded request bodies (extended: false, default 100 KB limit).",
      security: "Flat key/value pairs only; no nested objects from a form body.",
    },
    {
      path: null,
      mounts: "createRequestLogger(…)",
      when: "always",
      runtimeName: "<anonymous>",
      purpose: "One log line per /api request: method, route template, status, duration.",
      security:
        "Logs the route template (e.g. /api/pay/t/:token), never the path's values, the query or the body; " +
        "server/request-log.ts redacts tokens, return states and session ids from any path it must print.",
    },
    {
      path: null,
      mounts: "crossSiteGuard(…)",
      when: "always",
      runtimeName: "<anonymous>",
      purpose:
        "R1-T4 phase E: refuses a change sent from another website before any route runs, and answers CORS " +
        "for the site's own origin only (server/cross-site.ts).",
      security:
        "A POST, PUT, PATCH or DELETE whose Origin is not the site's own (null included), or with no Origin " +
        "whose Sec-Fetch-Site is cross-site or same-site, is 403 CROSS_SITE_REJECTED, unless it is on the " +
        "named list of callbacks (today only the billing card return, which changes nothing). Only the exact " +
        "site origin gets Access-Control-Allow-Origin, with credentials; other preflights are 403 with no " +
        "CORS headers; nothing answers *. Requests with neither header (servers) pass as before.",
    },
  ],
  "server/routes.ts": [],
  "server/index.ts": [
    {
      path: null,
      mounts: "createGlobalErrorHandler(…)",
      when: "always",
      runtimeName: "<anonymous>",
      purpose: "Answers an error thrown by any route (or rejected by an async one) instead of leaving it hanging.",
      security:
        "Logs the error server-side and answers { message } from publicErrorMessage(): a fixed message for a " +
        "5xx, never a stack. Registered before the two entries below and the Vite/static serving, so an error " +
        "there reaches Express's default handler instead, which prints no stack when NODE_ENV=production " +
        "(npm start).",
    },
    {
      path: null,
      mounts: "inline function",
      when: "always",
      purpose: "Search-engine crawlers asking for / get the page with its title and description filled in.",
      security:
        "GET / only, chosen by User-Agent; fixed text substituted into client/index.html, nothing from the " +
        "request. Everyone else falls through to the app.",
    },
  ],
  "server/vite.ts": [
    {
      path: null,
      mounts: "vite.middlewares",
      when: "development",
      purpose: "Serves the client's source through Vite, with hot reload.",
      security: "APP_ENV=development only (server/index.ts); production serves the built files below.",
    },
    {
      path: "*",
      mounts: "inline function",
      when: "development",
      purpose: "Any other path gets the client's index.html, so the app's own router takes it.",
      security: "Development only. Reads client/index.html from disk; nothing from the request goes into it.",
    },
    {
      path: null,
      mounts: "express.static(…)",
      when: "production",
      purpose: "Serves the built client (server/public).",
      security: "Files under the build directory only; express.static refuses paths that climb out of it.",
    },
    {
      path: "*",
      mounts: "inline function",
      when: "production",
      purpose: "Any other path gets the built index.html, so the app's own router takes it.",
      security: "Always the same file; unknown /api paths get the app's page, not data.",
    },
  ],
};
