import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { uploadedFiles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { TUTORIAL_PAGE_KEYS, isTutorialPageKey } from "@shared/tutorial";
import { insertTransactionSchema, updateMerchantRatesSchema, updateMerchantDetailsSchema, updateThemeSchema, updateDailyGoalSchema, forgotPasswordSchema, resetPasswordSchema, createMerchantSchema, changePasswordSchema, createRefundSchema, insertRefundSchema, createTaptStoneSchema, createStockItemSchema, updateStockItemSchema, publicSignupSchema, businessDetailsSchema, createTenantProfileSchema, updateTenantProfileSchema, createActiveScheduleSchema, updateActiveScheduleSchema, createAdHocInvoiceSchema, markInvoicePaidExternalSchema, updateRentReminderSettingsSchema, createClientProfileSchema, updateClientProfileSchema, createQuoteSchema, acceptQuoteSchema, createJobInvoiceSchema, markJobPaidExternalSchema, createJobScheduleSchema, updateJobScheduleSchema, updateTradeReminderSettingsSchema, updateTradeGstSettingsSchema } from "@shared/schema";
import { windcaveService, isWindcaveConfigured, createWindcaveSession, queryWindcaveSession, createWindcaveRefund, simulateCreateSession, simulateQuerySession, simulateRentSession, getWindcaveEnv, submitGooglePayToken, createAttendedSession, submitTapToPayToken, simulateAttendedTapToPay } from "./windcave";
import { authenticateUser, generateToken, authenticateToken, createUser, requestPasswordReset, resetPassword, validateResetToken, JWT_SECRET, type AuthenticatedRequest, isAccountLocked, isIPRateLimited, recordFailedLogin, clearFailedAttempts, logSecurityEvent, syncVerifiedMerchants } from "./auth";
import { generateReceiptPdf } from "./pdf-generator";
import { generateQuotePdf } from "./trades-quote-pdf";
import { generateBusinessReportPdf } from "./report-generator";
import { computeQuoteTotals } from "@shared/trades-gst";
import { getBaseUrl, generatePaymentUrl, generateQrCodeUrl, generateStonePaymentUrl, generateNfcTagUrl } from "./url-utils";
import { sendEmail } from "./email-service";
import QRCode from "qrcode";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sendPushToMerchant } from "./push";
import { resendInvoiceEmail } from "./property-cron";
import { resendTradeInvoice, sendTradePaymentInvoice, sendTradeQuote } from "./trades-delivery";
import { sendGstInvoices, extractEmails } from "./gst-invoice";
import { BILLING_CARD_REQUIRED, billingCardIsReady, isCardExpiryValid, isLuhnValid } from "./billing-card";

// Store SSE connections for real-time updates (merchantId -> stoneId -> Set of connections)
// stoneId can be null for merchant-level connections
const sseConnections = new Map<number, Map<number | null, Set<any>>>();

// Guards against overlapping cron runs (see POST /api/internal/cron).
let cronRunning = false;

// ── Merchant response sanitizers ──────────────────────────────────────────
// getMerchant() returns the full row (SELECT *), which includes server-only
// secrets and financial PII. These must never reach a client. No client page
// reads any of these fields for display (bank/card are write-only onboarding
// form inputs; auth secrets/API keys are server-side only), so stripping them
// is non-breaking.
const MERCHANT_SECRET_FIELDS = [
  "passwordHash", "resetToken", "resetTokenExpiry", "verificationToken", "googleId",
  "windcaveApiKey",
] as const;
const MERCHANT_FINANCIAL_FIELDS = [
  "bankAccountNumber", "bankName", "bankBranch", "accountHolderName",
  "billingCardLast4", "billingCardBrand", "billingCardExpiry",
] as const;

// Strip auth secrets + payment-processor API keys. Safe for ANY merchant
// response (owner, admin, public) — nothing on the client consumes them.
function stripMerchantSecrets<T extends Record<string, any>>(m: T): T {
  if (!m || typeof m !== "object") return m;
  const out: Record<string, any> = { ...m };
  for (const f of MERCHANT_SECRET_FIELDS) delete out[f];
  return out as T;
}

// Public-facing merchant view: additionally drops bank/card financial PII.
// Used for the unauthenticated payment/receipt pages.
function publicMerchant<T extends Record<string, any>>(m: T): T {
  const out: Record<string, any> = stripMerchantSecrets(m);
  for (const f of MERCHANT_FINANCIAL_FIELDS) delete out[f];
  return out as T;
}

async function requireBillingCard(merchantId: number, res: any): Promise<boolean> {
  const merchant = await storage.getMerchant(merchantId);
  if (billingCardIsReady(merchant)) return true;
  res.status(402).json(BILLING_CARD_REQUIRED);
  return false;
}

// Server-side cache of Windcave AJAX submit URLs per transaction.
// Populated at session creation; consumed once at payment completion.
// Prevents SSRF by never accepting these URLs from client bodies.
const sessionAjaxUrlCache = new Map<number, {
  ajaxSubmitCardUrl?: string;
  ajaxSubmitApplePayUrl?: string;
  ajaxSubmitGooglePayUrl?: string;
}>();

// Same as sessionAjaxUrlCache but for the property rent/charge checkout, which is
// keyed by the invoice's public token rather than a numeric transaction id.
const invoiceAjaxUrlCache = new Map<string, {
  ajaxSubmitCardUrl?: string;
  ajaxSubmitApplePayUrl?: string;
  ajaxSubmitGooglePayUrl?: string;
}>();

// Validate that a URL belongs to a known Windcave domain before using it with auth headers.
function assertWindcaveUrl(url: string): void {
  const allowed = /^https:\/\/(?:uat|sec)\.windcave\.com\//;
  if (!allowed.test(url)) throw new Error(`Blocked non-Windcave URL: ${url}`);
}

// Rate limiting: Track requests per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute per IP

// Strict rate limit for email resend (5 per 10 minutes per IP/merchantId)
const resendRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RESEND_WINDOW = 10 * 60 * 1000;
const MAX_RESEND = 5;
function checkResendRateLimit(key: string): boolean {
  const now = Date.now();
  const record = resendRateLimitMap.get(key);
  if (!record || now > record.resetTime) {
    resendRateLimitMap.set(key, { count: 1, resetTime: now + RESEND_WINDOW });
    return true;
  }
  if (record.count >= MAX_RESEND) return false;
  record.count++;
  return true;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  record.count++;
  return true;
}

// Cleanup old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of Array.from(rateLimitMap.entries())) {
    if (now > record.resetTime) rateLimitMap.delete(ip);
  }
  for (const [key, record] of Array.from(resendRateLimitMap.entries())) {
    if (now > record.resetTime) resendRateLimitMap.delete(key);
  }
}, RATE_LIMIT_WINDOW);

// Helper function to broadcast to stone-specific connections
// ── SSE payload redaction for unauthenticated subscribers ─────────────────
// /api/merchants/:id/events is consumed by BOTH the authenticated merchant
// terminal (token in query string) and the anonymous customer payment page.
// Authenticated connections get the full event; anonymous ones get a redacted
// view with the merchant's fee/margin internals and payment-processor ids
// stripped (item name / price / status / split counts stay — the paying
// customer legitimately sees their own transaction).
const SSE_TXN_SENSITIVE = [
  "windcaveFeeRate", "windcaveFeeAmount", "platformFeeRate", "platformFeeAmount", "merchantNet",
  "windcaveTransactionId", "windcaveSessionId", "windcaveXId", "windcaveSessionState",
  "nfcSessionId", "deviceId",
];
function stripFields<T extends Record<string, any>>(obj: T, fields: string[]): T {
  if (!obj || typeof obj !== "object") return obj;
  const out: Record<string, any> = { ...obj };
  for (const f of fields) delete out[f];
  return out as T;
}

function publicSseData(data: any): any {
  if (!data || typeof data !== "object") return data;
  const out: Record<string, any> = { ...data };
  if (out.transaction) out.transaction = stripFields(out.transaction, SSE_TXN_SENSITIVE);
  if (out.refund) delete out.refund; // refund internals are merchant-only
  return out;
}

// Write one SSE frame to a connection, redacting for unauthenticated subscribers
// (connection tagged with __sseAuthed at connect time in /api/merchants/:id/events).
function sseWrite(conn: any, data: any) {
  const payload = conn && conn.__sseAuthed ? data : publicSseData(data);
  conn.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastToStone(merchantId: number, stoneId: number | null | undefined, data: any) {
  const merchantConnections = sseConnections.get(merchantId);
  if (!merchantConnections) return;

  const targetStoneId = stoneId === undefined ? null : stoneId;
  const sent = new Set<any>();

  const stoneConnections = merchantConnections.get(targetStoneId);
  if (stoneConnections) {
    stoneConnections.forEach(conn => { sseWrite(conn, data); sent.add(conn); });
  }

  if (targetStoneId !== null) {
    const merchantWide = merchantConnections.get(null);
    if (merchantWide) {
      merchantWide.forEach(conn => { if (!sent.has(conn)) sseWrite(conn, data); });
    }
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Multer configuration for logo uploads.
// Files are held in memory and persisted to the uploaded_files table — never to
// the local filesystem, which is ephemeral on autoscale deployments (a deploy or
// restart would silently delete every customer upload).
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG files are allowed'));
    }
  }
});

// Multer configuration for one-off charge invoice documents (PDF / image).
// Stored in the uploaded_files table and served back via the /uploads route;
// the saved URL is attached to the invoice and surfaced on the checkout page.
const INVOICE_DOC_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
]);

const invoiceDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    if (INVOICE_DOC_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF or image files are allowed'));
  },
});

// Upsert a file into the uploaded_files table under its public /uploads path
// (e.g. "logos/merchant-5.png"). Re-uploading to the same path overwrites.
async function saveUploadedFile(relPath: string, mimeType: string, data: Buffer): Promise<void> {
  await db.insert(uploadedFiles)
    .values({ path: relPath, mimeType, data })
    .onConflictDoUpdate({
      target: uploadedFiles.path,
      set: { mimeType, data, createdAt: new Date() },
    });
}

// Utility to remove undefined keys
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

// Escape user-supplied strings before embedding in HTML (e.g. admin email templates)
function escHtml(s: string | null | undefined): string {
  if (!s) return 'N/A';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /terminal\nDisallow: /settings\nDisallow: /transactions\nDisallow: /stock\nDisallow: /nfc\nDisallow: /admin\nDisallow: /api/\n\nSitemap: https://taptpay.com/sitemap.xml\n`
    );
  });

  // NFC tag redirect — sends Android to Chrome via intent://, iOS straight to pay URL
  function nfcRedirectHtml(payUrl: string, intentUrl: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TaptPay</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#000a36;font-family:system-ui,sans-serif;color:#fff;text-align:center;padding:24px}</style></head><body><p style="opacity:.7;font-size:14px">Opening payment page…</p><script>
var ua=navigator.userAgent||'';
var isAndroid=/Android/i.test(ua);
var isIOS=/iPhone|iPad|iPod/i.test(ua);
var isInApp=/FBAN|FBAV|Instagram|Twitter|Line|WeChat|Snapchat|TikTok|Bytedance/i.test(ua)||(isAndroid&&/wv\\)/i.test(ua));
if(isAndroid&&isInApp){window.location.href=${JSON.stringify(intentUrl)};}
else if(isIOS){window.location.href=${JSON.stringify(payUrl)};}
else{window.location.href=${JSON.stringify(payUrl)};}
</script><noscript><a href="${payUrl}" style="color:#00f1d7">Tap to pay</a></noscript></body></html>`;
  }

  app.get("/nfc/:merchantId/stone/:stoneId", (req, res) => {
    const merchantId = parseInt(req.params.merchantId);
    const stoneId = parseInt(req.params.stoneId);
    const payUrl = generatePaymentUrl(merchantId, stoneId, req);
    const host = payUrl.replace(/^https?:\/\//, "");
    const intentUrl = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`;
    res.setHeader("Cache-Control", "no-store");
    res.type("text/html").send(nfcRedirectHtml(payUrl, intentUrl));
  });

  app.get("/nfc/:merchantId", (req, res) => {
    const merchantId = parseInt(req.params.merchantId);
    const payUrl = generatePaymentUrl(merchantId, undefined, req);
    const host = payUrl.replace(/^https?:\/\//, "");
    const intentUrl = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`;
    res.setHeader("Cache-Control", "no-store");
    res.type("text/html").send(nfcRedirectHtml(payUrl, intentUrl));
  });

  app.get("/.well-known/apple-developer-merchantid-domain-association", (_req, res) => {
    const filePath = path.resolve(
      import.meta.dirname,
      "..",
      "client",
      "public",
      ".well-known",
      "apple-developer-merchantid-domain-association"
    );
    res.set("Content-Type", "application/json");
    res.sendFile(filePath);
  });

  app.get("/sitemap.xml", (_req, res) => {
    const pages = [
      { loc: "/", priority: "1.0", changefreq: "weekly" },
      { loc: "/signup", priority: "0.8", changefreq: "monthly" },
      { loc: "/login", priority: "0.6", changefreq: "monthly" },
      { loc: "/terms", priority: "0.3", changefreq: "yearly" },
      { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
    ];
    const lastmod = new Date().toISOString().split("T")[0];
    const urls = pages
      .map(
        (p) =>
          `  <url>\n    <loc>https://taptpay.com${p.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
      )
      .join("\n");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
    );
  });

  // Admin authentication middleware
  const authenticateAdmin = (req: AuthenticatedRequest, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      // Token decoded for admin middleware - details omitted for security
      
      // For admin users, we verify directly from the token.
      // ADMIN_EMAIL must be set in env — no hardcoded fallback.
      const adminEmail = process.env.ADMIN_EMAIL;
      if (decoded.role === 'admin' && adminEmail && decoded.email === adminEmail) {
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          merchantId: decoded.merchantId,
          role: decoded.role,
          password: '',
          resetToken: undefined,
          resetTokenExpiry: undefined,
          createdAt: new Date(),
        };
        next();
      } else {
        logSecurityEvent('ADMIN_ACCESS_DENIED', { role: decoded.role });
        return res.status(403).json({ message: "Admin access required" });
      }
    } catch (error) {
      console.error('Admin middleware token error:', error);
      return res.status(403).json({ message: "Invalid or expired token" });
    }
  };
  
  function checkMerchantOwnership(req: AuthenticatedRequest, merchantId: number): boolean {
    if (!req.user) return false;
    if (req.user.role === 'admin') return true;
    return req.user.merchantId === merchantId;
  }

  // Google OAuth routes
  app.get("/api/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect('/login?error=Google+sign+in+is+not+configured');
    }
    const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, error } = req.query as { code?: string; error?: string };

    if (error || !code) {
      return res.redirect('/login?error=Google+sign+in+was+cancelled');
    }

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });

      if (!tokenRes.ok) {
        console.error('Google token exchange failed:', await tokenRes.text());
        return res.redirect('/login?error=Google+sign+in+failed');
      }

      const tokenData = await tokenRes.json() as { access_token: string };

      // Fetch user profile from Google
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return res.redirect('/login?error=Google+sign+in+failed');
      }

      const profile = await userRes.json() as { id: string; email: string; name: string };
      const { id: googleId, email, name } = profile;

      if (!email) {
        return res.redirect('/login?error=Google+account+has+no+email');
      }

      // Look up existing merchant by email
      let merchant = await storage.getMerchantByEmail(email);
      let isNewUser = false;

      if (merchant) {
        if (merchant.status === 'pending') {
          return res.redirect('/login?error=Your+account+is+pending+verification.+Please+check+your+email.');
        }
        // Save googleId if not already stored
        if (!merchant.googleId) {
          await storage.updateMerchant(merchant.id, { googleId });
        }
      } else {
        // Create new merchant account — Google already verified the email
        merchant = await storage.createMerchant({
          name: name || email.split('@')[0],
          businessName: name || email.split('@')[0],
          email,
          status: 'verified',
          googleId,
        } as any);
        isNewUser = true;
      }

      // Ensure the merchant can be resolved for token auth, which requires a
      // passwordHash on the record. Google users never log in with a password, so
      // seed a random unguessable one if absent (createUser is idempotent).
      const randomPwd = crypto.randomBytes(32).toString('hex');
      const authUser = await createUser(email, randomPwd, merchant.id);

      const token = generateToken(authUser);
      const redirectParams = new URLSearchParams({
        token,
        merchantId: String(merchant.id),
        ...(isNewUser ? { newUser: 'true' } : {}),
      });

      return res.redirect(`/login?${redirectParams.toString()}`);
    } catch (err) {
      console.error('Google OAuth callback error:', err);
      return res.redirect('/login?error=Google+sign+in+failed.+Please+try+again.');
    }
  });

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email or password", errors: validation.error.errors });
      }

      const { email, password } = validation.data;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      
      // Check if IP is rate limited (distributed attack protection)
      const ipStatus = isIPRateLimited(clientIp);
      if (ipStatus.limited) {
        logSecurityEvent('LOGIN_BLOCKED_IP_LIMIT', { ip: clientIp });
        return res.status(429).json({ 
          message: `Too many login attempts. Please try again in ${ipStatus.remainingTime} minutes.`,
          rateLimited: true,
          remainingTime: ipStatus.remainingTime 
        });
      }
      
      // Check if account is locked (per-email protection)
      const lockStatus = isAccountLocked(email);
      if (lockStatus.locked) {
        logSecurityEvent('LOGIN_BLOCKED_LOCKOUT', { email, ip: clientIp });
        return res.status(429).json({ 
          message: `Account temporarily locked. Please try again in ${lockStatus.remainingTime} minutes.`,
          locked: true,
          remainingTime: lockStatus.remainingTime 
        });
      }

      const user = await authenticateUser(email, password);
      
      if (!user) {
        const result = recordFailedLogin(email, clientIp);
        if (result.ipLimited) {
          return res.status(429).json({ 
            message: "Too many login attempts from your location. Please try again in 30 minutes.",
            rateLimited: true 
          });
        }
        if (result.locked) {
          return res.status(429).json({ 
            message: "Too many failed attempts. Account locked for 15 minutes.",
            locked: true 
          });
        }
        return res.status(401).json({ 
          message: "Invalid email or password",
          attemptsRemaining: result.attemptsRemaining 
        });
      }

      // Clear failed attempts on successful login
      clearFailedAttempts(email);
      logSecurityEvent('LOGIN_SUCCESS', { email, ip: clientIp, userId: user.id });

      const token = generateToken(user);
      
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          merchantId: user.merchantId,
          role: user.role,
        },
      });
    } catch (error) {
      logSecurityEvent('LOGIN_ERROR', { error: String(error) });
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Password reset routes
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const validation = forgotPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email", errors: validation.error.errors });
      }

      const { email } = validation.data;
      const baseUrl = getBaseUrl(req);
      
      await requestPasswordReset(email, baseUrl);
      
      // Always return success to prevent email enumeration
      res.json({ message: "If an account with that email exists, a password reset link has been sent." });
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const validation = resetPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid reset data", errors: validation.error.errors });
      }

      const { token, password } = validation.data;
      const success = await resetPassword(token, password);
      
      if (!success) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      res.json({ message: "Password has been successfully reset" });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/auth/validate-reset-token/:token", async (req, res) => {
    const { token } = req.params;
    const isValid = await validateResetToken(token);
    
    res.json({ valid: isValid });
  });

  // Admin Authentication routes
  app.post("/api/admin/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email or password", errors: validation.error.errors });
      }

      const { email, password } = validation.data;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      
      // Check if IP is rate limited (distributed attack protection)
      const ipStatus = isIPRateLimited(clientIp);
      if (ipStatus.limited) {
        logSecurityEvent('ADMIN_LOGIN_BLOCKED_IP_LIMIT', { ip: clientIp });
        return res.status(429).json({ 
          message: `Too many login attempts. Please try again in ${ipStatus.remainingTime} minutes.`,
          rateLimited: true,
          remainingTime: ipStatus.remainingTime 
        });
      }
      
      // Check if account is locked (per-email protection)
      const lockStatus = isAccountLocked(email);
      if (lockStatus.locked) {
        logSecurityEvent('ADMIN_LOGIN_BLOCKED_LOCKOUT', { email, ip: clientIp });
        return res.status(429).json({ 
          message: `Account temporarily locked. Please try again in ${lockStatus.remainingTime} minutes.`,
          locked: true,
          remainingTime: lockStatus.remainingTime 
        });
      }
      
      // Check for admin credentials
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

      if (adminEmail && email === adminEmail) {
        let passwordValid = false;
        if (adminPasswordHash) {
          passwordValid = await bcrypt.compare(password, adminPasswordHash);
        } else {
          console.error("CRITICAL: ADMIN_PASSWORD_HASH env var not set. Admin login disabled.");
          return res.status(500).json({ message: "Admin login unavailable - contact system administrator" });
        }

        if (passwordValid) {
          clearFailedAttempts(email);
          logSecurityEvent('ADMIN_LOGIN_SUCCESS', { email, ip: clientIp });
          
          const adminUser = {
            id: 1,
            email: adminEmail,
            password: "",
            merchantId: 0,
            role: "admin" as const,
            createdAt: new Date(),
          };

          const token = generateToken(adminUser);
          
          return res.json({
            token,
            user: {
              id: adminUser.id,
              email: adminUser.email,
              merchantId: adminUser.merchantId,
              role: adminUser.role,
            },
          });
        }
      }

      {
        const result = recordFailedLogin(email, clientIp);
        if (result.ipLimited) {
          return res.status(429).json({ 
            message: "Too many login attempts from your location. Please try again in 30 minutes.",
            rateLimited: true 
          });
        }
        if (result.locked) {
          return res.status(429).json({ 
            message: "Too many failed attempts. Account locked for 15 minutes.",
            locked: true 
          });
        }
        return res.status(401).json({ 
          message: "Invalid admin credentials",
          attemptsRemaining: result.attemptsRemaining 
        });
      }
    } catch (error) {
      logSecurityEvent('ADMIN_LOGIN_ERROR', { error: String(error) });
      res.status(500).json({ message: "Admin login failed" });
    }
  });

  // Regular user authentication check
  app.get("/api/auth/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const merchantId = req.user!.merchantId;
    let onboardingCompleted = true; // default for non-merchant users
    let merchantStatus: string | null = null;
    let gstRegistered = false;
    let tradeGstMode = "inclusive";
    let billingCardReady = false;
    if (merchantId) {
      const merchant = await storage.getMerchant(merchantId);
      onboardingCompleted = merchant?.onboardingCompleted ?? false;
      merchantStatus = merchant?.status ?? null;
      gstRegistered = merchant?.gstRegistered ?? false;
      tradeGstMode = merchant?.tradeGstMode === "exclusive" ? "exclusive" : "inclusive";
      billingCardReady = billingCardIsReady(merchant);
    }
    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        merchantId: req.user!.merchantId,
        role: req.user!.role,
        onboardingCompleted,
        merchantStatus,
        gstRegistered,
        tradeGstMode,
        billingCardReady,
      },
    });
  });

  const tutorialProgressSchema = z.object({
    generation: z.number().int().positive(),
    status: z.enum(["started", "completed", "dismissed"]),
    lastStep: z.number().int().min(0).max(100).default(0),
  }).strict();

  app.get("/api/tutorial/state", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId || req.user?.role === "admin") {
        return res.status(403).json({ message: "Merchant access required" });
      }
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });

      const progressRows = await storage.getMerchantTutorialProgress(merchantId, merchant.tutorialGeneration);
      const progress = Object.fromEntries(progressRows.map(row => [row.pageKey, {
        status: row.status,
        lastStep: row.lastStep,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        dismissedAt: row.dismissedAt,
      }]));

      res.json({
        generation: merchant.tutorialGeneration,
        autoEnabled: merchant.tutorialAutoEnabled,
        pageCount: TUTORIAL_PAGE_KEYS.length,
        progress,
      });
    } catch (error) {
      console.error("Tutorial state error:", error);
      res.status(500).json({ message: "Failed to load tutorial progress" });
    }
  });

  app.patch("/api/tutorial/pages/:pageKey", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId || req.user?.role === "admin") {
        return res.status(403).json({ message: "Merchant access required" });
      }
      if (!isTutorialPageKey(req.params.pageKey)) {
        return res.status(400).json({ message: "Unknown tutorial page" });
      }
      const parsed = tutorialProgressSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid tutorial progress", errors: parsed.error.errors });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      if (parsed.data.generation !== merchant.tutorialGeneration) {
        return res.status(409).json({
          message: "Tutorials were restarted in another session",
          generation: merchant.tutorialGeneration,
        });
      }

      const row = await storage.upsertMerchantTutorialProgress(
        merchantId,
        merchant.tutorialGeneration,
        req.params.pageKey,
        parsed.data.status,
        parsed.data.lastStep,
      );
      res.json({ pageKey: row.pageKey, status: row.status, lastStep: row.lastStep });
    } catch (error) {
      console.error("Tutorial progress error:", error);
      res.status(500).json({ message: "Failed to save tutorial progress" });
    }
  });

  app.post("/api/tutorial/restart", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId || req.user?.role === "admin") {
        return res.status(403).json({ message: "Merchant access required" });
      }
      const merchant = await storage.restartMerchantTutorial(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      res.json({
        generation: merchant.tutorialGeneration,
        autoEnabled: true,
        pageCount: TUTORIAL_PAGE_KEYS.length,
        progress: {},
      });
    } catch (error) {
      console.error("Tutorial restart error:", error);
      res.status(500).json({ message: "Failed to restart tutorials" });
    }
  });

  // Merchant KYC onboarding submission
  app.post("/api/merchants/:id/onboarding", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const userMerchantId = req.user?.merchantId;

      if (userMerchantId !== merchantId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Forbidden" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      const {
        director,
        nzbn,
        gstNumber,
        websiteUrl,
        estimatedAnnualTurnover,
        businessDescription,
      } = req.body;

      // Save all KYC details to merchant record
      await storage.updateMerchant(merchantId, {
        director: director || null,
        nzbn: nzbn || null,
        gstNumber: gstNumber || null,
        onboardingCompleted: true,
      });

      // Send notification email to TaptPay admin
      // All user-supplied values are HTML-escaped via escHtml() to prevent injection.
      const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_NOTIFY_EMAIL;
      if (adminEmail) {
        const emailHtml = `
          <h2>New Merchant KYC Submission</h2>
          <p>A merchant has completed their onboarding details and is ready for Windcave KYC/AML review.</p>

          <h3>Business Information</h3>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-family:sans-serif;">
            <tr><td><strong>Business Name</strong></td><td>${escHtml(merchant.businessName)}</td></tr>
            <tr><td><strong>Business Type</strong></td><td>${escHtml(merchant.businessType)}</td></tr>
            <tr><td><strong>Business Address</strong></td><td>${escHtml(merchant.address)}</td></tr>
            ${businessDescription ? `<tr><td><strong>Business Description</strong></td><td>${escHtml(businessDescription)}</td></tr>` : ''}
            ${websiteUrl ? `<tr><td><strong>Website</strong></td><td>${escHtml(websiteUrl)}</td></tr>` : ''}
            ${estimatedAnnualTurnover ? `<tr><td><strong>Estimated Annual Card Turnover</strong></td><td>${escHtml(estimatedAnnualTurnover)}</td></tr>` : ''}
          </table>

          <h3>Director / Owner Details</h3>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-family:sans-serif;">
            <tr><td><strong>Contact Name</strong></td><td>${escHtml(merchant.name)}</td></tr>
            <tr><td><strong>Director / Legal Name</strong></td><td>${escHtml(director)}</td></tr>
            <tr><td><strong>Email</strong></td><td>${escHtml(merchant.email)}</td></tr>
            <tr><td><strong>Phone</strong></td><td>${escHtml(merchant.phone)}</td></tr>
          </table>

          <h3>Tax &amp; Registration</h3>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-family:sans-serif;">
            <tr><td><strong>NZBN</strong></td><td>${escHtml(nzbn)}</td></tr>
            <tr><td><strong>GST Number</strong></td><td>${escHtml(gstNumber)}</td></tr>
          </table>

          <p style="margin-top:20px; color:#666;">Submitted via TaptPay merchant onboarding form.</p>
        `;

        await sendEmail({
          to: adminEmail,
          from: 'noreply@taptpay.co.nz',
          subject: `New Merchant KYC Submission — ${(merchant.businessName || '').replace(/[\r\n]/g, '')}`,
          html: emailHtml,
          text: `New merchant KYC submission from ${merchant.businessName} (${merchant.email}). Director: ${director || 'N/A'}. NZBN: ${nzbn || 'N/A'}. GST: ${gstNumber || 'N/A'}.`,
        });
      }

      res.json({ message: "Onboarding details submitted successfully" });
    } catch (error: any) {
      console.error("Onboarding submission error:", error);
      res.status(500).json({ message: "Failed to submit onboarding details" });
    }
  });

  app.get("/api/admin/auth/me", (req: AuthenticatedRequest, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      // Token decoded for admin auth - details omitted for security
      
      // For admin users, we verify directly from the token since they're not stored in the users Map
      const adminEmail = process.env.ADMIN_EMAIL;
      if (decoded.role === 'admin' && adminEmail && decoded.email === adminEmail) {
        res.json({
          user: {
            id: decoded.userId,
            email: decoded.email,
            merchantId: decoded.merchantId,
            role: decoded.role,
          },
        });
      } else {
        logSecurityEvent('ADMIN_AUTH_DENIED', { role: decoded.role });
        return res.status(403).json({ message: "Admin access required" });
      }
    } catch (error) {
      console.error('Admin token verification error:', error);
      return res.status(403).json({ message: "Invalid or expired token" });
    }
  });

  // Generate QR code for merchant
  app.get("/api/merchants/:id/qr", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const merchant = await storage.getMerchant(merchantId);
      
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get size parameter (default to 400, allow up to 1000 for downloads)
      const size = Math.min(parseInt(req.query.size as string) || 400, 1000);
      const isDownload = req.query.download === 'true';

      // Set response headers for PNG image - STATIC QR per merchant
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // Cache for 30 days - QR never changes per merchant
      res.setHeader('ETag', `"merchant-qr-v2-${merchantId}"`); // v2 = cyan transparent style
      
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="tapt-payment-qr-merchant-${merchantId}.png"`);
      }
      
      // Generate QR code with current payment URL
      const currentPaymentUrl = generatePaymentUrl(merchantId, undefined, req);
      const qrBuffer = await QRCode.toBuffer(currentPaymentUrl, {
        type: 'png',
        width: size,
        margin: 2,
        color: {
          dark: '#00E5CC',
          light: '#00000000'
        },
        errorCorrectionLevel: 'L',
      });
      
      res.send(qrBuffer);
    } catch (error) {
      console.error("QR code generation error:", error);
      res.status(500).json({ message: "Failed to generate QR code" });
    }
  });

  // Generate QR code for specific tapt stone
  app.get("/api/merchants/:id/stone/:stoneId/qr", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const stoneId = parseInt(req.params.stoneId);
      
      // Verify stone exists and belongs to merchant
      const stone = await storage.getTaptStone(stoneId);
      if (!stone || stone.merchantId !== merchantId) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      // Get size parameter (default to 400, allow up to 1000 for downloads)
      const size = Math.min(parseInt(req.query.size as string) || 400, 1000);
      const isDownload = req.query.download === 'true';

      // Set response headers for PNG image - STATIC QR per stone
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // Cache for 30 days - QR never changes per stone
      res.setHeader('ETag', `"stone-qr-v2-${stoneId}"`); // v2 = cyan transparent style
      
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="tapt-payment-qr-merchant-${merchantId}-stone-${stoneId}.png"`);
      }
      
      // Generate QR code with current payment URL for this stone
      const currentPaymentUrl = generateStonePaymentUrl(merchantId, stoneId, req);
      const qrBuffer = await QRCode.toBuffer(currentPaymentUrl, {
        type: 'png',
        width: size,
        margin: 2,
        color: {
          dark: '#00E5CC',
          light: '#00000000'
        },
        errorCorrectionLevel: 'L',
      });
      
      res.send(qrBuffer);
    } catch (error) {
      console.error("Stone QR code generation error:", error);
      res.status(500).json({ message: "Failed to generate QR code for stone" });
    }
  });

  // Get merchant info
  app.get("/api/merchants/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const merchant = await storage.getMerchant(id);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      
      // Ensure URLs are always current for this environment
      const currentPaymentUrl = generatePaymentUrl(id, undefined, req);
      const currentQrCodeUrl = generateQrCodeUrl(id, undefined, req);
      
      // Return merchant with current URLs
      const merchantWithCurrentUrls = {
        ...merchant,
        paymentUrl: currentPaymentUrl,
        qrCodeUrl: currentQrCodeUrl
      };
      
      res.json(publicMerchant(merchantWithCurrentUrls));
    } catch (error) {
      res.status(500).json({ message: "Failed to get merchant" });
    }
  });

  // Get active transaction for merchant - ultra-fast optimized
  app.get("/api/merchants/:id/active-transaction", async (req, res) => {
    const merchantId = parseInt(req.params.id);
    const stoneId = req.query.stoneId ? parseInt(req.query.stoneId as string) : undefined;
    
    // SECURITY: Rate limiting
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(clientIp)) {
      console.warn(`SECURITY: Rate limit exceeded for IP ${clientIp} on active-transaction endpoint`);
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    
    // Ultra-fast headers for immediate response
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'application/json'
    });
    
    try {
      // AUDIT: Log access to payment page
      console.log(`Active transaction requested: merchant ${merchantId}, stone ${stoneId || 'none'}, IP ${clientIp}`);
      
      // SECURITY: If stoneId is provided, verify it belongs to this merchant
      if (stoneId !== undefined) {
        const stone = await storage.getTaptStone(stoneId);
        if (!stone || stone.merchantId !== merchantId) {
          return res.status(403).json({ 
            message: "Invalid stone access - stone does not belong to this merchant" 
          });
        }
      }
      
      // No stoneId on a public pay link means the *no-board* link, not "any board":
      // pass null so it scopes to stoneless sales. Filtering by merchant alone
      // would serve this customer a sale rung up on a specific board.
      const transaction = await storage.getActiveTransactionByMerchant(merchantId, stoneId ?? null);

      if (!transaction) {
        return res.json(null);
      }
      
      // SECURITY: Verify transaction belongs to the correct merchant
      if (transaction.merchantId !== merchantId) {
        return res.status(403).json({ 
          message: "Transaction access denied" 
        });
      }
      
      // SECURITY: If stoneId specified, verify transaction is for that stone
      if (stoneId !== undefined && transaction.taptStoneId !== stoneId) {
        return res.json(null); // Return null instead of wrong stone's transaction
      }
      
      // Add payment URL and QR code URL using transaction's stone ID
      const paymentUrl = generatePaymentUrl(merchantId, transaction.taptStoneId, req);
      const qrCodeUrl = generateQrCodeUrl(merchantId, transaction.taptStoneId, req);
      
      const transactionWithUrls = {
        ...transaction,
        paymentUrl,
        qrCodeUrl,
      };
      
      res.json(transactionWithUrls);
    } catch (error) {
      res.status(500).json({ message: "Failed to get active transaction" });
    }
  });

  // Create new transaction
  app.post("/api/transactions", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const validation = insertTransactionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid transaction data", errors: validation.error.errors });
      }

      if (!checkMerchantOwnership(req, validation.data.merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!(await requireBillingCard(validation.data.merchantId, res))) return;

      const transaction = await storage.createTransaction(validation.data);
      
      // Generate payment URL and QR code URL for the transaction
      const paymentUrl = generatePaymentUrl(transaction.merchantId!, transaction.taptStoneId, req);
      const qrCodeUrl = generateQrCodeUrl(transaction.merchantId!, transaction.taptStoneId, req);
      
      // Add URLs to transaction object
      const transactionWithUrls = {
        ...transaction,
        paymentUrl,
        qrCodeUrl,
      };
      
      broadcastToStone(transaction.merchantId!, transaction.taptStoneId, { 
        type: 'transaction_updated', 
        transaction: transactionWithUrls 
      });

      sendPushToMerchant(transaction.merchantId!, "pending", transaction.itemName, transaction.price, transaction.id).catch(() => {});

      res.json(transactionWithUrls);
    } catch (error) {
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  // Cash Sale — creates and immediately completes a transaction (no payment processing)
  app.post("/api/transactions/cash-sale", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { merchantId, itemName, price, stoneId } = req.body;

      if (!merchantId || !itemName || !price) {
        return res.status(400).json({ message: "merchantId, itemName and price are required" });
      }
      if (!checkMerchantOwnership(req, parseInt(merchantId))) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!(await requireBillingCard(parseInt(merchantId), res))) return;

      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({ message: "Invalid price" });
      }

      // TaptPay flat fee: $0.10 per transaction, charged separately to merchant's card.
      const transaction = await storage.createTransaction({
        merchantId: parseInt(merchantId),
        taptStoneId: stoneId ? parseInt(stoneId) : null,
        itemName,
        price: priceNum.toFixed(2),
        status: "completed",
        paymentMethod: "cash",
        windcaveFeeRate: "0.0000",
        windcaveFeeAmount: "0.00",
        platformFeeRate: "0.0000",
        platformFeeAmount: "0.10",
        merchantNet: priceNum.toFixed(2),
        splitEnabled: false,
      } as any);

      // Broadcast completion to SSE clients
      broadcastToStone(transaction.merchantId!, transaction.taptStoneId, {
        type: 'transaction_updated',
        transaction: { ...transaction, paymentMethod: 'cash' },
      });

      sendPushToMerchant(transaction.merchantId!, "completed", transaction.itemName, transaction.price, transaction.id).catch(() => {});

      res.json({ transaction });
    } catch (error) {
      console.error("Cash sale error:", error);
      res.status(500).json({ message: "Failed to record cash sale" });
    }
  });

  // Tap to Pay (Windcave attended / Tap to Pay on iPhone)
  // Required: {merchantId, amount, windcaveToken (when Windcave is configured)}
  // Optional: {transactionId} — ID of the pending transaction to finalize; if omitted, uses the
  //   merchant's current active pending transaction. Amount is always taken from the pending
  //   transaction's stored price to guarantee ledger/processor consistency.
  // "Paywave" is the NZ contactless payment brand used in the UI; the underlying protocol is
  //   Windcave's attended Tap to Pay on iPhone (WCPaymentSDK + server-side session flow).
  app.post("/api/transactions/tap-to-pay", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { merchantId, transactionId, amount, windcaveToken } = req.body;

      if (!merchantId || !amount) {
        return res.status(400).json({ message: "merchantId and amount are required" });
      }
      const mid = parseInt(merchantId);
      if (!checkMerchantOwnership(req, mid)) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!(await requireBillingCard(mid, res))) return;

      const requestedAmount = parseFloat(amount);
      if (isNaN(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Resolve the pending transaction to finalize.
      // Prefer the explicitly supplied transactionId, otherwise use the merchant's active pending one.
      let pendingTransaction: Awaited<ReturnType<typeof storage.getTransaction>> | undefined;
      if (transactionId) {
        pendingTransaction = await storage.getTransaction(parseInt(transactionId));
        if (!pendingTransaction || pendingTransaction.merchantId !== mid) {
          return res.status(404).json({ message: "Transaction not found" });
        }
        if (pendingTransaction.status !== "pending") {
          return res.status(409).json({ message: "Transaction is no longer pending" });
        }
      } else {
        // Deliberately unscoped (undefined = any board): this is the authenticated
        // merchant finalising whatever they have pending, not a customer following
        // a link, so board scoping would break a board-attached sale.
        pendingTransaction = await storage.getActiveTransactionByMerchant(mid);
      }

      // The amount to charge Windcave is always the pending transaction's stored price.
      // If no pending transaction, fall back to request body amount.
      // This prevents any divergence between charged amount and recorded ledger amount.
      const chargeAmount = pendingTransaction
        ? parseFloat(pendingTransaction.price)
        : requestedAmount;

      if (isNaN(chargeAmount) || chargeAmount <= 0) {
        return res.status(400).json({ message: "Invalid charge amount" });
      }

      const merchantRef = `TAPTP-${pendingTransaction?.id ?? Date.now()}`;
      let paymentResult;

      if (isWindcaveConfigured()) {
        // Require a real NFC token when Windcave credentials are configured.
        // Fail closed — never simulate a payment when credentials are present.
        if (!windcaveToken) {
          return res.status(400).json({ message: "windcaveToken is required when Windcave is configured" });
        }

        // Step 1: Create an attended session on Windcave using the pending transaction price
        const sessionResult = await createAttendedSession(chargeAmount.toFixed(2), merchantRef);
        if (!sessionResult.success || !sessionResult.sessionId) {
          return res.status(502).json({ message: `Failed to create attended session: ${sessionResult.error}` });
        }

        // Step 2: Submit the NFC token captured by the iOS SDK against the session
        paymentResult = await submitTapToPayToken(sessionResult.sessionId, windcaveToken);

        // A false `success` means a processor/network error — not a card decline.
        // Return upstream error without persisting any transaction outcome.
        if (!paymentResult.success) {
          return res.status(502).json({ message: `Payment processor error: ${paymentResult.error}` });
        }
      } else {
        // Dev/staging environment — no real credentials configured
        paymentResult = simulateAttendedTapToPay(merchantRef);
      }

      const finalStatus = paymentResult.approved ? "completed" : "failed";

      let transaction;
      if (pendingTransaction) {
        // Finalize the existing pending transaction in place.
        // The stored price is unchanged — it was the source of truth for chargeAmount.
        transaction = await storage.updateTransactionStatus(
          pendingTransaction.id,
          finalStatus,
          paymentResult.windcaveTransactionId ?? undefined
        );
        await storage.updateTransactionPaymentMethod(pendingTransaction.id, "tap_to_pay");
        transaction = transaction ?? pendingTransaction;
      } else {
        // No pending transaction exists — create a fresh record using the exact charged amount.
        // windcaveTransactionId is not part of the insert type (omitted from schema); set it
        // via updateTransactionStatus after creation so the type contract is preserved.
        transaction = await storage.createTransaction({
          merchantId: mid,
          itemName: "Tap to Pay Sale",
          price: chargeAmount.toFixed(2),
          status: finalStatus,
          paymentMethod: "tap_to_pay",
          splitEnabled: false,
        });
        if (paymentResult.windcaveTransactionId) {
          const updated = await storage.updateTransactionStatus(
            transaction.id,
            finalStatus,
            paymentResult.windcaveTransactionId
          );
          transaction = updated ?? transaction;
        }
      }

      if (paymentResult.approved) {
        broadcastToStone(transaction!.merchantId!, transaction!.taptStoneId, {
          type: "transaction_updated",
          transaction: { ...transaction, paymentMethod: "tap_to_pay" },
        });
        sendPushToMerchant(transaction!.merchantId!, "completed", transaction!.itemName, transaction!.price, transaction!.id).catch(() => {});
      }

      res.json({ approved: paymentResult.approved ?? false, transactionId: transaction!.id });
    } catch (error) {
      console.error("Tap to Pay error:", error);
      res.status(500).json({ message: "Tap to Pay processing failed" });
    }
  });

  // Create bill split
  app.post("/api/transactions/:id/split", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const { totalSplits } = req.body;

      if (!totalSplits || totalSplits < 2 || totalSplits > 10) {
        return res.status(400).json({ message: "Total splits must be between 2 and 10" });
      }

      const updatedTransaction = await storage.createBillSplit(transactionId, totalSplits);
      
      if (!updatedTransaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Add payment URL and QR code URL
      const paymentUrl = generatePaymentUrl(updatedTransaction.merchantId!, undefined, req);
      const qrCodeUrl = generateQrCodeUrl(updatedTransaction.merchantId!, undefined, req);
      
      const transactionWithUrls = {
        ...updatedTransaction,
        paymentUrl,
        qrCodeUrl,
      };

      // Notify connected clients about the split
      broadcastToStone(updatedTransaction.merchantId!, updatedTransaction.taptStoneId, { 
        type: 'transaction_updated', 
        transaction: transactionWithUrls 
      });

      res.json(transactionWithUrls);
    } catch (error) {
      console.error("Error creating bill split:", error);
      res.status(500).json({ message: "Failed to create bill split" });
    }
  });

  // Update splitEnabled on a pending transaction (merchant toggle)
  app.patch("/api/transactions/:id/split-enabled", authenticateToken, async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const { splitEnabled } = req.body;

      if (typeof splitEnabled !== 'boolean') {
        return res.status(400).json({ message: "splitEnabled must be a boolean" });
      }

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Only the owning merchant (or an admin) can update
      const user = (req as any).user;
      if (user?.role !== 'admin' && transaction.merchantId !== user?.merchantId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Only update if still pending
      if (transaction.status !== 'pending') {
        return res.status(409).json({ message: "Cannot update split status on a non-pending transaction" });
      }

      const updated = await storage.updateTransactionSplitEnabled(transactionId, splitEnabled);
      if (!updated) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Broadcast change to SSE listeners
      broadcastToStone(updated.merchantId!, updated.taptStoneId, {
        type: 'transaction_updated',
        transaction: updated,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating split enabled:", error);
      res.status(500).json({ message: "Failed to update split enabled" });
    }
  });

  // Get a single split payment by ID (public — needed for customer receipt page)
  app.get("/api/split-payments/:id", async (req, res) => {
    try {
      const splitId = parseInt(req.params.id);
      if (isNaN(splitId)) return res.status(400).json({ message: "Invalid split payment ID" });
      const split = await storage.getSplitPaymentById(splitId);
      if (!split) return res.status(404).json({ message: "Split payment not found" });
      res.json(split);
    } catch (error) {
      console.error("Error fetching split payment:", error);
      res.status(500).json({ message: "Failed to fetch split payment" });
    }
  });

  // Cancel transaction — merchant-initiated only (called from the terminal UI)
  app.post("/api/transactions/:id/cancel", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await storage.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Only the owning merchant (or an admin) can cancel — prevents cancelling
      // an arbitrary transaction by guessing its numeric id.
      if (!checkMerchantOwnership(req, transaction.merchantId!)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Only allow canceling pending or processing transactions
      if (!['pending', 'processing'].includes(transaction.status)) {
        return res.status(400).json({ message: `Cannot cancel transaction with status: ${transaction.status}` });
      }

      // Update transaction status to cancelled
      await storage.updateTransactionStatus(transactionId, "cancelled");
      const updatedTransaction = await storage.getTransaction(transactionId);
      
      // Add payment URL and QR code URL
      const paymentUrl = generatePaymentUrl(transaction.merchantId!, undefined, req);
      const qrCodeUrl = generateQrCodeUrl(transaction.merchantId!, undefined, req);
      
      const transactionWithUrls = {
        ...updatedTransaction,
        paymentUrl,
        qrCodeUrl,
      };

      // Notify connected clients about the cancellation
      broadcastToStone(transaction.merchantId!, transaction.taptStoneId, { 
        type: 'transaction_update', 
        transaction: transactionWithUrls 
      });

      res.json(transactionWithUrls);
    } catch (error) {
      console.error("Error canceling transaction:", error);
      res.status(500).json({ message: "Failed to cancel transaction" });
    }
  });

  // NFC Tap to Phone Payment API
  // The merchant's own phone is the terminal, so only the authenticated owner may
  // open a charge. Leaving this public let anyone create pending transactions with
  // an arbitrary itemName/amount on any merchant — polluting their transaction list,
  // spamming fake nfc_transaction_created events onto their live SSE feed, and
  // planting CSV-formula-injection payloads in their export.
  app.post("/api/merchants/:merchantId/nfc-pay", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!(await requireBillingCard(merchantId, res))) return;
      const { amount, itemName, deviceId, nfcCapabilities } = req.body;

      // Validate required fields
      if (!amount || !itemName) {
        return res.status(400).json({ message: "Amount and item name are required" });
      }
      const priceNum = parseFloat(amount);
      if (isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Check if merchant exists
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Create transaction with NFC payment method
      const transaction = await storage.createTransaction({
        merchantId,
        itemName,
        price: priceNum.toFixed(2),
        paymentMethod: "nfc_tap",
        deviceId: deviceId || "unknown",
        status: "pending",
        splitEnabled: false,
      });
      
      // Generate NFC session for contactless payment. Include a cryptographically
      // random component so the session id (later accepted by the public
      // /complete endpoint) cannot be guessed from the transaction id + time.
      const nfcSessionId = `NFC_${transaction.id}_${crypto.randomBytes(16).toString('hex')}`;
      
      // Update transaction with NFC session ID
      await storage.updateTransactionNfcSession(transaction.id, nfcSessionId);
      
      // Notify connected clients about new NFC transaction
      broadcastToStone(merchantId, transaction.taptStoneId, { 
        type: 'nfc_transaction_created', 
        transaction: { ...transaction, nfcSessionId },
        nfcSession: {
          sessionId: nfcSessionId,
          amount: amount,
          merchantName: merchant.businessName || merchant.name,
          paymentMethods: ['apple_pay', 'google_pay', 'contactless_card']
        }
      });
      
      res.json({
        success: true,
        transaction: { ...transaction, nfcSessionId },
        nfcSession: {
          sessionId: nfcSessionId,
          amount: amount,
          merchantName: merchant.businessName || merchant.name,
          windcaveSessionId: null,
          paymentUrl: null,
          supportedMethods: [
            'apple_pay',
            'google_pay', 
            'samsung_pay',
            'contactless_card',
            'nfc_enabled_cards'
          ]
        }
      });
    } catch (error) {
      console.error("NFC payment creation error:", error);
      res.status(500).json({ message: "Failed to create NFC payment session" });
    }
  });

  // Process NFC payment completion
  app.post("/api/nfc-sessions/:sessionId/complete", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { paymentMethod, paymentData, deviceFingerprint } = req.body;
      
      // Find transaction by NFC session ID
      const transaction = await storage.getTransactionByNfcSession(sessionId);
      if (!transaction) {
        return res.status(404).json({ message: "NFC session not found" });
      }
      
      // Update transaction status to processing
      await storage.updateTransactionStatus(transaction.id, "processing");
      
      // Simulate contactless payment processing
      // In production, this would integrate with actual NFC payment processors
      const isSimulation = !windcaveService.isConfigured();
      
      if (isSimulation) {
        // In a real NFC system, this endpoint would only be called when hardware detects a physical tap
        // Process payment immediately since this represents a completed NFC tap
        const finalStatus = "completed";
        const windcaveTransactionId = `NFC_${Date.now()}`;
        
        const updatedTransaction = await storage.updateTransactionStatus(
          transaction.id, 
          finalStatus, 
          windcaveTransactionId
        );
        
        // Collect platform fee for successful payment
        await storage.createPlatformFee({
          transactionId: transaction.id,
          merchantId: transaction.merchantId,
          feeAmount: transaction.platformFeeAmount || "0.10",
          transactionAmount: transaction.price,
          status: 'collected',
        });
        
        // Notify clients of completion
        broadcastToStone(transaction.merchantId!, transaction.taptStoneId, { 
          type: 'nfc_payment_completed', 
          transaction: updatedTransaction,
          paymentMethod: paymentMethod || 'contactless_card'
        });

        if (updatedTransaction) {
          sendPushToMerchant(transaction.merchantId!, "completed", transaction.itemName, transaction.price, transaction.id).catch(() => {});
        }
        
        res.json({ 
          message: "NFC payment completed successfully", 
          status: "completed",
          transaction: updatedTransaction
        });
      } else {
        // Real Windcave NFC processing would go here
        res.json({ 
          message: "NFC payment session created", 
          status: "processing",
          windcaveSession: "Real NFC processing not implemented yet" 
        });
      }
    } catch (error) {
      console.error("NFC payment completion error:", error);
      res.status(500).json({ message: "Failed to complete NFC payment" });
    }
  });

  // Get NFC payment capabilities for a device
  app.get("/api/nfc/capabilities", (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    const isIOS = /iPhone|iPad|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isDesktop = !isIOS && !isAndroid;
    
    const capabilities = {
      nfcSupported: !isDesktop,
      applePay: isIOS,
      googlePay: isAndroid,
      samsungPay: isAndroid && /Samsung/.test(userAgent),
      contactlessCard: true,
      webNFC: 'NDEFReader' in global, // Web NFC API support
      recommendations: []
    };
    
    if (isIOS) {
      (capabilities.recommendations as string[]).push("Use Apple Pay for fastest checkout");
    } else if (isAndroid) {
      (capabilities.recommendations as string[]).push("Use Google Pay or tap your card");
    } else {
      (capabilities.recommendations as string[]).push("Use QR code for payment on desktop");
    }
    
    res.json(capabilities);
  });

  // Process payment — creates Windcave HPP session and returns redirect URL
  app.post("/api/transactions/:id/pay", async (req, res) => {
    try {
      // SECURITY: Rate limiting for payment attempts
      const clientIp = req.ip || 'unknown';
      if (!checkRateLimit(clientIp)) {
        console.warn(`SECURITY: Rate limit exceeded for IP ${clientIp} on payment endpoint`);
        return res.status(429).json({ message: "Too many payment attempts. Please try again later." });
      }
      
      // SECURITY: Validate request body schema
      const paymentRequestSchema = z.object({
        merchantId: z.number().int().positive().optional(),
        stoneId: z.number().int().positive().optional().nullable(),
        paymentMethod: z.string().optional(),
        cardLast4: z.string().optional(),
        amount: z.string().optional(),
      });
      
      const validation = paymentRequestSchema.safeParse(req.body);
      if (!validation.success) {
        console.warn(`SECURITY: Invalid payment request body from IP ${clientIp}:`, validation.error.errors);
        return res.status(400).json({ 
          message: "Invalid payment request data",
          errors: validation.error.errors 
        });
      }
      
      const transactionId = parseInt(req.params.id);
      const { merchantId: requestMerchantId, stoneId: requestStoneId, amount: requestAmount } = validation.data;
      
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        console.warn(`SECURITY: Payment attempt for non-existent transaction ${transactionId} from IP ${clientIp}`);
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      // SECURITY: Verify the transaction belongs to the claimed merchant
      if (requestMerchantId && transaction.merchantId !== requestMerchantId) {
        console.warn(`SECURITY: Cross-merchant payment attempt! Transaction ${transactionId} belongs to merchant ${transaction.merchantId} but request claimed merchant ${requestMerchantId}, IP ${clientIp}`);
        return res.status(403).json({ message: "Transaction verification failed" });
      }
      
      // SECURITY: Verify the transaction belongs to the claimed stone (if stone-specific)
      if (requestStoneId !== undefined && transaction.taptStoneId !== requestStoneId) {
        console.warn(`SECURITY: Cross-stone payment attempt! Transaction ${transactionId} belongs to stone ${transaction.taptStoneId} but request claimed stone ${requestStoneId}, IP ${clientIp}`);
        return res.status(403).json({ message: "Transaction verification failed" });
      }
      
      // SECURITY: If stone is specified in request, verify it exists and belongs to merchant
      if (requestStoneId !== undefined && requestStoneId !== null) {
        const stone = await storage.getTaptStone(requestStoneId);
        if (!stone || stone.merchantId !== transaction.merchantId) {
          console.warn(`SECURITY: Invalid stone ${requestStoneId} for merchant ${transaction.merchantId}, IP ${clientIp}`);
          return res.status(403).json({ message: "Invalid stone verification" });
        }
      }
      
      // SECURITY + IDEMPOTENCY: Verify transaction is in a valid state for payment
      if (transaction.status === "completed") {
        console.warn(`SECURITY: Payment attempt on already completed transaction ${transactionId} from IP ${clientIp}`);
        return res.status(409).json({ message: "Transaction already completed", idempotent: true });
      }
      
      if (transaction.status === "failed") {
        console.warn(`SECURITY: Payment attempt on failed transaction ${transactionId} from IP ${clientIp}`);
        return res.status(400).json({ message: "Transaction has failed and cannot be paid" });
      }

      if (transaction.status === "processing") {
        console.warn(`IDEMPOTENCY: Payment already processing for transaction ${transactionId} from IP ${clientIp}`);
        return res.status(409).json({ message: "Payment is already being processed", idempotent: true });
      }
      
      // AUDIT: Log payment attempt
      console.log(`Payment initiated for transaction ${transactionId}, merchant ${transaction.merchantId}, stone ${transaction.taptStoneId || 'none'}, IP ${clientIp}`);

      // Idempotency: if already approved, return success immediately
      if (transaction.windcaveSessionState === 'approved') {
        return res.json({ status: 'completed', message: 'Transaction already completed' });
      }

      let paymentAmount = transaction.price;
      let currentSplit: any = null;

      if (transaction.isSplit) {
        currentSplit = await storage.getNextPendingSplit(transactionId);
        if (!currentSplit) {
          return res.status(400).json({ message: "All splits have been paid" });
        }
        if (requestAmount) {
          const customAmt = parseFloat(requestAmount);
          if (isNaN(customAmt) || customAmt <= 0) {
            return res.status(400).json({ message: "Invalid custom amount" });
          }
          const totalPaid = (transaction.completedSplits || 0) * parseFloat(currentSplit.amount);
          const remaining = parseFloat(transaction.price) - totalPaid;
          if (customAmt > remaining + 0.01) {
            return res.status(400).json({ message: "Custom amount exceeds remaining balance" });
          }
          paymentAmount = requestAmount;
        } else {
          paymentAmount = currentSplit.amount;
        }
      }

      // Build Windcave session
      const baseUrl = getBaseUrl(req);
      const xId = crypto.randomBytes(8).toString('hex');
      const merchantReference = currentSplit
        ? `SPLIT_${currentSplit.id}_TXN_${transactionId}`
        : `TXN_${transactionId}`;

      // Get customer email for 3D Secure (required by Windcave)
      const merchant = await storage.getMerchant(transaction.merchantId!);
      const customerEmail = merchant?.email || 'customer@taptpay.co.nz';

      let sessionResult;
      if (isWindcaveConfigured()) {
        sessionResult = await createWindcaveSession(xId, paymentAmount, merchantReference, customerEmail, baseUrl, transactionId);
      } else {
        sessionResult = simulateCreateSession(merchantReference, baseUrl);
      }

      if (!sessionResult.success) {
        console.error('Windcave session creation failed:', sessionResult.error);
        return res.status(503).json({ message: 'Payment gateway unavailable. Please try again.' });
      }

      if (sessionResult.alreadyComplete) {
        // Session already processed (duplicate X-ID scenario)
        const status = sessionResult.approved ? 'completed' : 'failed';
        const finalTxn = await storage.updateTransactionStatus(transactionId, status, sessionResult.windcaveTransactionId);
        if (finalTxn) {
          broadcastToStone(finalTxn.merchantId!, finalTxn.taptStoneId, { type: 'transaction_updated', transaction: finalTxn });
          sendPushToMerchant(finalTxn.merchantId!, status, finalTxn.itemName, finalTxn.price, finalTxn.id).catch(() => {});
        }
        return res.json({ status, message: sessionResult.approved ? 'Payment already completed' : 'Payment was declined' });
      }

      // Save session tracking info to the transaction
      await storage.updateTransactionWindcaveSession(transactionId, sessionResult.sessionId!, 'pending', xId);

      // Cache the Windcave AJAX URLs server-side — never send these back to the client
      // so the client cannot supply an attacker-controlled URL to our payment endpoints.
      sessionAjaxUrlCache.set(transactionId, {
        ajaxSubmitCardUrl: sessionResult.ajaxSubmitCardUrl,
        ajaxSubmitApplePayUrl: sessionResult.ajaxSubmitApplePayUrl,
        ajaxSubmitGooglePayUrl: sessionResult.ajaxSubmitGooglePayUrl,
      });

      return res.json({
        sessionId: sessionResult.sessionId,
        hppUrl: sessionResult.hppUrl,
        ajaxSubmitCardUrl: sessionResult.ajaxSubmitCardUrl,
        ajaxSubmitApplePayUrl: sessionResult.ajaxSubmitApplePayUrl,
        ajaxSubmitGooglePayUrl: sessionResult.ajaxSubmitGooglePayUrl,
      });
    } catch (error) {
      console.error("Payment processing error:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  // ── Shared helper: finalise a payment (handles split + non-split) ──────────
  async function finaliseHostedPayment(
    transactionId: number,
    approved: boolean,
    windcaveTransactionId: string | undefined,
    paymentMethod?: string
  ): Promise<{ approved: boolean; redirectPath: string }> {
    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) throw new Error(`Transaction ${transactionId} not found`);

    const sessionState = approved ? "approved" : "declined";
    await storage.updateTransactionSessionState(transactionId, sessionState);

    if (paymentMethod && approved) {
      await storage.updateTransactionPaymentMethod(transactionId, paymentMethod);
    }

    if (transaction.isSplit && approved) {
      // Split payment: update the individual split record, not the whole transaction
      const currentSplit = await storage.getNextPendingSplit(transactionId);
      if (currentSplit) {
        await storage.updateSplitPaymentStatus(currentSplit.id, "completed", windcaveTransactionId);
        await storage.createPlatformFee({
          transactionId,
          merchantId: transaction.merchantId,
          feeAmount: currentSplit.platformFeeAmount || "0.10",
          transactionAmount: currentSplit.amount,
          status: "collected",
        });
        if (transaction.merchantId) {
          await storage.incrementTransactionCount(transaction.merchantId);
        }
      }
      const freshTxn = await storage.getTransaction(transactionId);
      if (freshTxn) {
        const allDone = (freshTxn.completedSplits ?? 0) >= (freshTxn.totalSplits ?? 1);
        const pushMsg = allDone
          ? `Split bill fully paid — ${freshTxn.totalSplits} payments received`
          : `Split payment ${freshTxn.completedSplits} of ${freshTxn.totalSplits} received`;
        broadcastToStone(freshTxn.merchantId!, freshTxn.taptStoneId, { type: "transaction_updated", transaction: freshTxn });
        sendPushToMerchant(freshTxn.merchantId!, allDone ? "completed" : "pending", pushMsg, freshTxn.price, freshTxn.id).catch(() => {});
        // Reset session state so next split can start a new session
        await storage.updateTransactionSessionState(transactionId, "pending");
        return { approved: true, redirectPath: `/receipt/${transactionId}` };
      }
    } else {
      const finalStatus = approved ? "completed" : "failed";
      const finalTxn = await storage.updateTransactionStatus(transactionId, finalStatus, windcaveTransactionId);
      if (finalTxn && approved) {
        await storage.createPlatformFee({
          transactionId,
          merchantId: transaction.merchantId,
          feeAmount: transaction.platformFeeAmount || "0.10",
          transactionAmount: transaction.price,
          status: "collected",
        });
        if (transaction.merchantId) {
          await storage.incrementTransactionCount(transaction.merchantId);
        }
        broadcastToStone(finalTxn.merchantId!, finalTxn.taptStoneId, { type: "transaction_updated", transaction: finalTxn });
        sendPushToMerchant(finalTxn.merchantId!, finalStatus, finalTxn.itemName, finalTxn.price, finalTxn.id).catch(() => {});
      } else if (finalTxn) {
        broadcastToStone(finalTxn.merchantId!, finalTxn.taptStoneId, { type: "transaction_updated", transaction: finalTxn });
      }
    }

    return {
      approved,
      redirectPath: approved ? `/receipt/${transactionId}` : `/payment/result/${transactionId}?status=declined`,
    };
  }

  // ── Windcave environment info (for frontend Hosted Fields init) ─────────────
  app.get("/api/windcave/env", (_req, res) => {
    // googlePayEnv is independent of Windcave's env — it requires domain registration
    // at console.googlepay.com before switching to "PRODUCTION".
    // Set GOOGLE_PAY_ENV=PRODUCTION once the domain is registered.
    const googlePayEnv: "TEST" | "PRODUCTION" =
      process.env.GOOGLE_PAY_ENV === "PRODUCTION" ? "PRODUCTION" : "TEST";
    res.json({
      env: getWindcaveEnv(),
      applePayMerchantId: process.env.WINDCAVE_APPLE_PAY_MERCHANT_ID || "",
      googlePayMerchantId: process.env.WINDCAVE_GOOGLE_PAY_MERCHANT_ID || "",
      googlePayEnv,
    });
  });

  // ── Hosted Fields completion — called by frontend after card/Apple Pay submit ─
  app.post("/api/transactions/:id/hosted-fields-complete", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const { sessionId, paymentMethod } = req.body as { sessionId?: string; paymentMethod?: string };

      if (!sessionId) return res.status(400).json({ message: "sessionId required" });

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) return res.status(404).json({ message: "Transaction not found" });

      // Validate the provided sessionId matches what we stored — prevents session swapping
      if (transaction.windcaveSessionId && transaction.windcaveSessionId !== sessionId) {
        console.error(`[hosted-fields-complete] sessionId mismatch for txn ${transactionId}`);
        return res.status(403).json({ message: "Session ID mismatch" });
      }

      const queryResult = isWindcaveConfigured()
        ? await queryWindcaveSession(sessionId)
        : simulateQuerySession(sessionId);

      const method = paymentMethod === "apple_pay" ? "apple_pay" : "card";
      const result = await finaliseHostedPayment(transactionId, queryResult.approved === true, queryResult.windcaveTransactionId, method);
      return res.json(result);
    } catch (error) {
      console.error("hosted-fields-complete error:", error);
      res.status(500).json({ message: "Failed to finalise payment" });
    }
  });

  // ── Google Pay completion — backend submits token using server-side cached URL ─
  app.post("/api/transactions/:id/googlepay-complete", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      // NOTE: Do NOT accept ajaxSubmitGooglePayUrl from the client — SSRF risk.
      // Only googlePayToken comes from the client (the opaque token from Google's SDK).
      const { sessionId, googlePayToken } = req.body as {
        sessionId?: string;
        googlePayToken?: object;
      };

      if (!sessionId) return res.status(400).json({ message: "sessionId required" });

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) return res.status(404).json({ message: "Transaction not found" });

      // Validate sessionId belongs to this transaction
      if (transaction.windcaveSessionId && transaction.windcaveSessionId !== sessionId) {
        console.error(`[googlepay-complete] sessionId mismatch for txn ${transactionId}`);
        return res.status(403).json({ message: "Session ID mismatch" });
      }

      let approved = false;
      let windcaveTransactionId: string | undefined;

      if (!isWindcaveConfigured()) {
        // Simulation mode — treat as approved
        approved = true;
        windcaveTransactionId = `SIMTXN_GPAY_${Date.now()}`;
      } else {
        // Look up the AJAX URL from server-side cache (set at session creation)
        const cachedUrls = sessionAjaxUrlCache.get(transactionId);
        const ajaxUrl = cachedUrls?.ajaxSubmitGooglePayUrl;

        if (ajaxUrl && googlePayToken) {
          // Validate it's a Windcave domain before forwarding credentials
          assertWindcaveUrl(ajaxUrl);
          const gpayResult = await submitGooglePayToken(ajaxUrl, googlePayToken);
          if (gpayResult.error === "3DS_REQUIRED") {
            // 3DS required — fall back to session query to determine outcome
            console.warn(`[googlepay-complete] 3DS required for txn ${transactionId}, querying session`);
            const queryResult = await queryWindcaveSession(sessionId);
            approved = queryResult.approved === true;
            windcaveTransactionId = queryResult.windcaveTransactionId;
          } else {
            approved = gpayResult.approved === true;
            windcaveTransactionId = gpayResult.windcaveTransactionId;
          }
        } else {
          // URL not cached (session may have been created before this deploy) — fall back to query
          console.warn(`[googlepay-complete] No cached AJAX URL for txn ${transactionId}, falling back to session query`);
          const queryResult = await queryWindcaveSession(sessionId);
          approved = queryResult.approved === true;
          windcaveTransactionId = queryResult.windcaveTransactionId;
        }

        // Clear cache entry after use
        sessionAjaxUrlCache.delete(transactionId);
      }

      const result = await finaliseHostedPayment(transactionId, approved, windcaveTransactionId, "google_pay");
      return res.json(result);
    } catch (error) {
      console.error("googlepay-complete error:", error);
      res.status(500).json({ message: "Failed to finalise Google Pay payment" });
    }
  });

  // ── Windcave simulation submit endpoint (dev/test mode only) ────────────────
  // Mimics the Windcave ajaxSubmitCard/ApplePay/GooglePay endpoints so that
  // the Hosted Fields and ApplePay SDKs get a plausible success response when
  // running without real Windcave credentials.
  app.post("/api/windcave/sim-submit", (req, res) => {
    const method = (req.query.method as string) || "card";
    console.log(`[SIM_SUBMIT] method=${method} sessionId=${req.query.sessionId}`);
    // Return a minimal JSON structure the Windcave SDKs treat as "done"
    res.json({ status: "done", authorised: true, responseCode: "00" });
  });

  // Get single transaction details
  app.get("/api/transactions/:id", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      res.json(transaction);
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  });

  // Generate PDF receipt
  app.post("/api/transactions/:id/receipt-pdf", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const splitIdParam = req.query.splitId ? parseInt(req.query.splitId as string) : null;
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // For split receipts, allow generating PDF for individual completed splits
      // For full receipts, require the whole transaction to be completed
      let splitInfo: { amount: string; splitNumber: number; totalSplits: number } | undefined;
      if (splitIdParam) {
        const split = await storage.getSplitPaymentById(splitIdParam);
        if (!split || split.status !== "completed") {
          return res.status(400).json({ message: "Split payment not found or not completed" });
        }
        const allSplits = await storage.getSplitPaymentsByTransaction(transactionId);
        const splitNumber = allSplits.findIndex((s: any) => s.id === splitIdParam) + 1;
        splitInfo = {
          amount: split.amount,
          splitNumber: splitNumber > 0 ? splitNumber : 1,
          totalSplits: transaction.totalSplits ?? 1,
        };
      } else if (transaction.status !== "completed") {
        return res.status(400).json({ message: "Cannot generate receipt for incomplete transaction" });
      }

      // Get merchant details for receipt
      const merchant = await storage.getMerchant(transaction.merchantId!);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Generate PDF receipt
      const pdf = await generateReceiptPdf(transaction, merchant, splitInfo);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=receipt-${transaction.id}-${new Date().toISOString().split('T')[0]}.pdf`);
      res.send(pdf);
    } catch (error) {
      console.error("Error generating PDF receipt:", error);
      res.status(500).json({ message: "Failed to generate PDF receipt" });
    }
  });

  // Generate QR code linking to receipt page (public — customer scans on their own device)
  app.get("/api/transactions/:id/receipt-qr", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      if (isNaN(transactionId)) {
        return res.status(400).json({ message: "Invalid transaction ID" });
      }

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      const size = Math.min(parseInt(req.query.size as string) || 300, 800);
      const receiptUrl = `${getBaseUrl(req)}/receipt/${transactionId}`;

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days

      const qrBuffer = await QRCode.toBuffer(receiptUrl, {
        type: 'png',
        width: size,
        margin: 2,
        color: {
          dark: '#00E5CC',
          light: '#00000000',
        },
        errorCorrectionLevel: 'M',
      });

      res.send(qrBuffer);
    } catch (error) {
      console.error("Receipt QR generation error:", error);
      res.status(500).json({ message: "Failed to generate receipt QR code" });
    }
  });

  // Get merchant analytics
  app.get("/api/merchants/:id/analytics", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const analytics = await storage.getMerchantAnalytics(merchantId);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // Get revenue over time data
  app.get("/api/merchants/:id/revenue-over-time", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const days = parseInt(req.query.days as string) || 30;
      const revenueData = await storage.getRevenueOverTime(merchantId, days);
      res.json(revenueData);
    } catch (error) {
      console.error("Error fetching revenue over time:", error);
      res.status(500).json({ message: "Failed to get revenue data" });
    }
  });

  // Get merchant analytics with date range
  app.get("/api/merchants/:id/analytics/export", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const analytics = await storage.getMerchantAnalyticsWithDateRange(merchantId, start, end);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics with date range:", error);
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // Export transactions as CSV
  app.get("/api/merchants/:id/export/csv", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const transactions = await storage.getTransactionsByMerchantWithDateRange(merchantId, start, end);
      
      // Generate CSV headers
      const headers = [
        "Transaction ID",
        "Date & Time", 
        "Item Name",
        "Amount (NZD)",
        "Status",
        "Payment Reference"
      ];
      
      // Escape one CSV field: RFC-4180 quote-wrap (doubling internal quotes) and
      // neutralise formula injection (a leading = + - @ makes Excel/Sheets execute
      // the cell). Mirrors client csvCell() in report-utils.
      const csvCell = (value: unknown): string => {
        let s = value == null ? "" : String(value);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      };

      // Generate CSV content
      const csvRows = [headers.map(csvCell).join(",")];

      transactions.forEach(transaction => {
        const row = [
          transaction.id,
          transaction.createdAt ? new Date(transaction.createdAt).toLocaleString('en-NZ') : 'N/A',
          transaction.itemName,
          `$${parseFloat(transaction.price).toFixed(2)}`,
          transaction.status,
          transaction.windcaveTransactionId || 'N/A'
        ].map(csvCell);
        csvRows.push(row.join(","));
      });
      
      const csvContent = csvRows.join("\n");
      
      // Set response headers for CSV download
      const dateRange = start || end ? 
        `_${start?.toISOString().split('T')[0] || 'beginning'}_to_${end?.toISOString().split('T')[0] || 'today'}` : 
        '_all_time';
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=tapt_transactions${dateRange}.csv`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error generating CSV export:", error);
      res.status(500).json({ message: "Failed to generate CSV export" });
    }
  });

  // Export business report as PDF
  app.get("/api/merchants/:id/export/pdf", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      // Get analytics and transactions for the report
      const analytics = await storage.getMerchantAnalyticsWithDateRange(merchantId, start, end);
      const transactions = await storage.getTransactionsByMerchantWithDateRange(merchantId, start, end);
      const merchant = await storage.getMerchant(merchantId);
      
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      
      // Generate PDF report
      const pdf = await generateBusinessReportPdf(analytics, transactions, merchant);
      
      // Set response headers for PDF download
      const dateRange = start || end ? 
        `_${start?.toISOString().split('T')[0] || 'beginning'}_to_${end?.toISOString().split('T')[0] || 'today'}` : 
        '_all_time';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=tapt_business_report${dateRange}.pdf`);
      res.send(pdf);
    } catch (error) {
      console.error("Error generating PDF report:", error);
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  // ======================
  // Admin manual merchant verification (mark as verified directly)
  app.post("/api/admin/merchants/:id/verify", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      if (merchant.status === 'verified') {
        return res.status(400).json({ message: "Merchant is already verified" });
      }

      if (!merchant.passwordHash) {
        return res.status(400).json({ message: "Merchant has not set a password yet. Resend the verification email first, or use the activate endpoint with a password." });
      }

      const updatedMerchant = await storage.updateMerchantStatus(merchantId, 'verified');

      if (!updatedMerchant) {
        return res.status(500).json({ message: "Failed to verify merchant" });
      }

      // Sync auth users so the merchant can log in immediately
      await syncVerifiedMerchants();

      res.json({
        message: "Merchant verified successfully",
        merchant: {
          id: updatedMerchant.id,
          name: updatedMerchant.name,
          businessName: updatedMerchant.businessName,
          email: updatedMerchant.email,
          status: updatedMerchant.status
        }
      });

    } catch (error) {
      console.error("Admin verification error:", error);
      res.status(500).json({ message: "Failed to verify merchant" });
    }
  });

  // Admin set merchant status to 'active' (Windcave onboarding complete)
  app.post("/api/admin/merchants/:id/set-active", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      if (merchant.status === 'active') return res.status(400).json({ message: "Merchant is already active" });

      const updated = await storage.updateMerchantStatus(merchantId, 'active');
      if (!updated) return res.status(500).json({ message: "Failed to activate merchant" });

      res.json({ message: "Merchant activated successfully", merchant: { id: updated.id, status: updated.status } });
    } catch (error) {
      console.error("Admin activate merchant error:", error);
      res.status(500).json({ message: "Failed to activate merchant" });
    }
  });

  app.get("/api/admin/merchants/:id/transactions", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (isNaN(merchantId)) return res.status(400).json({ message: "Invalid merchant ID" });
      const txList = await storage.getTransactionsByMerchant(merchantId);
      res.json(txList);
    } catch (error) {
      console.error("Admin fetch transactions error:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Update Windcave Merchant ID (admin only)
  app.patch("/api/admin/merchants/:id/windcave-merchant-id", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { windcaveMerchantId } = req.body;
      if (isNaN(merchantId)) return res.status(400).json({ message: "Invalid merchant ID" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      await storage.updateMerchant(merchantId, { windcaveMerchantId: windcaveMerchantId || null });
      res.json({ message: "Windcave Merchant ID updated" });
    } catch (error) {
      console.error("Windcave merchant ID update error:", error);
      res.status(500).json({ message: "Failed to update Windcave Merchant ID" });
    }
  });

  // Admin manual merchant activation with password (bypass email verification)
  app.post("/api/admin/merchants/:id/activate", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password is required for activation" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      if (merchant.status === 'verified') {
        return res.status(400).json({ message: "Merchant already verified" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const updatedMerchant = await storage.verifyMerchant(merchant.verificationToken || '', passwordHash);

      if (!updatedMerchant) {
        return res.status(500).json({ message: "Failed to activate merchant" });
      }

      res.json({
        message: "Merchant activated successfully",
        merchant: {
          id: updatedMerchant.id,
          name: updatedMerchant.name,
          businessName: updatedMerchant.businessName,
          email: updatedMerchant.email,
          status: updatedMerchant.status
        }
      });

    } catch (error) {
      console.error("Admin activation error:", error);
      res.status(500).json({ message: "Failed to activate merchant" });
    }
  });

  // Update merchant rates
  app.put("/api/merchants/:id/rates", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validation = updateMerchantRatesSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid rate data", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantRates(merchantId, validation.data.currentProviderRate);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update rates" });
    }
  });

  // Update merchant business details
  app.put("/api/merchants/:id/details", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validation = updateMerchantDetailsSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid merchant details", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantDetails(merchantId, validation.data);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update merchant details" });
    }
  });

  // Update merchant bank account details
  // Change merchant password
  app.put("/api/merchants/:id/change-password", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const validation = changePasswordSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validation.error.errors 
        });
      }

      const { currentPassword, newPassword } = validation.data;

      // Get merchant to verify current password
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant || !merchant.passwordHash) {
        return res.status(404).json({ message: "Merchant not found or password not set" });
      }

      // Verify current password
      const currentPasswordValid = await bcrypt.compare(currentPassword, merchant.passwordHash);
      if (!currentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update
      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      const updatedMerchant = await storage.verifyMerchant(merchant.verificationToken || '', newPasswordHash);

      if (!updatedMerchant) {
        return res.status(500).json({ message: "Failed to update password" });
      }

      res.json({ message: "Password updated successfully" });

    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.put("/api/merchants/:id/bank-account", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ message: "Merchant bank account details are no longer collected" });
  });

  app.put("/api/merchants/:id/theme", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validation = updateThemeSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid theme selection", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantTheme(merchantId, validation.data.themeId);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      console.error("Error updating theme:", error);
      res.status(500).json({ message: "Failed to update theme" });
    }
  });

  // Update merchant daily goal
  app.put("/api/merchants/:id/daily-goal", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      
      // Verify user owns this merchant
      if (!req.user || req.user.merchantId !== merchantId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const validation = updateDailyGoalSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid daily goal", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchant(merchantId, { 
        dailyGoal: validation.data.dailyGoal 
      });
      
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      console.error("Error updating daily goal:", error);
      res.status(500).json({ message: "Failed to update daily goal" });
    }
  });

  // Update merchant (general purpose endpoint for merchant-editable fields only)
  app.put("/api/merchants/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      
      // Verify user owns this merchant
      if (!req.user || req.user.merchantId !== merchantId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // Validation schema for allowed merchant updates
      const updateSchema = z.object({
        businessName: z.string().optional(),
        director: z.string().optional(),
        address: z.string().optional(),
        nzbn: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        gstNumber: z.string().optional(),
        windcaveApiKey: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        businessAddress: z.string().optional(),
      }).strict(); // Reject any fields not in the schema

      // Validate and parse request body
      const parseResult = updateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid fields", 
          errors: parseResult.error.errors 
        });
      }

      const updates = parseResult.data;

      // Remove undefined fields
      const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
      );

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updatedMerchant = await storage.updateMerchant(merchantId, filteredUpdates);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      console.error("Update merchant error:", error);
      res.status(500).json({ message: "Failed to update merchant" });
    }
  });

  // Upload merchant logo
  app.post("/api/merchants/:id/logo", authenticateToken, logoUpload.single('logo'), async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      
      // Verify user owns this merchant
      if (!req.user || req.user.merchantId !== merchantId) {
        // Clean up uploaded file if unauthorized
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Verify PNG magic bytes (89 50 4E 47 0D 0A 1A 0A) regardless of client-supplied MIME type
      const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (req.file.buffer.length < 8 || !req.file.buffer.subarray(0, 8).equals(PNG_MAGIC)) {
        return res.status(400).json({ message: "Invalid file: only PNG images are accepted" });
      }

      const filename = `merchant-${merchantId}${path.extname(req.file.originalname) || '.png'}`;
      const logoUrl = `/uploads/logos/${filename}`;

      // Persist the file first so the merchant row never points at a missing file
      await saveUploadedFile(`logos/${filename}`, 'image/png', req.file.buffer);

      const updatedMerchant = await storage.updateMerchantLogoUrl(merchantId, logoUrl);
      if (!updatedMerchant) {
        await db.delete(uploadedFiles).where(eq(uploadedFiles.path, `logos/${filename}`));
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json({ logoUrl, message: "Logo uploaded successfully" });
    } catch (error) {
      console.error("Logo upload error:", error);
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // Delete merchant logo
  app.delete("/api/merchants/:id/logo", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      
      // Verify user owns this merchant
      if (!req.user || req.user.merchantId !== merchantId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Delete the file from disk if it exists
      if (merchant.customLogoUrl) {
        const filepath = path.join(process.cwd(), merchant.customLogoUrl);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }

      // Remove logo URL from database
      const updatedMerchant = await storage.updateMerchantLogoUrl(merchantId, null);
      
      res.json({ message: "Logo deleted successfully" });
    } catch (error) {
      console.error("Logo deletion error:", error);
      res.status(500).json({ message: "Failed to delete logo" });
    }
  });

  // Get all transactions for merchant (for dashboard)
  app.get("/api/merchants/:id/transactions", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const transactions = await storage.getTransactionsByMerchant(merchantId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to get transactions" });
    }
  });

  // Tapt Stone API routes
  
  // Get all tapt stones for a merchant
  app.get("/api/merchants/:id/tapt-stones", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const stones = await storage.getTaptStonesByMerchant(merchantId);
      res.json(stones);
    } catch (error) {
      console.error("Error fetching tapt stones:", error);
      res.status(500).json({ message: "Failed to get tapt stones" });
    }
  });

  // Create a new tapt stone
  app.post("/api/merchants/:id/tapt-stones", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Check if merchant exists
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get existing stones count to determine next stone number
      const existingStones = await storage.getTaptStonesByMerchant(merchantId);
      const nextStoneNumber = existingStones.length + 1;

      // Check if merchant already has 10 stones (max limit)
      if (existingStones.length >= 10) {
        return res.status(400).json({ message: "Maximum 10 tapt stones allowed per merchant" });
      }

      const validation = createTaptStoneSchema.safeParse({
        merchantId,
        name: `Stone ${nextStoneNumber}`,
        stoneNumber: nextStoneNumber,
      });

      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid tapt stone data", 
          errors: validation.error.errors 
        });
      }

      const newStone = await storage.createTaptStone(validation.data);
      
      // Generate QR code and payment URL for the new stone
      const baseUrl = getBaseUrl(req);
      const stoneId = Number(newStone.id); // Ensure it's a number
      const qrCodeUrl = generateQrCodeUrl(merchantId, stoneId);
      const paymentUrl = generatePaymentUrl(merchantId, stoneId);
      
      // Update the stone with the URLs
      const updatedStone = await storage.updateTaptStoneUrls(newStone.id, qrCodeUrl, paymentUrl);
      
      res.json(updatedStone);
    } catch (error) {
      console.error("Error creating tapt stone:", error);
      res.status(500).json({ message: "Failed to create tapt stone" });
    }
  });

  // Update a tapt stone name
  app.put("/api/merchants/:merchantId/tapt-stones/:stoneId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const stoneId = parseInt(req.params.stoneId);
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Valid stone name is required" });
      }

      // Verify the stone belongs to this merchant (cross-tenant guard)
      const existingStone = await storage.getTaptStone(stoneId);
      if (!existingStone || existingStone.merchantId !== merchantId) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      const updatedStone = await storage.updateTaptStone(stoneId, { name: name.trim() });
      
      if (!updatedStone) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }
      
      res.json(updatedStone);
    } catch (error) {
      console.error("Error updating tapt stone:", error);
      res.status(500).json({ message: "Failed to update tapt stone" });
    }
  });

  // Delete a tapt stone
  app.delete("/api/merchants/:merchantId/tapt-stones/:stoneId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const stoneId = parseInt(req.params.stoneId);

      // Verify the stone belongs to this merchant (cross-tenant guard)
      const existingStone = await storage.getTaptStone(stoneId);
      if (!existingStone || existingStone.merchantId !== merchantId) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      const success = await storage.deleteTaptStone(stoneId);

      if (!success) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      res.json({ message: "Tapt stone deleted successfully" });
    } catch (error) {
      console.error("Error deleting tapt stone:", error);
      res.status(500).json({ message: "Failed to delete tapt stone" });
    }
  });

  // (Removed unauthenticated legacy DELETE /api/tapt-stones/:id — it let anyone
  // delete any merchant's stone by id. Clients use the authenticated, ownership-checked
  // /api/merchants/:merchantId/tapt-stones/:stoneId route.)

  // Get specific tapt stone details
  app.get("/api/tapt-stones/:id", async (req, res) => {
    try {
      const stoneId = parseInt(req.params.id);
      const stone = await storage.getTaptStone(stoneId);
      
      if (!stone || !stone.isActive) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }
      
      res.json(stone);
    } catch (error) {
      console.error("Error fetching tapt stone:", error);
      res.status(500).json({ message: "Failed to get tapt stone" });
    }
  });

  // Platform fee analytics (admin only)
  app.get("/api/admin/platform-fees", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const totalFees = await storage.getTotalPlatformRevenue();
      res.json(totalFees);
    } catch (error) {
      console.error("Error fetching platform fees:", error);
      res.status(500).json({ message: "Failed to fetch platform fees" });
    }
  });

  // Windcave notification — Windcave sends GET with ?sessionid=XXX in the URL (per pseudo code v1.5)
  // Also handles POST for compatibility with other Windcave configurations
  app.all("/api/windcave/notification", express.urlencoded({ extended: true }), express.json(), async (req, res) => {
    // Always respond 200 quickly to stop Windcave retrying
    res.status(200).send("OK");

    try {
      // Per Windcave pseudo code: sessionId is a URL query parameter (Request.Url.getParameter("sessionid"))
      const sessionId = (req.query?.sessionid as string) || (req.query?.sessionId as string) || req.body?.sessionId || req.body?.sessionid;
      console.log(`[WINDCAVE_NOTIF] ${req.method} notification received, sessionId=${sessionId}, query=${JSON.stringify(req.query)}`);
      if (!sessionId) {
        console.warn('[WINDCAVE_NOTIF] No sessionId found. Query:', req.query, 'Body:', req.body);
        return;
      }

      console.log(`[WINDCAVE_NOTIF] Received for session ${sessionId}`);

      const transaction = await storage.getTransactionByWindcaveSessionId(sessionId);
      if (!transaction) {
        console.warn(`[WINDCAVE_NOTIF] No transaction found for session ${sessionId}`);
        return;
      }

      // Only process if still pending (atomic state transition)
      if (transaction.windcaveSessionState !== 'pending') {
        console.log(`[WINDCAVE_NOTIF] Session ${sessionId} already processed (state: ${transaction.windcaveSessionState})`);
        return;
      }

      // Mark as processing to prevent concurrent handling
      await storage.updateTransactionSessionState(transaction.id, 'processing');

      const queryResult = isWindcaveConfigured()
        ? await queryWindcaveSession(sessionId)
        : simulateQuerySession(sessionId);

      if (!queryResult.success) {
        console.error(`[WINDCAVE_NOTIF] querySession failed for ${sessionId}:`, queryResult.error);
        await storage.updateTransactionSessionState(transaction.id, 'pending');
        return;
      }

      const newSessionState = queryResult.approved ? 'approved' : 'declined';
      await storage.updateTransactionSessionState(transaction.id, newSessionState);

      let broadcastTxn: any = null;

      if (transaction.isSplit && queryResult.approved) {
        // Split payment: update the individual split record, not the whole transaction
        const currentSplit = await storage.getNextPendingSplit(transaction.id);
        if (currentSplit) {
          await storage.updateSplitPaymentStatus(currentSplit.id, 'completed', queryResult.windcaveTransactionId);
          await storage.createPlatformFee({
            transactionId: transaction.id,
            merchantId: transaction.merchantId,
            feeAmount: currentSplit.platformFeeAmount || '0.10',
            transactionAmount: currentSplit.amount,
            status: 'collected',
          });
          if (transaction.merchantId) {
            await storage.incrementTransactionCount(transaction.merchantId);
          }
        }
        // Fetch the freshly updated transaction so completedSplits is correct
        broadcastTxn = await storage.getTransaction(transaction.id);
        if (broadcastTxn) {
          const allDone = (broadcastTxn.completedSplits ?? 0) >= (broadcastTxn.totalSplits ?? 1);
          const pushMsg = allDone
            ? `Split bill fully paid — ${broadcastTxn.totalSplits} payments received`
            : `Split payment ${broadcastTxn.completedSplits} of ${broadcastTxn.totalSplits} received`;
          broadcastToStone(broadcastTxn.merchantId!, broadcastTxn.taptStoneId, { type: 'transaction_updated', transaction: broadcastTxn });
          sendPushToMerchant(broadcastTxn.merchantId!, allDone ? 'completed' : 'pending', pushMsg, broadcastTxn.price, broadcastTxn.id).catch(() => {});
        }
      } else {
        // Standard (non-split) transaction
        const finalStatus = queryResult.approved ? 'completed' : 'failed';
        const updatedTxn = await storage.updateTransactionStatus(transaction.id, finalStatus, queryResult.windcaveTransactionId);
        if (updatedTxn && queryResult.approved) {
          await storage.createPlatformFee({
            transactionId: transaction.id,
            merchantId: transaction.merchantId,
            feeAmount: transaction.platformFeeAmount || '0.10',
            transactionAmount: transaction.price,
            status: 'collected',
          });
          if (transaction.merchantId) {
            await storage.incrementTransactionCount(transaction.merchantId);
          }
        }
        broadcastTxn = updatedTxn;
        if (broadcastTxn) {
          broadcastToStone(broadcastTxn.merchantId!, broadcastTxn.taptStoneId, { type: 'transaction_updated', transaction: broadcastTxn });
          sendPushToMerchant(broadcastTxn.merchantId!, finalStatus, broadcastTxn.itemName, broadcastTxn.price, broadcastTxn.id).catch(() => {});
        }
      }

      console.log(`[WINDCAVE_NOTIF] Transaction ${transaction.id} processed (split=${transaction.isSplit})`);

    } catch (error) {
      console.error('[WINDCAVE_NOTIF] Error processing notification:', error);
    }
  });

  // Windcave callback — customer browser redirected here after paying on HPP
  app.get("/api/windcave/callback", async (req, res) => {
    try {
      const resultParam = req.query.result as string;
      const isSim = req.query.sim === '1';

      // Primary lookup: by transactionId (new approach — avoids Windcave {id} template issues)
      const txnIdParam = req.query.transactionId as string;
      // Fallback: by sessionId (legacy / simulation)
      const sessionId = req.query.sessionid as string || req.query.sessionId as string;

      console.log(`[WINDCAVE_CALLBACK] transactionId=${txnIdParam} sessionId=${sessionId} result=${resultParam}`);

      let transaction: any = null;

      if (txnIdParam) {
        transaction = await storage.getTransaction(parseInt(txnIdParam));
      } else if (sessionId) {
        transaction = await storage.getTransactionByWindcaveSessionId(sessionId);
      }

      if (!transaction) {
        console.warn(`[WINDCAVE_CALLBACK] No transaction found (txnId=${txnIdParam}, session=${sessionId})`);
        return res.redirect('/');
      }

      const txnId = transaction.id;

      // Handle cancelled — don't charge, just update status.
      // Guard: only trust the cancel signal if the sessionId in the URL matches what
      // we stored for this transaction, preventing a DoS where an attacker fires
      // ?transactionId=X&result=cancelled with an arbitrary/missing sessionId.
      if (resultParam === 'cancelled') {
        const cancelSessionId = req.query.sessionid as string || req.query.sessionId as string;
        const sessionMatches =
          cancelSessionId && transaction.windcaveSessionId &&
          cancelSessionId === transaction.windcaveSessionId;
        if (sessionMatches && transaction.windcaveSessionState === 'pending') {
          await storage.updateTransactionStatus(txnId, 'failed');
          await storage.updateTransactionSessionState(txnId, 'declined');
          broadcastToStone(transaction.merchantId!, transaction.taptStoneId, {
            type: 'transaction_updated',
            transaction: { ...transaction, status: 'failed' }
          });
          return res.redirect(`/payment/result/${txnId}?status=cancelled`);
        } else if (!sessionMatches) {
          // Mismatched or absent sessionId — possible DoS probe, not a real browser redirect.
          // Do not update state; redirect neutrally so the notification handler resolves it.
          console.warn(`[WINDCAVE_CALLBACK] Ignoring cancel for txn ${txnId} — sessionId mismatch (got=${cancelSessionId}, expected=${transaction.windcaveSessionId})`);
          return res.redirect(`/payment/result/${txnId}?status=pending`);
        }
        // Already processed (not pending) — show the existing result
        return res.redirect(`/payment/result/${txnId}?status=cancelled`);
      }

      // If notification already processed this, redirect based on known state
      if (transaction.windcaveSessionState === 'approved') {
        return res.redirect(`/receipt/${txnId}`);
      }
      if (transaction.windcaveSessionState === 'declined') {
        return res.redirect(`/payment/result/${txnId}?status=declined`);
      }

      // Notification hasn't arrived yet (or sim mode) — query Windcave ourselves
      const sessionToQuery = transaction.windcaveSessionId || sessionId;

      if (!sessionToQuery && !isSim) {
        console.warn(`[WINDCAVE_CALLBACK] No session ID available to query for transaction ${txnId}`);
        return res.redirect(`/payment/result/${txnId}?status=${resultParam || 'declined'}`);
      }

      await storage.updateTransactionSessionState(txnId, 'processing');

      const queryResult = isWindcaveConfigured() && !isSim && sessionToQuery
        ? await queryWindcaveSession(sessionToQuery)
        : simulateQuerySession(sessionToQuery || 'sim');

      const newSessionState = queryResult.approved ? 'approved' : 'declined';
      await storage.updateTransactionSessionState(txnId, newSessionState);

      let broadcastTxn: any = null;

      if (transaction.isSplit && queryResult.approved) {
        // Split payment: update the individual split record, not the whole transaction status
        const currentSplit = await storage.getNextPendingSplit(txnId);
        if (currentSplit) {
          await storage.updateSplitPaymentStatus(currentSplit.id, 'completed', queryResult.windcaveTransactionId);
          await storage.createPlatformFee({
            transactionId: txnId,
            merchantId: transaction.merchantId,
            feeAmount: currentSplit.platformFeeAmount || '0.10',
            transactionAmount: currentSplit.amount,
            status: 'collected',
          });
          if (transaction.merchantId) {
            await storage.incrementTransactionCount(transaction.merchantId);
          }
        }
        // Fetch the freshly updated transaction so completedSplits is correct
        broadcastTxn = await storage.getTransaction(txnId);
        if (broadcastTxn) {
          const allDone = (broadcastTxn.completedSplits ?? 0) >= (broadcastTxn.totalSplits ?? 1);
          const pushMsg = allDone
            ? `Split bill fully paid — ${broadcastTxn.totalSplits} payments received`
            : `Split payment ${broadcastTxn.completedSplits} of ${broadcastTxn.totalSplits} received`;
          broadcastToStone(broadcastTxn.merchantId!, broadcastTxn.taptStoneId, { type: 'transaction_updated', transaction: broadcastTxn });
          sendPushToMerchant(broadcastTxn.merchantId!, allDone ? 'completed' : 'pending', pushMsg, broadcastTxn.price, broadcastTxn.id).catch(() => {});
        }

        console.log(`[WINDCAVE_CALLBACK] Transaction ${txnId} split payment recorded`);

        // Redirect to receipt for this individual payer
        const splitReceiptId = currentSplit ? currentSplit.id : '';
        return res.redirect(`/receipt/${txnId}?splitId=${splitReceiptId}`);
      } else {
        // Standard (non-split) or failed transaction
        const finalStatus = queryResult.approved ? 'completed' : 'failed';
        const updatedTxn = await storage.updateTransactionStatus(txnId, finalStatus, queryResult.windcaveTransactionId);
        if (updatedTxn && queryResult.approved) {
          await storage.createPlatformFee({
            transactionId: txnId,
            merchantId: transaction.merchantId,
            feeAmount: transaction.platformFeeAmount || '0.10',
            transactionAmount: transaction.price,
            status: 'collected',
          });
          if (transaction.merchantId) {
            await storage.incrementTransactionCount(transaction.merchantId);
          }
        }
        broadcastTxn = updatedTxn;
        if (broadcastTxn) {
          broadcastToStone(broadcastTxn.merchantId!, broadcastTxn.taptStoneId, { type: 'transaction_updated', transaction: broadcastTxn });
          sendPushToMerchant(broadcastTxn.merchantId!, finalStatus, broadcastTxn.itemName, broadcastTxn.price, broadcastTxn.id).catch(() => {});
        }

        console.log(`[WINDCAVE_CALLBACK] Transaction ${txnId} → ${finalStatus}`);

        if (queryResult.approved) return res.redirect(`/receipt/${txnId}`);
        return res.redirect(`/payment/result/${txnId}?status=declined`);
      }
    } catch (error) {
      console.error('[WINDCAVE_CALLBACK] Error:', error);
      res.redirect('/');
    }
  });

  // Check Windcave configuration status
  app.get("/api/windcave/status", (req, res) => {
    const configured = isWindcaveConfigured();
    res.json({
      configured,
      mode: configured ? "live" : "simulation",
      message: configured
        ? "Windcave API is configured and ready (UAT)"
        : "Running in simulation mode. Configure WINDCAVE_USERNAME and WINDCAVE_API_KEY to enable live payments.",
      endpoint: process.env.WINDCAVE_ENDPOINT || "https://uat.windcave.com/api/v1",
    });
  });

  // Admin Analytics endpoint
  app.get("/api/admin/analytics", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // Get all merchants from storage
      const merchants = await storage.getAllMerchants();

      let totalRevenue = 0;
      let totalTransactions = 0;
      let totalCompletedTransactions = 0;
      const recentMerchants = [];

      for (const merchant of merchants) {
        try {
          const analytics = await storage.getMerchantAnalytics(merchant.id);
          const transactions = await storage.getTransactionsByMerchant(merchant.id);
          
          totalRevenue += analytics.totalRevenue || 0;
          totalTransactions += analytics.totalTransactions || 0;
          totalCompletedTransactions += analytics.completedTransactions || 0;

          // Get last transaction date
          const completedTransactionsList = transactions.filter(t => t.status === 'completed' && t.createdAt);
          const lastTransaction = completedTransactionsList.length > 0 
            ? completedTransactionsList.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
              })[0]
            : null;

          recentMerchants.push({
            id: merchant.id,
            name: merchant.name,
            businessName: merchant.businessName,
            totalTransactions: analytics.totalTransactions || 0,
            totalRevenue: analytics.totalRevenue || 0,
            status: merchant.status,
            lastTransactionDate: lastTransaction?.createdAt || null,
          });
        } catch (error) {
          // If merchant doesn't exist, add with zero values
          recentMerchants.push({
            id: merchant.id,
            name: merchant.name,
            businessName: merchant.businessName,
            totalTransactions: 0,
            totalRevenue: 0,
            status: merchant.status,
            lastTransactionDate: null,
          });
        }
      }

      const activeMerchants = recentMerchants.filter(m => m.status === 'active').length;
      const transactionFeeRevenue = totalCompletedTransactions * 0.10; // $0.10 flat fee per completed transaction

      res.json({
        totalMerchants: merchants.length,
        activeMerchants,
        totalRevenue,
        totalTransactions,
        completedTransactions: totalCompletedTransactions,
        transactionFeeRevenue,
        recentMerchants: recentMerchants.sort((a, b) => b.totalRevenue - a.totalRevenue),
      });
    } catch (error) {
      console.error("Error fetching admin analytics:", error);
      res.status(500).json({ message: "Failed to get admin analytics" });
    }
  });

  // Real daily revenue for last 7 days (admin charts)
  app.get("/api/admin/revenue-over-time", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchants = await storage.getAllMerchants();
      const now = new Date();

      // Build 7-day date buckets
      const days: { date: string; label: string; revenue: number; transactions: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const label = i === 0 ? 'Today' : d.toLocaleDateString('en-NZ', { weekday: 'short' });
        days.push({ date: dateStr, label, revenue: 0, transactions: 0 });
      }

      for (const merchant of merchants) {
        const txs = await storage.getTransactionsByMerchant(merchant.id);
        for (const tx of txs) {
          if (tx.status !== 'completed' || !tx.createdAt) continue;
          const dateStr = new Date(tx.createdAt).toISOString().split('T')[0];
          const bucket = days.find(d => d.date === dateStr);
          if (bucket) {
            bucket.revenue += parseFloat(tx.price);
            bucket.transactions += 1;
          }
        }
      }

      res.json(days.map(d => ({ day: d.label, revenue: parseFloat(d.revenue.toFixed(2)), transactions: d.transactions })));
    } catch (error) {
      console.error("Error fetching revenue over time:", error);
      res.status(500).json({ message: "Failed to get revenue data" });
    }
  });

  // Real payment method breakdown (admin charts)
  app.get("/api/admin/payment-method-breakdown", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchants = await storage.getAllMerchants();
      const counts: Record<string, number> = {};

      for (const merchant of merchants) {
        const txs = await storage.getTransactionsByMerchant(merchant.id);
        for (const tx of txs) {
          if (tx.status !== 'completed') continue;
          const method = tx.paymentMethod || 'qr_code';
          counts[method] = (counts[method] || 0) + 1;
        }
      }

      const colorMap: Record<string, string> = {
        qr_code: '#0055FF',
        nfc_tap: '#00E5CC',
        card_reader: '#10B981',
        cash: '#F59E0B',
        manual: '#8B5CF6',
        contactless_card: '#06B6D4',
      };

      const result = Object.entries(counts).map(([method, value]) => ({
        name: method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
        color: colorMap[method] || '#6B7280',
      }));

      res.json(result.sort((a, b) => b.value - a.value));
    } catch (error) {
      console.error("Error fetching payment method breakdown:", error);
      res.status(500).json({ message: "Failed to get payment methods" });
    }
  });

  // GA4 detailed metrics — chart + countries (range: 7d | 14d | 30d | all)
  app.get("/api/admin/ga4-detailed", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    const serviceAccountRaw = process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT;
    if (!propertyId || !serviceAccountRaw) return res.json({ configured: false });

    const range = (req.query.range as string) || '7d';
    const startDate = range === '14d' ? '14daysAgo' : range === '30d' ? '30daysAgo' : range === 'all' ? '2024-01-01' : '7daysAgo';

    try {
      const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
      const credentials = JSON.parse(serviceAccountRaw);
      const client = new BetaAnalyticsDataClient({ credentials });

      const [dailyResp, countryResp, newVsReturnResp] = await Promise.all([
        client.runReport({
          property: `properties/${propertyId}`,
          dateRanges: [{ startDate, endDate: 'today' }],
          metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
          dimensions: [{ name: 'date' }],
          orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
        }),
        client.runReport({
          property: `properties/${propertyId}`,
          dateRanges: [{ startDate, endDate: 'today' }],
          metrics: [{ name: 'totalUsers' }],
          dimensions: [{ name: 'countryId' }],
          orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
          limit: 50,
        }),
        client.runReport({
          property: `properties/${propertyId}`,
          dateRanges: [{ startDate, endDate: 'today' }],
          metrics: [{ name: 'totalUsers' }, { name: 'newUsers' }],
          dimensions: [],
        }),
      ]);

      const daily = (dailyResp[0].rows || []).map(r => {
        const raw = r.dimensionValues?.[0]?.value || '';
        const label = raw.length === 8 ? `${raw.slice(6,8)}/${raw.slice(4,6)}` : raw;
        return {
          date: label,
          users: parseInt(r.metricValues?.[0]?.value || '0'),
          sessions: parseInt(r.metricValues?.[1]?.value || '0'),
          pageViews: parseInt(r.metricValues?.[2]?.value || '0'),
        };
      });

      const countries = (countryResp[0].rows || []).map(r => ({
        code: r.dimensionValues?.[0]?.value || '',
        users: parseInt(r.metricValues?.[0]?.value || '0'),
      }));

      const nvr = newVsReturnResp[0].rows?.[0];
      const totalUsers = parseInt(nvr?.metricValues?.[0]?.value || '0');
      const newUsers = parseInt(nvr?.metricValues?.[1]?.value || '0');

      res.json({ configured: true, daily, countries, newUsers, returningUsers: Math.max(0, totalUsers - newUsers) });
    } catch (error: any) {
      console.error("GA4 detailed error:", error?.message);
      res.status(500).json({ configured: true, error: error?.message });
    }
  });

  // GA4 metrics for admin portal
  app.get("/api/admin/ga4-metrics", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    const serviceAccountRaw = process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT;

    if (!propertyId || !serviceAccountRaw) {
      return res.json({ configured: false });
    }

    try {
      const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
      const credentials = JSON.parse(serviceAccountRaw);
      const analyticsClient = new BetaAnalyticsDataClient({ credentials });

      const [response] = await analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        dimensions: [],
      });

      const [topPagesResp] = await analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'screenPageViews' }],
        dimensions: [{ name: 'pagePath' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      });

      const [devicesResp] = await analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'sessions' }],
        dimensions: [{ name: 'deviceCategory' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      });

      const [realtimeResp] = await analyticsClient.runRealtimeReport({
        property: `properties/${propertyId}`,
        metrics: [{ name: 'activeUsers' }],
      });

      const row = response.rows?.[0];
      const metrics = {
        sessions: parseInt(row?.metricValues?.[0]?.value || '0'),
        totalUsers: parseInt(row?.metricValues?.[1]?.value || '0'),
        pageViews: parseInt(row?.metricValues?.[2]?.value || '0'),
        bounceRate: parseFloat(row?.metricValues?.[3]?.value || '0'),
        avgSessionDuration: parseFloat(row?.metricValues?.[4]?.value || '0'),
      };

      const topPages = (topPagesResp.rows || []).map(r => ({
        path: r.dimensionValues?.[0]?.value || '/',
        views: parseInt(r.metricValues?.[0]?.value || '0'),
      }));

      const devices = (devicesResp.rows || []).map(r => ({
        name: r.dimensionValues?.[0]?.value || 'unknown',
        sessions: parseInt(r.metricValues?.[0]?.value || '0'),
      }));

      const activeUsers = parseInt(realtimeResp.rows?.[0]?.metricValues?.[0]?.value || '0');

      res.json({ configured: true, metrics, topPages, devices, activeUsers });
    } catch (error: any) {
      console.error("GA4 API error:", error?.message);
      res.status(500).json({ configured: true, error: error?.message || 'GA4 API error' });
    }
  });

  // Legacy create merchant endpoint - deprecated, use /api/admin/merchants/signup instead  
  app.post("/api/admin/merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      message: "This endpoint is deprecated. Please use /api/admin/merchants/signup for new merchant creation." 
    });
  });

  // (Removed legacy POST /api/admin/merchants-old — it used a hardcoded admin email
  // check and created merchants with a literal "tempPassword". Superseded by
  // POST /api/admin/merchants/signup.)

  // Admin merchant management endpoints
  app.put("/api/admin/merchants/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const merchantId = parseInt(req.params.id);
      const updates = req.body;

      // Update different aspects of merchant data based on what's provided
      if (updates.businessName || updates.contactEmail || updates.contactPhone || updates.businessAddress) {
        await storage.updateMerchantDetails(merchantId, {
          businessName: updates.businessName,
          contactEmail: updates.contactEmail,
          contactPhone: updates.contactPhone,
          businessAddress: updates.businessAddress,
        });
      }

      if (updates.currentProviderRate) {
        await storage.updateMerchantRates(merchantId, updates.currentProviderRate);
      }

      const updatedMerchant = await storage.getMerchant(merchantId);
      res.json(updatedMerchant);
    } catch (error) {
      console.error("Error updating merchant:", error);
      res.status(500).json({ message: "Failed to update merchant" });
    }
  });

  // Test payment link endpoint
  app.post("/api/merchants/:id/test-payment-link", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const merchantId = parseInt(req.params.id);
      const merchant = await storage.getMerchant(merchantId);
      
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Test the payment URL by making a simple HTTP request
      const paymentUrl = generatePaymentUrl(merchantId, undefined, req);
      const qrCodeUrl = generateQrCodeUrl(merchantId, undefined, req);
      
      try {
        // Simple connectivity test
        const testResults = {
          paymentUrl: { url: paymentUrl, status: 'active' },
          qrCodeUrl: { url: qrCodeUrl, status: 'active' },
          merchant: { id: merchantId, status: 'active' }
        };

        res.json({
          status: 'active',
          message: 'All payment links are operational',
          results: testResults
        });
      } catch (testError) {
        res.json({
          status: 'error',
          message: 'Payment link connectivity issues detected',
          error: testError
        });
      }
    } catch (error) {
      console.error("Error testing payment links:", error);
      res.status(500).json({ message: "Failed to test payment links" });
    }
  });

  // Get all merchants for admin
  app.get("/api/admin/merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchants = await storage.getAllMerchants();
      res.json(merchants.map(stripMerchantSecrets));
    } catch (error) {
      console.error("Error fetching merchants:", error);
      res.status(500).json({ message: "Failed to fetch merchants" });
    }
  });

  app.get("/api/admin/merchants/:id", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      res.json(stripMerchantSecrets(merchant));
    } catch (error) {
      console.error("Error fetching merchant:", error);
      res.status(500).json({ message: "Failed to fetch merchant" });
    }
  });

  // Delete merchant (admin only)
  app.delete("/api/admin/merchants/:id", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      
      // Check if merchant exists
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      const deleted = await storage.deleteMerchant(merchantId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete merchant" });
      }

      res.json({ message: "Merchant deleted successfully" });
    } catch (error) {
      console.error("Error deleting merchant:", error);
      res.status(500).json({ message: "Failed to delete merchant" });
    }
  });

  // Clear problematic merchants endpoint
  app.post("/api/admin/clear-merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const problemEmails = [
        'oliverleonard.professional@gmail.com',
        'dmizedzn@gmail.com', 
        'oliverharryleonard@gmail.com'
      ];
      
      let clearedCount = 0;
      for (const email of problemEmails) {
        const merchant = await storage.getMerchantByEmail(email);
        if (merchant) {
          // For MemStorage, we need to manually remove from the map
          if ('merchants' in storage) {
            (storage as any).merchants.delete(merchant.id);
            clearedCount++;
          }
        }
      }
      
      res.json({ 
        message: `Cleared ${clearedCount} problematic merchants`,
        clearedEmails: problemEmails
      });
    } catch (error) {
      console.error("Clear merchants error:", error);
      res.status(500).json({ message: "Failed to clear merchants" });
    }
  });

  // Resend verification email endpoint
  app.post("/api/admin/resend-verification", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find merchant by email
      const merchant = await storage.getMerchantByEmail(email);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      if (merchant.status !== "pending") {
        return res.status(400).json({ message: "Merchant is already verified" });
      }

      if (!merchant.verificationToken) {
        return res.status(400).json({ message: "No verification token found for this merchant" });
      }

      // Send verification email using the new email service
      const { sendMerchantVerificationEmail } = await import('./email-service-multi');
      const { getBaseUrl } = await import('./url-utils');
      const baseUrl = getBaseUrl(req);
      
      const emailSent = await sendMerchantVerificationEmail(
        merchant.email,
        merchant.verificationToken,
        merchant.businessName || merchant.name,
        baseUrl
      );

      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send verification email" });
      }

      res.json({
        message: "Verification email sent successfully",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          businessName: merchant.businessName,
          email: merchant.email,
          status: merchant.status
        }
      });

    } catch (error) {
      console.error("Error resending verification email:", error);
      res.status(500).json({ message: "Failed to resend verification email" });
    }
  });

  // (Removed a duplicate POST /api/admin/clear-merchants handler here — it was dead
  // code shadowed by the earlier registration of the same route.)

  app.post("/api/admin/test-email", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const testEmail = await sendEmail({
        to: req.user?.email || 'test@example.com',
        from: process.env.RESEND_FROM_EMAIL || 'noreply@taptpay.co.nz',
        subject: 'TaptPay Email Test',
        text: 'This is a test email to verify the Resend email configuration.',
        html: '<h2>TaptPay Email Test</h2><p>This is a test email to verify the Resend email configuration.</p>'
      });

      if (testEmail) {
        res.json({ success: true, message: 'Test email sent successfully' });
      } else {
        res.status(500).json({ success: false, message: 'Failed to send test email' });
      }
    } catch (error) {
      console.error('Test email error:', error);
      res.status(500).json({ success: false, message: 'Failed to send test email', error: error });
    }
  });

  // Email configuration diagnostics — confirms at a glance whether auto-emails
  // (verification, admin notifications) can actually be delivered in this env.
  app.get("/api/admin/email-status", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { getEmailServiceStatus } = await import('./email-service-multi');
      const status = getEmailServiceStatus();
      res.json({
        ...status,
        nodeEnv: process.env.NODE_ENV || 'development',
        fromAddress: process.env.RESEND_FROM_EMAIL || 'noreply@taptpay.co.nz',
        adminNotifyConfigured: !!(process.env.ADMIN_EMAIL || process.env.ADMIN_NOTIFY_EMAIL),
        // In production with no real provider, emails are NOT delivered (and no
        // longer silently "simulated" as success).
        willDeliver: status.availableProviders.length > 0,
      });
    } catch (error) {
      console.error('Email status error:', error);
      res.status(500).json({ message: 'Failed to read email status' });
    }
  });

  // NOTE: The former /api/debug/* routes (sync-merchants, auth-users, test-password,
  // fix-auth-user) were removed. They were unauthenticated and dangerous: fix-auth-user
  // was an account-takeover backdoor (set a merchant's login password to "123456"),
  // test-password was a bcrypt oracle, and auth-users leaked account existence.
  // Merchant auth sync now happens automatically on verification; use the admin-gated
  // endpoints for any operational needs.

  // Public merchant verification endpoint
  app.post("/api/merchants/verify", async (req, res) => {
    try {
      // Simple validation without confirmPassword requirement
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ 
          message: "Token and password are required"
        });
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(password, 12);

      // Verify the merchant
      const merchant = await storage.verifyMerchant(token, passwordHash);
      if (!merchant) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

      // Create user account for the verified merchant
      try {
        await createUser(merchant.email, password, merchant.id, 'merchant');
        console.log("User account created successfully for merchant:", merchant.email);
      } catch (error) {
        console.error("Error creating user account:", error);
        // Don't fail verification if user creation fails, but log it
      }

      res.json({
        message: "Merchant account verified successfully. You can now log in.",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          businessName: merchant.businessName,
          email: merchant.email,
          status: merchant.status,
        }
      });
    } catch (error) {
      console.error("Error verifying merchant:", error);
      res.status(500).json({ message: "Failed to verify merchant account" });
    }
  });

  // Public email verification status check (for /business-details soft gate)
  app.get("/api/merchants/:id/email-status", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (isNaN(merchantId)) return res.status(400).json({ message: "Invalid merchant ID" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      // Treat existing active/verified merchants as email-verified for backwards compatibility
      const emailVerified = merchant.emailVerified === true ||
        merchant.status === "verified" ||
        merchant.status === "active";
      res.json({ emailVerified });
    } catch (error) {
      console.error("Email status check error:", error);
      res.status(500).json({ message: "Failed to check email status" });
    }
  });

  // Confirm email via token (public signup flow)
  app.get("/api/auth/confirm-email", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(400).json({ message: "Token is required" });

      const merchant = await storage.getMerchantByToken(token);
      if (!merchant) return res.status(400).json({ message: "Invalid or expired verification token" });

      // New stepper signups arrive with the full KYC application already stored.
      // Legacy pending accounts may not have these fields, so only mark onboarding
      // complete (and send the application notification) for the consolidated flow.
      const hasCompleteApplication = Boolean(
        merchant.businessName &&
        merchant.businessAddress &&
        merchant.director &&
        merchant.businessDescription &&
        merchant.estimatedAnnualTurnover
      );

      // Mark email verified and promote status to 'verified' so merchant can log in.
      await storage.updateMerchant(merchant.id, {
        emailVerified: true,
        verificationToken: null,
        status: 'verified',
        onboardingCompleted: hasCompleteApplication,
      });

      // Sync auth store so the merchant can log in immediately
      const { syncVerifiedMerchants } = await import('./auth');
      await syncVerifiedMerchants();

      if (hasCompleteApplication) {
        const businessType = String(merchant.businessType || "Not provided")
          .split("-")
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
        const notificationSent = await sendEmail({
          to: "oliver@taptpay.co.nz",
          from: process.env.RESEND_FROM_EMAIL || "noreply@taptpay.co.nz",
          subject: `Verified TaptPay signup — ${(merchant.businessName || merchant.name || "").replace(/[\r\n]/g, "")}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#06102f">
              <div style="background:#060d2f;color:#fff;padding:28px 32px;border-radius:18px 18px 0 0">
                <p style="margin:0;color:#6eaeff;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Email verified</p>
                <h2 style="margin:8px 0 0;font-size:26px">${escHtml(merchant.businessName)}</h2>
              </div>
              <div style="border:1px solid #dfe4ec;border-top:0;padding:28px 32px;border-radius:0 0 18px 18px">
                <h3>Primary contact</h3>
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:7px 0;color:#667085;width:38%">Full name</td><td style="padding:7px 0;font-weight:600">${escHtml(merchant.name)}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">Email</td><td style="padding:7px 0">${escHtml(merchant.email)}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">Phone</td><td style="padding:7px 0">${escHtml(merchant.phone)}</td></tr>
                </table>
                <h3 style="margin-top:24px">Business details</h3>
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:7px 0;color:#667085;width:38%">Legal name</td><td style="padding:7px 0;font-weight:600">${escHtml(merchant.businessName)}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">Type</td><td style="padding:7px 0">${escHtml(businessType)}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">Address</td><td style="padding:7px 0">${escHtml(merchant.businessAddress || merchant.address)}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">NZBN</td><td style="padding:7px 0">${escHtml(merchant.nzbn || "Not provided")}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">GST number</td><td style="padding:7px 0">${escHtml(merchant.gstNumber || "Not provided")}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">Description</td><td style="padding:7px 0">${escHtml(merchant.businessDescription)}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">Website</td><td style="padding:7px 0">${escHtml(merchant.websiteUrl || "Not provided")}</td></tr>
                  <tr><td style="padding:7px 0;color:#667085">Annual card turnover</td><td style="padding:7px 0">${escHtml(merchant.estimatedAnnualTurnover)}</td></tr>
                </table>
                <h3 style="margin-top:24px">KYC</h3>
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:7px 0;color:#667085;width:38%">Director / owner</td><td style="padding:7px 0">${escHtml(merchant.director)}</td></tr>
                </table>
              </div>
            </div>
          `,
          text: [
            `Verified TaptPay signup: ${merchant.businessName}`,
            `Contact: ${merchant.name} | ${merchant.email} | ${merchant.phone}`,
            `Business: ${businessType} | ${merchant.businessAddress || merchant.address}`,
            `NZBN: ${merchant.nzbn || "Not provided"} | GST: ${merchant.gstNumber || "Not provided"}`,
            `Description: ${merchant.businessDescription}`,
            `Website: ${merchant.websiteUrl || "Not provided"} | Turnover: ${merchant.estimatedAnnualTurnover}`,
            `Director: ${merchant.director}`,
          ].join("\n"),
        });
        if (!notificationSent) {
          console.error(`[SIGNUP_NOTIFY] Failed to send verified application for merchant ${merchant.id} to oliver@taptpay.co.nz`);
        }
      }

      res.json({ message: "Email verified", merchantId: merchant.id });
    } catch (error) {
      console.error("Confirm email error:", error);
      res.status(500).json({ message: "Failed to confirm email" });
    }
  });

  // Resend confirmation email (public — for check-email screen)
  app.post("/api/auth/resend-confirmation", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const { merchantId, email } = req.body;
      const rateLimitKey = `resend:${ip}:${merchantId || email || 'unknown'}`;
      if (!checkResendRateLimit(rateLimitKey)) {
        return res.status(429).json({ message: "Too many resend attempts. Please wait a few minutes." });
      }

      let merchant;
      if (merchantId) {
        const id = parseInt(merchantId);
        if (!isNaN(id)) merchant = await storage.getMerchant(id);
      } else if (email) {
        merchant = await storage.getMerchantByEmail(email);
      }

      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      if (merchant.emailVerified) return res.json({ message: "Email is already verified" });
      if (!merchant.verificationToken) return res.status(400).json({ message: "No verification token found" });

      const { sendMerchantVerificationEmail } = await import('./email-service-multi');
      const { getBaseUrl } = await import('./url-utils');
      const baseUrl = getBaseUrl(req);
      await sendMerchantVerificationEmail(merchant.email, merchant.verificationToken, merchant.name, baseUrl);
      res.json({ message: "Verification email sent" });
    } catch (error) {
      console.error("Resend confirmation error:", error);
      res.status(500).json({ message: "Failed to resend email" });
    }
  });

  // Info pack lead capture — public endpoint, no auth required
  // Rate limited: max 5 submissions per IP per 10 minutes (re-uses existing resend limiter pattern)
  app.post("/api/info-pack-leads", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkResendRateLimit(`info-lead:${ip}`)) {
        return res.status(429).json({ message: "Too many requests. Please try again later." });
      }

      const { createInfoPackLeadSchema } = await import("@shared/schema");
      const validation = createInfoPackLeadSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0]?.message || "Invalid input",
          errors: validation.error.issues,
        });
      }
      const { name, email } = validation.data;
      const lead = await storage.createInfoPackLead({ name, email });

      // Escape HTML to prevent malformed rendering from crafted input
      const safeName = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeEmail = email.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // Fire-and-forget notification — do not block the response
      const leadNotifyEmail = process.env.ADMIN_EMAIL;
      if (leadNotifyEmail) sendEmail({
        to: leadNotifyEmail,
        from: 'noreply@taptpay.co.nz',
        subject: `New info pack request from ${(name || '').replace(/[\r\n]/g, '')}`,
        html: `<p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p><p>They have just unlocked the TaptPay info pack on taptpay.co.nz/info.</p>`,
        text: `New info pack request\n\nName: ${name}\nEmail: ${email}\n\nThey have just unlocked the TaptPay info pack on taptpay.co.nz/info.`,
      }).then((ok) => {
        if (!ok) console.error("Info pack lead notification failed: Resend returned false");
        else console.log(`✅ Info pack lead notification sent for ${email}`);
      }).catch((e) => console.error("Info pack lead notification error:", e));

      return res.status(201).json({ id: lead.id });
    } catch (error) {
      console.error("Error saving info pack lead:", error);
      return res.status(500).json({ message: "Failed to save lead" });
    }
  });

  app.post("/api/merchants/signup", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(ip)) {
        logSecurityEvent('SIGNUP_RATE_LIMITED', { ip });
        return res.status(429).json({ message: "Too many signup attempts. Please try again later." });
      }

      const validation = publicSignupSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.issues[0]?.message || "Invalid input",
          errors: validation.error.issues 
        });
      }

      const {
        name,
        email,
        phone,
        businessName,
        businessType,
        businessAddress,
        nzbn,
        gstNumber,
        director,
        businessDescription,
        websiteUrl,
        estimatedAnnualTurnover,
        password,
        confirmPassword,
      } = validation.data;

      // Check if email already exists
      const existingMerchant = await storage.getMerchantByEmail(email);
      if (existingMerchant) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password for storage
      const passwordHash = await bcrypt.hash(password, 12);

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Create a pending merchant with the complete stepper application. Access
      // remains blocked until the email confirmation link is used.
      const merchant = await storage.createMerchantWithSignup({
        name,
        businessName,
        businessType,
        email,
        phone,
        address: businessAddress,
        password,
        confirmPassword,
        verificationToken,
      });

      if (merchant) {
        await storage.updateMerchantPasswordHash(merchant.id, passwordHash);
        await storage.updateMerchant(merchant.id, {
          contactEmail: email,
          contactPhone: phone,
          businessAddress,
          nzbn: nzbn || null,
          gstNumber: gstNumber || null,
          director,
          businessDescription,
          websiteUrl: websiteUrl || null,
          estimatedAnnualTurnover,
          onboardingCompleted: false,
        });
      }

      // Send verification email
      const { sendMerchantVerificationEmail } = await import('./email-service-multi');
      const { getBaseUrl } = await import('./url-utils');
      const baseUrl = getBaseUrl(req);
      
      const emailSent = await sendMerchantVerificationEmail(email, verificationToken, name, baseUrl);
      if (!emailSent) {
        console.warn('Failed to send verification email, but merchant account was created');
      }

      res.json({
        message: "Account created. Please check your email to continue.",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          email: merchant.email,
          status: merchant.status
        }
      });

    } catch (error) {
      console.error("Public merchant signup error:", error);
      res.status(500).json({ message: "Failed to create merchant account" });
    }
  });

  // Submit business details after signup
  app.put("/api/merchants/:id/business-details", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      if (isNaN(merchantId)) {
        return res.status(400).json({ message: "Invalid merchant ID" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Enforce email verification before accepting business details
      const isEmailVerified = merchant.emailVerified === true ||
        merchant.status === "verified" ||
        merchant.status === "active";
      if (!isEmailVerified) {
        return res.status(403).json({ message: "Email address must be verified before submitting business details" });
      }

      // SECURITY (IDOR): this endpoint is necessarily unauthenticated — it is the
      // pre-login onboarding step reached straight after email confirmation, with
      // the merchant id taken from the URL query. Bind it to the onboarding window
      // so it can NEVER overwrite an established merchant's details (business name,
      // contact email, GST number, address). Once the merchant is active or has
      // completed onboarding, edits must go through the authenticated settings API
      // (PUT /api/merchants/:id/details, which enforces ownership).
      if (merchant.status === "active" || merchant.onboardingCompleted === true) {
        return res.status(403).json({ message: "Business details can no longer be edited here. Please sign in to update your details." });
      }

      const validation = businessDetailsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0]?.message || "Invalid input",
          errors: validation.error.issues,
        });
      }

      const { businessName, director, contactEmail, contactPhone, gstNumber, businessAddress, nzbn } = validation.data;

      await storage.updateMerchant(merchantId, {
        businessName,
        director,
        contactEmail,
        contactPhone,
        gstNumber,
        businessAddress: businessAddress || null,
        nzbn: nzbn || null,
        phone: contactPhone,
        address: businessAddress || '',
      });

      // Admin is notified at signup (lead) and again with the full record at KYC
      // onboarding, so this mid-funnel step no longer sends a third, redundant
      // email — its fields are all included in the KYC submission notification.

      res.json({ message: "Business details saved successfully." });

    } catch (error) {
      console.error("Business details update error:", error);
      res.status(500).json({ message: "Failed to save business details" });
    }
  });

  // Create merchant signup (admin version)
  app.post("/api/admin/merchants/signup", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {

      const validation = createMerchantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: validation.error.issues 
        });
      }

      const { password, confirmPassword, ...merchantData } = validation.data;

      // Check if email already exists
      const existingMerchant = await storage.getMerchantByEmail(merchantData.email);
      if (existingMerchant) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(password, 12);

      // Generate URLs for the merchant
      const tempMerchantId = Date.now(); // Temporary ID for URL generation
      const paymentUrl = generatePaymentUrl(tempMerchantId);
      const qrCodeUrl = generateQrCodeUrl(tempMerchantId);

      // Generate proper URLs with actual merchant ID after creation
      const merchant = await storage.createMerchantWithPassword({
        ...merchantData,
        qrCodeUrl: `temp`, // Will be updated after creation
        paymentUrl: `temp` // Will be updated after creation
      }, passwordHash);

      // Update with proper URLs now that we have the merchant ID
      const actualPaymentUrl = generatePaymentUrl(merchant.id);
      const actualQrCodeUrl = generateQrCodeUrl(merchant.id);
      
      await storage.updateMerchantDetails(merchant.id, {
        businessName: merchant.businessName,
        contactEmail: merchant.email,
        contactPhone: merchant.phone || '',
        businessAddress: merchant.address || ''
      });

      res.json({ 
        message: "Merchant created successfully and is ready to use.",
        merchant: {
          id: merchant.id,
          name: merchant.name,
          businessName: merchant.businessName,
          email: merchant.email,
          status: 'verified'
        }
      });
    } catch (error) {
      console.error("Error creating merchant:", error);
      res.status(500).json({ message: "Failed to create merchant" });
    }
  });

  // (Removed legacy POST /api/verify-merchant — superseded by the signup +
  // /api/auth/confirm-email flow. Nothing navigated to its /verify-merchant page.)

  // Server-Sent Events for real-time updates
  app.get("/api/merchants/:id/events", (req, res) => {
    const merchantId = parseInt(req.params.id);
    const stoneId = req.query.stoneId ? parseInt(req.query.stoneId as string) : null;

    // SSE can't send Authorization headers, so an authenticated merchant passes its
    // JWT in the query string. A valid token for THIS merchant (or an admin) unlocks
    // the full event payload; everyone else — the anonymous customer payment page —
    // gets a redacted view (see sseWrite/publicSseData). Cross-tenant subscribers
    // therefore can no longer read a merchant's fee/margin internals or processor ids.
    let sseAuthed = false;
    const qToken = typeof req.query.token === "string" ? req.query.token : "";
    if (qToken) {
      try {
        const decoded: any = jwt.verify(qToken, JWT_SECRET);
        sseAuthed = decoded?.role === "admin" || decoded?.merchantId === merchantId;
      } catch { /* invalid/expired token → treat as anonymous */ }
    }
    (res as any).__sseAuthed = sseAuthed;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Add connection to merchant's stone-specific set
    if (!sseConnections.has(merchantId)) {
      sseConnections.set(merchantId, new Map());
    }
    const merchantConnections = sseConnections.get(merchantId)!;
    
    if (!merchantConnections.has(stoneId)) {
      merchantConnections.set(stoneId, new Set());
    }
    merchantConnections.get(stoneId)!.add(res);

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: 'connected', stoneId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      const merchantConnections = sseConnections.get(merchantId);
      if (merchantConnections) {
        const stoneConnections = merchantConnections.get(stoneId);
        if (stoneConnections) {
          stoneConnections.delete(res);
          if (stoneConnections.size === 0) {
            merchantConnections.delete(stoneId);
            if (merchantConnections.size === 0) {
              sseConnections.delete(merchantId);
            }
          }
        }
      }
    });
  });

  // Push capabilities — reports which delivery paths are ready on this server
  app.get("/api/push/capabilities", (_req, res) => {
    const vapidPublic = process.env.VAPID_PUBLIC_KEY || "";
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY || "";
    const webPushReady = !!(vapidPublic && vapidPrivate);

    const apnsKey = process.env.APNS_KEY_P8 || "";
    const apnsKeyId = process.env.APNS_KEY_ID || "";
    const apnsTeamId = process.env.APNS_TEAM_ID || "";
    const nativePushReady = !!(apnsKey && apnsKeyId && apnsTeamId);

    res.json({
      webPush: {
        available: webPushReady,
        reason: webPushReady ? undefined : "VAPID credentials not configured",
      },
      nativePush: {
        available: nativePushReady,
        reason: nativePushReady ? undefined : "APNs credentials not configured",
        bundleId: process.env.APNS_BUNDLE_ID || "nz.taptpay.app",
      },
    });
  });

  // Get VAPID public key for push notification subscription
  app.get("/api/push/vapid-key", (req, res) => {
    const vapidKey = process.env.VAPID_PUBLIC_KEY || "";
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY || "";
    if (!vapidKey || !vapidPrivate) {
      return res.status(503).json({ message: "Push notifications not configured" });
    }
    res.json({ publicKey: vapidKey });
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        return res.status(503).json({ message: "Push notifications not configured on server" });
      }

      const { subscription } = req.body;
      if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return res.status(400).json({ message: "Invalid push subscription" });
      }

      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const pushSub = await storage.createPushSubscription({
        merchantId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: req.headers["user-agent"] || undefined,
      });

      res.json({ success: true, subscription: pushSub });
    } catch (error) {
      console.error("Push subscribe error:", error);
      res.status(500).json({ message: "Failed to save push subscription" });
    }
  });

  // Unsubscribe from push notifications
  app.post("/api/push/unsubscribe", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ message: "Endpoint required" });
      }

      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const subs = await storage.getPushSubscriptionsByMerchant(merchantId);
      const ownsSub = subs.some((s: any) => s.endpoint === endpoint);
      if (!ownsSub) {
        return res.status(403).json({ message: "Not authorized to unsubscribe this endpoint" });
      }

      await storage.deactivatePushSubscriptionByEndpoint(endpoint);
      res.json({ success: true });
    } catch (error) {
      console.error("Push unsubscribe error:", error);
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  // Register native iOS device token (Capacitor @capacitor/push-notifications APNs)
  app.post("/api/push/native-subscribe", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { deviceToken } = req.body;
      if (!deviceToken || typeof deviceToken !== "string" || deviceToken.trim().length < 8) {
        return res.status(400).json({ message: "Invalid device token" });
      }

      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const endpoint = `apns://${deviceToken.trim()}`;
      const sub = await storage.createPushSubscription({
        merchantId,
        endpoint,
        p256dh: "",
        auth: "",
        userAgent: req.headers["user-agent"] || undefined,
      });

      res.json({ success: true, subscription: sub });
    } catch (error) {
      console.error("Native push subscribe error:", error);
      res.status(500).json({ message: "Failed to save device token" });
    }
  });

  // Remove native iOS device token (unsubscribe)
  app.post("/api/push/native-unsubscribe", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const subs = await storage.getPushSubscriptionsByMerchant(merchantId);
      const nativeSubs = subs.filter((s: any) => s.endpoint.startsWith("apns://"));
      await Promise.all(
        nativeSubs.map((s: any) => storage.deactivatePushSubscriptionByEndpoint(s.endpoint))
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Native push unsubscribe error:", error);
      res.status(500).json({ message: "Failed to remove device token" });
    }
  });

  // Get push notification status for current merchant
  app.get("/api/push/status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const subs = await storage.getPushSubscriptionsByMerchant(merchantId);
      const webSubs = subs.filter((s: any) => !s.endpoint.startsWith("apns://"));
      const nativeSubs = subs.filter((s: any) => s.endpoint.startsWith("apns://"));

      res.json({
        subscribed: subs.length > 0,
        deviceCount: subs.length,
        webSubscribed: webSubs.length > 0,
        nativeSubscribed: nativeSubs.length > 0,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check push status" });
    }
  });

  // Clear transactions for a merchant
  app.post("/api/merchants/:id/clear-transactions", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const success = await storage.clearTransactions(merchantId);
      
      if (success) {
        res.json({ message: "Transactions cleared successfully" });
      } else {
        res.status(500).json({ message: "Failed to clear transactions" });
      }
    } catch (error) {
      console.error("Error clearing transactions:", error);
      res.status(500).json({ message: "Failed to clear transactions" });
    }
  });

  // ===== REFUND MANAGEMENT ROUTES =====
  
  // Create a refund for a transaction
  app.post("/api/transactions/:transactionId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId);
      const merchantId = req.user?.merchantId;
      
      if (!merchantId) {
        return res.status(401).json({ message: "Merchant authentication required" });
      }

      // Validate refund data — merge transactionId from URL param into body for schema validation
      const validation = createRefundSchema.safeParse({ ...req.body, transactionId });
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid refund data", errors: validation.error.errors });
      }

      const { refundAmount, refundReason, refundMethod } = validation.data;

      // Get the original transaction
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Verify merchant owns this transaction
      if (transaction.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if transaction can be refunded (allow partially_refunded for further partial refunds)
      if (transaction.status !== "completed" && transaction.status !== "partially_refunded") {
        return res.status(400).json({ message: "Only completed transactions can be refunded" });
      }

      // Check refund amount is valid
      const requestedAmount = parseFloat(refundAmount);
      if (isNaN(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({ message: "Refund amount must be greater than zero" });
      }

      // Atomically reserve this refund against the remaining refundable balance
      // BEFORE moving any money. Serializes concurrent / double-submitted refunds at
      // the DB so they can never over-refund (the old check-then-act read the balance,
      // then called Windcave, with no lock in between). null = reservation rejected.
      const reserved = await storage.reserveRefundAmount(transactionId, requestedAmount);
      if (!reserved) {
        const remaining = parseFloat(transaction.refundableAmount || transaction.price);
        return res.status(409).json({
          message: `Refund could not be applied — it exceeds the remaining refundable amount of $${remaining.toFixed(2)}, or another refund is already in progress.`,
        });
      }

      // Create refund record
      const refund = await storage.createRefund({
        transactionId,
        merchantId,
        refundAmount,
        refundReason,
        refundMethod,
        status: "pending",
        windcaveRefundId: null,
        completedAt: null,
      });

      let windcaveRefundId: string;
      const isLive = isWindcaveConfigured() && transaction.windcaveTransactionId;

      if (isLive) {
        // Real Windcave refund against the original transaction
        const merchantReference = `REFUND-${transaction.id}-${Date.now()}`;
        const refundResult = await createWindcaveRefund(
          transaction.windcaveTransactionId!,
          parseFloat(refundAmount).toFixed(2),
          merchantReference
        );

        if (!refundResult.success) {
          // Money did not move — release the reservation so the balance is restored
          // and the merchant can retry.
          await storage.releaseRefundAmount(transactionId, requestedAmount);
          await storage.updateRefundStatus(refund.id, "failed");
          return res.status(502).json({
            message: refundResult.error || "Windcave refund failed. Please try again."
          });
        }

        windcaveRefundId = refundResult.refundTransactionId!;
      } else {
        // Simulation fallback (dev mode or no Windcave transaction ID on record)
        windcaveRefundId = `REFUND_SIM_${Date.now()}`;
      }

      // Mark refund record as completed. Transaction totals were already updated
      // atomically by reserveRefundAmount above.
      const completedRefund = await storage.updateRefundStatus(refund.id, "completed", windcaveRefundId);
      const updatedTransaction = reserved;

      // Broadcast real-time update
      broadcastToStone(merchantId, transaction.taptStoneId, { 
        type: 'refund_completed', 
        refund: completedRefund,
        transaction: updatedTransaction,
        transactionId
      });

      sendPushToMerchant(merchantId, "refunded", transaction.itemName, refund.refundAmount, transaction.id).catch(() => {});

      res.json({ 
        success: true,
        message: isLive ? "Refund processed with Windcave successfully" : "Refund processed successfully",
        refund: completedRefund,
        transaction: updatedTransaction
      });

    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({ message: "Failed to create refund" });
    }
  });

  // Get refunds for a specific transaction
  app.get("/api/transactions/:transactionId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId);
      const merchantId = req.user?.merchantId;
      
      if (!merchantId) {
        return res.status(401).json({ message: "Merchant authentication required" });
      }

      // Get the transaction to verify ownership
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      if (transaction.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const refunds = await storage.getRefundsByTransaction(transactionId);
      res.json(refunds);

    } catch (error) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  // Get all refunds for a merchant
  app.get("/api/merchants/:merchantId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const userMerchantId = req.user?.merchantId;
      
      // Verify access
      if (userMerchantId !== merchantId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const refunds = await storage.getRefundsByMerchant(merchantId);
      res.json(refunds);

    } catch (error) {
      console.error("Error fetching merchant refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  // Get specific refund details
  app.get("/api/refunds/:refundId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const refundId = parseInt(req.params.refundId);
      const merchantId = req.user?.merchantId;
      
      if (!merchantId) {
        return res.status(401).json({ message: "Merchant authentication required" });
      }

      const refund = await storage.getRefund(refundId);
      if (!refund) {
        return res.status(404).json({ message: "Refund not found" });
      }

      // Verify access
      if (refund.merchantId !== merchantId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(refund);

    } catch (error) {
      console.error("Error fetching refund:", error);
      res.status(500).json({ message: "Failed to fetch refund" });
    }
  });

  // =============================================================================
  // ADMIN API MANAGEMENT ROUTES
  // =============================================================================

  // Get all API keys for admin
  app.get("/api/admin/api-keys", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // For now, return mock data since we don't have API tables yet
      const mockApiKeys = [
        {
          id: 1,
          keyName: "Shopify Store API",
          keyPrefix: "tapt_live_12ab",
          environment: "live",
          status: "active",
          permissions: ["create_transactions", "read_transactions", "webhook_events"],
          webhookUrl: "https://mystore.shopify.com/webhooks/tapt",
          rateLimitPerHour: 1000,
          lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        },
        {
          id: 2,
          keyName: "WooCommerce Integration",
          keyPrefix: "tapt_sandbox_34cd",
          environment: "sandbox",
          status: "active",
          permissions: ["create_transactions", "read_transactions"],
          webhookUrl: "",
          rateLimitPerHour: 500,
          lastUsedAt: null,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        }
      ];
      
      res.json(mockApiKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });

  // Create new API key
  app.post("/api/admin/api-keys", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { keyName, environment, permissions, webhookUrl, rateLimitPerHour } = req.body;
      
      // Generate API key
      const apiKey = await storage.createApiKey({
        keyName,
        environment,
        permissions,
        webhookUrl,
        rateLimitPerHour,
        merchantId: 1 // Admin creates for platform-wide use
      });

      res.json(apiKey);
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  // Revoke API key
  app.post("/api/admin/api-keys/:keyId/revoke", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const keyId = parseInt(req.params.keyId);
      await storage.revokeApiKey(keyId);
      res.json({ success: true, message: "API key revoked successfully" });
    } catch (error) {
      console.error("Error revoking API key:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });

  // Get API metrics for admin dashboard
  app.get("/api/admin/api-metrics", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const metrics = await storage.getApiMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching API metrics:", error);
      res.status(500).json({ message: "Failed to fetch API metrics" });
    }
  });

  // Get API usage data
  app.get("/api/admin/api-usage", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const usageData = await storage.getApiUsageData();
      res.json(usageData);
    } catch (error) {
      console.error("Error fetching API usage:", error);  
      res.status(500).json({ message: "Failed to fetch API usage" });
    }
  });

  // =============================================================================
  // STOCK MANAGEMENT ENDPOINTS
  // =============================================================================
  
  // Get all stock items for a merchant
  app.get("/api/merchants/:merchantId/stock-items", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      
      // Verify merchant ownership or admin access
      if (req.user?.role !== 'admin' && req.user?.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const stockItems = await storage.getStockItemsByMerchant(merchantId);
      res.json(stockItems);
    } catch (error) {
      console.error("Error fetching stock items:", error);
      res.status(500).json({ message: "Failed to fetch stock items" });
    }
  });

  // Create a new stock item
  app.post("/api/merchants/:merchantId/stock-items", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      
      // Verify merchant ownership or admin access
      if (req.user?.role !== 'admin' && req.user?.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = createStockItemSchema.parse(req.body);
      
      const stockItem = await storage.createStockItem({
        merchantId,
        ...validatedData,
      });
      
      res.status(201).json(stockItem);
    } catch (error) {
      console.error("Error creating stock item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create stock item" });
    }
  });

  // Update a stock item
  app.put("/api/merchants/:merchantId/stock-items/:itemId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const itemId = parseInt(req.params.itemId);
      
      // Verify merchant ownership or admin access
      if (req.user?.role !== 'admin' && req.user?.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Verify the item actually belongs to this merchant (prevents cross-tenant edits by item id)
      const existingItem = await storage.getStockItem(itemId);
      if (!existingItem || existingItem.merchantId !== merchantId) {
        return res.status(404).json({ message: "Stock item not found" });
      }

      const validatedData = updateStockItemSchema.parse(req.body);

      const stockItem = await storage.updateStockItem(itemId, validatedData);
      
      if (!stockItem) {
        return res.status(404).json({ message: "Stock item not found" });
      }
      
      res.json(stockItem);
    } catch (error) {
      console.error("Error updating stock item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update stock item" });
    }
  });

  // Delete a stock item
  app.delete("/api/merchants/:merchantId/stock-items/:itemId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const itemId = parseInt(req.params.itemId);
      
      // Verify merchant ownership or admin access
      if (req.user?.role !== 'admin' && req.user?.merchantId !== merchantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Verify the item belongs to this merchant before deleting (cross-tenant guard)
      const existingItem = await storage.getStockItem(itemId);
      if (!existingItem || existingItem.merchantId !== merchantId) {
        return res.status(404).json({ message: "Stock item not found" });
      }

      const success = await storage.deleteStockItem(itemId);
      
      if (!success) {
        return res.status(404).json({ message: "Stock item not found" });
      }
      
      res.json({ message: "Stock item deleted successfully" });
    } catch (error) {
      console.error("Error deleting stock item:", error);
      res.status(500).json({ message: "Failed to delete stock item" });
    }
  });

  // =============================================================================
  // PUBLIC API ROUTES FOR ECOMMERCE INTEGRATION
  // =============================================================================

  // Middleware to authenticate API keys
  const authenticateApiKey = async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'API key required' });
      }

      const apiKey = authHeader.substring(7);
      const keyData = await storage.getApiKeyByKey(apiKey);
      
      if (!keyData || keyData.status !== 'active') {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      // Update last used timestamp
      await storage.updateApiKeyLastUsed(keyData.id);
      
      req.apiKey = keyData;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Authentication failed' });
    }
  };

  // Create transaction via API
  app.post("/api/v1/transactions", authenticateApiKey, async (req: any, res) => {
    const startTime = Date.now();
    
    try {
      const { amount, currency = 'NZD', item_name, customer_email, return_url, webhook_url } = req.body;
      
      // Validate required fields
      if (!amount || !item_name) {
        await storage.logApiRequest({
          apiKeyId: req.apiKey.id,
          merchantId: req.apiKey.merchantId,
          endpoint: '/api/v1/transactions',
          method: 'POST',
          statusCode: 400,
          responseTime: Date.now() - startTime,
          errorMessage: 'Missing required fields'
        });
        return res.status(400).json({ error: 'amount and item_name are required' });
      }

      // Check permissions
      if (!req.apiKey.permissions.includes('create_transactions')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      if (!(await requireBillingCard(req.apiKey.merchantId, res))) return;

      // Create transaction
      const transaction = await storage.createTransaction({
        merchantId: req.apiKey.merchantId,
        itemName: item_name,
        price: amount,
        status: 'pending',
        paymentMethod: 'api',
        splitEnabled: false,
      });

      // Log successful API request
      await storage.logApiRequest({
        apiKeyId: req.apiKey.id,
        merchantId: req.apiKey.merchantId,
        endpoint: '/api/v1/transactions',
        method: 'POST',
        statusCode: 200,
        responseTime: Date.now() - startTime
      });

      // Send webhook if configured
      if (webhook_url || req.apiKey.webhookUrl) {
        await storage.createWebhookDelivery({
          apiKeyId: req.apiKey.id,
          merchantId: req.apiKey.merchantId,
          transactionId: transaction.id,
          eventType: 'transaction.created',
          webhookUrl: webhook_url || req.apiKey.webhookUrl,
          payload: JSON.stringify({
            event: 'transaction.created',
            data: transaction
          })
        });
      }

      res.json({
        id: transaction.id,
        amount: transaction.price,
        currency,
        item_name: transaction.itemName,
        status: transaction.status,
        payment_url: `${req.protocol}://${req.get('host')}/pay/${req.apiKey.merchantId}?transaction=${transaction.id}`,
        created_at: transaction.createdAt
      });

    } catch (error) {
      console.error("API transaction creation error:", error);
      await storage.logApiRequest({
        apiKeyId: req.apiKey?.id,
        merchantId: req.apiKey?.merchantId,
        endpoint: '/api/v1/transactions',
        method: 'POST',
        statusCode: 500,
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get transaction status via API
  app.get("/api/v1/transactions/:id", authenticateApiKey, async (req: any, res) => {
    const startTime = Date.now();
    
    try {
      const transactionId = parseInt(req.params.id);
      
      // Check permissions
      if (!req.apiKey.permissions.includes('read_transactions')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        await storage.logApiRequest({
          apiKeyId: req.apiKey.id,
          merchantId: req.apiKey.merchantId,
          endpoint: `/api/v1/transactions/${transactionId}`,
          method: 'GET',
          statusCode: 404,
          responseTime: Date.now() - startTime
        });
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Verify access to this merchant's transactions
      if (transaction.merchantId !== req.apiKey.merchantId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await storage.logApiRequest({
        apiKeyId: req.apiKey.id,
        merchantId: req.apiKey.merchantId,
        endpoint: `/api/v1/transactions/${transactionId}`,
        method: 'GET',
        statusCode: 200,
        responseTime: Date.now() - startTime
      });

      res.json({
        id: transaction.id,
        amount: transaction.price,
        currency: 'NZD',
        item_name: transaction.itemName,
        status: transaction.status,
        created_at: transaction.createdAt,
        windcave_transaction_id: transaction.windcaveTransactionId
      });

    } catch (error) {
      console.error("API transaction fetch error:", error);
      await storage.logApiRequest({
        apiKeyId: req.apiKey?.id,
        merchantId: req.apiKey?.merchantId,
        endpoint: `/api/v1/transactions/${req.params.id}`,
        method: 'GET',
        statusCode: 500,
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Digital Wallet Payment Processing Endpoints

  // Apple Pay merchant validation endpoint
  app.post("/api/payments/apple-pay/validate", async (req, res) => {
    try {
      const { validationURL, displayName } = req.body;

      if (!validationURL) {
        return res.status(400).json({ error: "Validation URL is required" });
      }

      // In production, this would validate with Apple's servers using merchant certificates
      // For now, we'll simulate the validation response
      const isSimulation = !windcaveService.isConfigured();
      
      if (isSimulation) {
        // Simulated Apple Pay merchant session
        const merchantSession = {
          epochTimestamp: Date.now(),
          expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes
          merchantSessionIdentifier: `merchant_session_${Date.now()}`,
          nonce: crypto.randomBytes(16).toString('hex'),
          merchantIdentifier: "merchant.com.tapt.payment",
          domainName: req.headers.host || "localhost:5000",
          displayName: displayName || "Tapt Payment"
        };

        res.json(merchantSession);
      } else {
        // In production, implement actual Apple Pay merchant validation
        // This requires Apple Pay merchant certificates and proper setup
        return res.status(501).json({ 
          error: "Apple Pay merchant validation not configured for production" 
        });
      }
    } catch (error) {
      console.error("Apple Pay validation error:", error);
      res.status(500).json({ error: "Failed to validate Apple Pay merchant" });
    }
  });

  // Apple Pay payment processing endpoint
  app.post("/api/payments/apple-pay/process", async (req, res) => {
    try {
      const { payment, transactionId, amount, currency = "NZD" } = req.body;

      if (!payment || !transactionId || !amount) {
        return res.status(400).json({ error: "Payment data, transaction ID, and amount are required" });
      }

      // Get the transaction
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Update transaction status to processing
      await storage.updateTransactionStatus(transactionId, "processing");

      const isSimulation = !windcaveService.isConfigured();

      if (isSimulation) {
        // Simulate Apple Pay payment processing
        const paymentResult = {
          success: true,
          transactionId: `applepay_${Date.now()}`,
          paymentMethod: "apple_pay",
          amount: amount,
          currency: currency,
          status: "completed"
        };

        // Update transaction to completed
        const updatedTransaction = await storage.updateTransactionStatus(
          transactionId, 
          "completed", 
          paymentResult.transactionId
        );

        // Collect platform fee
        await storage.createPlatformFee({
          transactionId: transactionId,
          merchantId: transaction.merchantId,
          feeAmount: transaction.platformFeeAmount || "0.10",
          transactionAmount: transaction.price,
          status: 'collected',
        });

        // Track transaction for subscription billing
        if (transaction.merchantId) {
          await storage.incrementTransactionCount(transaction.merchantId);
        }

        // Notify connected clients
        broadcastToStone(transaction.merchantId!, transaction.taptStoneId, { 
          type: 'transaction_updated', 
          transaction: updatedTransaction 
        });

        res.json(paymentResult);
      } else {
        // In production, process actual Apple Pay payment token with Windcave
        // This would decrypt the payment token and submit to payment processor
        return res.status(501).json({ 
          error: "Apple Pay payment processing not configured for production" 
        });
      }
    } catch (error) {
      console.error("Apple Pay processing error:", error);
      res.status(500).json({ error: "Failed to process Apple Pay payment" });
    }
  });

  // Google Pay payment processing endpoint
  app.post("/api/payments/google-pay/process", async (req, res) => {
    try {
      const { paymentMethodData, transactionId, amount, currency = "NZD" } = req.body;

      if (!paymentMethodData || !transactionId || !amount) {
        return res.status(400).json({ error: "Payment method data, transaction ID, and amount are required" });
      }

      // Get the transaction
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Update transaction status to processing
      await storage.updateTransactionStatus(transactionId, "processing");

      const isSimulation = !windcaveService.isConfigured();

      if (isSimulation) {
        // Simulate Google Pay payment processing
        const paymentResult = {
          success: true,
          transactionId: `googlepay_${Date.now()}`,
          paymentMethod: "google_pay",
          amount: amount,
          currency: currency,
          status: "completed"
        };

        // Update transaction to completed
        const updatedTransaction = await storage.updateTransactionStatus(
          transactionId, 
          "completed", 
          paymentResult.transactionId
        );

        // Collect platform fee
        await storage.createPlatformFee({
          transactionId: transactionId,
          merchantId: transaction.merchantId,
          feeAmount: transaction.platformFeeAmount || "0.10",
          transactionAmount: transaction.price,
          status: 'collected',
        });

        // Track transaction for subscription billing
        if (transaction.merchantId) {
          await storage.incrementTransactionCount(transaction.merchantId);
        }

        // Notify connected clients
        broadcastToStone(transaction.merchantId!, transaction.taptStoneId, { 
          type: 'transaction_updated', 
          transaction: updatedTransaction 
        });

        res.json(paymentResult);
      } else {
        // In production, process actual Google Pay payment token with Windcave
        // This would validate and process the payment token
        return res.status(501).json({ 
          error: "Google Pay payment processing not configured for production" 
        });
      }
    } catch (error) {
      console.error("Google Pay processing error:", error);
      res.status(500).json({ error: "Failed to process Google Pay payment" });
    }
  });

  // Digital wallet configuration endpoint
  app.get("/api/payments/digital-wallet/config", async (req, res) => {
    try {
      const userAgent = req.headers['user-agent'] || '';
      const isIOS = /iPhone|iPad|iPod/.test(userAgent);
      const isAndroid = /Android/.test(userAgent);
      const isChrome = /Chrome/.test(userAgent) && /Google Inc/.test(req.headers['user-agent'] || '');

      const config = {
        applePaySupported: isIOS,
        googlePaySupported: isAndroid && isChrome,
        paymentRequestSupported: !!globalThis.PaymentRequest,
        environment: windcaveService.isConfigured() ? "production" : "test",
        merchantId: process.env.APPLE_PAY_MERCHANT_ID || "merchant.com.tapt.payment",
        merchantName: "Tapt Payment",
        supportedNetworks: ["visa", "mastercard", "amex", "eftpos"],
        countryCode: "NZ",
        currencyCode: "NZD",
        googlePayGateway: {
          gateway: "windcave",
          gatewayMerchantId: process.env.WINDCAVE_MERCHANT_ID || "test-merchant"
        }
      };

      res.json(config);
    } catch (error) {
      console.error("Digital wallet config error:", error);
      res.status(500).json({ error: "Failed to get digital wallet configuration" });
    }
  });

  // ============================================================================
  // SUBSCRIPTION ROUTES
  // ============================================================================

  // Get subscription status for current merchant
  app.get("/api/subscription", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ message: "Merchant ID required" });
      }

      const subscription = await storage.getOrCreateSubscription(merchantId);
      
      res.json({
        subscription
      });
    } catch (error) {
      console.error("Get subscription error:", error);
      res.status(500).json({ message: "Failed to get subscription" });
    }
  });

  // Update billing frequency
  app.put("/api/subscription/billing-frequency", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ message: "Merchant ID required" });
      }

      const { frequency } = req.body;
      
      if (!['weekly', 'bi_weekly', 'monthly'].includes(frequency)) {
        return res.status(400).json({ message: "Invalid billing frequency" });
      }

      const subscription = await storage.updateSubscriptionBillingFrequency(merchantId, frequency);
      
      res.json({ subscription });
    } catch (error) {
      console.error("Update billing frequency error:", error);
      res.status(500).json({ message: "Failed to update billing frequency" });
    }
  });

  // Cancel subscription (30-day notice)
  app.post("/api/subscription/cancel", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ message: "Merchant ID required" });
      }

      const { reason } = req.body;
      
      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: "Cancellation reason required" });
      }

      const subscription = await storage.cancelSubscription(merchantId, reason);
      
      res.json({ 
        subscription,
        message: "Subscription will be cancelled after 30 days"
      });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // Get billing history
  app.get("/api/subscription/billing-history", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ message: "Merchant ID required" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const history = await storage.getBillingHistory(merchantId, limit);
      
      res.json({ history });
    } catch (error) {
      console.error("Get billing history error:", error);
      res.status(500).json({ message: "Failed to get billing history" });
    }
  });

  app.get("/api/billing/card", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const merchantId = req.user?.merchantId;
    if (!merchantId) return res.status(401).json({ message: "Authentication required" });
    const merchant = await storage.getMerchant(merchantId);
    if (!merchant) return res.status(404).json({ message: "Merchant not found" });
    const ready = billingCardIsReady(merchant);
    res.json({
      ready,
      card: merchant.billingCardLast4 ? {
        last4: merchant.billingCardLast4,
        brand: merchant.billingCardBrand,
        expiry: merchant.billingCardExpiry,
      } : null,
    });
  });

  // Save only masked card metadata. Full card number and CVC are never persisted.
  app.post("/api/billing/card", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });

      const { cardNumber, expiry, cvc } = req.body;
      if (!cardNumber || !expiry || !cvc) {
        return res.status(400).json({ message: "Card number, expiry and CVC are required" });
      }

      const raw = String(cardNumber).replace(/\s+/g, '');
      if (!/^\d{13,19}$/.test(raw)) {
        return res.status(400).json({ message: "Invalid card number" });
      }
      if (!isLuhnValid(raw)) {
        return res.status(400).json({ message: "Please enter a valid card number" });
      }
      const cleanExpiry = String(expiry).trim();
      if (!isCardExpiryValid(cleanExpiry)) {
        return res.status(400).json({ message: "Please enter a valid, unexpired date in MM/YY format" });
      }
      if (!/^\d{3,4}$/.test(String(cvc))) {
        return res.status(400).json({ message: "Invalid CVC" });
      }
      // CVC validated above but intentionally NOT stored — Windcave will tokenise when live.

      const last4 = raw.slice(-4);
      let brand: "Visa" | "Mastercard" | "Amex" | null = null;
      if (/^4/.test(raw)) brand = "Visa";
      else if (/^(5[1-5]|2[2-7])/.test(raw)) brand = "Mastercard";
      else if (/^3[47]/.test(raw)) brand = "Amex";
      if (!brand) return res.status(400).json({ message: "Please use a supported credit or debit card" });

      // TODO: When Windcave billing API is available, tokenise the card here and store the token.
      // For now store masked placeholder only — no real card data is persisted.
      const merchant = await storage.updateMerchantBillingCard(merchantId, {
        last4,
        brand,
        expiry: cleanExpiry,
      });

      res.json({
        success: true,
        ready: true,
        card: { last4, brand, expiry: cleanExpiry },
        merchant,
      });
    } catch (error) {
      console.error("Save billing card error:", error);
      res.status(500).json({ message: "Failed to save card" });
    }
  });

  // Remove billing card
  app.delete("/api/billing/card", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });

      await storage.updateMerchantBillingCard(merchantId, null);
      res.json({ success: true });
    } catch (error) {
      console.error("Remove billing card error:", error);
      res.status(500).json({ message: "Failed to remove card" });
    }
  });

  // Board Builder: submit PDF for printing (public endpoint)
  app.post("/api/board-builder/submit", async (req, res) => {
    try {
      const { pdf, businessName, submitterName, submitterEmail, stoneId, layout } = req.body;
      if (!pdf || !submitterName || !submitterEmail) {
        return res.status(400).json({ message: "Missing required fields: pdf, submitterName, submitterEmail" });
      }
      const { sendBoardBuilderEmail } = await import('./email-service-multi');
      const sent = await sendBoardBuilderEmail({
        pdfBase64: pdf,
        businessName: businessName || "Business",
        submitterName,
        submitterEmail,
        stoneId: stoneId || "main",
        layout: layout || "A4 Portrait",
      });
      if (sent) {
        res.json({ message: "Board submitted successfully" });
      } else {
        res.status(500).json({ message: "Failed to send email" });
      }
    } catch (error) {
      console.error("Board builder submit error:", error);
      res.status(500).json({ message: "Failed to process board submission" });
    }
  });

  // Serve uploads from the uploaded_files table (durable across deploys), with
  // a local-disk fallback for any legacy file that predates DB-backed storage.
  app.get('/uploads/:folder/:name', async (req, res) => {
    try {
      const { folder, name } = req.params;
      // Route params never contain '/', but keep an explicit guard against
      // traversal for the disk fallback below.
      if (folder.includes('..') || name.includes('..')) return res.status(400).end();
      const relPath = `${folder}/${name}`;

      const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.path, relPath));
      if (file) {
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(file.data);
      }

      const diskPath = path.join(process.cwd(), 'uploads', folder, name);
      if (fs.existsSync(diskPath)) return res.sendFile(diskPath);

      res.status(404).json({ message: 'File not found' });
    } catch (err) {
      console.error('[UPLOADS_SERVE]', err);
      res.status(500).json({ message: 'Failed to serve file' });
    }
  });

  // ── Customer HPP redirect ────────────────────────────────────────────────────
  // When a customer opens a payment link (/pay/:merchantId or the stone variant),
  // the server creates a Windcave session immediately and sends a 302 to the
  // branded HPP — the customer never sees an intermediate TaptPay page.
  // Falls back to the React waiting screen if no active transaction exists yet
  // or if session creation fails.
  async function handleHppRedirect(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    merchantId: number,
    stoneId: number | null
  ) {
    if (isNaN(merchantId)) return next();
    try {
      // stoneId is already null for the merchant-level link — pass it straight
      // through so that link scopes to no-board sales. This path 302s the customer
      // to the Windcave HPP, so a mis-scoped read here is a real payment against
      // the wrong sale, with no intermediate page to catch it.
      const transaction = await storage.getActiveTransactionByMerchant(merchantId, stoneId);
      if (!transaction || transaction.status !== "pending") return next();

      // Split-enabled transactions → send customer to split selection page first
      if (transaction.splitEnabled && !transaction.isSplit) {
        return res.redirect(`/split/${transaction.id}`);
      }

      const baseUrl = getBaseUrl(req);
      const xId = crypto.randomBytes(8).toString("hex");
      const merchant = await storage.getMerchant(merchantId);
      const customerEmail = merchant?.email || "customer@taptpay.co.nz";
      const merchantReference = `TXN_${transaction.id}`;

      const sessionResult = isWindcaveConfigured()
        ? await createWindcaveSession(xId, transaction.price, merchantReference, customerEmail, baseUrl, transaction.id)
        : simulateCreateSession(merchantReference, baseUrl);

      if (!sessionResult.success || !sessionResult.hppUrl) return next();

      await storage.updateTransactionWindcaveSession(transaction.id, sessionResult.sessionId!, "pending", xId);
      sessionAjaxUrlCache.set(transaction.id, {
        ajaxSubmitCardUrl: sessionResult.ajaxSubmitCardUrl,
        ajaxSubmitApplePayUrl: sessionResult.ajaxSubmitApplePayUrl,
        ajaxSubmitGooglePayUrl: sessionResult.ajaxSubmitGooglePayUrl,
      });

      return res.redirect(sessionResult.hppUrl);
    } catch (err) {
      console.error("[HPP_REDIRECT]", err);
      return next();
    }
  }


  // ===========================================================================
  // PROPERTY MANAGEMENT VERTICAL
  // ===========================================================================

  // Per-token rate limiter for checkout (10 req/min per token)
  const tokenRateMap = new Map<string, { count: number; windowStart: number }>();
  function tokenRateLimit(token: string): boolean {
    const now = Date.now(), window = 60_000, limit = 10;
    const entry = tokenRateMap.get(token);
    if (!entry || now - entry.windowStart > window) { tokenRateMap.set(token, { count: 1, windowStart: now }); return true; }
    if (entry.count >= limit) return false;
    entry.count++; return true;
  }
  setInterval(() => { const c = Date.now() - 120_000; tokenRateMap.forEach((v, k) => { if (v.windowStart < c) tokenRateMap.delete(k); }); }, 300_000);

  function generateInvoiceToken(): string { return crypto.randomBytes(20).toString("base64url"); }

  // After a rent invoice is fully paid, email a GST tax invoice to the head
  // tenant plus any co-tenants / split-share payers we have addresses for.
  async function sendRentGstInvoices(invoice: any): Promise<void> {
    try {
      const [merchant, tenant] = await Promise.all([
        storage.getMerchant(invoice.merchantId),
        storage.getTenantProfile(invoice.tenantProfileId),
      ]);
      if (!merchant || !tenant) return;
      const recipients = Array.from(new Set(
        [tenant.email, ...extractEmails(tenant.coTenantsText), ...((invoice.splitPayerEmails) || [])]
          .filter(Boolean).map((e: string) => e.toLowerCase()),
      ));
      if (recipients.length === 0) return;
      const sent = await sendGstInvoices({
        recipients,
        merchantName: merchant.businessName || merchant.name,
        gstNumber: merchant.gstNumber,
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        propertyAddress: tenant.propertyAddress,
        amountCents: invoice.amountCents,
        paidAt: invoice.paidAt ? new Date(invoice.paidAt) : new Date(),
        reference: `RENT-${invoice.id.slice(0, 8).toUpperCase()}`,
      });
      await storage.logTransactionEvent({
        merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId, invoiceId: invoice.id,
        eventType: "Gst_Invoice_Sent", payload: { recipients: recipients.length, sent },
      });
    } catch (err) { console.error("[GST_INVOICE]", err); }
  }

  // Idempotently finalize a rent invoice from a Windcave payment outcome.
  // Safe to call from both the browser callback and the server notification —
  // already-finalized invoices (paid/paid_external/voided) are left untouched.
  // For split invoices each call counts one share (deduped by sessionId); the
  // invoice only flips to paid once every share is in.
  async function finalizeRentInvoice(invoiceId: string, approved: boolean, windcaveTransactionId?: string, sessionId?: string): Promise<any> {
    const inv = await storage.getInvoiceRentRequest(invoiceId);
    if (!inv) return null;
    if (["paid", "paid_external", "voided"].includes(inv.status)) return inv; // already settled

    if (!approved) {
      await storage.logTransactionEvent({
        merchantId: inv.merchantId, tenantProfileId: inv.tenantProfileId, invoiceId,
        eventType: "Payment_Declined", payload: { channel: "card" },
      });
      return inv;
    }

    // Split invoice — atomically claim this share (serialize concurrent payers at the
    // DB level so each gets a unique slot; dedup prevents the same session counting twice).
    if (inv.splitEnabled && inv.splitCount && inv.splitCount > 1) {
      const dedupeKey = sessionId ?? crypto.randomUUID();
      const claimed = await storage.atomicClaimSplitShare(invoiceId, dedupeKey);
      if (!claimed) {
        // Session already counted, or all shares claimed — return current state.
        return await storage.getInvoiceRentRequest(invoiceId);
      }
      const fullyPaid = claimed.splitPaidCount >= inv.splitCount;
      const statusUpdates: any = { windcaveTransactionId: windcaveTransactionId ?? inv.windcaveTransactionId };
      if (fullyPaid) { statusUpdates.status = "paid"; statusUpdates.paidAt = new Date(); }
      const updated = await storage.updateInvoiceRentRequest(invoiceId, statusUpdates);
      await storage.logTransactionEvent({
        merchantId: inv.merchantId, tenantProfileId: inv.tenantProfileId, invoiceId,
        eventType: fullyPaid ? "Payment_Received" : "Split_Share_Paid",
        payload: { share: claimed.splitPaidCount, of: inv.splitCount, channel: "card", windcaveTransactionId: windcaveTransactionId ?? null },
      });
      if (fullyPaid) await sendRentGstInvoices(updated);
      return updated;
    }

    // Single payment.
    const updated = await storage.updateInvoiceRentRequest(invoiceId, {
      status: "paid", paidAt: new Date(), windcaveTransactionId: windcaveTransactionId ?? null,
    });
    await storage.logTransactionEvent({
      merchantId: inv.merchantId, tenantProfileId: inv.tenantProfileId, invoiceId,
      eventType: "Payment_Received", payload: { channel: "card", amountCents: inv.amountCents, windcaveTransactionId: windcaveTransactionId ?? null },
    });
    await sendRentGstInvoices(updated);
    return updated;
  }

  // ── Tenant Profiles ──────────────────────────────────────────────────────

  type CheckoutInvoice = any & { checkoutVertical?: "property" | "trades" };

  async function getCheckoutInvoiceByToken(token: string): Promise<CheckoutInvoice | undefined> {
    const propertyInvoice = await storage.getInvoiceRentRequestByToken(token);
    if (propertyInvoice) return { ...propertyInvoice, checkoutVertical: "property" };
    const tradeInvoice = await storage.getJobInvoiceByToken(token);
    return tradeInvoice ? { ...tradeInvoice, checkoutVertical: "trades" } : undefined;
  }

  async function getCheckoutParty(invoice: CheckoutInvoice): Promise<any> {
    if (invoice.checkoutVertical === "trades") {
      const client = await storage.getClientProfile(invoice.clientProfileId);
      return client ? {
        email: client.email,
        name: `${client.firstName} ${client.lastName}`,
        address: client.siteAddress,
        coTenantsText: null,
      } : null;
    }
    const tenant = await storage.getTenantProfile(invoice.tenantProfileId);
    return tenant ? {
      email: tenant.email,
      name: `${tenant.firstName} ${tenant.lastName}`,
      address: tenant.propertyAddress,
      coTenantsText: tenant.coTenantsText ?? null,
    } : null;
  }

  async function updateCheckoutInvoice(invoice: CheckoutInvoice, updates: any): Promise<any> {
    return invoice.checkoutVertical === "trades"
      ? storage.updateJobInvoice(invoice.id, updates)
      : storage.updateInvoiceRentRequest(invoice.id, updates);
  }

  async function finalizeTradeInvoice(invoiceId: string, approved: boolean, windcaveTransactionId?: string, sessionId?: string): Promise<any> {
    const invoice = await storage.getJobInvoice(invoiceId);
    if (!invoice) return null;
    if (["paid", "paid_external", "voided"].includes(invoice.status)) return invoice;
    if (!approved) {
      await storage.createJobEvent({ merchantId: invoice.merchantId, clientProfileId: invoice.clientProfileId, jobInvoiceId: invoice.id, eventType: "payment_declined", payload: { channel: "card" } });
      return invoice;
    }
    if (invoice.splitEnabled && invoice.splitCount && invoice.splitCount > 1) {
      const claimed = await storage.atomicClaimJobSplitShare(invoiceId, sessionId ?? crypto.randomUUID());
      if (!claimed) return storage.getJobInvoice(invoiceId);
      const fullyPaid = claimed.splitPaidCount >= invoice.splitCount;
      const updated = await storage.updateJobInvoice(invoiceId, {
        ...(fullyPaid ? { status: "paid", paidAt: new Date() } : {}),
        windcaveTransactionId: windcaveTransactionId ?? invoice.windcaveTransactionId,
      });
      await storage.createJobEvent({ merchantId: invoice.merchantId, clientProfileId: invoice.clientProfileId, jobInvoiceId: invoice.id, eventType: fullyPaid ? "payment_received" : "split_share_paid", payload: { share: claimed.splitPaidCount, of: invoice.splitCount, channel: "card", windcaveTransactionId: windcaveTransactionId ?? null } });
      if (fullyPaid) await sendTradePaymentInvoice(updated);
      return updated;
    }
    const updated = await storage.updateJobInvoice(invoiceId, { status: "paid", paidAt: new Date(), windcaveTransactionId: windcaveTransactionId ?? null });
    await storage.createJobEvent({ merchantId: invoice.merchantId, clientProfileId: invoice.clientProfileId, jobInvoiceId: invoice.id, eventType: "payment_received", payload: { channel: "card", amountCents: invoice.amountCents, windcaveTransactionId: windcaveTransactionId ?? null } });
    await sendTradePaymentInvoice(updated);
    return updated;
  }

  async function finalizeCheckoutInvoice(invoice: CheckoutInvoice, approved: boolean, windcaveTransactionId?: string, sessionId?: string): Promise<any> {
    return invoice.checkoutVertical === "trades"
      ? finalizeTradeInvoice(invoice.id, approved, windcaveTransactionId, sessionId)
      : finalizeRentInvoice(invoice.id, approved, windcaveTransactionId, sessionId);
  }

  app.get("/api/property/tenants", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const includeArchived = req.query.includeArchived === "true";
      const tenants = await storage.getTenantProfilesByMerchant(merchantId, { search, includeArchived });
      res.json(tenants);
    } catch (err) { console.error("[PROP_TENANTS_LIST]", err); res.status(500).json({ message: "Failed to fetch tenants" }); }
  });

  app.post("/api/property/tenants", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const data = createTenantProfileSchema.parse(req.body);
      const tenant = await storage.createTenantProfile({ ...data, merchantId });
      await storage.logTransactionEvent({ merchantId, tenantProfileId: tenant.id, eventType: "Tenant_Created", payload: { firstName: tenant.firstName, lastName: tenant.lastName, propertyAddress: tenant.propertyAddress } });
      res.status(201).json(tenant);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[PROP_TENANT_CREATE]", err); res.status(500).json({ message: "Failed to create tenant" });
    }
  });

  app.get("/api/property/tenants/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const tenant = await storage.getTenantProfile(req.params.id);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!checkMerchantOwnership(req, tenant.merchantId)) return res.status(403).json({ message: "Access denied" });
      res.json(tenant);
    } catch (err) { console.error("[PROP_TENANT_GET]", err); res.status(500).json({ message: "Failed to fetch tenant" }); }
  });

  app.put("/api/property/tenants/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getTenantProfile(req.params.id);
      if (!existing) return res.status(404).json({ message: "Tenant not found" });
      if (!checkMerchantOwnership(req, existing.merchantId)) return res.status(403).json({ message: "Access denied" });
      const data = updateTenantProfileSchema.parse(req.body);
      const tenant = await storage.updateTenantProfile(req.params.id, data);
      res.json(tenant);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[PROP_TENANT_UPDATE]", err); res.status(500).json({ message: "Failed to update tenant" });
    }
  });

  app.post("/api/property/tenants/:id/archive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getTenantProfile(req.params.id);
      if (!existing) return res.status(404).json({ message: "Tenant not found" });
      if (!checkMerchantOwnership(req, existing.merchantId)) return res.status(403).json({ message: "Access denied" });
      const tenant = await storage.archiveTenantProfile(req.params.id);
      await storage.logTransactionEvent({ merchantId, tenantProfileId: req.params.id, eventType: "Tenant_Archived", payload: {} });
      res.json(tenant);
    } catch (err) { console.error("[PROP_TENANT_ARCHIVE]", err); res.status(500).json({ message: "Failed to archive tenant" }); }
  });

  app.post("/api/property/tenants/:id/unarchive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getTenantProfile(req.params.id);
      if (!existing) return res.status(404).json({ message: "Tenant not found" });
      if (!checkMerchantOwnership(req, existing.merchantId)) return res.status(403).json({ message: "Access denied" });
      const tenant = await storage.unarchiveTenantProfile(req.params.id);
      await storage.logTransactionEvent({ merchantId, tenantProfileId: req.params.id, eventType: "Tenant_Restored", payload: {} });
      res.json(tenant);
    } catch (err) { console.error("[PROP_TENANT_UNARCHIVE]", err); res.status(500).json({ message: "Failed to restore tenant" }); }
  });

  app.get("/api/property/tenants/:id/events", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const tenant = await storage.getTenantProfile(req.params.id);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!checkMerchantOwnership(req, tenant.merchantId)) return res.status(403).json({ message: "Access denied" });
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const events = await storage.getTransactionEventsByTenant(req.params.id, limit);
      res.json(events);
    } catch (err) { console.error("[PROP_EVENTS]", err); res.status(500).json({ message: "Failed to fetch events" }); }
  });

  // ── Schedules ────────────────────────────────────────────────────────────

  app.get("/api/property/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      res.json(await storage.getActiveSchedulesByMerchant(merchantId));
    } catch (err) { console.error("[PROP_SCHEDULES_MERCHANT]", err); res.status(500).json({ message: "Failed to fetch schedules" }); }
  });

  app.get("/api/property/tenants/:tenantId/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const tenant = await storage.getTenantProfile(req.params.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!checkMerchantOwnership(req, tenant.merchantId)) return res.status(403).json({ message: "Access denied" });
      res.json(await storage.getActiveSchedulesByTenant(req.params.tenantId));
    } catch (err) { console.error("[PROP_SCHEDULES_LIST]", err); res.status(500).json({ message: "Failed to fetch schedules" }); }
  });

  app.post("/api/property/tenants/:tenantId/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const tenant = await storage.getTenantProfile(req.params.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!checkMerchantOwnership(req, tenant.merchantId)) return res.status(403).json({ message: "Access denied" });
      if (!(await requireBillingCard(merchantId, res))) return;
      const data = createActiveScheduleSchema.parse({ ...req.body, tenantProfileId: req.params.tenantId });
      const schedule = await storage.createActiveSchedule({ ...data, merchantId, nextRunDate: data.startDate });
      await storage.logTransactionEvent({ merchantId, tenantProfileId: req.params.tenantId, scheduleId: schedule.id, eventType: "Schedule_Created", payload: { amountCents: schedule.amountCents, frequency: schedule.frequency } });
      res.status(201).json(schedule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[PROP_SCHEDULE_CREATE]", err); res.status(500).json({ message: "Failed to create schedule" });
    }
  });

  app.put("/api/property/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getActiveSchedule(req.params.id);
      if (!existing) return res.status(404).json({ message: "Schedule not found" });
      if (!checkMerchantOwnership(req, existing.merchantId)) return res.status(403).json({ message: "Access denied" });
      const data = updateActiveScheduleSchema.parse(req.body);
      const schedule = await storage.updateActiveSchedule(req.params.id, data);
      if (data.status === "paused" || data.status === "active") {
        await storage.logTransactionEvent({ merchantId, tenantProfileId: existing.tenantProfileId, scheduleId: req.params.id, eventType: data.status === "paused" ? "Schedule_Paused" : "Schedule_Resumed", payload: {} });
      }
      res.json(schedule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[PROP_SCHEDULE_UPDATE]", err); res.status(500).json({ message: "Failed to update schedule" });
    }
  });

  app.delete("/api/property/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getActiveSchedule(req.params.id);
      if (!existing) return res.status(404).json({ message: "Schedule not found" });
      if (!checkMerchantOwnership(req, existing.merchantId)) return res.status(403).json({ message: "Access denied" });
      const schedule = await storage.terminateActiveSchedule(req.params.id);
      await storage.logTransactionEvent({ merchantId, tenantProfileId: existing.tenantProfileId, scheduleId: req.params.id, eventType: "Schedule_Terminated", payload: {} });
      res.json(schedule);
    } catch (err) { console.error("[PROP_SCHEDULE_DELETE]", err); res.status(500).json({ message: "Failed to terminate schedule" }); }
  });

  // ── Invoices ─────────────────────────────────────────────────────────────

  app.get("/api/property/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const tenantProfileId = typeof req.query.tenantProfileId === "string" ? req.query.tenantProfileId : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const invoices = await storage.getInvoiceRentRequestsByMerchant(merchantId, { status, tenantProfileId });
      // Enrich with tenant display name/address and computed split owing.
      const cache = new Map<string, { tenantName: string; propertyAddress: string }>();
      const enriched = await Promise.all(invoices.map(async (inv: any) => {
        if (!cache.has(inv.tenantProfileId)) {
          const t = await storage.getTenantProfile(inv.tenantProfileId).catch(() => null);
          cache.set(inv.tenantProfileId, t
            ? { tenantName: `${t.firstName} ${t.lastName}`, propertyAddress: t.propertyAddress }
            : { tenantName: "—", propertyAddress: "—" });
        }
        const isSplit = inv.splitEnabled && inv.splitCount && inv.splitCount > 1;
        const base = isSplit ? Math.floor(inv.amountCents / inv.splitCount) : 0;
        const owingCents = isSplit ? inv.amountCents - (inv.splitPaidCount || 0) * base : inv.amountCents;
        const sharesLeft = isSplit ? inv.splitCount - (inv.splitPaidCount || 0) : null;
        return { ...inv, ...cache.get(inv.tenantProfileId), owingCents, sharesLeft };
      }));
      res.json(enriched);
    } catch (err) { console.error("[PROP_INVOICES_LIST]", err); res.status(500).json({ message: "Failed to fetch invoices" }); }
  });

  // Upload a supporting document (PDF/image) for a one-off charge. Returns the
  // stored URL + original filename; the bill-create call then attaches them to
  // the invoice. Kept separate from invoice creation so the create route stays
  // JSON (multipart is only needed when there's actually a file to send).
  app.post("/api/property/invoices/document", authenticateToken, invoiceDocUpload.single('document'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ext = path.extname(req.file.originalname).toLowerCase();
      const filename = `invoice-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      await saveUploadedFile(`invoices/${filename}`, req.file.mimetype, req.file.buffer);
      const documentUrl = `/uploads/invoices/${filename}`;
      res.json({ documentUrl, documentName: req.file.originalname });
    } catch (err) {
      console.error("[PROP_INVOICE_DOC_UPLOAD]", err);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  app.post("/api/property/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const tenant = await storage.getTenantProfile(req.body.tenantProfileId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!checkMerchantOwnership(req, tenant.merchantId)) return res.status(403).json({ message: "Access denied" });
      if (!(await requireBillingCard(merchantId, res))) return;
      const data = createAdHocInvoiceSchema.parse(req.body);
      const baseUrl = getBaseUrl(req);
      const isCharge = data.kind === "charge";

      // Dedupe: if this tenant already has a live (unpaid) RENT invoice, update its
      // amount and resend it rather than creating a duplicate. One-off charges are
      // never deduped — they must coexist with rent (and with each other) instead of
      // overwriting the tenant's live rent invoice.
      if (!isCharge) {
        const existing = await storage.getLiveInvoiceByTenant(data.tenantProfileId);
        if (existing && existing.kind !== "charge") {
          if (data.amountCents && data.amountCents !== existing.amountCents) {
            await storage.updateInvoiceRentRequest(existing.id, { amountCents: data.amountCents });
          }
          const delivery = await resendInvoiceEmail(existing.id, baseUrl);
          const fresh = await storage.getInvoiceRentRequest(existing.id);
          return res.status(200).json({ ...fresh, resent: true, delivered: delivery.ok, deliveryReason: delivery.reason });
        }
      }

      const invoice = await storage.createInvoiceRentRequest({ ...data, merchantId, token: generateInvoiceToken(), status: "pending_dispatch" });
      await storage.logTransactionEvent({ merchantId, tenantProfileId: data.tenantProfileId, invoiceId: invoice.id, eventType: isCharge ? "Charge_Created" : "Invoice_Generated", payload: { amountCents: invoice.amountCents, channel: invoice.deliveryChannel, ...(isCharge ? { chargeType: data.chargeType, description: data.description } : {}) } });
      // Send the link immediately; if delivery fails it stays pending and the cron retries.
      const delivery = await resendInvoiceEmail(invoice.id, baseUrl);
      const fresh = await storage.getInvoiceRentRequest(invoice.id);
      res.status(201).json({ ...fresh, resent: false, delivered: delivery.ok, deliveryReason: delivery.reason });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[PROP_INVOICE_CREATE]", err); res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.post("/api/property/invoices/:id/resend", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const invoice = await storage.getInvoiceRentRequest(req.params.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (!checkMerchantOwnership(req, invoice.merchantId)) return res.status(403).json({ message: "Access denied" });
      if (!(await requireBillingCard(merchantId, res))) return;
      if (["paid", "paid_external", "voided"].includes(invoice.status)) return res.status(400).json({ message: "Invoice is not payable" });
      const delivery = await resendInvoiceEmail(req.params.id, getBaseUrl(req));
      if (!delivery.ok) return res.status(502).json({ message: "Could not resend", reason: delivery.reason });
      res.json(delivery.invoice);
    } catch (err) { console.error("[PROP_INVOICE_RESEND]", err); res.status(500).json({ message: "Failed to resend invoice" }); }
  });

  app.get("/api/property/invoices/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const invoice = await storage.getInvoiceRentRequest(req.params.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (!checkMerchantOwnership(req, invoice.merchantId)) return res.status(403).json({ message: "Access denied" });
      res.json(invoice);
    } catch (err) { console.error("[PROP_INVOICE_GET]", err); res.status(500).json({ message: "Failed to fetch invoice" }); }
  });

  app.post("/api/property/invoices/:id/void", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const invoice = await storage.getInvoiceRentRequest(req.params.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (!checkMerchantOwnership(req, invoice.merchantId)) return res.status(403).json({ message: "Access denied" });
      if (["paid", "paid_external"].includes(invoice.status)) return res.status(400).json({ message: "Cannot void a paid invoice" });
      const updated = await storage.updateInvoiceRentRequest(req.params.id, { status: "voided", voidedAt: new Date() });
      await storage.logTransactionEvent({ merchantId, tenantProfileId: invoice.tenantProfileId, invoiceId: req.params.id, eventType: "Invoice_Voided", payload: {} });
      res.json(updated);
    } catch (err) { console.error("[PROP_INVOICE_VOID]", err); res.status(500).json({ message: "Failed to void invoice" }); }
  });

  app.post("/api/property/invoices/:id/mark-paid-external", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const invoice = await storage.getInvoiceRentRequest(req.params.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (!checkMerchantOwnership(req, invoice.merchantId)) return res.status(403).json({ message: "Access denied" });
      if (invoice.status === "paid" || invoice.status === "paid_external") return res.status(400).json({ message: "Invoice is already paid" });
      const { externalPaymentReference } = markInvoicePaidExternalSchema.parse(req.body);
      const updated = await storage.updateInvoiceRentRequest(req.params.id, { status: "paid_external", paidAt: new Date(), externalPaymentReference: externalPaymentReference ?? null });
      await storage.logTransactionEvent({ merchantId, tenantProfileId: invoice.tenantProfileId, invoiceId: req.params.id, eventType: "Payment_External", payload: { externalPaymentReference } });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[PROP_INVOICE_MARK_PAID]", err); res.status(500).json({ message: "Failed to mark invoice paid" });
    }
  });

  // ── Hosted checkout (public, unauthenticated) ─────────────────────────────

  app.get("/api/checkout/resolve/:token", async (req, res) => {
    try {
      const { token } = req.params;
      if (!tokenRateLimit(token)) return res.status(429).json({ message: "Too many requests" });
      const invoice = await getCheckoutInvoiceByToken(token);
      if (!invoice) return res.status(404).json({ message: "Payment link not found" });
      if (invoice.status === "voided") return res.status(410).json({ message: "This payment link has been voided" });
      if (invoice.status === "paid" || invoice.status === "paid_external") return res.status(200).json({ alreadyPaid: true, amountCents: invoice.amountCents });
      const [merchant, party] = await Promise.all([storage.getMerchant(invoice.merchantId), getCheckoutParty(invoice)]);
      if (!merchant || !party) return res.status(404).json({ message: "Payment details unavailable" });

      // Additive context for the branded checkout amount subtitle:
      //  • property rent → billing cadence (weekly/fortnightly/monthly) from the schedule
      //  • trades deposit → the parent quote's total + deposit terms, so the card can
      //    render "10% deposit of $2,500"; also recovers a real description when the
      //    auto-issued deposit invoice has null jobDetails (falls back to quote line 1).
      let frequency: string | null = null;
      let quoteInfo: { totalCents: number; depositType: string | null; depositValue: number | null } | null = null;
      let tradesDescription: string | null = null;
      if (invoice.checkoutVertical === "property" && invoice.scheduleId) {
        const schedule = await storage.getActiveSchedule(invoice.scheduleId);
        frequency = schedule?.frequency ?? null;
      }
      if (invoice.checkoutVertical === "trades") {
        tradesDescription = invoice.jobDetails ?? null;
        if (invoice.quoteId) {
          const quote = await storage.getQuote(invoice.quoteId);
          if (quote) {
            quoteInfo = { totalCents: quote.totalCents, depositType: quote.depositType ?? null, depositValue: quote.depositValue ?? null };
            if (!tradesDescription) {
              const firstItem = Array.isArray(quote.lineItems) ? quote.lineItems[0] : null;
              tradesDescription = firstItem?.description ?? null;
            }
          }
        }
        tradesDescription = tradesDescription ?? "Job invoice";
      }

      res.json({
        vertical: invoice.checkoutVertical ?? "property",
        invoiceId: invoice.id, amountCents: invoice.amountCents, dueAt: invoice.dueAt, status: invoice.status,
        merchantId: invoice.merchantId,
        merchantName: merchant.businessName || merchant.name,
        customLogoUrl: merchant.customLogoUrl ?? null,
        propertyAddress: party.address,
        tenantName: party.name,
        coTenantsText: party.coTenantsText ?? null,
        // What the payment is for — lets the branded checkout label the amount
        // ("Rent" vs the one-off charge's description).
        kind: invoice.kind ?? "rent",
        chargeType: invoice.chargeType ?? null,
        // Rent cadence (property) and quote/deposit terms (trades) drive the
        // amount subtitle; null on verticals/invoices where they don't apply.
        frequency,
        quote: quoteInfo,
        description: invoice.checkoutVertical === "trades" ? tradesDescription : (invoice.description ?? null),
        // Attached invoice document for one-off charges — surfaced as a
        // "View invoice" link on the branded checkout page.
        documentUrl: invoice.documentUrl ?? null,
        documentName: invoice.documentName ?? null,
        splitEnabled: !!invoice.splitEnabled,
        splitCount: invoice.splitCount ?? null,
        splitPaidCount: invoice.splitPaidCount ?? 0,
      });
    } catch (err) { console.error("[CHECKOUT_RESOLVE]", err); res.status(500).json({ message: "Failed to load payment details" }); }
  });

  // Tenant chooses how many flatmates to split the rent between (sets splitCount).
  app.post("/api/checkout/:token/split", async (req, res) => {
    try {
      const { token } = req.params;
      if (!tokenRateLimit(token)) return res.status(429).json({ message: "Too many requests" });
      const count = parseInt(String(req.body?.count), 10);
      if (!Number.isInteger(count) || count < 2 || count > 12) return res.status(400).json({ message: "Choose between 2 and 12 people" });
      const invoice = await getCheckoutInvoiceByToken(token);
      if (!invoice) return res.status(404).json({ message: "Payment link not found" });
      if (!invoice.splitEnabled) return res.status(400).json({ message: "Splitting is not enabled for this payment" });
      if (["voided", "paid", "paid_external"].includes(invoice.status)) return res.status(409).json({ message: "Invoice is not payable" });
      if ((invoice.splitPaidCount ?? 0) > 0) return res.status(409).json({ message: "A split is already in progress" });
      await updateCheckoutInvoice(invoice, { splitCount: count });
      res.json({ splitCount: count, splitPaidCount: 0, shareCents: Math.floor(invoice.amountCents / count) });
    } catch (err) { console.error("[CHECKOUT_SPLIT]", err); res.status(500).json({ message: "Failed to set up split" }); }
  });

  app.post("/api/checkout/pay", async (req, res) => {
    try {
      const { token, payerEmail } = req.body as { token?: string; payerEmail?: string };
      if (!token) return res.status(400).json({ message: "token required" });
      if (!tokenRateLimit(token)) return res.status(429).json({ message: "Too many requests" });
      const invoice = await getCheckoutInvoiceByToken(token);
      if (!invoice) return res.status(404).json({ message: "Payment link not found" });
      if (["voided", "paid", "paid_external"].includes(invoice.status)) return res.status(409).json({ message: "Invoice is not payable" });
      const [merchant, party] = await Promise.all([storage.getMerchant(invoice.merchantId), getCheckoutParty(invoice)]);
      if (!merchant || !party) return res.status(500).json({ message: "Invoice data unavailable" });
      const baseUrl = getBaseUrl(req);

      // Determine what to charge: the full amount, or one share of a split.
      let chargeCents = invoice.amountCents;
      const isSplit = invoice.splitEnabled && invoice.splitCount && invoice.splitCount > 1;
      if (isSplit) {
        const paid = invoice.splitPaidCount ?? 0;
        if (paid >= invoice.splitCount) return res.status(409).json({ message: "This split is already fully paid" });
        const base = Math.floor(invoice.amountCents / invoice.splitCount);
        const isLastShare = paid === invoice.splitCount - 1;
        chargeCents = isLastShare ? invoice.amountCents - base * (invoice.splitCount - 1) : base;
        // Record the payer's email (for their GST copy) before sending them to the gateway.
        if (typeof payerEmail === "string" && /.+@.+\..+/.test(payerEmail)) {
          const emails: string[] = invoice.splitPayerEmails || [];
          const lower = payerEmail.toLowerCase();
          if (!emails.includes(lower)) await updateCheckoutInvoice(invoice, { splitPayerEmails: [...emails, lower] });
        }
      }

      const amountStr = (chargeCents / 100).toFixed(2);
      const merchantRef = (invoice.checkoutVertical === "trades" ? "JOB-" : "RENT-") + invoice.id.slice(0, 8).toUpperCase();
      const xId = crypto.randomBytes(16).toString("hex");
      let sessionResult: any;
      if (isWindcaveConfigured()) {
        sessionResult = await createWindcaveSession(
          xId, amountStr, merchantRef, party.email ?? "tenant@taptpay.co.nz", baseUrl, 0, 0,
          { callbackBase: `${baseUrl}/api/checkout/callback?token=${token}`, notificationUrl: `${baseUrl}/api/windcave/${invoice.checkoutVertical === "trades" ? "trades" : "rent"}-notification` },
        );
      } else {
        sessionResult = simulateRentSession(token, baseUrl);
      }
      if (!sessionResult.success) return res.status(502).json({ message: "Payment gateway error. Please try again." });
      // Pin single-payment invoices to their one Windcave session so a stale or
      // foreign session can't finalize them. Split invoices legitimately create
      // one session per payer; pinning a single shared value would 403 every
      // payer but the most recent, so we skip it and rely on per-session dedup
      // (splitPaidSessions) instead.
      if (sessionResult.sessionId && !isSplit) await updateCheckoutInvoice(invoice, { windcaveSessionId: sessionResult.sessionId });
      // Duplicate X-ID — Windcave reports the session already completed; finalize now
      // and bounce the payer back to the checkout page to see the result.
      if (sessionResult.alreadyComplete) {
        await finalizeCheckoutInvoice(invoice, !!sessionResult.approved, sessionResult.windcaveTransactionId, sessionResult.sessionId);
        return res.json({ hppUrl: `${baseUrl}/r/${token}` });
      }
      if (!sessionResult.hppUrl) return res.status(502).json({ message: "Payment gateway error. Please try again." });
      res.json({ hppUrl: sessionResult.hppUrl });
    } catch (err) { console.error("[CHECKOUT_PAY]", err); res.status(500).json({ message: "Failed to initiate payment" }); }
  });

  // In-page (Hosted Fields) equivalent of /api/checkout/pay. Creates a Windcave
  // session for the invoice and returns the AJAX submit URLs so the branded
  // checkout page can take card / Apple Pay / Google Pay details in-page instead
  // of redirecting the payer out to the external Windcave HPP. The URLs are
  // cached server-side (never trusted from the client) and consumed at completion.
  app.post("/api/checkout/:token/session", async (req, res) => {
    try {
      const { token } = req.params;
      const { payerEmail } = req.body as { payerEmail?: string };
      if (!tokenRateLimit(token)) return res.status(429).json({ message: "Too many requests" });
      const invoice = await getCheckoutInvoiceByToken(token);
      if (!invoice) return res.status(404).json({ message: "Payment link not found" });
      if (["voided", "paid", "paid_external"].includes(invoice.status)) return res.status(409).json({ message: "Invoice is not payable" });
      const [merchant, party] = await Promise.all([storage.getMerchant(invoice.merchantId), getCheckoutParty(invoice)]);
      if (!merchant || !party) return res.status(500).json({ message: "Invoice data unavailable" });
      const baseUrl = getBaseUrl(req);

      // Determine what to charge: the full amount, or one share of a split.
      let chargeCents = invoice.amountCents;
      const isSplit = invoice.splitEnabled && invoice.splitCount && invoice.splitCount > 1;
      if (isSplit) {
        const paid = invoice.splitPaidCount ?? 0;
        if (paid >= invoice.splitCount!) return res.status(409).json({ message: "This split is already fully paid" });
        const base = Math.floor(invoice.amountCents / invoice.splitCount!);
        const isLastShare = paid === invoice.splitCount! - 1;
        chargeCents = isLastShare ? invoice.amountCents - base * (invoice.splitCount! - 1) : base;
        // Record the payer's email (for their GST copy) before charging.
        if (typeof payerEmail === "string" && /.+@.+\..+/.test(payerEmail)) {
          const emails: string[] = invoice.splitPayerEmails || [];
          const lower = payerEmail.toLowerCase();
          if (!emails.includes(lower)) await updateCheckoutInvoice(invoice, { splitPayerEmails: [...emails, lower] });
        }
      }

      const amountStr = (chargeCents / 100).toFixed(2);
      const merchantRef = (invoice.checkoutVertical === "trades" ? "JOB-" : "RENT-") + invoice.id.slice(0, 8).toUpperCase();
      const xId = crypto.randomBytes(16).toString("hex");
      let sessionResult: any;
      if (isWindcaveConfigured()) {
        sessionResult = await createWindcaveSession(
          xId, amountStr, merchantRef, party.email ?? "tenant@taptpay.co.nz", baseUrl, 0, 0,
          { callbackBase: `${baseUrl}/api/checkout/callback?token=${token}`, notificationUrl: `${baseUrl}/api/windcave/${invoice.checkoutVertical === "trades" ? "trades" : "rent"}-notification` },
        );
      } else {
        // Simulation: reuse the retail sim session so we get fake AJAX submit URLs
        // for the in-page Hosted Fields flow (simulateRentSession only has an HPP url).
        sessionResult = simulateCreateSession(merchantRef, baseUrl);
      }
      if (!sessionResult.success) return res.status(502).json({ message: "Payment gateway error. Please try again." });
      // Pin single-payment invoices to their one Windcave session so a stale or
      // foreign session can't finalize them. Split invoices legitimately create
      // one session per payer; pinning a single shared value would 403 every
      // payer but the most recent, so we skip it and rely on per-session dedup
      // (splitPaidSessions) instead.
      if (sessionResult.sessionId && !isSplit) await updateCheckoutInvoice(invoice, { windcaveSessionId: sessionResult.sessionId });

      // Duplicate X-ID — Windcave reports the session already completed; finalize now
      // and tell the page to show its success/declined state without a second submit.
      if (sessionResult.alreadyComplete) {
        await finalizeCheckoutInvoice(invoice, !!sessionResult.approved, sessionResult.windcaveTransactionId, sessionResult.sessionId);
        return res.json({ alreadyComplete: true, approved: !!sessionResult.approved });
      }

      invoiceAjaxUrlCache.set(token, {
        ajaxSubmitCardUrl: sessionResult.ajaxSubmitCardUrl,
        ajaxSubmitApplePayUrl: sessionResult.ajaxSubmitApplePayUrl,
        ajaxSubmitGooglePayUrl: sessionResult.ajaxSubmitGooglePayUrl,
      });

      return res.json({
        sessionId: sessionResult.sessionId,
        amountStr,
        ajaxSubmitCardUrl: sessionResult.ajaxSubmitCardUrl,
        ajaxSubmitApplePayUrl: sessionResult.ajaxSubmitApplePayUrl,
        ajaxSubmitGooglePayUrl: sessionResult.ajaxSubmitGooglePayUrl,
      });
    } catch (err) { console.error("[CHECKOUT_SESSION]", err); res.status(500).json({ message: "Failed to initiate payment" }); }
  });

  // Card / Apple Pay completion for the invoice in-page flow. Mirrors
  // /api/transactions/:id/hosted-fields-complete but finalizes via the
  // invoice-aware, idempotent finalizeRentInvoice (handles splits + GST).
  app.post("/api/checkout/:token/hosted-fields-complete", async (req, res) => {
    try {
      const { token } = req.params;
      const { sessionId } = req.body as { sessionId?: string };
      if (!sessionId) return res.status(400).json({ message: "sessionId required" });
      const invoice = await getCheckoutInvoiceByToken(token);
      if (!invoice) return res.status(404).json({ message: "Payment link not found" });
      // Split invoices have one session per payer (not pinned on the invoice), so
      // the single-session equality check only applies to single payments.
      const isSplit = invoice.splitEnabled && invoice.splitCount && invoice.splitCount > 1;
      if (!isSplit && invoice.windcaveSessionId && invoice.windcaveSessionId !== sessionId) {
        console.error(`[checkout-complete] sessionId mismatch for invoice ${invoice.id}`);
        return res.status(403).json({ message: "Session ID mismatch" });
      }
      const queryResult = isWindcaveConfigured() ? await queryWindcaveSession(sessionId) : simulateQuerySession(sessionId);
      invoiceAjaxUrlCache.delete(token);
      const updated = await finalizeCheckoutInvoice(invoice, queryResult.approved === true, queryResult.windcaveTransactionId, sessionId);
      return res.json({
        approved: queryResult.approved === true,
        status: updated?.status,
        splitCount: updated?.splitCount ?? null,
        splitPaidCount: updated?.splitPaidCount ?? 0,
      });
    } catch (err) { console.error("[CHECKOUT_HF_COMPLETE]", err); res.status(500).json({ message: "Failed to finalise payment" }); }
  });

  // Google Pay completion for the invoice in-page flow. Mirrors
  // /api/transactions/:id/googlepay-complete using the token-keyed AJAX cache.
  app.post("/api/checkout/:token/googlepay-complete", async (req, res) => {
    try {
      const { token } = req.params;
      const { sessionId, googlePayToken } = req.body as { sessionId?: string; googlePayToken?: object };
      if (!sessionId) return res.status(400).json({ message: "sessionId required" });
      const invoice = await getCheckoutInvoiceByToken(token);
      if (!invoice) return res.status(404).json({ message: "Payment link not found" });
      // Split invoices have one session per payer (not pinned on the invoice), so
      // the single-session equality check only applies to single payments.
      const isSplit = invoice.splitEnabled && invoice.splitCount && invoice.splitCount > 1;
      if (!isSplit && invoice.windcaveSessionId && invoice.windcaveSessionId !== sessionId) {
        console.error(`[checkout-gpay] sessionId mismatch for invoice ${invoice.id}`);
        return res.status(403).json({ message: "Session ID mismatch" });
      }

      let approved = false;
      let windcaveTransactionId: string | undefined;
      if (!isWindcaveConfigured()) {
        approved = true;
        windcaveTransactionId = `SIMTXN_GPAY_${Date.now()}`;
      } else {
        const ajaxUrl = invoiceAjaxUrlCache.get(token)?.ajaxSubmitGooglePayUrl;
        if (ajaxUrl && googlePayToken) {
          assertWindcaveUrl(ajaxUrl);
          const gpayResult = await submitGooglePayToken(ajaxUrl, googlePayToken);
          if (gpayResult.error === "3DS_REQUIRED") {
            const queryResult = await queryWindcaveSession(sessionId);
            approved = queryResult.approved === true;
            windcaveTransactionId = queryResult.windcaveTransactionId;
          } else {
            approved = gpayResult.approved === true;
            windcaveTransactionId = gpayResult.windcaveTransactionId;
          }
        } else {
          const queryResult = await queryWindcaveSession(sessionId);
          approved = queryResult.approved === true;
          windcaveTransactionId = queryResult.windcaveTransactionId;
        }
        invoiceAjaxUrlCache.delete(token);
      }

      const updated = await finalizeCheckoutInvoice(invoice, approved, windcaveTransactionId, sessionId);
      return res.json({
        approved,
        status: updated?.status,
        splitCount: updated?.splitCount ?? null,
        splitPaidCount: updated?.splitPaidCount ?? 0,
      });
    } catch (err) { console.error("[CHECKOUT_GPAY_COMPLETE]", err); res.status(500).json({ message: "Failed to finalise Google Pay payment" }); }
  });

  // Browser return after the tenant pays on the Windcave HPP. Confirms the real
  // outcome by querying the session (never trusts the result param alone), then
  // redirects back to /r/:token which renders the paid/declined state.
  app.get("/api/checkout/callback", async (req, res) => {
    try {
      const token = req.query.token as string;
      const result = req.query.result as string;
      const isSim = req.query.sim === "1";
      if (!token) return res.redirect("/");
      const invoice = await getCheckoutInvoiceByToken(token);
      if (!invoice) return res.redirect("/");
      const back = `/r/${token}`;

      // Already settled, or tenant cancelled (no charge) — just show the page
      if (["paid", "paid_external", "voided"].includes(invoice.status)) return res.redirect(back);
      if (result === "cancelled") return res.redirect(back);

      const sessionId = invoice.windcaveSessionId;
      let queryResult: any;
      if (isWindcaveConfigured() && !isSim && sessionId) {
        queryResult = await queryWindcaveSession(sessionId);
      } else {
        // Simulation — honor the result embedded in the callback URL
        queryResult = { success: true, approved: result === "approved", windcaveTransactionId: result === "approved" ? `SIMTXN_${Date.now()}` : undefined };
      }
      if (queryResult.success) {
        await finalizeCheckoutInvoice(invoice, !!queryResult.approved, queryResult.windcaveTransactionId, sessionId);
      }
      return res.redirect(back);
    } catch (err) { console.error("[CHECKOUT_CALLBACK]", err); return res.redirect("/"); }
  });

  // Server-to-server notification from Windcave for rent sessions. Looks up the
  // invoice by session id and finalizes idempotently (the browser callback may
  // have already done so).
  app.all("/api/windcave/rent-notification", express.urlencoded({ extended: true }), express.json(), async (req, res) => {
    res.status(200).send("OK"); // respond fast so Windcave stops retrying
    try {
      const sessionId = (req.query?.sessionid as string) || (req.query?.sessionId as string) || req.body?.sessionId || req.body?.sessionid;
      if (!sessionId) { console.warn("[RENT_NOTIF] No sessionId", req.query); return; }
      const invoice = await storage.getInvoiceRentRequestByWindcaveSessionId(sessionId);
      if (!invoice) { console.warn(`[RENT_NOTIF] No invoice for session ${sessionId}`); return; }
      if (["paid", "paid_external", "voided"].includes(invoice.status)) return; // already settled
      const queryResult = isWindcaveConfigured() ? await queryWindcaveSession(sessionId) : simulateQuerySession(sessionId);
      if (!queryResult.success) { console.error(`[RENT_NOTIF] query failed for ${sessionId}:`, queryResult.error); return; }
      await finalizeRentInvoice(invoice.id, !!queryResult.approved, queryResult.windcaveTransactionId, sessionId);
      console.log(`[RENT_NOTIF] invoice ${invoice.id} → ${queryResult.approved ? "paid" : "declined"}`);
    } catch (err) { console.error("[RENT_NOTIF] Error:", err); }
  });


  app.all("/api/windcave/trades-notification", express.urlencoded({ extended: true }), express.json(), async (req, res) => {
    res.status(200).send("OK");
    try {
      const sessionId = (req.query?.sessionid as string) || (req.query?.sessionId as string) || req.body?.sessionId || req.body?.sessionid;
      if (!sessionId) { console.warn("[TRADES_NOTIF] No sessionId", req.query); return; }
      const stored = await storage.getJobInvoiceByWindcaveSessionId(sessionId);
      if (!stored) { console.warn(`[TRADES_NOTIF] No invoice for session ${sessionId}`); return; }
      if (["paid", "paid_external", "voided"].includes(stored.status)) return;
      const queryResult = isWindcaveConfigured() ? await queryWindcaveSession(sessionId) : simulateQuerySession(sessionId);
      if (!queryResult.success) { console.error(`[TRADES_NOTIF] query failed for ${sessionId}:`, queryResult.error); return; }
      const invoice = { ...stored, checkoutVertical: "trades" as const };
      await finalizeCheckoutInvoice(invoice, !!queryResult.approved, queryResult.windcaveTransactionId, sessionId);
      console.log(`[TRADES_NOTIF] invoice ${invoice.id} -> ${queryResult.approved ? "paid" : "declined"}`);
    } catch (err) { console.error("[TRADES_NOTIF] Error:", err); }
  });
  // Evolution API webhook — receives delivery status updates for WhatsApp messages.
  // Matches each event's message ID back to the invoice that sent it, logs the
  // status, and stamps whatsappDeliveredAt on the first DELIVERY_ACK or READ event.
  // Guards the endpoint with the same EVOLUTION_API_KEY used to send messages.
  app.post("/api/webhooks/whatsapp", express.json(), async (req, res) => {
    res.status(200).send("OK"); // respond immediately so Evolution doesn't retry
    try {
      if (process.env.EVOLUTION_API_KEY) {
        const incoming = req.headers["apikey"] as string | undefined;
        if (incoming !== process.env.EVOLUTION_API_KEY) {
          console.warn("[WA_WEBHOOK] rejected — bad apikey");
          return;
        }
      }
      const { event, data } = req.body ?? {};
      if (event !== "messages.update") return; // only care about delivery status
      // data may be an array or single object depending on Evolution API version
      const updates: any[] = Array.isArray(data) ? data : (data ? [data] : []);
      for (const upd of updates) {
        const msgId: string | undefined = upd?.key?.id;
        const status: string | undefined = upd?.update?.status;
        if (!msgId || !status) continue;
        const propertyInvoice = await storage.getInvoiceRentRequestByWhatsappMessageId(msgId);
        const tradeInvoice = propertyInvoice ? null : await storage.getJobInvoiceByWhatsappMessageId(msgId);
        const invoice = propertyInvoice ?? tradeInvoice;
        if (!invoice) continue;
        if ((status === "DELIVERY_ACK" || status === "READ") && !invoice.whatsappDeliveredAt) {
          if (tradeInvoice) await storage.updateJobInvoice(invoice.id, { whatsappDeliveredAt: new Date() });
          else await storage.updateInvoiceRentRequest(invoice.id, { whatsappDeliveredAt: new Date() });
        }
        if (tradeInvoice) {
          await storage.createJobEvent({ merchantId: invoice.merchantId, clientProfileId: invoice.clientProfileId, jobInvoiceId: invoice.id, eventType: "whatsapp_status", payload: { messageId: msgId, status } });
        } else {
          await storage.logTransactionEvent({ merchantId: invoice.merchantId, tenantProfileId: invoice.tenantProfileId, invoiceId: invoice.id, eventType: "WhatsApp_Status", payload: { messageId: msgId, status } });
        }
      }
    } catch (err) { console.error("[WA_WEBHOOK] Error:", err); }
  });

  // ── Merchant sector + timezone ────────────────────────────────────────────

  app.put("/api/merchants/:merchantId/sector", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      if (!checkMerchantOwnership(req, merchantId)) return res.status(403).json({ message: "Access denied" });
      const { sector } = z.object({ sector: z.enum(["retail", "propertyManagement"]) }).parse(req.body);
      const merchant = await storage.updateMerchant(merchantId, { sector } as any);
      res.json({ sector: (merchant as any)?.sector });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[PROP_SECTOR]", err); res.status(500).json({ message: "Failed to update sector" });
    }
  });

  // ── Overdue reminder settings (per merchant) ──────────────────────────────

  function reminderSettingsOf(m: any) {
    return {
      rentReminderEnabled:      m?.rentReminderEnabled ?? true,
      rentReminderDelayDays:    m?.rentReminderDelayDays ?? 3,
      rentReminderIntervalDays: m?.rentReminderIntervalDays ?? 3,
      rentReminderMaxCount:     m?.rentReminderMaxCount ?? 3,
    };
  }

  app.get("/api/property/reminder-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      res.json(reminderSettingsOf(merchant));
    } catch (err) { console.error("[PROP_REMINDER_GET]", err); res.status(500).json({ message: "Failed to fetch reminder settings" }); }
  });

  app.put("/api/property/reminder-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const data = updateRentReminderSettingsSchema.parse(req.body);
      const merchant = await storage.updateMerchant(merchantId, data as any);
      res.json(reminderSettingsOf(merchant));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[PROP_REMINDER_PUT]", err); res.status(500).json({ message: "Failed to update reminder settings" });
    }
  });

  // ═══════════════ TRADES ═══════════════

  // Trades job-invoice reminders have their own on/off switch (cadence reuses the
  // rent* day settings) so disabling rent reminders doesn't silently stop them.
  app.get("/api/trades/reminder-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      res.json({ tradeRemindersEnabled: merchant.tradeRemindersEnabled ?? true });
    } catch (err) { console.error("[TRADES_REMINDER_GET]", err); res.status(500).json({ message: "Failed to fetch reminder settings" }); }
  });

  app.put("/api/trades/reminder-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const data = updateTradeReminderSettingsSchema.parse(req.body);
      const merchant = await storage.updateMerchant(merchantId, data as any);
      res.json({ tradeRemindersEnabled: merchant?.tradeRemindersEnabled ?? true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[TRADES_REMINDER_PUT]", err); res.status(500).json({ message: "Failed to update reminder settings" });
    }
  });

  app.get("/api/trades/gst-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      res.json({
        gstRegistered: merchant.gstRegistered ?? false,
        tradeGstMode: merchant.tradeGstMode === "exclusive" ? "exclusive" : "inclusive",
      });
    } catch (err) {
      console.error("[TRADES_GST_GET]", err);
      res.status(500).json({ message: "Failed to fetch GST settings" });
    }
  });

  app.put("/api/trades/gst-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const data = updateTradeGstSettingsSchema.parse(req.body);
      const merchant = await storage.updateMerchant(merchantId, data as any);
      res.json({
        gstRegistered: merchant?.gstRegistered ?? false,
        tradeGstMode: merchant?.tradeGstMode === "exclusive" ? "exclusive" : "inclusive",
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      console.error("[TRADES_GST_PUT]", err);
      res.status(500).json({ message: "Failed to update GST settings" });
    }
  });

  app.get("/api/trades/clients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const rows = await storage.getClientProfilesByMerchant(merchantId);
      res.json(rows);
    } catch (err) { console.error("[TRADES_CLIENTS_GET]", err); res.status(500).json({ message: "Failed to fetch clients" }); }
  });
  app.post("/api/trades/clients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const parsed = createClientProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const row = await storage.createClientProfile({ ...parsed.data, merchantId });
      res.status(201).json(row);
    } catch (err) { console.error("[TRADES_CLIENTS_POST]", err); res.status(500).json({ message: "Failed to create client" }); }
  });
  app.get("/api/trades/clients/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const row = await storage.getClientProfile(req.params.id);
      if (!row || row.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) { console.error("[TRADES_CLIENTS_GET_ID]", err); res.status(500).json({ message: "Failed to fetch client" }); }
  });
  app.put("/api/trades/clients/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getClientProfile(req.params.id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      const parsed = updateClientProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      res.json(await storage.updateClientProfile(req.params.id, parsed.data));
    } catch (err) { console.error("[TRADES_CLIENTS_PUT]", err); res.status(500).json({ message: "Failed to update client" }); }
  });
  app.post("/api/trades/clients/:id/archive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getClientProfile(req.params.id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      res.json(await storage.archiveClientProfile(req.params.id));
    } catch (err) { console.error("[TRADES_CLIENTS_ARCHIVE]", err); res.status(500).json({ message: "Failed to archive client" }); }
  });
  app.post("/api/trades/clients/:id/unarchive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getClientProfile(req.params.id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      res.json(await storage.unarchiveClientProfile(req.params.id));
    } catch (err) { console.error("[TRADES_CLIENTS_UNARCHIVE]", err); res.status(500).json({ message: "Failed to restore client" }); }
  });
  // Promote a quick-invoice 'prospect' profile into a real (visible) client.
  app.post("/api/trades/clients/:id/promote", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getClientProfile(req.params.id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      if (existing.status !== "prospect") return res.status(400).json({ message: "Client is already saved" });
      res.json(await storage.updateClientProfile(req.params.id, { status: "active" }));
    } catch (err) { console.error("[TRADES_CLIENTS_PROMOTE]", err); res.status(500).json({ message: "Failed to save client" }); }
  });
  app.get("/api/trades/clients/:id/events", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getClientProfile(req.params.id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      res.json(await storage.getJobEventsByClient(req.params.id));
    } catch (err) { console.error("[TRADES_CLIENTS_EVENTS]", err); res.status(500).json({ message: "Failed to fetch client events" }); }
  });

  app.get("/api/trades/quotes", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      res.json(await storage.getQuotesByMerchant(merchantId, { status: req.query.status as string | undefined }));
    } catch (err) { console.error("[TRADES_QUOTES_GET]", err); res.status(500).json({ message: "Failed to fetch quotes" }); }
  });
  app.post("/api/trades/quotes", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      if (!(await requireBillingCard(merchantId, res))) return;
      const parsed = createQuoteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      if (parsed.data.depositEnabled && (!parsed.data.depositType || !parsed.data.depositValue || parsed.data.depositValue <= 0))
        return res.status(400).json({ message: "Deposit type and value are required" });
      if (parsed.data.depositEnabled && parsed.data.depositType === "percent" && (parsed.data.depositValue ?? 0) > 100)
        return res.status(400).json({ message: "Deposit percentage cannot exceed 100" });
      const client = await storage.getClientProfile(parsed.data.clientProfileId);
      if (!client || client.merchantId !== merchantId) return res.status(404).json({ message: "Client not found" });
      const merchant = await storage.getMerchant(merchantId);
      const lineItems = parsed.data.lineItems.map(item => ({
        ...item,
        lineTotalCents: Math.round(item.qty * item.unitPriceCents),
      }));
      const gstMode = merchant?.tradeGstMode === "exclusive" ? "exclusive" : "inclusive";
      const totals = computeQuoteTotals(lineItems, {
        gstRegistered: !!merchant?.gstRegistered,
        gstMode,
        depositEnabled: parsed.data.depositEnabled,
        depositType: parsed.data.depositType,
        depositValue: parsed.data.depositValue,
      });
      const token = generateInvoiceToken();
      const row = await storage.createQuote({
        merchantId,
        clientProfileId: parsed.data.clientProfileId,
        token, status: "sent",
        lineItems,
        subtotalCents: totals.subtotalCents,
        gstCents: totals.gstCents,
        gstMode: merchant?.gstRegistered ? gstMode : null,
        totalCents: totals.totalCents,
        depositEnabled: parsed.data.depositEnabled,
        depositType: parsed.data.depositType ?? null,
        depositValue: parsed.data.depositValue ?? null,
        depositCents: totals.depositCents,
        deliveryChannel: parsed.data.deliveryChannel,
        validUntil: parsed.data.validUntil ?? null,
        notes: parsed.data.notes ?? null,
        documentUrl: parsed.data.documentUrl ?? null,
        documentName: parsed.data.documentName ?? null,
        sentAt: new Date(),
      });
      await storage.createJobEvent({ merchantId, clientProfileId: client.id, quoteId: row.id, eventType: "quote_sent" });
      const delivery = await sendTradeQuote(row.id, getBaseUrl(req));
      // Record undelivered quotes so the list/timeline can distinguish them from
      // ones the client actually received (status stays "sent" so the manually
      // shared link still works).
      if (!delivery.sent) await storage.createJobEvent({ merchantId, clientProfileId: client.id, quoteId: row.id, eventType: "quote_dispatch_failed", payload: { reason: delivery.reason } });
      res.status(201).json({ ...row, delivered: delivery.sent, deliveryReason: delivery.reason });
    } catch (err) { console.error("[TRADES_QUOTES_POST]", err); res.status(500).json({ message: "Failed to create quote" }); }
  });
  app.get("/api/trades/quotes/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const row = await storage.getQuote(req.params.id);
      if (!row || row.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) { console.error("[TRADES_QUOTES_GET_ID]", err); res.status(500).json({ message: "Failed to fetch quote" }); }
  });

  async function streamQuotePdf(quote: any, req: any, res: any) {
    const [client, merchant] = await Promise.all([
      storage.getClientProfile(quote.clientProfileId),
      storage.getMerchant(quote.merchantId),
    ]);
    if (!client || !merchant) return res.status(404).json({ message: "Quote details unavailable" });
    const pdf = generateQuotePdf(quote, client, merchant, getBaseUrl(req));
    const safeName = String(merchant.businessName || merchant.name || "quote")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "quote";
    const ref = String(quote.token || quote.id || "quote").slice(0, 8).toUpperCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="quote-${safeName}-${ref}.pdf"`);
    res.send(pdf);
  }

  app.get("/api/trades/quotes/:id/pdf", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const quote = await storage.getQuote(req.params.id);
      if (!quote || quote.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      await streamQuotePdf(quote, req, res);
    } catch (err) {
      console.error("[TRADES_QUOTE_PDF]", err);
      res.status(500).json({ message: "Failed to generate quote PDF" });
    }
  });

  app.get("/api/trades/quotes/token/:token/pdf", async (req, res) => {
    try {
      const quote = await storage.getQuoteByToken(req.params.token);
      if (!quote) return res.status(404).json({ message: "Quote not found" });
      await streamQuotePdf(quote, req, res);
    } catch (err) {
      console.error("[TRADES_QUOTE_TOKEN_PDF]", err);
      res.status(500).json({ message: "Failed to generate quote PDF" });
    }
  });

  app.post("/api/trades/quotes/:id/resend", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const quote = await storage.getQuote(req.params.id);
      if (!quote || quote.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      if (!(await requireBillingCard(merchantId, res))) return;
      if (["accepted", "declined", "expired"].includes(quote.status)) return res.status(409).json({ message: "Quote can no longer be resent" });
      const delivery = await sendTradeQuote(quote.id, getBaseUrl(req));
      if (!delivery.sent) return res.status(502).json({ message: "Could not resend quote", reason: delivery.reason });
      res.json({ ...quote, delivered: true });
    } catch (err) { console.error("[TRADES_QUOTE_RESEND]", err); res.status(500).json({ message: "Failed to resend quote" }); }
  });

  // Public quote view. Keep the response deliberately narrow: customers need the
  // quote, client display details, and merchant trading name, not merchant secrets.
  app.get("/api/trades/quotes/token/:token", async (req, res) => {
    try {
      let quote = await storage.getQuoteByToken(req.params.token);
      if (!quote) return res.status(404).json({ message: "Quote not found" });
      // Did the customer open this quote BEFORE this request? A freshly-sent quote
      // has status "sent"; anything else means it was already viewed/responded. The
      // GET marks a "sent" quote "viewed" below, so the returned viewedAt is always
      // set — the client must use this pre-mutation flag to decide whether to show
      // the "view quote" step (first open) or skip straight to "confirm" (revisit).
      const previouslyViewed = quote.status !== "sent";
      if (!["accepted", "declined", "expired"].includes(quote.status) && quote.validUntil && new Date(quote.validUntil) < new Date()) {
        quote = await storage.updateQuote(quote.id, { status: "expired" }) ?? quote;
      } else if (quote.status === "sent") {
        quote = await storage.updateQuote(quote.id, { status: "viewed", viewedAt: new Date() }) ?? quote;
        await storage.createJobEvent({ merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id, eventType: "quote_viewed" });
      }
      const [client, merchant] = await Promise.all([
        storage.getClientProfile(quote.clientProfileId),
        storage.getMerchant(quote.merchantId),
      ]);
      if (!client || !merchant) return res.status(404).json({ message: "Quote details unavailable" });
      // Once accepted, surface the auto-issued deposit/full invoice so a customer
      // revisiting the quote link jumps straight to the payment step instead of
      // seeing the (now stale) accept UI. Latest non-voided wins.
      let invoice: { token: string; kind: string; amountCents: number; status: string } | null = null;
      if (quote.status === "accepted") {
        const invoices = await storage.getJobInvoicesByQuote(quote.id);
        const live = invoices.find((i: any) => i.status !== "voided");
        if (live) invoice = { token: live.token, kind: live.kind, amountCents: live.amountCents, status: live.status };
      }
      res.json({
        quote,
        client: { firstName: client.firstName, lastName: client.lastName, siteAddress: client.siteAddress },
        merchant: {
          name: merchant.name,
          businessName: merchant.businessName,
          gstRegistered: merchant.gstRegistered,
          tradeGstMode: merchant.tradeGstMode === "exclusive" ? "exclusive" : "inclusive",
        },
        invoice,
        previouslyViewed,
      });
    } catch (err) { console.error("[TRADES_QUOTES_TOKEN_GET]", err); res.status(500).json({ message: "Failed to fetch quote" }); }
  });
  // Customer-facing accept/decline (called from the public quote page, no auth — looked up by token)
  app.post("/api/trades/quotes/token/:token/respond", async (req, res) => {
    try {
      const parsed = acceptQuoteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const quote = await storage.getQuoteByToken(req.params.token);
      if (!quote) return res.status(404).json({ message: "Quote not found" });
      if (quote.status === "accepted" || quote.status === "declined")
        return res.status(409).json({ message: "Already responded" });
      if (quote.status === "expired" || (quote.validUntil && new Date(quote.validUntil) < new Date())) {
        if (quote.status !== "expired") await storage.updateQuote(quote.id, { status: "expired" });
        return res.status(410).json({ message: "Quote has expired" });
      }
      if (!parsed.data.accept) {
        const declined = await storage.updateQuote(quote.id, { status: "declined", declinedAt: new Date() });
        await storage.createJobEvent({ merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id, eventType: "quote_declined" });
        return res.json({ quote: declined, depositInvoice: null });
      }
      if (!(await requireBillingCard(quote.merchantId, res))) return;
      const accepted = await storage.updateQuote(quote.id, { status: "accepted", acceptedAt: new Date() });
      await storage.createJobEvent({ merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id, eventType: "quote_accepted" });
      // Deposit enabled → auto-issue the deposit invoice so the checkout shows it immediately.
      let depositInvoice = null;
      const due = new Date(); due.setDate(due.getDate() + 7);
      if (quote.depositEnabled && quote.depositCents && quote.depositCents > 0) {
        depositInvoice = await storage.createJobInvoice({
          merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id,
          kind: "deposit", amountCents: quote.depositCents, token: generateInvoiceToken(),
          deliveryChannel: quote.deliveryChannel, status: "pending_dispatch", dueAt: due,
        });
      } else {
        // No deposit → issue the full balance straight away.
        depositInvoice = await storage.createJobInvoice({
          merchantId: quote.merchantId, clientProfileId: quote.clientProfileId, quoteId: quote.id,
          kind: "full", amountCents: quote.totalCents, token: generateInvoiceToken(),
          deliveryChannel: quote.deliveryChannel, status: "pending_dispatch", dueAt: due,
        });
      }
      const delivery = depositInvoice ? await resendTradeInvoice(depositInvoice.id, getBaseUrl(req)) : null;
      const paymentUrl = depositInvoice ? getBaseUrl(req) + "/r/" + depositInvoice.token : null;
      res.json({ quote: accepted, depositInvoice: delivery?.invoice ?? depositInvoice, paymentUrl, delivered: delivery?.sent ?? false });
    } catch (err) { console.error("[TRADES_QUOTES_TOKEN_RESPOND]", err); res.status(500).json({ message: "Failed to process quote response" }); }
  });

  app.get("/api/trades/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      res.json(await storage.getJobInvoicesByMerchant(merchantId, {
        status: req.query.status as string | undefined,
        clientProfileId: req.query.clientProfileId as string | undefined,
      }));
    } catch (err) { console.error("[TRADES_INVOICES_GET]", err); res.status(500).json({ message: "Failed to fetch invoices" }); }
  });
  app.post("/api/trades/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      if (!(await requireBillingCard(merchantId, res))) return;
      const parsed = createJobInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      let client: any;
      if (parsed.data.recipient) {
        // Quick invoice: no pre-existing client. Create a HIDDEN 'prospect'
        // profile carrying the typed contact details so the NOT NULL FK and
        // all downstream systems (dispatch, checkout, events) work unchanged.
        // The merchant can promote it to a real client from the success screen.
        const nm = parsed.data.recipient.name.trim();
        const spaceIdx = nm.indexOf(" ");
        client = await storage.createClientProfile({
          merchantId,
          firstName: spaceIdx > 0 ? nm.slice(0, spaceIdx) : nm,
          lastName: spaceIdx > 0 ? nm.slice(spaceIdx + 1) : "",
          email: parsed.data.recipient.email ?? null,
          phone: parsed.data.recipient.phone ?? null,
          siteAddress: "",
          preferredChannel: parsed.data.recipient.channel,
          status: "prospect",
        });
      } else {
        client = await storage.getClientProfile(parsed.data.clientProfileId!);
        if (!client || client.merchantId !== merchantId) return res.status(404).json({ message: "Client not found" });
      }
      if (parsed.data.quoteId) {
        const linkedQuote = await storage.getQuote(parsed.data.quoteId);
        if (!linkedQuote || linkedQuote.merchantId !== merchantId) return res.status(404).json({ message: "Quote not found" });
      }
      const row = await storage.createJobInvoice({
        merchantId, clientProfileId: client.id,
        quoteId: parsed.data.quoteId ?? null, kind: parsed.data.kind,
        amountCents: parsed.data.amountCents, token: generateInvoiceToken(),
        deliveryChannel: parsed.data.deliveryChannel, jobDetails: parsed.data.jobDetails ?? null,
        status: "pending_dispatch", dueAt: parsed.data.dueAt,
        scheduledSendAt: parsed.data.scheduledSendAt ?? null,
        splitEnabled: !!parsed.data.splitEnabled,
        documentUrl: parsed.data.documentUrl ?? null, documentName: parsed.data.documentName ?? null,
      });
      await storage.createJobEvent({ merchantId, clientProfileId: client.id, jobInvoiceId: row.id, eventType: "invoice_sent" });
      const shouldSendNow = !row.scheduledSendAt || new Date(row.scheduledSendAt) <= new Date();
      const delivery = shouldSendNow ? await resendTradeInvoice(row.id, getBaseUrl(req)) : { sent: false, reason: "scheduled" };
      res.status(201).json({ ...(("invoice" in delivery && delivery.invoice) || row), delivered: delivery.sent, deliveryReason: delivery.reason });
    } catch (err) { console.error("[TRADES_INVOICES_POST]", err); res.status(500).json({ message: "Failed to create invoice" }); }
  });
  app.post("/api/trades/invoices/:id/resend", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const invoice = await storage.getJobInvoice(req.params.id);
      if (!invoice || invoice.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      if (!(await requireBillingCard(merchantId, res))) return;
      const delivery = await resendTradeInvoice(invoice.id, getBaseUrl(req));
      if (!delivery.sent) return res.status(502).json({ message: "Could not resend invoice", reason: delivery.reason });
      res.json(delivery.invoice);
    } catch (err) { console.error("[TRADES_INVOICE_RESEND]", err); res.status(500).json({ message: "Failed to resend invoice" }); }
  });

  app.post("/api/trades/invoices/:id/send-balance", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const { splitEnabled } = (req.body ?? {}) as { splitEnabled?: boolean };
      // Issue the remaining balance for a deposit-paid job.
      const dep = await storage.getJobInvoice(req.params.id);
      if (!dep || dep.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      if (!(await requireBillingCard(merchantId, res))) return;
      if (dep.kind !== "deposit") return res.status(400).json({ message: "Balance can only be sent for a deposit invoice" });
      if (!["paid", "paid_external", "deposit_paid"].includes(dep.status))
        return res.status(409).json({ message: "Deposit must be paid before sending the balance" });
      if (!dep.quoteId) return res.status(400).json({ message: "This deposit is not linked to a quote, so a balance can't be calculated" });
      const quote = await storage.getQuote(dep.quoteId);
      if (!quote) return res.status(404).json({ message: "Linked quote not found" });
      const existingInvoices = await storage.getJobInvoicesByMerchant(merchantId, { clientProfileId: dep.clientProfileId });
      const onQuote = existingInvoices.filter((invoice: any) => invoice.quoteId === dep.quoteId && invoice.status !== "voided");
      if (onQuote.some((invoice: any) => invoice.kind === "balance"))
        return res.status(409).json({ message: "Balance invoice already exists" });
      // Subtract everything already billed against this quote (the deposit plus any
      // other non-voided invoices), not just this one deposit, so a balance can
      // never double-bill amounts already covered.
      const alreadyBilled = onQuote.reduce((sum: number, invoice: any) => sum + (invoice.amountCents || 0), 0);
      const balanceCents = Math.max(quote.totalCents - alreadyBilled, 0);
      if (balanceCents <= 0) return res.status(400).json({ message: "No balance remaining" });
      const due = new Date(); due.setDate(due.getDate() + 7);
      const bal = await storage.createJobInvoice({
        merchantId: dep.merchantId, clientProfileId: dep.clientProfileId, quoteId: dep.quoteId,
        kind: "balance", amountCents: balanceCents, token: generateInvoiceToken(),
        deliveryChannel: dep.deliveryChannel, status: "pending_dispatch", dueAt: due,
        splitEnabled: !!splitEnabled,
      });
      await storage.createJobEvent({ merchantId: dep.merchantId, clientProfileId: dep.clientProfileId, jobInvoiceId: bal.id, eventType: "balance_sent" });
      const delivery = await resendTradeInvoice(bal.id, getBaseUrl(req));
      res.status(201).json({ ...(delivery.invoice ?? bal), delivered: delivery.sent, deliveryReason: delivery.reason });
    } catch (err) { console.error("[TRADES_INVOICES_SEND_BALANCE]", err); res.status(500).json({ message: "Failed to send balance invoice" }); }
  });
  app.post("/api/trades/invoices/:id/mark-paid-external", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const inv = await storage.getJobInvoice(req.params.id);
      if (!inv || inv.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      const parsed = markJobPaidExternalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const row = await storage.updateJobInvoice(req.params.id, {
        status: "paid_external", paidAt: new Date(),
        externalPaymentReference: parsed.data.externalPaymentReference ?? null,
      });
      await storage.createJobEvent({ merchantId: inv.merchantId, clientProfileId: inv.clientProfileId, jobInvoiceId: inv.id, eventType: "paid_external" });
      await sendTradePaymentInvoice(row);
      res.json(row);
    } catch (err) { console.error("[TRADES_INVOICES_MARK_PAID]", err); res.status(500).json({ message: "Failed to mark invoice paid" }); }
  });
  app.post("/api/trades/invoices/:id/complete", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const inv = await storage.getJobInvoice(req.params.id);
      if (!inv || inv.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      // A paid deposit is only part-payment — the balance must still be collected,
      // so don't let a deposit invoice close out the job.
      if (inv.kind === "deposit")
        return res.status(409).json({ message: "Send and collect the balance before completing the job" });
      if (!["paid", "paid_external"].includes(inv.status))
        return res.status(409).json({ message: "Invoice must be paid before completing the job" });
      const row = await storage.updateJobInvoice(req.params.id, { completedAt: new Date() });
      await storage.createJobEvent({ merchantId: inv.merchantId, clientProfileId: inv.clientProfileId, jobInvoiceId: inv.id, eventType: "job_completed" });
      res.json(row);
    } catch (err) { console.error("[TRADES_INVOICES_COMPLETE]", err); res.status(500).json({ message: "Failed to complete invoice" }); }
  });
  app.post("/api/trades/invoices/:id/void", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const inv = await storage.getJobInvoice(req.params.id);
      if (!inv || inv.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      res.json(await storage.updateJobInvoice(req.params.id, { status: "voided", voidedAt: new Date() }));
    } catch (err) { console.error("[TRADES_INVOICES_VOID]", err); res.status(500).json({ message: "Failed to void invoice" }); }
  });

  app.get("/api/trades/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      res.json(await storage.getJobSchedulesByMerchant(merchantId));
    } catch (err) { console.error("[TRADES_SCHEDULES_GET]", err); res.status(500).json({ message: "Failed to fetch schedules" }); }
  });
  app.post("/api/trades/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      if (!(await requireBillingCard(merchantId, res))) return;
      const parsed = createJobScheduleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      if (parsed.data.endDate && parsed.data.endDate < parsed.data.startDate)
        return res.status(400).json({ message: "End date cannot be before start date" });
      const client = await storage.getClientProfile(parsed.data.clientProfileId);
      if (!client || client.merchantId !== merchantId) return res.status(404).json({ message: "Client not found" });
      const row = await storage.createJobSchedule({
        ...parsed.data, merchantId, nextRunDate: parsed.data.startDate,
      });
      await storage.createJobEvent({ merchantId, clientProfileId: row.clientProfileId, scheduleId: row.id, eventType: "schedule_created", payload: { amountCents: row.amountCents, frequency: row.frequency } });
      res.status(201).json(row);
    } catch (err) { console.error("[TRADES_SCHEDULES_POST]", err); res.status(500).json({ message: "Failed to create schedule" }); }
  });
  app.put("/api/trades/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getJobSchedule(req.params.id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      const parsed = updateJobScheduleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const row = await storage.updateJobSchedule(req.params.id, parsed.data);
      await storage.createJobEvent({ merchantId, clientProfileId: existing.clientProfileId, scheduleId: existing.id, eventType: parsed.data.status === "paused" ? "schedule_paused" : parsed.data.status === "active" ? "schedule_resumed" : "schedule_updated", payload: parsed.data });
      res.json(row);
    } catch (err) { console.error("[TRADES_SCHEDULES_PUT]", err); res.status(500).json({ message: "Failed to update schedule" }); }
  });
  app.delete("/api/trades/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(401).json({ message: "Authentication required" });
      const existing = await storage.getJobSchedule(req.params.id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Not found" });
      const row = await storage.terminateJobSchedule(req.params.id);
      await storage.createJobEvent({ merchantId, clientProfileId: existing.clientProfileId, scheduleId: existing.id, eventType: "schedule_terminated" });
      res.json(row);
    } catch (err) { console.error("[TRADES_SCHEDULES_DELETE]", err); res.status(500).json({ message: "Failed to delete schedule" }); }
  });

  // ── Cron endpoint ─────────────────────────────────────────────────────────

  app.post("/api/internal/cron", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return res.status(503).json({ message: "Cron not configured" });
    // Constant-time comparison to avoid leaking the secret via timing.
    const provided = req.headers["x-cron-secret"];
    const providedBuf = Buffer.from(Array.isArray(provided) ? "" : (provided ?? ""));
    const secretBuf = Buffer.from(cronSecret);
    if (providedBuf.length !== secretBuf.length || !crypto.timingSafeEqual(providedBuf, secretBuf)) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Serialize cron runs. Overlapping invocations (scheduler double-fire, or a run
    // that exceeds the schedule interval) would otherwise double-generate invoices
    // and double-dispatch tenant emails, since generate/dispatch are fetch-then-write
    // and advance nextRunDate non-atomically.
    if (cronRunning) return res.status(409).json({ message: "A cron run is already in progress" });
    cronRunning = true;
    try {
      const { runGeneratePass, runDispatchPass, runOverduePass, runReminderPass } = await import("./property-cron");
      const { runTradesGeneratePass } = await import("./trades-cron");
      const { runTradesDispatchPass, runTradesOverduePass, runTradesReminderPass } = await import("./trades-delivery");
      const now = new Date();
      const baseUrl = getBaseUrl(req);
      // Sequential: generate must complete before dispatch (dispatch reads the
      // invoices generate creates), and overdue must precede the reminder pass.
      const generate  = await runGeneratePass(now);
      const tradesGenerate = await runTradesGeneratePass(now);
      const dispatch  = await runDispatchPass(baseUrl);
      const tradesDispatch = await runTradesDispatchPass(baseUrl);
      const overdue   = await runOverduePass(now);
      const tradesOverdue = await runTradesOverduePass(now);
      const reminders = await runReminderPass(baseUrl, now);
      const tradesReminders = await runTradesReminderPass(baseUrl, now);
      console.log(`[CRON] generate=${JSON.stringify(generate)} tradesGenerate=${JSON.stringify(tradesGenerate)} dispatch=${JSON.stringify(dispatch)} overdue=${JSON.stringify(overdue)} reminders=${JSON.stringify(reminders)}`);
      res.json({ ok: true, ranAt: now.toISOString(), generate, tradesGenerate, dispatch, tradesDispatch, overdue, tradesOverdue, reminders, tradesReminders });
    } catch (err) { console.error("[CRON]", err); res.status(500).json({ message: "Cron run failed" }); }
    finally { cronRunning = false; }
  });

  const httpServer = createServer(app);
  return httpServer;
}
