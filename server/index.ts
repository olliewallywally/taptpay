import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedDatabase } from "./seed";
import { isDatabaseConnected } from "./database";
import { 
  startServerWithPortManagement, 
  setupGracefulShutdown, 
  getPortConflictHelp 
} from "./port-manager";

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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://pay.google.com", "https://applepay.cdn-apple.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://uat.windcave.com", "https://sec.windcave.com", "https://pay.google.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://sec.windcave.com", "https://uat.windcave.com"],
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
}));

// Skip JSON parsing for webhook routes to preserve raw body for signature verification
app.use((req, res, next) => {
  if (req.path === '/api/crypto-transactions/webhook/coinbase' || req.path === '/api/windcave/notification') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate JWT_SECRET is set (allow development fallback)
  if (!process.env.JWT_SECRET) {
    console.warn('⚠️  WARNING: JWT_SECRET environment variable is not set. Using development fallback.');
    process.env.JWT_SECRET = 'dev-secret-key-change-in-production';
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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
})();
