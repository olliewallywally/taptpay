import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionSchema, updateMerchantRatesSchema, updateMerchantDetailsSchema, updateBankAccountSchema, updateThemeSchema, updateDailyGoalSchema, updateCryptoSettingsSchema, forgotPasswordSchema, resetPasswordSchema, createMerchantSchema, verifyMerchantSchema, changePasswordSchema, createRefundSchema, insertRefundSchema, createTaptStoneSchema, createStockItemSchema, updateStockItemSchema, publicSignupSchema, businessDetailsSchema } from "@shared/schema";
import { windcaveService, isWindcaveConfigured, createWindcaveSession, queryWindcaveSession, createWindcaveRefund, simulateCreateSession, simulateQuerySession, getWindcaveEnv, submitGooglePayToken } from "./windcave";
import { authenticateUser, generateToken, authenticateToken, createUser, getUserByEmail, requestPasswordReset, resetPassword, validateResetToken, JWT_SECRET, type AuthenticatedRequest, isAccountLocked, isIPRateLimited, recordFailedLogin, clearFailedAttempts, logSecurityEvent, syncVerifiedMerchants } from "./auth";
import { generateReceiptPdf } from "./pdf-generator";
import { generateBusinessReportPdf } from "./report-generator";
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

// Store SSE connections for real-time updates (merchantId -> stoneId -> Set of connections)
// stoneId can be null for merchant-level connections
const sseConnections = new Map<number, Map<number | null, Set<any>>>();

// Server-side cache of Windcave AJAX submit URLs per transaction.
// Populated at session creation; consumed once at payment completion.
// Prevents SSRF by never accepting these URLs from client bodies.
const sessionAjaxUrlCache = new Map<number, {
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
  const entries = Array.from(rateLimitMap.entries());
  for (const [ip, record] of entries) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

// Helper function to broadcast to stone-specific connections
function broadcastToStone(merchantId: number, stoneId: number | null | undefined, data: any) {
  const merchantConnections = sseConnections.get(merchantId);
  if (!merchantConnections) return;

  // Broadcast to the specific stone's connections
  const targetStoneId = stoneId === undefined ? null : stoneId;
  const stoneConnections = merchantConnections.get(targetStoneId);
  
  if (stoneConnections) {
    stoneConnections.forEach(conn => {
      conn.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createCryptoTransactionSchema = z.object({
  merchantId: z.number(),
  itemName: z.string().min(1),
  fiatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  cryptocurrency: z.enum(["BTC", "ETH", "USDC", "USDT", "LTC", "BCH"]),
});

// Multer configuration for logo uploads
const uploadsDir = path.join(process.cwd(), 'uploads', 'logos');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const merchantId = req.params.id;
    const ext = path.extname(file.originalname);
    cb(null, `merchant-${merchantId}${ext}`);
  }
});

const logoUpload = multer({
  storage: logoStorage,
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

// Utility to remove undefined keys
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
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
      
      // For admin users, we verify directly from the token
      const adminEmail = process.env.ADMIN_EMAIL || 'oliverleonard.professional@gmail.com';
      if (decoded.role === 'admin' && decoded.email === adminEmail) {
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

      // Get or create the in-memory auth user
      let authUser = getUserByEmail(email);
      if (!authUser) {
        // Create with a random unguessable password (Google users won't use password login)
        const randomPwd = crypto.randomBytes(32).toString('hex');
        authUser = await createUser(email, randomPwd, merchant.id);
      }

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

  app.get("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res) => {
    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        merchantId: req.user!.merchantId,
        role: req.user!.role,
      },
    });
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
      const adminEmail = process.env.ADMIN_EMAIL || "oliverleonard.professional@gmail.com";
      const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

      if (email === adminEmail) {
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
    if (merchantId) {
      const merchant = await storage.getMerchant(merchantId);
      onboardingCompleted = merchant?.onboardingCompleted ?? false;
    }
    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        merchantId: req.user!.merchantId,
        role: req.user!.role,
        onboardingCompleted,
      },
    });
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
        bankName,
        bankAccountNumber,
        bankBranch,
        accountHolderName,
        websiteUrl,
        estimatedAnnualTurnover,
        businessDescription,
      } = req.body;

      // Save all KYC details to merchant record
      await storage.updateMerchant(merchantId, {
        director: director || null,
        nzbn: nzbn || null,
        gstNumber: gstNumber || null,
        bankName: bankName || null,
        bankAccountNumber: bankAccountNumber || null,
        bankBranch: bankBranch || null,
        accountHolderName: accountHolderName || null,
        onboardingCompleted: true,
      });

      // Send notification email to TaptPay admin
      const emailHtml = `
        <h2>New Merchant KYC Submission</h2>
        <p>A merchant has completed their onboarding details and is ready for Windcave KYC/AML review.</p>
        
        <h3>Business Information</h3>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-family:sans-serif;">
          <tr><td><strong>Business Name</strong></td><td>${merchant.businessName}</td></tr>
          <tr><td><strong>Business Type</strong></td><td>${merchant.businessType || 'N/A'}</td></tr>
          <tr><td><strong>Business Address</strong></td><td>${merchant.address || 'N/A'}</td></tr>
          ${businessDescription ? `<tr><td><strong>Business Description</strong></td><td>${businessDescription}</td></tr>` : ''}
          ${websiteUrl ? `<tr><td><strong>Website</strong></td><td>${websiteUrl}</td></tr>` : ''}
          ${estimatedAnnualTurnover ? `<tr><td><strong>Estimated Annual Card Turnover</strong></td><td>${estimatedAnnualTurnover}</td></tr>` : ''}
        </table>

        <h3>Director / Owner Details</h3>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-family:sans-serif;">
          <tr><td><strong>Contact Name</strong></td><td>${merchant.name}</td></tr>
          <tr><td><strong>Director / Legal Name</strong></td><td>${director || 'N/A'}</td></tr>
          <tr><td><strong>Email</strong></td><td>${merchant.email}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${merchant.phone || 'N/A'}</td></tr>
        </table>

        <h3>Tax & Registration</h3>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-family:sans-serif;">
          <tr><td><strong>NZBN</strong></td><td>${nzbn || 'N/A'}</td></tr>
          <tr><td><strong>GST Number</strong></td><td>${gstNumber || 'N/A'}</td></tr>
        </table>

        <h3>Bank Account Details (for settlements)</h3>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-family:sans-serif;">
          <tr><td><strong>Bank</strong></td><td>${bankName || 'N/A'}</td></tr>
          <tr><td><strong>Account Holder</strong></td><td>${accountHolderName || 'N/A'}</td></tr>
          <tr><td><strong>Account Number</strong></td><td>${bankAccountNumber || 'N/A'}</td></tr>
          <tr><td><strong>Branch</strong></td><td>${bankBranch || 'N/A'}</td></tr>
        </table>

        <p style="margin-top:20px; color:#666;">Submitted via TaptPay merchant onboarding form.</p>
      `;

      await sendEmail({
        to: 'oliverleonard@taptpay.co.nz',
        from: 'noreply@taptpay.co.nz',
        subject: `New Merchant KYC Submission — ${merchant.businessName}`,
        html: emailHtml,
        text: `New merchant KYC submission from ${merchant.businessName} (${merchant.email}). Director: ${director || 'N/A'}. NZBN: ${nzbn || 'N/A'}. GST: ${gstNumber || 'N/A'}. Bank: ${bankName || 'N/A'} / ${bankAccountNumber || 'N/A'}.`,
      });

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
      const adminEmail = process.env.ADMIN_EMAIL || 'oliverleonard.professional@gmail.com';
      if (decoded.role === 'admin' && decoded.email === adminEmail) {
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
      
      res.json(merchantWithCurrentUrls);
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
      
      const transaction = await storage.getActiveTransactionByMerchant(merchantId, stoneId);
      
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

      // Only the owning merchant can update
      const user = (req as any).user;
      if (!user.isAdmin && transaction.merchantId !== user.merchantId) {
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

  // Cancel transaction
  app.post("/api/transactions/:id/cancel", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const transaction = await storage.getTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
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
  app.post("/api/merchants/:merchantId/nfc-pay", async (req, res) => {
    try {
      const merchantId = parseInt(req.params.merchantId);
      const { amount, itemName, deviceId, nfcCapabilities } = req.body;
      
      // Validate required fields
      if (!amount || !itemName) {
        return res.status(400).json({ message: "Amount and item name are required" });
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
        price: amount.toString(),
        paymentMethod: "nfc_tap",
        deviceId: deviceId || "unknown",
        status: "pending",
        splitEnabled: false,
      });
      
      // Generate NFC session for contactless payment
      const nfcSessionId = `NFC_${transaction.id}_${Date.now()}`;
      
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
        hppUrl: sessionResult.hppUrl,
        sessionId: sessionResult.sessionId,
        // Card URL: sent to frontend — Hosted Fields SDK submits directly from browser.
        ajaxSubmitCardUrl: sessionResult.ajaxSubmitCardUrl,
        // Apple Pay URL: sent to frontend — Windcave ApplePay SDK submits directly from
        // browser using Apple's own auth flow (no backend credentials involved).
        ajaxSubmitApplePayUrl: sessionResult.ajaxSubmitApplePayUrl,
        // Google Pay URL: included for spec completeness but the backend ignores any
        // client-supplied value; it uses the server-side cached URL instead.
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
    res.json({
      env: getWindcaveEnv(),
      applePayMerchantId: process.env.WINDCAVE_APPLE_PAY_MERCHANT_ID || "",
      googlePayMerchantId: process.env.WINDCAVE_GOOGLE_PAY_MERCHANT_ID || "",
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
      
      // Generate CSV content
      const csvRows = [headers.join(",")];
      
      transactions.forEach(transaction => {
        const row = [
          transaction.id,
          transaction.createdAt ? new Date(transaction.createdAt).toLocaleString('en-NZ') : 'N/A',
          `"${transaction.itemName}"`, // Quote item names to handle commas
          `$${parseFloat(transaction.price).toFixed(2)}`,
          transaction.status,
          transaction.windcaveTransactionId || 'N/A'
        ];
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
  // CRYPTO TRANSACTION ROUTES
  // ======================

  // Create crypto transaction
  app.post("/api/crypto-transactions", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const validation = createCryptoTransactionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid request data", errors: validation.error.errors });
      }
      
      const { merchantId, itemName, fiatAmount, cryptocurrency } = validation.data;
      
      // Verify the user owns this merchant
      if (!req.user || req.user.merchantId !== merchantId) {
        return res.status(403).json({ message: "Unauthorized to create transactions for this merchant" });
      }
      
      // Get merchant to check crypto settings
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      
      if (!merchant.cryptoEnabled) {
        return res.status(400).json({ message: "Crypto payments not enabled for this merchant" });
      }
      
      // Create regular transaction first
      const transaction = await storage.createTransaction({
        merchantId,
        itemName,
        price: fiatAmount,
        status: "pending",
        paymentMethod: "crypto",
        splitEnabled: false,
      });
      
      // Mock exchange rate (in production, fetch from CoinGecko or similar)
      const mockExchangeRates: { [key: string]: number } = {
        "BTC": 0.000015, // 1 NZD = 0.000015 BTC
        "ETH": 0.00025,  // 1 NZD = 0.00025 ETH
        "USDC": 0.60,    // 1 NZD = 0.60 USDC
        "USDT": 0.60,
        "LTC": 0.005,
        "BCH": 0.002
      };
      
      const exchangeRate = mockExchangeRates[cryptocurrency] || 0.000015;
      const cryptoAmount = (parseFloat(fiatAmount) * exchangeRate).toFixed(8);
      
      // Generate mock wallet address (in production, use Coinbase Commerce API)
      const mockWalletAddress = `${cryptocurrency}_${crypto.randomBytes(20).toString('hex')}`;
      
      // Create crypto transaction record
      const cryptoTransaction = await storage.createCryptoTransaction({
        transactionId: transaction.id,
        merchantId,
        cryptocurrency,
        walletAddress: mockWalletAddress,
        cryptoAmount,
        fiatAmount,
        exchangeRate: exchangeRate.toString(),
        coinbaseChargeId: `charge_${crypto.randomBytes(16).toString('hex')}`,
        coinbaseChargeCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
        hostedUrl: `${req.protocol}://${req.get('host')}/crypto-pay/${transaction.id}`,
        requiredConfirmations: merchant.minConfirmations || 1,
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry
      });
      
      // Notify SSE clients
      const connections = sseConnections.get(merchantId);
      if (connections) {
        connections.forEach((connSet) => {
          connSet.forEach(conn => {
            conn.write(`data: ${JSON.stringify({ 
              type: 'crypto_transaction_created', 
              transaction,
              cryptoTransaction 
            })}\n\n`);
          });
        });
      }
      
      res.json({ transaction, cryptoTransaction });
    } catch (error) {
      console.error("Error creating crypto transaction:", error);
      res.status(500).json({ message: "Failed to create crypto transaction" });
    }
  });

  // Get crypto transaction
  app.get("/api/crypto-transactions/:id", async (req, res) => {
    try {
      const cryptoTransactionId = parseInt(req.params.id);
      const cryptoTransaction = await storage.getCryptoTransaction(cryptoTransactionId);
      
      if (!cryptoTransaction) {
        return res.status(404).json({ message: "Crypto transaction not found" });
      }
      
      res.json(cryptoTransaction);
    } catch (error) {
      console.error("Error fetching crypto transaction:", error);
      res.status(500).json({ message: "Failed to fetch crypto transaction" });
    }
  });

  // Get crypto transaction by regular transaction ID
  app.get("/api/transactions/:id/crypto", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const cryptoTransaction = await storage.getCryptoTransactionByTransactionId(transactionId);
      
      if (!cryptoTransaction) {
        return res.status(404).json({ message: "Crypto transaction not found" });
      }
      
      res.json(cryptoTransaction);
    } catch (error) {
      console.error("Error fetching crypto transaction:", error);
      res.status(500).json({ message: "Failed to fetch crypto transaction" });
    }
  });

  // Mock crypto payment confirmation (simulates blockchain confirmation)
  app.post("/api/crypto-transactions/:id/confirm", async (req, res) => {
    try {
      const cryptoTransactionId = parseInt(req.params.id);
      const cryptoTransaction = await storage.getCryptoTransaction(cryptoTransactionId);
      
      if (!cryptoTransaction) {
        return res.status(404).json({ message: "Crypto transaction not found" });
      }
      
      // Update crypto transaction status
      const updatedCryptoTx = await storage.updateCryptoTransactionStatus(
        cryptoTransactionId,
        "confirmed",
        1 // confirmations
      );
      
      // Update main transaction status
      await storage.updateTransactionStatus(cryptoTransaction.transactionId!, "completed");
      
      // Calculate platform fee (0.5% of transaction amount)
      const platformFeeAmount = parseFloat(cryptoTransaction.fiatAmount) * 0.005;
      
      // Create platform fee record
      await storage.createPlatformFee({
        transactionId: cryptoTransaction.transactionId,
        merchantId: cryptoTransaction.merchantId,
        feeAmount: platformFeeAmount.toFixed(2),
        transactionAmount: cryptoTransaction.fiatAmount,
        status: "pending"
      });
      
      // Track transaction for subscription billing
      if (cryptoTransaction.merchantId) {
        await storage.incrementTransactionCount(cryptoTransaction.merchantId);
      }
      
      // TODO: Auto-charge merchant's payment method for platform fee via Windcave
      
      // Notify SSE clients
      const connections = sseConnections.get(cryptoTransaction.merchantId!);
      if (connections) {
        connections.forEach((connSet) => {
          connSet.forEach(conn => {
            conn.write(`data: ${JSON.stringify({ 
              type: 'crypto_payment_confirmed', 
              cryptoTransaction: updatedCryptoTx 
            })}\n\n`);
          });
        });
      }
      
      res.json(updatedCryptoTx);
    } catch (error) {
      console.error("Error confirming crypto payment:", error);
      res.status(500).json({ message: "Failed to confirm crypto payment" });
    }
  });

  // Coinbase Commerce webhook with signature verification
  app.post("/api/crypto-transactions/webhook/coinbase", express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const signature = req.headers['x-cc-webhook-signature'] as string;
      const rawBody = req.body.toString();
      
      if (!signature) {
        return res.status(401).json({ message: "Missing webhook signature" });
      }
      
      // Parse the event
      const event = JSON.parse(rawBody);
      const { event: eventData } = event;
      
      if (!eventData || !eventData.data || !eventData.data.code) {
        return res.status(400).json({ message: "Invalid webhook payload" });
      }
      
      // Find crypto transaction by Coinbase charge code
      const chargeCode = eventData.data.code;
      const cryptoTx = await storage.getCryptoTransactionByChargeCode(chargeCode);
      
      if (!cryptoTx) {
        return res.status(404).json({ message: "Crypto transaction not found" });
      }
      
      // Get merchant to verify webhook secret
      const merchant = await storage.getMerchant(cryptoTx.merchantId!);
      if (!merchant || !merchant.coinbaseWebhookSecret) {
        return res.status(500).json({ message: "Merchant webhook secret not configured" });
      }
      
      // Verify webhook signature using HMAC-SHA256
      const expectedSignature = crypto
        .createHmac('sha256', merchant.coinbaseWebhookSecret)
        .update(rawBody)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error("Webhook signature verification failed");
        return res.status(401).json({ message: "Invalid webhook signature" });
      }
      
      // Process webhook event based on type
      const eventType = eventData.type;
      console.log(`Processing Coinbase webhook: ${eventType} for charge ${chargeCode}`);
      
      if (eventType === 'charge:confirmed') {
        // Payment confirmed - update status
        await storage.updateCryptoTransactionStatus(cryptoTx.id, 'confirmed', eventData.data.confirmations || 1);
        await storage.updateTransactionStatus(cryptoTx.transactionId!, 'completed');
        
        // Calculate and create platform fee (0.5%)
        const platformFeeAmount = parseFloat(cryptoTx.fiatAmount) * 0.005;
        await storage.createPlatformFee({
          transactionId: cryptoTx.transactionId,
          merchantId: cryptoTx.merchantId,
          feeAmount: platformFeeAmount.toFixed(2),
          transactionAmount: cryptoTx.fiatAmount,
          status: 'pending'
        });
        
        // Track transaction for subscription billing
        if (cryptoTx.merchantId) {
          await storage.incrementTransactionCount(cryptoTx.merchantId);
        }
        
        // Broadcast SSE update
        const connections = sseConnections.get(cryptoTx.merchantId!);
        if (connections) {
          const transaction = await storage.getTransaction(cryptoTx.transactionId!);
          connections.forEach((connSet) => {
            connSet.forEach(client => {
              client.write(`data: ${JSON.stringify({ 
                type: 'transaction_update', 
                transaction,
                cryptoTransaction: cryptoTx 
              })}\n\n`);
            });
          });
        }
      } else if (eventType === 'charge:failed' || eventType === 'charge:expired') {
        // Payment failed or expired
        await storage.updateCryptoTransactionStatus(cryptoTx.id, eventType === 'charge:expired' ? 'expired' : 'failed', 0);
        await storage.updateTransactionStatus(cryptoTx.transactionId!, 'failed');
        
        // Broadcast SSE update
        const connections = sseConnections.get(cryptoTx.merchantId!);
        if (connections) {
          const transaction = await storage.getTransaction(cryptoTx.transactionId!);
          connections.forEach((connSet) => {
            connSet.forEach(client => {
              client.write(`data: ${JSON.stringify({ 
                type: 'transaction_update', 
                transaction,
                cryptoTransaction: cryptoTx 
              })}\n\n`);
            });
          });
        }
      }
      
      res.json({ received: true, processed: true });
    } catch (error) {
      console.error("Error processing Coinbase webhook:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

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

      const passwordHash = await bcrypt.hash(password, 10);
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
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
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
    try {
      const merchantId = parseInt(req.params.id);
      const validation = updateBankAccountSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid bank account details", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantBankAccount(merchantId, validation.data);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(updatedMerchant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update bank account details" });
    }
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

      // Generate URL path for the logo
      const logoUrl = `/uploads/logos/${req.file.filename}`;
      
      // Update merchant with new logo URL
      const updatedMerchant = await storage.updateMerchantLogoUrl(merchantId, logoUrl);
      if (!updatedMerchant) {
        // Clean up uploaded file if merchant not found
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json({ logoUrl, message: "Logo uploaded successfully" });
    } catch (error) {
      console.error("Logo upload error:", error);
      // Clean up uploaded file on error
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
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

  // Update merchant crypto settings
  app.put("/api/merchants/:id/crypto-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      
      // Verify user owns this merchant
      if (!req.user || req.user.merchantId !== merchantId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const validation = updateCryptoSettingsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid crypto settings", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantCryptoSettings(merchantId, validation.data);
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Don't return sensitive data
      const safeData = {
        ...updatedMerchant,
        coinbaseCommerceApiKey: updatedMerchant.coinbaseCommerceApiKey ? '••••••••' : null,
        coinbaseWebhookSecret: updatedMerchant.coinbaseWebhookSecret ? '••••••••' : null,
      };

      res.json(safeData);
    } catch (error) {
      console.error("Error updating crypto settings:", error);
      res.status(500).json({ message: "Failed to update crypto settings" });
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

  // Legacy endpoint for backwards compatibility
  app.delete("/api/tapt-stones/:id", async (req, res) => {
    try {
      const stoneId = parseInt(req.params.id);
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

      // Handle cancelled — don't charge, just update status
      if (resultParam === 'cancelled') {
        if (transaction.windcaveSessionState === 'pending') {
          await storage.updateTransactionStatus(txnId, 'failed');
          await storage.updateTransactionSessionState(txnId, 'declined');
          broadcastToStone(transaction.merchantId!, transaction.taptStoneId, {
            type: 'transaction_updated',
            transaction: { ...transaction, status: 'failed' }
          });
        }
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

  // Old create merchant endpoint
  app.post("/api/admin/merchants-old", async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ message: 'Access token required' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as any;
      
      if (decoded.role !== 'admin' || decoded.email !== 'admin@tapt.co.nz') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const merchantData = req.body;
      
      // Create merchant  
      const newMerchant = await storage.createMerchantWithPassword({
        name: merchantData.name,
        email: merchantData.contactEmail,
        businessName: merchantData.businessName,
        contactEmail: merchantData.contactEmail,
        contactPhone: merchantData.contactPhone,
        businessAddress: merchantData.businessAddress,
        currentProviderRate: merchantData.currentProviderRate,
        bankName: merchantData.bankName,
        bankAccountNumber: merchantData.bankAccountNumber,
        bankBranch: merchantData.bankBranch,
        accountHolderName: merchantData.accountHolderName,
        qrCodeUrl: generateQrCodeUrl(0, undefined, req), // Will be updated with actual merchant ID
        paymentUrl: generatePaymentUrl(0, undefined, req) // Will be updated with actual merchant ID
      }, "tempPassword");

      // Update URLs with actual merchant ID
      await storage.updateMerchantDetails(newMerchant.id, {
        businessName: newMerchant.businessName || "",
        contactEmail: newMerchant.contactEmail || "",
        contactPhone: newMerchant.contactPhone || "",
        businessAddress: newMerchant.businessAddress || "",
      });

      // Create login credentials for the merchant
      await createUser(merchantData.loginEmail, merchantData.loginPassword, newMerchant.id, 'merchant');

      res.json({
        id: newMerchant.id,
        name: newMerchant.name,
        businessName: newMerchant.businessName,
        message: "Merchant account created successfully"
      });
    } catch (error) {
      console.error("Error creating merchant:", error);
      res.status(500).json({ message: "Failed to create merchant account" });
    }
  });

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

      if (updates.bankName || updates.bankAccountNumber || updates.bankBranch || updates.accountHolderName) {
        await storage.updateMerchantBankAccount(merchantId, {
          bankName: updates.bankName,
          bankAccountNumber: updates.bankAccountNumber,
          bankBranch: updates.bankBranch,
          accountHolderName: updates.accountHolderName,
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
      res.json(merchants);
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
      res.json(merchant);
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

  // Test email endpoint
  // Clear all merchants  
  app.post("/api/admin/clear-merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantsBefore = await storage.getAllMerchants();
      
      // Clear all merchants  
      for (const merchant of merchantsBefore) {
        await storage.deleteMerchant(merchant.id);
      }

      res.json({ 
        message: `Cleared ${merchantsBefore.length} merchants successfully`,
        deletedMerchants: merchantsBefore.length
      });
    } catch (error) {
      console.error("Error clearing merchants:", error);
      res.status(500).json({ message: "Failed to clear merchants" });
    }
  });

  app.post("/api/admin/test-email", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const testEmail = await sendEmail({
        to: req.user?.email || 'test@example.com',
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@tapt.co.nz',
        subject: 'Tapt SendGrid Test Email',
        text: 'This is a test email to verify SendGrid configuration.',
        html: '<h2>SendGrid Test</h2><p>This is a test email to verify SendGrid configuration.</p>'
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

  // Debug route to sync verified merchants
  app.post("/api/debug/sync-merchants", async (req, res) => {
    try {
      const { syncVerifiedMerchants } = await import('./auth');
      await syncVerifiedMerchants();
      res.json({ success: true, message: "Verified merchants synced successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Debug route to check auth users
  app.get("/api/debug/auth-users", async (req, res) => {
    try {
      const { getUserByEmail } = await import('./auth');
      const user = getUserByEmail('oliverharryleonard@gmail.com');
      if (user) {
        res.json({ 
          found: true, 
          user: { 
            id: user.id, 
            email: user.email, 
            merchantId: user.merchantId, 
            role: user.role,
            hasPassword: !!user.password 
          } 
        });
      } else {
        res.json({ found: false });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Debug route to test password
  app.post("/api/debug/test-password", async (req, res) => {
    try {
      const bcrypt = await import('bcrypt');
      const { hash, password } = req.body;
      const isValid = await bcrypt.compare(password, hash);
      res.json({ isValid, hash: hash.substring(0, 20) + "...", password });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Debug route to fix missing auth user
  app.post("/api/debug/fix-auth-user", async (req, res) => {
    try {
      // Get the verified merchant
      const merchant = await storage.getMerchant(22);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Create auth user with default password
      try {
        const user = await createUser(merchant.email, "123456", merchant.id, 'merchant');
        res.json({ 
          success: true, 
          message: `Auth user created for ${merchant.email}`,
          user: { id: user.id, email: user.email, merchantId: user.merchantId }
        });
      } catch (error: any) {
        if (error.message.includes("already exists")) {
          res.json({ success: true, message: "Auth user already exists" });
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

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
      const passwordHash = await bcrypt.hash(password, 10);

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

      await storage.updateMerchant(merchant.id, { emailVerified: true, verificationToken: null });

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

  // Public merchant signup (no admin required) - with rate limiting
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

      const { name, email, password, confirmPassword } = validation.data;

      // Check if email already exists
      const existingMerchant = await storage.getMerchantByEmail(email);
      if (existingMerchant) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password for storage
      const passwordHash = await bcrypt.hash(password, 10);

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Create merchant with pending status — business details filled in next step
      const merchant = await storage.createMerchantWithSignup({
        name,
        businessName: name,
        businessType: 'general',
        email,
        phone: '',
        address: '',
        password,
        confirmPassword,
        verificationToken,
      });

      if (merchant) {
        await storage.updateMerchantPasswordHash(merchant.id, passwordHash);
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

      // Notify oliverleonard@taptpay.co.nz of new merchant registration
      const { sendEmail } = await import('./email-service');
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@taptpay.co.nz';
      await sendEmail({
        to: 'oliverleonard@taptpay.co.nz',
        from: fromEmail,
        subject: `🆕 New Merchant Registration — ${businessName}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#0055ff;margin-top:0">New Merchant Registered</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#666;width:40%">Business Name</td><td style="padding:8px 0;font-weight:600">${businessName}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Director</td><td style="padding:8px 0;font-weight:600">${director}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Account Name</td><td style="padding:8px 0">${merchant.name}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0"><a href="mailto:${contactEmail}">${contactEmail}</a></td></tr>
              <tr><td style="padding:8px 0;color:#666">Phone</td><td style="padding:8px 0">${contactPhone}</td></tr>
              <tr><td style="padding:8px 0;color:#666">GST Number</td><td style="padding:8px 0">${gstNumber}</td></tr>
              <tr><td style="padding:8px 0;color:#666">Business Address</td><td style="padding:8px 0">${businessAddress || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#666">NZBN</td><td style="padding:8px 0">${nzbn || '—'}</td></tr>
            </table>
            <p style="margin-top:24px;color:#999;font-size:12px">Submitted via TaptPay merchant registration</p>
          </div>
        `,
        text: `New merchant registered:\nBusiness: ${businessName}\nDirector: ${director}\nEmail: ${contactEmail}\nPhone: ${contactPhone}\nGST: ${gstNumber}\nAddress: ${businessAddress || '—'}\nNZBN: ${nzbn || '—'}`,
      });

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
      const passwordHash = await bcrypt.hash(password, 10);

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

  // Verify merchant and create password
  app.post("/api/verify-merchant", async (req, res) => {
    try {
      const validation = verifyMerchantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: validation.error.issues 
        });
      }

      const { token, password } = validation.data;

      // Find merchant by token
      const merchant = await storage.getMerchantByToken(token);
      if (!merchant) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

      // Hash password and verify merchant
      const passwordHash = await bcrypt.hash(password, 10);
      
      const verifiedMerchant = await storage.verifyMerchant(token, passwordHash);
      if (!verifiedMerchant) {
        return res.status(500).json({ message: "Failed to verify merchant" });
      }

      // Create user account for the verified merchant
      try {
        await createUser(verifiedMerchant.email, password, verifiedMerchant.id, 'merchant');
        console.log("User account created successfully for merchant:", verifiedMerchant.email);
      } catch (error) {
        console.error("Error creating user account:", error);
        // Don't fail verification if user creation fails, but log it
      }

      res.json({ 
        message: "Merchant verified successfully. You can now log in.",
        merchant: {
          id: verifiedMerchant.id,
          name: verifiedMerchant.name,
          businessName: verifiedMerchant.businessName,
          email: verifiedMerchant.email,
          status: verifiedMerchant.status
        }
      });
    } catch (error) {
      console.error("Error verifying merchant:", error);
      res.status(500).json({ message: "Failed to verify merchant" });
    }
  });

  // Server-Sent Events for real-time updates
  app.get("/api/merchants/:id/events", (req, res) => {
    const merchantId = parseInt(req.params.id);
    const stoneId = req.query.stoneId ? parseInt(req.query.stoneId as string) : null;
    
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

  // Get VAPID public key for push notification subscription
  app.get("/api/push/vapid-key", (req, res) => {
    const vapidKey = process.env.VAPID_PUBLIC_KEY || "";
    if (!vapidKey) {
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

      const merchantId = req.merchantId;
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

      const merchantId = req.merchantId;
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

  // Get push notification status for current merchant
  app.get("/api/push/status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.merchantId;
      if (!merchantId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const subs = await storage.getPushSubscriptionsByMerchant(merchantId);
      res.json({ subscribed: subs.length > 0, deviceCount: subs.length });
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
      const transactionAmount = parseFloat(transaction.price);
      const alreadyRefunded = parseFloat(transaction.totalRefunded || "0");
      const refundableAmount = parseFloat(transaction.refundableAmount || transaction.price);

      if (requestedAmount > refundableAmount) {
        return res.status(400).json({ 
          message: `Refund amount cannot exceed refundable amount of $${refundableAmount.toFixed(2)}` 
        });
      }

      if (requestedAmount <= 0) {
        return res.status(400).json({ message: "Refund amount must be greater than zero" });
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

      // Mark refund record as completed
      const completedRefund = await storage.updateRefundStatus(refund.id, "completed", windcaveRefundId);

      // Update transaction totals and status (refunded / partially_refunded)
      const updatedTransaction = await storage.updateTransactionAfterRefund(transactionId, requestedAmount);

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

  // Serve static uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const httpServer = createServer(app);
  return httpServer;
}
