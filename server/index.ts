import express from "express";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import compression from "compression";
import { spawn, spawnSync } from "child_process";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedDatabase } from "./seed";
import { isDatabaseConnected, getDb } from "./database";
import { sql } from "drizzle-orm";
import { 
  startServerWithPortManagement, 
  setupGracefulShutdown, 
  getPortConflictHelp 
} from "./port-manager";
import { createRequestLogger } from "./request-log";
import { createGlobalErrorHandler } from "./http-error-handler";
import { registerLandingDemoRoutes } from "./landing-demo-routes";

const app = express();

// ============================================
// SECURITY HEADERS - Payment Processor Grade
// ============================================
const isProduction = process.env.NODE_ENV === 'production';

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

// The standalone landing demo is the only application document allowed inside
// a same-origin frame. Keep the normal app/payment documents on Helmet's DENY
// policy and replace the headers for this exact path only.
const LANDING_DEMO_DOCUMENT_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

app.use((req, res, next) => {
  if (req.path === "/landing-demo.html") {
    res.set({
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": LANDING_DEMO_DOCUMENT_CSP,
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    });
  }
  next();
});

// Gzip compression for all responses — skips already-compressed assets and
// very small payloads (< 1 KB) where compression overhead outweighs savings.
app.use(compression({ threshold: 1024 }));

// Development can exercise the isolated in-memory sandbox. Production is an
// autoscale deployment without proven sticky routing, so mounting the Map-backed
// service there would strand sessions across instances. Keep it fail-closed
// until the deployment-store gate in the landing plan is resolved.
if (!isProduction) {
  registerLandingDemoRoutes(app);
}

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

// Skip JSON parsing for webhook routes to preserve raw body for signature verification
app.use((req, res, next) => {
  if (
    req.path === '/api/windcave/notification' ||
    req.path === '/api/landing-demo' ||
    req.path.startsWith('/api/landing-demo/')
  ) {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: false }));

app.use(createRequestLogger(log));

(async () => {
  // ── JWT_SECRET validation ────────────────────────────────────────────────
  if (!process.env.JWT_SECRET) {
    if (isProduction) {
      console.error('');
      console.error('[FATAL] JWT_SECRET is NOT set in production.');
      console.error('  Set JWT_SECRET in your deployment secrets to a strong random value.');
      console.error('  Refusing to start — running without JWT_SECRET in production is insecure.');
      console.error('');
      process.exit(1);
    } else {
      console.warn('⚠️  JWT_SECRET not set — using development fallback (acceptable in dev only).');
      process.env.JWT_SECRET = 'dev-secret-key-change-in-production';
    }
  } else {
    console.log('✅ JWT_SECRET: configured');
  }

  // ── Database connectivity verification ───────────────────────────────────
  // isDatabaseConnected() only checks that the Neon client was initialised.
  // Do a real query here to confirm the database is actually reachable before
  // accepting any traffic. Fail fast in production; warn only in development.
  if (isDatabaseConnected()) {
    try {
      const db = getDb();
      await db!.execute(sql`SELECT 1`);
      console.log('✅ Database: connection verified (live query succeeded)');
    } catch (error) {
      if (isProduction) {
        console.error('FATAL: Database is unreachable after connection was established:');
        console.error(error);
        console.error('Refusing to start — merchant data cannot be read or written.');
        process.exit(1);
      } else {
        console.warn('⚠️  Database live-query check failed (continuing in dev mode):', error);
      }
    }
  }

  // ── Read-only migration gate ─────────────────────────────────────────────
  // Production must never accept traffic against pending, drifted, orphaned,
  // or out-of-order schema history. Development reports the same issues loudly.
  try {
    const { reportPendingMigrations } = await import("./migrate");
    await reportPendingMigrations({ failOnIssues: isProduction });
  } catch (error) {
    if (isProduction) {
      console.error("[FATAL] Database migration gate failed.");
      console.error(error);
      process.exit(1);
    }
    log(`⚠️  Migration check unavailable (non-fatal in development): ${error}`);
  }

  // ── Schema push (drizzle-kit push) ───────────────────────────────────────
  // Never run schema sync as a normal app-start side effect. The trades branch
  // must use reviewed additive SQL, and drizzle-kit push can propose destructive
  // live-DB changes. Opt in only for a deliberate, supervised run.
  //
  // DATA SAFETY: --force is intentionally omitted. Without --force, drizzle-kit
  // refuses to apply destructive changes (column drops, table drops) and returns
  // a non-zero exit code instead of silently destroying live data. If you need
  // to apply schema changes, run `npm run db:push` manually after reviewing
  // exactly what will be changed, or start with RUN_SCHEMA_PUSH=true.
  if (process.env.RUN_MIGRATIONS === 'true') {
    console.error('[FATAL] RUN_MIGRATIONS is retired; run `npm run db:migrate` as a deliberate deploy step.');
    process.exit(1);
  }
  const runSchemaPush = process.env.RUN_SCHEMA_PUSH === 'true';
  if (isDatabaseConnected() && runSchemaPush) {
    log('Running schema push to sync database...');
    try {
      const drizzleConfigPath = path.resolve(process.cwd(), 'drizzle.config.ts');
      const configExists = fs.existsSync(drizzleConfigPath);
      if (configExists) {
        const push = spawnSync(
          'npx',
          ['drizzle-kit', 'push', `--config=${drizzleConfigPath}`],
          {
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 30_000,
            env: { ...process.env },
          }
        );
        if (push.status === 0) {
          log('✅ Schema: database schema is up to date');
        } else {
          const output = (push.stdout || '') + (push.stderr || '');
          // Non-zero exit most likely means a destructive change was blocked.
          // The server continues safely — no data was modified.
          log(`⚠️  Schema has destructive changes — run \`npm run db:push\` manually to review before applying. Data untouched. Details: ${output.slice(0, 200)}`);
        }
      } else {
        log('⚠️  drizzle.config.ts not found at project root — skipping schema push');
      }
    } catch (err) {
      log(`⚠️  Schema push threw an error (non-fatal): ${err}`);
    }
  }


  const server = await registerRoutes(app);

  // Initialize database with seed data if connected
  if (isDatabaseConnected()) {
    try {
      await seedDatabase();
    } catch (error) {
      log(`⚠️ Database seeding failed: ${error}`);
    }
  }

  // Sync verified merchants to recreate auth users
  try {
    const { syncVerifiedMerchants } = await import("./auth");
    await syncVerifiedMerchants();
  } catch (error) {
    log(`⚠️ Failed to sync verified merchants: ${error}`);
  }


  // Dev-only automatic DB backups: snapshot both databases (workspace helium +
  // production Neon) on every boot and then daily, via pg_dump into db-backups/.
  // Runs in the workspace only — the deployed container has no pg_dump and its
  // filesystem is ephemeral, so backups there would be pointless.
  if (process.env.NODE_ENV !== 'production') {
    const backupScript = path.resolve(process.cwd(), 'scripts', 'db-backup.sh');
    if (fs.existsSync(backupScript)) {
      const runBackup = () => {
        try {
          const child = spawn('bash', [backupScript], { stdio: 'ignore', detached: true });
          child.unref();
        } catch (err) {
          log(`⚠️ DB backup failed to start: ${err}`);
        }
      };
      runBackup();
      setInterval(runBackup, 24 * 60 * 60 * 1000).unref();
      log("✅ DB backups: snapshot on boot + daily (db-backups/)");
    }
  }


  app.use(createGlobalErrorHandler());


  const CRAWLER_UA_PATTERN = /bot|crawl|spider|slurp|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegram|pinterest|googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot|ia_archiver|semrush|ahrefs|mj12bot/i;

  const SEO_META = {
    title: "TaptPay – Low Cost EFTPOS & POS System NZ | Digital Point of Sale",
    description: "New Zealand's lowest-cost EFTPOS alternative and digital POS system. No hardware, no lock-in contracts. Accept QR code and NFC contactless payments instantly. Perfect POS solution for small business NZ. 100% Kiwi owned.",
    ogTitle: "TaptPay – NZ's Lowest-Cost EFTPOS & POS System | No Hardware Required",
    ogDescription: "Ditch the EFTPOS machine. TaptPay is New Zealand's 100% digital POS system — accept contactless payments via QR code and NFC with no hardware and no lock-in contracts.",
    canonical: "https://taptpay.com/",
    ogImage: "https://taptpay.com/og-image.png",
    keywords: "EFTPOS NZ, POS system NZ, digital POS, POS solutions, low cost POS system, point of sale New Zealand, cheap EFTPOS machine, cloud POS NZ, small business POS NZ, contactless payments NZ, mobile POS NZ, QR code payments, NFC payments, EFTPOS alternative, payment terminal NZ",
  };

  app.use((req, res, next) => {
    const ua = req.headers["user-agent"] || "";
    if (req.path === "/" && CRAWLER_UA_PATTERN.test(ua)) {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );
      let html = fs.readFileSync(clientTemplate, "utf-8");
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${SEO_META.title}</title>`);
      html = html.replace(
        /<meta name="description" content="[^"]*"/,
        `<meta name="description" content="${SEO_META.description}"`
      );
      html = html.replace(
        /<meta name="keywords" content="[^"]*"/,
        `<meta name="keywords" content="${SEO_META.keywords}"`
      );
      html = html.replace(
        /<link rel="canonical" href="[^"]*"/,
        `<link rel="canonical" href="${SEO_META.canonical}"`
      );
      html = html.replace(
        /<meta property="og:title" content="[^"]*"/,
        `<meta property="og:title" content="${SEO_META.ogTitle}"`
      );
      html = html.replace(
        /<meta property="og:description" content="[^"]*"/,
        `<meta property="og:description" content="${SEO_META.ogDescription}"`
      );
      html = html.replace(
        /<meta property="og:url" content="[^"]*"/,
        `<meta property="og:url" content="${SEO_META.canonical}"`
      );
      html = html.replace(
        /<meta property="og:image" content="[^"]*"/,
        `<meta property="og:image" content="${SEO_META.ogImage}"`
      );
      return res.status(200).set({ "Content-Type": "text/html" }).end(html);
    }
    next();
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  const host = "0.0.0.0";

  // Setup graceful shutdown handling
  setupGracefulShutdown(server, port);

  // Start server with port management
  const serverStarted = await startServerWithPortManagement(server, port, host);
  
  if (!serverStarted) {
    log("❌ Failed to start server due to port conflicts");
    log(getPortConflictHelp(port));
    process.exit(1);
  }

  log(`✅ Server successfully running on ${host}:${port}`);

  // Keep Neon database endpoint alive — ping every 4 minutes to prevent auto-suspension
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const keepAliveSql = neon(process.env.DATABASE_URL);
    setInterval(async () => {
      try {
        await keepAliveSql`SELECT 1`;
      } catch {
        // Silently ignore — server continues regardless
      }
    }, 4 * 60 * 1000);
    log("✅ Database keep-alive ping started (every 4 minutes)");
  }
})();
