import {logOperation} from "./structured-log";
import {safeErrorSummary} from "./log-redaction";
import { config } from "./config";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createApp } from "./app";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { seedDatabase } from "./seed";
import { isDatabaseConnected, getDb } from "./database";
import { sql } from "drizzle-orm";
import { 
  startServerWithPortManagement, 
  setupGracefulShutdown
} from "./port-manager";
import { createGlobalErrorHandler } from "./http-error-handler";
import {getPaymentRuntime} from './payment-runtime-default';
import {startPaymentReconciliationLoop} from './payment-runtime';
import {getSubscriptionPaymentRuntime,startSubscriptionPaymentLoop} from './subscription-payment-runtime';
import {createPaymentDeliveryRuntime,startPaymentDeliveryLoop} from './payment-delivery-runtime';

const isProduction = config.isProduction;

// Security headers, compression, bearer-page caching, body parsing and the
// request log: the same app the server tests build (server/app.ts).
const app = createApp({ writeRequestLog: line => console.log(line) });

(async () => {
  for (const diagnostic of config.diagnostics) {
    logOperation('warn',`config_${diagnostic.key}`);
  }

  // ── Database connectivity verification ───────────────────────────────────
  // isDatabaseConnected() only checks that the Neon client was initialised.
  // Do a real query here to confirm the database is actually reachable before
  // accepting any traffic. Fail fast in production; warn only in development.
  if (isDatabaseConnected()) {
    try {
      const db = getDb();
      await db!.execute(sql`SELECT 1`);
      logOperation("info","DATABASE_CONNECTION_VERIFIED_LIVE_QUERY_SUCCEEDED",{payload:['✅ Database: connection verified (live query succeeded)']});
    } catch (error) {
      if (isProduction) {
        logOperation("error","FATAL_DATABASE_IS_UNREACHABLE_AFTER_CONNECTION_WAS_ESTABLISHED",{payload:['FATAL: Database is unreachable after connection was established:']});
        logOperation("error","RUNTIME_DIAGNOSTIC",{payload:[error]});
        logOperation("error","REFUSING_TO_START_MERCHANT_DATA_CANNOT_BE_READ_OR_WRITTEN",{payload:['Refusing to start — merchant data cannot be read or written.']});
        process.exit(1);
      } else {
        logOperation("warn","DATABASE_LIVE_QUERY_CHECK_FAILED_CONTINUING_IN_DEV_MODE",{payload:['⚠️  Database live-query check failed (continuing in dev mode):',error]});
      }
    }
  }

  // Admin sign-in refuses everyone without ADMIN_PASSWORD_HASH: say so where it shows.
  if (config.admin.email && !config.admin.passwordHash) {
    logOperation("warn","ADMIN_SIGN_IN_IS_OFF_ADMIN_PASSWORD_HASH_IS_NOT_SET_RUN_NPM_RUN_",{payload:['⚠️  Admin sign-in is off: ADMIN_PASSWORD_HASH is not set. Run `npm run admin:password` in the Shell to make one.']});
  }

  // ── Read-only migration gate ─────────────────────────────────────────────
  // Production must never accept traffic against pending, drifted, orphaned,
  // or out-of-order schema history. Development reports the same issues loudly.
  try {
    const { reportPendingMigrations } = await import("./migrate");
    await reportPendingMigrations({ failOnIssues: isProduction,
      log:()=>logOperation('warn','migration_gate_diagnostic') });
  } catch (error) {
    if (isProduction) {
      logOperation("error","FATAL_DATABASE_MIGRATION_GATE_FAILED",{payload:["[FATAL] Database migration gate failed."]});
      logOperation("error","RUNTIME_DIAGNOSTIC",{payload:[error]});
      process.exit(1);
    }
    logOperation('warn','migration_check_unavailable',safeErrorSummary(error));
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
  if (config.retiredRunMigrations) {
    logOperation("error","FATAL_RUN_MIGRATIONS_IS_RETIRED_RUN_NPM_RUN_DB_MIGRATE_AS_A_DELI",{payload:['[FATAL] RUN_MIGRATIONS is retired; run `npm run db:migrate` as a deliberate deploy step.']});
    process.exit(1);
  }
  const runSchemaPush = config.runSchemaPush;
  if (isDatabaseConnected() && runSchemaPush) {
    logOperation('info','schema_push_started');
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
          }
        );
        if (push.status === 0) {
          logOperation('info','schema_push_succeeded');
        } else {
          // Non-zero exit most likely means a destructive change was blocked.
          // The server continues safely — no data was modified.
          logOperation('warn','schema_push_failed',{exitStatus:push.status});
        }
      } else {
        logOperation('warn','schema_push_config_missing');
      }
    } catch (err) {
      logOperation('warn','schema_push_failed',safeErrorSummary(err));
    }
  }


  const server = await registerRoutes(app);
  // Cash/manual command delivery also runs while provider querying is paused.
  if(isDatabaseConnected()){
    const delivery=createPaymentDeliveryRuntime();if(delivery)server.once('close',startPaymentDeliveryLoop(delivery));
  }
  // Reconciliation has its own reviewed switch; initiation switches are never
  // consulted by the worker. Importing routes/tests starts no background work.
  if(config.features.providerReconciliation && isDatabaseConnected() && config.windcave.username && config.windcave.apiKey){
    const runtime=getPaymentRuntime();if(runtime){const stop=startPaymentReconciliationLoop(runtime);server.once('close',stop);}
    const subscription=getSubscriptionPaymentRuntime(runtime?.repository);
    if(subscription){const stop=startSubscriptionPaymentLoop(subscription);server.once('close',stop);}
  }

  // Demo data is an explicit development/test action. A requested seed failure
  // is fatal instead of being hidden behind a warning.
  if (config.seedDemoData) {
    await seedDatabase();
  }

  // Sync verified merchants to recreate auth users
  try {
    const { syncVerifiedMerchants } = await import("./auth");
    await syncVerifiedMerchants();
  } catch (error) {
    logOperation('warn','verified_merchant_sync_failed',safeErrorSummary(error));
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
  if (config.appEnv === "development") {
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
    logOperation('error','server_port_conflict',{port});
    process.exit(1);
  }

  logOperation('info','server_listening',{port});

  // Keep Neon database endpoint alive — ping every 4 minutes to prevent auto-suspension
  if (config.databaseUrl) {
    const { neon } = await import("@neondatabase/serverless");
    const keepAliveSql = neon(config.databaseUrl);
    setInterval(async () => {
      try {
        await keepAliveSql`SELECT 1`;
      } catch {
        // Silently ignore — server continues regardless
      }
    }, 4 * 60 * 1000);
    logOperation('info','database_keepalive_started',{intervalMs:240000});
  }
})();
