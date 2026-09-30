import express, { type Express } from "express";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config";
import { createRequestLogger } from "./request-log";
import { BOARD_PRINT_PATH } from "./board-print";
import { crossSiteGuard } from "./cross-site";

/**
 * The HTTP pipeline every request passes through before the routes: security
 * headers, compression, no-store for bearer-addressed pages, body parsing, the
 * request log and the cross-site guard.
 *
 * server/index.ts serves this app; the server test harness
 * (server/__tests__/support/http-harness.ts) builds the very same one, so tests
 * see production's headers and log lines (R1-T1). Nothing here listens,
 * touches the database, loads Vite or starts a timer, and the log writer is
 * passed in so this module never imports Vite for it.
 */
export function createApp(options: { writeRequestLog: (line: string) => void }): Express {
  const app = express();

  // ============================================
  // SECURITY HEADERS - Payment Processor Grade
  // ============================================
  const isProduction = config.isProduction;

  // Security headers - CSP enabled in production, disabled in dev for Replit webview compatibility
  app.use(helmet({
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://pay.google.com", "https://applepay.cdn-apple.com", "https://uat.windcave.com", "https://sec.windcave.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https://uat.windcave.com", "https://sec.windcave.com", "https://pay.google.com"],
        frameSrc: ["'self'", "https://sec.windcave.com", "https://uat.windcave.com", "https://pay.google.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    } : false,
    frameguard: isProduction ? { action: 'deny' } : false,
    hidePoweredBy: true,
    hsts: isProduction ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    dnsPrefetchControl: { allow: false },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }));

  // Gzip compression for all responses — skips already-compressed assets and
  // very small payloads (< 1 KB) where compression overhead outweighs savings.
  // Never a live event stream: the compressor would hold each event until it
  // had enough bytes to squeeze, so no browser (they all accept compression)
  // received live updates from 2026-04-07 until the R1-T1 audit found it.
  app.use(compression({
    threshold: 1024,
    filter: (req, res) =>
      !String(res.getHeader("Content-Type") ?? "").startsWith("text/event-stream") &&
      compression.filter(req, res),
  }));

  // Bearer-addressed payment pages must not leak their URL through browser
  // referrers or shared caches. This runs before Vite/static fallback, so the HTML
  // document receives the policy before any checkout script is loaded.
  app.use((req, res, next) => {
    if (
      req.path === "/accept-invite" ||
      /^\/(?:pay|split|checkout|receipt)\/t\//.test(req.path) ||
      /^\/pay\/return\//.test(req.path) ||
      /^\/api\/pay\/(?:t|return)\//.test(req.path)
    ) {
      res.set({
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        "Referrer-Policy": "no-referrer",
      });
    }
    next();
  });

  // Skip JSON parsing for webhook routes to preserve raw body for signature verification,
  // and for the board builder's Send to Print, which parses its own larger body only once the
  // sign-in is checked (server/board-print.ts; owner decision 2026-09-26).
  app.use((req, res, next) => {
    if (req.path === '/api/windcave/notification' || req.path === BOARD_PRINT_PATH) {
      next();
    } else {
      express.json()(req, res, next);
    }
  });

  app.use(express.urlencoded({ extended: false }));

  app.use(createRequestLogger(options.writeRequestLog));

  // R1-T4 phase E: a change sent from another website is refused before any route runs, and only
  // the site's own origin gets CORS headers (server/cross-site.ts). After the request log, so a
  // refusal is logged like any other answer.
  app.use(crossSiteGuard());

  return app;
}
