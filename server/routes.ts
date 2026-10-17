import { TAP_TO_PAY_AVAILABLE, TAP_TO_PAY_UNAVAILABLE } from "@shared/payment-capabilities";
import type {CronCoordinator} from "./durable-cron";
import {getCronCoordinator} from "./cron-runtime";
import {logOperation} from "./structured-log";
import {SubscriptionCommandConflict} from './subscription-command';
import {getPaymentRuntime} from './payment-runtime-default';
import {createDurablePaymentNotificationHandlers} from './durable-payment-notification';
import {extractWindcaveNotificationSession} from './payment-notification-paths';
import {createRetailCheckoutHandlers} from './payment-checkout-handlers';
import {createInvoiceCheckoutHandlers} from './invoice-checkout-handlers';
import type {ConfiguredPaymentRuntime} from './payment-runtime';
import {reconcileRetainedPaymentsBeforeManualCommand} from './payment-manual-reconciliation';
import {getSubscriptionPaymentRuntime,type SubscriptionPaymentRuntime} from './subscription-payment-runtime';
import type {PaymentCommandActor} from './payment-command';
import type {IStorage} from './storage';
import { registerStockRoutes } from './domains/stock/routes';
import {isUuid} from './durable-payment-contract';
import {canonicalCashCommand,CashCommandInputError} from './cash-command';
import type { Express } from "express";
import express from "express";
import { config } from "./config";
import { strictBoundedIntegerQueryParam, strictPositiveIntegerParam, strictPositiveIntegerQueryParam, strictUuidParam } from "./http-params";
import { createServer, type Server } from "http";
import { installAsyncRouteGuard } from "./async-route-guard";
import {
  storage, PushSessionEndedError, TransactionCreationScopeError,
  BillSplitConflictError,
  SubscriptionBillingBusyError,
  TaptStoneCapacityError,
  TaptStoneConflictError,
  type JobBalanceCreationResult, type TradesClientRef,
} from "./storage";
import { TUTORIAL_PAGE_KEYS, isTutorialPageKey } from "@shared/tutorial";
import { inviteTeamMemberSchema, acceptInviteSchema, retailTransactionCreateRequestSchema, cashSaleRequestSchema, updateMerchantDetailsSchema, updateThemeSchema, updateDailyGoalSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, newPasswordSchema, createRefundSchema, publicSignupSchema, merchantOnboardingSchema, pushNotificationPreferencesSchema, createTenantProfileSchema, updateTenantProfileSchema, createActiveScheduleSchema, updateActiveScheduleSchema, createAdHocInvoiceSchema, markInvoicePaidExternalSchema, updateRentReminderSettingsSchema, createClientProfileSchema, updateClientProfileSchema, createQuoteSchema, acceptQuoteSchema, createJobInvoiceSchema, markJobPaidExternalSchema, sendJobBalanceSchema, createJobScheduleSchema, updateJobScheduleSchema, updateTradeReminderSettingsSchema, updateTradeGstSettingsSchema } from "@shared/schema";
import { isWindcaveConfigured, createWindcaveRefund, getWindcaveEnv } from "./windcave";
import { authenticateUser, checkPasswordEvenly, passwordCheckBudget, authenticateToken, createUser, loginForUserId, sessionLoginForUserRow, isAccountOwner, requestPasswordReset, resetPassword, validateResetToken, type AuthenticatedRequest, logSecurityEvent, syncVerifiedMerchants, startBusinessSession, startAdminSession, endAuthSession, endLoginSessions, csrfTokenForRequest, clearSessionCookie, hasSessionCookie, readBusinessSession, respondAuthBackendUnavailable, isStreamSessionActive, liveBusinessSessionLogin } from "./auth";
import {
  HANDOFF_CODE_TTL_MS, clearSignInCookie, googleVerifiedEmail, handoffCodeHash, newHandoffCode, readCookie,
  signInCookies, startGoogleSignIn, verifyGoogleSignInState,
} from "./google-sign-in";
import { type SignInRealm, type TooManyWhat, boardPrintBucket, confirmEmailBucket, confirmationResendBucket, appleCallbackAddressBucket, appleStateBucket, googleCallbackAddressBucket, googleStateBucket, normalizeThrottleEmail, passwordChangeBucket, passwordResetAddressBucket, passwordResetBucket, signInAccountBucket, signInAddressBucket, signInDeviceKeyPrefix, signupNoticeBucket, tooManyAttempts } from "./auth-throttle";
import { BOARD_PRINT_JSON_LIMIT, boardPrintRequestSchema, decodeBoardPrintPdf } from "./board-print";
import { clientAddressForLimits, limitAddress } from "./client-address";
import { tapToPayRequestSchema } from "./tap-to-pay-request";
import { ACCOUNT_EMAIL_REPLY_FLOOR_MS, SIGN_UP_REPLY_FLOOR_MS, replyNoSoonerThan, replyStart } from "./even-reply";
import { deviceKnowsEmail, markSignInDevice, readSignInDevice, signInBucketFor, signInDeviceCookie, type SignInDevice } from "./sign-in-device";
import { generateReceiptPdf } from "./pdf-generator";
import { generateQuotePdf } from "./trades-quote-pdf";
import { generateBusinessReportPdf } from "./report-generator";
import { computeQuoteTotals } from "@shared/trades-gst";
import { getBaseUrl, generatePaymentUrl, generateQrCodeUrl, generateStonePaymentUrl, boardSaleUrls } from "./url-utils";
import { sendEmail, sendTeamInviteEmail } from "./email-service";
import QRCode from "qrcode";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sendPushToMerchant } from "./push";
import { isPushServiceEndpoint } from "./push-endpoint";
import { resendInvoiceEmailForMerchant } from "./property-cron";
import { INVOICE_DOCUMENT_FOLDER, isInvoiceDocumentName, isPublicUploadFolder, parseInvoiceDocumentRef } from "./upload-policy";
import { getMalwareScanner, ScannerUnavailableError, type ScanResult } from "./malware-scanner";
import {
  APPLE_ISSUER, AppleSignInError, appleAuthorizeUrl, appleDisplayName, appleSettings, appleSignInCookies, appleStateMatches, createAppleKeySet,
  exchangeAppleCode, readAppleConnectStart, startAppleConnect, startAppleSignIn, verifyAppleIdentityToken, verifyAppleSignInState,
  type AppleConnectResult, type AppleConnectStart, type AppleTransport,
} from "./apple-sign-in";
import { INVOICE_DOCUMENT_EXTENSIONS } from "./invoice-document-security";
import { resendTradeInvoice, resendTradeInvoiceForMerchant, sendTradePaymentInvoice, sendTradePaymentInvoiceForMerchant, sendTradeQuoteForMerchant } from "./trades-delivery";
import { QUOTE_ACCEPTANCE_UNAVAILABLE } from "./quote-acceptance-notice";
import { sendGstInvoices, extractEmails } from "./gst-invoice";
import {
  BILLING_CARD_REQUIRED,
  billingCardIsReady,
  renewalPaymentMethodIsReady,
  isCardExpiryValid,
  isLuhnValid,
} from "./billing-card";
import {
  adminMerchantDto,
  appleConnectionDto,
  billingHistoryDto,
  adminMerchantSummaryDto,
  adminTransactionDto,
  merchantSseTransactionDto,
  memberMerchantSettingsDto,
  ownerMerchantDto,
  ownerTransactionDto,
  publicBoardBrandDto,
  publicBusinessDto,
  publicSplitPaymentDto,
  publicTransactionDto,
  pushNotificationPreferencesDto,
  subscriptionDto,
  teamMemberDto,
  tokenPaymentDto,
  tokenReceiptDto,
} from "./http-contracts";
import { PLAN_LIST, planIdSchema } from "@shared/plans";
import { sseBroker, type SseAudience } from "./sse-broker";
import { NO_BOARD_ADDRESS_RETIRED, NO_BOARD_SALE_NEEDS_OWN_LINK, noBoardAddressRetiredHtml } from "./no-board-address";
import {
  createRetailTransaction,
  PaymentCredentialCollisionError,
} from "./retail-transaction-service";
import {
  paymentTokenRateLimiter,
  resolvePaymentToken,
  type PaymentTokenEndpointFamily,
} from "./payment-token";
import { apiV1CreateTransactionSchema } from "./api-v1-contracts";
import {CreationCommandConflict,CreationCredentialUnavailable} from './payment-creation-command';
import {
  PaymentAttemptInputError,
  PaymentAttemptService,
} from "./payment-attempt-service";

function authorizeCronRequest(req: express.Request, res: express.Response): boolean {
  const cronSecret = config.cronSecret;
  if (!cronSecret) {
    res.status(503).json({ message: "Cron not configured" });
    return false;
  }
  const provided = req.headers["x-cron-secret"];
  const providedBuf = Buffer.from(Array.isArray(provided) ? "" : (provided ?? ""));
  const secretBuf = Buffer.from(cronSecret);
  if (
    providedBuf.length !== secretBuf.length
    || !crypto.timingSafeEqual(providedBuf, secretBuf)
  ) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  return true;
}

// A shared secret a caller presents in a header, compared in constant time.
// With no secret configured nobody matches: a webhook without its key fails closed.
function presentedSecretMatches(presented: unknown, expected: string | undefined): boolean {
  if (!expected || typeof presented !== "string") return false;
  const presentedBuf = Buffer.from(presented);
  const expectedBuf = Buffer.from(expected);
  return presentedBuf.length === expectedBuf.length && crypto.timingSafeEqual(presentedBuf, expectedBuf);
}

async function requireBillingCard(merchantId: number, res: any): Promise<boolean> {
  const subscription = await storage.getOrCreateSubscription(merchantId);
  if (billingCardIsReady(subscription)) return true;
  res.status(402).json(BILLING_CARD_REQUIRED);
  return false;
}

type StoredCardChargeRequest = {
  subscriptionId:number;merchantId:number;targetPlanId?:'solo'|'team'|'crew';
  idempotencyKey: string;
  cardId: string;
  amountCents: number;
  reference: string;
};

// Server-side cache of Windcave AJAX submit URLs per transaction.
// Populated at session creation; consumed once at payment completion.
// Prevents SSRF by never accepting these URLs from client bodies.


// Token attempts are addressed by their durable attempt UUID, never by a
// transaction ID. Gateway submission URLs are process-local capabilities; the
// durable session/X-ID and outcome live in payment_attempts.

// Same as sessionAjaxUrlCache but for the property rent/charge checkout, which is
// keyed by the invoice's public token rather than a numeric transaction id.


// Validate that a URL belongs to a known Windcave domain before using it with auth headers.

// Rate limiting: Track requests per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute per IP

function setPaymentTokenHeaders(res: any) {
  res.set({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
  });
}

function requirePaymentTokenRateLimit(
  req: any,
  res: any,
  family: PaymentTokenEndpointFamily,
) {
  if (paymentTokenRateLimiter.allow(req.ip || "unknown", family)) return true;
  res.status(429).json({ message: "Too many requests. Please try again later." });
  return false;
}

function isTokenAddressedTransaction(
  transaction: { paymentTokenHash?: string | null } | null | undefined,
) {
  return typeof transaction?.paymentTokenHash === "string";
}

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
  const key = limitAddress(ip) ?? 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  record.count++;
  return true;
}

// Cleanup old rate limit records periodically. unref() so this housekeeping
// timer never keeps a short-lived process (a test run, a one-off script)
// alive — the same reasoning as auth.ts's loginAttemptCleanupTimer.
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of Array.from(rateLimitMap.entries())) {
    if (now > record.resetTime) rateLimitMap.delete(ip);
  }
  for (const [key, record] of Array.from(resendRateLimitMap.entries())) {
    if (now > record.resetTime) resendRateLimitMap.delete(key);
  }
}, RATE_LIMIT_WINDOW).unref();

// The business's own streams and its boards' streams. The anonymous business-wide
// no-board stream, and gap 12 Option C's ambiguity gate in front of it, were retired on
// 2026-09-25 (server/no-board-address.ts): no anonymous stream carries a no-board sale.
function broadcastToStone(merchantId: number, stoneId: number | null | undefined, data: any) {
  sseBroker.broadcast(merchantId, stoneId ?? null, data);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** A file of a type an upload's filter refuses: answered 400 with this message (receiveUpload). */
class UploadTypeError extends Error {}

/**
 * Runs one multer upload and answers its refusals (C10 batch 6c): a type the filter refuses is 400
 * with the filter's message, a file over the size limit 413, any other malformed upload 400. They
 * reached the error handler without a status, which answered 500.
 */
function receiveUpload(upload: multer.Multer, field: string): express.RequestHandler {
  const receive = upload.single(field);
  return (req, res, next) => receive(req, res, (error?: unknown) => {
    if (!error) return next();
    if (error instanceof UploadTypeError) return res.status(400).json({ message: error.message });
    if (error instanceof multer.MulterError) {
      return error.code === "LIMIT_FILE_SIZE"
        ? res.status(413).json({ message: "The file is larger than 20 MB" })
        : res.status(400).json({ message: "Invalid upload" });
    }
    next(error);
  });
}

// Multer configuration for logo uploads.
// Files are held in memory and persisted to the uploaded_files table — never to
// the local filesystem, which is ephemeral on autoscale deployments (a deploy or
// restart would silently delete every customer upload).
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
    // These file-only endpoints must not parse nested/sparse text fields.
    fields: 0,
    files: 1,
    parts: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new UploadTypeError('Only PNG files are allowed'));
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
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
    fields: 0,
    files: 1,
    parts: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (INVOICE_DOC_MIME.has(file.mimetype)) cb(null, true);
    else cb(new UploadTypeError('Only PDF or image files are allowed'));
  },
});

// UPL-2 (R1-T3 domain 5): multer's fileFilter above only checks the
// client-supplied `mimetype` header, never the actual bytes — unlike the
// sibling logo route's server-side PNG magic-byte re-check. Re-verify four
// of the five allowed types against their real file signature; HEIC is a
// deliberately narrower, documented interim scope (its box-based `ftyp`
// signature is meaningfully fiddlier to parse correctly than a fixed byte
// prefix) and stays mimetype-only for now.
const INVOICE_DOC_MAGIC_CHECK: Record<string, (buf: Buffer) => boolean> = {
  'application/pdf': (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ),
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/webp': (buf) =>
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP',
  // 'image/heic' intentionally omitted — mimetype-only, see comment above.
};

// Upsert a file into uploaded-file storage under its /uploads path
// (e.g. "logos/merchant-5.png"), stamped with the owning merchant. Re-uploading
// to the same path by the same merchant overwrites; a path owned by a different
// merchant is refused by storage (gap 13).
async function saveUploadedFile(relPath: string, mimeType: string, data: Buffer, merchantId: number): Promise<void> {
  await storage.saveUploadedFile(relPath, mimeType, data, merchantId);
}

// Gap 13: a private document is only ever sent after the caller was authorized
// by the route; it must never be cached by a shared cache, and the stored MIME
// type is served with `nosniff` so a browser cannot reinterpret the bytes.
function sendPrivateDocument(res: express.Response, file: { mimeType: string; data: Buffer }) {
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(file.data);
}

// Gap 13: a document reference on an invoice/quote create must be one of THIS
// merchant's own uploads (the only thing the upload endpoint ever produced).
// True when there is nothing to check or the reference is valid; otherwise
// answers 400 and returns false, and the caller must return without writing
// anything — including any prospect/client row it would otherwise create first.
async function requireOwnedInvoiceDocument(
  merchantId: number,
  documentUrl: string | undefined,
  res: express.Response,
): Promise<boolean> {
  if (!documentUrl) return true;
  const ref = parseInvoiceDocumentRef(documentUrl);
  // And scanned clean (R1-T7 S6a): a document with no clean scan on record cannot be attached.
  if (ref && (await storage.cleanUploadedFileOwnedByMerchant(ref.relPath, merchantId))) return true;
  res.status(400).json({ message: "Invalid document attachment" });
  return false;
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

const defaultRouteStorage=storage;
export async function registerRoutes(app: Express,options:{storage?:IStorage;paymentRuntime?:ConfiguredPaymentRuntime;subscriptionPayments?:SubscriptionPaymentRuntime;cron?:Pick<CronCoordinator,"run"|"status"|"stop">;httpServer?:Server}={}): Promise<Server> {
  // Express 4 drops an async handler's rejection on the floor — nothing calls
  // next(err), so the request is never answered and the client hangs forever.
  // This patches the registration methods themselves, so every route below is
  // covered; it must stay the first statement, because it only reaches
  // handlers registered after it. See server/async-route-guard.ts.
  installAsyncRouteGuard(app);

  // R1-T4 phase B: believe X-Forwarded-For/-Proto only from as many proxies as the
  // deployment says stand in front (TRUST_PROXY_HOPS). Unset or 0: from none, so a
  // visitor's own forwarded headers change nothing.
  if (config.trustProxyHops) app.set("trust proxy", config.trustProxyHops);

  const cron=options.cron??getCronCoordinator();
  const storage=options.storage??defaultRouteStorage;
  const paymentRuntime=options.paymentRuntime??getPaymentRuntime();
  const subscriptionPayments=options.subscriptionPayments??getSubscriptionPaymentRuntime(paymentRuntime?.repository);
  async function executeStoredCardCharge(request:StoredCardChargeRequest,actor?:PaymentCommandActor){
    if(!subscriptionPayments)return {success:false as const,error:'Billing reconciliation is unavailable'};
    const subscription=await storage.getSubscription(request.merchantId);
    if(!subscription||subscription.id!==request.subscriptionId)return {success:false as const,error:'Subscription not found'};
    const result=await subscriptionPayments.billing.charge({...request,actor,kind:request.targetPlanId?'upgrade':'activation',planId:request.targetPlanId??subscription.planId as 'solo'|'team'|'crew'});
    if(!['approved','declined'].includes(result.kind)||!result.applied)return {success:false as const,error:'Billing outcome is still being confirmed'};
    return {success:true as const,approved:result.kind==='approved',durableApplied:true};
  }
  function commandActor(req:AuthenticatedRequest,res:express.Response) {
    const requestId=res.getHeader('X-Request-Id');
    return {userId:req.user!.id,role:req.user!.role as 'owner'|'member'|'admin',
      ...(typeof requestId==='string' && /^[A-Za-z0-9._:-]{1,100}$/.test(requestId)?{requestId}:{})};
  }
  async function reconcileBeforeManualChange(domain:'retail'|'property'|'trades',aggregateId:number|string,merchantId:number) {
    await reconcileRetainedPaymentsBeforeManualCommand(paymentRuntime,{domain,aggregateId,merchantId});
  }
  const paymentAttempts = new PaymentAttemptService(storage,paymentRuntime?.clock);
  const retailCheckoutHandlers=createRetailCheckoutHandlers({storage,attempts:paymentAttempts,runtime:paymentRuntime,
    baseUrl:getBaseUrl,checkRateLimit:(req,res,family)=>{
      if(req.params.id!==undefined && !checkRateLimit(req.ip || 'unknown')){
        res.status(429).json({message:'Too many requests. Please try again later.'});return false;
      }
      return requirePaymentTokenRateLimit(req,res,family);
    }});
  const invoiceCheckoutHandlers=createInvoiceCheckoutHandlers({runtime:paymentRuntime,getCheckoutInvoiceByToken,
    customerEmail:async invoice=>{const party=await getCheckoutParty(invoice);if(!party)throw new Error('invoice_party_unavailable');return party.email??'payer@taptpay.co.nz';},
    baseUrl:getBaseUrl,checkRateLimit:tokenRateLimit});
  const durableNotificationHandlers=createDurablePaymentNotificationHandlers({receive:async(sessionId,kind)=>{
    if(!paymentRuntime)throw new Error('durable_receipt_unavailable');
    return paymentRuntime.repository.receive(sessionId,kind);
  }},extractWindcaveNotificationSession,{allowGet:true});

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
    const merchantId = strictPositiveIntegerParam(req.params.merchantId);
    if (merchantId === null) return res.status(400).json({ message: "Invalid merchantId" });
    const stoneId = strictPositiveIntegerParam(req.params.stoneId);
    if (stoneId === null) return res.status(400).json({ message: "Invalid stoneId" });
    const payUrl = generatePaymentUrl(merchantId, stoneId, req);
    const host = payUrl.replace(/^https?:\/\//, "");
    const intentUrl = `intent://${host}#Intent;scheme=https;package=com.android.chrome;end`;
    res.setHeader("Cache-Control", "no-store");
    res.type("text/html").send(nfcRedirectHtml(payUrl, intentUrl));
  });

  // A business's no-board NFC tag pointed at the business-wide page, retired on 2026-09-25
  // (server/no-board-address.ts): 410 with the customer notice, and no redirect.
  app.get("/nfc/:merchantId", (req, res) => {
    const merchantId = strictPositiveIntegerParam(req.params.merchantId);
    if (merchantId === null) return res.status(400).json({ message: "Invalid merchantId" });
    res.setHeader("Cache-Control", "no-store");
    res.status(410).type("text/html").send(noBoardAddressRetiredHtml());
  });

  app.get("/.well-known/apple-developer-merchantid-domain-association", (_req, res) => {
    // process.cwd(), not import.meta.dirname: this file loads under ts-jest's
    // CommonJS transform (see server/migrate.ts's entrypoint-detection comment
    // for the same constraint), and the app always runs from the repo root.
    const filePath = path.resolve(
      process.cwd(),
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

  // For a route that serves merchants AND admits the platform admin (so it
  // cannot sit behind authenticateAdmin): true only for the validated platform
  // admin principal — the admin role, a zero merchant scope and the configured
  // admin email. A role string alone is never enough (plan §8.5):
  // authenticateToken checks the admin session's principal and current credential
  // tag, and this re-checks the resulting `req.user`.
  //
  // This is deliberately the SAME predicate authenticateAdmin enforces, kept as
  // a separate function so that middleware (whose exact shape a source guard in
  // subscription-route-security.test.ts pins) is left untouched; a test in
  // uploaded-file-tenancy.test.ts fails if the two ever stop matching.
  function isValidatedPlatformAdmin(user: AuthenticatedRequest["user"]): boolean {
    const adminEmail = config.admin.email;
    return (
      !!user &&
      user.role === "admin" &&
      user.merchantId === 0 &&
      !!adminEmail &&
      user.email.toLowerCase() === adminEmail.toLowerCase()
    );
  }

  // Admin authentication middleware
  const authenticateAdmin = async (req: AuthenticatedRequest, res: any, next: any) => {
    let authenticated = false;
    await authenticateToken(req, res, () => {
      authenticated = true;
    });
    if (!authenticated) return;

    const adminEmail = config.admin.email;
    if (
      req.user?.role !== "admin" ||
      req.user.merchantId !== 0 ||
      !adminEmail ||
      req.user.email.toLowerCase() !== adminEmail.toLowerCase()
    ) {
      logSecurityEvent("ADMIN_ACCESS_DENIED", { role: req.user?.role });
      return res.status(403).json({ message: "Admin access required" });
    }

    return next();
  };

  // P2.2 (R1-T3): the platform admin passes authenticateToken with no business (merchant 0), so a route
  // serving a business's own logins refuses it as an authenticated principal without the tenant: 403.
  // It was 400 or 401, route by route.
  const MERCHANT_ACCESS_REQUIRED = { message: "Merchant access required" } as const;

  function checkMerchantOwnership(req: AuthenticatedRequest, merchantId: number): boolean {
    if (!req.user) return false;
    if (!Number.isInteger(merchantId) || merchantId <= 0) return false;
    if (req.user.role === 'admin') return true;
    return req.user.merchantId === merchantId;
  }

  function checkAccountOwnership(req: AuthenticatedRequest, merchantId: number): boolean {
    return checkMerchantOwnership(req, merchantId) && isAccountOwner(req.user);
  }

  // Google OAuth routes — R1-T4 phase A (owner decision 2026-09-21,
  // docs/decisions/2026-09-21-r1-t4-t9-owner-answers.md). No account token ever
  // travels in an address: state + PKCE are bound to the starting browser by an
  // HttpOnly cookie, and the callback hands over a one-time code in a second
  // HttpOnly cookie that the login page redeems once (server/google-sign-in.ts).
  const googleCookies = signInCookies(getBaseUrl());
  const googleSignInError = (message: string) => `/login?error=${encodeURIComponent(message)}`;

  app.get("/api/auth/google", (req, res) => {
    const clientId = config.oauth.googleClientId;
    if (!clientId) {
      return res.redirect(googleSignInError('Google sign in is not configured'));
    }
    const start = startGoogleSignIn();
    res.cookie(googleCookies.oauth.name, start.cookieValue, googleCookies.oauth.options);
    res.set('Cache-Control', 'no-store');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${getBaseUrl(req)}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state: start.state,
      code_challenge: start.codeChallenge,
      code_challenge_method: 'S256',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, error, state } = req.query as { code?: string; error?: string; state?: string };
    // The starting cookie is spent whatever happens next.
    const verifier = verifyGoogleSignInState(readCookie(req.headers.cookie, googleCookies.oauth.name), state);
    clearSignInCookie(res, googleCookies.oauth);
    res.set('Cache-Control', 'no-store');

    if (error || !code) {
      return res.redirect(googleSignInError('Google sign in was cancelled'));
    }
    // Not this browser's sign-in (or it expired): refuse before asking Google anything.
    if (!verifier) {
      return res.redirect(googleSignInError('Google sign in expired. Please try again.'));
    }

    try {
      // External review 2026-09-29: each start is taken up once, before Google is asked anything, so a
      // kept copy of the starting cookie cannot replay the callback. The slot is never given back.
      const firstUse = await storage.takeAuthThrottleSlot([googleStateBucket(state as string)], new Date());
      if (!firstUse.allowed) {
        return res.redirect(googleSignInError('Google sign in expired. Please try again.'));
      }
      const clientId = config.oauth.googleClientId;
      const clientSecret = config.oauth.googleClientSecret;
      if (!clientId || !clientSecret) {
        return res.redirect(googleSignInError('Google sign in is not configured'));
      }
      // R1-T4 phase B: callbacks that get as far as asking Google are counted per
      // visitor address, once addresses can be told apart; a success gives its count
      // back. Cancels and failed state checks above cost nothing, so are not counted.
      const address = clientAddressForLimits(req);
      const addressBuckets = address ? [googleCallbackAddressBucket(address)] : [];
      if (addressBuckets.length > 0) {
        const slot = await storage.takeAuthThrottleSlot(addressBuckets, new Date());
        if (!slot.allowed) {
          return res.redirect(googleSignInError(tooManyAttempts(slot.retryAfterMs, "sign-in").body.message));
        }
      }
      const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;

      // Exchange code for tokens, proving it with this browser's PKCE verifier.
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }).toString(),
      });

      if (!tokenRes.ok) {
        logOperation("error","GOOGLE_TOKEN_EXCHANGE_FAILED",{payload:['Google token exchange failed:',tokenRes.status]});
        return res.redirect(googleSignInError('Google sign in failed'));
      }

      const tokenData = await tokenRes.json() as { access_token: string };

      // Fetch user profile from Google
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return res.redirect(googleSignInError('Google sign in failed'));
      }

      const profile = await userRes.json() as {
        id: string; email: string; name: string; verified_email?: boolean; email_verified?: boolean;
      };
      const { id: googleId, email, name } = profile;

      if (!email) {
        return res.redirect(googleSignInError('Google account has no email'));
      }
      // Owner decision Q1: an email counts only when Google itself verified it —
      // for joining an existing merchant and for creating a new one alike.
      if (!googleVerifiedEmail(profile)) {
        return res.redirect(googleSignInError("Google hasn't verified that email address."));
      }

      const normalizedEmail = email.trim().toLowerCase();
      const [existingMerchant, existingLogin] = await Promise.all([
        storage.getMerchantByEmail(normalizedEmail),
        storage.getUserByEmail(normalizedEmail),
      ]);
      if (!existingMerchant && existingLogin) {
        return res.redirect(googleSignInError('That email already has a TaptPay login.'));
      }
      if (
        existingMerchant &&
        existingLogin &&
        (existingLogin.merchantId !== existingMerchant.id || existingLogin.role !== "owner")
      ) {
        return res.redirect(googleSignInError('That email already has a TaptPay login.'));
      }

      let merchant = existingMerchant;
      const randomPwd = crypto.randomBytes(32).toString("hex");
      let isNewUser = false;

      if (merchant) {
        if (merchant.status === 'pending') {
          return res.redirect(googleSignInError('Your account is pending verification. Please check your email.'));
        }
        if (merchant.status !== "verified" && merchant.status !== "active") {
          return res.redirect(googleSignInError('Your account is not active.'));
        }
        // Linked once, to one Google account: never silently re-linked to another.
        if (merchant.googleId && merchant.googleId !== googleId) {
          return res.redirect(googleSignInError('That TaptPay account is linked to a different Google account.'));
        }
        if (!merchant.googleId) {
          await storage.updateMerchant(merchant.id, { googleId });
        }
      } else {
        // Create new merchant account — Google verified the email (checked above)
        const randomPasswordHash = await bcrypt.hash(randomPwd, 12);
        merchant = await storage.createMerchantWithPassword({
          name: name || normalizedEmail.split('@')[0],
          businessName: name || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          status: 'verified',
          googleId,
        } as any, randomPasswordHash);
        isNewUser = true;
      }

      // Ensure the merchant can be resolved for token auth, which requires a
      // passwordHash on the record. Google users never log in with a password, so
      // seed a random unguessable one if absent (createUser is idempotent).
      const authUser = await createUser(normalizedEmail, randomPwd, merchant.id);

      const handoff = newHandoffCode();
      await storage.createAuthHandoffCode({
        codeHash: handoff.codeHash,
        userId: authUser.userId ?? authUser.id,
        newUser: isNewUser,
        expiresAt: new Date(Date.now() + HANDOFF_CODE_TTL_MS),
      });
      res.cookie(googleCookies.handoff.name, handoff.code, googleCookies.handoff.options);
      await storage.settleAuthThrottle(addressBuckets, "void", new Date())
        .catch((error) => logOperation("error","GOOGLE_ADDRESS_THROTTLE_RETURN",{payload:["[GOOGLE_ADDRESS_THROTTLE_RETURN]",error]}));
      return res.redirect('/login?google=complete');
    } catch (err) {
      logOperation("error","GOOGLE_OAUTH_CALLBACK_ERROR",{payload:['Google OAuth callback error:',err]});
      return res.redirect(googleSignInError('Google sign in failed. Please try again.'));
    }
  });

  // The login page's half of Google sign-in: redeem the one-time code, once, for
  // the session cookie and the page's CSRF token; never cached.
  app.post("/api/auth/google/session", async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const codeHash = handoffCodeHash(readCookie(req.headers.cookie, googleCookies.handoff.name));
    clearSignInCookie(res, googleCookies.handoff);
    const expired = () =>
      res.status(401).json({ code: 'GOOGLE_SIGN_IN_EXPIRED', message: 'Google sign in expired. Please try again.' });
    if (!codeHash) return expired();
    try {
      const redeemed = await storage.consumeAuthHandoffCode(codeHash, new Date());
      if (!redeemed) return expired();
      const issued = await loginForUserId(redeemed.userId);
      if (!issued) {
        return res.status(403).json({ code: 'ACCOUNT_UNAVAILABLE', message: 'This account cannot sign in right now.' });
      }
      // R1-T4 phase E3: only the HttpOnly cookie signs the browser in.
      const session = await startBusinessSession(req, res, issued);
      return res.json({ merchantId: issued.merchantId, newUser: redeemed.newUser, csrfToken: session.csrfToken });
    } catch (err) {
      logOperation("error","GOOGLE_SESSION",{payload:['[GOOGLE_SESSION]',err]});
      return res.status(500).json({ message: 'Google sign in failed. Please try again.' });
    }
  });

  // ── Sign in with Apple — R1-T5b (owner decision 2026-09-29, answer 2; built with stand-ins, live
  // once the owner's Services ID, key and team ID are set). The web flow through the Services ID:
  // Apple answers by a form post from its own origin (server/cross-site.ts). The same protections as
  // Google's flow, for Apple's protocol: a state and nonce bound to the starting browser by a signed
  // HttpOnly cookie, good for ten minutes and taken up once; a one-time code handed to the login page
  // in a second HttpOnly cookie, never a session in an address. Unlike Google's, an Apple identity is
  // NEVER joined to a login by its email (server/apple-sign-in.ts; plan R1-T5).
  const appleCookies = appleSignInCookies(getBaseUrl());
  const appleTransport: AppleTransport = (url, init) => fetch(url, init);
  const appleKeys = createAppleKeySet(appleTransport);
  const appleSignInError = (message: string) => `/login?error=${encodeURIComponent(message)}`;
  /** Sign in with Apple can run here: all four settings, on an https origin (the starting cookie needs it). */
  const appleOffered = () => appleSettings() !== null && appleCookies.secure;
  const APPLE_EXPIRED = 'Apple sign in expired. Please try again.';
  const APPLE_ALREADY_HAS_LOGIN = 'That email already has a TaptPay login. Sign in, then connect Apple in Settings.';

  app.get("/api/auth/apple", (req, res) => {
    const settings = appleSettings();
    if (!settings) return res.redirect(appleSignInError('Apple sign in is not configured'));
    // The starting cookie must be SameSite=None to come back on Apple's post, and that needs https.
    if (!appleCookies.secure) return res.redirect(appleSignInError('Apple sign in needs a secure (https) address'));
    const start = startAppleSignIn();
    res.cookie(appleCookies.oauth.name, start.cookieValue, appleCookies.oauth.options);
    res.set('Cache-Control', 'no-store');
    res.redirect(appleAuthorizeUrl(settings, `${getBaseUrl(req)}/api/auth/apple/callback`, start));
  });

  // R1-T5d: the login page's question before it shows "Continue with Apple" (owner decision
  // 2026-09-29: it goes live once Apple is set up). One boolean about this server, and nothing else.
  app.get("/api/auth/apple/available", (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ available: appleOffered() });
  });

  app.post("/api/auth/apple/callback", async (req, res) => {
    // After a form post the browser must fetch the next page with GET: 303.
    const back = (target: string) => res.redirect(303, target);
    res.set('Cache-Control', 'no-store');
    // R1-T5c: a signed-in owner's connect returns here too (Apple takes one return address). It is told
    // by its starting cookie alone, which only a connect's start is given; everything else is a sign-in.
    const connectStart = readAppleConnectStart(readCookie(req.headers.cookie, appleCookies.oauth.name));
    if (connectStart) return finishAppleConnect(req, res, connectStart);
    const settings = appleSettings();
    if (!settings) return back(appleSignInError('Apple sign in is not configured'));
    const form = (req.body ?? {}) as { code?: unknown; state?: unknown; error?: unknown; user?: unknown };
    // The starting cookie is spent whatever happens next.
    const nonce = verifyAppleSignInState(readCookie(req.headers.cookie, appleCookies.oauth.name), form.state);
    clearSignInCookie(res, appleCookies.oauth);

    if (form.error || typeof form.code !== 'string' || !form.code) {
      return back(appleSignInError('Apple sign in was cancelled'));
    }
    // Not this browser's sign-in (or it expired): refuse before asking Apple anything.
    if (!nonce) return back(appleSignInError(APPLE_EXPIRED));

    try {
      // Each start is taken up once, before Apple is asked anything: a kept copy of the cookie and
      // state cannot replay the return. The slot is never given back.
      const firstUse = await storage.takeAuthThrottleSlot([appleStateBucket(form.state as string)], new Date());
      if (!firstUse.allowed) return back(appleSignInError(APPLE_EXPIRED));
      // Returns that get as far as asking Apple are counted per visitor address, once addresses can
      // be told apart (R1-T4 phase B); a success gives its count back.
      const address = clientAddressForLimits(req);
      const addressBuckets = address ? [appleCallbackAddressBucket(address)] : [];
      if (addressBuckets.length > 0) {
        const slot = await storage.takeAuthThrottleSlot(addressBuckets, new Date());
        if (!slot.allowed) return back(appleSignInError(tooManyAttempts(slot.retryAfterMs, "sign-in").body.message));
      }

      let identity;
      try {
        const idToken = await exchangeAppleCode(form.code, `${getBaseUrl(req)}/api/auth/apple/callback`, settings, appleTransport);
        identity = await verifyAppleIdentityToken(idToken, { clientId: settings.servicesId, nonce }, appleKeys);
      } catch (error) {
        if (!(error instanceof AppleSignInError)) throw error;
        // The reason only: never the code, the token or anything in it.
        logOperation("error","APPLE_SIGN_IN",{payload:['[APPLE_SIGN_IN]',error.reason]});
        return back(appleSignInError(
          error.reason === 'grant-refused' ? 'Apple sign in was not completed. Please try again.'
            : error.reason === 'unreachable' ? 'Apple sign in is unavailable right now. Please try again.'
              : 'Apple sign in failed. Please try again.',
        ));
      }

      const key = { issuer: APPLE_ISSUER, clientId: identity.clientId, subject: identity.subject };
      const known = await storage.getAppleIdentity(key);
      let userId = known?.userId ?? null;
      let isNewUser = false;

      if (userId === null) {
        // An identity that signs nobody in yet. Its email is the one in Apple's token, or the one
        // Apple gave the first time (Apple shares it once): never anything from the unsigned form.
        const offered = identity.email?.trim().toLowerCase() || undefined;
        if (offered && !identity.emailVerified) {
          return back(appleSignInError("Apple hasn't verified that email address."));
        }
        const email = offered ?? known?.email ?? undefined;
        if (!email) {
          return back(appleSignInError(
            'Apple did not share an email address. In your Apple ID settings, stop using Apple ID with TaptPay, then try again.',
          ));
        }
        const isPrivateEmail = offered ? identity.privateRelay : (known?.isPrivateEmail ?? false);
        const [existingMerchant, existingLogin] = await Promise.all([
          storage.getMerchantByEmail(email),
          storage.getUserByEmail(email),
        ]);
        if (existingMerchant || existingLogin) {
          // Never joined by email (plan R1-T5): the identity is recorded as pending and signs nobody
          // in. Its owner connects it from a signed-in session (R1-T5c).
          await storage.recordPendingAppleIdentity(key, { email, isPrivateEmail });
          return back(appleSignInError(APPLE_ALREADY_HAS_LOGIN));
        }
        // A new business, as a first Google sign-in makes: Apple verified the address. The login
        // never signs in by password, so it is given a random unguessable one.
        const name = appleDisplayName(form.user) ?? email.split('@')[0];
        const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
        const made = await storage.createMerchantWithAppleIdentity({ name, businessName: name, email }, randomPasswordHash, key, { isPrivateEmail });
        userId = made.userId;
        isNewUser = true;
      }

      const handoff = newHandoffCode();
      await storage.createAuthHandoffCode({
        codeHash: handoff.codeHash,
        userId,
        newUser: isNewUser,
        expiresAt: new Date(Date.now() + HANDOFF_CODE_TTL_MS),
      });
      res.cookie(appleCookies.handoff.name, handoff.code, appleCookies.handoff.options);
      await storage.settleAuthThrottle(addressBuckets, "void", new Date())
        .catch((error) => logOperation("error","APPLE_ADDRESS_THROTTLE_RETURN",{payload:["[APPLE_ADDRESS_THROTTLE_RETURN]",error]}));
      return back('/login?apple=complete');
    } catch (err) {
      // Two first sign-ins at once: the second finds the address or the identity taken. Either way
      // nothing half-made is left, and trying again signs in.
      logOperation("error","APPLE_SIGN_IN",{payload:['[APPLE_SIGN_IN]',err instanceof Error ? err.name : 'error']});
      return back(appleSignInError('Apple sign in failed. Please try again.'));
    }
  });

  // The login page's half of Sign in with Apple: redeem the one-time code, once, for the session
  // cookie and the page's CSRF token; never cached.
  app.post("/api/auth/apple/session", async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const codeHash = handoffCodeHash(readCookie(req.headers.cookie, appleCookies.handoff.name));
    clearSignInCookie(res, appleCookies.handoff);
    const expired = () => res.status(401).json({ code: 'APPLE_SIGN_IN_EXPIRED', message: APPLE_EXPIRED });
    if (!codeHash) return expired();
    try {
      const redeemed = await storage.consumeAuthHandoffCode(codeHash, new Date());
      if (!redeemed) return expired();
      const issued = await loginForUserId(redeemed.userId);
      if (!issued) {
        return res.status(403).json({ code: 'ACCOUNT_UNAVAILABLE', message: 'This account cannot sign in right now.' });
      }
      const session = await startBusinessSession(req, res, issued);
      return res.json({ merchantId: issued.merchantId, newUser: redeemed.newUser, csrfToken: session.csrfToken });
    } catch (err) {
      logOperation("error","APPLE_SESSION",{payload:['[APPLE_SESSION]',err]});
      return res.status(500).json({ message: 'Apple sign in failed. Please try again.' });
    }
  });

  // ── Connecting Apple to a login that already exists — R1-T5c (plan R1-T5: an identity is linked
  // "only from an already authenticated owner session", never by its email). The signed-in owner proves
  // the current password, as changing it asks, and is given Apple's address to go to. Apple's return is
  // a cross-site post with no session cookie on it, so the login and the session that asked ride in the
  // starting cookie under the server's signature (a key used for nothing else, server/apple-sign-in.ts),
  // and that session must still stand, and still be the owner's, when Apple returns.
  const OWNER_ONLY = { message: "Only the account owner can do this." } as const;
  const APPLE_NOT_AVAILABLE = { code: 'APPLE_NOT_AVAILABLE', message: 'Sign in with Apple is not available.' } as const;
  const currentPasswordBody = z.object({ currentPassword: z.string().min(1) });

  // The owner's Settings row: whether Apple signs this login in. Read without Apple being set up, so a
  // connection made earlier can still be seen (and removed).
  app.get("/api/auth/apple/connection", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.set('Cache-Control', 'no-store');
    const login = ownerLoginOf(req);
    if (!login) return res.status(403).json(OWNER_ONLY);
    try {
      const identity = await storage.getAppleIdentityForLogin(login.userId);
      return res.json(appleConnectionDto(identity, appleOffered()));
    } catch (err) {
      logOperation("error","APPLE_CONNECTION",{payload:['[APPLE_CONNECTION]',err]});
      return res.status(500).json({ message: 'Could not read the Apple connection. Please try again.' });
    }
  });

  // The start is a POST with the page's CSRF token, never a link: another site's link would carry the
  // session cookie (it is SameSite=Lax). It answers with Apple's address for the page to go to.
  app.post("/api/auth/apple/connect", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.set('Cache-Control', 'no-store');
    // The capability before the role (P2.2's order). The starting cookie must be SameSite=None to come
    // back on Apple's post, and that needs https.
    const settings = appleSettings();
    if (!settings || !appleCookies.secure) return res.status(503).json(APPLE_NOT_AVAILABLE);
    const login = ownerLoginOf(req);
    if (!login) return res.status(403).json(OWNER_ONLY);
    const body = currentPasswordBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Current password is required" });
    try {
      // A login has one Apple identity: said before the password is checked, so it costs no attempt.
      if (await storage.getAppleIdentityForLogin(login.userId)) {
        return res.status(409).json({ code: 'APPLE_ALREADY_CONNECTED', message: 'Apple is already connected to this login.' });
      }
      if (!(await provesCurrentPassword(res, login.userId, body.data.currentPassword))) return;
      const start = startAppleConnect(login);
      res.cookie(appleCookies.oauth.name, start.cookieValue, appleCookies.oauth.options);
      return res.json({ url: appleAuthorizeUrl(settings, `${getBaseUrl(req)}/api/auth/apple/callback`, start) });
    } catch (err) {
      logOperation("error","APPLE_CONNECT_START",{payload:['[APPLE_CONNECT_START]',err]});
      return res.status(500).json({ message: 'Could not start connecting Apple. Please try again.' });
    }
  });

  // Removes the login's Apple identity, behind the same password. Needs nothing of Apple, so it works
  // while Apple is not set up. It signs nobody out: "sign out everywhere" does that.
  app.post("/api/auth/apple/disconnect", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.set('Cache-Control', 'no-store');
    const login = ownerLoginOf(req);
    if (!login) return res.status(403).json(OWNER_ONLY);
    const body = currentPasswordBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Current password is required" });
    try {
      if (!(await provesCurrentPassword(res, login.userId, body.data.currentPassword))) return;
      const removed = await storage.disconnectAppleIdentity(login.userId);
      // By login id only: no Apple subject, token or email.
      logSecurityEvent('APPLE_DISCONNECTED', { userId: login.userId, removed });
      return res.json({ connected: false });
    } catch (err) {
      logOperation("error","APPLE_DISCONNECT",{payload:['[APPLE_DISCONNECT]',err]});
      return res.status(500).json({ message: 'Could not disconnect Apple. Please try again.' });
    }
  });

  /**
   * The signed-in owner's own login and the session that signed the request in: an owner's users row
   * behind a business session. isAccountOwner also answers yes for the platform admin, who has no
   * login row, and for the role's retired spelling: neither is a login Apple could sign in.
   */
  function ownerLoginOf(req: AuthenticatedRequest): { userId: number; sessionId: string } | null {
    const user = req.user;
    const session = req.authSession;
    if (!user || !isAccountOwner(user) || user.role !== 'owner' || !user.userId || session?.realm !== 'business') return null;
    return { userId: user.userId, sessionId: session.id };
  }

  /**
   * The signed-in login proves its current password: the check changing the password makes, counted
   * in the same bucket (passwordChangeBucket), so connecting, disconnecting and changing the password
   * cannot be used to multiply the guesses. A refusal is answered here; true means it was proved.
   */
  async function provesCurrentPassword(res: express.Response, userId: number, currentPassword: string): Promise<boolean> {
    const userRow = await storage.getUserById(userId);
    if (!userRow) {
      res.status(404).json({ message: "Login not found" });
      return false;
    }
    const throttleBucket = passwordChangeBucket(userId);
    const slot = await storage.takeAuthThrottleSlot([throttleBucket], new Date());
    if (!slot.allowed) {
      logSecurityEvent('PASSWORD_CHECK_SLOWED', { userId });
      refuseTooManyAttempts(res, slot.retryAfterMs, "sign-in");
      return false;
    }
    let currentPasswordValid: boolean;
    try {
      currentPasswordValid = await bcrypt.compare(currentPassword, userRow.password);
    } catch (error) {
      await storage.settleAuthThrottle([throttleBucket], "void", new Date()).catch(() => undefined);
      throw error;
    }
    if (!currentPasswordValid) {
      res.status(400).json({ message: "Current password is incorrect" });
      return false;
    }
    await storage.settleAuthThrottle([throttleBucket], "success", new Date())
      .catch((error) => logOperation("error","PASSWORD_CHECK_THROTTLE_CLEAR",{payload:["[PASSWORD_CHECK_THROTTLE_CLEAR]",error]}));
    return true;
  }

  /**
   * Apple's return to a connect (POST /api/auth/apple/callback with a connect's starting cookie). Who
   * is being connected is never taken from the post: it is the login and session the cookie names
   * under the server's signature. Every outcome sends the browser to Settings with one fixed word;
   * no session is made (the owner has one) and nothing of Apple's goes into an address.
   */
  async function finishAppleConnect(req: express.Request, res: express.Response, start: AppleConnectStart) {
    const done = (result: AppleConnectResult) => res.redirect(303, `/settings?apple=${result}`);
    // The starting cookie is spent whatever happens next.
    clearSignInCookie(res, appleCookies.oauth);
    const settings = appleSettings();
    if (!settings) return done("unavailable");
    const form = (req.body ?? {}) as { code?: unknown; state?: unknown; error?: unknown };
    if (form.error || typeof form.code !== 'string' || !form.code) return done("cancelled");
    // Not this start's return, or begun more than ten minutes ago: refused before Apple is asked anything.
    if (start.expired || !appleStateMatches(start.state, form.state)) return done("expired");
    // The session that asked, read by its id: not ended, not run out, its login and business still in
    // good standing, and that login still the owner the cookie names.
    const stillTheOwner = async () => {
      const user = await liveBusinessSessionLogin(start.sessionId);
      return user !== null && user.userId === start.userId && user.role === 'owner';
    };

    try {
      // Each start is taken up once, before Apple is asked anything, as a sign-in's is: a kept copy of
      // the cookie and state cannot replay the return. The slot is never given back.
      const firstUse = await storage.takeAuthThrottleSlot([appleStateBucket(start.state)], new Date());
      if (!firstUse.allowed) return done("expired");
      if (!(await stillTheOwner())) return done("expired");
      // Returns that get as far as asking Apple are counted per visitor address with sign-in's, once
      // addresses can be told apart (R1-T4 phase B); a connect that succeeds gives its count back.
      const address = clientAddressForLimits(req);
      const addressBuckets = address ? [appleCallbackAddressBucket(address)] : [];
      if (addressBuckets.length > 0) {
        const slot = await storage.takeAuthThrottleSlot(addressBuckets, new Date());
        if (!slot.allowed) return done("try-later");
      }

      let identity;
      try {
        const idToken = await exchangeAppleCode(form.code, `${getBaseUrl(req)}/api/auth/apple/callback`, settings, appleTransport);
        identity = await verifyAppleIdentityToken(idToken, { clientId: settings.servicesId, nonce: start.nonce }, appleKeys);
      } catch (error) {
        if (!(error instanceof AppleSignInError)) throw error;
        // The reason only: never the code, the token or anything in it.
        logOperation("error","APPLE_CONNECT",{payload:['[APPLE_CONNECT]',error.reason]});
        return done(error.reason === 'unreachable' ? "unavailable" : "failed");
      }

      // Asking Apple took a moment: the session must still stand now. The write then re-reads the
      // login under its row lock and takes nothing but an active owner's.
      if (!(await stillTheOwner())) return done("expired");
      // Only an address Apple verified is kept. It is shown to the owner and decides nothing.
      const email = identity.emailVerified ? identity.email?.trim().toLowerCase() || undefined : undefined;
      const outcome = await storage.connectAppleIdentity(
        start.userId,
        { issuer: APPLE_ISSUER, clientId: identity.clientId, subject: identity.subject },
        { email, isPrivateEmail: email ? identity.privateRelay : false },
      );
      if (outcome === "identity-taken") return done("taken");
      if (outcome === "login-has-another") return done("has-another");
      if (outcome === "no-login") return done("expired");
      // By login id only: no Apple subject, token or email. The same identity again changed nothing.
      if (outcome === "connected") logSecurityEvent('APPLE_CONNECTED', { userId: start.userId });
      await storage.settleAuthThrottle(addressBuckets, "void", new Date())
        .catch((error) => logOperation("error","APPLE_ADDRESS_THROTTLE_RETURN",{payload:["[APPLE_ADDRESS_THROTTLE_RETURN]",error]}));
      return done("connected");
    } catch (err) {
      // The name only: a storage error's text can carry the row it refused, Apple's subject included.
      logOperation("error","APPLE_CONNECT",{payload:['[APPLE_CONNECT]',err instanceof Error ? err.name : 'error']});
      return done("failed");
    }
  }

  // R1-T4 phase D: end every session of the signed-in login, this one included.
  // Advancing the login's session version ends every session begun before it.
  app.post("/api/auth/sign-out-everywhere", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.set('Cache-Control', 'no-store');
    const userId = req.user?.userId;
    if (req.user?.role === 'admin' || !userId) {
      return res.status(403).json({ message: 'Only a TaptPay login can do this.' });
    }
    try {
      if (!(await storage.advanceUserSessionVersion(userId))) {
        return res.status(404).json({ message: 'Login not found' });
      }
      sseBroker.disconnectUser(req.user!.merchantId, userId);
      // Every session has ended, this caller's included, so a fault from here on
      // must not answer "try again": the spent token could never retry it.
      // R1-T4 phase E: the version already refuses every session; this records why on each.
      await endLoginSessions(userId, 'sign_out_everywhere')
        .catch((error) => logOperation("error","SIGN_OUT_EVERYWHERE_SESSIONS",{payload:["[SIGN_OUT_EVERYWHERE_SESSIONS]",error]}));
      if (req.authSession) clearSessionCookie(res, req.authSession.realm);
      await storage.deactivatePushSubscriptionsForLogin(req.user!.merchantId, userId)
        .catch((error) => logOperation("error","SIGN_OUT_EVERYWHERE_PUSH_STOP",{payload:["[SIGN_OUT_EVERYWHERE_PUSH_STOP]",error]}));
      return res.status(204).end();
    } catch (err) {
      logOperation("error","SIGN_OUT_EVERYWHERE",{payload:['[SIGN_OUT_EVERYWHERE]',err]});
      return res.status(500).json({ message: 'Could not sign out everywhere. Please try again.' });
    }
  });

  // R1-T4 phase E: Log Out ends this session only, clears its cookie and closes its live streams.
  app.post("/api/auth/logout", authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.set('Cache-Control', 'no-store');
    // The admin area has its own Log Out (POST /api/admin/auth/logout), as sign out everywhere refuses it.
    if (req.user?.role === 'admin') {
      return res.status(403).json({ message: 'Only a TaptPay login can do this.' });
    }
    try {
      if (req.authSession) {
        await endAuthSession(res, req.authSession, 'logout');
        sseBroker.disconnectSession(req.authSession.id);
      }
      return res.status(204).end();
    } catch (err) {
      logOperation("error","LOGOUT",{payload:['[LOGOUT]',err]});
      return res.status(500).json({ message: 'Could not sign out. Please try again.' });
    }
  });

  // Password sign-in — R1-T4 phase C (owner decision 2026-09-21, Q5): attempts are
  // counted in shared storage before the password is checked, and repeated failures
  // are slowed down rather than locking the account (server/auth-throttle.ts). A
  // device that has signed in before is counted on its own, so no one else's
  // guesses can slow it down (server/sign-in-device.ts).
  const merchantDeviceCookie = signInDeviceCookie("merchant", getBaseUrl());
  const adminDeviceCookie = signInDeviceCookie("admin", getBaseUrl());
  const refuseTooManyAttempts = (
    res: express.Response, retryAfterMs: number, what: TooManyWhat,
  ) => {
    const refusal = tooManyAttempts(retryAfterMs, what);
    res.set("Retry-After", String(refusal.retryAfterSeconds));
    return res.status(429).json(refusal.body);
  };
  // R1-T4 phase B: a sign-in also counts against its visitor's address, once addresses
  // can be told apart (server/client-address.ts), unless its device already knows this
  // email: no one else's guesses may keep a merchant's own device out.
  const signInAddressBuckets = (req: express.Request, realm: SignInRealm, email: string, device: SignInDevice | null) => {
    if (deviceKnowsEmail(device, realm, email)) return [];
    const address = clientAddressForLimits(req);
    return address ? [signInAddressBucket(realm, address)] : [];
  };

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email or password", errors: validation.error.errors });
      }

      const { email, password } = validation.data;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const device = readSignInDevice(req, merchantDeviceCookie);
      const bucket = signInBucketFor("merchant", email, device);
      const addressBuckets = signInAddressBuckets(req, "merchant", email, device);
      const slot = await storage.takeAuthThrottleSlot([bucket, ...addressBuckets], new Date());
      if (!slot.allowed) {
        logSecurityEvent('LOGIN_SLOWED', { email, ip: clientIp });
        return refuseTooManyAttempts(res, slot.retryAfterMs, "sign-in");
      }

      let user: Awaited<ReturnType<typeof authenticateUser>>;
      try {
        user = await authenticateUser(email, password);
      } catch (error) {
        // Not a guess that was answered: give the attempt back.
        await storage.settleAuthThrottle([bucket, ...addressBuckets], "void", new Date()).catch(() => undefined);
        throw error;
      }
      if (!user) {
        logSecurityEvent('FAILED_LOGIN', { email, ip: clientIp });
        return res.status(401).json({ message: "Invalid email or password" });
      }

      await storage.settleAuthThrottle([bucket], "success", new Date())
        .catch((error) => logOperation("error","LOGIN_THROTTLE_CLEAR",{payload:["[LOGIN_THROTTLE_CLEAR]",error]}));
      // A success gives its address try back; it never clears the address's count.
      await storage.settleAuthThrottle(addressBuckets, "void", new Date())
        .catch((error) => logOperation("error","LOGIN_ADDRESS_THROTTLE_RETURN",{payload:["[LOGIN_ADDRESS_THROTTLE_RETURN]",error]}));
      markSignInDevice(res, merchantDeviceCookie, device, email);
      logSecurityEvent('LOGIN_SUCCESS', { email, ip: clientIp, userId: user.id });

      // R1-T4 phase E3: only the HttpOnly cookie signs the browser in.
      const session = await startBusinessSession(req, res, {
        userId: user.userId ?? user.id,
        sessionVersion: user.sessionVersion ?? 0,
      });

      res.set("Cache-Control", "no-store");
      res.json({
        csrfToken: session.csrfToken,
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
    const startedAt = replyStart();
    try {
      const validation = forgotPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email", errors: validation.error.errors });
      }

      const { email } = validation.data;
      // R1-T4 phase C: each request sends an email and replaces the live link, so
      // every one counts, checked before a link is made: a refused request sends
      // nothing and leaves the link already sent working. Counted per email whether
      // or not it has a login, so the answer never tells which.
      const address = clientAddressForLimits(req);
      const slot = await storage.takeAuthThrottleSlot(
        [passwordResetBucket(email), ...(address ? [passwordResetAddressBucket(address)] : [])],
        new Date(),
      );
      if (!slot.allowed) {
        logSecurityEvent('PASSWORD_RESET_SLOWED', { email, ip: req.ip || req.socket.remoteAddress || 'unknown' });
        return refuseTooManyAttempts(res, slot.retryAfterMs, "password-reset");
      }
      const baseUrl = getBaseUrl(req);

      await requestPasswordReset(email, baseUrl);

      // The same answer, after the same wait, whether or not the address has a login
      // (owner decision 2026-09-23): only a login's request saves a link and sends
      // an email, and the reply must not show that it took longer.
      const worked = await replyNoSoonerThan(startedAt, ACCOUNT_EMAIL_REPLY_FLOOR_MS);
      if (worked > ACCOUNT_EMAIL_REPLY_FLOOR_MS) {
        logOperation("warn","FORGOT_PASSWORD_SLOW_TOOK_MS_OVER_THE_MS_FLOOR",{payload:[`[FORGOT_PASSWORD_SLOW] took ${Math.round(worked)} ms, over the ${ACCOUNT_EMAIL_REPLY_FLOOR_MS} ms floor`]});
      }
      res.json({ message: "If an account with that email exists, a password reset link has been sent." });
    } catch (error) {
      logOperation("error","PASSWORD_RESET_REQUEST_ERROR",{payload:["Password reset request error:",error]});
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const validation = resetPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0]?.message ?? "Invalid reset data",
          errors: validation.error.errors,
        });
      }

      const { token, password } = validation.data;
      const reset = await resetPassword(token, password);

      if (!reset) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      // The reset ended every session of this login; close its live streams and
      // stop its devices' notifications too.
      sseBroker.disconnectUser(reset.merchantId, reset.userId);
      await endLoginSessions(reset.userId, 'password_reset')
        .catch((error) => logOperation("error","RESET_SESSIONS",{payload:["[RESET_SESSIONS]",error]}));
      await storage.deactivatePushSubscriptionsForLogin(reset.merchantId, reset.userId)
        .catch((error) => logOperation("error","RESET_PUSH_STOP",{payload:["[RESET_PUSH_STOP]",error]}));
      // R1-T4 phase C: the link proved the email is theirs. Forgive the login's
      // sign-in slow-downs — its unknown devices' and every known device's — and
      // count this browser as known from now on.
      const login = await storage.getUserById(reset.userId).catch(() => undefined);
      if (login?.email) {
        await storage.forgetAuthThrottle(
          [signInAccountBucket("merchant", login.email).key],
          [signInDeviceKeyPrefix("merchant", login.email)],
        ).catch((error) => logOperation("error","RESET_THROTTLE_FORGET",{payload:["[RESET_THROTTLE_FORGET]",error]}));
        markSignInDevice(res, merchantDeviceCookie, readSignInDevice(req, merchantDeviceCookie), login.email);
      }

      res.json({ message: "Password has been successfully reset" });
    } catch (error) {
      logOperation("error","PASSWORD_RESET_ERROR",{payload:["Password reset error:",error]});
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/auth/validate-reset-token/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const isValid = await validateResetToken(token);

      res.json({ valid: isValid });
    } catch (error) {
      // Answer with a failure rather than `valid: false`: the token may be
      // perfectly good, and telling the user it expired would send them back to
      // request another one that fails the same way.
      logOperation("error","VALIDATE_RESET_TOKEN_ERROR",{payload:["Validate reset token error:",error]});
      res.status(500).json({ message: "Failed to validate the reset link" });
    }
  });

  // R1-T4 phase B, for the owner's live check (decision 2026-09-21, Q4): how this request
  // arrived, and which address each TRUST_PROXY_HOPS value would take as the visitor's.
  // The one showing the caller's own public address is the setting to use. Admin-only;
  // it shows the caller nothing but their own request.
  app.get("/api/admin/request-origin", authenticateAdmin, (req, res) => {
    res.set("Cache-Control", "no-store");
    const forwardedFor = String(req.headers["x-forwarded-for"] ?? "")
      .split(",").map((entry) => entry.trim()).filter(Boolean);
    const connectionAddress = req.socket.remoteAddress ?? null;
    const chain = connectionAddress ? [...forwardedFor, connectionAddress] : forwardedFor;
    res.json({
      trustProxyHops: config.trustProxyHops,
      addressLimits: config.trustProxyHops === null ? "off" : "on",
      clientAddress: req.ip ?? null,
      protocol: req.protocol,
      host: req.get("host") ?? null,
      forwardedFor,
      connectionAddress,
      candidates: chain.map((_, hops) => ({ hops, clientAddress: chain[chain.length - 1 - hops] })),
    });
  });

  // Admin Authentication routes — slowed down like merchant sign-in (R1-T4 phase C),
  // with their own buckets and their own known-device mark.
  app.post("/api/admin/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid email or password", errors: validation.error.errors });
      }

      const { email, password } = validation.data;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const device = readSignInDevice(req, adminDeviceCookie);
      const bucket = signInBucketFor("admin", email, device);
      const addressBuckets = signInAddressBuckets(req, "admin", email, device);
      const slot = await storage.takeAuthThrottleSlot([bucket, ...addressBuckets], new Date());
      if (!slot.allowed) {
        logSecurityEvent('ADMIN_LOGIN_SLOWED', { email, ip: clientIp });
        return refuseTooManyAttempts(res, slot.retryAfterMs, "sign-in");
      }

      // Check for admin credentials
      const adminEmail = config.admin.email;
      const adminPasswordHash = config.admin.passwordHash;
      // Email addresses are compared without regard to case, as merchant sign-in does:
      // a phone keyboard's capital first letter must not read as wrong credentials.
      const isAdminEmail = !!adminEmail && normalizeThrottleEmail(email) === normalizeThrottleEmail(adminEmail);
      if (isAdminEmail && !adminPasswordHash) {
        await storage.settleAuthThrottle([bucket, ...addressBuckets], "void", new Date()).catch(() => undefined);
        logOperation("error","CRITICAL_ADMIN_PASSWORD_HASH_ENV_VAR_NOT_SET_ADMIN_LOGIN_DISABLE",{payload:["CRITICAL: ADMIN_PASSWORD_HASH env var not set. Admin login disabled."]});
        return res.status(500).json({ message: "Admin login unavailable - contact system administrator" });
      }
      let passwordValid: boolean;
      try {
        // The same work for any email as for the admin's (owner decision
        // 2026-09-23), so the time taken does not point at the admin's email.
        passwordValid = await checkPasswordEvenly(
          password,
          isAdminEmail ? adminPasswordHash : null,
          passwordCheckBudget(adminPasswordHash),
        );
      } catch (error) {
        await storage.settleAuthThrottle([bucket, ...addressBuckets], "void", new Date()).catch(() => undefined);
        throw error;
      }

      if (!passwordValid) {
        logSecurityEvent('ADMIN_FAILED_LOGIN', { email, ip: clientIp });
        return res.status(401).json({ message: "Invalid admin credentials" });
      }

      await storage.settleAuthThrottle([bucket], "success", new Date())
        .catch((error) => logOperation("error","ADMIN_LOGIN_THROTTLE_CLEAR",{payload:["[ADMIN_LOGIN_THROTTLE_CLEAR]",error]}));
      await storage.settleAuthThrottle(addressBuckets, "void", new Date())
        .catch((error) => logOperation("error","ADMIN_LOGIN_ADDRESS_THROTTLE_RETURN",{payload:["[ADMIN_LOGIN_ADDRESS_THROTTLE_RETURN]",error]}));
      markSignInDevice(res, adminDeviceCookie, device, email);
      logSecurityEvent('ADMIN_LOGIN_SUCCESS', { email, ip: clientIp });

      const adminUser = {
        id: 1,
        email: adminEmail!,
        password: "",
        merchantId: 0,
        role: "admin" as const,
        createdAt: new Date(),
      };

      // R1-T4 phase E3: the admin signs in by its own HttpOnly cookie.
      const session = await startAdminSession(req, res);

      res.set("Cache-Control", "no-store");
      return res.json({
        csrfToken: session.csrfToken,
        user: {
          id: adminUser.id,
          email: adminUser.email,
          merchantId: adminUser.merchantId,
          role: adminUser.role,
        },
      });
    } catch (error) {
      logSecurityEvent('ADMIN_LOGIN_ERROR', { error: String(error) });
      res.status(500).json({ message: "Admin login failed" });
    }
  });

  // Regular user authentication check
  // Every client gates its first paint on this route: the app shows a
  // full-screen loader until it answers. Express 4 does not route an async
  // rejection to the error handler, so an unhandled throw here leaves the
  // request open forever and the whole app — mobile and desktop — spins on the
  // loader with nothing to show. Always answer, even on failure: a 500 lets the
  // client fall back to the login screen instead of hanging.
  // The signed-in login as every client's start-up check reads it.
  async function signedInUserDto(user: NonNullable<AuthenticatedRequest["user"]>) {
    const merchantId = user.merchantId;
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
      billingCardReady = billingCardIsReady(await storage.getOrCreateSubscription(merchantId));
    }
    return {
      id: user.id,
      email: user.email,
      merchantId: user.merchantId,
      role: user.role,
      onboardingCompleted,
      merchantStatus,
      gstRegistered,
      tradeGstMode,
      billingCardReady,
    };
  }

  app.get("/api/auth/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json({ user: await signedInUserDto(req.user!) });
    } catch (error) {
      logOperation("error","AUTH_ME_ERROR",{payload:["Auth me error:",error]});
      res.status(500).json({ message: "Failed to load the signed-in user" });
    }
  });

  // R1-T4 phase E: the app's start-up check on a session cookie. Unlike /api/auth/me it answers a visitor
  // who is not signed in with an ordinary 200 (no refusal, so nothing is logged as an error in the
  // browser), and hands a signed-in page its CSRF token, which the page keeps in memory only. An invalid
  // cookie is cleared; a database that cannot be read is 503, as for any sign-in check.
  app.get("/api/auth/session", async (req: AuthenticatedRequest, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const signedIn = await readBusinessSession(req, res);
      if (signedIn === "unavailable") return respondAuthBackendUnavailable(res);
      if (!signedIn) return res.json({ signedIn: false });
      return res.json({ signedIn: true, user: await signedInUserDto(signedIn.user), csrfToken: signedIn.csrfToken });
    } catch (error) {
      logOperation("error","AUTH_SESSION",{payload:["[AUTH_SESSION]",error]});
      return res.status(500).json({ message: "Failed to load the signed-in user" });
    }
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
      logOperation("error","TUTORIAL_STATE_ERROR",{payload:["Tutorial state error:",error]});
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
      logOperation("error","TUTORIAL_PROGRESS_ERROR",{payload:["Tutorial progress error:",error]});
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
      logOperation("error","TUTORIAL_RESTART_ERROR",{payload:["Tutorial restart error:",error]});
      res.status(500).json({ message: "Failed to restart tutorials" });
    }
  });

  // Merchant KYC onboarding submission
  app.post("/api/merchants/:id/onboarding", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!Number.isInteger(merchantId) || !checkAccountOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      // Held to sign-up's rules before anything is read, kept or sent (C10 batch 6).
      const validation = merchantOnboardingSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0]?.message ?? "Invalid onboarding details",
          errors: validation.error.issues,
        });
      }
      const {
        director,
        nzbn,
        gstNumber,
        websiteUrl,
        estimatedAnnualTurnover,
        businessDescription,
      } = validation.data;

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Save all KYC details to merchant record. The website, turnover and description were
      // emailed but never kept until 2026-09-27 (C10 batch 6).
      // Storage marks onboarding complete itself (R1-T7 S5a): it is not a field a caller sends.
      await storage.updateMerchantSettings(merchantId, { kind: "onboarding", details: {
        director,
        nzbn: nzbn || null,
        gstNumber: gstNumber || null,
        websiteUrl: websiteUrl || null,
        estimatedAnnualTurnover: estimatedAnnualTurnover || null,
        businessDescription: businessDescription || null,
      } });

      // Send notification email to TaptPay admin
      // All user-supplied values are HTML-escaped via escHtml() to prevent injection.
      const adminEmail = config.admin.email || config.admin.notifyEmail;
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
      logOperation("error","ONBOARDING_SUBMISSION_ERROR",{payload:["Onboarding submission error:",error]});
      res.status(500).json({ message: "Failed to submit onboarding details" });
    }
  });

  app.get("/api/admin/auth/me", authenticateAdmin, (req: AuthenticatedRequest, res) => {
    // R1-T4 phase E: the admin session's page gets its CSRF token here, as the business's does.
    res.set("Cache-Control", "no-store");
    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        merchantId: 0,
        role: "admin",
      },
      csrfToken: csrfTokenForRequest(req),
    });
  });

  // R1-T4 phase E: the admin area's Log Out ends this admin session and closes its live streams.
  app.post("/api/admin/auth/logout", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (req.authSession) {
        await endAuthSession(res, req.authSession, "logout");
        sseBroker.disconnectSession(req.authSession.id);
      }
      return res.status(204).end();
    } catch (error) {
      logOperation("error","ADMIN_LOGOUT",{payload:["[ADMIN_LOGOUT]",error]});
      return res.status(500).json({ message: "Could not sign out. Please try again." });
    }
  });

  // The business-wide no-board QR image, retired on 2026-09-25 (server/no-board-address.ts):
  // a printable QR now comes from a board (below), or from a sale's own link.
  app.get("/api/merchants/:id/qr", (req, res) => {
    const merchantId = strictPositiveIntegerParam(req.params.id);
    if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
    res.status(410).json(NO_BOARD_ADDRESS_RETIRED);
  });

  // Generate QR code for specific tapt stone
  app.get("/api/merchants/:id/stone/:stoneId/qr", async (req, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const stoneId = strictPositiveIntegerParam(req.params.stoneId);
      if (stoneId === null) return res.status(400).json({ message: "Invalid id" });

      // Verify stone exists and belongs to merchant
      const stone = await storage.getTaptStone(stoneId);
      if (!stone || stone.merchantId !== merchantId) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      // Get size parameter (default to 400, allow up to 1000 for downloads)
      const size = strictBoundedIntegerQueryParam(req.query.size, { fallback: 400, max: 1000 });
      if (size === null) return res.status(400).json({ message: "Invalid size" });
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
      logOperation("error","STONE_QR_CODE_GENERATION_ERROR",{payload:["Stone QR code generation error:",error]});
      res.status(500).json({ message: "Failed to generate QR code for stone" });
    }
  });

  // (Removed GET /api/merchants/:id, owner decision 2026-09-26: counting through business numbers
  // listed every business, unconfirmed sign-ups included. Customer pages get the business's
  // details with the sale, link or invoice they hold, and a board's page from its board, below.)

  // A board's customer page: the business's name and logo, as the printed board shows them.
  // Public like the board's page; only for one of the business's active boards.
  app.get("/api/merchants/:id/stone/:stoneId/brand", async (req, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const stoneId = strictPositiveIntegerParam(req.params.stoneId);
      if (stoneId === null) return res.status(400).json({ message: "Invalid id" });
      const stone = await storage.getTaptStone(stoneId);
      if (!stone || !stone.isActive || stone.merchantId !== merchantId) {
        return res.status(404).json({ message: "Payment board not found" });
      }
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Payment board not found" });
      res.json(publicBoardBrandDto(merchant));
    } catch (error) {
      logOperation("error","BOARD_BRAND_ERROR",{payload:["Board brand error:",error]});
      res.status(500).json({ message: "Failed to load the board" });
    }
  });

  // Authenticated settings profile. Owners receive the full allowlisted account
  // projection; teammates receive only the read-only business fields rendered
  // by their disabled Settings form.
  app.get("/api/merchants/:id/profile", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!Number.isInteger(merchantId) || !checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });

      res.json(
        isAccountOwner(req.user)
          ? ownerMerchantDto(merchant)
          : memberMerchantSettingsDto(merchant),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to get merchant profile" });
    }
  });

  // Resolve a per-payment bearer link. The response deliberately carries no
  // numeric transaction/merchant/board address.
  app.get("/api/pay/t/:token", async (req, res) => {
    setPaymentTokenHeaders(res);
    if (!requirePaymentTokenRateLimit(req, res, "resolve")) return;
    try {
      const transaction = await resolvePaymentToken(storage, req.params.token);
      if (!transaction) {
        return res.status(404).json({ message: "Payment link not found" });
      }
      const merchant = transaction.merchantId
        ? await storage.getMerchant(transaction.merchantId)
        : undefined;
      if (!merchant) {
        return res.status(404).json({ message: "Payment link not found" });
      }

      const dto = tokenPaymentDto(transaction, merchant);
      if (["failed", "cancelled"].includes(transaction.status)) {
        return res.status(410).json({ message: "Payment link is closed", payment: dto });
      }
      return res.json(dto);
    } catch (error) {
      logOperation("error","PAYMENT_TOKEN_RESOLVE_FAILED",{payload:["Payment token resolve failed"]});
      return res.status(500).json({ message: "Failed to load payment link" });
    }
  });

  // Generate a QR for the exact bearer URL. Never cache bearer-derived images.
  app.get("/api/pay/t/:token/qr", async (req, res) => {
    setPaymentTokenHeaders(res);
    if (!requirePaymentTokenRateLimit(req, res, "qr")) return;
    try {
      const transaction = await resolvePaymentToken(storage, req.params.token);
      if (!transaction) {
        return res.status(404).json({ message: "Payment link not found" });
      }
      const size = strictBoundedIntegerQueryParam(req.query.size, { fallback: 300, min: 100, max: 800 });
      if (size === null) return res.status(400).json({ message: "Invalid size" });
      const tokenUrl = `${getBaseUrl(req)}/pay/t/${req.params.token}`;
      const qrBuffer = await QRCode.toBuffer(tokenUrl, {
        type: "png",
        width: size,
        margin: 2,
        color: { dark: "#00E5CC", light: "#00000000" },
        errorCorrectionLevel: "M",
      });
      res.type("png");
      return res.send(qrBuffer);
    } catch (error) {
      logOperation("error","PAYMENT_TOKEN_QR_GENERATION_FAILED",{payload:["Payment token QR generation failed"]});
      return res.status(500).json({ message: "Failed to generate payment QR" });
    }
  });

  // Configure a token sale's split atomically. The bearer address is retained
  // throughout; no numeric split-payment identifier is returned.
  app.post("/api/pay/t/:token/split", async (req, res) => {
    setPaymentTokenHeaders(res);
    if (!requirePaymentTokenRateLimit(req, res, "session")) return;
    const validation = z.object({
      totalSplits: z.number().int().min(2).max(10),
    }).strict().safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ message: "Total splits must be an integer between 2 and 10" });
    }

    try {
      const transaction = await resolvePaymentToken(storage, req.params.token);
      if (!transaction) {
        return res.status(404).json({ message: "Payment link not found" });
      }
      if (!transaction.splitEnabled) {
        return res.status(409).json({ message: "This payment cannot be split" });
      }
      if (transaction.status !== "pending") {
        return res.status(409).json({ message: "The payment split can no longer be configured" });
      }

      const updated = await storage.createBillSplit(
        transaction.id,
        validation.data.totalSplits,
      );
      if (!updated) {
        return res.status(404).json({ message: "Payment link not found" });
      }
      const merchant = updated.merchantId
        ? await storage.getMerchant(updated.merchantId)
        : undefined;
      if (!merchant) {
        return res.status(404).json({ message: "Payment link not found" });
      }

      return res.json(tokenPaymentDto(updated, merchant));
    } catch (error) {
      if (error instanceof BillSplitConflictError) {
        return res.status(409).json({ message: error.message, code: error.code });
      }
      logOperation("error","TOKEN_PAYMENT_SPLIT_CONFIGURATION_FAILED",{payload:["Token payment split configuration failed"]});
      return res.status(500).json({ message: "Failed to configure payment split" });
    }
  });

  async function loadTokenReceipt(rawToken: string, rawShare: unknown) {
    const transaction = await resolvePaymentToken(storage, rawToken);
    if (!transaction) return { kind: "not-found" as const };
    const merchant = transaction.merchantId
      ? await storage.getMerchant(transaction.merchantId)
      : undefined;
    if (!merchant) return { kind: "not-found" as const };

    let shareIndex: number | null = null;
    if (rawShare !== undefined) {
      const parsed = typeof rawShare === "string" ? Number(rawShare) : NaN;
      if (!Number.isInteger(parsed) || parsed < 1) {
        return { kind: "invalid-share" as const };
      }
      shareIndex = parsed;
    }

    if (transaction.isSplit) {
      if (shareIndex === null) return { kind: "share-required" as const };
      const shares = await storage.getSplitPaymentsByTransaction(transaction.id);
      const share = shares.find((candidate) => candidate.splitIndex === shareIndex);
      if (!share) return { kind: "not-found" as const };
      if (share.status !== "completed") return { kind: "not-ready" as const };
      return { kind: "ready" as const, transaction, merchant, share };
    }

    if (shareIndex !== null) return { kind: "invalid-share" as const };
    if (!["completed", "partially_refunded", "refunded"].includes(transaction.status)) {
      return { kind: "not-ready" as const };
    }
    return { kind: "ready" as const, transaction, merchant, share: null };
  }

  function sendTokenReceiptError(res: any, result: { kind: string }) {
    if (result.kind === "not-found") {
      return res.status(404).json({ message: "Receipt not found" });
    }
    if (result.kind === "invalid-share" || result.kind === "share-required") {
      return res.status(400).json({
        message: result.kind === "share-required"
          ? "A completed share number is required"
          : "Invalid receipt share",
      });
    }
    return res.status(409).json({ message: "Receipt is not available yet" });
  }

  app.get("/api/pay/t/:token/receipt", async (req, res) => {
    setPaymentTokenHeaders(res);
    if (!requirePaymentTokenRateLimit(req, res, "resolve")) return;
    try {
      const result = await loadTokenReceipt(req.params.token, req.query.share);
      if (result.kind !== "ready") return sendTokenReceiptError(res, result);
      return res.json(tokenReceiptDto(result.transaction, result.merchant, result.share));
    } catch (error) {
      logOperation("error","TOKEN_RECEIPT_RESOLVE_FAILED",{payload:["Token receipt resolve failed"]});
      return res.status(500).json({ message: "Failed to load receipt" });
    }
  });

  app.post("/api/pay/t/:token/receipt-pdf", async (req, res) => {
    setPaymentTokenHeaders(res);
    if (!requirePaymentTokenRateLimit(req, res, "completion")) return;
    try {
      const result = await loadTokenReceipt(req.params.token, req.query.share);
      if (result.kind !== "ready") return sendTokenReceiptError(res, result);
      const pdf = await generateReceiptPdf(
        result.transaction,
        result.merchant,
        result.share
          ? {
              amount: result.share.amount,
              splitNumber: result.share.splitIndex,
              totalSplits: result.transaction.totalSplits ?? 1,
            }
          : undefined,
      );
      const suffix = result.share ? `share-${result.share.splitIndex}` : "payment";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=receipt-${suffix}-${new Date().toISOString().split("T")[0]}.pdf`,
      );
      return res.send(pdf);
    } catch (error) {
      logOperation("error","TOKEN_RECEIPT_PDF_GENERATION_FAILED",{payload:["Token receipt PDF generation failed"]});
      return res.status(500).json({ message: "Failed to generate receipt PDF" });
    }
  });

  app.get("/api/pay/t/:token/receipt-qr", async (req, res) => {
    setPaymentTokenHeaders(res);
    if (!requirePaymentTokenRateLimit(req, res, "qr")) return;
    try {
      const result = await loadTokenReceipt(req.params.token, req.query.share);
      if (result.kind !== "ready") return sendTokenReceiptError(res, result);
      const size = strictBoundedIntegerQueryParam(req.query.size, { fallback: 300, min: 100, max: 800 });
      if (size === null) return res.status(400).json({ message: "Invalid size" });
      const shareQuery = result.share ? `?share=${result.share.splitIndex}` : "";
      const receiptUrl = `${getBaseUrl(req)}/receipt/t/${req.params.token}${shareQuery}`;
      const qr = await QRCode.toBuffer(receiptUrl, {
        type: "png",
        width: size,
        margin: 2,
        color: { dark: "#00E5CC", light: "#00000000" },
        errorCorrectionLevel: "M",
      });
      res.type("png");
      return res.send(qr);
    } catch (error) {
      logOperation("error","TOKEN_RECEIPT_QR_GENERATION_FAILED",{payload:["Token receipt QR generation failed"]});
      return res.status(500).json({ message: "Failed to generate receipt QR" });
    }
  });

  // All payment callbacks reconcile through the durable inbox and shared worker.
  app.post("/api/pay/t/:token/session",retailCheckoutHandlers.session(true));

  app.post("/api/pay/t/:token/hosted-fields-complete",retailCheckoutHandlers.complete(true));

  app.post("/api/pay/t/:token/googlepay-complete",retailCheckoutHandlers.complete(true,true));

  // Windcave browser return and narrow client resolver share one state-addressed
  // endpoint. A processor return is always replaced by a token-preserving client
  // route; a plain GET reveals only outcome + transaction-local receipt share.
  app.get("/api/pay/return/:state",retailCheckoutHandlers.returnState);

  app.all("/api/pay/notification/:state",...durableNotificationHandlers);

  // Get active transaction for merchant - ultra-fast optimized
  app.get("/api/merchants/:id/active-transaction", async (req, res) => {
    const merchantId = strictPositiveIntegerParam(req.params.id);
    if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
    const stoneId = req.query.stoneId !== undefined
      ? strictPositiveIntegerQueryParam(req.query.stoneId)
      : undefined;
    // stoneId is `null` only when the param was present and failed to parse
    // (the ternary above yields `undefined`, never `null`, when it was
    // absent) — so this check alone also lets TS narrow the type below to
    // `number | undefined`, matching ActiveTransactionScope's stoneId.
    if (stoneId === null) {
      return res.status(400).json({ message: "Invalid stoneId" });
    }

    const noStore = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'application/json'
    };

    // The business's own terminal, signed in: its newest open sale on any board or
    // none, including a sale with its own link, which no public read can see. The
    // same shape its own event stream sends.
    // R1-T4 phase E: the terminal is told by its session cookie, as its event stream is (the app sends
    // no token). A board's page names its board, and reads it as any customer does even in a browser
    // signed in to the business.
    const signedIn = stoneId === undefined && hasSessionCookie(req);
    if (signedIn) {
      let authenticated = false;
      await authenticateToken(req as AuthenticatedRequest, res, () => {
        authenticated = true;
      });
      if (!authenticated) return;
      if (!checkMerchantOwnership(req as AuthenticatedRequest, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.set(noStore);
      try {
        const transaction = await storage.getActiveTransactionByMerchant(
          merchantId,
          stoneId === undefined ? { kind: "merchant-any" } : { kind: "board", stoneId },
        );
        if (!transaction) return res.json(null);
        // A board sale keeps its board's address. A sale with its own link can't have
        // it rebuilt (only its hash is kept), so it has none here.
        const boardUrls = transaction.taptStoneId != null && transaction.paymentTokenHash == null
          ? {
              paymentUrl: generatePaymentUrl(merchantId, transaction.taptStoneId, req),
              qrCodeUrl: generateQrCodeUrl(merchantId, transaction.taptStoneId, req),
            }
          : {};
        return res.json(ownerTransactionDto({ ...transaction, ...boardUrls }));
      } catch (error) {
        return res.status(500).json({ message: "Failed to get active transaction" });
      }
    }

    // No board and no sign-in: the retired business-wide no-board address.
    if (stoneId === undefined) {
      return res.status(410).json(NO_BOARD_ADDRESS_RETIRED);
    }

    // A board's customer page: public, scoped to that board.
    // SECURITY: Rate limiting
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(clientIp)) {
      logOperation("warn","SECURITY_RATE_LIMIT_EXCEEDED_FOR_IP_ON_ACTIVE_TRANSACTION_ENDPOI",{payload:[`SECURITY: Rate limit exceeded for IP ${clientIp} on active-transaction endpoint`]});
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }

    // Ultra-fast headers for immediate response
    res.set(noStore);

    try {
      // AUDIT: Log access to payment page
      logOperation("info","ACTIVE_TRANSACTION_REQUESTED_MERCHANT_STONE_IP",{payload:[`Active transaction requested: merchant ${merchantId}, stone ${stoneId}, IP ${clientIp}`]});

      // SECURITY: verify the board belongs to this merchant
      // Another business's board is answered as a missing one (R1-T3, P2.2's tenant-safe 404), as the
      // board's stream and brand answer; it was 403. So is a board the business has removed: its page no
      // longer shows the sale left open on it (owner decision 2026-09-29).
      const stone = await storage.getTaptStone(stoneId);
      if (!stone || !stone.isActive || stone.merchantId !== merchantId) {
        return res.status(404).json({ message: "Payment board not found" });
      }

      const transaction = await storage.getActiveTransactionByMerchant(merchantId, { kind: "board", stoneId });

      if (!transaction || transaction.merchantId !== merchantId) {
        return res.json(null);
      }

      // SECURITY: verify the transaction is for that board
      if (transaction.taptStoneId !== stoneId) {
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

      res.json(publicTransactionDto(transactionWithUrls));
    } catch (error) {
      res.status(500).json({ message: "Failed to get active transaction" });
    }
  });

  // Create new transaction
  app.post("/api/transactions", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const validation = retailTransactionCreateRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid transaction data", errors: validation.error.errors });
      }

      if (!checkMerchantOwnership(req, validation.data.merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const creationKey=req.get('Idempotency-Key');if(!isUuid(creationKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'A creation request key is required'});
      const priorCreation=await storage.getCreationCommandForMerchant(validation.data.merchantId,creationKey);
      if (!priorCreation&&!(await requireBillingCard(validation.data.merchantId, res))) return;

      const selectedStoneId = validation.data.selectedStoneId ?? null;
      // A sale without a payment board always has its own private link (owner decision
      // 2026-09-25, server/no-board-address.ts); only a board sale uses a shared address,
      // its board's. So no link type named means per-payment without a board.
      const linkMode = validation.data.linkMode ?? (selectedStoneId === null ? "per_payment" : "legacy");
      if (selectedStoneId === null && linkMode === "legacy") {
        return res.status(400).json(NO_BOARD_SALE_NEEDS_OWN_LINK);
      }
      if (linkMode === "per_payment" && !config.features.newRetailPayments) {
        return res.status(503).json({ message: "Per-payment links are not enabled yet" });
      }

      if (selectedStoneId !== null) {
        const stone = await storage.getTaptStoneForMerchant(selectedStoneId, validation.data.merchantId);
        if (!stone || stone.merchantId !== validation.data.merchantId || !stone.isActive) {
          return res.status(400).json({ message: "Selected payment board is unavailable" });
        }
      }
      if (selectedStoneId !== null && linkMode === "per_payment") {
        return res.status(400).json({ message: "Per-payment links cannot use a payment board" });
      }

      const creationIntent={key:creationKey,actor:commandActor(req,res)};
      const { transaction, rawToken } = await createRetailTransaction({ createTransaction: input => storage.createTransactionForMerchant(validation.data.merchantId, input,creationIntent) }, {
        merchantId: validation.data.merchantId,
        itemName: validation.data.itemName,
        price: validation.data.price,
        status: "pending",
        paymentMethod: "qr_code",
        splitEnabled: validation.data.splitEnabled,
        taptStoneId: selectedStoneId,
      }, linkMode,{creationKey,returnStateSecret:config.paymentReturnStateSecret});

      // The same authenticated creation intent returns its original credential.
      // Only its digest is stored. A board sale keeps its stable shared URL.
      const saleUrls = rawToken
        ? {
            paymentUrl: `${getBaseUrl(req)}/pay/t/${rawToken}`,
            qrCodeUrl: `${getBaseUrl(req)}/api/pay/t/${rawToken}/qr`,
          }
        : boardSaleUrls(transaction.merchantId!, transaction.taptStoneId, req);

      // Add URLs to transaction object
      const transactionWithUrls = {
        ...transaction,
        ...saleUrls,
      };

      // The atomic creation event owns publication and replay protection.

      res.json(ownerTransactionDto(transactionWithUrls));
    } catch (error) {
      if(error instanceof CreationCommandConflict||error instanceof CreationCredentialUnavailable)return res.status(409).json({code:error.code,message:'The original creation request needs recovery. Keep the same request.'});
      if (error instanceof TransactionCreationScopeError) return res.status(400).json({ message: "Selected payment board is unavailable" });
      if (error instanceof PaymentCredentialCollisionError) {
        return res.status(503).json({ message: "Could not create a payment link. Please try again." });
      }
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  // Cash Sale — creates and immediately completes a transaction (no payment processing)
  app.post("/api/transactions/cash-sale", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // The rules creating a sale uses (C10 batch 6b): the body was read without a schema
      // (parseInt, parseFloat), and the board was never checked.
      const validation = cashSaleRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid cash sale", errors: validation.error.errors });
      }
      const { merchantId, itemName, stoneId } = validation.data;
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const idempotencyKey=req.get('Idempotency-Key');
      if(!isUuid(idempotencyKey)) return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Refresh this page before recording a cash sale'});
      const requestId=res.getHeader('X-Request-Id');
      const commandInput={...validation.data,idempotencyKey,actor:{userId:req.user!.id,role:req.user!.role as 'owner'|'member'|'admin',
        ...(typeof requestId==='string' && /^[A-Za-z0-9._:-]{1,100}$/.test(requestId)?{requestId}:{})}};
      const command=canonicalCashCommand(commandInput);
      const existing=await storage.getCashSaleByKeyForMerchant(merchantId,idempotencyKey);
      if(existing) {
        if(existing.cashRequestFingerprint!==command.fingerprint) return res.status(409).json({code:'IDEMPOTENCY_CONFLICT',message:'Cash retry details differ from the original sale',transaction:ownerTransactionDto(existing)});
        const persisted=await storage.recordCashSaleForMerchant(merchantId,commandInput,{allowCreate:false});
        if(persisted.kind==='conflict') return res.status(409).json({code:'IDEMPOTENCY_CONFLICT',message:'Cash retry details differ from the original sale',transaction:ownerTransactionDto(persisted.transaction)});
        if(persisted.kind==='not-found') return res.status(503).json({message:'Cash sale is being checked. Retry with the same request'});
        return res.json({transaction:ownerTransactionDto(persisted.transaction),replayed:true});
      }
      if (!(await requireBillingCard(merchantId, res))) return;
      if (stoneId != null) {
        const stone = await storage.getTaptStoneForMerchant(stoneId, merchantId);
        if (!stone || stone.merchantId !== merchantId || !stone.isActive) {
          return res.status(400).json({ message: "Selected payment board is unavailable" });
        }
      }
      const result=await storage.recordCashSaleForMerchant(merchantId,commandInput);
      if(result.kind==='conflict') return res.status(409).json({code:'IDEMPOTENCY_CONFLICT',message:'Cash retry details differ from the original sale',transaction:ownerTransactionDto(result.transaction)});
      if(result.kind==='not-found') return res.status(503).json({message:'Cash sale is being checked. Retry with the same request'});
      const transaction=result.transaction;
      if(result.kind==='reused') return res.json({transaction:ownerTransactionDto(transaction),replayed:true});
      // The atomic cash event is published only by the durable receiver.
      res.json({ transaction: ownerTransactionDto(transaction) });
    } catch (error) {
      if (error instanceof TransactionCreationScopeError) return res.status(400).json({ message: "Selected payment board is unavailable" });
      if(error instanceof CashCommandInputError) return res.status(400).json({message:"Invalid cash sale"});
      logOperation("error","CASH_COMMAND_FAILED",{payload:["[CASH_COMMAND_FAILED]"]});
      res.status(500).json({ message: "Failed to record cash sale" });
    }
  });

  // D13: retain validation/auth/ownership, but no unsupported provider or ledger path.
  app.post("/api/transactions/tap-to-pay", authenticateToken, (req: AuthenticatedRequest, res) => {
    const validation = tapToPayRequestSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ message: "Invalid Tap to Pay request" });
    if (!checkMerchantOwnership(req, validation.data.merchantId)) return res.status(403).json({ message: "Access denied" });
    return res.status(503).json({ code: "TAP_TO_PAY_DISABLED", message: TAP_TO_PAY_UNAVAILABLE });
  });

  app.post("/api/transactions/:id/split", async (req, res) => {
    try {
      const transactionId = strictPositiveIntegerParam(req.params.id);
      if (transactionId === null) return res.status(400).json({ message: "Invalid id" });
      // The per-payment link's rule: a whole number of shares from 2 to 10, nothing else.
      const validation = z.object({
        totalSplits: z.number().int().min(2).max(10),
      }).strict().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Total splits must be between 2 and 10" });
      }
      const { totalSplits } = validation.data;

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction || isTokenAddressedTransaction(transaction)) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      // Splitting is the business's choice for each sale, made when the sale is created.
      if (!transaction.splitEnabled) {
        return res.status(409).json({ message: "This payment cannot be split" });
      }

      const updatedTransaction = await storage.createBillSplit(transactionId, totalSplits);

      if (!updatedTransaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // A board sale's board address; a no-board sale has none to give here.
      const transactionWithUrls = {
        ...updatedTransaction,
        ...boardSaleUrls(updatedTransaction.merchantId!, updatedTransaction.taptStoneId, req),
      };

      res.json(publicTransactionDto(transactionWithUrls));
    } catch (error) {
      if (error instanceof BillSplitConflictError) {
        return res.status(409).json({ message: error.message, code: error.code });
      }
      logOperation("error","ERROR_CREATING_BILL_SPLIT",{payload:["Error creating bill split:",error]});
      res.status(500).json({ message: "Failed to create bill split" });
    }
  });

  // (Removed PATCH /api/transactions/:id/split-enabled, owner decision 2026-09-27: no screen called it;
  // both terminals set splitting when they create the sale.)

  // Get a single split payment by ID (public — needed for customer receipt page)
  app.get("/api/split-payments/:id", async (req, res) => {
    try {
      const splitId = strictPositiveIntegerParam(req.params.id);
      if (splitId === null) return res.status(400).json({ message: "Invalid id" });
      if (isNaN(splitId)) return res.status(400).json({ message: "Invalid split payment ID" });
      const split = await storage.getSplitPaymentById(splitId);
      if (!split) return res.status(404).json({ message: "Split payment not found" });
      const parent = await storage.getTransaction(split.transactionId);
      if (!parent || isTokenAddressedTransaction(parent)) {
        return res.status(404).json({ message: "Split payment not found" });
      }
      res.json(publicSplitPaymentDto(split));
    } catch (error) {
      logOperation("error","ERROR_FETCHING_SPLIT_PAYMENT",{payload:["Error fetching split payment:",error]});
      res.status(500).json({ message: "Failed to fetch split payment" });
    }
  });

  // Cancel transaction — merchant-initiated only (called from the terminal UI)
  app.post("/api/transactions/:id/cancel", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = strictPositiveIntegerParam(req.params.id);
      if (transactionId === null) return res.status(400).json({ message: "Invalid id" });
      // Validated platform admins retain the reviewed platform-wide cancellation permission.
      // Merchant sessions always supply their own tenant at the storage boundary.
      const transaction = req.user?.role === "admin"
        ? await storage.getTransaction(transactionId)
        : await storage.getTransactionForMerchant(transactionId, req.user!.merchantId);

      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Only the owning merchant (or an admin) can cancel — prevents cancelling
      // an arbitrary transaction by guessing its numeric id.
      // Another business's sale is answered as a missing one (P2.2's tenant-safe 404, R1-T3): its 403
      // told a caller which sale numbers exist.
      if (!checkMerchantOwnership(req, transaction.merchantId!)) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      await reconcileBeforeManualChange('retail',transactionId,transaction.merchantId!);
      const cancellation = await storage.cancelTransactionForMerchant(transactionId, transaction.merchantId!,commandActor(req,res));
      if (cancellation.kind === "not-found") {
        return res.status(404).json({ message: "Transaction not found" });
      }
      if (cancellation.kind === "conflict") {
        if (cancellation.reason === "payment-active") return res.status(409).json({
          message: "Payment is in progress or a share is already paid", code: "PAYMENT_ACTIVE",
        });
        return res.status(400).json({ message: `Cannot cancel transaction with status: ${cancellation.status}` });
      }
      const updatedTransaction = cancellation.transaction;

      // A board sale's board address; a no-board sale has none to give here.
      const transactionWithUrls = {
        ...updatedTransaction,
        ...boardSaleUrls(updatedTransaction.merchantId!, updatedTransaction.taptStoneId, req),
      };

      // The committed cancellation event owns delivery and replay protection.
      res.json(ownerTransactionDto(transactionWithUrls));
    } catch (error) {
      logOperation("error","ERROR_CANCELING_TRANSACTION",{payload:["Error canceling transaction:",error]});
      res.status(500).json({ message: "Failed to cancel transaction" });
    }
  });

  // (Removed POST /api/merchants/:merchantId/nfc-pay, owner decision 2026-09-27: no screen called it,
  // and the pending sales it opened could never complete: the NFC completion that faked payments was
  // removed in R0-T5. Tap to Pay is POST /api/transactions/tap-to-pay.)

  // Get NFC payment capabilities for a device
  // R0-T5: capability is what this platform will actually honour, not what the
  // device could theoretically do. This previously derived every field from the
  // User-Agent alone, so a phone was told NFC, Apple Pay and contactless were
  // available while the routes behind them refuse — a fabricated capability.
  // D13 stays false until a reviewed native/provider integration exists.
  // Retired wallet routes cannot establish a capability either.
  app.get("/api/nfc/capabilities", (req, res) => {
    const tapToPayEnabled = TAP_TO_PAY_AVAILABLE;
    res.json({
      nfcSupported: tapToPayEnabled,
      applePay: false,
      googlePay: false,
      samsungPay: false,
      contactlessCard: tapToPayEnabled,
      webNFC: false,
      recommendations: tapToPayEnabled ? [] : ["Use QR code for payment"],
    });
  });

  // Process payment — creates Windcave HPP session and returns redirect URL
  app.post("/api/transactions/:id/pay",retailCheckoutHandlers.session(false));

  // ── Shared helper: finalise a payment (handles split + non-split) ──────────


  // ── Windcave environment info (for frontend Hosted Fields init) ─────────────
  app.get("/api/windcave/env", (_req, res) => {
    // googlePayEnv is independent of Windcave's env — it requires domain registration
    // at console.googlepay.com before switching to "PRODUCTION".
    // Set GOOGLE_PAY_ENV=PRODUCTION once the domain is registered.
    const googlePayEnv = config.wallets.googlePayEnvironment;
    res.json({
      env: getWindcaveEnv(),
      applePayMerchantId: config.windcave.applePayMerchantId || "",
      googlePayMerchantId: config.windcave.googlePayMerchantId || "",
      googlePayEnv,
    });
  });

  // ── Hosted Fields completion — called by frontend after card/Apple Pay submit ─
  app.post("/api/transactions/:id/hosted-fields-complete",retailCheckoutHandlers.complete(false));

  // ── Google Pay completion — backend submits token using server-side cached URL ─
  app.post("/api/transactions/:id/googlepay-complete",retailCheckoutHandlers.complete(false,true));

  // Get single transaction details
  app.get("/api/transactions/:id", async (req, res) => {
    try {
      const transactionId = strictPositiveIntegerParam(req.params.id);
      if (transactionId === null) return res.status(400).json({ message: "Invalid id" });
      const transaction = await storage.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      if (isTokenAddressedTransaction(transaction)) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // The business's details come with its sale (owner decision 2026-09-26).
      const merchant = transaction.merchantId == null ? undefined : await storage.getMerchant(transaction.merchantId);
      res.json({ ...publicTransactionDto(transaction), merchant: merchant ? publicBusinessDto(merchant) : null });
    } catch (error) {
      logOperation("error","ERROR_FETCHING_TRANSACTION",{payload:["Error fetching transaction:",error]});
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  });

  // Generate PDF receipt
  app.post("/api/transactions/:id/receipt-pdf", async (req, res) => {
    try {
      const transactionId = strictPositiveIntegerParam(req.params.id);
      if (transactionId === null) return res.status(400).json({ message: "Invalid id" });
      const splitIdParam = req.query.splitId
        ? strictPositiveIntegerQueryParam(req.query.splitId as string)
        : null;
      if (req.query.splitId && splitIdParam === null) {
        return res.status(400).json({ message: "Invalid splitId" });
      }
      const transaction = await storage.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      if (isTokenAddressedTransaction(transaction)) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // For split receipts, allow generating PDF for individual completed splits
      // For full receipts, require the whole transaction to be completed
      let splitInfo: { amount: string; splitNumber: number; totalSplits: number } | undefined;
      if (splitIdParam) {
        const split = await storage.getSplitPaymentById(splitIdParam);
        if (
          !split ||
          split.transactionId !== transactionId ||
          split.status !== "completed"
        ) {
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
      logOperation("error","ERROR_GENERATING_PDF_RECEIPT",{payload:["Error generating PDF receipt:",error]});
      res.status(500).json({ message: "Failed to generate PDF receipt" });
    }
  });

  // Generate QR code linking to receipt page (public — customer scans on their own device)
  app.get("/api/transactions/:id/receipt-qr", async (req, res) => {
    try {
      const transactionId = strictPositiveIntegerParam(req.params.id);
      if (transactionId === null) return res.status(400).json({ message: "Invalid id" });
      if (isNaN(transactionId)) {
        return res.status(400).json({ message: "Invalid transaction ID" });
      }

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      if (isTokenAddressedTransaction(transaction)) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      const size = strictBoundedIntegerQueryParam(req.query.size, { fallback: 300, max: 800 });
      if (size === null) return res.status(400).json({ message: "Invalid size" });
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
      logOperation("error","RECEIPT_QR_GENERATION_ERROR",{payload:["Receipt QR generation error:",error]});
      res.status(500).json({ message: "Failed to generate receipt QR code" });
    }
  });

  // (Removed GET /api/merchants/:id/analytics, owner decision 2026-09-27: no screen called it; the
  // analytics screens work from the business's sales list.)

  // (Removed GET /api/merchants/:id/revenue-over-time, owner decision 2026-09-27: no screen called it;
  // the revenue charts are drawn from the business's sales list.)

  // (Removed GET /api/merchants/:id/analytics/export, owner decision 2026-09-27: only a page mounted
  // nowhere called it.)

  // (Removed GET /api/merchants/:id/export/csv, owner decision 2026-09-27: only a page mounted nowhere
  // called it; the phone's Transactions page builds its CSV and Xero CSV itself.)

  // Export business report as PDF
  app.get("/api/merchants/:id/export/pdf", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
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
      logOperation("error","ERROR_GENERATING_PDF_REPORT",{payload:["Error generating PDF report:",error]});
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  // ======================
  // Admin manual merchant verification (mark as verified directly)
  app.post("/api/admin/merchants/:id/verify", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // A state conflict (P2.2, R1-T3): 409, where it was 400.
      if (merchant.status === 'verified') {
        return res.status(409).json({ message: "Merchant is already verified" });
      }
      // The business page offers Verify only for a waiting application (owner decision
      // 2026-09-26, C10 batch 4): an active business is never set back to verified.
      if (merchant.status !== 'pending') {
        return res.status(409).json({ message: "Only a waiting application can be verified" });
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
      logOperation("error","ADMIN_VERIFICATION_ERROR",{payload:["Admin verification error:",error]});
      res.status(500).json({ message: "Failed to verify merchant" });
    }
  });

  // Admin set merchant status to 'active' (Windcave onboarding complete)
  app.post("/api/admin/merchants/:id/set-active", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      if (merchant.status === 'active') return res.status(409).json({ message: "Merchant is already active" }); // P2.2 (R1-T3): was 400
      // The business page offers Activate Account only for a verified business (owner decision
      // 2026-09-26, C10 batch 4): an application is never made active before it is confirmed.
      if (merchant.status !== 'verified') {
        return res.status(409).json({ message: "Only a verified business can be activated" });
      }

      const updated = await storage.updateMerchantStatus(merchantId, 'active');
      if (!updated) return res.status(500).json({ message: "Failed to activate merchant" });

      res.json({ message: "Merchant activated successfully", merchant: { id: updated.id, status: updated.status } });
    } catch (error) {
      logOperation("error","ADMIN_ACTIVATE_MERCHANT_ERROR",{payload:["Admin activate merchant error:",error]});
      res.status(500).json({ message: "Failed to activate merchant" });
    }
  });

  app.get("/api/admin/merchants/:id/transactions", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const txList = await storage.getTransactionsByMerchant(merchantId);
      res.json(txList.map(adminTransactionDto));
    } catch (error) {
      logOperation("error","ADMIN_FETCH_TRANSACTIONS_ERROR",{payload:["Admin fetch transactions error:",error]});
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Update Windcave Merchant ID (admin only)
  app.patch("/api/admin/merchants/:id/windcave-merchant-id", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const { windcaveMerchantId } = req.body;
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      await storage.updateMerchant(merchantId, { windcaveMerchantId: windcaveMerchantId || null });
      res.json({ message: "Windcave Merchant ID updated" });
    } catch (error) {
      logOperation("error","WINDCAVE_MERCHANT_ID_UPDATE_ERROR",{payload:["Windcave merchant ID update error:",error]});
      res.status(500).json({ message: "Failed to update Windcave Merchant ID" });
    }
  });

  // Admin manual merchant activation with password (bypass email verification)
  app.post("/api/admin/merchants/:id/activate", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password is required for activation" });
      }
      // The rule every new password meets (owner decision 2026-09-23).
      const checked = newPasswordSchema.safeParse(password);
      if (!checked.success) {
        return res.status(400).json({ message: checked.error.issues[0]?.message });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      if (merchant.status === 'verified') {
        return res.status(409).json({ message: "Merchant already verified" }); // P2.2 (R1-T3): was 400
      }
      // The application is found by its own sign-up token, so there must be one: asked for
      // '' (none), verifyMerchant would set the password of whichever business held an empty
      // token, not this one (C10 batch 4).
      if (!merchant.verificationToken) {
        return res.status(409).json({ message: "This business has no waiting application to activate" });
      }

      const passwordHash = await bcrypt.hash(checked.data, 12);
      const updatedMerchant = await storage.verifyMerchant(merchant.verificationToken, passwordHash);

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
      logOperation("error","ADMIN_ACTIVATION_ERROR",{payload:["Admin activation error:",error]});
      res.status(500).json({ message: "Failed to activate merchant" });
    }
  });

  // (Removed PUT /api/merchants/:id/rates, owner decision 2026-09-27: it answered 410 since
  // processing rates stopped mattering (TaptPay is a monthly subscription), and no screen called it.)

  // Update merchant business details
  app.put("/api/merchants/:id/details", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!checkAccountOwnership(req, merchantId)) {
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

      res.json(ownerMerchantDto(updatedMerchant));
    } catch (error) {
      res.status(500).json({ message: "Failed to update merchant details" });
    }
  });

  // Update merchant bank account details
  // Change merchant password
  app.put("/api/merchants/:id/change-password", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      // R1-T3: the path id is a precondition, never a selector. Only the caller's
      // own login is changed below, but a path id naming someone else must still
      // be refused rather than ignored.
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      // The platform admin has no login here to change (C10 batch 6): refused as sign-out
      // everywhere refuses it, not left to fail later for want of a login id.
      if (req.user?.role === "admin") {
        return res.status(403).json({ message: "Only a TaptPay login can do this." });
      }
      const validation = changePasswordSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0]?.message ?? "Validation failed",
          errors: validation.error.errors,
        });
      }

      const { currentPassword, newPassword } = validation.data;

      // Change the password of the signed-in login, not the merchant record: on a
      // multi-seat plan a teammate must be able to change their own password
      // without touching the owner's.
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userRow = await storage.getUserById(userId);
      if (!userRow) {
        return res.status(404).json({ message: "Login not found" });
      }

      // R1-T4 phase C: this is a password check too. Unlimited, someone holding a
      // stolen session could guess the password here, then change it. Counted per
      // login and slowed down like sign-in.
      const throttleBucket = passwordChangeBucket(userId);
      const slot = await storage.takeAuthThrottleSlot([throttleBucket], new Date());
      if (!slot.allowed) {
        logSecurityEvent('PASSWORD_CHANGE_SLOWED', { userId });
        return refuseTooManyAttempts(res, slot.retryAfterMs, "sign-in");
      }
      let currentPasswordValid: boolean;
      try {
        currentPasswordValid = await bcrypt.compare(currentPassword, userRow.password);
      } catch (error) {
        await storage.settleAuthThrottle([throttleBucket], "void", new Date()).catch(() => undefined);
        throw error;
      }
      if (!currentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      await storage.settleAuthThrottle([throttleBucket], "success", new Date())
        .catch((error) => logOperation("error","PASSWORD_CHANGE_THROTTLE_CLEAR",{payload:["[PASSWORD_CHANGE_THROTTLE_CLEAR]",error]}));

      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      // Also ends every session of this login (R1-T4 phase D, owner decision
      // 2026-09-22): this device carries on under the new session below.
      const updated = await storage.updateUserPassword(userId, newPasswordHash);

      if (!updated) {
        return res.status(500).json({ message: "Failed to update password" });
      }
      sseBroker.disconnectUser(merchantId, userId);
      // Every device of this login stops getting notifications; this one
      // re-registers under the new session (client/src/lib/push-device.ts).
      await storage.deactivatePushSubscriptionsForLogin(merchantId, userId)
        .catch((error) => logOperation("error","PASSWORD_CHANGE_PUSH_STOP",{payload:["[PASSWORD_CHANGE_PUSH_STOP]",error]}));
      const login = sessionLoginForUserRow(updated);
      if (!login) {
        return res.status(500).json({ message: "Password changed. Please sign in again." });
      }
      // R1-T4 phase E: the change advanced the version, which ends every session of this login,
      // this one included (recorded on each); this device carries on under a new session.
      await endLoginSessions(userId, "password_change")
        .catch((error) => logOperation("error","PASSWORD_CHANGE_SESSIONS",{payload:["[PASSWORD_CHANGE_SESSIONS]",error]}));
      const session = await startBusinessSession(req, res, login);

      res.set("Cache-Control", "no-store");
      res.json({ message: "Password updated successfully", csrfToken: session.csrfToken });

    } catch (error) {
      logOperation("error","CHANGE_PASSWORD_ERROR",{payload:["Change password error:",error]});
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // (Removed PUT /api/merchants/:id/bank-account, owner decision 2026-09-27: it answered 410 since
  // bank details stopped being collected, and no screen called it.)

  app.put("/api/merchants/:id/theme", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      // Owner-only by default (R1-T3 safe default) — a teammate can use the
      // terminal but does not get to change the account's branding.
      if (!checkAccountOwnership(req, merchantId)) {
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

      res.json(ownerMerchantDto(updatedMerchant));
    } catch (error) {
      logOperation("error","ERROR_UPDATING_THEME",{payload:["Error updating theme:",error]});
      res.status(500).json({ message: "Failed to update theme" });
    }
  });

  // Update merchant daily goal
  app.put("/api/merchants/:id/daily-goal", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });

      // Owner-only by default (R1-T3 safe default) — a target for the whole
      // account is a billing/reporting decision, not a terminal-operator one.
      if (!checkAccountOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const validation = updateDailyGoalSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({ message: "Invalid daily goal", errors: validation.error.errors });
      }

      const updatedMerchant = await storage.updateMerchantSettings(merchantId, { kind: "daily-goal", dailyGoal: validation.data.dailyGoal });

      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(ownerMerchantDto(updatedMerchant));
    } catch (error) {
      logOperation("error","ERROR_UPDATING_DAILY_GOAL",{payload:["Error updating daily goal:",error]});
      res.status(500).json({ message: "Failed to update daily goal" });
    }
  });

  // Update merchant (general purpose endpoint for merchant-editable fields only)
  app.put("/api/merchants/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });

      // KYC, processor credentials and account details belong to the owner.
      if (!checkAccountOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // Validation schema for allowed merchant updates
      const updateSchema = z.object({
        businessName: z.string().optional(),
        director: z.string().optional(),
        address: z.string().optional(),
        nzbn: z.string().optional(),
        phone: z.string().optional(),
        gstNumber: z.string().optional(),
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

      const updatedMerchant = await storage.updateMerchantSettings(merchantId, { kind: "profile", changes: filteredUpdates });
      if (!updatedMerchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json(ownerMerchantDto(updatedMerchant));
    } catch (error) {
      logOperation("error","UPDATE_MERCHANT_ERROR",{payload:["Update merchant error:",error]});
      res.status(500).json({ message: "Failed to update merchant" });
    }
  });

  // Upload merchant logo
  //
  // UPL-1 (R1-T3 domain 5): authorization must run BEFORE multer parses/
  // buffers the multipart body — the plan's uploads text is explicit that
  // "the logo upload route must not accept or write a file before merchant
  // ownership is known." This small middleware does exactly the id-parse +
  // checkAccountOwnership check the handler used to do internally, but ahead
  // of the upload (`receiveUpload(logoUpload, 'logo')`) in the chain, so an unauthorized caller's
  // body is never handed to multer at all. The handler keeps its own
  // (now-redundant) re-check below as defense in depth; it never changes
  // this route's outcome for a legitimate caller.
  const requireLogoOwnership = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const merchantId = strictPositiveIntegerParam(req.params.id);
    if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
    if (!checkAccountOwnership(req, merchantId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    next();
  };
  app.post("/api/merchants/:id/logo", authenticateToken, requireLogoOwnership, receiveUpload(logoUpload, 'logo'), async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });

      // Owner-only by default (R1-T3 safe default) — branding, like theme.
      // logoUpload is multer.memoryStorage() (see its definition above): a
      // rejected upload was never written to disk, so there is nothing to
      // unlink — req.file.path is always undefined here and calling
      // fs.unlinkSync on it threw, turning every rejection of this check
      // into a 500 instead of the intended 403.
      // Re-checked here even though requireLogoOwnership above already
      // enforced it — cheap, and keeps this handler correct on its own if
      // ever reordered again.
      if (!checkAccountOwnership(req, merchantId)) {
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

      // UPL-5: hardcode .png rather than deriving it from the client-supplied
      // req.file.originalname — this route already only accepts PNG bytes
      // (verified above by magic-byte check) and always stores mimeType
      // 'image/png', so a client-controlled extension here served no purpose
      // except letting a re-upload under a different original filename write
      // to a new path and orphan the previous blob (old path stays servable
      // forever, unreferenced by the merchant's customLogoUrl).
      const filename = `merchant-${merchantId}.png`;
      const logoUrl = `/uploads/logos/${filename}`;

      // Persist the file first so the merchant row never points at a missing file
      await saveUploadedFile(`logos/${filename}`, 'image/png', req.file.buffer, merchantId);

      const updatedMerchant = await storage.updateMerchantLogoUrl(merchantId, logoUrl);
      if (!updatedMerchant) {
        await storage.deleteUploadedFile(`logos/${filename}`, merchantId);
        return res.status(404).json({ message: "Merchant not found" });
      }

      res.json({ logoUrl, message: "Logo uploaded successfully" });
    } catch (error) {
      logOperation("error","LOGO_UPLOAD_ERROR",{payload:["Logo upload error:",error]});
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // Delete merchant logo
  app.delete("/api/merchants/:id/logo", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });

      // Owner-only by default (R1-T3 safe default) — branding, like theme.
      if (!checkAccountOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Remove the stored blob — logos uploaded through POST /logo live in
      // uploaded-file storage, not on disk; without this the row was
      // orphaned (unreachable from the merchant record, but still served
      // forever at its old public /uploads URL). Disk is only a fallback
      // for a legacy file that predates DB-backed storage.
      if (merchant.customLogoUrl) {
        const relPath = merchant.customLogoUrl.replace(/^\/uploads\//, "");
        // Tenant-scoped (gap 13): removes the blob only if this merchant owns it,
        // so a customLogoUrl that points at another tenant's file cannot delete it.
        await storage.deleteUploadedFile(relPath, merchantId);

        const filepath = path.join(process.cwd(), merchant.customLogoUrl);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }

      // Remove logo URL from database
      const updatedMerchant = await storage.updateMerchantLogoUrl(merchantId, null);

      res.json({ message: "Logo deleted successfully" });
    } catch (error) {
      logOperation("error","LOGO_DELETION_ERROR",{payload:["Logo deletion error:",error]});
      res.status(500).json({ message: "Failed to delete logo" });
    }
  });

  // Get all transactions for merchant (for dashboard)
  app.get("/api/merchants/:id/transactions", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const transactions = await storage.getTransactionsByMerchant(merchantId);
      res.json(transactions.map(ownerTransactionDto));
    } catch (error) {
      res.status(500).json({ message: "Failed to get transactions" });
    }
  });

  // Tapt Stone API routes

  // Get all tapt stones for a merchant
  app.get("/api/merchants/:id/tapt-stones", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const stones = await storage.getTaptStonesByMerchant(merchantId);
      res.json(stones);
    } catch (error) {
      logOperation("error","ERROR_FETCHING_TAPT_STONES",{payload:["Error fetching tapt stones:",error]});
      res.status(500).json({ message: "Failed to get tapt stones" });
    }
  });

  // Create a new tapt stone
  app.post("/api/merchants/:id/tapt-stones", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if merchant exists
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      /* An optional name lets the client create and name a board in one call.
         Omitted or blank falls back to the auto "Stone N" name, so existing
         callers that POST an empty body are unaffected. */
      const rawName = (req.body as { name?: unknown } | undefined)?.name;
      if (rawName !== undefined && typeof rawName !== "string") {
        return res.status(400).json({ message: "Board name must be a string" });
      }
      const requestedName = typeof rawName === "string" ? rawName.trim() : "";
      if (requestedName.length > 60) {
        return res.status(400).json({ message: "Board name must be 60 characters or fewer" });
      }

      const newStone = await storage.createNextTaptStone(merchantId, requestedName || undefined);

      // Generate QR code and payment URL for the new stone
      const baseUrl = getBaseUrl(req);
      const stoneId = Number(newStone.id); // Ensure it's a number
      const qrCodeUrl = generateQrCodeUrl(merchantId, stoneId);
      const paymentUrl = generatePaymentUrl(merchantId, stoneId);

      // Update the stone with the URLs
      const updatedStone = await storage.updateTaptStoneUrlsForMerchant(newStone.id, merchantId, qrCodeUrl, paymentUrl);

      res.json(updatedStone ?? newStone);
    } catch (error) {
      if (error instanceof TaptStoneCapacityError) {
        return res.status(400).json({ message: error.message, code: error.code });
      }
      if (error instanceof TaptStoneConflictError) {
        return res.status(409).json({ message: error.message, code: error.code });
      }
      logOperation("error","ERROR_CREATING_TAPT_STONE",{payload:["Error creating tapt stone:",error]});
      res.status(500).json({ message: "Failed to create tapt stone" });
    }
  });

  // Update a tapt stone name
  app.put("/api/merchants/:merchantId/tapt-stones/:stoneId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.merchantId);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const stoneId = strictPositiveIntegerParam(req.params.stoneId);
      if (stoneId === null) return res.status(400).json({ message: "Invalid id" });
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Valid stone name is required" });
      }
      // The rule creating a board uses (C10 batch 6).
      if (name.trim().length > 60) {
        return res.status(400).json({ message: "Board name must be 60 characters or fewer" });
      }

      // Scope both the read and the later write to the authorized business.
      const existingStone = await storage.getTaptStoneForMerchant(stoneId, merchantId);
      if (!existingStone) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      const updatedStone = await storage.updateTaptStoneForMerchant(stoneId, merchantId, { name: name.trim() });

      if (!updatedStone) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      res.json(updatedStone);
    } catch (error) {
      logOperation("error","ERROR_UPDATING_TAPT_STONE",{payload:["Error updating tapt stone:",error]});
      res.status(500).json({ message: "Failed to update tapt stone" });
    }
  });

  // Delete a tapt stone
  app.delete("/api/merchants/:merchantId/tapt-stones/:stoneId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.merchantId);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      if (!checkMerchantOwnership(req, merchantId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const stoneId = strictPositiveIntegerParam(req.params.stoneId);
      if (stoneId === null) return res.status(400).json({ message: "Invalid id" });

      // Scope both the read and the later write to the authorized business.
      const existingStone = await storage.getTaptStoneForMerchant(stoneId, merchantId);
      if (!existingStone) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      const success = await storage.deleteTaptStoneForMerchant(stoneId, merchantId);

      if (!success) {
        return res.status(404).json({ message: "Tapt stone not found" });
      }

      res.json({ message: "Tapt stone deleted successfully" });
    } catch (error) {
      logOperation("error","ERROR_DELETING_TAPT_STONE",{payload:["Error deleting tapt stone:",error]});
      res.status(500).json({ message: "Failed to delete tapt stone" });
    }
  });

  // (Removed unauthenticated legacy DELETE /api/tapt-stones/:id — it let anyone
  // delete any merchant's stone by id. Clients use the authenticated, ownership-checked
  // /api/merchants/:merchantId/tapt-stones/:stoneId route.)
  // (Removed GET /api/tapt-stones/:id, owner decision 2026-09-26: nothing called it, and
  // counting through its sequential ids listed every board of every business.)

  // (Removed GET /api/admin/subscription-revenue, owner decision 2026-09-26: no screen called it;
  // the overview gets the same figures from GET /api/admin/analytics.)

  // Provider hints are durably committed before ACK; only the shared worker settles.
  app.all("/api/windcave/notification",...durableNotificationHandlers);

  // Windcave callback — customer browser redirected here after paying on HPP
  app.get("/api/windcave/callback",retailCheckoutHandlers.numericReturn);

  // (Removed GET /api/windcave/status, owner decision 2026-09-26: nothing called it, and it
  // told anyone whether payments were on, the provider's endpoint and its setting names.)

  // Admin Analytics endpoint
  app.get("/api/admin/analytics", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // Get all merchants from storage
      const merchants = await storage.getAllMerchants();

      let totalRevenue = 0;
      let totalTransactions = 0;
      let totalCompletedTransactions = 0;
      // What the admin home page shows (owner decision 2026-09-30): sales still waiting, and how many
      // businesses' figures could not be read, so the totals never pass off a missing business as nothing.
      let pendingTransactions = 0;
      let businessesNotLoaded = 0;
      const recentMerchants = [];

      for (const merchant of merchants) {
        try {
          const analytics = await storage.getMerchantAnalytics(merchant.id);
          const transactions = await storage.getTransactionsByMerchant(merchant.id);

          totalRevenue += analytics.totalRevenue || 0;
          totalTransactions += analytics.totalTransactions || 0;
          totalCompletedTransactions += analytics.completedTransactions || 0;
          pendingTransactions += transactions.filter(t => t.status === 'pending').length;

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
          // Its figures could not be read: left out of the totals, and counted as left out.
          businessesNotLoaded += 1;
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
      // Platform revenue is subscription MRR, not a cut of merchant turnover.
      const subscriptionRevenue = await storage.getSubscriptionRevenue();

      res.json({
        totalMerchants: merchants.length,
        activeMerchants,
        totalRevenue,
        totalTransactions,
        completedTransactions: totalCompletedTransactions,
        pendingTransactions,
        businessesNotLoaded,
        monthlyRecurringRevenue: subscriptionRevenue.monthlyRecurringRevenue,
        payingSubscriptions: subscriptionRevenue.payingSubscriptions,
        recentMerchants: recentMerchants.sort((a, b) => b.totalRevenue - a.totalRevenue),
      });
    } catch (error) {
      logOperation("error","ERROR_FETCHING_ADMIN_ANALYTICS",{payload:["Error fetching admin analytics:",error]});
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
      logOperation("error","ERROR_FETCHING_REVENUE_OVER_TIME",{payload:["Error fetching revenue over time:",error]});
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
      logOperation("error","ERROR_FETCHING_PAYMENT_METHOD_BREAKDOWN",{payload:["Error fetching payment method breakdown:",error]});
      res.status(500).json({ message: "Failed to get payment methods" });
    }
  });

  // GA4 detailed metrics — chart + countries (range: 7d | 14d | 30d | all)
  app.get("/api/admin/ga4-detailed", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    const propertyId = config.analytics.propertyId;
    const serviceAccountRaw = config.analytics.serviceAccount;
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
      logOperation("error","GA4_DETAILED_ERROR",{payload:["GA4 detailed error:",error?.message]});
      res.status(500).json({ configured: true, error: 'Analytics request failed' });
    }
  });

  // GA4 metrics for admin portal
  app.get("/api/admin/ga4-metrics", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    const propertyId = config.analytics.propertyId;
    const serviceAccountRaw = config.analytics.serviceAccount;

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
      logOperation("error","GA4_API_ERROR",{payload:["GA4 API error:",error?.message]});
      res.status(500).json({ configured: true, error: 'Analytics request failed' });
    }
  });

  // (Removed POST /api/admin/merchants, owner decision 2026-09-26: a stub answering 410 since the
  // older POST /api/admin/merchants-old was removed; that one used a hardcoded admin email check and
  // created merchants with a literal "tempPassword". The admin sign-up it pointed to is removed too.)

  // (Removed PUT /api/admin/merchants/:id, owner decision 2026-09-26: no screen called it, and it
  // stored the contact details it was sent with no schema.)

  // (Removed POST /api/merchants/:id/test-payment-link, owner decision 2026-09-26: it answered
  // 410 for the business-wide no-board link retired on 2026-09-25, and no screen called it.)

  // Get all merchants for admin
  app.get("/api/admin/merchants", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchants = await storage.getAllMerchants();
      res.json(merchants.map(adminMerchantSummaryDto));
    } catch (error) {
      logOperation("error","ERROR_FETCHING_MERCHANTS",{payload:["Error fetching merchants:",error]});
      res.status(500).json({ message: "Failed to fetch merchants" });
    }
  });

  app.get("/api/admin/merchants/:id", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.id);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }
      res.json(adminMerchantDto(merchant));
    } catch (error) {
      logOperation("error","ERROR_FETCHING_MERCHANT",{payload:["Error fetching merchant:",error]});
      res.status(500).json({ message: "Failed to fetch merchant" });
    }
  });

  // (Removed DELETE /api/admin/merchants/:id, owner decision 2026-09-26: no screen called it,
  // and the database refused every business the app makes (its subscription row and owner login
  // point at it), so it could only answer 500: scripts/verify-admin-business-delete-postgres.ts.)

  // (Removed POST /api/admin/clear-merchants, owner decision 2026-09-26: a debugging leftover
  // with three email addresses written in; it deleted from the in-memory storage only.)

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
        return res.status(409).json({ message: "Merchant is already verified" }); // P2.2 (R1-T3): was 400
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
      logOperation("error","ERROR_RESENDING_VERIFICATION_EMAIL",{payload:["Error resending verification email:",error]});
      res.status(500).json({ message: "Failed to resend verification email" });
    }
  });

  // (Removed POST /api/admin/test-email, owner decision 2026-09-26: no screen called it, and a
  // failure answered with the email provider's own error. The email status below stays.)

  // Email configuration diagnostics — confirms at a glance whether auto-emails
  // (verification, admin notifications) can actually be delivered in this env.
  app.get("/api/admin/email-status", authenticateAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { getEmailServiceStatus } = await import('./email-service-multi');
      const status = getEmailServiceStatus();
      res.json({
        ...status,
        nodeEnv: config.appEnv,
        fromAddress: config.email.fromEmail,
        adminNotifyConfigured: !!(config.admin.email || config.admin.notifyEmail),
        // In production with no real provider, emails are NOT delivered (and no
        // longer silently "simulated" as success).
        willDeliver: status.availableProviders.length > 0,
      });
    } catch (error) {
      logOperation("error","EMAIL_STATUS_ERROR",{payload:['Email status error:',error]});
      res.status(500).json({ message: 'Failed to read email status' });
    }
  });

  // NOTE: The former /api/debug/* routes (sync-merchants, auth-users, test-password,
  // fix-auth-user) were removed. They were unauthenticated and dangerous: fix-auth-user
  // was an account-takeover backdoor (set a merchant's login password to "123456"),
  // test-password was a bcrypt oracle, and auth-users leaked account existence.
  // Merchant auth sync now happens automatically on verification; use the admin-gated
  // endpoints for any operational needs.

  // (Removed POST /api/merchants/verify and GET /api/merchants/:id/email-status, owner
  // decision 2026-09-26. Nothing called the first: it confirmed an application with its
  // emailed link and a password of the caller's choosing, which the 2026-09-23 rule forbids.
  // The second served only the old /business-details page, removed with it, and told
  // anyone which business numbers exist and which had confirmed their email.)

  // Confirm email via token (public signup flow)
  // Confirms a sign-up's email. Owner decision 2026-09-23: the link alone no longer
  // does. Anyone can start an application with any address and choose its password;
  // the address's owner, who holds only the emailed link, must not be led to confirm a
  // stranger's application. The person who applied knows the password they chose.
  app.post("/api/auth/confirm-email", async (req, res) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!token) return res.status(400).json({ message: "Token is required" });

      const merchant = await storage.getMerchantByToken(token);
      if (!merchant) return res.status(400).json({ message: "Invalid or expired verification token" });
      if (!merchant.passwordHash) {
        return res.status(400).json({
          code: "NO_PASSWORD_CHOSEN",
          message: "This application can't be confirmed online. Please email support@taptpay.co.nz and we'll help.",
        });
      }
      const bucket = confirmEmailBucket(token);
      const slot = await storage.takeAuthThrottleSlot([bucket], new Date());
      if (!slot.allowed) return refuseTooManyAttempts(res, slot.retryAfterMs, "sign-in");
      let chosen: boolean;
      try {
        chosen = await bcrypt.compare(password, merchant.passwordHash);
      } catch (error) {
        await storage.settleAuthThrottle([bucket], "void", new Date()).catch(() => undefined);
        throw error;
      }
      if (!chosen) {
        return res.status(400).json({
          code: "WRONG_PASSWORD",
          message: "That isn't the password chosen when this application was made.",
        });
      }
      await storage.settleAuthThrottle([bucket], "success", new Date())
        .catch((error) => logOperation("error","CONFIRM_EMAIL_THROTTLE_CLEAR",{payload:["[CONFIRM_EMAIL_THROTTLE_CLEAR]",error]}));

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

      // Promote the merchant and its pending subscription atomically. The
      // subscription becomes eligible for card activation at the same moment
      // the account becomes eligible to sign in.
      const confirmedMerchant = await storage.confirmMerchantEmail(
        token,
        hasCompleteApplication,
      );
      if (!confirmedMerchant) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

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
          from: config.email.fromEmail,
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
          logOperation("error","SIGNUP_NOTIFY_FAILED_TO_SEND_VERIFIED_APPLICATION_FOR_MERCHANT_T",{payload:[`[SIGNUP_NOTIFY] Failed to send verified application for merchant ${merchant.id} to oliver@taptpay.co.nz`]});
        }
      }

      res.json({ message: "Email verified", merchantId: merchant.id });
    } catch (error) {
      logOperation("error","CONFIRM_EMAIL_ERROR",{payload:["Confirm email error:",error]});
      res.status(500).json({ message: "Failed to confirm email" });
    }
  });

  // Resend confirmation email (public — for check-email screen)
  // Resends a sign-up's confirmation link, asked by address. Owner decision 2026-09-23: the
  // same answer, after the same wait, whether or not an application is waiting; only a
  // waiting one is sent its own link. Limited per address asked, whether it exists or not,
  // so a refusal says nothing about it either. Asking by account number was removed on
  // 2026-09-26 (owner decision): anyone could resend any waiting link by counting.
  app.post("/api/auth/resend-confirmation", async (req, res) => {
    const startedAt = replyStart();
    try {
      const byEmail = forgotPasswordSchema.safeParse({ email: req.body?.email });
      if (!byEmail.success) return res.status(400).json({ message: "Enter the email address you signed up with." });
      const asked = { email: byEmail.data.email.trim().toLowerCase() };

      const slot = await storage.takeAuthThrottleSlot([confirmationResendBucket(asked)], new Date());
      if (!slot.allowed) return refuseTooManyAttempts(res, slot.retryAfterMs, "confirmation-resend");

      const merchant = await storage.getMerchantByEmail(asked.email);
      if (merchant && !merchant.emailVerified && merchant.verificationToken) {
        const { sendMerchantVerificationEmail } = await import('./email-service-multi');
        const { getBaseUrl } = await import('./url-utils');
        await sendMerchantVerificationEmail(merchant.email, merchant.verificationToken, merchant.name, getBaseUrl(req));
      }

      const worked = await replyNoSoonerThan(startedAt, ACCOUNT_EMAIL_REPLY_FLOOR_MS);
      if (worked > ACCOUNT_EMAIL_REPLY_FLOOR_MS) {
        logOperation("warn","CONFIRMATION_RESEND_SLOW_TOOK_MS_OVER_THE_MS_FLOOR",{payload:[`[CONFIRMATION_RESEND_SLOW] took ${Math.round(worked)} ms, over the ${ACCOUNT_EMAIL_REPLY_FLOOR_MS} ms floor`]});
      }
      res.json({ message: "If that address is waiting to be confirmed, we've sent the link again." });
    } catch (error) {
      logOperation("error","RESEND_CONFIRMATION_ERROR",{payload:["Resend confirmation error:",error]});
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
      const leadNotifyEmail = config.admin.email;
      if (leadNotifyEmail) sendEmail({
        to: leadNotifyEmail,
        from: 'noreply@taptpay.co.nz',
        subject: `New info pack request from ${(name || '').replace(/[\r\n]/g, '')}`,
        html: `<p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p><p>They have just unlocked the TaptPay info pack on taptpay.co.nz/info.</p>`,
        text: `New info pack request\n\nName: ${name}\nEmail: ${email}\n\nThey have just unlocked the TaptPay info pack on taptpay.co.nz/info.`,
      }).then((ok) => {
        if (!ok) logOperation("error","INFO_PACK_LEAD_NOTIFICATION_FAILED_RESEND_RETURNED_FALSE",{payload:["Info pack lead notification failed: Resend returned false"]});
        else logOperation("info","INFO_PACK_LEAD_NOTIFICATION_SENT_FOR",{payload:[`✅ Info pack lead notification sent for ${email}`]});
      }).catch((e) => logOperation("error","INFO_PACK_LEAD_NOTIFICATION_ERROR",{payload:["Info pack lead notification error:",e]}));

      return res.status(201).json({ id: lead.id });
    } catch (error) {
      logOperation("error","ERROR_SAVING_INFO_PACK_LEAD",{payload:["Error saving info pack lead:",error]});
      return res.status(500).json({ message: "Failed to save lead" });
    }
  });

  // The one answer sign-up gives a valid request, new address or not, never sooner than
  // SIGN_UP_REPLY_FLOOR_MS after it began (owner decision 2026-09-23). It carries no
  // account number: the confirmation page asks by address.
  async function replyToSignup(res: express.Response, startedAt: number) {
    const worked = await replyNoSoonerThan(startedAt, SIGN_UP_REPLY_FLOOR_MS);
    if (worked > SIGN_UP_REPLY_FLOOR_MS) {
      logOperation("warn","SIGNUP_SLOW_TOOK_MS_OVER_THE_MS_FLOOR",{payload:[`[SIGNUP_SLOW] took ${Math.round(worked)} ms, over the ${SIGN_UP_REPLY_FLOOR_MS} ms floor`]});
    }
    return res.json({ message: "Check your email to continue." });
  }

  app.post("/api/merchants/signup", async (req, res) => {
    const startedAt = replyStart();
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
        planId,
        password,
        confirmPassword,
      } = validation.data;

      const normalizedEmail = email.trim().toLowerCase();
      // Hashed whichever way this goes, so both ways do the same work.
      const passwordHash = await bcrypt.hash(password, 12);
      const [existingMerchant, existingLogin] = await Promise.all([
        storage.getMerchantByEmail(normalizedEmail),
        storage.getUserByEmail(normalizedEmail),
      ]);
      const { getBaseUrl } = await import('./url-utils');
      const baseUrl = getBaseUrl(req);
      if (existingMerchant || existingLogin) {
        // Owner decision 2026-09-23: answered exactly as a new address is, so the form
        // never says which addresses have accounts. The address's owner is mailed a
        // note instead of a second application: a few, then slowed down, silently.
        const slot = await storage.takeAuthThrottleSlot([signupNoticeBucket(normalizedEmail)], new Date());
        if (slot.allowed) {
          const { sendExistingAccountNoticeEmail } = await import('./email-service-multi');
          await sendExistingAccountNoticeEmail(normalizedEmail, baseUrl);
        }
        return replyToSignup(res, startedAt);
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Create a pending merchant with the complete stepper application. Access
      // remains blocked until the email confirmation link is used.
      const merchant = await storage.createMerchantWithSignup({
        name,
        businessName,
        businessType,
        email: normalizedEmail,
        phone,
        address: businessAddress,
        password,
        confirmPassword,
        verificationToken,
        passwordHash,
        planId,
        contactEmail: normalizedEmail,
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

      // Send verification email
      const { sendMerchantVerificationEmail } = await import('./email-service-multi');
      const emailSent = await sendMerchantVerificationEmail(normalizedEmail, verificationToken, name, baseUrl);
      if (!emailSent) {
        logOperation("warn","FAILED_TO_SEND_VERIFICATION_EMAIL_BUT_MERCHANT_ACCOUNT_WAS_CREAT",{payload:['Failed to send verification email, but merchant account was created']});
      }
      logOperation("info","SIGNUP_APPLICATION_CREATED_WAITING_FOR_ITS_EMAIL_TO_BE_CONFIRMED",{payload:[`Signup application ${merchant.id} created; waiting for its email to be confirmed`]});

      return replyToSignup(res, startedAt);

    } catch (error) {
      logOperation("error","PUBLIC_MERCHANT_SIGNUP_ERROR",{payload:["Public merchant signup error:",error]});
      res.status(500).json({ message: "Failed to create merchant account" });
    }
  });

  // (Removed PUT /api/merchants/:id/business-details, owner decision 2026-09-26: only the
  // old /business-details page saved through it, and that page is removed.)

  // (Removed POST /api/admin/merchants/signup, owner decision 2026-09-26: the admin chose the new
  // owner's password, and no screen called it. Businesses sign up themselves.)

  // (Removed legacy POST /api/verify-merchant — superseded by the signup +
  // /api/auth/confirm-email flow. Nothing navigated to its /verify-merchant page.)

  // Server-Sent Events for real-time updates
  app.get("/api/merchants/:id/events", async (req, res) => {
    const merchantId = strictPositiveIntegerParam(req.params.id);
    if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
    if (!Number.isInteger(merchantId) || merchantId <= 0) {
      return res.status(400).json({ message: "Invalid merchant ID" });
    }
    if (req.query.token !== undefined) {
      return res.status(400).json({ message: "SSE credentials must use a session cookie" });
    }

    // An unguarded throw while resolving the audience would leave the request
    // open, and EventSource treats a socket that never answers as a connection
    // still being made — the client would sit there rather than retrying.
    try {
      let audience: SseAudience;
      // Whether the stream's sign-in still stands; a board's stream has none to check.
      let stillSignedIn: (() => Promise<boolean>) | undefined;
      // R1-T4 phase E: a browser's live-update request sends the session cookie, never a header. A board's
      // page names its board, and keeps its board stream even in a browser signed in to the business.
      const signedIn = req.query.stoneId === undefined && hasSessionCookie(req);
      if (signedIn) {
        let authenticated = false;
        await authenticateToken(req as AuthenticatedRequest, res, () => {
          authenticated = true;
        });
        if (!authenticated) return;

        const authenticatedRequest = req as AuthenticatedRequest;
        if (!checkMerchantOwnership(authenticatedRequest, merchantId)) {
          return res.status(403).json({ message: "Access denied" });
        }

        const userId = authenticatedRequest.user?.userId ?? authenticatedRequest.user?.id;
        if (!userId) {
          return res.status(403).json({ message: "Access denied" });
        }
        audience = {
          kind: "merchant",
          userId,
          principal: authenticatedRequest.user?.role === "admin" ? "admin" : "user",
          sessionId: authenticatedRequest.authSession?.id,
        };
        // External review 2026-09-29: the sign-in is read again before each event and every few
        // seconds while the stream is idle, so an ending made on another instance closes it here.
        // The stream is checked by its session id, never by a bearer or the cookie's rotating secret.
        const signIn = authenticatedRequest.authSession!;
        stillSignedIn = () => isStreamSessionActive(signIn, merchantId);
      } else if (req.query.stoneId !== undefined) {
        const stoneId = strictPositiveIntegerQueryParam(req.query.stoneId);
        if (stoneId === null) {
          return res.status(400).json({ message: "Invalid payment board" });
        }
        const stone = await storage.getTaptStone(stoneId);
        if (!stone || !stone.isActive || stone.merchantId !== merchantId) {
          return res.status(404).json({ message: "Payment board not found" });
        }
        audience = { kind: "board", stoneId };
      } else {
        // No board and no sign-in: the retired business-wide no-board feed, which let
        // anyone who knew a business's number watch its no-board sales (gap 12).
        return res.status(410).json(NO_BOARD_ADDRESS_RETIRED);
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'private, no-cache, no-store',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();

      const unsubscribe = sseBroker.subscribe(merchantId, audience, res, stillSignedIn);

      req.on('close', () => {
        unsubscribe();
      });
    } catch (error) {
      logOperation("error","SSE_SUBSCRIBE_ERROR",{payload:["SSE subscribe error:",error]});
      // Once the stream is open a JSON body would corrupt it; close the socket
      // instead so EventSource sees a drop and reconnects on its own schedule.
      if (res.headersSent) res.end();
      else res.status(500).json({ message: "Failed to open the event stream" });
    }
  });

  // Push capabilities — reports which delivery paths are ready on this server
  app.get("/api/push/capabilities", (_req, res) => {
    const vapidPublic = config.push.vapidPublicKey || "";
    const vapidPrivate = config.push.vapidPrivateKey || "";
    const webPushReady = !!(vapidPublic && vapidPrivate);

    const apnsKey = config.push.apnsKey || "";
    const apnsKeyId = config.push.apnsKeyId || "";
    const apnsTeamId = config.push.apnsTeamId || "";
    const nativePushReady = !!(apnsKey && apnsKeyId && apnsTeamId);

    res.json({
      webPush: {
        available: webPushReady,
        reason: webPushReady ? undefined : "VAPID credentials not configured",
      },
      nativePush: {
        available: nativePushReady,
        reason: nativePushReady ? undefined : "APNs credentials not configured",
        bundleId: config.push.apnsBundleId,
      },
    });
  });

  // Get VAPID public key for push notification subscription
  app.get("/api/push/vapid-key", (req, res) => {
    const vapidKey = config.push.vapidPublicKey || "";
    const vapidPrivate = config.push.vapidPrivateKey || "";
    if (!vapidKey || !vapidPrivate) {
      return res.status(503).json({ message: "Push notifications not configured" });
    }
    res.json({ publicKey: vapidKey });
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!config.push.vapidPublicKey || !config.push.vapidPrivateKey) {
        return res.status(503).json({ message: "Push notifications not configured on server" });
      }

      const { subscription } = req.body;
      if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return res.status(400).json({ message: "Invalid push subscription" });
      }
      // Only a browser push service's endpoint (owner decision 2026-09-26): the server POSTs to it
      // on every payment, so any other address would point the server at a host of the caller's choosing.
      if (!isPushServiceEndpoint(subscription.endpoint)) {
        return res.status(400).json({ message: "Notifications can only use a browser's own push service." });
      }

      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }

      const pushSub = await storage.createPushSubscription({
        merchantId,
        userId: req.user?.userId ?? null,
        sessionVersion: req.user?.sessionVersion ?? 0,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: req.headers["user-agent"] || undefined,
      });
      if (!pushSub) throw new Error("Push subscription was not persisted");

      res.json({
        success: true,
        preferences: pushNotificationPreferencesDto(pushSub.preferences),
      });
    } catch (error) {
      if (error instanceof PushSessionEndedError) {
        return res.status(401).json({ code: "SESSION_ENDED", message: "You were signed out. Please sign in again." });
      }
      logOperation("error","PUSH_SUBSCRIBE_ERROR",{payload:["Push subscribe error:",error]});
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
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }

      // One scoped statement (R1-T7 S5b): the business and the address together, so a device another
      // business has since registered is never stopped on this one's say-so. Nothing stopped is 403.
      const stopped = typeof endpoint === "string" && await storage.deactivatePushSubscriptionForMerchant(merchantId, endpoint);
      if (!stopped) {
        return res.status(403).json({ message: "Not authorized to unsubscribe this endpoint" });
      }

      res.json({ success: true });
    } catch (error) {
      logOperation("error","PUSH_UNSUBSCRIBE_ERROR",{payload:["Push unsubscribe error:",error]});
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
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }

      const endpoint = `apns://${deviceToken.trim()}`;
      const sub = await storage.createPushSubscription({
        merchantId,
        userId: req.user?.userId ?? null,
        sessionVersion: req.user?.sessionVersion ?? 0,
        endpoint,
        p256dh: "",
        auth: "",
        userAgent: req.headers["user-agent"] || undefined,
      });
      if (!sub) throw new Error("Native push subscription was not persisted");

      res.json({
        success: true,
        preferences: pushNotificationPreferencesDto(sub.preferences),
      });
    } catch (error) {
      if (error instanceof PushSessionEndedError) {
        return res.status(401).json({ code: "SESSION_ENDED", message: "You were signed out. Please sign in again." });
      }
      logOperation("error","NATIVE_PUSH_SUBSCRIBE_ERROR",{payload:["Native push subscribe error:",error]});
      res.status(500).json({ message: "Failed to save device token" });
    }
  });

  // Remove native iOS device token (unsubscribe)
  app.post("/api/push/native-unsubscribe", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }

      // R1-T4: stop this iPhone only. It used to stop every iPhone of the merchant.
      const { deviceToken } = req.body ?? {};
      if (deviceToken !== undefined) {
        if (typeof deviceToken !== "string" || deviceToken.trim().length < 8) {
          return res.status(400).json({ message: "Invalid device token" });
        }
        const endpoint = `apns://${deviceToken.trim()}`;
        if (!(await storage.deactivatePushSubscriptionForMerchant(merchantId, endpoint))) {
          return res.status(403).json({ message: "Not authorized to unsubscribe this device" });
        }
      } else {
        // Registered before device tokens were remembered: this login's iPhones.
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: "Authentication required" });
        await storage.deactivateNativePushSubscriptionsForLogin(merchantId, userId);
      }

      res.json({ success: true });
    } catch (error) {
      logOperation("error","NATIVE_PUSH_UNSUBSCRIBE_ERROR",{payload:["Native push unsubscribe error:",error]});
      res.status(500).json({ message: "Failed to remove device token" });
    }
  });

  // The signed-in login's own notifications: its devices and its switches (owner decision
  // 2026-09-26: each login its own).
  app.get("/api/push/status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      const userId = req.user?.userId;
      if (!merchantId || !userId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }

      const subs = await storage.getPushSubscriptionsForLogin(merchantId, userId);
      const webSubs = subs.filter((s: any) => !s.endpoint.startsWith("apns://"));
      const nativeSubs = subs.filter((s: any) => s.endpoint.startsWith("apns://"));
      const preferences = await storage.getPushNotificationPreferences(merchantId, userId);

      res.json({
        subscribed: subs.length > 0,
        deviceCount: subs.length,
        webSubscribed: webSubs.length > 0,
        nativeSubscribed: nativeSubs.length > 0,
        preferences: pushNotificationPreferencesDto(preferences),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check push status" });
    }
  });

  app.get("/api/push/preferences", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      const userId = req.user?.userId;
      if (!merchantId || !userId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }
      const preferences = await storage.getPushNotificationPreferences(merchantId, userId);
      res.json({ preferences: pushNotificationPreferencesDto(preferences) });
    } catch (error) {
      logOperation("error","PUSH_PREFERENCES_GET_ERROR",{payload:["Push preferences get error:",error]});
      res.status(500).json({ message: "Failed to fetch notification preferences" });
    }
  });

  app.put("/api/push/preferences", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      const userId = req.user?.userId;
      if (!merchantId || !userId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }
      const parsed = pushNotificationPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid notification preferences",
          errors: parsed.error.errors,
        });
      }
      const preferences = await storage.updatePushNotificationPreferences(
        merchantId,
        userId,
        parsed.data,
      );
      res.json({ preferences: pushNotificationPreferencesDto(preferences) });
    } catch (error) {
      logOperation("error","PUSH_PREFERENCES_UPDATE_ERROR",{payload:["Push preferences update error:",error]});
      res.status(500).json({ message: "Failed to update notification preferences" });
    }
  });

  // (Removed POST /api/merchants/:id/clear-transactions, owner decision 2026-09-27: R0-T4's 410
  // tombstone, which nothing called. Financial records are never bulk-deleted.)

  // ===== REFUND MANAGEMENT ROUTES =====

  // Create a refund for a transaction
  app.post("/api/transactions/:transactionId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = strictPositiveIntegerParam(req.params.transactionId);
      if (transactionId === null) return res.status(400).json({ message: "Invalid transactionId" });
      const merchantId = req.user?.merchantId;

      if (!merchantId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }
      if (!config.features.refundInitiation) {
        return res.status(503).json({ code: "REFUND_INITIATION_DISABLED", message: "Refund initiation is temporarily unavailable" });
      }
      // Owner (or admin) only by default (R1-T3 safe default) — members do
      // not initiate refunds. R4 adds an explicit, audited admin-override path.
      // (Capability gate before role gate, matching this plan's documented
      // middleware order: authenticate -> parse -> capability -> role/tenant.)
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can initiate a refund" });
      }

      // Validate refund data — merge transactionId from URL param into body for schema validation
      const validation = createRefundSchema.safeParse({ ...req.body, transactionId });
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid refund data", errors: validation.error.errors });
      }

      const { refundAmount, refundReason, refundMethod } = validation.data;

      // Get the original transaction
      const transaction = await storage.getTransactionForMerchant(transactionId, merchantId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Verify merchant owns this transaction
      // Another business's sale is answered as a missing one (P2.2's tenant-safe 404, R1-T3): its 403
      // told a caller which sale numbers exist.
      if (transaction.merchantId !== merchantId) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Check if transaction can be refunded (allow partially_refunded for further partial refunds)
      if (transaction.status !== "completed" && transaction.status !== "partially_refunded") {
        return res.status(400).json({ message: "Only completed transactions can be refunded" });
      }
      if (!isWindcaveConfigured() || !transaction.windcaveTransactionId) {
        return res.status(503).json({
          code: "REFUND_PROVIDER_UNAVAILABLE",
          message: "Refund processing is temporarily unavailable",
        });
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
      const reserved = await storage.reserveRefundAmountForMerchant(transactionId, merchantId, requestedAmount);
      if (!reserved) {
        const remaining = parseFloat(transaction.refundableAmount || transaction.price);
        return res.status(409).json({
          message: `Refund could not be applied — it exceeds the remaining refundable amount of $${remaining.toFixed(2)}, or another refund is already in progress.`,
        });
      }

      // Create refund record
      const refund = await storage.createRefundForMerchant(transactionId, merchantId, {
        refundAmount,
        refundReason,
        refundMethod,
      });
      if (!refund) {
        // Preserve the reservation rather than undo a different tenant's balance.
        return res.status(503).json({ code: "REFUND_RECONCILIATION_REQUIRED", message: "Refund needs reconciliation before retrying" });
      }

      let windcaveRefundId: string;
      {
        // Windcave refund against the original transaction
        const merchantReference = `REFUND-${transaction.id}-${Date.now()}`;
        const refundResult = await createWindcaveRefund(
          transaction.windcaveTransactionId!,
          parseFloat(refundAmount).toFixed(2),
          merchantReference
        );

        if (!refundResult.success) {
          // Money did not move — release the reservation so the balance is restored
          // and the merchant can retry.
          const released = await storage.releaseRefundAmountForMerchant(transactionId, merchantId, requestedAmount);
          const failed = released && await storage.updateRefundStatusForMerchant(refund.id, merchantId, "failed");
          if (!failed) {
            return res.status(503).json({ code: "REFUND_RECONCILIATION_REQUIRED", message: "Refund needs reconciliation before retrying" });
          }
          return res.status(502).json({
            message: refundResult.error || "Windcave refund failed. Please try again."
          });
        }

        windcaveRefundId = refundResult.refundTransactionId!;
      }

      // Mark refund record as completed. Transaction totals were already updated
      // atomically by reserveRefundAmount above.
      const completedRefund = await storage.updateRefundStatusForMerchant(refund.id, merchantId, "completed", windcaveRefundId);
      if (!completedRefund) {
        return res.status(503).json({ code: "REFUND_RECONCILIATION_REQUIRED", message: "Refund needs reconciliation before retrying" });
      }
      const updatedTransaction = reserved;

      // Broadcast real-time update
      broadcastToStone(merchantId, transaction.taptStoneId, { 
        type: 'refund_completed', 
        refund: completedRefund,
        transaction: updatedTransaction,
        transactionId
      });

      sendPushToMerchant(merchantId, {
        type: "refund_processed",
        partial: updatedTransaction.status === "partially_refunded",
        itemName: transaction.itemName,
        amount: refund.refundAmount,
        transactionId: transaction.id,
      }).catch(() => {});

      res.json({ 
        success: true,
        message: "Refund processed with Windcave successfully",
        refund: completedRefund,
        transaction: updatedTransaction
      });

    } catch (error) {
      logOperation("error","ERROR_CREATING_REFUND",{payload:["Error creating refund:",error]});
      res.status(500).json({ message: "Failed to create refund" });
    }
  });

  // Get refunds for a specific transaction
  app.get("/api/transactions/:transactionId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = strictPositiveIntegerParam(req.params.transactionId);
      if (transactionId === null) return res.status(400).json({ message: "Invalid transactionId" });
      const merchantId = req.user?.merchantId;

      if (!merchantId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }

      // Get the transaction to verify ownership
      const transaction = await storage.getTransactionForMerchant(transactionId, merchantId);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Another business's sale is answered as a missing one (P2.2's tenant-safe 404, R1-T3): its 403
      // told a caller which sale numbers exist.
      if (transaction.merchantId !== merchantId) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      const refunds = await storage.getRefundsForTransactionForMerchant(transactionId, merchantId);
      res.json(refunds);

    } catch (error) {
      logOperation("error","ERROR_FETCHING_REFUNDS",{payload:["Error fetching refunds:",error]});
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  // Get all refunds for a merchant
  app.get("/api/merchants/:merchantId/refunds", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = strictPositiveIntegerParam(req.params.merchantId);
      if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
      const userMerchantId = req.user?.merchantId;

      // Verify access
      if (userMerchantId !== merchantId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const refunds = await storage.getRefundsByMerchant(merchantId);
      res.json(refunds);

    } catch (error) {
      logOperation("error","ERROR_FETCHING_MERCHANT_REFUNDS",{payload:["Error fetching merchant refunds:",error]});
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  // (Removed GET /api/refunds/:refundId, owner decision 2026-09-27: no screen called it; refunds are
  // listed per sale and per business.)

  // (Removed the five admin API-key and usage routes, GET and POST /api/admin/api-keys,
  // POST /api/admin/api-keys/:keyId/revoke, GET /api/admin/api-metrics and GET /api/admin/api-usage,
  // owner decision 2026-09-26: the ecommerce API's administration was never built, so each only
  // answered 404, and no screen called them.)

  // =============================================================================
  // STOCK MANAGEMENT ENDPOINTS
  // =============================================================================

  registerStockRoutes(app, { storage, authenticateToken, checkMerchantOwnership });

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

  const requireEcommerceApi = (_req: any, res: any, next: any) => {
    if (!config.features.ecommerceApi) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
    }
    next();
  };

  // Create transaction via API
  app.post("/api/v1/transactions", requireEcommerceApi, authenticateApiKey, async (req: any, res) => {
    const startTime = Date.now();

    try {
      // The key's permission first, then the body (P2.2's order: role before body).
      if (!req.apiKey.permissions.includes('create_transactions')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      const validation = apiV1CreateTransactionSchema.safeParse(req.body);
      if (!validation.success) {
        await storage.logApiRequest({
          apiKeyId: req.apiKey.id,
          merchantId: req.apiKey.merchantId,
          endpoint: '/api/v1/transactions',
          method: 'POST',
          statusCode: 400,
          responseTime: Date.now() - startTime,
          errorMessage: 'Invalid request body'
        });
        return res.status(400).json({
          error: 'Invalid request body',
          fields: validation.error.errors.map((issue) => issue.path.join('.')),
        });
      }
      const { amount, currency, item_name, webhook_url } = validation.data;

      const creationKey=req.get('Idempotency-Key');if(!isUuid(creationKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',error:'A creation request key is required'});
      // External webhook delivery is deferred by the plan's API phase; its old
      // storage port was a stub. Refuse before creating a bill instead of claiming
      // that an event was queued for a receiver that does not exist.
      if(webhook_url||req.apiKey.webhookUrl)return res.status(503).json({code:'API_WEBHOOK_UNAVAILABLE',error:'Webhook delivery is not enabled'});
      const priorCreation=await storage.getCreationCommandForMerchant(req.apiKey.merchantId,creationKey);
      if (!priorCreation&&!(await requireBillingCard(req.apiKey.merchantId, res))) return;
      if (!config.features.newRetailPayments) {
        return res.status(503).json({ error: "Per-payment links are not enabled yet" });
      }

      // API-v1 sales are independently addressable. The raw credential is
      // returned once in this authenticated response and never enters storage.
      const { transaction, rawToken } = await createRetailTransaction({ createTransaction: input => storage.createTransactionForMerchant(req.apiKey!.merchantId, input,{key:creationKey,actor:{service:'api_key',keyId:req.apiKey!.id},source:'api_v1'}) }, {
        merchantId: req.apiKey.merchantId,
        itemName: item_name,
        price: amount,
        status: 'pending',
        paymentMethod: 'api',
        splitEnabled: false,
        taptStoneId: null,
      }, "per_payment",{creationKey,returnStateSecret:config.paymentReturnStateSecret});
      if (!rawToken) throw new Error("Per-payment transaction did not return a credential");

      const paymentUrl = `${getBaseUrl(req)}/pay/t/${rawToken}`;
      const qrCodeUrl = `${getBaseUrl(req)}/api/pay/t/${rawToken}/qr`;

      // Log successful API request
      await storage.logApiRequest({
        apiKeyId: req.apiKey.id,
        merchantId: req.apiKey.merchantId,
        endpoint: '/api/v1/transactions',
        method: 'POST',
        statusCode: 200,
        responseTime: Date.now() - startTime
      });

      res.json({
        id: transaction.id,
        amount: transaction.price,
        currency,
        item_name: transaction.itemName,
        status: transaction.status,
        payment_url: paymentUrl,
        qr_code_url: qrCodeUrl,
        created_at: transaction.createdAt
      });

    } catch (error) {
      if(error instanceof CreationCommandConflict||error instanceof CreationCredentialUnavailable)return res.status(409).json({code:error.code,error:'The original creation request needs recovery'});
      logOperation("error","API_TRANSACTION_CREATION_ERROR",{payload:["API transaction creation error:",error]});
      const isCredentialCollision = error instanceof PaymentCredentialCollisionError;
      // Best-effort: the usual reason we are in here is that the database is
      // unreachable, which is also the reason this audit write would throw. A
      // throw inside the catch escapes the handler, and Express 4 leaves the
      // request open — the API client would hang instead of seeing the 500.
      try {
        await storage.logApiRequest({
          apiKeyId: req.apiKey?.id,
          merchantId: req.apiKey?.merchantId,
          endpoint: '/api/v1/transactions',
          method: 'POST',
          statusCode: isCredentialCollision ? 503 : 500,
          responseTime: Date.now() - startTime,
          errorMessage: isCredentialCollision ? 'Payment credential allocation failed' : 'Internal server error'
        });
      } catch (logError) {
        logOperation("error","API_REQUEST_LOGGING_FAILED",{payload:["API request logging failed:",logError]});
      }
      res.status(isCredentialCollision ? 503 : 500).json({
        error: isCredentialCollision
          ? 'Could not create a payment link. Please try again.'
          : 'Internal server error',
      });
    }
  });

  // Get transaction status via API
  app.get("/api/v1/transactions/:id", requireEcommerceApi, authenticateApiKey, async (req: any, res) => {
    const startTime = Date.now();

    try {
      const transactionId = strictPositiveIntegerParam(req.params.id);
      if (transactionId === null) return res.status(400).json({ error: "Invalid id" });

      // Check permissions
      if (!req.apiKey.permissions.includes('read_transactions')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const transaction = await storage.getTransactionForMerchant(transactionId, req.apiKey.merchantId);

      // Another merchant's sale is answered exactly as a missing one, so a key
      // cannot tell which sale numbers exist (P2.2).
      if (!transaction || transaction.merchantId !== req.apiKey.merchantId) {
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
      logOperation("error","API_TRANSACTION_FETCH_ERROR",{payload:["API transaction fetch error:",error]});
      // Best-effort — see the note on the POST handler above.
      try {
        await storage.logApiRequest({
          apiKeyId: req.apiKey?.id,
          merchantId: req.apiKey?.merchantId,
          endpoint: `/api/v1/transactions/${req.params.id}`,
          method: 'GET',
          statusCode: 500,
          responseTime: Date.now() - startTime,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch (logError) {
        logOperation("error","API_REQUEST_LOGGING_FAILED",{payload:["API request logging failed:",logError]});
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Digital Wallet Payment Processing Endpoints
  // Retired per R0-T5: no real Apple/Google Pay provider integration exists behind these
  // routes. There is deliberately no capability flag here — a flag around fake-success
  // code is not containment (plan rule 5). A real implementation is R2/R7 scope.

  // (Removed the three retired wallet routes, POST /api/payments/apple-pay/validate,
  // /api/payments/apple-pay/process and /api/payments/google-pay/process, owner decision 2026-09-27:
  // they only answered unavailable, and nothing called them. Customers pay with Apple Pay and Google
  // Pay through the checkout page's own routes.)

  // (Removed GET /api/payments/digital-wallet/config, owner decision 2026-09-26: nothing called
  // it, the wallet payment routes above are retired, and it guessed the device from the
  // User-Agent and gave out the platform's provider account id.)

  // ============================================================================
  // SUBSCRIPTION ROUTES
  // ============================================================================

  // Get subscription status for current merchant
  app.get("/api/subscription", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }

      const subscription = await storage.getOrCreateSubscription(merchantId);
      const seatsInUse = await storage.countSeatsInUse(merchantId);
      const view = subscriptionDto(subscription, seatsInUse);
      if (!isAccountOwner(req.user)) view.card = null;

      res.json({
        subscription: view,
        plans: PLAN_LIST,
      });
    } catch (error) {
      logOperation("error","GET_SUBSCRIPTION_ERROR",{payload:["Get subscription error:",error]});
      res.status(500).json({ message: "Failed to get subscription" });
    }
  });

  // Change plan. Upgrades apply immediately; downgrades queue to period end.
  app.put("/api/subscription/plan", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can change the plan" });
      }

      const commandKey=req.get('Idempotency-Key');if(!isUuid(commandKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Refresh Billing before starting this request'});
      const intent={key:commandKey,actor:commandActor(req,res)};
      const parsed = planIdSchema.safeParse(req.body?.planId);
      if (!parsed.success) {
        return res.status(400).json({ message: "Unknown plan" });
      }

      await storage.getOrCreateSubscription(merchantId);
      const result = await storage.changeSubscriptionPlan(merchantId, parsed.data, subscriptionPayments?.billing.canInitiate()?request=>executeStoredCardCharge(request,commandActor(req,res)):undefined,intent);

      if (!result.ok) {
        if (result.reason === "too-many-seats") {
          return res.status(409).json({
            message: `That plan allows ${result.seatLimit} ${result.seatLimit === 1 ? "login" : "logins"}, but you have ${result.seatsInUse} in use. Remove some team logins first.`,
            seatsInUse: result.seatsInUse,
            seatLimit: result.seatLimit,
          });
        }
        if (result.reason === "payment-method-required") {
          return res.status(402).json({
            code: BILLING_CARD_REQUIRED.code,
            message: "Add a payment method before upgrading.",
          });
        }
        if (result.reason === "declined") {
          return res.status(422).json({ message: "The upgrade payment was declined. Check your card and try again." });
        }
        if (result.reason === "billing-busy") {
          return res.status(409).json({ message: "Billing is already in progress. Please try again shortly." });
        }
        if (result.reason === "invalid-state") {
          return res.status(409).json({ message: "Resolve the current subscription state before upgrading." });
        }
        if (result.reason === "charge-failed") {
          return res.status(502).json({ message: "The upgrade payment could not be confirmed. Please try again." });
        }
        if (result.reason === "not-found") {
          return res.status(404).json({ message: "Subscription not found" });
        }
        return res.status(500).json({ message: "The plan could not be changed." });
      }

      const seatsInUse = await storage.countSeatsInUse(merchantId);
      res.json({
        subscription: subscriptionDto(result.subscription, seatsInUse),
        applied: result.applied,
        message: result.applied === "immediate"
          ? "Your new plan is active."
          : "Your new plan starts at the end of the current billing period.",
      });
    } catch (error) {
      if(error instanceof SubscriptionCommandConflict)return res.status(409).json({code:error.code,message:"The original billing request has different details. Keep the original request."});
      logOperation("error","CHANGE_PLAN_ERROR",{payload:["Change plan error:",error]});
      res.status(500).json({ message: "Failed to change plan" });
    }
  });

  // Cancel at period end — access continues until the paid period runs out.
  app.post("/api/subscription/cancel", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can cancel the subscription" });
      }

      const commandKey=req.get('Idempotency-Key');if(!isUuid(commandKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Refresh Billing before starting this request'});
      const intent={key:commandKey,actor:commandActor(req,res)};
      const { reason } = req.body;

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: "Cancellation reason required" });
      }

      await storage.getOrCreateSubscription(merchantId);
      const cancellation = await storage.cancelSubscription(
        merchantId,
        String(reason).slice(0, 500),intent,
      );
      if (!cancellation.ok) {
        if (cancellation.reason === "billing-busy") {
          return res.status(409).json({ message: "Billing is already in progress. Please try again shortly." });
        }
        return res.status(404).json({ message: "Subscription not found" });
      }
      const subscription = cancellation.subscription;
      const seatsInUse = await storage.countSeatsInUse(merchantId);

      res.json({
        subscription: subscriptionDto(subscription, seatsInUse),
        message: subscription.cancelAtPeriodEnd && subscription.cancellationEffectiveDate
          ? `Your subscription stays active until ${new Date(subscription.cancellationEffectiveDate).toLocaleDateString("en-NZ")}.`
          : "Your subscription is cancelled. You can restart it from Billing at any time.",
      });
    } catch (error) {
      if(error instanceof SubscriptionCommandConflict)return res.status(409).json({code:error.code,message:"The original billing request has different details. Keep the original request."});
      logOperation("error","CANCEL_SUBSCRIPTION_ERROR",{payload:["Cancel subscription error:",error]});
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // Undo a pending cancellation.
  app.post("/api/subscription/resume", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can change the subscription" });
      }

      const commandKey=req.get('Idempotency-Key');if(!isUuid(commandKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Refresh Billing before starting this request'});
      const intent={key:commandKey,actor:commandActor(req,res)};
      const subscription = await storage.resumeSubscription(merchantId,intent);
      if (!subscription) {
        return res.status(409).json({ message: "This subscription does not have a cancellation that can be resumed." });
      }
      const seatsInUse = await storage.countSeatsInUse(merchantId);
      res.json({
        subscription: subscriptionDto(subscription, seatsInUse),
        message: "Your subscription will renew as normal.",
      });
    } catch (error) {
      if(error instanceof SubscriptionCommandConflict)return res.status(409).json({code:error.code,message:"The original billing request has different details. Keep the original request."});
      logOperation("error","RESUME_SUBSCRIPTION_ERROR",{payload:["Resume subscription error:",error]});
      res.status(500).json({ message: "Failed to resume subscription" });
    }
  });

  // ============================================================================
  // TEAM SEAT ROUTES
  // ============================================================================

  // Long enough to survive a weekend, short enough that a forwarded invite email
  // does not stay live indefinitely.
  const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  app.get("/api/team", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);

      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can view team logins" });
      }
      const subscription = await storage.getOrCreateSubscription(merchantId);
      const members = await storage.getTeamMembers(merchantId);
      res.json({
        members: members.map(teamMemberDto),
        seatLimit: subscription?.seatLimit ?? 1,
        seatsInUse: await storage.countSeatsInUse(merchantId),
      });
    } catch (error) {
      logOperation("error","GET_TEAM_ERROR",{payload:["Get team error:",error]});
      res.status(500).json({ message: "Failed to load team" });
    }
  });

  app.post("/api/team/invite", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can invite logins" });
      }

      const parsed = inviteTeamMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Enter a valid name and email", errors: parsed.error.errors });
      }

      await storage.getOrCreateSubscription(merchantId);
      const rawToken = crypto.randomBytes(32).toString("hex");
      const inviteTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const result = await storage.inviteTeamMember(merchantId, {
        email: parsed.data.email,
        name: parsed.data.name ?? null,
        inviteTokenHash,
        inviteExpiresAt,
      });

      if (!result.ok) {
        if (result.reason === "seat-limit") {
          return res.status(409).json({
            message: `Your plan includes ${result.seatLimit} ${result.seatLimit === 1 ? "login" : "logins"} and all are in use. Upgrade your plan to add more.`,
            seatsInUse: result.seatsInUse,
            seatLimit: result.seatLimit,
          });
        }
        return res.status(409).json({ message: "That email address already has a TaptPay login." });
      }

      const merchant = await storage.getMerchant(merchantId);
      let emailSent = false;
      try {
        emailSent = await sendTeamInviteEmail({
          to: result.user.email,
          businessName: merchant?.businessName || "your team",
          inviteUrl: `${getBaseUrl(req)}/accept-invite?token=${rawToken}`,
        });
      } catch (error) {
        logOperation("error","TEAM_INVITE_EMAIL_FAILED",{payload:["Team invite email failed:",error]});
      }
      if (!emailSent) {
        const rolledBack = await storage.revokeTeamInvite(merchantId, result.user.id, inviteTokenHash);
        if (!rolledBack) {
          logOperation("error","TEAM_INVITE_ROLLBACK_FAILED",{payload:["Team invite rollback failed:",{ merchantId, userId: result.user.id }]});
        }
        return res.status(502).json({ message: "The invite email could not be sent. No seat was used." });
      }

      res.status(201).json({ member: teamMemberDto(result.user) });
    } catch (error) {
      logOperation("error","INVITE_TEAM_MEMBER_ERROR",{payload:["Invite team member error:",error]});
      res.status(500).json({ message: "Failed to send invite" });
    }
  });

  app.post("/api/team/:userId/resend", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = strictPositiveIntegerParam(req.params.userId);
      if (userId === null) return res.status(400).json({ message: "Invalid userId" });
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can resend invites" });
      }

      if (!Number.isInteger(userId)) return res.status(400).json({ message: "Invalid invite" });
      if (!checkResendRateLimit(`team-invite:${merchantId}:${userId}`)) {
        return res.status(429).json({ message: "Too many resend attempts. Please try again later." });
      }

      const previous = await storage.getTeamMemberForMerchant(userId, merchantId);
      if (!previous || previous.status !== "invited" || !previous.inviteTokenHash) {
        return res.status(404).json({ message: "Invite not found" });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const inviteTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const rotation = await storage.rotateTeamInvite(merchantId, userId, {
        inviteTokenHash,
        inviteExpiresAt,
        expectedTokenHash: previous.inviteTokenHash,
      });
      if (!rotation.ok) {
        if (rotation.reason === "seat-limit") {
          return res.status(409).json({
            message: "All of your plan's logins are in use. Upgrade your plan or remove another login first.",
            seatsInUse: rotation.seatsInUse,
            seatLimit: rotation.seatLimit,
          });
        }
        if (rotation.reason === "conflict") {
          return res.status(409).json({ message: "That invite changed in another request. Refresh and try again." });
        }
        return res.status(404).json({ message: "Invite not found" });
      }
      const rotated = rotation.user;

      const merchant = await storage.getMerchant(merchantId);
      let emailSent = false;
      try {
        emailSent = await sendTeamInviteEmail({
          to: rotated.email,
          businessName: merchant?.businessName || "your team",
          inviteUrl: `${getBaseUrl(req)}/accept-invite?token=${rawToken}`,
        });
      } catch (error) {
        logOperation("error","TEAM_INVITE_RESEND_FAILED",{payload:["Team invite resend failed:",error]});
      }

      if (!emailSent) {
        let restored = false;
        if (previous.inviteExpiresAt) {
          const restore = await storage.rotateTeamInvite(merchantId, userId, {
            inviteTokenHash: previous.inviteTokenHash,
            inviteExpiresAt: previous.inviteExpiresAt,
            expectedTokenHash: inviteTokenHash,
          });
          restored = restore.ok;
        }
        if (!restored) {
          await storage.revokeTeamInvite(merchantId, userId, inviteTokenHash);
        }
        return res.status(502).json({
          message: restored
            ? "The invite email could not be sent. The previous invite is unchanged."
            : "The invite email could not be sent. No new invite was kept.",
        });
      }

      res.json({ member: teamMemberDto(rotated) });
    } catch (error) {
      logOperation("error","RESEND_TEAM_INVITE_ERROR",{payload:["Resend team invite error:",error]});
      res.status(500).json({ message: "Failed to resend invite" });
    }
  });

  app.delete("/api/team/:userId/invite", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = strictPositiveIntegerParam(req.params.userId);
      if (userId === null) return res.status(400).json({ message: "Invalid userId" });
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can revoke invites" });
      }
      if (!Number.isInteger(userId)) return res.status(400).json({ message: "Invalid invite" });

      const revoked = await storage.revokeTeamInvite(merchantId, userId);
      if (!revoked) return res.status(404).json({ message: "Invite not found" });
      res.json({ message: "Invite revoked" });
    } catch (error) {
      logOperation("error","REVOKE_TEAM_INVITE_ERROR",{payload:["Revoke team invite error:",error]});
      res.status(500).json({ message: "Failed to revoke invite" });
    }
  });

  app.put("/api/team/:userId/status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = strictPositiveIntegerParam(req.params.userId);
      if (userId === null) return res.status(400).json({ message: "Invalid userId" });
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can change logins" });
      }

      const status = req.body?.status;
      if (!Number.isInteger(userId) || (status !== "active" && status !== "disabled")) {
        return res.status(400).json({ message: "Invalid request" });
      }

      const result = await storage.setTeamMemberStatus(merchantId, userId, status);
      if (!result.ok) {
        if (result.reason === "seat-limit") {
          return res.status(409).json({
            message: "All of your plan's logins are in use. Upgrade your plan or remove another login first.",
            seatsInUse: result.seatsInUse,
            seatLimit: result.seatLimit,
          });
        }
        if (result.reason === "invalid-state") {
          return res.status(409).json({ message: "That login is already in this state or must be managed as a pending invite." });
        }
        if (result.reason === "owner") {
          return res.status(403).json({ message: "The account owner cannot be disabled." });
        }
        return res.status(404).json({ message: "Login not found" });
      }

      if (status === "disabled") {
        sseBroker.disconnectUser(merchantId, userId);
        // R1-T4 phase E: the status check already refuses every session of this login; this records why.
        await endLoginSessions(userId, "login_disabled")
          .catch((error) => logOperation("error","TEAM_DISABLE_SESSIONS",{payload:["[TEAM_DISABLE_SESSIONS]",error]}));
        // Owner decision 2026-09-22: a disabled login's devices stop getting
        // notifications too. The login is already disabled, so a fault here is
        // logged, never returned.
        await storage.deactivatePushSubscriptionsForLogin(merchantId, userId)
          .catch((error) => logOperation("error","TEAM_DISABLE_PUSH_STOP",{payload:["[TEAM_DISABLE_PUSH_STOP]",error]}));
      }
      res.json({ member: teamMemberDto(result.user) });
    } catch (error) {
      logOperation("error","UPDATE_TEAM_MEMBER_ERROR",{payload:["Update team member error:",error]});
      res.status(500).json({ message: "Failed to update login" });
    }
  });

  app.delete("/api/team/:userId", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = strictPositiveIntegerParam(req.params.userId);
      if (userId === null) return res.status(400).json({ message: "Invalid userId" });
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can remove logins" });
      }

      if (!Number.isInteger(userId)) return res.status(400).json({ message: "Invalid login" });
      const member = await storage.getTeamMemberForMerchant(userId, merchantId);
      if (!member || member.role === "owner") {
        return res.status(404).json({ message: "Login not found, or it is the account owner" });
      }
      if (member.status === "invited") {
        return res.status(409).json({ message: "Use revoke invite for a pending invitation." });
      }

      // R1-T4 phase E: record why this login's sessions end; removing the login removes them.
      await endLoginSessions(userId, "login_removed")
        .catch((error) => logOperation("error","TEAM_REMOVE_SESSIONS",{payload:["[TEAM_REMOVE_SESSIONS]",error]}));
      const removed = await storage.removeTeamMember(merchantId, userId);
      if (!removed) {
        return res.status(404).json({ message: "Login not found, or it is the account owner" });
      }
      sseBroker.disconnectUser(merchantId, userId);
      // Its devices stop getting notifications too, as when a login is disabled (owner decision
      // 2026-09-22). The cascade takes the subscriptions recorded against it; this also stops the
      // business's unattributed ones from before 0029. The login is already removed, so a fault
      // here is logged, never returned.
      await storage.deactivatePushSubscriptionsForLogin(merchantId, userId)
        .catch((error) => logOperation("error","TEAM_REMOVE_PUSH_STOP",{payload:["[TEAM_REMOVE_PUSH_STOP]",error]}));
      res.json({ message: "Login removed" });
    } catch (error) {
      logOperation("error","REMOVE_TEAM_MEMBER_ERROR",{payload:["Remove team member error:",error]});
      res.status(500).json({ message: "Failed to remove login" });
    }
  });

  // Accept an invite: unauthenticated by design — the token IS the credential.
  app.post("/api/team/accept-invite", async (req, res) => {
    try {
      const parsed = acceptInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Invalid invite details",
          errors: parsed.error.errors,
        });
      }

      const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
      const invited = await storage.getUserByInviteToken(tokenHash);
      const invalid = () => res.status(400).json({ message: "This invite is no longer valid. Ask the account owner to send a new one." });
      const now = new Date();
      if (!invited || invited.status !== "invited") return invalid();
      if (!invited.inviteExpiresAt || new Date(invited.inviteExpiresAt) <= now) return invalid();

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const activated = await storage.activateInvitedUser(
        invited.id,
        tokenHash,
        passwordHash,
        parsed.data.name ?? null,
        now,
      );
      if (!activated) return invalid();

      logSecurityEvent("TEAM_INVITE_ACCEPTED", { userId: activated.id, merchantId: activated.merchantId });
      res.json({ message: "Your login is ready. Please sign in." });
    } catch (error) {
      logOperation("error","ACCEPT_INVITE_ERROR",{payload:["Accept invite error:",error]});
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  // Get billing history
  app.get("/api/subscription/billing-history", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can view billing history" });
      }

      const limit = strictBoundedIntegerQueryParam(req.query.limit, { fallback: 50, min: 1, max: 100 });
      if (limit === null) return res.status(400).json({ message: "Invalid limit" });
      const history = await storage.getBillingHistory(merchantId, limit);

      res.json({ history: history.map(billingHistoryDto) });
    } catch (error) {
      logOperation("error","GET_BILLING_HISTORY_ERROR",{payload:["Get billing history error:",error]});
      res.status(500).json({ message: "Failed to get billing history" });
    }
  });

  // ============================================================================
  // SUBSCRIPTION PAYMENT METHOD — Windcave card-on-file
  // ============================================================================
  //
  // The card number never reaches this server. We open a Windcave-hosted form,
  // Windcave stores the card and hands back a token plus masked metadata, and we
  // persist only those. That is what makes recurring billing possible without
  // this service being in PCI scope.

  app.get("/api/billing/card", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can view the payment method" });
      }
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });

      const subscription = await storage.getOrCreateSubscription(merchantId);
      const ready = renewalPaymentMethodIsReady(subscription);
      res.json({
        ready,
        card: subscription?.cardLast4
          ? {
              last4: subscription.cardLast4,
              brand: subscription.cardBrand,
              expiry: subscription.cardExpiry,
            }
          : null,
      });
    } catch (error) {
      logOperation("error","GET_BILLING_CARD_ERROR",{payload:["Get billing card error:",error]});
      res.status(500).json({ message: "Failed to load the payment method" });
    }
  });

  // Subscription card setup: one persisted command before provider creation.
  app.post("/api/billing/card/session", authenticateToken, async (req:AuthenticatedRequest,res)=>{
    try{
      const merchantId=req.user?.merchantId;if(!merchantId)return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if(!isAccountOwner(req.user))return res.status(403).json({message:'Only the account owner can change the payment method'});
      if(!subscriptionPayments?.card.canStart())return res.status(503).json({message:'Card storage is temporarily unavailable'});
      const idempotencyKey=req.get('Idempotency-Key');if(!isUuid(idempotencyKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Refresh Settings before starting card setup'});
      const merchant=await storage.getMerchant(merchantId);if(!merchant)return res.status(404).json({message:'Merchant not found'});
      const subscription=await storage.getOrCreateSubscription(merchantId);
      const result=await subscriptionPayments.card.start({subscriptionId:subscription.id,merchantId,idempotencyKey,
        email:merchant.contactEmail||merchant.email,baseUrl:getBaseUrl(req),actor:commandActor(req,res)});
      if(result.kind==='ready')return res.json({sessionId:result.sessionId,redirectUrl:result.redirectUrl});
      if(result.kind==='processing'||result.kind==='terminal')return res.status(202).json({pending:true,sessionId:'sessionId' in result?result.sessionId:undefined,message:'Your original card setup is still being confirmed. Retry with the same request.'});
      return res.status(result.kind==='conflict'?409:result.kind==='not-found'?404:503).json({message:'Card setup is unavailable or an earlier payment is being reconciled'});
    }catch{logOperation("error","CARD_SETUP_UNAVAILABLE",{payload:['[CARD_SETUP_UNAVAILABLE]']});res.status(503).json({message:'Card setup could not be confirmed. Keep the original request.'});}
  });

  app.post("/api/billing/card/confirm", authenticateToken, async(req:AuthenticatedRequest,res)=>{
    try{
      const merchantId=req.user?.merchantId;if(!merchantId)return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if(!isAccountOwner(req.user))return res.status(403).json({message:'Only the account owner can change the payment method'});
      const parsed=z.object({sessionId:z.string().refine(value=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value))}).strict().safeParse(req.body);
      if(!parsed.success)return res.status(400).json({message:'A valid card setup session is required'});
      if(!subscriptionPayments)return res.status(503).json({message:'Card confirmation is unavailable'});
      const attempt=await subscriptionPayments.card.confirm(merchantId,parsed.data.sessionId);
      if(!attempt)return res.status(403).json({message:'This card setup session does not belong to your account'});
      if(attempt.payment_method_superseded)return res.status(409).json({code:'CARD_SETUP_SUPERSEDED',terminal:true,message:'The payment method has since changed. This setup will not be applied again.'});
      if(attempt.activation_suppressed)return res.status(409).json({code:'CARD_SETUP_CANCELLED',terminal:true,message:'Your card was verified. The subscription remains cancelled and no new charge was started.'});
      if(attempt.state==='declined'||attempt.activation_state==='declined')return res.status(422).json({message:'The payment method or subscription charge was declined. Please try another card.'});
      if(attempt.state!=='approved'||(attempt.activation_state && !attempt.activation_applied_at))return res.status(202).json({pending:true});
      const subscription=await storage.getSubscription(merchantId);if(!subscription)return res.status(404).json({message:'Subscription not found'});
      // A verified card is independent from positive-money activation. With an
      // unpaid subscription, never claim that saving the card established access.
      if(!attempt.activation_state && attempt.activation_required!=='false' && !attempt.activation_satisfied && !billingCardIsReady(subscription))return res.status(202).json({pending:true});
      const seatsInUse=await storage.countSeatsInUse(merchantId);
      res.json({success:true,ready:renewalPaymentMethodIsReady(subscription),charged:attempt.activation_state==='approved',
        card:{last4:subscription.cardLast4,brand:subscription.cardBrand,expiry:subscription.cardExpiry},subscription:subscriptionDto(subscription,seatsInUse)});
    }catch{logOperation("error","CARD_CONFIRMATION_UNAVAILABLE",{payload:['[CARD_CONFIRMATION_UNAVAILABLE]']});res.status(503).json({message:'Card confirmation is still being checked'});}
  });

  app.all("/api/billing/card/notification",...durableNotificationHandlers);
  const billingCardCallback=async(req:express.Request,res:express.Response)=>{
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    const state=typeof req.query.state==='string'?req.query.state:undefined;
    if(!state||!subscriptionPayments)return res.status(409).json({message:'This card return needs reconciliation'});
    try{
      const attempt=await subscriptionPayments.card.resolveReturnState(state);
      if(!attempt)return res.status(404).json({message:'Card return not found'});
      if(attempt.session_id)await subscriptionPayments.card.confirm(attempt.merchant_id,attempt.session_id);
      res.redirect(303,'/settings?section=billing&card=pending');
    }catch{res.status(503).json({message:'Card return is still being confirmed'});}
  };
  app.get("/api/billing/card/callback",billingCardCallback);
  app.post("/api/billing/card/callback",billingCardCallback);

  // Remove the stored card.
  app.delete("/api/billing/card", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!isAccountOwner(req.user)) {
        return res.status(403).json({ message: "Only the account owner can change the payment method" });
      }

      const commandKey=req.get('Idempotency-Key');if(!isUuid(commandKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'Refresh Billing before starting this request'});
      const intent={key:commandKey,actor:commandActor(req,res)};
      await storage.removeSubscriptionCard(merchantId,intent);
      res.json({ success: true });
    } catch (error) {
      if(error instanceof SubscriptionCommandConflict)return res.status(409).json({code:error.code,message:"The original billing request has different details. Keep the original request."});
      logOperation("error","REMOVE_BILLING_CARD_ERROR",{payload:["Remove billing card error:",error]});
      if (error instanceof SubscriptionBillingBusyError) {
        return res.status(409).json({ message: "Billing is already in progress. Please try again shortly." });
      }
      res.status(500).json({ message: "Failed to remove card" });
    }
  });

  // Board Builder: send a board's PDF to TaptPay's print inbox. Owner decision 2026-09-26
  // (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 2): signed-in businesses
  // only, the business and board from the sign-in, a larger body on this route alone, a few
  // sends an hour. The pipeline leaves this body alone (server/app.ts), so it is read only
  // after the sign-in is checked. It was public with no limit, and its page's 9.5 MB request
  // always met the 100 KB JSON limit.
  app.post(
    "/api/board-builder/submit", // BOARD_PRINT_PATH, which the pipeline's JSON parser skips
    authenticateToken,
    express.json({ limit: BOARD_PRINT_JSON_LIMIT }),
    async (req: AuthenticatedRequest, res) => {
      try {
        const merchantId = req.user?.merchantId;
        if (!merchantId) return res.status(403).json({ message: "Only a business can send a board to print" });
        const validation = boardPrintRequestSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            message: validation.error.issues[0]?.message ?? "Invalid board",
            errors: validation.error.issues,
          });
        }
        const pdf = decodeBoardPrintPdf(validation.data.pdf);
        if (!pdf) return res.status(400).json({ message: "The board must be a PDF of at most 2 MB" });

        const stone = await storage.getTaptStoneForMerchant(validation.data.stoneId, merchantId);
        if (!stone || !stone.isActive) {
          return res.status(404).json({ message: "Payment board not found" });
        }
        const merchant = await storage.getMerchant(merchantId);
        if (!merchant) return res.status(404).json({ message: "Merchant not found" });

        const bucket = boardPrintBucket(merchantId);
        const slot = await storage.takeAuthThrottleSlot([bucket], new Date());
        if (!slot.allowed) return refuseTooManyAttempts(res, slot.retryAfterMs, "board-print");

        const { sendBoardBuilderEmail } = await import('./email-service-multi');
        const sent = await sendBoardBuilderEmail({
          pdf,
          businessName: merchant.businessName,
          board: `${stone.name} (board ${stone.stoneNumber})`,
          layout: validation.data.layout,
          submitterName: validation.data.submitterName,
          submitterEmail: validation.data.submitterEmail,
        });
        if (!sent) {
          // Not the business's doing: this send does not count against it.
          await storage.settleAuthThrottle([bucket], "void", new Date());
          return res.status(502).json({ message: "The board could not be sent. Please try again." });
        }
        res.json({ message: "Board submitted successfully" });
      } catch (error) {
        logOperation("error","BOARD_BUILDER_SUBMIT_ERROR",{payload:["Board builder submit error:",error]});
        res.status(500).json({ message: "Failed to process board submission" });
      }
    },
  );

  // Serve PUBLIC uploads (merchant logos) from the uploaded_files table (durable
  // across deploys), with a local-disk fallback for any legacy file that predates
  // DB-backed storage.
  //
  // Gap 13 (Option C, Oliver 2026-09-14): this route is unauthenticated by
  // design — logos are shown to customers on hosted checkout pages — so it
  // serves ONLY the folders in PUBLIC_UPLOAD_FOLDERS. Anything else, invoice
  // documents in particular, is a 404 exactly like a missing file, checked
  // before either the database or the disk fallback is consulted. Invoice
  // documents are served by GET /api/invoice-documents/:name (authenticated,
  // tenant-scoped) and GET /api/checkout/document/:token (checkout-token).
  //
  // UPL-3: `nosniff` stays on both response paths so a browser can never
  // sniff a stored file's bytes into text/html.
  app.get('/uploads/:folder/:name', async (req, res) => {
    try {
      const { folder, name } = req.params;
      if (!isPublicUploadFolder(folder)) return res.status(404).json({ message: 'File not found' });
      // Route params never contain '/', but keep an explicit guard against
      // traversal for the disk fallback below.
      if (name.includes('..')) return res.status(400).end();
      const relPath = `${folder}/${name}`;

      const file = await storage.getUploadedFile(relPath);
      if (file) {
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.send(file.data);
      }

      const diskPath = path.join(process.cwd(), 'uploads', folder, name);
      if (fs.existsSync(diskPath)) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.sendFile(diskPath);
      }

      res.status(404).json({ message: 'File not found' });
    } catch (err) {
      logOperation("error","UPLOADS_SERVE",{payload:['[UPLOADS_SERVE]',err]});
      res.status(500).json({ message: 'Failed to serve file' });
    }
  });

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
  setInterval(() => { const c = Date.now() - 120_000; tokenRateMap.forEach((v, k) => { if (v.windowStart < c) tokenRateMap.delete(k); }); }, 300_000).unref();

  function generateInvoiceToken(): string { return crypto.randomBytes(20).toString("base64url"); }

  // After a rent invoice is fully paid, email a GST tax invoice to the head
  // tenant plus any co-tenants / split-share payers we have addresses for.


  // Idempotently finalize a rent invoice from a Windcave payment outcome.
  // Safe to call from both the browser callback and the server notification —
  // already-finalized invoices (paid/paid_external/voided) are left untouched.
  // For split invoices each call counts one share (deduped by sessionId); the
  // invoice only flips to paid once every share is in.


  // ── Tenant Profiles ──────────────────────────────────────────────────────

  type CheckoutInvoice = any & { checkoutVertical?: "property" | "trades" };

  async function getCheckoutInvoiceByToken(token: string): Promise<CheckoutInvoice | undefined> {
    const propertyInvoice = await storage.getInvoiceRentRequestByToken(token);
    if (propertyInvoice) return { ...propertyInvoice, checkoutVertical: "property" };
    const tradeInvoice = await storage.getJobInvoiceByToken(token);
    return tradeInvoice ? { ...tradeInvoice, checkoutVertical: "trades" } : undefined;
  }

  // Gap 13: does this invoice carry a document the checkout may expose? Only an
  // invoice-folder reference that the invoice's OWN merchant owns qualifies — a
  // legacy row can hold any string (external URL, logo path, another merchant's
  // document), and none of those is ever surfaced to the customer.
  //
  // This runs on the customer's PAYMENT page, so a failure here must only ever
  // hide the document link — never take the page down and stop someone paying.
  async function invoiceHasCheckoutDocument(invoice: CheckoutInvoice): Promise<boolean> {
    const ref = parseInvoiceDocumentRef(invoice.documentUrl);
    if (!ref) return false;
    try {
      return await storage.cleanUploadedFileOwnedByMerchant(ref.relPath, invoice.merchantId);
    } catch (err) {
      logOperation("error","CHECKOUT_DOCUMENT_CHECK",{payload:["[CHECKOUT_DOCUMENT_CHECK]",err]});
      return false;
    }
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

  // Split invoices (0030; owner decision 2026-09-26): each share is paid only by a session
  // opened for that invoice and recorded when it was opened.
  const splitInvoiceRef = (invoice: CheckoutInvoice) => ({
    vertical: invoice.checkoutVertical === "trades" ? "trades" as const : "property" as const,
    invoiceId: invoice.id as string,
  });
  async function splitSessionOpenedFor(invoice: CheckoutInvoice, sessionId: string): Promise<boolean> {
    const opened = await storage.getInvoiceSplitSession(sessionId);
    if (!opened) return false;
    return invoice.checkoutVertical === "trades" ? opened.jobInvoiceId === invoice.id : opened.rentInvoiceId === invoice.id;
  }

  async function updateCheckoutInvoice(invoice: CheckoutInvoice, updates: any): Promise<any> {
    return invoice.checkoutVertical === "trades"
      ? storage.updateJobInvoice(invoice.id, updates)
      : storage.updateInvoiceRentRequest(invoice.id, updates);
  }

  app.get("/api/property/tenants", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const includeArchived = req.query.includeArchived === "true";
      const tenants = await storage.getTenantProfilesByMerchant(merchantId, { search, includeArchived });
      res.json(tenants);
    } catch (err) { logOperation("error","PROP_TENANTS_LIST",{payload:["[PROP_TENANTS_LIST]",err]}); res.status(500).json({ message: "Failed to fetch tenants" }); }
  });

  app.post("/api/property/tenants", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const data = createTenantProfileSchema.parse(req.body);
      // Storage commits the tenant and its Tenant_Created history line together (R1-T7 S5b).
      const tenant = await storage.createTenantProfileForMerchant(merchantId, data);
      res.status(201).json(tenant);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","PROP_TENANT_CREATE",{payload:["[PROP_TENANT_CREATE]",err]}); res.status(500).json({ message: "Failed to create tenant" });
    }
  });

  // C10 batch 6c (2026-09-27): a property id is parsed as a UUID (a malformed one reached
  // PostgreSQL's uuid cast: a 500), and another business's record is not found, like a missing one
  // (it answered 403, which said the id exists), as the trades routes answer.
  app.get("/api/property/tenants/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const tenant = await storage.getTenantProfileForMerchant(id, merchantId);
      if (!tenant || tenant.merchantId !== merchantId) return res.status(404).json({ message: "Tenant not found" });
      res.json(tenant);
    } catch (err) { logOperation("error","PROP_TENANT_GET",{payload:["[PROP_TENANT_GET]",err]}); res.status(500).json({ message: "Failed to fetch tenant" }); }
  });

  app.put("/api/property/tenants/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getTenantProfileForMerchant(id, merchantId);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Tenant not found" });
      const data = updateTenantProfileSchema.parse(req.body);
      const tenant = await storage.updateTenantProfileForMerchant(id, merchantId, data);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json(tenant);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","PROP_TENANT_UPDATE",{payload:["[PROP_TENANT_UPDATE]",err]}); res.status(500).json({ message: "Failed to update tenant" });
    }
  });

  app.post("/api/property/tenants/:id/archive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getTenantProfileForMerchant(id, merchantId);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Tenant not found" });
      const tenant = await storage.archiveTenantProfileForMerchant(id, merchantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json(tenant);
    } catch (err) { logOperation("error","PROP_TENANT_ARCHIVE",{payload:["[PROP_TENANT_ARCHIVE]",err]}); res.status(500).json({ message: "Failed to archive tenant" }); }
  });

  app.post("/api/property/tenants/:id/unarchive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getTenantProfileForMerchant(id, merchantId);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Tenant not found" });
      const tenant = await storage.unarchiveTenantProfileForMerchant(id, merchantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json(tenant);
    } catch (err) { logOperation("error","PROP_TENANT_UNARCHIVE",{payload:["[PROP_TENANT_UNARCHIVE]",err]}); res.status(500).json({ message: "Failed to restore tenant" }); }
  });

  app.get("/api/property/tenants/:id/events", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const tenant = await storage.getTenantProfileForMerchant(id, merchantId);
      if (!tenant || tenant.merchantId !== merchantId) return res.status(404).json({ message: "Tenant not found" });
      const limit = strictBoundedIntegerQueryParam(req.query.limit, { fallback: 50, max: 200 });
      if (limit === null) return res.status(400).json({ message: "Invalid limit" });
      const events = await storage.getTransactionEventsByTenantForMerchant(id, merchantId, limit);
      res.json(events);
    } catch (err) { logOperation("error","PROP_EVENTS",{payload:["[PROP_EVENTS]",err]}); res.status(500).json({ message: "Failed to fetch events" }); }
  });

  // ── Schedules ────────────────────────────────────────────────────────────

  app.get("/api/property/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      res.json(await storage.getActiveSchedulesByMerchant(merchantId));
    } catch (err) { logOperation("error","PROP_SCHEDULES_MERCHANT",{payload:["[PROP_SCHEDULES_MERCHANT]",err]}); res.status(500).json({ message: "Failed to fetch schedules" }); }
  });

  // (Removed GET /api/property/tenants/:tenantId/schedules, owner decision 2026-09-27: no screen
  // called it; the screens read every automation of the business and pick out a tenant's.)

  app.post("/api/property/tenants/:tenantId/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const tenantId = strictUuidParam(req.params.tenantId);
      if (tenantId === null) return res.status(400).json({ message: "Invalid id" });
      const tenant = await storage.getTenantProfileForMerchant(tenantId, merchantId);
      if (!tenant || tenant.merchantId !== merchantId) return res.status(404).json({ message: "Tenant not found" });
      // Archiving a tenant cancels its automations, and the screens offer only current tenants.
      if (tenant.status === "archived") return res.status(409).json({ message: "This tenant is archived" });
      if (!(await requireBillingCard(merchantId, res))) return;
      const data = createActiveScheduleSchema.parse({ ...req.body, tenantProfileId: tenantId });
      const result = await storage.createActiveScheduleForMerchant(tenantId, merchantId, data);
      if (result.kind === "not-found") return res.status(404).json({ message: "Tenant not found" });
      if (result.kind === "conflict") return res.status(409).json({ message: "This tenant is archived" });
      res.status(201).json(result.schedule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","PROP_SCHEDULE_CREATE",{payload:["[PROP_SCHEDULE_CREATE]",err]}); res.status(500).json({ message: "Failed to create schedule" });
    }
  });

  app.put("/api/property/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getActiveScheduleForMerchant(id, merchantId);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Schedule not found" });
      // A cancelled automation stays cancelled: the screens hide cancelled ones, and resuming one
      // would bill again, even a tenant archived since. DELETE is how one is cancelled.
      if (existing.status === "terminated") return res.status(409).json({ message: "This automation was cancelled" });
      const data = updateActiveScheduleSchema.parse(req.body);
      const result = await storage.updateActiveScheduleForMerchant(id, merchantId, data);
      if (result.kind === "not-found") return res.status(404).json({ message: "Schedule not found" });
      if (result.kind === "conflict") return res.status(409).json({ message: result.reason === "terminated" ? "This automation was cancelled" : "This tenant is archived" });
      res.json(result.schedule);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","PROP_SCHEDULE_UPDATE",{payload:["[PROP_SCHEDULE_UPDATE]",err]}); res.status(500).json({ message: "Failed to update schedule" });
    }
  });

  app.delete("/api/property/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getActiveScheduleForMerchant(id, merchantId);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Schedule not found" });
      const result = await storage.terminateActiveScheduleForMerchant(id, merchantId);
      if (result.kind !== "ok") return res.status(404).json({ message: "Schedule not found" });
      res.json(result.schedule);
    } catch (err) { logOperation("error","PROP_SCHEDULE_DELETE",{payload:["[PROP_SCHEDULE_DELETE]",err]}); res.status(500).json({ message: "Failed to terminate schedule" }); }
  });

  // ── Invoices ─────────────────────────────────────────────────────────────

  app.get("/api/property/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const tenantProfileId = req.query.tenantProfileId === undefined ? undefined : strictUuidParam(req.query.tenantProfileId);
      if (tenantProfileId === null) return res.status(400).json({ message: "Invalid tenantProfileId" });
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const invoices = await storage.getInvoiceRentRequestsByMerchant(merchantId, { status, tenantProfileId });
      // Enrich with tenant display name/address and computed split owing.
      const cache = new Map<string, { tenantName: string; propertyAddress: string }>();
      const enriched = await Promise.all(invoices.map(async (inv: any) => {
        if (!cache.has(inv.tenantProfileId)) {
          const t = await storage.getTenantProfileForMerchant(inv.tenantProfileId, merchantId).catch(() => null);
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
    } catch (err) { logOperation("error","PROP_INVOICES_LIST",{payload:["[PROP_INVOICES_LIST]",err]}); res.status(500).json({ message: "Failed to fetch invoices" }); }
  });

  // Upload a supporting document (PDF/image) for a one-off charge. Returns the
  // stored URL + original filename; the bill-create call then attaches them to
  // the invoice. Kept separate from invoice creation so the create route stays
  // JSON (multipart is only needed when there's actually a file to send).
  app.post("/api/property/invoices/document", authenticateToken, receiveUpload(invoiceDocUpload, 'document'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      // UPL-2: re-verify the declared type against the actual bytes for the
      // four types with a simple, fixed-offset signature (see
      // INVOICE_DOC_MAGIC_CHECK's definition above for what's checked, and
      // why HEIC is excluded from this pass).
      const magicCheck = INVOICE_DOC_MAGIC_CHECK[req.file.mimetype];
      if (magicCheck && !magicCheck(req.file.buffer)) {
        return res.status(400).json({ message: "Invalid file: content does not match declared type" });
      }

      const ext = INVOICE_DOCUMENT_EXTENSIONS[req.file.mimetype];
      if (!ext) return res.status(400).json({ message: "Unsupported document type" });
      // R1-T7 S6a (owner decision 2026-09-29): scanned before anything is stored. No scanner, a
      // scanner that cannot be reached, or an answer that is no verdict refuses the upload; so does
      // a document the scanner blocks. Nothing is kept in either case.
      let scan: ScanResult;
      try {
        const scanner = getMalwareScanner();
        if (!scanner) throw new ScannerUnavailableError("not configured");
        scan = await scanner.scan(req.file.buffer);
        if (scan?.verdict !== "clean" && scan?.verdict !== "infected") throw new ScannerUnavailableError("an answer that is not a verdict");
      } catch (error) {
        logOperation("error","INVOICE_DOC_SCAN_UNAVAILABLE",{payload:["[INVOICE_DOC_SCAN_UNAVAILABLE]",error instanceof ScannerUnavailableError ? error.message : "scanner fault"]});
        return res.status(503).json({ message: "Document scanning is temporarily unavailable. Please try again.", code: "DOCUMENT_SCAN_UNAVAILABLE" });
      }
      if (scan.verdict !== "clean") {
        logSecurityEvent("INVOICE_DOCUMENT_BLOCKED_BY_SCAN", { merchantId: req.user.merchantId, scanner: scan.scanner, signature: scan.signature });
        return res.status(400).json({ message: "This file was blocked because it may be harmful.", code: "DOCUMENT_BLOCKED" });
      }
      const filename = `invoice-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      // Stamped with the uploader's merchant (gap 13) and stored with its clean verdict. The
      // returned `documentUrl` is an opaque reference the create routes validate against that
      // owner — it is no longer a fetchable public URL (see GET /uploads/:folder/:name).
      await storage.saveScannedUploadedFile(`${INVOICE_DOCUMENT_FOLDER}/${filename}`, req.file.mimetype, req.file.buffer, req.user.merchantId, { scanner: scan.scanner });
      const documentUrl = `/uploads/${INVOICE_DOCUMENT_FOLDER}/${filename}`;
      res.json({ documentUrl, documentName: req.file.originalname });
    } catch (err) {
      logOperation("error","PROP_INVOICE_DOC_UPLOAD",{payload:["[PROP_INVOICE_DOC_UPLOAD]",err]});
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Gap 13 (Option C, Oliver 2026-09-14): the authenticated, ownership-checked
  // download for invoice documents. A merchant principal (owner or teammate) is
  // scoped to its OWN merchant id, and a document owned by anyone else, owned by
  // no one (a legacy row that could not be attributed), malformed, or missing all
  // give the same 404, so the route is not an existence oracle. The tenant who
  // was sent the invoice reads the document through
  // GET /api/checkout/document/:token instead; they hold no merchant session.
  //
  // S1 (Oliver, 2026-09-19: "i want to see merchant documents"): the VALIDATED
  // platform admin — not merely a token that says "admin" — may open any invoice
  // document by name, including one no merchant could be attributed to. Every
  // such read is written to the security audit log (who and which document,
  // never the contents), because these are tenants' financial documents. The
  // admin gets no wider reach than that: the name must still be a generated
  // invoice-document name, so no other folder and no path can be requested.
  app.get("/api/invoice-documents/:name", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const isAdmin = isValidatedPlatformAdmin(req.user);
      const merchantId = req.user?.merchantId;
      if (!isAdmin && !merchantId) return res.status(401).json({ message: "Authentication required" });
      const { name } = req.params;
      if (!isInvoiceDocumentName(name)) return res.status(404).json({ message: "Document not found" });
      const relPath = `${INVOICE_DOCUMENT_FOLDER}/${name}`;
      // Only with a clean scan on record (R1-T7 S6a), for the business and the admin alike.
      const file = isAdmin
        ? await storage.getCleanUploadedFile(relPath)
        : await storage.getCleanUploadedFileForMerchant(relPath, merchantId as number);
      if (!file) return res.status(404).json({ message: "Document not found" });
      if (isAdmin) {
        try {
          await storage.recordInvoiceDocumentAdminRead(req.user!.id, name);
        } catch {
          // No document bytes leave the server without a committed audit record.
          logOperation("error","INVOICE_DOC_AUDIT_UNAVAILABLE",{payload:["[INVOICE_DOC_AUDIT_UNAVAILABLE]"]});
          return res.status(503).json({ message: "Document temporarily unavailable" });
        }
        logSecurityEvent("ADMIN_INVOICE_DOCUMENT_READ", { adminUserId: req.user!.id, document: name });
      }
      return sendPrivateDocument(res, file);
    } catch (err) {
      logOperation("error","INVOICE_DOC_SERVE",{payload:["[INVOICE_DOC_SERVE]",err]});
      res.status(500).json({ message: "Failed to serve document" });
    }
  });

  app.post("/api/property/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      // The body's rules first: the tenant was read from the raw body before them.
      const data = createAdHocInvoiceSchema.parse(req.body);
      const creationKey=req.get('Idempotency-Key');if(!isUuid(creationKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'A creation request key is required'});
      const priorCreation=await storage.getCreationCommandForMerchant(merchantId,creationKey);
      const tenant = await storage.getTenantProfileForMerchant(data.tenantProfileId, merchantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!priorCreation&&!(await requireBillingCard(merchantId, res))) return;
      // Gap 13: an attached document must be this merchant's own upload.
      if (!priorCreation&&!(await requireOwnedInvoiceDocument(merchantId, data.documentUrl, res))) return;
      const baseUrl = getBaseUrl(req);
      const result = await storage.createOrReuseInvoiceRentRequestForMerchant(data.tenantProfileId, merchantId, data,{key:creationKey,actor:commandActor(req,res)});
      if (result.kind === "not-found") return res.status(404).json({ message: "Tenant not found" });
      if (result.kind === "invalid-document") return res.status(400).json({ message: "Invalid document attachment" });
      if (result.kind === 'payment-active') return res.status(409).json({code:'PAYMENT_ACTIVE',message:'This invoice already has a payment attempt. Its amount cannot change.'});
      const record=await storage.getCreationCommandForMerchant(merchantId,creationKey);
      const confirmed=!!record&&!!(result.invoice.sentAt||result.invoice.dispatchedAt)&&new Date(result.invoice.sentAt||result.invoice.dispatchedAt!).getTime()>=record.createdAt.getTime();
      const delivery = result.commandReused?{ok:confirmed,reason:confirmed?'reused':'processing'}:await resendInvoiceEmailForMerchant(result.invoice.id, merchantId, baseUrl);
      if (delivery.reason === "reconciliation_required") return res.status(503).json({ message: "Invoice delivery requires reconciliation", code: "PROPERTY_INVOICE_DELIVERY_RECONCILIATION_REQUIRED" });
      const fresh = await storage.getInvoiceRentRequestForMerchant(result.invoice.id, merchantId);
      if (!fresh) return res.status(404).json({ message: "Invoice not found" });
      res.status(result.reused ? 200 : 201).json({ ...fresh, resent: result.reused, delivered: delivery.ok, deliveryReason: delivery.reason });
    } catch (err) {
      if(err instanceof CreationCommandConflict)return res.status(409).json({code:err.code,message:'The original creation details differ. Keep the original request.'});
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","PROP_INVOICE_CREATE",{payload:["[PROP_INVOICE_CREATE]",err]}); res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.post("/api/property/invoices/:id/resend", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const invoice = await storage.getInvoiceRentRequestForMerchant(id, merchantId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (!(await requireBillingCard(merchantId, res))) return;
      if (["paid", "paid_external", "voided"].includes(invoice.status)) return res.status(409).json({ message: "Invoice is not payable" }); // P2.2 (R1-T3): was 400
      const delivery = await resendInvoiceEmailForMerchant(id, merchantId, getBaseUrl(req));
      if (delivery.reason === "reconciliation_required") return res.status(503).json({ message: "Invoice delivery requires reconciliation", code: "PROPERTY_INVOICE_DELIVERY_RECONCILIATION_REQUIRED" });
      if (delivery.reason === "not_found") return res.status(404).json({ message: "Invoice not found" });
      if (delivery.reason === "not_payable") return res.status(409).json({ message: "Invoice is not payable" });
      if (!delivery.ok) return res.status(502).json({ message: "Could not resend", reason: delivery.reason });
      res.json(delivery.invoice);
    } catch (err) { logOperation("error","PROP_INVOICE_RESEND",{payload:["[PROP_INVOICE_RESEND]",err]}); res.status(500).json({ message: "Failed to resend invoice" }); }
  });

  // (Removed GET /api/property/invoices/:id, owner decision 2026-09-27: no screen called it; the
  // screens read the invoice list.)

  app.post("/api/property/invoices/:id/void", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const invoice = await storage.getInvoiceRentRequestForMerchant(id, merchantId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (["paid", "paid_external"].includes(invoice.status)) return res.status(409).json({ message: "Cannot void a paid invoice" }); // P2.2 (R1-T3): was 400
      await reconcileBeforeManualChange('property',id,merchantId);
      const result = await storage.voidInvoiceRentRequestForMerchant(id, merchantId,commandActor(req,res));
      if (result.kind === "not-found") return res.status(404).json({ message: "Invoice not found" });
      if (result.kind === "conflict" && result.reason === "payment-active") return res.status(409).json({
        message: "Payment is in progress or a share is already paid", code: "PAYMENT_ACTIVE",
      });
      if (result.kind === "conflict") return res.status(409).json({ message: "Cannot void a paid invoice" });
      res.json(result.invoice);
    } catch (err) { logOperation("error","PROP_INVOICE_VOID",{payload:["[PROP_INVOICE_VOID]",err]}); res.status(500).json({ message: "Failed to void invoice" }); }
  });

  app.post("/api/property/invoices/:id/mark-paid-external", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const invoice = await storage.getInvoiceRentRequestForMerchant(id, merchantId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      // A voided invoice stays voided: the screens hide voided invoices.
      if (invoice.status === "voided") return res.status(409).json({ message: "This invoice was voided" });
      if (invoice.status === "paid") return res.status(409).json({ message: "Invoice is already paid" });
      const { externalPaymentReference } = markInvoicePaidExternalSchema.parse(req.body);
      await reconcileBeforeManualChange('property',id,merchantId);
      const result = await storage.markInvoiceRentRequestPaidExternalForMerchant(id, merchantId, externalPaymentReference,commandActor(req,res));
      if (result.kind === "not-found") return res.status(404).json({ message: "Invoice not found" });
      if (result.kind === "conflict" && result.reason === "payment-active") return res.status(409).json({
        message: "Payment is in progress or a share is already paid", code: "PAYMENT_ACTIVE",
      });
      if (result.kind === "conflict") return res.status(409).json({ message: result.reason === "voided" ? "This invoice was voided" : "Invoice is already paid" });
      res.json(result.invoice);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","PROP_INVOICE_MARK_PAID",{payload:["[PROP_INVOICE_MARK_PAID]",err]}); res.status(500).json({ message: "Failed to mark invoice paid" });
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
      const [merchant, party, hasDocument] = await Promise.all([
        storage.getMerchant(invoice.merchantId),
        getCheckoutParty(invoice),
        invoiceHasCheckoutDocument(invoice),
      ]);
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
        // "View invoice" link on the branded checkout page. Gap 13: this is the
        // checkout-token route, never the raw storage path (which no public route
        // serves any more), and only when the document is genuinely the invoice
        // merchant's own; the page opens whatever URL it is given.
        documentUrl: hasDocument ? `/api/checkout/document/${token}` : null,
        documentName: hasDocument ? (invoice.documentName ?? null) : null,
        splitEnabled: !!invoice.splitEnabled,
        splitCount: invoice.splitCount ?? null,
        splitPaidCount: invoice.splitPaidCount ?? 0,
      });
    } catch (err) { logOperation("error","CHECKOUT_RESOLVE",{payload:["[CHECKOUT_RESOLVE]",err]}); res.status(500).json({ message: "Failed to load payment details" }); }
  });

  // Gap 13, the tenant-facing half of Option C. The reader of an attached
  // invoice document is the unauthenticated tenant on the checkout page, who
  // holds no merchant session — so the invoice's checkout token authorizes
  // exactly the one document attached to that invoice (plan §8.5: "Public
  // checkout tokens authorize one payment resource only"), and only if the
  // stored file belongs to the invoice's own merchant. Guards mirror
  // GET /api/checkout/resolve/:token: unknown -> 404, voided -> 410, and a paid
  // invoice exposes no document there, so none here. Each real link gets a
  // database-shared budget (10 a minute), separate from the payment page's.
  // The link is looked up FIRST (owner decision 2026-09-21): a made-up link is
  // answered 404 without touching the budget, so nobody can use it up for other
  // customers. A limiter outage fails closed before any document byte is read.
  app.get("/api/checkout/document/:token", async (req, res) => {
    try {
      const { token } = req.params;
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(token)) return res.status(404).json({ message: "Payment link not found" });
      const invoice = await getCheckoutInvoiceByToken(token);
      if (!invoice) return res.status(404).json({ message: "Payment link not found" });
      let allowed: boolean;
      try {
        allowed = await storage.consumeInvoiceDocumentReadLimit(token);
      } catch {
        logOperation("error","INVOICE_DOC_LIMIT_UNAVAILABLE",{payload:["[INVOICE_DOC_LIMIT_UNAVAILABLE]"]});
        return res.status(503).json({ message: "Document temporarily unavailable" });
      }
      if (!allowed) return res.setHeader("Retry-After", "60").status(429).json({ message: "Too many requests" });
      if (invoice.status === "voided") return res.status(410).json({ message: "This payment link has been voided" });
      if (invoice.status === "paid" || invoice.status === "paid_external") return res.status(404).json({ message: "Document not found" });
      const ref = parseInvoiceDocumentRef(invoice.documentUrl);
      const file = ref ? await storage.getCleanUploadedFileForMerchant(ref.relPath, invoice.merchantId) : undefined;
      if (!file) return res.status(404).json({ message: "Document not found" });
      return sendPrivateDocument(res, file);
    } catch (err) { logOperation("error","CHECKOUT_DOCUMENT",{payload:["[CHECKOUT_DOCUMENT]",err]}); res.status(500).json({ message: "Failed to load document" }); }
  });

  // Tenant chooses how many flatmates to split the rent between (sets splitCount).
  app.post("/api/checkout/:token/split",invoiceCheckoutHandlers.split);

  // (Removed POST /api/checkout/pay, owner decision 2026-09-26: no page used it, and a
  // split share paid through it could never be recorded.)

  // The in-page (Hosted Fields) checkout: creates a Windcave
  // session for the invoice and returns the AJAX submit URLs so the branded
  // checkout page can take card / Apple Pay / Google Pay details in-page instead
  // of redirecting the payer out to the external Windcave HPP. The URLs are
  // cached server-side (never trusted from the client) and consumed at completion.
  app.post("/api/checkout/:token/session",invoiceCheckoutHandlers.session);

  // Card, Apple Pay and Google Pay all reconcile the exact durable invoice attempt.
  app.post("/api/checkout/:token/hosted-fields-complete",invoiceCheckoutHandlers.complete());

  // Wallet submission has a durable once-only session command.
  app.post("/api/checkout/:token/googlepay-complete",invoiceCheckoutHandlers.complete(true));

  // Browser return after the tenant pays on the Windcave HPP. Confirms the real
  // outcome by querying the session (never trusts the result param alone), then
  // redirects back to /r/:token which renders the paid/declined state.
  app.get("/api/checkout/callback",invoiceCheckoutHandlers.callback);

  // Commit notification hints before ACK; settlement belongs to the shared worker.
  app.all("/api/windcave/rent-notification",...durableNotificationHandlers);


  app.all("/api/windcave/trades-notification",...durableNotificationHandlers);
  // Evolution API webhook — receives delivery status updates for WhatsApp messages.
  // Matches each event's message ID back to the invoice that sent it, logs the
  // status, and stamps whatsappDeliveredAt on the first DELIVERY_ACK or READ event.
  // Guards the endpoint with the same EVOLUTION_API_KEY used to send messages.
  app.post("/api/webhooks/whatsapp", express.json(), async (req, res) => {
    res.status(200).send("OK"); // respond immediately so Evolution doesn't retry
    try {
      // Only a caller presenting EVOLUTION_API_KEY is believed, and with no key
      // configured nobody is (it used to accept everyone then).
      if (!presentedSecretMatches(req.headers["apikey"], config.whatsapp.apiKey)) {
        logOperation("warn","WA_WEBHOOK_REJECTED_MISSING_OR_WRONG_APIKEY",{payload:["[WA_WEBHOOK] rejected — missing or wrong apikey"]});
        return;
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
    } catch (err) { logOperation("error","WA_WEBHOOK_ERROR",{payload:["[WA_WEBHOOK] Error:",err]}); }
  });

  // ── Merchant sector + timezone ────────────────────────────────────────────

  // (Removed PUT /api/merchants/:merchantId/sector, owner decision 2026-09-27: no screen called it,
  // and any login of the business, a teammate included, could switch it between retail and property.)

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
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      res.json(reminderSettingsOf(merchant));
    } catch (err) { logOperation("error","PROP_REMINDER_GET",{payload:["[PROP_REMINDER_GET]",err]}); res.status(500).json({ message: "Failed to fetch reminder settings" }); }
  });

  app.put("/api/property/reminder-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const data = updateRentReminderSettingsSchema.parse(req.body);
      const merchant = await storage.updateMerchantSettings(merchantId, { kind: "rent-reminders", changes: data });
      res.json(reminderSettingsOf(merchant));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","PROP_REMINDER_PUT",{payload:["[PROP_REMINDER_PUT]",err]}); res.status(500).json({ message: "Failed to update reminder settings" });
    }
  });

  // ═══════════════ TRADES ═══════════════

  /** How far back a recurring invoice's start date may be (owner decision 2026-09-27): a day. */
  const RECURRING_START_GRACE_MS = 24 * 60 * 60 * 1000;

  /**
   * After an attempted send, an uncertain outcome is answered with one of these and no row
   * (R1-T7 S4b2): the message may have gone, so it is neither a success nor a "nothing was sent".
   */
  const TRADES_QUOTE_RECONCILIATION = { message: "Quote delivery requires reconciliation", code: "TRADES_QUOTE_DELIVERY_RECONCILIATION_REQUIRED" } as const;
  const TRADES_INVOICE_RECONCILIATION = { message: "Invoice delivery requires reconciliation", code: "TRADES_INVOICE_DELIVERY_RECONCILIATION_REQUIRED" } as const;
  /** Why a deposit's balance is not sent: the same status and words whether the route or storage finds it. */
  const BALANCE_REFUSALS: Record<Extract<JobBalanceCreationResult, { kind: "conflict" }>["reason"], [number, string]> = {
    "not-deposit": [400, "Balance can only be sent for a deposit invoice"],
    unpaid: [409, "Deposit must be paid before sending the balance"],
    "no-quote": [400, "This deposit is not linked to a quote, so a balance can't be calculated"],
    "quote-not-found": [404, "Linked quote not found"],
    exists: [409, "Balance invoice already exists"],
    "none-remaining": [400, "No balance remaining"],
  };

  // Trades job-invoice reminders have their own on/off switch (cadence reuses the
  // rent* day settings) so disabling rent reminders doesn't silently stop them.
  app.get("/api/trades/reminder-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      res.json({ tradeRemindersEnabled: merchant.tradeRemindersEnabled ?? true });
    } catch (err) { logOperation("error","TRADES_REMINDER_GET",{payload:["[TRADES_REMINDER_GET]",err]}); res.status(500).json({ message: "Failed to fetch reminder settings" }); }
  });

  app.put("/api/trades/reminder-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const data = updateTradeReminderSettingsSchema.parse(req.body);
      const merchant = await storage.updateMerchantSettings(merchantId, { kind: "trade-reminders", tradeRemindersEnabled: data.tradeRemindersEnabled });
      res.json({ tradeRemindersEnabled: merchant?.tradeRemindersEnabled ?? true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","TRADES_REMINDER_PUT",{payload:["[TRADES_REMINDER_PUT]",err]}); res.status(500).json({ message: "Failed to update reminder settings" });
    }
  });

  app.get("/api/trades/gst-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Merchant not found" });
      res.json({
        gstRegistered: merchant.gstRegistered ?? false,
        tradeGstMode: merchant.tradeGstMode === "exclusive" ? "exclusive" : "inclusive",
      });
    } catch (err) {
      logOperation("error","TRADES_GST_GET",{payload:["[TRADES_GST_GET]",err]});
      res.status(500).json({ message: "Failed to fetch GST settings" });
    }
  });

  app.put("/api/trades/gst-settings", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      // The owner's to change (C10 batch 6d): GST changes the tax on every quote and invoice, and the
      // settings page shows these to a teammate greyed out, with the business's other details.
      if (!isAccountOwner(req.user)) return res.status(403).json({ message: "Only the account owner can change GST settings" });
      const data = updateTradeGstSettingsSchema.parse(req.body);
      const merchant = await storage.updateMerchantSettings(merchantId, { kind: "trade-gst", changes: data });
      res.json({
        gstRegistered: merchant?.gstRegistered ?? false,
        tradeGstMode: merchant?.tradeGstMode === "exclusive" ? "exclusive" : "inclusive",
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: err.errors });
      logOperation("error","TRADES_GST_PUT",{payload:["[TRADES_GST_PUT]",err]});
      res.status(500).json({ message: "Failed to update GST settings" });
    }
  });

  app.get("/api/trades/clients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const rows = await storage.getClientProfilesByMerchant(merchantId);
      res.json(rows);
    } catch (err) { logOperation("error","TRADES_CLIENTS_GET",{payload:["[TRADES_CLIENTS_GET]",err]}); res.status(500).json({ message: "Failed to fetch clients" }); }
  });
  app.post("/api/trades/clients", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const parsed = createClientProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const row = await storage.createClientProfileForMerchant(merchantId, parsed.data);
      res.status(201).json(row);
    } catch (err) { logOperation("error","TRADES_CLIENTS_POST",{payload:["[TRADES_CLIENTS_POST]",err]}); res.status(500).json({ message: "Failed to create client" }); }
  });
  // C10 batch 6d (2026-09-27): a trades id is parsed as a UUID (a malformed one reached PostgreSQL's
  // uuid cast: a 500). Another business's record is not found, like a missing one.
  app.get("/api/trades/clients/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const row = await storage.getClientProfileForMerchant(id, merchantId);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) { logOperation("error","TRADES_CLIENTS_GET_ID",{payload:["[TRADES_CLIENTS_GET_ID]",err]}); res.status(500).json({ message: "Failed to fetch client" }); }
  });
  app.put("/api/trades/clients/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getClientProfileForMerchant(id, merchantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const parsed = updateClientProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const updated = await storage.updateClientProfileForMerchant(id, merchantId, parsed.data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) { logOperation("error","TRADES_CLIENTS_PUT",{payload:["[TRADES_CLIENTS_PUT]",err]}); res.status(500).json({ message: "Failed to update client" }); }
  });
  app.post("/api/trades/clients/:id/archive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getClientProfileForMerchant(id, merchantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const client = await storage.archiveClientProfileForMerchant(id, merchantId);
      if (!client) return res.status(404).json({ message: "Not found" });
      res.json(client);
    } catch (err) { logOperation("error","TRADES_CLIENTS_ARCHIVE",{payload:["[TRADES_CLIENTS_ARCHIVE]",err]}); res.status(500).json({ message: "Failed to archive client" }); }
  });
  app.post("/api/trades/clients/:id/unarchive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getClientProfileForMerchant(id, merchantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      // Recurring invoices cancelled by the archive stay cancelled, as a restored rent tenant's do.
      const client = await storage.unarchiveClientProfileForMerchant(id, merchantId);
      if (!client) return res.status(404).json({ message: "Not found" });
      res.json(client);
    } catch (err) { logOperation("error","TRADES_CLIENTS_UNARCHIVE",{payload:["[TRADES_CLIENTS_UNARCHIVE]",err]}); res.status(500).json({ message: "Failed to restore client" }); }
  });
  // Promote a quick-invoice 'prospect' profile into a real (visible) client.
  app.post("/api/trades/clients/:id/promote", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getClientProfileForMerchant(id, merchantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.status !== "prospect") return res.status(409).json({ message: "Client is already saved" }); // P2.2 (R1-T3): was 400
      const result = await storage.promoteClientProfileForMerchant(id, merchantId);
      if (result.kind === "not-found") return res.status(404).json({ message: "Not found" });
      if (result.kind === "conflict") return res.status(409).json({ message: "Client is already saved" });
      res.json(result.client);
    } catch (err) { logOperation("error","TRADES_CLIENTS_PROMOTE",{payload:["[TRADES_CLIENTS_PROMOTE]",err]}); res.status(500).json({ message: "Failed to save client" }); }
  });
  app.get("/api/trades/clients/:id/events", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getClientProfileForMerchant(id, merchantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      res.json(await storage.getJobEventsByClientForMerchant(id, merchantId));
    } catch (err) { logOperation("error","TRADES_CLIENTS_EVENTS",{payload:["[TRADES_CLIENTS_EVENTS]",err]}); res.status(500).json({ message: "Failed to fetch client events" }); }
  });

  app.get("/api/trades/quotes", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      // A status filter is taken only as text: a repeated one reached the query as a list.
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json(await storage.getQuotesByMerchant(merchantId, { status }));
    } catch (err) { logOperation("error","TRADES_QUOTES_GET",{payload:["[TRADES_QUOTES_GET]",err]}); res.status(500).json({ message: "Failed to fetch quotes" }); }
  });
  app.post("/api/trades/quotes", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!(await requireBillingCard(merchantId, res))) return;
      const parsed = createQuoteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      if (parsed.data.depositEnabled && (!parsed.data.depositType || !parsed.data.depositValue || parsed.data.depositValue <= 0))
        return res.status(400).json({ message: "Deposit type and value are required" });
      if (parsed.data.depositEnabled && parsed.data.depositType === "percent" && (parsed.data.depositValue ?? 0) > 100)
        return res.status(400).json({ message: "Deposit percentage cannot exceed 100" });
      // Gap 13: an attached document must be this merchant's own upload. Checked
      // before anything is made, so a rejection writes nothing.
      if (!(await requireOwnedInvoiceDocument(merchantId, parsed.data.documentUrl, res))) return;
      let client: TradesClientRef;
      if (parsed.data.clientProfileId) {
        const saved = await storage.getClientProfileForMerchant(parsed.data.clientProfileId, merchantId);
        if (!saved) return res.status(404).json({ message: "Client not found" });
        client = { clientProfileId: saved.id };
      } else {
        // Like quick invoices, unsaved recipients use a hidden prospect, made with the quote. Empty
        // details are intentional for a link-only quote; never invent contact data.
        const name = parsed.data.recipient?.name ?? "";
        const split = name.indexOf(" ");
        client = { prospect: {
          firstName: split > 0 ? name.slice(0, split) : name,
          lastName: split > 0 ? name.slice(split + 1) : "",
          email: parsed.data.recipient?.email ?? null,
          phone: null,
          siteAddress: parsed.data.recipient?.address ?? "",
          preferredChannel: "email",
        } };
      }
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
      // Storage rechecks the client and the document at the write, makes the link's token, and
      // commits the hidden prospect (if any), the quote and its quote_sent history together.
      const result = await storage.createQuoteForMerchant(merchantId, client, {
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
      });
      if (result.kind === "not-found") return res.status(404).json({ message: "Client not found" });
      if (result.kind === "invalid-document") return res.status(400).json({ message: "Invalid document attachment" });
      const delivery = await sendTradeQuoteForMerchant(result.quote.id, merchantId, getBaseUrl(req));
      if (delivery.reason === "reconciliation_required") return res.status(503).json(TRADES_QUOTE_RECONCILIATION);
      // Record undelivered quotes so the list/timeline can distinguish them from
      // ones the client actually received (status stays "sent" so the manually
      // shared link still works).
      if (!delivery.sent) await storage.recordQuoteDeliveryForMerchant(result.quote.id, merchantId, result.client.id, { sent: false, reason: delivery.reason });
      // The answer is read back through the business's scope, not from a row held across the send.
      const fresh = await storage.getQuoteDeliveryForMerchant(result.quote.id, merchantId);
      if (!fresh) return res.status(404).json({ message: "Not found" });
      res.status(201).json({ ...fresh.quote, delivered: delivery.sent, deliveryReason: delivery.reason });
    } catch (err) { logOperation("error","TRADES_QUOTES_POST",{payload:["[TRADES_QUOTES_POST]",err]}); res.status(500).json({ message: "Failed to create quote" }); }
  });
  // (Removed GET /api/trades/quotes/:id, owner decision 2026-09-27: no screen called it; the screens
  // read the quote list, and open a quote's PDF.)

  // Makes the download from rows its caller already holds; it reads nothing itself (R1-T7 S4b1).
  function sendQuotePdf(quote: any, client: any, merchant: any, req: any, res: any) {
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
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      // The quote and its client in one read, both the business's: never a client by a global key.
      const snapshot = await storage.getQuoteDeliveryForMerchant(id, merchantId);
      if (!snapshot) return res.status(404).json({ message: "Not found" });
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) return res.status(404).json({ message: "Quote details unavailable" });
      sendQuotePdf(snapshot.quote, snapshot.client, merchant, req, res);
    } catch (err) {
      logOperation("error","TRADES_QUOTE_PDF",{payload:["[TRADES_QUOTE_PDF]",err]});
      res.status(500).json({ message: "Failed to generate quote PDF" });
    }
  });

  app.get("/api/trades/quotes/token/:token/pdf", async (req, res) => {
    try {
      const quote = await storage.getQuoteByToken(req.params.token);
      if (!quote) return res.status(404).json({ message: "Quote not found" });
      // The link's holder has only the quote: its client and business are read by the quote's own ids.
      const [client, merchant] = await Promise.all([
        storage.getClientProfile(quote.clientProfileId),
        storage.getMerchant(quote.merchantId),
      ]);
      if (!client || !merchant) return res.status(404).json({ message: "Quote details unavailable" });
      sendQuotePdf(quote, client, merchant, req, res);
    } catch (err) {
      logOperation("error","TRADES_QUOTE_TOKEN_PDF",{payload:["[TRADES_QUOTE_TOKEN_PDF]",err]});
      res.status(500).json({ message: "Failed to generate quote PDF" });
    }
  });

  // (Removed POST /api/trades/quotes/:id/resend, owner decision 2026-09-27: no screen called it.)

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
      quote=await storage.recordQuoteViewForMerchant(quote.id,quote.merchantId);
      if(!quote)return res.status(404).json({message:'Quote not found'});
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
    } catch (err) { logOperation("error","TRADES_QUOTES_TOKEN_GET",{payload:["[TRADES_QUOTES_TOKEN_GET]",err]}); res.status(500).json({ message: "Failed to fetch quote" }); }
  });
  // Customer-facing accept/decline (called from the public quote page, no auth — looked up by token)
  app.post("/api/trades/quotes/token/:token/respond",async(req,res)=>{
    try{
      const parsed=acceptQuoteSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:parsed.error.errors[0].message});
      const quote=await storage.getQuoteByToken(req.params.token);if(!quote)return res.status(404).json({message:'Quote not found'});
      const allowAccept=parsed.data.accept?billingCardIsReady(await storage.getOrCreateSubscription(quote.merchantId)):false;
      const result=await storage.respondToQuoteForMerchant(quote.id,quote.merchantId,parsed.data.accept,{allowAccept});
      if(result.kind==='not-found')return res.status(404).json({message:'Quote not found'});
      if(result.kind==='expired')return res.status(410).json({message:'Quote has expired'});
      if(result.kind==='billing-required')return res.status(402).json(QUOTE_ACCEPTANCE_UNAVAILABLE);
      if(result.kind==='conflict')return res.status(409).json({message:'This quote has already been responded to or cannot create a payment invoice'});
      if(result.kind!=='ok')return res.status(409).json({message:'Quote response needs reconciliation'});
      // Creation/response/audit/outbox is atomic. A lost browser response reuses
      // that invoice and cannot send its original dispatch again.
      if(result.invoice&&!result.reused)await resendTradeInvoiceForMerchant(result.invoice.id,quote.merchantId,getBaseUrl(req));
      const invoice=result.invoice?await storage.getJobInvoiceForMerchant(result.invoice.id,quote.merchantId):null;
      res.json({quote:{id:result.quote.id,status:result.quote.status,acceptedAt:result.quote.acceptedAt,declinedAt:result.quote.declinedAt},
        depositInvoice:invoice?{id:invoice.id,token:invoice.token,kind:invoice.kind,amountCents:invoice.amountCents,status:invoice.status}:null,
        paymentUrl:invoice?`${getBaseUrl(req)}/r/${invoice.token}`:null,delivered:!!invoice&&['sent','viewed','paid','paid_external'].includes(invoice.status)});
    }catch{logOperation("error","QUOTE_RESPONSE_UNAVAILABLE",{payload:['[QUOTE_RESPONSE_UNAVAILABLE]']});res.status(503).json({message:'Quote response could not be confirmed. Retry the original choice.'});}
  });

  app.get("/api/trades/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      // The client filter is a UUID (a malformed one reached PostgreSQL's uuid cast: a 500), and the
      // status filter is taken only as text (a repeated one reached the query as a list).
      const clientProfileId = req.query.clientProfileId === undefined ? undefined : strictUuidParam(req.query.clientProfileId);
      if (clientProfileId === null) return res.status(400).json({ message: "Invalid clientProfileId" });
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json(await storage.getJobInvoicesByMerchant(merchantId, { status, clientProfileId }));
    } catch (err) { logOperation("error","TRADES_INVOICES_GET",{payload:["[TRADES_INVOICES_GET]",err]}); res.status(500).json({ message: "Failed to fetch invoices" }); }
  });
  app.post("/api/trades/invoices", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const creationKey=req.get('Idempotency-Key');if(!isUuid(creationKey))return res.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'A creation request key is required'});
      const priorCreation=await storage.getCreationCommandForMerchant(merchantId,creationKey);
      if (!priorCreation&&!(await requireBillingCard(merchantId, res))) return;
      const parsed = createJobInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      // Gap 13: an attached document must be this merchant's own upload. Checked
      // before anything is made, so a rejection writes nothing.
      if (!priorCreation&&!(await requireOwnedInvoiceDocument(merchantId, parsed.data.documentUrl, res))) return;
      let client: TradesClientRef;
      if (parsed.data.recipient) {
        // Quick invoice: no pre-existing client. Storage makes a HIDDEN 'prospect'
        // profile carrying the typed contact details, with the invoice, so the NOT NULL FK
        // and all downstream systems (dispatch, checkout, events) work unchanged.
        // The merchant can promote it to a real client from the success screen.
        const nm = parsed.data.recipient.name.trim();
        const spaceIdx = nm.indexOf(" ");
        client = { prospect: {
          firstName: spaceIdx > 0 ? nm.slice(0, spaceIdx) : nm,
          lastName: spaceIdx > 0 ? nm.slice(spaceIdx + 1) : "",
          email: parsed.data.recipient.email ?? null,
          phone: parsed.data.recipient.phone ?? null,
          siteAddress: "",
          preferredChannel: parsed.data.recipient.channel,
        } };
      } else {
        const saved = await storage.getClientProfileForMerchant(parsed.data.clientProfileId!, merchantId);
        if (!saved) return res.status(404).json({ message: "Client not found" });
        client = { clientProfileId: saved.id };
      }
      if (parsed.data.quoteId) {
        const linked = await storage.getQuoteDeliveryForMerchant(parsed.data.quoteId, merchantId);
        // The quote must be this client's (C10 batch 6d): a deposit on another client's quote billed
        // this client, and its balance was then worked out from the other client's quote.
        if (!linked || !("clientProfileId" in client) || linked.quote.clientProfileId !== client.clientProfileId)
          return res.status(404).json({ message: "Quote not found" });
      }
      // Storage rechecks the client, the quote and the document at the write, makes the checkout
      // token, and commits the hidden prospect (if any), the invoice and its history together.
      const result = await storage.createJobInvoiceForMerchant(merchantId, client, {
        quoteId: parsed.data.quoteId ?? null, kind: parsed.data.kind,
        amountCents: parsed.data.amountCents,
        deliveryChannel: parsed.data.deliveryChannel, jobDetails: parsed.data.jobDetails ?? null,
        dueAt: parsed.data.dueAt,
        scheduledSendAt: parsed.data.scheduledSendAt ?? null,
        splitEnabled: !!parsed.data.splitEnabled,
        documentUrl: parsed.data.documentUrl ?? null, documentName: parsed.data.documentName ?? null,
      },{key:creationKey,actor:commandActor(req,res)});
      if (result.kind === "not-found") return res.status(404).json({ message: "Client not found" });
      if (result.kind === "quote-not-found") return res.status(404).json({ message: "Quote not found" });
      if (result.kind === "invalid-document") return res.status(400).json({ message: "Invalid document attachment" });
      const row = result.invoice;
      const shouldSendNow = !row.scheduledSendAt || new Date(row.scheduledSendAt) <= new Date();
      const record=await storage.getCreationCommandForMerchant(merchantId,creationKey),sentAt=row.sentAt||row.dispatchedAt;
      const confirmed=!!record&&!!sentAt&&new Date(sentAt).getTime()>=record.createdAt.getTime();
      const delivery = result.commandReused?{sent:confirmed,reason:confirmed?'reused':'processing'}:shouldSendNow ? await resendTradeInvoiceForMerchant(row.id, merchantId, getBaseUrl(req)) : { sent: false, reason: "scheduled" };
      if (delivery.reason === "reconciliation_required") return res.status(503).json(TRADES_INVOICE_RECONCILIATION);
      // The answer is read back through the business's scope, not from a row held across the send.
      const fresh = await storage.getJobInvoiceForMerchant(row.id, merchantId);
      if (!fresh) return res.status(404).json({ message: "Not found" });
      res.status(201).json({ ...fresh, delivered: delivery.sent, deliveryReason: delivery.reason });
    } catch (err) {if(err instanceof CreationCommandConflict)return res.status(409).json({code:err.code,message:'The original creation details differ. Keep the original request.'}); logOperation("error","TRADES_INVOICES_POST",{payload:["[TRADES_INVOICES_POST]",err]}); res.status(500).json({ message: "Failed to create invoice" }); }
  });
  // (Removed POST /api/trades/invoices/:id/resend, owner decision 2026-09-27: no screen called it; the
  // cron sends an invoice that failed to go, and the reminders follow up.)

  app.post("/api/trades/invoices/:id/send-balance", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      // Only the split switch (C10 batch 6d): it was read from the raw body, so "yes" turned splitting on.
      const body = sendJobBalanceSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.errors[0].message });
      // Issue the remaining balance for a deposit-paid job.
      const dep = await storage.getJobInvoiceForMerchant(id, merchantId);
      if (!dep) return res.status(404).json({ message: "Not found" });
      if (!(await requireBillingCard(merchantId, res))) return;
      if (dep.kind !== "deposit") return res.status(400).json({ message: BALANCE_REFUSALS["not-deposit"][1] });
      if (!["paid", "paid_external", "deposit_paid"].includes(dep.status))
        return res.status(409).json({ message: BALANCE_REFUSALS.unpaid[1] });
      if (!dep.quoteId) return res.status(400).json({ message: BALANCE_REFUSALS["no-quote"][1] });
      // Storage rechecks the deposit under the client's and its own row locks, subtracts everything
      // already billed to the client on the quote and not voided (the deposit plus any other invoice,
      // so a balance never double-bills), and commits the one balance with its history: two sends
      // at the same moment make one (R1-T7 S4b2).
      const result = await storage.createJobBalanceInvoiceForMerchant(id, merchantId, !!body.data.splitEnabled,commandActor(req,res));
      if (result.kind === "not-found") return res.status(404).json({ message: "Not found" });
      if (result.kind === "conflict") {
        const [status, message] = BALANCE_REFUSALS[result.reason];
        return res.status(status).json({ message });
      }
      const delivery = result.reused?{sent:!!result.invoice.dispatchedAt,reason:result.invoice.dispatchedAt?'reused':'processing'}:await resendTradeInvoiceForMerchant(result.invoice.id, merchantId, getBaseUrl(req));
      if (delivery.reason === "reconciliation_required") return res.status(503).json(TRADES_INVOICE_RECONCILIATION);
      // The answer is read back through the business's scope, not from a row held across the send.
      const fresh = await storage.getJobInvoiceForMerchant(result.invoice.id, merchantId);
      if (!fresh) return res.status(404).json({ message: "Not found" });
      res.status(201).json({ ...fresh, delivered: delivery.sent, deliveryReason: delivery.reason });
    } catch (err) { logOperation("error","TRADES_INVOICES_SEND_BALANCE",{payload:["[TRADES_INVOICES_SEND_BALANCE]",err]}); res.status(500).json({ message: "Failed to send balance invoice" }); }
  });
  app.post("/api/trades/invoices/:id/mark-paid-external", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const inv = await storage.getJobInvoiceForMerchant(id, merchantId);
      if (!inv) return res.status(404).json({ message: "Not found" });
      // A voided or paid invoice stays as it is (C10 batch 6d): the screens offer this only on an
      // unpaid one, and each call emailed the client another receipt.
      if (inv.status === "voided") return res.status(409).json({ message: "This invoice was voided" });
      if (inv.status === "paid") return res.status(409).json({ message: "This invoice is already paid" });
      const parsed = markJobPaidExternalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      // Storage rechecks the business and the invoice's state at the write, and saves the history with it.
      await reconcileBeforeManualChange('trades',id,merchantId);
      const result = await storage.markJobInvoicePaidExternalForMerchant(id, merchantId, parsed.data.externalPaymentReference,commandActor(req,res));
      if (result.kind === "not-found") return res.status(404).json({ message: "Not found" });
      if (result.kind === "conflict" && result.reason === "payment-active") return res.status(409).json({
        message: "Payment is in progress or a share is already paid", code: "PAYMENT_ACTIVE",
      });
      if (result.kind === "conflict") return res.status(409).json({ message: result.reason === "voided" ? "This invoice was voided" : "This invoice is already paid" });
      // Payer receipt is committed with the manual event and delivered by its
      // outbox key, so a lost response/retry cannot send a second receipt.
      res.json(result.invoice);
    } catch (err) { logOperation("error","TRADES_INVOICES_MARK_PAID",{payload:["[TRADES_INVOICES_MARK_PAID]",err]}); res.status(500).json({ message: "Failed to mark invoice paid" }); }
  });
  app.post("/api/trades/invoices/:id/complete", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const inv = await storage.getJobInvoiceForMerchant(id, merchantId);
      if (!inv) return res.status(404).json({ message: "Not found" });
      // A paid deposit is only part-payment — the balance must still be collected,
      // so don't let a deposit invoice close out the job.
      const DEPOSIT = { message: "Send and collect the balance before completing the job" };
      const UNPAID = { message: "Invoice must be paid before completing the job" };
      if (inv.kind === "deposit") return res.status(409).json(DEPOSIT);
      if (!["paid", "paid_external"].includes(inv.status)) return res.status(409).json(UNPAID);
      const result = await storage.completeJobInvoiceForMerchant(id, merchantId);
      if (result.kind === "not-found") return res.status(404).json({ message: "Not found" });
      if (result.kind === "conflict") return res.status(409).json(result.reason === "deposit" ? DEPOSIT : UNPAID);
      res.json(result.invoice);
    } catch (err) { logOperation("error","TRADES_INVOICES_COMPLETE",{payload:["[TRADES_INVOICES_COMPLETE]",err]}); res.status(500).json({ message: "Failed to complete invoice" }); }
  });
  app.post("/api/trades/invoices/:id/void", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const inv = await storage.getJobInvoiceForMerchant(id, merchantId);
      if (!inv) return res.status(404).json({ message: "Not found" });
      // A paid invoice stays paid (C10 batch 6d): the screens offer cancelling only an unpaid one.
      if (inv.status === "paid" || inv.status === "paid_external") return res.status(409).json({ message: "This invoice is paid" });
      // The client's history shows the cancellation, as a rent invoice's does (owner decision
      // 2026-09-27): storage saves it with the change.
      await reconcileBeforeManualChange('trades',id,merchantId);
      const result = await storage.voidJobInvoiceForMerchant(id, merchantId,commandActor(req,res));
      if (result.kind === "not-found") return res.status(404).json({ message: "Not found" });
      if (result.kind === "conflict" && result.reason === "payment-active") return res.status(409).json({
        message: "Payment is in progress or a share is already paid", code: "PAYMENT_ACTIVE",
      });
      if (result.kind === "conflict") return res.status(409).json({ message: "This invoice is paid" });
      res.json(result.invoice);
    } catch (err) { logOperation("error","TRADES_INVOICES_VOID",{payload:["[TRADES_INVOICES_VOID]",err]}); res.status(500).json({ message: "Failed to void invoice" }); }
  });

  app.get("/api/trades/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      res.json(await storage.getJobSchedulesByMerchant(merchantId));
    } catch (err) { logOperation("error","TRADES_SCHEDULES_GET",{payload:["[TRADES_SCHEDULES_GET]",err]}); res.status(500).json({ message: "Failed to fetch schedules" }); }
  });
  app.post("/api/trades/schedules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      if (!(await requireBillingCard(merchantId, res))) return;
      const parsed = createJobScheduleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      if (parsed.data.endDate && parsed.data.endDate < parsed.data.startDate)
        return res.status(400).json({ message: "End date cannot be before start date" });
      // Not in the past (owner decision 2026-09-27): a past start billed every period since, one
      // overdue invoice per cron run. A day's grace: the forms send today's UTC date at 09:00 UTC.
      if (parsed.data.startDate.getTime() < Date.now() - RECURRING_START_GRACE_MS)
        return res.status(400).json({ message: "The start date can't be in the past" });
      const client = await storage.getClientProfileForMerchant(parsed.data.clientProfileId, merchantId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      // Archiving cancels a client's recurring invoices (owner decision 2026-09-27), and the screens
      // offer only current clients.
      if (client.status === "archived") return res.status(409).json({ message: "This client is archived" });
      // Storage locks the client, rechecks both at the write, and commits the recurring invoice,
      // first run on its start date, with its history: an archive beside it cannot leave it live.
      const result = await storage.createJobScheduleForMerchant(client.id, merchantId, {
        amountCents: parsed.data.amountCents, frequency: parsed.data.frequency, deliveryChannel: parsed.data.deliveryChannel,
        startDate: parsed.data.startDate, endDate: parsed.data.endDate,
      });
      if (result.kind === "not-found") return res.status(404).json({ message: "Client not found" });
      if (result.kind === "conflict") return res.status(409).json({ message: "This client is archived" });
      res.status(201).json(result.schedule);
    } catch (err) { logOperation("error","TRADES_SCHEDULES_POST",{payload:["[TRADES_SCHEDULES_POST]",err]}); res.status(500).json({ message: "Failed to create schedule" }); }
  });
  app.put("/api/trades/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getJobScheduleForMerchant(id, merchantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      // A cancelled recurring invoice stays cancelled (C10 batch 6d): the screens hide its buttons, and
      // resuming it would bill again. DELETE is how one is cancelled.
      const CANCELLED = { message: "This recurring invoice was cancelled" };
      if (existing.status === "terminated") return res.status(409).json(CANCELLED);
      const parsed = updateJobScheduleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      // Storage rechecks the business and the cancelled state at the write, and saves the change with
      // its history. Resuming skips the paused time (owner decision 2026-09-27), as for rent: storage
      // moves the next date to the first date on the locked row's own cycle after now, instead of
      // billing every period it missed.
      const result = await storage.updateJobScheduleForMerchant(id, merchantId, parsed.data);
      if (result.kind === "not-found") return res.status(404).json({ message: "Not found" });
      if (result.kind === "conflict") return res.status(409).json(CANCELLED);
      res.json(result.schedule);
    } catch (err) { logOperation("error","TRADES_SCHEDULES_PUT",{payload:["[TRADES_SCHEDULES_PUT]",err]}); res.status(500).json({ message: "Failed to update schedule" }); }
  });
  app.delete("/api/trades/schedules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) return res.status(403).json(MERCHANT_ACCESS_REQUIRED);
      const id = strictUuidParam(req.params.id);
      if (id === null) return res.status(400).json({ message: "Invalid id" });
      const existing = await storage.getJobScheduleForMerchant(id, merchantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      // Storage rechecks the business at the write and saves the cancellation with its history.
      const result = await storage.terminateJobScheduleForMerchant(id, merchantId);
      if (result.kind !== "ok") return res.status(404).json({ message: "Not found" });
      res.json(result.schedule);
    } catch (err) { logOperation("error","TRADES_SCHEDULES_DELETE",{payload:["[TRADES_SCHEDULES_DELETE]",err]}); res.status(500).json({ message: "Failed to delete schedule" }); }
  });

  // ── Cron endpoint ─────────────────────────────────────────────────────────

  app.get("/api/internal/cron/status", async (req, res) => {
    if (!authorizeCronRequest(req, res)) return;
    res.set("Cache-Control","no-store");
    if(!cron)return res.status(503).json({message:"Durable cron coordination unavailable"});
    try{return res.json(await cron.status());}
    catch{logOperation('error','cron_status_unavailable');return res.status(503).json({message:"Cron status unavailable"});}
  });

  app.post("/api/internal/cron", async (req, res) => {
    if (!authorizeCronRequest(req, res)) return;
    res.set("Cache-Control","no-store");
    if(!cron)return res.status(503).json({message:"Durable cron coordination unavailable"});
    const now=new Date(),baseUrl=getBaseUrl(req);
    try{
      const result=await cron.run([
        {name:'subscriptionBilling',run:async()=>{const {runSubscriptionBillingPass}=await import('./subscription-cron');return runSubscriptionBillingPass(now);}},
        {name:'generate',run:async()=>{const {runGeneratePass}=await import('./property-cron');return runGeneratePass(now);}},
        {name:'tradesGenerate',run:async()=>{const {runTradesGeneratePass}=await import('./trades-cron');return runTradesGeneratePass(now);}},
        {name:'dispatch',run:async()=>{const {runDispatchPass}=await import('./property-cron');return runDispatchPass(baseUrl);}},
        {name:'tradesDispatch',run:async()=>{const {runTradesDispatchPass}=await import('./trades-delivery');return runTradesDispatchPass(baseUrl);}},
        {name:'overdue',run:async()=>{const {runOverduePass}=await import('./property-cron');return runOverduePass(now);}},
        {name:'tradesOverdue',run:async()=>{const {runTradesOverduePass}=await import('./trades-delivery');return runTradesOverduePass(now);}},
        {name:'reminders',run:async()=>{const {runReminderPass}=await import('./property-cron');return runReminderPass(baseUrl,now);}},
        {name:'tradesReminders',run:async()=>{const {runTradesReminderPass}=await import('./trades-delivery');return runTradesReminderPass(baseUrl,now);}},
        {name:'dailyPayoutNotifications',run:async()=>{const {runDailyPayoutNotificationPass}=await import('./daily-payout-notifications');return runDailyPayoutNotificationPass(now);}},
        {name:'uploadScans',run:async()=>{const {runUploadScanPass}=await import('./upload-lifecycle');return runUploadScanPass();}},
        {name:'uploadRetention',run:async()=>{const {runUploadRetentionPass}=await import('./upload-lifecycle');return runUploadRetentionPass(now);}},
      ]);
      if(result.kind==='busy')return res.status(409).json({message:"A cron run is already in progress"});
      if(result.kind==='unavailable')return res.status(503).json({message:"Cron coordination unavailable"});
      return res.status(result.ok?200:207).json({...result.jobs,ok:result.ok,runId:result.runId,ranAt:result.ranAt,failedPasses:result.failedPasses,duplicate:result.duplicate===true});
    }catch{logOperation('error','cron_run_unavailable');return res.status(503).json({message:"Cron coordination unavailable"});}
  });

  const httpServer = options.httpServer??createServer(app);
  httpServer.once("close",()=>{cron?.stop();});
  return httpServer;
}
