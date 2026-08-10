import { users, type User, type UserStatus, merchants, merchantTutorialProgress, transactions, merchantSettlements, refunds, splitPayments, paymentAttempts, PAYMENT_RETURN_STATE_MAX_AGE_MS, taptStones, stockItems, merchantSubscriptions, subscriptionBillingHistory, pushSubscriptions, pushNotificationDeliveries, normalizePushNotificationPreferences, DEFAULT_PUSH_NOTIFICATION_PREFERENCES, tenantProfiles, activeSchedules, invoicesRentRequests, transactionEvents, clientProfiles, quotes, jobInvoices, jobSchedules, jobEvents, type Merchant, type MerchantTutorialProgress, type Transaction, type SplitPayment, type PaymentAttempt, type InsertMerchant, type InsertTransaction, type CreateMerchant, type Refund, type InsertRefund, type TaptStone, type InsertTaptStone, type StockItem, type InsertStockItem, type MerchantSubscription, type SubscriptionBillingHistory, type PushSubscription, type PushNotificationPreferences, type PushNotificationEventType } from "@shared/schema";
import { DEFAULT_PLAN_ID, isUpgrade, planFor, planForOrDefault, type PlanId } from "@shared/plans";
import { decideBilling, failedPaymentUpdates, immediatePlanUpdates, MAX_PAYMENT_ATTEMPTS, nextBillingPeriodStart, nextPeriodUpdates, proratedUpgradeCents, queuedPlanUpdates, renewalPlan } from "./subscription-billing";
import { getDb, isDatabaseConnected } from "./database";
import { eq, ne, desc, asc, and, inArray, notInArray, gte, lte, lt, or, ilike, sql, isNull, isNotNull } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type {
  AttachPaymentAttemptSessionRecordInput,
  AttachPaymentAttemptSessionResult,
  ClaimPaymentAttemptFinalizationRecordInput,
  ClaimPaymentAttemptFinalizationResult,
  ClaimPaymentAttemptRecordInput,
  ClaimPaymentAttemptResult,
  FinalizePaymentAttemptRecordInput,
  FinalizePaymentAttemptResult,
  PaymentAttemptRepository,
} from "./payment-attempt-service";

export type ActiveTransactionScope =
  | { kind: "merchant-any" }
  | { kind: "legacy-no-board" }
  | { kind: "board"; stoneId: number };

export type PushSubscriptionInput = {
  merchantId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

export type DailyPushPaymentSummary = {
  merchantId: number;
  amount: string;
  paymentCount: number;
};

export type PushNotificationDeliveryStatus = "processed" | "skipped" | "failed";
export const PUSH_NOTIFICATION_DELIVERY_LEASE_MS = 15 * 60 * 1000;
export const SUBSCRIPTION_BILLING_CLAIM_LEASE_MS = 15 * 60 * 1000;

export class SubscriptionBillingBusyError extends Error {
  readonly code = "SUBSCRIPTION_BILLING_BUSY";

  constructor() {
    super("Subscription billing is already in progress");
    this.name = "SubscriptionBillingBusyError";
  }
}

/**
 * Internal transaction input accepted by storage implementations. The external
 * insert/request schemas omit the digest; only a server service can add it while
 * canonicalizing a validated request.
 */
export type TransactionStorageInput = Omit<InsertTransaction, "selectedStoneId"> & {
  taptStoneId?: Transaction["taptStoneId"];
  paymentTokenHash?: Transaction["paymentTokenHash"];
};

export type TransactionServerOwnedFields = Readonly<{
  paymentTokenHash?: Transaction["paymentTokenHash"];
}>;

type RuntimeTransactionFields = InsertTransaction & {
  completedAt?: unknown;
  paymentTokenHash?: unknown;
  rawToken?: unknown;
  paymentToken?: unknown;
  token?: unknown;
};

/**
 * Canonicalize the current external transaction shape without ever forwarding
 * its request-only `selectedStoneId` alias to the database driver.
 */
export function toTransactionStorageInput(
  transaction: InsertTransaction,
  serverOwned: TransactionServerOwnedFields = {},
): TransactionStorageInput {
  const {
    selectedStoneId,
    completedAt: _callerCompletedAt,
    paymentTokenHash: _callerPaymentTokenHash,
    rawToken: _rawToken,
    paymentToken: _paymentToken,
    token: _token,
    ...canonical
  } = transaction as RuntimeTransactionFields;
  return {
    ...canonical,
    taptStoneId:
      canonical.taptStoneId !== undefined
        ? canonical.taptStoneId
        : selectedStoneId ?? null,
    ...(serverOwned.paymentTokenHash !== undefined
      ? { paymentTokenHash: serverOwned.paymentTokenHash }
      : {}),
  };
}

/**
 * Storage is allowed to receive a digest but never a bearer secret. Keep this
 * runtime projection even though TypeScript already excludes raw-token fields.
 */
function sanitizeTransactionStorageInput(
  input: TransactionStorageInput,
): TransactionStorageInput {
  const {
    selectedStoneId,
    completedAt: _callerCompletedAt,
    rawToken: _rawToken,
    paymentToken: _paymentToken,
    token: _token,
    ...canonical
  } = input as TransactionStorageInput & {
    selectedStoneId?: number | null;
    completedAt?: unknown;
    rawToken?: unknown;
    paymentToken?: unknown;
    token?: unknown;
  };
  return {
    ...canonical,
    taptStoneId:
      canonical.taptStoneId !== undefined
        ? canonical.taptStoneId
        : selectedStoneId ?? null,
  };
}

export interface SubscriptionCardInput {
  windcaveCardId: string;
  brand: string | null;
  last4: string | null;
  expiry: string | null;
}

export interface SubscriptionCardChargeRequest {
  subscriptionId: number;
  merchantId: number;
  cardId: string;
  amountCents: number;
  idempotencyKey: string;
  reference: string;
}

export type SubscriptionCardSessionState =
  | "pending"
  | "succeeded"
  | "declined";

function subscriptionCardSessionDigest(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

function terminalSubscriptionCardSessionRef(
  state: Exclude<SubscriptionCardSessionState, "pending">,
  sessionId: string,
): string {
  return `${state}:${subscriptionCardSessionDigest(sessionId)}`;
}

export function subscriptionCardSessionState(
  subscription: Pick<MerchantSubscription, "windcaveBillingRef"> | null | undefined,
  sessionId: string,
): SubscriptionCardSessionState | null {
  if (!subscription?.windcaveBillingRef || !sessionId) return null;
  if (subscription.windcaveBillingRef === sessionId) return "pending";
  const digest = subscriptionCardSessionDigest(sessionId);
  if (subscription.windcaveBillingRef === `succeeded:${digest}`) return "succeeded";
  if (subscription.windcaveBillingRef === `declined:${digest}`) return "declined";
  return null;
}

export type SubscriptionCardChargeExecutor = (
  request: SubscriptionCardChargeRequest,
) => Promise<PlanUpgradeChargeResult>;

export type SubscriptionCardSetupResult =
  | {
      ok: true;
      subscription: MerchantSubscription;
      charged: boolean;
    }
  | {
      ok: false;
      reason: "not-found" | "session-mismatch" | "billing-busy" | "invalid-state" | "charge-failed" | "declined";
      message: string;
    };

export type CancelSubscriptionResult =
  | { ok: true; subscription: MerchantSubscription }
  | { ok: false; reason: "not-found" | "billing-busy" };

export type PlanChangeResult =
  | { ok: true; subscription: MerchantSubscription; applied: "immediate" | "queued" }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "too-many-seats"; seatsInUse: number; seatLimit: number }
  | {
      ok: false;
      reason: "payment-method-required" | "billing-busy" | "invalid-state" | "declined" | "charge-failed";
      message: string;
    };

export interface PlanUpgradeChargeRequest {
  subscriptionId: number;
  merchantId: number;
  targetPlanId: PlanId;
  cardId: string;
  amountCents: number;
  idempotencyKey: string;
  reference: string;
}

export type PlanUpgradeChargeResult =
  | {
      success: true;
      approved: boolean;
      windcaveTransactionId?: string;
      declineReason?: string;
    }
  | { success: false; error: string };

export type PlanUpgradeChargeExecutor = (
  request: PlanUpgradeChargeRequest,
) => Promise<PlanUpgradeChargeResult>;

export type MerchantSignupStorageInput = CreateMerchant & {
  verificationToken: string;
  passwordHash?: string;
  planId?: PlanId;
  contactEmail?: string;
  contactPhone?: string;
  businessAddress?: string;
  nzbn?: string | null;
  gstNumber?: string | null;
  director?: string | null;
  businessDescription?: string | null;
  websiteUrl?: string | null;
  estimatedAnnualTurnover?: string | null;
  onboardingCompleted?: boolean;
};

export interface InviteTeamMemberInput {
  email: string;
  name?: string | null;
  /** SHA-256 of the raw invite token. The raw token is emailed, never stored. */
  inviteTokenHash: string;
  inviteExpiresAt: Date;
}

export type InviteTeamMemberResult =
  | { ok: true; user: User }
  | { ok: false; reason: "seat-limit"; seatsInUse: number; seatLimit: number }
  | { ok: false; reason: "email-taken" };

export type TeamMemberStatusResult =
  | { ok: true; user: User }
  | { ok: false; reason: "not-found" | "owner" | "invalid-state" }
  | { ok: false; reason: "seat-limit"; seatsInUse: number; seatLimit: number };

export type RotateTeamInviteResult =
  | { ok: true; user: User }
  | { ok: false; reason: "not-found" | "conflict" }
  | { ok: false; reason: "seat-limit"; seatsInUse: number; seatLimit: number };

export interface SubscriptionRevenue {
  /** Committed monthly recurring revenue, in dollars. */
  monthlyRecurringRevenue: number;
  /** Subscriptions actually expected to pay next period. */
  payingSubscriptions: number;
  /** Every subscription row, including cancelled and suspended. */
  totalSubscriptions: number;
  byPlan: Record<string, { count: number; monthlyRevenue: number }>;
  pastDue: number;
  suspended: number;
  cancelling: number;
}

/**
 * MRR counts only subscriptions that will actually be charged next period:
 * `active` and not cancelling. Past-due rows are excluded — they represent money
 * we have failed to collect, and counting them would flatter the number.
 */
export function summariseSubscriptionRevenue(
  rows: readonly {
    planId?: string | null;
    priceCents?: number | null;
    status?: string | null;
    cancelAtPeriodEnd?: boolean | null;
    lastBillingDate?: string | null;
  }[],
): SubscriptionRevenue {
  const byPlan: Record<string, { count: number; monthlyRevenue: number }> = {};
  let monthlyCents = 0;
  let payingSubscriptions = 0;
  let pastDue = 0;
  let suspended = 0;
  let cancelling = 0;

  for (const row of rows) {
    if (row.status === "past_due") pastDue += 1;
    if (row.status === "suspended") suspended += 1;
    if (row.cancelAtPeriodEnd) cancelling += 1;

    // Do not report onboarding rows as revenue before a charge has succeeded.
    const counts = row.status === "active"
      && !row.cancelAtPeriodEnd
      && !!row.lastBillingDate;
    if (!counts) continue;

    const planId = row.planId ?? DEFAULT_PLAN_ID;
    const cents = row.priceCents ?? planFor(DEFAULT_PLAN_ID).priceCents;
    monthlyCents += cents;
    payingSubscriptions += 1;
    const bucket = byPlan[planId] ?? { count: 0, monthlyRevenue: 0 };
    bucket.count += 1;
    bucket.monthlyRevenue = Number((bucket.monthlyRevenue + cents / 100).toFixed(2));
    byPlan[planId] = bucket;
  }

  return {
    monthlyRecurringRevenue: Number((monthlyCents / 100).toFixed(2)),
    payingSubscriptions,
    totalSubscriptions: rows.length,
    byPlan,
    pastDue,
    suspended,
    cancelling,
  };
}

/**
 * Column values for a brand-new subscription. Every creation path goes through
 * here so a merchant can never end up with a plan, seat limit and price that
 * disagree with the catalogue.
 */
export function newSubscriptionValues(merchantId: number, now: Date = new Date()) {
  const plan = planFor(DEFAULT_PLAN_ID);
  return {
    merchantId,
    planId: plan.id,
    seatLimit: plan.seats,
    priceCents: plan.priceCents,
    status: "pending",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingDate: null,
    lastBillingDate: null,
    currentMonthTransactions: 0,
    totalLifetimeTransactions: 0,
    monthStartDate: now,
  };
}

/**
 * Adds one calendar month, clamping to the last day of the target month so a
 * subscription started on the 31st does not skip a month. Billing dates must be
 * derived with this, never with `setMonth` alone.
 */
export function addOneMonth(from: Date): Date {
  const result = new Date(from);
  const targetMonth = result.getUTCMonth() + 1;
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  const lastDayOfTargetMonth = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(from.getUTCDate(), lastDayOfTargetMonth));
  return result;
}

export class TaptStoneCapacityError extends Error {
  readonly code = "TAPT_STONE_LIMIT";

  constructor() {
    super("Maximum 10 tapt stones allowed per merchant");
    this.name = "TaptStoneCapacityError";
  }
}

export class TaptStoneConflictError extends Error {
  readonly code = "TAPT_STONE_CONFLICT";

  constructor() {
    super("A tapt stone with that number already exists");
    this.name = "TaptStoneConflictError";
  }
}

export type BillSplitConflictReason =
  | "invalid-count"
  | "transaction-not-pending"
  | "already-configured"
  | "split-in-progress"
  | "inconsistent-split-state";

export class BillSplitConflictError extends Error {
  readonly code = "BILL_SPLIT_CONFLICT";

  constructor(readonly reason: BillSplitConflictReason) {
    super(
      reason === "invalid-count"
        ? "Total splits must be an integer between 2 and 10"
        : "The transaction split can no longer be configured",
    );
    this.name = "BillSplitConflictError";
  }
}

function moneyStringToCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new BillSplitConflictError("inconsistent-split-state");
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

function centsToMoneyString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function transactionSplitAmounts(price: string, totalSplits: number): string[] {
  if (!Number.isInteger(totalSplits) || totalSplits < 2 || totalSplits > 10) {
    throw new BillSplitConflictError("invalid-count");
  }
  const totalCents = moneyStringToCents(price);
  if (totalCents < totalSplits) {
    throw new BillSplitConflictError("invalid-count");
  }
  const baseCents = Math.floor(totalCents / totalSplits);
  const finalCents = totalCents - baseCents * (totalSplits - 1);
  return Array.from(
    { length: totalSplits },
    (_, index) => centsToMoneyString(index === totalSplits - 1 ? finalCents : baseCents),
  );
}

const TAPT_STONE_LIMIT = 10;
// Stable two-key advisory-lock namespace. The second key is the merchant ID.
const TAPT_STONE_ALLOCATION_LOCK_NAMESPACE = 1_413_566_548; // ASCII "TAPT"

function firstFreeTaptStoneNumber(stones: Iterable<Pick<TaptStone, "stoneNumber">>): number | undefined {
  const usedNumbers = new Set(Array.from(stones, (stone) => stone.stoneNumber));
  for (let stoneNumber = 1; stoneNumber <= TAPT_STONE_LIMIT; stoneNumber += 1) {
    if (!usedNumbers.has(stoneNumber)) return stoneNumber;
  }
  return undefined;
}

function compareTransactionsNewest(a: Transaction, b: Transaction): number {
  const createdDifference = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  return createdDifference || b.id - a.id;
}

const LIVE_PAYMENT_ATTEMPT_STATES = new Set([
  "claiming",
  "ready",
  "finalizing",
]);
const TERMINAL_PAYMENT_ATTEMPT_STATES = new Set([
  "approved",
  "declined",
  "cancelled",
]);

function paymentAttemptIsLive(attempt: PaymentAttempt): boolean {
  return LIVE_PAYMENT_ATTEMPT_STATES.has(attempt.state);
}

function paymentAttemptIsTerminal(attempt: PaymentAttempt): boolean {
  return TERMINAL_PAYMENT_ATTEMPT_STATES.has(attempt.state);
}

function paymentAttemptLeaseExpired(attempt: PaymentAttempt, now: Date): boolean {
  return paymentAttemptIsLive(attempt) && attempt.leaseExpiresAt.getTime() <= now.getTime();
}

async function withMemLock<T>(
  locks: Map<string, Promise<void>>,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lockTail = previous.then(() => current);
  locks.set(key, lockTail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === lockTail) locks.delete(key);
  }
}

function isPostgresUniqueViolation(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    if ((current as { code?: unknown }).code === "23505") return true;
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function isNeonEmptyResultError(error: unknown): boolean {
  return error instanceof TypeError && error.message === "Cannot read properties of null (reading 'map')";
}

export interface IStorage extends PaymentAttemptRepository {
  // Merchant operations
  getMerchant(id: number): Promise<Merchant | undefined>;
  getMerchantByName(name: string): Promise<Merchant | undefined>;
  getMerchantByEmail(email: string): Promise<Merchant | undefined>;
  getMerchantByToken(token: string): Promise<Merchant | undefined>;
  getMerchantByResetToken(resetToken: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  createMerchantWithPassword(merchantData: any, passwordHash: string): Promise<Merchant>;
  createMerchantWithSignup(data: MerchantSignupStorageInput): Promise<Merchant>;
  verifyMerchant(token: string, passwordHash: string): Promise<Merchant | undefined>;
  confirmMerchantEmail(token: string, onboardingCompleted: boolean): Promise<Merchant | undefined>;
  updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined>;
  updateMerchantPasswordHash(id: number, passwordHash: string): Promise<Merchant | undefined>;
  updateMerchant(id: number, updates: Partial<Merchant>): Promise<Merchant | undefined>;
  updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant | undefined>;
  updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant | undefined>;
  updateMerchantTheme(id: number, themeId: string): Promise<Merchant | undefined>;
  updateMerchantLogoUrl(id: number, logoUrl: string | null): Promise<Merchant | undefined>;
  updateMerchantBillingCard(id: number, card: { last4: string; brand: string; expiry: string } | null): Promise<Merchant | undefined>;
  getMerchantTutorialProgress(merchantId: number, generation: number): Promise<MerchantTutorialProgress[]>;
  upsertMerchantTutorialProgress(merchantId: number, generation: number, pageKey: string, status: string, lastStep: number): Promise<MerchantTutorialProgress>;
  restartMerchantTutorial(merchantId: number): Promise<Merchant | undefined>;
  getAllMerchants(): Promise<Merchant[]>;
  deleteMerchant(id: number): Promise<boolean>;
  
  // Transaction operations
  getTransaction(id: number): Promise<Transaction | undefined>;
  getTransactionByPaymentTokenHash(paymentTokenHash: string): Promise<Transaction | undefined>;
  /**
   * Find the merchant's newest active transaction within an explicit audience
   * scope. Public shared-link callers use `legacy-no-board`, which excludes
   * per-payment credentials as well as board-bound rows; authenticated
   * merchant callers that intentionally see every board use `merchant-any`.
   */
  getActiveTransactionByMerchant(merchantId: number, scope: ActiveTransactionScope): Promise<Transaction | undefined>;
  getTransactionByNfcSession(nfcSessionId: string): Promise<Transaction | undefined>;
  createTransaction(transaction: TransactionStorageInput): Promise<Transaction>;
  updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined>;
  updateTransactionPaymentMethod(id: number, paymentMethod: string): Promise<Transaction | undefined>;
  updateTransactionSplitEnabled(id: number, splitEnabled: boolean): Promise<Transaction | undefined>;
  updateTransactionNfcSession(id: number, nfcSessionId: string): Promise<Transaction | undefined>;
  getTransactionsByMerchant(merchantId: number): Promise<Transaction[]>;
  
  // Bill splitting operations
  createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction | undefined>;
  createSplitPayment(data: any): Promise<any>;
  getSplitPaymentsByTransaction(transactionId: number): Promise<any[]>;
  getSplitPaymentById(id: number): Promise<any | undefined>;
  updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any>;
  getNextPendingSplit(transactionId: number): Promise<any | undefined>;
  
  // Platform revenue is subscription MRR — TaptPay takes no cut of merchant
  // turnover. The historical platform_fees table remains read-only for old
  // accounting records; storage exposes no API capable of adding new fee rows.
  getSubscriptionRevenue(): Promise<SubscriptionRevenue>;
  
  // Refund operations
  createRefund(data: InsertRefund): Promise<Refund>;
  getRefund(id: number): Promise<Refund | undefined>;
  getRefundsByTransaction(transactionId: number): Promise<Refund[]>;
  getRefundsByMerchant(merchantId: number): Promise<Refund[]>;
  updateRefundStatus(id: number, status: string, windcaveRefundId?: string): Promise<Refund | undefined>;
  updateTransactionAfterRefund(id: number, refundAmount: number): Promise<Transaction | undefined>;
  // Atomically reserve a refund against the remaining refundable balance, guarding
  // against concurrent/double-submitted refunds over-refunding. Returns the updated
  // transaction, or null if the reservation would exceed the refundable amount.
  reserveRefundAmount(id: number, refundAmount: number): Promise<Transaction | null | undefined>;
  // Compensating action: release a previously-reserved amount (e.g. the gateway
  // refund failed), restoring the refundable balance.
  releaseRefundAmount(id: number, refundAmount: number): Promise<void>;

  // Tapt Stone operations
  createTaptStone(data: InsertTaptStone): Promise<TaptStone>;
  createNextTaptStone(merchantId: number, name?: string): Promise<TaptStone>;
  getTaptStone(id: number): Promise<TaptStone | undefined>;
  getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]>;
  updateTaptStone(id: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined>;
  updateTaptStoneUrls(id: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined>;
  deleteTaptStone(id: number): Promise<boolean>;
  associateTransactionWithStone(transactionId: number, stoneId: number): Promise<void>;
  
  // Stock Item operations
  createStockItem(data: InsertStockItem): Promise<StockItem>;
  getStockItem(id: number): Promise<StockItem | undefined>;
  getStockItemsByMerchant(merchantId: number): Promise<StockItem[]>;
  updateStockItem(id: number, data: Partial<InsertStockItem>): Promise<StockItem | undefined>;
  deleteStockItem(id: number): Promise<boolean>;
  
  // Analytics operations
  getMerchantAnalytics(merchantId: number): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    weeklyTransactions: number;
    weeklyRevenue: number;
    averageTransaction: number;
  }>;
  
  // Export operations
  getTransactionsByMerchantWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<Transaction[]>;
  getMerchantAnalyticsWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    dateRange: { start: Date | null; end: Date | null };
    averageTransactionValue: number;
    transactionsByStatus: { [key: string]: number };
  }>;
  
  // Clear operations
  clearTransactions(merchantId: number): Promise<boolean>;

  // API Key operations
  createApiKey(data: any): Promise<any>;
  getApiKey(id: number): Promise<any>;
  getApiKeyByKey(apiKey: string): Promise<any>;
  getApiKeysByMerchant(merchantId: number): Promise<any[]>;
  updateApiKeyStatus(id: number, status: string): Promise<any>;
  revokeApiKey(id: number): Promise<boolean>;
  updateApiKeyLastUsed(id: number): Promise<any>;
  
  // API Request tracking
  logApiRequest(data: any): Promise<any>;
  getApiMetrics(merchantId?: number): Promise<any>;
  getApiUsageData(merchantId?: number): Promise<any[]>;
  
  // Subscription operations
  getOrCreateSubscription(merchantId: number): Promise<any>;
  getSubscription(merchantId: number): Promise<any | undefined>;
  incrementTransactionCount(merchantId: number): Promise<void>;
  cancelSubscription(merchantId: number, reason: string): Promise<CancelSubscriptionResult>;
  resumeSubscription(merchantId: number): Promise<any>;
  getBillingHistory(merchantId: number, limit?: number): Promise<any[]>;
  // Applies a plan change under a row lock, refusing a downgrade that would
  // leave more active logins than the target plan allows.
  changeSubscriptionPlan(merchantId: number, planId: PlanId, chargeUpgrade?: PlanUpgradeChargeExecutor): Promise<PlanChangeResult>;
  saveSubscriptionCard(merchantId: number, card: SubscriptionCardInput): Promise<any>;
  bindSubscriptionCardSession(merchantId: number, sessionId: string): Promise<boolean>;
  completeSubscriptionCardSetup(
    merchantId: number,
    sessionId: string,
    card: SubscriptionCardInput,
    charge: SubscriptionCardChargeExecutor,
  ): Promise<SubscriptionCardSetupResult>;
  removeSubscriptionCard(merchantId: number): Promise<any>;
  claimSubscriptionsDueForBilling(
    now: Date,
    limit?: number,
    excludeSubscriptionIds?: readonly number[],
    claimedAt?: Date,
  ): Promise<MerchantSubscription[]>;
  finalizeSubscriptionBillingClaim(
    subscriptionId: number,
    claimToken: string,
    updates: Record<string, unknown>,
    history: Record<string, unknown>,
  ): Promise<boolean>;
  releaseSubscriptionBillingClaim(subscriptionId: number, claimToken: string): Promise<void>;
  expireCancelledSubscriptions(now: Date): Promise<number>;

  // Team seat operations
  getTeamMembers(merchantId: number): Promise<User[]>;
  countSeatsInUse(merchantId: number): Promise<number>;
  inviteTeamMember(merchantId: number, input: InviteTeamMemberInput): Promise<InviteTeamMemberResult>;
  setTeamMemberStatus(merchantId: number, userId: number, status: UserStatus): Promise<TeamMemberStatusResult>;
  rotateTeamInvite(
    merchantId: number,
    userId: number,
    input: Pick<InviteTeamMemberInput, "inviteTokenHash" | "inviteExpiresAt" | "name"> & { expectedTokenHash: string },
  ): Promise<RotateTeamInviteResult>;
  revokeTeamInvite(merchantId: number, userId: number, expectedTokenHash?: string): Promise<boolean>;
  removeTeamMember(merchantId: number, userId: number): Promise<boolean>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByInviteToken(tokenHash: string): Promise<User | undefined>;
  activateInvitedUser(userId: number, tokenHash: string, passwordHash: string, name?: string | null, now?: Date): Promise<User | null>;
  recordUserLogin(userId: number, at: Date): Promise<void>;
  updateUserPassword(userId: number, passwordHash: string): Promise<User | null>;
  setUserResetToken(
    userId: number,
    tokenHash: string | null,
    expiry: Date | null,
  ): Promise<void>;
  getUserByResetToken(tokenHash: string): Promise<User | undefined>;
  resetUserPasswordByToken(tokenHash: string, passwordHash: string, now: Date): Promise<User | null>;


  // Push subscription operations
  createPushSubscription(data: PushSubscriptionInput): Promise<PushSubscription | null>;
  getPushSubscriptionsByMerchant(merchantId: number): Promise<PushSubscription[]>;
  getPushNotificationPreferences(merchantId: number): Promise<PushNotificationPreferences>;
  updatePushNotificationPreferences(
    merchantId: number,
    preferences: PushNotificationPreferences,
  ): Promise<PushNotificationPreferences>;
  deactivatePushSubscription(id: number): Promise<void>;
  deactivatePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
  getDailyPushPaymentSummaries(start: Date, end: Date): Promise<DailyPushPaymentSummary[]>;
  claimPushNotificationDelivery(
    merchantId: number,
    eventType: PushNotificationEventType,
    eventKey: string,
    now?: Date,
  ): Promise<string | null>;
  completePushNotificationDelivery(
    merchantId: number,
    eventType: PushNotificationEventType,
    eventKey: string,
    claimToken: string,
    status: PushNotificationDeliveryStatus,
  ): Promise<void>;

  // Info pack lead capture
  createInfoPackLead(data: { name: string; email: string }): Promise<any>;

  // Webhook delivery tracking
  createWebhookDelivery(data: any): Promise<any>;
  updateWebhookDelivery(id: number, data: any): Promise<any>;
  getWebhookDeliveries(apiKeyId: number): Promise<any[]>;
  
  // Revenue analytics
  getRevenueOverTime(merchantId: number, days?: number): Promise<Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>>;

  // Windcave session tracking
  updateTransactionWindcaveSession(id: number, sessionId: string, sessionState: string, xId: string): Promise<Transaction | undefined>;
  updateTransactionSessionState(id: number, sessionState: string): Promise<Transaction | undefined>;
  getTransactionByWindcaveSessionId(sessionId: string): Promise<Transaction | undefined>;

  // Bill splitting operations
  createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction | undefined>;
  createSplitPayment(data: any): Promise<any>;
  getSplitPaymentsByTransaction(transactionId: number): Promise<any[]>;
  getSplitPaymentById(id: number): Promise<any | undefined>;
  updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any>;
  getNextPendingSplit(transactionId: number): Promise<any | undefined>;

  // ── Property management vertical ──────────────────────────────────────────
  createTenantProfile(data: any): Promise<any>;
  getTenantProfile(id: string): Promise<any | undefined>;
  getTenantProfilesByMerchant(merchantId: number, opts?: { search?: string; includeArchived?: boolean }): Promise<any[]>;
  updateTenantProfile(id: string, updates: any): Promise<any | undefined>;
  archiveTenantProfile(id: string): Promise<any | undefined>;
  unarchiveTenantProfile(id: string): Promise<any | undefined>;

  createActiveSchedule(data: any): Promise<any>;
  getActiveSchedule(id: string): Promise<any | undefined>;
  getActiveSchedulesByTenant(tenantProfileId: string): Promise<any[]>;
  getActiveSchedulesByMerchant(merchantId: number): Promise<any[]>;
  updateActiveSchedule(id: string, updates: any): Promise<any | undefined>;
  terminateActiveSchedule(id: string): Promise<any | undefined>;
  getDueActiveSchedules(now: Date): Promise<any[]>;

  createInvoiceRentRequest(data: any): Promise<any>;
  getInvoiceRentRequest(id: string): Promise<any | undefined>;
  getInvoiceRentRequestByToken(token: string): Promise<any | undefined>;
  getInvoiceRentRequestByWindcaveSessionId(sessionId: string): Promise<any | undefined>;
  getInvoiceRentRequestsByMerchant(merchantId: number, opts?: { status?: string; tenantProfileId?: string }): Promise<any[]>;
  updateInvoiceRentRequest(id: string, updates: any): Promise<any | undefined>;
  atomicClaimSplitShare(invoiceId: string, sessionId: string): Promise<any | null>;
  getInvoiceRentRequestByWhatsappMessageId(messageId: string): Promise<any | undefined>;
  getPendingDispatchInvoices(): Promise<any[]>;
  getOverdueEligibleInvoices(now: Date): Promise<any[]>;
  getReminderEligibleInvoices(): Promise<any[]>;
  getLiveInvoiceByTenant(tenantProfileId: string): Promise<any | undefined>;

  logTransactionEvent(data: any): Promise<any>;
  getTransactionEventsByTenant(tenantProfileId: string, limit?: number): Promise<any[]>;
  getTransactionEventsByInvoice(invoiceId: string): Promise<any[]>;

  // ── Trades vertical ───────────────────────────────────────────────────────
  createClientProfile(data: any): Promise<any>;
  getClientProfile(id: string): Promise<any | undefined>;
  getClientProfilesByMerchant(merchantId: number): Promise<any[]>;
  updateClientProfile(id: string, updates: any): Promise<any | undefined>;
  archiveClientProfile(id: string): Promise<any | undefined>;
  unarchiveClientProfile(id: string): Promise<any | undefined>;

  createQuote(data: any): Promise<any>;
  getQuote(id: string): Promise<any | undefined>;
  getQuoteByToken(token: string): Promise<any | undefined>;
  getQuotesByMerchant(merchantId: number, opts?: { status?: string }): Promise<any[]>;
  updateQuote(id: string, updates: any): Promise<any | undefined>;

  createJobInvoice(data: any): Promise<any>;
  getJobInvoice(id: string): Promise<any | undefined>;
  getJobInvoiceByToken(token: string): Promise<any | undefined>;
  getJobInvoiceByWindcaveSessionId(sessionId: string): Promise<any | undefined>;
  getJobInvoiceByWhatsappMessageId(messageId: string): Promise<any | undefined>;
  getJobInvoicesByMerchant(merchantId: number, opts?: { status?: string; clientProfileId?: string }): Promise<any[]>;
  getJobInvoicesByQuote(quoteId: string): Promise<any[]>;
  updateJobInvoice(id: string, updates: any): Promise<any | undefined>;
  getJobInvoiceByScheduleAndDue(scheduleId: string, dueAt: Date): Promise<any | undefined>;
  atomicClaimJobSplitShare(invoiceId: string, sessionId: string): Promise<any | null>;
  getPendingDispatchJobInvoices(): Promise<any[]>;
  getOverdueEligibleJobInvoices(now: Date): Promise<any[]>;
  getReminderEligibleJobInvoices(): Promise<any[]>;

  createJobSchedule(data: any): Promise<any>;
  getJobSchedule(id: string): Promise<any | undefined>;
  getJobSchedulesByMerchant(merchantId: number): Promise<any[]>;
  getDueJobSchedules(now: Date): Promise<any[]>;
  updateJobSchedule(id: string, updates: any): Promise<any | undefined>;
  terminateJobSchedule(id: string): Promise<any | undefined>;

  createJobEvent(data: any): Promise<any>;
  getJobEventsByClient(clientProfileId: string, limit?: number): Promise<any[]>;
}

// Defaults for merchant columns the in-memory mocks don't set explicitly.
// Centralised so newly added non-null columns don't silently drift every
// `const merchant: Merchant = {…}` literal out of sync with the schema.
const MEM_MERCHANT_DEFAULTS = {
  googleId: null,
  windcaveMerchantId: null,
  emailVerified: false,
  onboardingCompleted: false,
  gstRegistered: false,
  tradeGstMode: "inclusive",
  tutorialGeneration: 1,
  tutorialAutoEnabled: true,
  billingCardLast4: null,
  billingCardBrand: null,
  billingCardExpiry: null,
  businessDescription: null,
  websiteUrl: null,
  estimatedAnnualTurnover: null,
  rentReminderEnabled: true,
  rentReminderDelayDays: 3,
  rentReminderIntervalDays: 3,
  rentReminderMaxCount: 3,
  tradeRemindersEnabled: true,
};

export class MemStorage implements IStorage {
  private merchants: Map<number, Merchant>;
  private transactions: Map<number, Transaction>;
  private refunds: Map<number, Refund>;
  private splitPayments: Map<number, SplitPayment>;
  private paymentAttempts: Map<string, PaymentAttempt>;
  private merchantTransactionCounts: Map<number, number>;
  private taptStones: Map<number, TaptStone>;
  private stockItems: Map<number, StockItem>;
  private users: Map<number, User>;
  private subscriptions: Map<number, MerchantSubscription>;
  private subscriptionHistory: Map<number, SubscriptionBillingHistory>;
  private currentMerchantId: number;
  private currentTransactionId: number;
  private currentRefundId: number;
  private currentSplitPaymentId: number;
  private currentTaptStoneId: number;
  private currentStockItemId: number;
  private currentUserId: number;
  private currentSubscriptionId: number;
  private currentSubscriptionHistoryId: number;
  private taptStoneCreationLocks: Map<number, Promise<void>>;
  private paymentAttemptLocks: Map<string, Promise<void>>;
  private billSplitLocks: Map<string, Promise<void>>;
  private accountMutationLocks: Map<string, Promise<void>>;
  private pushSubs: PushSubscription[];
  private pushDeliveryClaims: Map<string, {
    status: PushNotificationDeliveryStatus | "claimed";
    claimToken: string;
    claimedAt: Date;
  }>;
  private tutorialProgress: Map<string, MerchantTutorialProgress>;

  constructor() {
    this.merchants = new Map();
    this.transactions = new Map();
    this.refunds = new Map();
    this.splitPayments = new Map();
    this.paymentAttempts = new Map();
    this.merchantTransactionCounts = new Map();
    this.taptStones = new Map();
    this.stockItems = new Map();
    this.users = new Map();
    this.subscriptions = new Map();
    this.subscriptionHistory = new Map();
    this.pushSubs = [];
    this.pushDeliveryClaims = new Map();
    this.tutorialProgress = new Map();
    this.currentMerchantId = 1;
    this.currentTransactionId = 1;
    this.currentRefundId = 1;
    this.currentSplitPaymentId = 1;
    this.currentTaptStoneId = 1;
    this.currentStockItemId = 1;
    this.currentUserId = 1;
    this.currentSubscriptionId = 1;
    this.currentSubscriptionHistoryId = 1;
    this.taptStoneCreationLocks = new Map();
    this.paymentAttemptLocks = new Map();
    this.billSplitLocks = new Map();
    this.accountMutationLocks = new Map();
  }

  private ensureMemSubscription(merchantId: number, now: Date = new Date()): MerchantSubscription {
    const existing = this.subscriptions.get(merchantId);
    if (existing) return existing;
    const subscription = {
      id: this.currentSubscriptionId++,
      ...newSubscriptionValues(merchantId, now),
      pendingPlanId: null,
      pendingPlanEffectiveAt: null,
      cancelAtPeriodEnd: false,
      cancellationRequestedAt: null,
      cancellationEffectiveDate: null,
      cancellationReason: null,
      windcaveCardId: null,
      windcaveBillingRef: null,
      cardBrand: null,
      cardLast4: null,
      cardExpiry: null,
      failedPaymentCount: 0,
      lastPaymentFailureAt: null,
      lastPaymentFailureReason: null,
      billingClaimToken: null,
      billingClaimedAt: null,
      createdAt: now,
      updatedAt: now,
    } as MerchantSubscription;
    this.subscriptions.set(merchantId, subscription);
    return subscription;
  }

  private upsertMemOwner(merchant: Merchant, passwordHash: string): User {
    const normalizedEmail = merchant.email.trim().toLowerCase();
    const collision = Array.from(this.users.values()).find(
      (user) => user.email.toLowerCase() === normalizedEmail && user.merchantId !== merchant.id,
    );
    if (collision) throw new Error("That email address already belongs to another login");
    const current = Array.from(this.users.values()).find(
      (user) => user.merchantId === merchant.id && user.role === "owner",
    );
    const user = {
      ...(current ?? {}),
      id: current?.id ?? this.currentUserId++,
      email: normalizedEmail,
      password: passwordHash,
      merchantId: merchant.id,
      role: "owner",
      name: merchant.name,
      status: "active",
      inviteTokenHash: null,
      inviteExpiresAt: null,
      resetToken: current?.resetToken ?? null,
      resetTokenExpiry: current?.resetTokenExpiry ?? null,
      lastLoginAt: current?.lastLoginAt ?? null,
      createdAt: current?.createdAt ?? new Date(),
    } as User;
    this.users.set(user.id, user);
    return user;
  }

  private memSeatsInUse(merchantId: number, now: Date = new Date()): number {
    return Array.from(this.users.values()).filter((user) =>
      user.merchantId === merchantId
      && (
        user.status === "active"
        || (
          user.status === "invited"
          && !!user.inviteExpiresAt
          && new Date(user.inviteExpiresAt).getTime() > now.getTime()
        )
      )
    ).length;
  }

  private memEffectiveSeatLimit(merchantId: number): number {
    const subscription = this.subscriptions.get(merchantId);
    const currentLimit = subscription?.seatLimit ?? planFor(DEFAULT_PLAN_ID).seats;
    return subscription?.pendingPlanId
      ? Math.min(currentLimit, planFor(subscription.pendingPlanId).seats)
      : currentLimit;
  }

  private memSubscriptionById(subscriptionId: number): MerchantSubscription | undefined {
    return Array.from(this.subscriptions.values()).find((row) => row.id === subscriptionId);
  }

  private memBillingHistoryByIdempotencyKey(
    idempotencyKey: string,
  ): SubscriptionBillingHistory | undefined {
    return Array.from(this.subscriptionHistory.values()).find(
      (row) => row.idempotencyKey === idempotencyKey,
    );
  }

  async getMerchant(id: number): Promise<Merchant | undefined> {
    return this.merchants.get(id);
  }

  async getMerchantByName(name: string): Promise<Merchant | undefined> {
    return Array.from(this.merchants.values()).find(
      (merchant) => merchant.name === name,
    );
  }

  async getMerchantByEmail(email: string): Promise<Merchant | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    return Array.from(this.merchants.values()).find(
      (merchant) => merchant.email.trim().toLowerCase() === normalizedEmail,
    );
  }

  async getMerchantByToken(token: string): Promise<Merchant | undefined> {
    return Array.from(this.merchants.values()).find(
      (merchant) => merchant.verificationToken === token,
    );
  }

  async getMerchantByResetToken(resetToken: string): Promise<Merchant | undefined> {
    return Array.from(this.merchants.values()).find(
      (merchant) => merchant.resetToken === resetToken,
    );
  }

  async getAllMerchants(): Promise<Merchant[]> {
    return Array.from(this.merchants.values());
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    const id = this.currentMerchantId++;
    const merchant: Merchant = {
      ...MEM_MERCHANT_DEFAULTS,
      id,
      name: insertMerchant.name,
      businessName: insertMerchant.businessName,
      businessType: insertMerchant.businessType || null,
      email: insertMerchant.email,
      phone: insertMerchant.phone || null,
      address: insertMerchant.address || null,
      status: "pending",
      verificationToken: null,
      passwordHash: null,
      qrCodeUrl: (insertMerchant as any).qrCodeUrl || null,
      paymentUrl: (insertMerchant as any).paymentUrl || null,
      themeId: (insertMerchant as any).themeId || "classic",
      currentProviderRate: (insertMerchant as any).currentProviderRate || "0.0290",
      ourRate: (insertMerchant as any).ourRate || "0.0020",
      contactEmail: (insertMerchant as any).contactEmail || null,
      contactPhone: (insertMerchant as any).contactPhone || null,
      businessAddress: (insertMerchant as any).businessAddress || null,
      bankName: (insertMerchant as any).bankName || null,
      bankAccountNumber: (insertMerchant as any).bankAccountNumber || null,
      bankBranch: (insertMerchant as any).bankBranch || null,
      accountHolderName: (insertMerchant as any).accountHolderName || null,
      gstNumber: (insertMerchant as any).gstNumber || null,
      director: null,
      nzbn: null,
      customLogoUrl: null,
      windcaveApiKey: null,
      dailyGoal: "500.00",
      resetToken: null,
      resetTokenExpiry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.merchants.set(id, merchant);
    return merchant;
  }

  async createMerchantWithPassword(merchantData: any, passwordHash: string): Promise<Merchant> {
    const id = this.currentMerchantId++;
    const merchant: Merchant = {
      ...MEM_MERCHANT_DEFAULTS,
      id,
      name: merchantData.name,
      businessName: merchantData.businessName,
      businessType: merchantData.businessType || null,
      email: merchantData.email,
      phone: merchantData.phone || null,
      address: merchantData.address || null,
      status: "verified",
      verificationToken: null,
      passwordHash: passwordHash,
      qrCodeUrl: merchantData.qrCodeUrl || null,
      paymentUrl: merchantData.paymentUrl || null,
      themeId: merchantData.themeId || "classic",
      currentProviderRate: merchantData.currentProviderRate || "0.0290",
      ourRate: merchantData.ourRate || "0.0020",
      contactEmail: merchantData.contactEmail || null,
      contactPhone: merchantData.contactPhone || null,
      businessAddress: merchantData.businessAddress || null,
      bankName: merchantData.bankName || null,
      bankAccountNumber: merchantData.bankAccountNumber || null,
      bankBranch: merchantData.bankBranch || null,
      accountHolderName: merchantData.accountHolderName || null,
      gstNumber: merchantData.gstNumber || null,
      director: merchantData.director || null,
      nzbn: merchantData.nzbn || null,
      customLogoUrl: merchantData.customLogoUrl || null,
      windcaveApiKey: merchantData.windcaveApiKey || null,
      dailyGoal: merchantData.dailyGoal || "500.00",
      resetToken: null,
      resetTokenExpiry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.upsertMemOwner(merchant, passwordHash);
    this.merchants.set(id, merchant);
    this.ensureMemSubscription(id);
    return merchant;
  }

  async createMerchantWithSignup(data: MerchantSignupStorageInput): Promise<Merchant> {
    const selectedPlan = planFor(data.planId ?? DEFAULT_PLAN_ID);
    const normalizedEmail = data.email.trim().toLowerCase();
    const id = this.currentMerchantId++;
    const merchant: Merchant = {
      ...MEM_MERCHANT_DEFAULTS,
      id,
      name: data.name,
      businessName: data.businessName,
      businessType: data.businessType,
      email: normalizedEmail,
      phone: data.phone,
      address: data.address,
      status: "pending",
      verificationToken: data.verificationToken,
      passwordHash: data.passwordHash ?? null,
      qrCodeUrl: `/api/merchants/${id}/qr`,
      paymentUrl: `/pay/${id}`,
      themeId: "classic",
      currentProviderRate: "0.0290",
      ourRate: "0.0020",
      contactEmail: data.contactEmail ?? normalizedEmail,
      contactPhone: data.contactPhone ?? data.phone,
      businessAddress: data.businessAddress ?? data.address,
      bankName: null,
      bankAccountNumber: null,
      bankBranch: null,
      accountHolderName: null,
      gstNumber: data.gstNumber ?? null,
      director: data.director ?? null,
      nzbn: data.nzbn ?? null,
      customLogoUrl: null,
      windcaveApiKey: null,
      businessDescription: data.businessDescription ?? null,
      websiteUrl: data.websiteUrl ?? null,
      estimatedAnnualTurnover: data.estimatedAnnualTurnover ?? null,
      onboardingCompleted: data.onboardingCompleted ?? false,
      dailyGoal: "500.00",
      resetToken: null,
      resetTokenExpiry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (data.passwordHash) this.upsertMemOwner(merchant, data.passwordHash);
    this.merchants.set(id, merchant);
    Object.assign(
      this.ensureMemSubscription(id),
      immediatePlanUpdates(selectedPlan.id, new Date()),
    );
    return merchant;
  }

  async verifyMerchant(token: string, passwordHash: string): Promise<Merchant | undefined> {
    const merchant = await this.getMerchantByToken(token);
    if (!merchant) return undefined;
    this.upsertMemOwner(merchant, passwordHash);
    
    merchant.passwordHash = passwordHash;
    merchant.status = "verified";
    merchant.verificationToken = null;
    merchant.updatedAt = new Date();
    const subscription = this.ensureMemSubscription(merchant.id);
    if (subscription.status === "pending") {
      subscription.status = "active";
      subscription.updatedAt = merchant.updatedAt;
    }
    
    this.merchants.set(merchant.id, merchant);
    return merchant;
  }

  async confirmMerchantEmail(
    token: string,
    onboardingCompleted: boolean,
  ): Promise<Merchant | undefined> {
    const merchant = await this.getMerchantByToken(token);
    if (!merchant) return undefined;
    return withMemLock(this.accountMutationLocks, `merchant:${merchant.id}`, async () => {
      if (merchant.verificationToken !== token) return undefined;
      const now = new Date();
      Object.assign(merchant, {
        emailVerified: true,
        verificationToken: null,
        status: "verified",
        onboardingCompleted,
        updatedAt: now,
      });
      const subscription = this.ensureMemSubscription(merchant.id);
      if (subscription.status === "pending") {
        subscription.status = "active";
        subscription.updatedAt = now;
      }
      return merchant;
    });
  }

  async updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    merchant.status = status;
    merchant.updatedAt = new Date();
    this.merchants.set(id, merchant);
    return merchant;
  }

  async updateMerchantPasswordHash(id: number, passwordHash: string): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    this.upsertMemOwner(merchant, passwordHash);
    
    merchant.passwordHash = passwordHash;
    merchant.updatedAt = new Date();
    this.merchants.set(id, merchant);
    return merchant;
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    return this.transactions.get(id);
  }

  async getTransactionByPaymentTokenHash(
    paymentTokenHash: string,
  ): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values())
      .find((transaction) => transaction.paymentTokenHash === paymentTokenHash);
  }

  async getPaymentAttempt(id: string): Promise<PaymentAttempt | undefined> {
    return this.paymentAttempts.get(id);
  }

  async getPaymentAttemptByProcessorSessionId(
    processorSessionId: string,
  ): Promise<PaymentAttempt | undefined> {
    return Array.from(this.paymentAttempts.values()).find(
      (attempt) => attempt.processorSessionId === processorSessionId,
    );
  }

  async getPaymentAttemptByTransactionShareKey(
    transactionId: number,
    shareIndex: number,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | undefined> {
    return Array.from(this.paymentAttempts.values()).find(
      (attempt) =>
        attempt.transactionId === transactionId &&
        attempt.shareIndex === shareIndex &&
        attempt.idempotencyKey === idempotencyKey,
    );
  }

  async claimPaymentAttemptRecord(
    input: ClaimPaymentAttemptRecordInput,
  ): Promise<ClaimPaymentAttemptResult> {
    const lockKey = `share:${input.transactionId}:${input.shareIndex}`;
    return withMemLock(this.paymentAttemptLocks, lockKey, async () => {
      const transaction = this.transactions.get(input.transactionId);
      if (!transaction) {
        return { kind: "transaction-not-found" };
      }
      const attempts = Array.from(this.paymentAttempts.values())
        .filter(
          (attempt) =>
            attempt.transactionId === input.transactionId &&
            attempt.shareIndex === input.shareIndex,
        )
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            b.id.localeCompare(a.id),
        );
      const sameKey = attempts.find(
        (attempt) => attempt.idempotencyKey === input.idempotencyKey,
      );
      let active = attempts.find(paymentAttemptIsLive);
      let abandonedAttemptId: string | undefined;

      if (active && paymentAttemptLeaseExpired(active, input.now)) {
        // A processor-bound attempt must be reconciled before another key can
        // claim this payment target. Abandoning it here could leave an HPP/card
        // session chargeable while a replacement session is created.
        if (active.processorSessionId) {
          return { kind: "expired", attempt: active };
        }
        const abandoned: PaymentAttempt = {
          ...active,
          state: "abandoned",
          updatedAt: input.now,
        };
        this.paymentAttempts.set(abandoned.id, abandoned);
        abandonedAttemptId = abandoned.id;
        if (sameKey?.id === abandoned.id) {
          return { kind: "expired", attempt: abandoned };
        }
        active = undefined;
      }

      if (sameKey) {
        const current = this.paymentAttempts.get(sameKey.id) ?? sameKey;
        if (paymentAttemptIsLive(current)) {
          return { kind: "reused", attempt: current };
        }
        if (paymentAttemptIsTerminal(current)) {
          return { kind: "terminal", attempt: current };
        }
        return { kind: "expired", attempt: current };
      }
      if (active) return { kind: "conflict", attempt: active };

      if (transaction.status !== "pending") {
        return { kind: "target-conflict", reason: "transaction-not-payable" };
      }
      if (input.shareIndex === 0 && transaction.isSplit) {
        return { kind: "target-conflict", reason: "split-target-required" };
      }
      if (input.shareIndex > 0 && !transaction.isSplit) {
        return { kind: "target-conflict", reason: "unsplit-target-required" };
      }
      if (input.shareIndex > 0) {
        const share = Array.from(this.splitPayments.values()).find(
          (candidate) =>
            candidate.transactionId === input.transactionId &&
            candidate.splitIndex === input.shareIndex,
        );
        if (!share) return { kind: "target-conflict", reason: "share-not-found" };
        if (share.status !== "pending") {
          return { kind: "target-conflict", reason: "share-not-payable" };
        }
      }

      const attempt: PaymentAttempt = {
        id: randomUUID(),
        transactionId: input.transactionId,
        shareIndex: input.shareIndex,
        idempotencyKey: input.idempotencyKey,
        state: "claiming",
        leaseExpiresAt: input.leaseExpiresAt,
        processorSessionId: null,
        processorXId: null,
        returnStateHash: null,
        returnStateExpiresAt: null,
        outcome: null,
        receiptShare: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      this.paymentAttempts.set(attempt.id, attempt);
      return {
        kind: "claimed",
        attempt,
        ...(abandonedAttemptId ? { abandonedAttemptId } : {}),
      };
    });
  }

  async attachPaymentAttemptSessionRecord(
    input: AttachPaymentAttemptSessionRecordInput,
  ): Promise<AttachPaymentAttemptSessionResult> {
    return withMemLock(this.paymentAttemptLocks, `attempt:${input.attemptId}`, async () => {
      const attempt = this.paymentAttempts.get(input.attemptId);
      if (!attempt) return { kind: "not-found" };

      if (paymentAttemptLeaseExpired(attempt, input.now)) {
        const abandoned: PaymentAttempt = {
          ...attempt,
          state: "abandoned",
          updatedAt: input.now,
        };
        this.paymentAttempts.set(abandoned.id, abandoned);
        return { kind: "expired", attempt: abandoned };
      }
      if (attempt.state === "abandoned") {
        return { kind: "expired", attempt };
      }
      if (paymentAttemptIsTerminal(attempt)) {
        return { kind: "terminal", attempt };
      }

      const duplicateIdentity = Array.from(this.paymentAttempts.values()).find(
        (candidate) =>
          candidate.id !== attempt.id &&
          (candidate.processorSessionId === input.processorSessionId ||
            candidate.processorXId === input.processorXId ||
            (input.returnStateHash !== null &&
              candidate.returnStateHash === input.returnStateHash)),
      );
      if (duplicateIdentity) return { kind: "conflict", attempt };

      const maximumReturnExpiry = new Date(
        attempt.createdAt.getTime() + PAYMENT_RETURN_STATE_MAX_AGE_MS,
      );
      const returnStateExpiresAt =
        input.returnStateExpiresAt &&
        input.returnStateExpiresAt.getTime() > maximumReturnExpiry.getTime()
          ? maximumReturnExpiry
          : input.returnStateExpiresAt;
      const matches =
        attempt.processorSessionId === input.processorSessionId &&
        attempt.processorXId === input.processorXId &&
        attempt.returnStateHash === input.returnStateHash &&
        (attempt.returnStateExpiresAt?.getTime() ?? null) ===
          (returnStateExpiresAt?.getTime() ?? null);

      if (attempt.state === "ready") {
        return matches
          ? { kind: "reused", attempt }
          : { kind: "conflict", attempt };
      }
      if (attempt.state !== "claiming") {
        return { kind: "conflict", attempt };
      }

      const attached: PaymentAttempt = {
        ...attempt,
        state: "ready",
        processorSessionId: input.processorSessionId,
        processorXId: input.processorXId,
        returnStateHash: input.returnStateHash,
        returnStateExpiresAt,
        updatedAt: input.now,
      };
      this.paymentAttempts.set(attached.id, attached);
      return { kind: "attached", attempt: attached };
    });
  }

  async getPaymentAttemptByReturnStateHash(
    returnStateHash: string,
  ): Promise<PaymentAttempt | undefined> {
    return Array.from(this.paymentAttempts.values())
      .find((attempt) => attempt.returnStateHash === returnStateHash);
  }

  async claimPaymentAttemptFinalizationRecord(
    input: ClaimPaymentAttemptFinalizationRecordInput,
  ): Promise<ClaimPaymentAttemptFinalizationResult> {
    return withMemLock(this.paymentAttemptLocks, `attempt:${input.attemptId}`, async () => {
      const attempt = this.paymentAttempts.get(input.attemptId);
      if (!attempt) return { kind: "not-found" };
      if (attempt.processorSessionId !== input.processorSessionId) {
        return { kind: "conflict", attempt };
      }
      if (attempt.state === "finalizing") return { kind: "reused", attempt };
      if (paymentAttemptIsTerminal(attempt)) return { kind: "terminal", attempt };
      if (attempt.state !== "ready") return { kind: "conflict", attempt };

      const claimed: PaymentAttempt = {
        ...attempt,
        state: "finalizing",
        updatedAt: input.now,
      };
      this.paymentAttempts.set(claimed.id, claimed);
      return { kind: "claimed", attempt: claimed };
    });
  }

  async finalizePaymentAttemptRecord(
    input: FinalizePaymentAttemptRecordInput,
  ): Promise<FinalizePaymentAttemptResult> {
    const initialAttempt = this.paymentAttempts.get(input.attemptId);
    if (!initialAttempt) return { kind: "not-found" };

    return withMemLock(
      this.paymentAttemptLocks,
      `settle:${initialAttempt.transactionId}`,
      async () => {
        const attempt = this.paymentAttempts.get(input.attemptId);
        if (!attempt) return { kind: "not-found" };
        const transaction = this.transactions.get(attempt.transactionId);
        if (!transaction) return { kind: "not-found" };

        const splitPayment = attempt.shareIndex === 0
          ? null
          : Array.from(this.splitPayments.values()).find(
              (split) =>
                split.transactionId === attempt.transactionId &&
                split.splitIndex === attempt.shareIndex,
            ) ?? null;
        const targetExists = attempt.shareIndex === 0
          ? !transaction.isSplit
          : transaction.isSplit && splitPayment !== null;
        const receiptIsValid =
          input.outcome === "approved"
            ? attempt.shareIndex === 0
              ? input.receiptShare === null
              : input.receiptShare === attempt.shareIndex
            : input.receiptShare === null;
        if (
          !targetExists ||
          !receiptIsValid ||
          attempt.processorSessionId !== input.processorSessionId ||
          (input.outcome === "approved" && input.processorTransactionId === null)
        ) {
          return { kind: "conflict", attempt };
        }

        if (paymentAttemptIsTerminal(attempt)) {
          return attempt.state === input.outcome &&
            attempt.outcome === input.outcome &&
            attempt.receiptShare === input.receiptShare
            ? {
                kind: "reused",
                attempt,
                transaction,
                splitPayment,
                counterIncremented: false,
              }
            : { kind: "conflict", attempt };
        }
        if (attempt.state !== "finalizing") {
          return { kind: "conflict", attempt };
        }
        if (
          !["pending", "processing"].includes(transaction.status) ||
          (splitPayment && !["pending", "processing"].includes(splitPayment.status))
        ) {
          return { kind: "conflict", attempt };
        }

        const updatedSplit: SplitPayment | null = splitPayment
          ? {
              ...splitPayment,
              status: input.outcome === "approved" ? "completed" : "pending",
              windcaveTransactionId:
                input.processorTransactionId ?? splitPayment.windcaveTransactionId,
              paymentMethod: input.paymentMethod ?? splitPayment.paymentMethod,
              paidAt: input.outcome === "approved" ? input.now : null,
            }
          : null;
        const completedSplits = updatedSplit
          ? Array.from(this.splitPayments.values()).filter(
              (split) =>
                split.transactionId === transaction.id &&
                (split.id === updatedSplit.id
                  ? updatedSplit.status === "completed"
                  : split.status === "completed"),
            ).length
          : transaction.completedSplits ?? 0;
        const allSplitsComplete = updatedSplit !== null &&
          completedSplits >= (transaction.totalSplits ?? 1);
        const transactionStatus = updatedSplit
          ? input.outcome === "approved" && allSplitsComplete
            ? "completed"
            : "pending"
          : input.outcome === "approved"
            ? "completed"
            : input.outcome === "cancelled" ? "cancelled" : "failed";
        const updatedTransaction: Transaction = {
          ...transaction,
          status: transactionStatus,
          completedAt:
            transactionStatus === "completed"
              ? transaction.completedAt ?? input.now
              : transaction.completedAt,
          completedSplits,
          windcaveTransactionId:
            input.processorTransactionId ?? transaction.windcaveTransactionId,
          paymentMethod: input.paymentMethod ?? transaction.paymentMethod,
          windcaveSessionId: input.processorSessionId,
          windcaveSessionState:
            updatedSplit && !allSplitsComplete ? "pending" : input.outcome,
          windcaveXId: attempt.processorXId,
        };
        const finalized: PaymentAttempt = {
          ...attempt,
          state: input.outcome,
          outcome: input.outcome,
          receiptShare: input.receiptShare,
          updatedAt: input.now,
        };

        // No platform fee is charged or accrued — see the Postgres twin.
        let counterIncremented = false;
        if (input.outcome === "approved" && transaction.merchantId !== null) {
          this.merchantTransactionCounts.set(
            transaction.merchantId,
            (this.merchantTransactionCounts.get(transaction.merchantId) ?? 0) + 1,
          );
          counterIncremented = true;
        }

        if (updatedSplit) this.splitPayments.set(updatedSplit.id, updatedSplit);
        this.transactions.set(updatedTransaction.id, updatedTransaction);
        this.paymentAttempts.set(finalized.id, finalized);
        return {
          kind: "finalized",
          attempt: finalized,
          transaction: updatedTransaction,
          splitPayment: updatedSplit,
          counterIncremented,
        };
      },
    );
  }

  async getActiveTransactionByMerchant(
    merchantId: number,
    scope: ActiveTransactionScope,
  ): Promise<Transaction | undefined> {
    // A map scan is cheap in the development/test backend and avoids a family of
    // stale positive/negative cache entries after status, split, and cancel writes.
    const cutoff = new Date(Date.now() - 3 * 60 * 1000);
    const scoped = Array.from(this.transactions.values())
      .filter((transaction) => {
        if (transaction.merchantId !== merchantId) return false;
        switch (scope.kind) {
          case "merchant-any":
            return true;
          case "legacy-no-board":
            return transaction.taptStoneId == null && transaction.paymentTokenHash == null;
          case "board":
            return transaction.taptStoneId === scope.stoneId;
        }
      })
      .sort(compareTransactionsNewest);

    return scoped.find(
      (transaction) => transaction.status === "pending" || transaction.status === "processing",
    ) ?? scoped.find(
      (transaction) =>
        transaction.status === "completed" &&
        transaction.createdAt != null &&
        transaction.createdAt >= cutoff,
    );
  }

  async getTransactionByNfcSession(nfcSessionId: string): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values())
      .find(t => t.nfcSessionId === nfcSessionId);
  }

  async createTransaction(input: TransactionStorageInput): Promise<Transaction> {
    const insertTransaction = sanitizeTransactionStorageInput(input);
    const id = this.currentTransactionId++;
    const transactionAmount = parseFloat(insertTransaction.price);
    const createdAt = new Date();

    // TaptPay charges no per-transaction fee — merchants pay a monthly
    // subscription (shared/plans.ts). The fee columns stay at zero so historical
    // rows remain readable alongside new ones.

    const transaction: Transaction = {
      ...insertTransaction,
      merchantId: insertTransaction.merchantId ?? null,
      taptStoneId: insertTransaction.taptStoneId ?? null,
      isSplit: insertTransaction.isSplit ?? false,
      totalSplits: insertTransaction.totalSplits ?? 1,
      completedSplits: insertTransaction.completedSplits ?? 0,
      splitAmount: insertTransaction.splitAmount ?? null,
      id,
      createdAt,
      windcaveTransactionId: null,
      windcaveFeeRate: "0.0000",
      windcaveFeeAmount: "0.00",
      platformFeeRate: "0.0000",
      platformFeeAmount: "0.00",
      merchantNet: transactionAmount.toFixed(2),
      totalRefunded: "0.00",
      refundableAmount: transactionAmount.toString(),
      paymentMethod: insertTransaction.paymentMethod || "qr_code",
      nfcSessionId: insertTransaction.nfcSessionId || null,
      deviceId: insertTransaction.deviceId || null,
      splitEnabled: insertTransaction.splitEnabled ?? false,
      windcaveSessionId: null,
      windcaveSessionState: null,
      windcaveXId: null,
      paymentTokenHash: insertTransaction.paymentTokenHash ?? null,
      completedAt: insertTransaction.status === "completed" ? createdAt : null,
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  async getSubscriptionRevenue(): Promise<SubscriptionRevenue> {
    return summariseSubscriptionRevenue(Array.from(this.subscriptions.values()));
  }

  // Refund methods
  async createRefund(insertRefund: InsertRefund): Promise<Refund> {
    const id = this.currentRefundId++;
    const refund: Refund = {
      ...insertRefund,
      transactionId: insertRefund.transactionId ?? null,
      merchantId: insertRefund.merchantId ?? null,
      refundReason: insertRefund.refundReason ?? null,
      refundMethod: insertRefund.refundMethod ?? "original_payment_method",
      status: insertRefund.status ?? "pending",
      windcaveRefundId: insertRefund.windcaveRefundId ?? null,
      windcaveFeeRefunded: insertRefund.windcaveFeeRefunded ?? "0.00",
      platformFeeRefunded: insertRefund.platformFeeRefunded ?? "0.00",
      initiatedBy: insertRefund.initiatedBy ?? null,
      customerNotified: insertRefund.customerNotified ?? false,
      id,
      createdAt: new Date(),
      completedAt: null,
    };
    this.refunds.set(id, refund);
    return refund;
  }

  async getRefund(id: number): Promise<Refund | undefined> {
    return this.refunds.get(id);
  }

  async getRefundsByTransaction(transactionId: number): Promise<Refund[]> {
    return Array.from(this.refunds.values()).filter(
      (refund) => refund.transactionId === transactionId
    );
  }

  async getRefundsByMerchant(merchantId: number): Promise<Refund[]> {
    return Array.from(this.refunds.values()).filter(
      (refund) => refund.merchantId === merchantId
    );
  }

  async updateRefundStatus(id: number, status: string, windcaveRefundId?: string): Promise<Refund | undefined> {
    const refund = this.refunds.get(id);
    if (!refund) return undefined;
    
    const updatedRefund = {
      ...refund,
      status,
      windcaveRefundId: windcaveRefundId || refund.windcaveRefundId,
      completedAt: status === "completed" ? new Date() : refund.completedAt,
    };
    this.refunds.set(id, updatedRefund);
    return updatedRefund;
  }

  async updateTransactionAfterRefund(id: number, refundAmount: number): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;

    const prevRefunded = parseFloat(transaction.totalRefunded || "0");
    const newTotalRefunded = prevRefunded + refundAmount;
    const originalPrice = parseFloat(transaction.price);
    const newRefundableAmount = Math.max(0, originalPrice - newTotalRefunded);
    const newStatus = newRefundableAmount <= 0 ? "refunded" : "partially_refunded";

    const updated = {
      ...transaction,
      totalRefunded: newTotalRefunded.toFixed(2),
      refundableAmount: newRefundableAmount.toFixed(2),
      status: newStatus,
    };
    this.transactions.set(id, updated);
    return updated;
  }

  async reserveRefundAmount(id: number, refundAmount: number): Promise<Transaction | null | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    if (transaction.status !== "completed" && transaction.status !== "partially_refunded") return null;
    const prevRefunded = parseFloat(transaction.totalRefunded || "0");
    const price = parseFloat(transaction.price);
    // Guard against over-refund (epsilon for float noise on 2dp money).
    if (refundAmount > price - prevRefunded + 1e-9) return null;
    const newTotalRefunded = prevRefunded + refundAmount;
    const newRefundableAmount = Math.max(0, price - newTotalRefunded);
    const updated = {
      ...transaction,
      totalRefunded: newTotalRefunded.toFixed(2),
      refundableAmount: newRefundableAmount.toFixed(2),
      status: newRefundableAmount <= 0 ? "refunded" : "partially_refunded",
    };
    this.transactions.set(id, updated);
    return updated;
  }

  async releaseRefundAmount(id: number, refundAmount: number): Promise<void> {
    const transaction = this.transactions.get(id);
    if (!transaction) return;
    const prevRefunded = parseFloat(transaction.totalRefunded || "0");
    const price = parseFloat(transaction.price);
    const newTotalRefunded = Math.max(0, prevRefunded - refundAmount);
    const newRefundableAmount = Math.max(0, price - newTotalRefunded);
    this.transactions.set(id, {
      ...transaction,
      totalRefunded: newTotalRefunded.toFixed(2),
      refundableAmount: newRefundableAmount.toFixed(2),
      status: newTotalRefunded <= 0 ? "completed" : "partially_refunded",
    });
  }

  async updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    const now = new Date();
    const updatedTransaction = {
      ...transaction,
      status,
      completedAt:
        status === "completed" ? transaction.completedAt ?? now : transaction.completedAt,
      windcaveTransactionId: windcaveTransactionId || transaction.windcaveTransactionId,
    };
    this.transactions.set(id, updatedTransaction);
    return updatedTransaction;
  }

  async updateTransactionPaymentMethod(id: number, paymentMethod: string): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    const updated = { ...transaction, paymentMethod };
    this.transactions.set(id, updated);
    return updated;
  }

  async updateTransactionSplitEnabled(id: number, splitEnabled: boolean): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    const updated = { ...transaction, splitEnabled };
    this.transactions.set(id, updated);
    return updated;
  }

  async updateTransactionNfcSession(id: number, nfcSessionId: string): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    
    const updatedTransaction = {
      ...transaction,
      nfcSessionId,
    };
    this.transactions.set(id, updatedTransaction);
    return updatedTransaction;
  }

  async updateTransactionWindcaveSession(id: number, sessionId: string, sessionState: string, xId: string): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    const updated = { ...transaction, windcaveSessionId: sessionId, windcaveSessionState: sessionState, windcaveXId: xId };
    this.transactions.set(id, updated);
    return updated;
  }

  async updateTransactionSessionState(id: number, sessionState: string): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    const updated = { ...transaction, windcaveSessionState: sessionState };
    this.transactions.set(id, updated);
    return updated;
  }

  async getTransactionByWindcaveSessionId(sessionId: string): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values()).find(t => t.windcaveSessionId === sessionId);
  }

  async getTransactionsByMerchant(merchantId: number): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(
      (transaction) => transaction.merchantId === merchantId
    );
  }

  // Bill splitting operations
  async createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction | undefined> {
    return withMemLock(this.billSplitLocks, String(transactionId), async () => {
      const transaction = this.transactions.get(transactionId);
      if (!transaction) return undefined;

      const amounts = transactionSplitAmounts(transaction.price, totalSplits);
      const existing = Array.from(this.splitPayments.values())
        .filter((split) => split.transactionId === transactionId)
        .sort((a, b) => a.splitIndex - b.splitIndex);
      if (
        (transaction.completedSplits ?? 0) > 0 ||
        existing.some((split) => split.status !== "pending")
      ) {
        throw new BillSplitConflictError("split-in-progress");
      }
      if (transaction.status !== "pending") {
        throw new BillSplitConflictError("transaction-not-pending");
      }
      if (transaction.isSplit) {
        const isExactRetry =
          transaction.totalSplits === totalSplits &&
          existing.length === totalSplits &&
          existing.every(
            (split, index) =>
              split.splitIndex === index + 1 &&
              split.amount === amounts[index],
          );
        if (isExactRetry) return transaction;
        throw new BillSplitConflictError("already-configured");
      }
      if (existing.length > 0) {
        throw new BillSplitConflictError("inconsistent-split-state");
      }

      const now = new Date();
      const rows = amounts.map((amount, index) => ({
        id: this.currentSplitPaymentId + index,
        transactionId,
        merchantId: transaction.merchantId,
        splitIndex: index + 1,
        amount,
        status: "pending",
        windcaveTransactionId: null,
        paymentMethod: "qr_code",
        windcaveFeeAmount: "0.00",
        platformFeeAmount: "0.00",
        merchantNet: amount,
        paidAt: null,
        createdAt: now,
      }));
      const updatedTransaction: Transaction = {
        ...transaction,
        isSplit: true,
        totalSplits,
        completedSplits: 0,
        splitAmount: amounts[0],
      };

      this.currentSplitPaymentId += rows.length;
      this.transactions.set(transactionId, updatedTransaction);
      for (const row of rows) this.splitPayments.set(row.id, row);
      return updatedTransaction;
    });
  }

  async createSplitPayment(data: any): Promise<any> {
    const id = this.currentSplitPaymentId++;
    const splitPayment = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.splitPayments.set(id, splitPayment);
    return splitPayment;
  }

  async getSplitPaymentsByTransaction(transactionId: number): Promise<any[]> {
    return Array.from(this.splitPayments.values()).filter(
      (split) => split.transactionId === transactionId
    );
  }

  async getSplitPaymentById(id: number): Promise<any | undefined> {
    return this.splitPayments.get(id);
  }

  async updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any> {
    const splitPayment = this.splitPayments.get(id);
    if (!splitPayment) return undefined;
    const now = new Date();

    const updatedSplit = {
      ...splitPayment,
      status,
      windcaveTransactionId: windcaveTransactionId || splitPayment.windcaveTransactionId,
      paidAt: status === "completed" ? splitPayment.paidAt ?? now : splitPayment.paidAt,
    };
    
    this.splitPayments.set(id, updatedSplit);

    // If this split is completed, update the main transaction
    if (status === "completed") {
      const transaction = this.transactions.get(splitPayment.transactionId);
      if (transaction) {
        const allSplits = await this.getSplitPaymentsByTransaction(splitPayment.transactionId);
        const completedSplits = allSplits.filter(s => s.status === "completed").length;
        
        const updatedTransaction = {
          ...transaction,
          completedSplits: completedSplits,
          status: completedSplits >= (transaction.totalSplits ?? 1) ? "completed" : "pending",
          completedAt:
            completedSplits >= (transaction.totalSplits ?? 1)
              ? transaction.completedAt ?? now
              : transaction.completedAt,
        };
        
        this.transactions.set(splitPayment.transactionId, updatedTransaction);
      }
    }

    return updatedSplit;
  }

  async getNextPendingSplit(transactionId: number): Promise<any | undefined> {
    const splits = await this.getSplitPaymentsByTransaction(transactionId);
    return splits.find(split => split.status === "pending");
  }

  async updateMerchant(id: number, updates: Partial<Merchant>): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      ...updates,
      updatedAt: new Date(),
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async getMerchantTutorialProgress(merchantId: number, generation: number): Promise<MerchantTutorialProgress[]> {
    return Array.from(this.tutorialProgress.values()).filter(
      row => row.merchantId === merchantId && row.generation === generation,
    );
  }

  async upsertMerchantTutorialProgress(merchantId: number, generation: number, pageKey: string, status: string, lastStep: number): Promise<MerchantTutorialProgress> {
    const key = `${merchantId}:${generation}:${pageKey}`;
    const previous = this.tutorialProgress.get(key);
    const now = new Date();
    const row: MerchantTutorialProgress = {
      id: previous?.id ?? `tutorial-${key}`,
      merchantId,
      generation,
      pageKey,
      status,
      lastStep,
      startedAt: previous?.startedAt ?? now,
      completedAt: status === "completed" ? now : previous?.completedAt ?? null,
      dismissedAt: status === "dismissed" ? now : previous?.dismissedAt ?? null,
      updatedAt: now,
    };
    this.tutorialProgress.set(key, row);
    return row;
  }

  async restartMerchantTutorial(merchantId: number): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(merchantId);
    if (!merchant) return undefined;
    return this.updateMerchant(merchantId, {
      tutorialGeneration: merchant.tutorialGeneration + 1,
      tutorialAutoEnabled: true,
    });
  }

  async updateMerchantLogoUrl(id: number, logoUrl: string | null): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      customLogoUrl: logoUrl,
      updatedAt: new Date(),
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantBillingCard(id: number, card: { last4: string; brand: string; expiry: string } | null): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    const updatedMerchant = {
      ...merchant,
      billingCardLast4: card?.last4 ?? null,
      billingCardBrand: card?.brand ?? null,
      billingCardExpiry: card?.expiry ?? null,
      updatedAt: new Date(),
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      businessName: details.businessName,
      contactEmail: details.contactEmail,
      contactPhone: details.contactPhone,
      businessAddress: details.businessAddress,
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      bankName: bankDetails.bankName,
      bankAccountNumber: bankDetails.bankAccountNumber,
      bankBranch: bankDetails.bankBranch,
      accountHolderName: bankDetails.accountHolderName,
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async updateMerchantTheme(id: number, themeId: string): Promise<Merchant | undefined> {
    const merchant = this.merchants.get(id);
    if (!merchant) return undefined;
    
    const updatedMerchant = {
      ...merchant,
      themeId,
    };
    this.merchants.set(id, updatedMerchant);
    return updatedMerchant;
  }

  async getMerchantAnalytics(merchantId: number): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    weeklyTransactions: number;
    weeklyRevenue: number;
    averageTransaction: number;
  }> {
    const merchant = this.merchants.get(merchantId);
    const transactions = await this.getTransactionsByMerchant(merchantId);
    
    const completedTransactions = transactions.filter(t => t.status === "completed");
    const totalRevenue = completedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    const averageTransaction = completedTransactions.length > 0 
      ? totalRevenue / completedTransactions.length 
      : 0;
    
    // Calculate weekly metrics (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const weeklyTransactionsList = transactions.filter(t => {
      const transactionDate = t.createdAt ? new Date(t.createdAt) : null;
      return transactionDate && transactionDate >= weekAgo;
    });
    
    const weeklyCompletedTransactions = weeklyTransactionsList.filter(t => t.status === "completed");
    const weeklyRevenue = weeklyCompletedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    
    return {
      totalTransactions: transactions.length,
      completedTransactions: completedTransactions.length,
      totalRevenue,
      weeklyTransactions: weeklyTransactionsList.length,
      weeklyRevenue,
      averageTransaction,
    };
  }

  async getTransactionsByMerchantWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<Transaction[]> {
    const allTransactions = await this.getTransactionsByMerchant(merchantId);
    
    if (!startDate && !endDate) {
      return allTransactions;
    }
    
    return allTransactions.filter(transaction => {
      if (!transaction.createdAt) return false;
      const transactionDate = new Date(transaction.createdAt);
      
      if (startDate && transactionDate < startDate) {
        return false;
      }
      
      if (endDate && transactionDate > endDate) {
        return false;
      }
      
      return true;
    });
  }

  async getMerchantAnalyticsWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    dateRange: { start: Date | null; end: Date | null };
    averageTransactionValue: number;
    transactionsByStatus: { [key: string]: number };
  }> {
    const merchant = this.merchants.get(merchantId);
    const transactions = await this.getTransactionsByMerchantWithDateRange(merchantId, startDate, endDate);
    
    const completedTransactions = transactions.filter(t => t.status === "completed");
    const totalRevenue = completedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    
    // Calculate transaction breakdown by status
    const transactionsByStatus: { [key: string]: number } = {};
    transactions.forEach(t => {
      transactionsByStatus[t.status] = (transactionsByStatus[t.status] || 0) + 1;
    });

    return {
      totalTransactions: transactions.length,
      completedTransactions: completedTransactions.length,
      totalRevenue,
      dateRange: { 
        start: startDate || null, 
        end: endDate || null 
      },
      averageTransactionValue: completedTransactions.length > 0 ? totalRevenue / completedTransactions.length : 0,
      transactionsByStatus,
    };
  }

  async deleteMerchant(id: number): Promise<boolean> {
    // Check if merchant exists
    if (!this.merchants.has(id)) {
      return false;
    }

    // Delete all transactions associated with this merchant
    const transactionsToDelete: number[] = [];
    for (const transactionId of Array.from(this.transactions.keys())) {
      const transaction = this.transactions.get(transactionId);
      if (transaction && transaction.merchantId === id) {
        transactionsToDelete.push(transactionId);
      }
    }
    
    // Remove transactions
    transactionsToDelete.forEach(transactionId => {
      this.transactions.delete(transactionId);
    });

    // Remove merchant
    this.merchants.delete(id);
    return true;
  }

  async clearTransactions(merchantId: number): Promise<boolean> {
    // Clear all transactions for a specific merchant
    const transactionsToDelete = Array.from(this.transactions.values()).filter(
      t => t.merchantId === merchantId
    );
    
    transactionsToDelete.forEach(transaction => {
      this.transactions.delete(transaction.id);
    });
    
    console.log(`Cleared ${transactionsToDelete.length} transactions for merchant ${merchantId}`);
    return true;
  }

  async getRevenueOverTime(merchantId: number, days: number = 30): Promise<Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const transactions = await this.getTransactionsByMerchantWithDateRange(merchantId, startDate, endDate);
    const completedTransactions = transactions.filter(t => t.status === "completed");

    // Group transactions by date
    const revenueByDate = new Map<string, { revenue: number; transactions: number }>();
    
    // Initialize all dates with 0 values
    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      revenueByDate.set(dateKey, { revenue: 0, transactions: 0 });
    }

    // Aggregate completed transactions by date
    completedTransactions.forEach(transaction => {
      if (transaction.createdAt) {
        const date = new Date(transaction.createdAt);
        const dateKey = date.toISOString().split('T')[0];
        const existing = revenueByDate.get(dateKey) || { revenue: 0, transactions: 0 };
        revenueByDate.set(dateKey, {
          revenue: existing.revenue + parseFloat(transaction.price),
          transactions: existing.transactions + 1
        });
      }
    });

    // Convert to array and sort by date
    return Array.from(revenueByDate.entries())
      .map(([date, data]) => ({
        date,
        revenue: Number(data.revenue.toFixed(2)),
        transactions: data.transactions
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  clearAllMerchants() {
    this.merchants.clear();
    this.transactions.clear();
    this.currentMerchantId = 1;
    this.currentTransactionId = 1;
    console.log("All merchants and transactions cleared from memory");
  }

  private createSampleData() {
    const sampleTransactions = [
      // Recent transactions (last 3 days)
      { itemName: "Flat White", price: "5.20", status: "completed", daysAgo: 0 },
      { itemName: "Chicken Wrap", price: "12.50", status: "completed", daysAgo: 0 },
      { itemName: "Cappuccino", price: "4.50", status: "completed", daysAgo: 0 },
      { itemName: "Caesar Salad", price: "14.90", status: "completed", daysAgo: 0 },
      { itemName: "Iced Coffee", price: "4.80", status: "failed", daysAgo: 1 },
      { itemName: "Burger & Fries", price: "18.90", status: "completed", daysAgo: 1 },
      { itemName: "Latte", price: "5.00", status: "completed", daysAgo: 1 },
      { itemName: "Fish & Chips", price: "22.50", status: "completed", daysAgo: 1 },
      { itemName: "Green Smoothie", price: "8.50", status: "completed", daysAgo: 2 },
      { itemName: "Eggs Benedict", price: "16.90", status: "completed", daysAgo: 2 },
      
      // Last week transactions
      { itemName: "Pizza Margherita", price: "24.90", status: "completed", daysAgo: 5 },
      { itemName: "Americano", price: "3.50", status: "completed", daysAgo: 5 },
      { itemName: "Pasta Carbonara", price: "19.50", status: "completed", daysAgo: 6 },
      { itemName: "Orange Juice", price: "4.20", status: "completed", daysAgo: 6 },
      { itemName: "Steak Sandwich", price: "21.90", status: "completed", daysAgo: 7 },
      { itemName: "Hot Chocolate", price: "4.75", status: "processing", daysAgo: 7 },
      
      // Older transactions (2-4 weeks ago)
      { itemName: "Thai Curry", price: "17.90", status: "completed", daysAgo: 14 },
      { itemName: "Croissant", price: "4.25", status: "completed", daysAgo: 15 },
      { itemName: "Club Sandwich", price: "15.50", status: "completed", daysAgo: 16 },
      { itemName: "Tea", price: "2.95", status: "completed", daysAgo: 18 },
      { itemName: "Seafood Pasta", price: "26.90", status: "completed", daysAgo: 20 },
      { itemName: "Bagel & Cream Cheese", price: "6.50", status: "completed", daysAgo: 21 },
      { itemName: "Mediterranean Bowl", price: "16.50", status: "completed", daysAgo: 22 },
      { itemName: "Banana Smoothie", price: "7.95", status: "completed", daysAgo: 25 },
      { itemName: "Grilled Chicken", price: "19.90", status: "completed", daysAgo: 28 },
      { itemName: "Muffin", price: "3.75", status: "completed", daysAgo: 30 },
    ];

    for (const transaction of sampleTransactions) {
      const id = this.currentTransactionId++;
      const createdDate = new Date(Date.now() - transaction.daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 12 * 60 * 60 * 1000); // Add some time variation within the day
      const newTransaction: Transaction = {
        id,
        merchantId: this.currentMerchantId,
        taptStoneId: null,
        itemName: transaction.itemName,
        price: transaction.price,
        status: transaction.status,
        windcaveTransactionId: `WC_${Date.now() + Math.random()}`,
        paymentMethod: "qr_code",
        nfcSessionId: null,
        deviceId: null,
        isSplit: false,
        totalSplits: 1,
        completedSplits: 0,
        splitAmount: null,
        windcaveFeeRate: "0.0000",
        windcaveFeeAmount: "0.00",
        platformFeeRate: "0.0000",
        platformFeeAmount: "0.00",
        merchantNet: transaction.price,
        totalRefunded: "0.00",
        refundableAmount: transaction.price,
        splitEnabled: false,
        windcaveSessionId: null,
        windcaveSessionState: null,
        windcaveXId: null,
        paymentTokenHash: null,
        createdAt: createdDate,
        completedAt:
          ["completed", "partially_refunded", "refunded"].includes(transaction.status)
            ? createdDate
            : null,
      };
      this.transactions.set(id, newTransaction);
    }
  }

  // API Key operations - Memory implementations
  async createApiKey(data: any): Promise<any> {
    const id = Date.now();
    const apiKey = {
      ...data,
      id,
      keyPrefix: `tapt_${data.environment}_`,
      apiKey: `tapt_${data.environment}_${Math.random().toString(36).substring(2, 15)}`,
      status: 'active',
      createdAt: new Date().toISOString()
    };
    // Store in memory (would normally go to database)
    return apiKey;
  }

  async getApiKey(id: number): Promise<any> {
    return null; // Not implemented in memory storage
  }

  async getApiKeyByKey(apiKey: string): Promise<any> {
    return null;
  }

  async getApiKeysByMerchant(merchantId: number): Promise<any[]> {
    return [];
  }

  async updateApiKeyStatus(id: number, status: string): Promise<any> {
    return null;
  }

  async revokeApiKey(id: number): Promise<boolean> {
    return true;
  }

  async updateApiKeyLastUsed(id: number): Promise<any> {
    return null;
  }

  async logApiRequest(data: any): Promise<any> {
    return { ...data, id: Date.now(), createdAt: new Date() };
  }

  async getApiMetrics(merchantId?: number): Promise<any> {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsToday: 0,
      webhookDeliveryRate: 0
    };
  }

  async getApiUsageData(merchantId?: number): Promise<any[]> {
    return [];
  }

  async createPushSubscription(data: PushSubscriptionInput): Promise<PushSubscription> {
    const targetPreferences = await this.getPushNotificationPreferences(data.merchantId);
    const existing = this.pushSubs.find(s => s.endpoint === data.endpoint);
    if (existing) {
      const preferences = existing.merchantId === data.merchantId
        ? normalizePushNotificationPreferences(existing.preferences)
        : targetPreferences;
      existing.isActive = true;
      existing.merchantId = data.merchantId;
      existing.p256dh = data.p256dh;
      existing.auth = data.auth;
      existing.userAgent = data.userAgent ?? existing.userAgent;
      existing.preferences = { ...preferences };
      return existing;
    }
    const sub: PushSubscription = {
      id: this.pushSubs.length + 1,
      ...data,
      userAgent: data.userAgent ?? null,
      isActive: true,
      preferences: { ...targetPreferences },
      createdAt: new Date(),
    };
    this.pushSubs.push(sub);
    return sub;
  }

  async getPushSubscriptionsByMerchant(merchantId: number): Promise<PushSubscription[]> {
    return this.pushSubs.filter(s => s.merchantId === merchantId && s.isActive);
  }

  async getPushNotificationPreferences(merchantId: number): Promise<PushNotificationPreferences> {
    const latest = this.pushSubs
      .filter((sub) => sub.merchantId === merchantId)
      .sort((a, b) => b.id - a.id)[0];
    return latest
      ? normalizePushNotificationPreferences(latest.preferences)
      : { ...DEFAULT_PUSH_NOTIFICATION_PREFERENCES };
  }

  async updatePushNotificationPreferences(
    merchantId: number,
    preferences: PushNotificationPreferences,
  ): Promise<PushNotificationPreferences> {
    const safePreferences = normalizePushNotificationPreferences(preferences);
    for (const sub of this.pushSubs) {
      if (sub.merchantId === merchantId) sub.preferences = { ...safePreferences };
    }
    return safePreferences;
  }

  async deactivatePushSubscription(id: number): Promise<void> {
    const sub = this.pushSubs.find(s => s.id === id);
    if (sub) sub.isActive = false;
  }

  async deactivatePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    const sub = this.pushSubs.find(s => s.endpoint === endpoint);
    if (sub) sub.isActive = false;
  }

  async getDailyPushPaymentSummaries(start: Date, end: Date): Promise<DailyPushPaymentSummary[]> {
    const summaries = new Map<number, { amountCents: number; paymentCount: number }>();
    const addPayment = (merchantId: number, amount: string) => {
      const current = summaries.get(merchantId) ?? { amountCents: 0, paymentCount: 0 };
      current.amountCents += Math.round(Number(amount) * 100);
      current.paymentCount += 1;
      summaries.set(merchantId, current);
    };
    for (const transaction of this.transactions.values()) {
      if (
        transaction.merchantId == null
        || transaction.isSplit
        || ["cash", "manual"].includes(transaction.paymentMethod ?? "")
        || !["completed", "partially_refunded", "refunded"].includes(transaction.status)
        || !transaction.completedAt
        || transaction.completedAt < start
        || transaction.completedAt >= end
      ) continue;
      addPayment(transaction.merchantId, transaction.price);
    }
    for (const split of this.splitPayments.values()) {
      if (
        split.merchantId == null
        || split.status !== "completed"
        || !split.paidAt
        || split.paidAt < start
        || split.paidAt >= end
      ) continue;
      addPayment(split.merchantId, split.amount);
    }
    return Array.from(summaries, ([merchantId, summary]) => ({
      merchantId,
      amount: (summary.amountCents / 100).toFixed(2),
      paymentCount: summary.paymentCount,
    }));
  }

  async claimPushNotificationDelivery(
    merchantId: number,
    eventType: PushNotificationEventType,
    eventKey: string,
    now = new Date(),
  ): Promise<string | null> {
    const key = `${merchantId}:${eventType}:${eventKey}`;
    const existing = this.pushDeliveryClaims.get(key);
    const staleBefore = now.getTime() - PUSH_NOTIFICATION_DELIVERY_LEASE_MS;
    if (
      existing
      && existing.status !== "failed"
      && !(existing.status === "claimed" && existing.claimedAt.getTime() <= staleBefore)
    ) return null;
    const claimToken = randomUUID();
    this.pushDeliveryClaims.set(key, { status: "claimed", claimToken, claimedAt: now });
    return claimToken;
  }

  async completePushNotificationDelivery(
    merchantId: number,
    eventType: PushNotificationEventType,
    eventKey: string,
    claimToken: string,
    status: PushNotificationDeliveryStatus,
  ): Promise<void> {
    const key = `${merchantId}:${eventType}:${eventKey}`;
    const existing = this.pushDeliveryClaims.get(key);
    if (existing?.claimToken === claimToken) {
      this.pushDeliveryClaims.set(key, { ...existing, status });
    }
  }

  async createInfoPackLead(data: { name: string; email: string }): Promise<any> {
    const lead = { id: Date.now(), ...data, createdAt: new Date() };
    return lead;
  }

  async createWebhookDelivery(data: any): Promise<any> {
    return { ...data, id: Date.now(), createdAt: new Date() };
  }

  async updateWebhookDelivery(id: number, data: any): Promise<any> {
    return null;
  }

  async getWebhookDeliveries(apiKeyId: number): Promise<any[]> {
    return [];
  }

  // Tapt Stone operations
  private async withTaptStoneCreationLock<T>(
    merchantId: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.taptStoneCreationLocks.get(merchantId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lockTail = previous.then(() => current);
    this.taptStoneCreationLocks.set(merchantId, lockTail);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.taptStoneCreationLocks.get(merchantId) === lockTail) {
        this.taptStoneCreationLocks.delete(merchantId);
      }
    }
  }

  async createTaptStone(data: InsertTaptStone): Promise<TaptStone> {
    const id = this.currentTaptStoneId++;
    const taptStone: TaptStone = {
      ...data,
      merchantId: data.merchantId ?? null,
      id,
      qrCodeUrl: null,
      paymentUrl: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.taptStones.set(id, taptStone);
    return taptStone;
  }

  async createNextTaptStone(merchantId: number, name?: string): Promise<TaptStone> {
    return this.withTaptStoneCreationLock(merchantId, async () => {
      const activeStones = Array.from(this.taptStones.values()).filter(
        (stone) => stone.merchantId === merchantId && stone.isActive,
      );
      const stoneNumber = firstFreeTaptStoneNumber(activeStones);
      if (stoneNumber === undefined) throw new TaptStoneCapacityError();

      return this.createTaptStone({
        merchantId,
        stoneNumber,
        name: name?.trim() || `Stone ${stoneNumber}`,
      });
    });
  }

  async getTaptStone(id: number): Promise<TaptStone | undefined> {
    return this.taptStones.get(id);
  }

  async getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]> {
    return Array.from(this.taptStones.values()).filter(
      (stone) => stone.merchantId === merchantId && stone.isActive
    );
  }

  async updateTaptStone(id: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined> {
    const stone = this.taptStones.get(id);
    if (stone) {
      if (data.name !== undefined) {
        stone.name = data.name;
      }
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return stone;
    }
    return undefined;
  }

  async updateTaptStoneUrls(id: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined> {
    const stone = this.taptStones.get(id);
    if (stone) {
      stone.qrCodeUrl = qrCodeUrl;
      stone.paymentUrl = paymentUrl;
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return stone;
    }
    return undefined;
  }

  async deleteTaptStone(id: number): Promise<boolean> {
    const stone = this.taptStones.get(id);
    if (stone) {
      stone.isActive = false;
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return true;
    }
    return false;
  }

  async associateTransactionWithStone(transactionId: number, stoneId: number): Promise<void> {
    // For MemStorage, we could add a field to track stone associations
    // but for simplicity, we'll just log this association
    console.log(`Transaction ${transactionId} associated with stone ${stoneId}`);
  }

  // Stock Item operations
  async createStockItem(data: InsertStockItem): Promise<StockItem> {
    const id = this.currentStockItemId++;
    const stockItem: StockItem = {
      ...data,
      merchantId: data.merchantId ?? null,
      description: data.description ?? null,
      emoji: (data as any).emoji ?? null,
      variations: (data as any).variations ?? null,
      id,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.stockItems.set(id, stockItem);
    return stockItem;
  }

  async getStockItem(id: number): Promise<StockItem | undefined> {
    return this.stockItems.get(id);
  }

  async getStockItemsByMerchant(merchantId: number): Promise<StockItem[]> {
    return Array.from(this.stockItems.values()).filter(
      (item) => item.merchantId === merchantId && item.isActive
    );
  }

  async updateStockItem(id: number, data: Partial<InsertStockItem>): Promise<StockItem | undefined> {
    const item = this.stockItems.get(id);
    if (item) {
      const updatedItem = {
        ...item,
        ...data,
        updatedAt: new Date(),
      };
      this.stockItems.set(id, updatedItem);
      return updatedItem;
    }
    return undefined;
  }

  async deleteStockItem(id: number): Promise<boolean> {
    const item = this.stockItems.get(id);
    if (item) {
      item.isActive = false;
      item.updatedAt = new Date();
      this.stockItems.set(id, item);
      return true;
    }
    return false;
  }

  // Subscription methods for database-free local development and focused tests.
  async getOrCreateSubscription(merchantId: number): Promise<MerchantSubscription> {
    return this.ensureMemSubscription(merchantId);
  }

  async getSubscription(merchantId: number): Promise<MerchantSubscription | undefined> {
    return this.subscriptions.get(merchantId);
  }

  async incrementTransactionCount(merchantId: number): Promise<void> {
    const subscription = this.ensureMemSubscription(merchantId);
    const now = new Date();
    const monthStart = new Date(subscription.monthStartDate ?? now);
    const monthsElapsed =
      (now.getFullYear() - monthStart.getFullYear()) * 12
      + now.getMonth() - monthStart.getMonth();
    if (monthsElapsed >= 1) {
      subscription.currentMonthTransactions = 0;
      subscription.monthStartDate = now;
    }
    subscription.currentMonthTransactions = (subscription.currentMonthTransactions ?? 0) + 1;
    subscription.totalLifetimeTransactions = (subscription.totalLifetimeTransactions ?? 0) + 1;
    subscription.updatedAt = now;
    this.merchantTransactionCounts.set(
      merchantId,
      (this.merchantTransactionCounts.get(merchantId) ?? 0) + 1,
    );
  }

  async cancelSubscription(
    merchantId: number,
    reason: string,
  ): Promise<CancelSubscriptionResult> {
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const subscription = this.subscriptions.get(merchantId);
      if (!subscription) return { ok: false as const, reason: "not-found" as const };
      if (subscription.billingClaimToken) {
        return { ok: false as const, reason: "billing-busy" as const };
      }
      const now = new Date();
      const hasLivePaidPeriod =
        subscription.status !== "cancelled"
        && !!subscription.lastBillingDate
        && !!subscription.currentPeriodEnd
        && new Date(subscription.currentPeriodEnd).getTime() > now.getTime();
      const effectiveDate = hasLivePaidPeriod
        ? new Date(subscription.currentPeriodEnd!)
        : now;
      Object.assign(subscription, {
        status: hasLivePaidPeriod ? subscription.status : "cancelled",
        cancelAtPeriodEnd: hasLivePaidPeriod,
        cancellationRequestedAt: now,
        cancellationEffectiveDate: effectiveDate,
        cancellationReason: reason,
        windcaveBillingRef: null,
        ...(!hasLivePaidPeriod ? {
          lastBillingDate: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          nextBillingDate: null,
        } : {}),
        updatedAt: now,
      });
      return { ok: true as const, subscription };
    });
  }

  async getBillingHistory(merchantId: number, limit: number = 50): Promise<SubscriptionBillingHistory[]> {
    return Array.from(this.subscriptionHistory.values())
      .filter((row) => row.merchantId === merchantId)
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      .slice(0, limit);
  }

  async createBillingHistory(data: any): Promise<SubscriptionBillingHistory> {
    const row = {
      ...data,
      id: this.currentSubscriptionHistoryId++,
      createdAt: data.createdAt ?? new Date(),
    } as SubscriptionBillingHistory;
    this.subscriptionHistory.set(row.id, row);
    return row;
  }

  // ── Property management — MemStorage stubs (DB-only feature) ────────────────
  async createTenantProfile(data: any): Promise<any> { throw new Error("Property management requires database"); }
  async getTenantProfile(id: string): Promise<any> { return undefined; }
  async getTenantProfilesByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }
  async updateTenantProfile(id: string, updates: any): Promise<any> { return undefined; }
  async archiveTenantProfile(id: string): Promise<any> { return undefined; }
  async unarchiveTenantProfile(id: string): Promise<any> { return undefined; }
  async createActiveSchedule(data: any): Promise<any> { throw new Error("Property management requires database"); }
  async getActiveSchedule(id: string): Promise<any> { return undefined; }
  async getActiveSchedulesByTenant(tenantProfileId: string): Promise<any[]> { return []; }
  async getActiveSchedulesByMerchant(merchantId: number): Promise<any[]> { return []; }
  async updateActiveSchedule(id: string, updates: any): Promise<any> { return undefined; }
  async terminateActiveSchedule(id: string): Promise<any> { return undefined; }
  async getDueActiveSchedules(now: Date): Promise<any[]> { return []; }
  async createInvoiceRentRequest(data: any): Promise<any> { throw new Error("Property management requires database"); }
  async getInvoiceRentRequest(id: string): Promise<any> { return undefined; }
  async getInvoiceRentRequestByToken(token: string): Promise<any> { return undefined; }
  async getInvoiceRentRequestByWindcaveSessionId(sessionId: string): Promise<any> { return undefined; }
  async getInvoiceRentRequestsByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }
  async updateInvoiceRentRequest(id: string, updates: any): Promise<any> { return undefined; }
  async atomicClaimSplitShare(invoiceId: string, sessionId: string): Promise<any | null> { return null; }
  async getInvoiceRentRequestByWhatsappMessageId(messageId: string): Promise<any | undefined> { return undefined; }
  async getPendingDispatchInvoices(): Promise<any[]> { return []; }
  async getOverdueEligibleInvoices(now: Date): Promise<any[]> { return []; }
  async getReminderEligibleInvoices(): Promise<any[]> { return []; }
  async getLiveInvoiceByTenant(tenantProfileId: string): Promise<any> { return undefined; }
  async logTransactionEvent(data: any): Promise<any> { return {}; }
  async getTransactionEventsByTenant(tenantProfileId: string, limit?: number): Promise<any[]> { return []; }
  async getTransactionEventsByInvoice(invoiceId: string): Promise<any[]> { return []; }

  // ── Trades — MemStorage stubs (DB-only feature) ───────────────────────────
  async createClientProfile(data: any): Promise<any> { throw new Error("Trades requires database"); }
  async getClientProfile(id: string): Promise<any> { return undefined; }
  async getClientProfilesByMerchant(merchantId: number): Promise<any[]> { return []; }
  async updateClientProfile(id: string, updates: any): Promise<any> { return undefined; }
  async archiveClientProfile(id: string): Promise<any> { return undefined; }
  async unarchiveClientProfile(id: string): Promise<any> { return undefined; }
  async createQuote(data: any): Promise<any> { throw new Error("Trades requires database"); }
  async getQuote(id: string): Promise<any> { return undefined; }
  async getQuoteByToken(token: string): Promise<any> { return undefined; }
  async getQuotesByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }
  async updateQuote(id: string, updates: any): Promise<any> { return undefined; }
  async createJobInvoice(data: any): Promise<any> { throw new Error("Trades requires database"); }
  async getJobInvoice(id: string): Promise<any> { return undefined; }
  async getJobInvoiceByToken(token: string): Promise<any> { return undefined; }
  async getJobInvoiceByWindcaveSessionId(sessionId: string): Promise<any> { return undefined; }
  async getJobInvoiceByWhatsappMessageId(messageId: string): Promise<any> { return undefined; }
  async getJobInvoicesByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }
  async getJobInvoicesByQuote(quoteId: string): Promise<any[]> { return []; }
  async getJobInvoiceByScheduleAndDue(scheduleId: string, dueAt: Date): Promise<any> { return undefined; }
  async updateJobInvoice(id: string, updates: any): Promise<any> { return undefined; }
  async atomicClaimJobSplitShare(invoiceId: string, sessionId: string): Promise<any | null> { return null; }
  async getPendingDispatchJobInvoices(): Promise<any[]> { return []; }
  async getOverdueEligibleJobInvoices(now: Date): Promise<any[]> { return []; }
  async getReminderEligibleJobInvoices(): Promise<any[]> { return []; }
  async createJobSchedule(data: any): Promise<any> { throw new Error("Trades requires database"); }
  async getJobSchedule(id: string): Promise<any> { return undefined; }
  async getJobSchedulesByMerchant(merchantId: number): Promise<any[]> { return []; }
  async getDueJobSchedules(now: Date): Promise<any[]> { return []; }
  async updateJobSchedule(id: string, updates: any): Promise<any> { return undefined; }
  async terminateJobSchedule(id: string): Promise<any> { return undefined; }
  async createJobEvent(data: any): Promise<any> { return undefined; }
  async getJobEventsByClient(clientProfileId: string, limit?: number): Promise<any[]> { return []; }

  // ── Subscriptions and team seats — database-free development parity ────────
  async resumeSubscription(merchantId: number): Promise<MerchantSubscription | null> {
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const subscription = this.subscriptions.get(merchantId);
      const now = new Date();
      if (
        !subscription
        || !subscription.cancelAtPeriodEnd
        || !["active", "past_due", "suspended"].includes(subscription.status)
        || !subscription.currentPeriodEnd
        || new Date(subscription.currentPeriodEnd).getTime() <= now.getTime()
      ) {
        return null;
      }
      Object.assign(subscription, {
        cancelAtPeriodEnd: false,
        cancellationRequestedAt: null,
        cancellationEffectiveDate: null,
        cancellationReason: null,
        updatedAt: now,
      });
      return subscription;
    });
  }

  async changeSubscriptionPlan(
    merchantId: number,
    planId: PlanId,
    chargeUpgrade?: PlanUpgradeChargeExecutor,
  ): Promise<PlanChangeResult> {
    const plan = planFor(planId);
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const subscription = this.subscriptions.get(merchantId);
      if (!subscription) return { ok: false as const, reason: "not-found" as const };

      const now = new Date();
      const seatsInUse = this.memSeatsInUse(merchantId, now);
      if (plan.seats < seatsInUse) {
        return {
          ok: false as const,
          reason: "too-many-seats" as const,
          seatsInUse,
          seatLimit: plan.seats,
        };
      }
      if (subscription.billingClaimToken) {
        return {
          ok: false as const,
          reason: "billing-busy" as const,
          message: "Billing is already in progress. Please try again shortly.",
        };
      }

      const currentPlan = planForOrDefault(subscription.planId);
      if (plan.id === currentPlan.id) {
        return { ok: true as const, subscription, applied: "immediate" as const };
      }
      const currentPriceCents = subscription.priceCents ?? currentPlan.priceCents;
      const upgrade = isUpgrade(currentPlan.id, plan.id);
      const downgrade = !upgrade;
      const hasLivePaidPeriod =
        subscription.status !== "cancelled"
        && !!subscription.lastBillingDate
        && !!subscription.currentPeriodEnd
        && new Date(subscription.currentPeriodEnd).getTime() > now.getTime();
      if (downgrade && hasLivePaidPeriod) {
        Object.assign(
          subscription,
          queuedPlanUpdates(planId, subscription.currentPeriodEnd ?? null, now),
        );
        return { ok: true as const, subscription, applied: "queued" as const };
      }

      const paidUpgrade = upgrade && hasLivePaidPeriod;
      if (!paidUpgrade) {
        Object.assign(subscription, immediatePlanUpdates(planId, now));
        return { ok: true as const, subscription, applied: "immediate" as const };
      }

      if (
        subscription.status !== "active"
        || subscription.cancelAtPeriodEnd
        || !subscription.currentPeriodStart
        || !subscription.currentPeriodEnd
      ) {
        return {
          ok: false as const,
          reason: "invalid-state" as const,
          message: "Resolve the current subscription state before upgrading.",
        };
      }
      if (!subscription.windcaveCardId) {
        return {
          ok: false as const,
          reason: "payment-method-required" as const,
          message: "Add a payment method before upgrading.",
        };
      }

      const amountCents = proratedUpgradeCents(
        currentPriceCents,
        plan.priceCents,
        new Date(subscription.currentPeriodStart),
        new Date(subscription.currentPeriodEnd),
        now,
      );
      if (amountCents > 0) {
        if (!chargeUpgrade) {
          return {
            ok: false as const,
            reason: "charge-failed" as const,
            message: "The upgrade charge could not be started.",
          };
        }
        const anchor = new Date(subscription.currentPeriodStart)
          .toISOString()
          .slice(0, 10);
        const idempotencyKey = `plan-${subscription.id}-${anchor}-${plan.id}`;
        const charge = await chargeUpgrade({
          subscriptionId: subscription.id,
          merchantId,
          targetPlanId: plan.id,
          cardId: subscription.windcaveCardId,
          amountCents,
          idempotencyKey,
          reference: `TAPTPAY-UPGRADE-M${merchantId}-${plan.id.toUpperCase()}-${anchor}`,
        });
        if (!charge.success) {
          return {
            ok: false as const,
            reason: "charge-failed" as const,
            message: "The upgrade payment could not be confirmed. Please try again.",
          };
        }
        if (!charge.approved) {
          return {
            ok: false as const,
            reason: "declined" as const,
            message: charge.declineReason || "The upgrade payment was declined.",
          };
        }
        if (!this.memBillingHistoryByIdempotencyKey(idempotencyKey)) {
          await this.createBillingHistory({
            merchantId,
            subscriptionId: subscription.id,
            billingType: "plan_change",
            amount: (amountCents / 100).toFixed(2),
            billingPeriodStart: now,
            billingPeriodEnd: subscription.currentPeriodEnd,
            windcaveTransactionId: charge.windcaveTransactionId ?? null,
            idempotencyKey,
            attemptNumber: 1,
            status: "succeeded",
            description: `Prorated upgrade to ${plan.name}`,
            paidAt: now,
          });
        }
      }

      Object.assign(subscription, immediatePlanUpdates(planId, now));
      return { ok: true as const, subscription, applied: "immediate" as const };
    });
  }

  async saveSubscriptionCard(
    merchantId: number,
    card: SubscriptionCardInput,
  ): Promise<MerchantSubscription> {
    const subscription = this.ensureMemSubscription(merchantId);
    Object.assign(subscription, {
      windcaveCardId: card.windcaveCardId,
      cardBrand: card.brand,
      cardLast4: card.last4,
      cardExpiry: card.expiry,
      updatedAt: new Date(),
    });
    return subscription;
  }

  async bindSubscriptionCardSession(merchantId: number, sessionId: string): Promise<boolean> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) return false;
    const subscription = this.ensureMemSubscription(merchantId);
    if (subscription.billingClaimToken) return false;
    subscription.windcaveBillingRef = normalizedSessionId;
    subscription.updatedAt = new Date();
    return true;
  }

  async completeSubscriptionCardSetup(
    merchantId: number,
    sessionId: string,
    card: SubscriptionCardInput,
    charge: SubscriptionCardChargeExecutor,
  ): Promise<SubscriptionCardSetupResult> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId || !card.windcaveCardId.trim()) {
      return {
        ok: false,
        reason: "session-mismatch",
        message: "The card session is invalid.",
      };
    }

    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const subscription = this.subscriptions.get(merchantId);
      if (!subscription) {
        return {
          ok: false as const,
          reason: "not-found" as const,
          message: "Subscription not found.",
        };
      }
      const cardSessionState = subscriptionCardSessionState(subscription, normalizedSessionId);
      if (cardSessionState === "succeeded") {
        const now = new Date();
        const paidPeriodIsCurrent =
          subscription.status === "active"
          && !!subscription.lastBillingDate
          && !!subscription.currentPeriodEnd
          && new Date(subscription.currentPeriodEnd).getTime() > now.getTime();
        if (paidPeriodIsCurrent) {
          Object.assign(subscription, {
            windcaveCardId: card.windcaveCardId,
            cardBrand: card.brand,
            cardLast4: card.last4,
            cardExpiry: card.expiry,
            windcaveBillingRef: terminalSubscriptionCardSessionRef("succeeded", normalizedSessionId),
            updatedAt: now,
          });
        }
        return { ok: true as const, subscription, charged: false };
      }
      if (cardSessionState === "declined") {
        return {
          ok: false as const,
          reason: "declined" as const,
          message: "The card was declined.",
        };
      }
      if (cardSessionState !== "pending") {
        return {
          ok: false as const,
          reason: "session-mismatch" as const,
          message: "The card session does not belong to this account.",
        };
      }
      if (subscription.billingClaimToken) {
        return {
          ok: false as const,
          reason: "billing-busy" as const,
          message: "Billing is already in progress. Please try again shortly.",
        };
      }

      const now = new Date();
      const paidPeriodIsCurrent =
        subscription.status === "active"
        && !!subscription.lastBillingDate
        && !!subscription.currentPeriodEnd
        && new Date(subscription.currentPeriodEnd).getTime() > now.getTime();
      const cardFields = {
        windcaveCardId: card.windcaveCardId,
        cardBrand: card.brand,
        cardLast4: card.last4,
        cardExpiry: card.expiry,
        updatedAt: now,
      };
      if (paidPeriodIsCurrent) {
        Object.assign(subscription, cardFields, {
          windcaveBillingRef: terminalSubscriptionCardSessionRef("succeeded", normalizedSessionId),
        });
        return { ok: true as const, subscription, charged: false };
      }
      if (
        (subscription.cancelAtPeriodEnd && subscription.status !== "cancelled")
        || !["pending", "active", "past_due", "suspended", "cancelled"].includes(subscription.status)
      ) {
        return {
          ok: false as const,
          reason: "invalid-state" as const,
          message: "Resolve the pending cancellation before adding a payment method.",
        };
      }

      const plan = renewalPlan(subscription);
      const amountCents = subscription.pendingPlanId
        ? plan.priceCents
        : (subscription.priceCents ?? plan.priceCents);
      const idempotencyKey =
        `sub-${subscription.id}-card-${createHash("sha256")
          .update(normalizedSessionId)
          .digest("hex")
          .slice(0, 16)}`;
      const periodStart = nextBillingPeriodStart(subscription, now);
      const periodEnd = addOneMonth(periodStart);
      const prior = this.memBillingHistoryByIdempotencyKey(idempotencyKey);
      if (prior?.status === "failed") {
        subscription.windcaveBillingRef =
          terminalSubscriptionCardSessionRef("declined", normalizedSessionId);
        return {
          ok: false as const,
          reason: "declined" as const,
          message: prior.failureReason || "The card was declined.",
        };
      }
      if (prior && prior.status !== "succeeded") {
        return {
          ok: false as const,
          reason: "billing-busy" as const,
          message: "Card activation is already in progress.",
        };
      }
      if (prior?.status === "succeeded") {
        subscription.windcaveBillingRef =
          terminalSubscriptionCardSessionRef("succeeded", normalizedSessionId);
        return { ok: true as const, subscription, charged: false };
      }
      const attemptNumber = (subscription.failedPaymentCount ?? 0) + 1;

      const outcome = await charge({
            subscriptionId: subscription.id,
            merchantId,
            cardId: card.windcaveCardId,
            amountCents,
            idempotencyKey,
            reference: `TAPTPAY-CARD-M${merchantId}-${plan.id.toUpperCase()}`,
          });
      if (!outcome.success) {
        return {
          ok: false as const,
          reason: "charge-failed" as const,
          message: "The payment could not be confirmed. Please try again.",
        };
      }
      if (!outcome.approved) {
        const failureReason = outcome.declineReason || "Card declined";
        const exhausted =
          (subscription.failedPaymentCount ?? 0) + 1 >= MAX_PAYMENT_ATTEMPTS;
        if (!prior) {
          await this.createBillingHistory({
            merchantId,
            subscriptionId: subscription.id,
            billingType: "monthly_subscription",
            amount: (amountCents / 100).toFixed(2),
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd,
            windcaveTransactionId: outcome.windcaveTransactionId ?? null,
            idempotencyKey,
            attemptNumber,
            status: "failed",
            description: `${plan.name} subscription activation`,
            failureReason,
          });
        }
        Object.assign(subscription, {
          ...cardFields,
          ...failedPaymentUpdates(subscription, now, failureReason, exhausted),
          cancelAtPeriodEnd: false,
          cancellationRequestedAt: null,
          cancellationEffectiveDate: null,
          cancellationReason: null,
          lastBillingDate: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          nextBillingDate: periodStart,
          windcaveBillingRef: terminalSubscriptionCardSessionRef("declined", normalizedSessionId),
        });
        return {
          ok: false as const,
          reason: "declined" as const,
          message: failureReason,
        };
      }

      Object.assign(subscription, {
        ...nextPeriodUpdates(subscription, now, periodStart),
        ...cardFields,
        cancelAtPeriodEnd: false,
        cancellationRequestedAt: null,
        cancellationEffectiveDate: null,
        cancellationReason: null,
        windcaveBillingRef: terminalSubscriptionCardSessionRef("succeeded", normalizedSessionId),
      });
      if (!prior) {
        await this.createBillingHistory({
          merchantId,
          subscriptionId: subscription.id,
          billingType: "monthly_subscription",
          amount: (amountCents / 100).toFixed(2),
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          windcaveTransactionId: outcome.windcaveTransactionId ?? null,
          idempotencyKey,
          attemptNumber,
          status: "succeeded",
          description: `${plan.name} subscription activation`,
          paidAt: now,
        });
      }
      return { ok: true as const, subscription, charged: true };
    });
  }

  async removeSubscriptionCard(merchantId: number): Promise<MerchantSubscription> {
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const subscription = this.ensureMemSubscription(merchantId);
      if (subscription.billingClaimToken) throw new SubscriptionBillingBusyError();
      Object.assign(subscription, {
        windcaveCardId: null,
        cardBrand: null,
        cardLast4: null,
        cardExpiry: null,
        updatedAt: new Date(),
      });
      return subscription;
    });
  }

  async getCancelledSubscriptionsPastPeriodEnd(
    now: Date,
  ): Promise<MerchantSubscription[]> {
    return Array.from(this.subscriptions.values()).filter((subscription) =>
      subscription.cancelAtPeriodEnd
      && subscription.status !== "cancelled"
      && !!subscription.currentPeriodEnd
      && new Date(subscription.currentPeriodEnd).getTime() <= now.getTime()
    );
  }

  async claimSubscriptionsDueForBilling(
    now: Date,
    limit: number = 50,
    excludeSubscriptionIds: readonly number[] = [],
    claimedAt: Date = now,
  ): Promise<MerchantSubscription[]> {
    return withMemLock(this.accountMutationLocks, "subscription-billing-claims", async () => {
      const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      const excluded = new Set(excludeSubscriptionIds);
      const staleBefore = new Date(
        claimedAt.getTime() - SUBSCRIPTION_BILLING_CLAIM_LEASE_MS,
      );
      return Array.from(this.subscriptions.values())
        .filter((subscription) =>
          !excluded.has(subscription.id)
          && ["active", "past_due"].includes(subscription.status)
          && decideBilling(subscription, now).action !== "skip"
          && (
            !subscription.billingClaimToken
            || !subscription.billingClaimedAt
            || new Date(subscription.billingClaimedAt).getTime() < staleBefore.getTime()
          )
        )
        .slice(0, safeLimit)
        .map((subscription) => {
          subscription.billingClaimToken = randomUUID();
          subscription.billingClaimedAt = claimedAt;
          subscription.nextBillingDate ??=
            subscription.currentPeriodEnd ?? nextBillingPeriodStart(subscription, now);
          subscription.updatedAt = claimedAt;
          return subscription;
        });
    });
  }

  async finalizeSubscriptionBillingClaim(
    subscriptionId: number,
    claimToken: string,
    updates: Record<string, unknown>,
    history: Record<string, unknown>,
  ): Promise<boolean> {
    return withMemLock(this.accountMutationLocks, "subscription-billing-claims", async () => {
      const subscription = this.memSubscriptionById(subscriptionId);
      if (!subscription || subscription.billingClaimToken !== claimToken) return false;
      Object.assign(subscription, updates, {
        billingClaimToken: null,
        billingClaimedAt: null,
      });
      const idempotencyKey =
        typeof history.idempotencyKey === "string" ? history.idempotencyKey : null;
      if (!idempotencyKey || !this.memBillingHistoryByIdempotencyKey(idempotencyKey)) {
        await this.createBillingHistory(history);
      }
      return true;
    });
  }

  async releaseSubscriptionBillingClaim(subscriptionId: number, claimToken: string): Promise<void> {
    await withMemLock(this.accountMutationLocks, "subscription-billing-claims", async () => {
      const subscription = this.memSubscriptionById(subscriptionId);
      if (subscription?.billingClaimToken === claimToken) {
        subscription.billingClaimToken = null;
        subscription.billingClaimedAt = null;
      }
    });
  }

  async expireCancelledSubscriptions(now: Date): Promise<number> {
    const rows = (await this.getCancelledSubscriptionsPastPeriodEnd(now))
      .filter((row) => !row.billingClaimToken);
    rows.forEach((row) => Object.assign(row, {
      status: "cancelled",
      cancelAtPeriodEnd: false,
      lastBillingDate: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      nextBillingDate: null,
      updatedAt: now,
    }));
    return rows.length;
  }

  async getTeamMembers(merchantId: number): Promise<User[]> {
    return Array.from(this.users.values())
      .filter((user) => user.merchantId === merchantId)
      .sort((a, b) => a.id - b.id);
  }

  async countSeatsInUse(merchantId: number): Promise<number> {
    return this.memSeatsInUse(merchantId);
  }

  async inviteTeamMember(
    merchantId: number,
    input: InviteTeamMemberInput,
  ): Promise<InviteTeamMemberResult> {
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const email = input.email.trim().toLowerCase();
      const emailTaken = Array.from(this.users.values()).some(
        (user) => user.email.trim().toLowerCase() === email,
      );
      if (emailTaken) {
        return { ok: false as const, reason: "email-taken" as const };
      }

      const now = new Date();
      const seatsInUse = this.memSeatsInUse(merchantId, now);
      const seatLimit = this.memEffectiveSeatLimit(merchantId);
      if (seatsInUse >= seatLimit) {
        return {
          ok: false as const,
          reason: "seat-limit" as const,
          seatsInUse,
          seatLimit,
        };
      }

      const user: User = {
        id: this.currentUserId++,
        email,
        password: "!",
        merchantId,
        role: "member",
        name: input.name ?? null,
        status: "invited",
        inviteTokenHash: input.inviteTokenHash,
        inviteExpiresAt: input.inviteExpiresAt,
        lastLoginAt: null,
        resetToken: null,
        resetTokenExpiry: null,
        createdAt: now,
      };
      this.users.set(user.id, user);
      return { ok: true as const, user };
    });
  }

  async setTeamMemberStatus(
    merchantId: number,
    userId: number,
    status: UserStatus,
  ): Promise<TeamMemberStatusResult> {
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const member = this.users.get(userId);
      if (!member || member.merchantId !== merchantId) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (member.role === "owner") {
        return { ok: false as const, reason: "owner" as const };
      }
      if (
        (member.status !== "active" && member.status !== "disabled")
        || (status !== "active" && status !== "disabled")
        || member.status === status
      ) {
        return { ok: false as const, reason: "invalid-state" as const };
      }

      if (status === "active") {
        const seatsInUse = this.memSeatsInUse(merchantId);
        const seatLimit = this.memEffectiveSeatLimit(merchantId);
        if (seatsInUse >= seatLimit) {
          return {
            ok: false as const,
            reason: "seat-limit" as const,
            seatsInUse,
            seatLimit,
          };
        }
      }
      member.status = status;
      return { ok: true as const, user: member };
    });
  }

  async rotateTeamInvite(
    merchantId: number,
    userId: number,
    input: Pick<
      InviteTeamMemberInput,
      "inviteTokenHash" | "inviteExpiresAt" | "name"
    > & { expectedTokenHash: string },
  ): Promise<RotateTeamInviteResult> {
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const invited = this.users.get(userId);
      if (
        !invited
        || invited.merchantId !== merchantId
        || invited.role === "owner"
        || invited.status !== "invited"
      ) {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (invited.inviteTokenHash !== input.expectedTokenHash) {
        return { ok: false as const, reason: "conflict" as const };
      }

      const now = new Date();
      const wasLive =
        !!invited.inviteExpiresAt
        && new Date(invited.inviteExpiresAt).getTime() > now.getTime();
      if (!wasLive) {
        const seatsInUse = this.memSeatsInUse(merchantId, now);
        const seatLimit = this.memEffectiveSeatLimit(merchantId);
        if (seatsInUse >= seatLimit) {
          return {
            ok: false as const,
            reason: "seat-limit" as const,
            seatsInUse,
            seatLimit,
          };
        }
      }

      invited.inviteTokenHash = input.inviteTokenHash;
      invited.inviteExpiresAt = input.inviteExpiresAt;
      if (input.name !== undefined) invited.name = input.name;
      return { ok: true as const, user: invited };
    });
  }

  async revokeTeamInvite(
    merchantId: number,
    userId: number,
    expectedTokenHash?: string,
  ): Promise<boolean> {
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const invited = this.users.get(userId);
      if (
        !invited
        || invited.merchantId !== merchantId
        || invited.role === "owner"
        || invited.status !== "invited"
        || (
          expectedTokenHash !== undefined
          && invited.inviteTokenHash !== expectedTokenHash
        )
      ) {
        return false;
      }
      return this.users.delete(userId);
    });
  }

  async removeTeamMember(merchantId: number, userId: number): Promise<boolean> {
    return withMemLock(this.accountMutationLocks, `merchant:${merchantId}`, async () => {
      const member = this.users.get(userId);
      if (
        !member
        || member.merchantId !== merchantId
        || member.role === "owner"
      ) {
        return false;
      }
      return this.users.delete(userId);
    });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    return Array.from(this.users.values()).find(
      (user) => user.email.trim().toLowerCase() === normalizedEmail,
    );
  }

  async getUserById(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByInviteToken(tokenHash: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.inviteTokenHash === tokenHash,
    );
  }

  async activateInvitedUser(
    userId: number,
    tokenHash: string,
    passwordHash: string,
    name?: string | null,
    now: Date = new Date(),
  ): Promise<User | null> {
    const candidate = this.users.get(userId);
    const lockKey = candidate?.merchantId == null
      ? `user:${userId}`
      : `merchant:${candidate.merchantId}`;
    return withMemLock(this.accountMutationLocks, lockKey, async () => {
      const invited = this.users.get(userId);
      if (
        !invited
        || invited.status !== "invited"
        || invited.inviteTokenHash !== tokenHash
        || !invited.inviteExpiresAt
        || new Date(invited.inviteExpiresAt).getTime() <= now.getTime()
      ) {
        return null;
      }
      invited.password = passwordHash;
      invited.status = "active";
      invited.inviteTokenHash = null;
      invited.inviteExpiresAt = null;
      if (name != null) invited.name = name;
      return invited;
    });
  }

  async recordUserLogin(userId: number, at: Date): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.lastLoginAt = at;
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<User | null> {
    const candidate = this.users.get(userId);
    if (!candidate) return null;
    const lockKey = candidate.merchantId == null
      ? `user:${userId}`
      : `merchant:${candidate.merchantId}`;
    return withMemLock(this.accountMutationLocks, lockKey, async () => {
      const user = this.users.get(userId);
      if (!user) return null;
      user.password = passwordHash;
      if (user.role === "owner" && user.merchantId != null) {
        const merchant = this.merchants.get(user.merchantId);
        if (merchant) {
          merchant.passwordHash = passwordHash;
          merchant.updatedAt = new Date();
        }
      }
      return user;
    });
  }

  async setUserResetToken(
    userId: number,
    tokenHash: string | null,
    expiry: Date | null,
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    if (
      tokenHash
      && Array.from(this.users.values()).some(
        (candidate) =>
          candidate.id !== userId && candidate.resetToken === tokenHash,
      )
    ) {
      throw new Error("Reset token already exists");
    }
    user.resetToken = tokenHash;
    user.resetTokenExpiry = expiry;
  }

  async getUserByResetToken(tokenHash: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.resetToken === tokenHash,
    );
  }

  async resetUserPasswordByToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<User | null> {
    const candidate = Array.from(this.users.values()).find(
      (user) => user.resetToken === tokenHash,
    );
    if (!candidate) return null;
    const lockKey = candidate.merchantId == null
      ? `user:${candidate.id}`
      : `merchant:${candidate.merchantId}`;
    return withMemLock(this.accountMutationLocks, lockKey, async () => {
      const user = this.users.get(candidate.id);
      if (
        !user
        || user.resetToken !== tokenHash
        || user.status !== "active"
        || (user.role !== "owner" && user.role !== "member")
        || user.merchantId == null
        || !user.resetTokenExpiry
        || new Date(user.resetTokenExpiry).getTime() <= now.getTime()
      ) {
        return null;
      }

      user.password = passwordHash;
      user.resetToken = null;
      user.resetTokenExpiry = null;
      if (user.role === "owner") {
        const merchant = this.merchants.get(user.merchantId);
        if (merchant) {
          merchant.passwordHash = passwordHash;
          merchant.updatedAt = now;
        }
      }
      return user;
    });
  }
}

// Database Storage Implementation
export class DatabaseStorage implements IStorage {
  private db = getDb();

  async getMerchant(id: number): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
    return result[0];
  }

  async getMerchantByName(name: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.name, name)).limit(1);
    return result[0];
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(merchants).values(insertMerchant).returning();
    return result[0];
  }

  async createMerchantWithPassword(merchantData: any, passwordHash: string): Promise<Merchant> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      const insertData = {
        ...merchantData,
        email: String(merchantData.email).trim().toLowerCase(),
        contactEmail: merchantData.contactEmail ?? String(merchantData.email).trim().toLowerCase(),
        contactPhone: merchantData.contactPhone ?? merchantData.phone ?? null,
        businessAddress: merchantData.businessAddress ?? merchantData.address ?? null,
        passwordHash,
        status: 'verified',
        verificationToken: null,
      };
      const result = await tx.insert(merchants).values(insertData).returning();
      const inserted = result[0];
      const updated = await tx
        .update(merchants)
        .set({
          qrCodeUrl: `/api/merchants/${inserted.id}/qr`,
          paymentUrl: `/pay/${inserted.id}`,
        })
        .where(eq(merchants.id, inserted.id))
        .returning();
      const merchant = updated[0];
      await this.syncOwnerUser(merchant, passwordHash, tx);
      await tx
        .insert(merchantSubscriptions)
        .values(newSubscriptionValues(merchant.id))
        .onConflictDoNothing({ target: merchantSubscriptions.merchantId });
      return merchant;
    });
  }

  async updateMerchant(id: number, updates: Partial<Merchant>): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async getMerchantTutorialProgress(merchantId: number, generation: number): Promise<MerchantTutorialProgress[]> {
    if (!this.db) throw new Error('Database not available');
    return this.db
      .select()
      .from(merchantTutorialProgress)
      .where(and(
        eq(merchantTutorialProgress.merchantId, merchantId),
        eq(merchantTutorialProgress.generation, generation),
      ));
  }

  async upsertMerchantTutorialProgress(merchantId: number, generation: number, pageKey: string, status: string, lastStep: number): Promise<MerchantTutorialProgress> {
    if (!this.db) throw new Error('Database not available');
    const now = new Date();
    const rows = await this.db
      .insert(merchantTutorialProgress)
      .values({
        merchantId,
        generation,
        pageKey,
        status,
        lastStep,
        completedAt: status === 'completed' ? now : null,
        dismissedAt: status === 'dismissed' ? now : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [merchantTutorialProgress.merchantId, merchantTutorialProgress.generation, merchantTutorialProgress.pageKey],
        set: {
          status,
          lastStep,
          completedAt: status === 'completed' ? now : null,
          dismissedAt: status === 'dismissed' ? now : null,
          updatedAt: now,
        },
      })
      .returning();
    return rows[0];
  }

  async restartMerchantTutorial(merchantId: number): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db
      .update(merchants)
      .set({
        tutorialGeneration: sql`${merchants.tutorialGeneration} + 1`,
        tutorialAutoEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(merchants.id, merchantId))
      .returning();
    return rows[0];
  }

  async updateMerchantLogoUrl(id: number, logoUrl: string | null): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ customLogoUrl: logoUrl, updatedAt: new Date() })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantBillingCard(id: number, card: { last4: string; brand: string; expiry: string } | null): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({
        billingCardLast4: card?.last4 ?? null,
        billingCardBrand: card?.brand ?? null,
        billingCardExpiry: card?.expiry ?? null,
        updatedAt: new Date(),
      })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set(details)
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set(bankDetails)
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantTheme(id: number, themeId: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ themeId })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async getMerchantByEmail(email: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const normalizedEmail = email.trim().toLowerCase();
    const result = await this.db
      .select()
      .from(merchants)
      .where(sql`lower(${merchants.email}) = ${normalizedEmail}`)
      .limit(1);
    return result[0];
  }

  async getMerchantByToken(token: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.verificationToken, token)).limit(1);
    return result[0];
  }

  async getMerchantByResetToken(resetToken: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(merchants).where(eq(merchants.resetToken, resetToken)).limit(1);
    return result[0];
  }

  async getAllMerchants(): Promise<Merchant[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.select().from(merchants);
  }

  async createMerchantWithSignup(data: MerchantSignupStorageInput): Promise<Merchant> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      const selectedPlan = planFor(data.planId ?? DEFAULT_PLAN_ID);
      const result = await tx.insert(merchants).values({
        name: data.name,
        businessName: data.businessName,
        businessType: data.businessType,
        email: data.email.trim().toLowerCase(),
        phone: data.phone,
        address: data.address,
        contactEmail: data.contactEmail ?? data.email.trim().toLowerCase(),
        contactPhone: data.contactPhone ?? data.phone,
        businessAddress: data.businessAddress ?? data.address,
        nzbn: data.nzbn ?? null,
        gstNumber: data.gstNumber ?? null,
        director: data.director ?? null,
        businessDescription: data.businessDescription ?? null,
        websiteUrl: data.websiteUrl ?? null,
        estimatedAnnualTurnover: data.estimatedAnnualTurnover ?? null,
        onboardingCompleted: data.onboardingCompleted ?? false,
        passwordHash: data.passwordHash ?? null,
        status: "pending",
        verificationToken: data.verificationToken,
        currentProviderRate: "0.0290",
        ourRate: "0.0020",
        qrCodeUrl: "",
        paymentUrl: "",
      }).returning();
      const merchant = result[0];

      const updatedResult = await tx
        .update(merchants)
        .set({
          qrCodeUrl: `/api/merchants/${merchant.id}/qr`,
          paymentUrl: `/pay/${merchant.id}`,
        })
        .where(eq(merchants.id, merchant.id))
        .returning();
      const updated = updatedResult[0];

      if (data.passwordHash) await this.syncOwnerUser(updated, data.passwordHash, tx);
      await tx
        .insert(merchantSubscriptions)
        .values({
          ...newSubscriptionValues(merchant.id),
          planId: selectedPlan.id,
          seatLimit: selectedPlan.seats,
          priceCents: selectedPlan.priceCents,
        })
        .onConflictDoNothing({ target: merchantSubscriptions.merchantId });
      return updated;
    });
  }

  async verifyMerchant(token: string, passwordHash: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      const result = await tx
        .update(merchants)
        .set({
          passwordHash,
          status: "verified",
          verificationToken: null,
          updatedAt: new Date(),
        })
        .where(eq(merchants.verificationToken, token))
        .returning();
      if (result[0]) await this.syncOwnerUser(result[0], passwordHash, tx);
      if (result[0]) {
        await tx
          .update(merchantSubscriptions)
          .set({ status: "active", updatedAt: new Date() })
          .where(and(
            eq(merchantSubscriptions.merchantId, result[0].id),
            eq(merchantSubscriptions.status, "pending"),
          ));
      }
      return result[0];
    });
  }

  async confirmMerchantEmail(
    token: string,
    onboardingCompleted: boolean,
  ): Promise<Merchant | undefined> {
    if (!this.db) throw new Error("Database not available");
    return await this.db.transaction(async (tx) => {
      const now = new Date();
      const rows = await tx
        .update(merchants)
        .set({
          emailVerified: true,
          verificationToken: null,
          status: "verified",
          onboardingCompleted,
          updatedAt: now,
        })
        .where(eq(merchants.verificationToken, token))
        .returning();
      const merchant = rows[0];
      if (!merchant) return undefined;
      await tx
        .update(merchantSubscriptions)
        .set({ status: "active", updatedAt: now })
        .where(and(
          eq(merchantSubscriptions.merchantId, merchant.id),
          eq(merchantSubscriptions.status, "pending"),
        ));
      return merchant;
    });
  }

  /**
   * Keeps the owner's login row in step with the merchant record.
   *
   * `users` is the login identity now, but merchants.password_hash is still
   * written by verification, password change and reset. Rather than chase every
   * one of those call sites, both hash writers funnel through here — so a
   * password change can never leave the owner unable to sign in.
   */
  private async syncOwnerUser(merchant: Merchant, passwordHash: string, executor: any = this.db): Promise<void> {
    if (!executor) throw new Error('Database not available');
    const normalizedEmail = merchant.email.trim().toLowerCase();
    const emailRows = await executor
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);
    const existing = await executor
      .select()
      .from(users)
      .where(and(eq(users.merchantId, merchant.id), eq(users.role, "owner")))
      .limit(1);

    const emailUser = emailRows[0];
    if (emailUser && emailUser.id !== existing[0]?.id) {
      throw new Error("That email address already belongs to another login");
    }

    if (existing[0]) {
      await executor
        .update(users)
        .set({ password: passwordHash, email: normalizedEmail, status: "active" })
        .where(eq(users.id, existing[0].id));
      return;
    }

    // Do not ignore a collision: the surrounding transaction must roll back
    // instead of committing a merchant that can never log in.
    await executor
      .insert(users)
      .values({
        email: normalizedEmail,
        password: passwordHash,
        merchantId: merchant.id,
        role: "owner",
        status: "active",
        name: merchant.name,
      });
  }

  async updateMerchantStatus(id: number, status: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(merchants)
      .set({ status, updatedAt: new Date() })
      .where(eq(merchants.id, id))
      .returning();
    return result[0];
  }

  async updateMerchantPasswordHash(id: number, passwordHash: string): Promise<Merchant | undefined> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      const result = await tx
        .update(merchants)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(merchants.id, id))
        .returning();
      if (result[0]) await this.syncOwnerUser(result[0], passwordHash, tx);
      return result[0];
    });
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    return result[0];
  }

  async getTransactionByPaymentTokenHash(
    paymentTokenHash: string,
  ): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.paymentTokenHash, paymentTokenHash))
      .limit(1);
    return result[0];
  }

  async getPaymentAttempt(id: string): Promise<PaymentAttempt | undefined> {
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, id))
      .limit(1);
    return rows[0];
  }

  async getPaymentAttemptByProcessorSessionId(
    processorSessionId: string,
  ): Promise<PaymentAttempt | undefined> {
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.processorSessionId, processorSessionId))
      .limit(1);
    return rows[0];
  }

  async getPaymentAttemptByTransactionShareKey(
    transactionId: number,
    shareIndex: number,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | undefined> {
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db
      .select()
      .from(paymentAttempts)
      .where(and(
        eq(paymentAttempts.transactionId, transactionId),
        eq(paymentAttempts.shareIndex, shareIndex),
        eq(paymentAttempts.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    return rows[0];
  }

  async claimPaymentAttemptRecord(
    input: ClaimPaymentAttemptRecordInput,
  ): Promise<ClaimPaymentAttemptResult> {
    const db = this.db;
    if (!db) throw new Error('Database not available');

    return db.transaction(async (tx) => {
      const transactionRows = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, input.transactionId))
        .for("update")
        .limit(1);
      const transaction = transactionRows[0];
      if (!transaction) return { kind: "transaction-not-found" };
      const attempts = await tx
        .select()
        .from(paymentAttempts)
        .where(and(
          eq(paymentAttempts.transactionId, input.transactionId),
          eq(paymentAttempts.shareIndex, input.shareIndex),
        ))
        .orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id))
        .for("update");
      const sameKey = attempts.find(
        (attempt) => attempt.idempotencyKey === input.idempotencyKey,
      );
      let active = attempts.find(paymentAttemptIsLive);
      let abandonedAttemptId: string | undefined;

      if (active && paymentAttemptLeaseExpired(active, input.now)) {
        // Keep a processor-bound attempt live until the route queries and
        // terminalizes that exact session. This transaction lock prevents a
        // conflicting key from creating a second chargeable session meanwhile.
        if (active.processorSessionId) {
          return { kind: "expired", attempt: active };
        }
        const rows = await tx
          .update(paymentAttempts)
          .set({ state: "abandoned", updatedAt: input.now })
          .where(eq(paymentAttempts.id, active.id))
          .returning();
        const abandoned = rows[0];
        abandonedAttemptId = abandoned.id;
        if (sameKey?.id === abandoned.id) {
          return { kind: "expired", attempt: abandoned };
        }
        active = undefined;
      }

      if (sameKey) {
        const current =
          sameKey.id === abandonedAttemptId
            ? { ...sameKey, state: "abandoned" as const, updatedAt: input.now }
            : sameKey;
        if (paymentAttemptIsLive(current)) {
          return { kind: "reused", attempt: current };
        }
        if (paymentAttemptIsTerminal(current)) {
          return { kind: "terminal", attempt: current };
        }
        return { kind: "expired", attempt: current };
      }
      if (active) return { kind: "conflict", attempt: active };

      if (transaction.status !== "pending") {
        return { kind: "target-conflict", reason: "transaction-not-payable" };
      }
      if (input.shareIndex === 0 && transaction.isSplit) {
        return { kind: "target-conflict", reason: "split-target-required" };
      }
      if (input.shareIndex > 0 && !transaction.isSplit) {
        return { kind: "target-conflict", reason: "unsplit-target-required" };
      }
      if (input.shareIndex > 0) {
        const shareRows = await tx
          .select()
          .from(splitPayments)
          .where(and(
            eq(splitPayments.transactionId, input.transactionId),
            eq(splitPayments.splitIndex, input.shareIndex),
          ))
          .for("update")
          .limit(1);
        const share = shareRows[0];
        if (!share) return { kind: "target-conflict", reason: "share-not-found" };
        if (share.status !== "pending") {
          return { kind: "target-conflict", reason: "share-not-payable" };
        }
      }

      const rows = await tx
        .insert(paymentAttempts)
        .values({
          transactionId: input.transactionId,
          shareIndex: input.shareIndex,
          idempotencyKey: input.idempotencyKey,
          state: "claiming",
          leaseExpiresAt: input.leaseExpiresAt,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning();
      return {
        kind: "claimed",
        attempt: rows[0],
        ...(abandonedAttemptId ? { abandonedAttemptId } : {}),
      };
    });
  }

  async attachPaymentAttemptSessionRecord(
    input: AttachPaymentAttemptSessionRecordInput,
  ): Promise<AttachPaymentAttemptSessionResult> {
    const db = this.db;
    if (!db) throw new Error('Database not available');

    return db.transaction(async (tx) => {
      const attempts = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, input.attemptId))
        .for("update")
        .limit(1);
      const attempt = attempts[0];
      if (!attempt) return { kind: "not-found" };

      if (paymentAttemptLeaseExpired(attempt, input.now)) {
        const rows = await tx
          .update(paymentAttempts)
          .set({ state: "abandoned", updatedAt: input.now })
          .where(eq(paymentAttempts.id, attempt.id))
          .returning();
        return { kind: "expired", attempt: rows[0] };
      }
      if (attempt.state === "abandoned") {
        return { kind: "expired", attempt };
      }
      if (paymentAttemptIsTerminal(attempt)) {
        return { kind: "terminal", attempt };
      }

      const duplicateIdentityCondition = input.returnStateHash === null
        ? or(
            eq(paymentAttempts.processorSessionId, input.processorSessionId),
            eq(paymentAttempts.processorXId, input.processorXId),
          )
        : or(
            eq(paymentAttempts.processorSessionId, input.processorSessionId),
            eq(paymentAttempts.processorXId, input.processorXId),
            eq(paymentAttempts.returnStateHash, input.returnStateHash),
          );
      const duplicateIdentities = await tx
        .select({ id: paymentAttempts.id })
        .from(paymentAttempts)
        .where(and(
          ne(paymentAttempts.id, attempt.id),
          duplicateIdentityCondition,
        ))
        .limit(1);
      if (duplicateIdentities[0]) return { kind: "conflict", attempt };

      const maximumReturnExpiry = new Date(
        attempt.createdAt.getTime() + PAYMENT_RETURN_STATE_MAX_AGE_MS,
      );
      const returnStateExpiresAt =
        input.returnStateExpiresAt &&
        input.returnStateExpiresAt.getTime() > maximumReturnExpiry.getTime()
          ? maximumReturnExpiry
          : input.returnStateExpiresAt;
      const matches =
        attempt.processorSessionId === input.processorSessionId &&
        attempt.processorXId === input.processorXId &&
        attempt.returnStateHash === input.returnStateHash &&
        (attempt.returnStateExpiresAt?.getTime() ?? null) ===
          (returnStateExpiresAt?.getTime() ?? null);

      if (attempt.state === "ready") {
        return matches
          ? { kind: "reused", attempt }
          : { kind: "conflict", attempt };
      }
      if (attempt.state !== "claiming") {
        return { kind: "conflict", attempt };
      }

      const rows = await tx
        .update(paymentAttempts)
        .set({
          state: "ready",
          processorSessionId: input.processorSessionId,
          processorXId: input.processorXId,
          returnStateHash: input.returnStateHash,
          returnStateExpiresAt,
          updatedAt: input.now,
        })
        .where(eq(paymentAttempts.id, attempt.id))
        .returning();
      return { kind: "attached", attempt: rows[0] };
    });
  }

  async getPaymentAttemptByReturnStateHash(
    returnStateHash: string,
  ): Promise<PaymentAttempt | undefined> {
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.returnStateHash, returnStateHash))
      .limit(1);
    return rows[0];
  }

  async claimPaymentAttemptFinalizationRecord(
    input: ClaimPaymentAttemptFinalizationRecordInput,
  ): Promise<ClaimPaymentAttemptFinalizationResult> {
    const db = this.db;
    if (!db) throw new Error('Database not available');

    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, input.attemptId))
        .for("update")
        .limit(1);
      const attempt = rows[0];
      if (!attempt) return { kind: "not-found" };
      if (attempt.processorSessionId !== input.processorSessionId) {
        return { kind: "conflict", attempt };
      }
      if (attempt.state === "finalizing") return { kind: "reused", attempt };
      if (paymentAttemptIsTerminal(attempt)) return { kind: "terminal", attempt };
      if (attempt.state !== "ready") return { kind: "conflict", attempt };

      const updated = await tx
        .update(paymentAttempts)
        .set({ state: "finalizing", updatedAt: input.now })
        .where(eq(paymentAttempts.id, attempt.id))
        .returning();
      return { kind: "claimed", attempt: updated[0] };
    });
  }

  async finalizePaymentAttemptRecord(
    input: FinalizePaymentAttemptRecordInput,
  ): Promise<FinalizePaymentAttemptResult> {
    const db = this.db;
    if (!db) throw new Error('Database not available');

    return db.transaction(async (tx) => {
      // Resolve the immutable parent first, then lock in the same order used by
      // claim/split configuration: transaction -> attempt -> split rows. This
      // prevents a claim (transaction -> attempt) and completion from forming
      // a row-lock cycle under concurrent processor callbacks.
      const locatorRows = await tx
        .select({ transactionId: paymentAttempts.transactionId })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, input.attemptId))
        .limit(1);
      const locator = locatorRows[0];
      if (!locator) return { kind: "not-found" };

      const transactionRows = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, locator.transactionId))
        .for("update")
        .limit(1);
      const transaction = transactionRows[0];
      if (!transaction) return { kind: "not-found" };

      const attemptRows = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, input.attemptId))
        .for("update")
        .limit(1);
      const attempt = attemptRows[0];
      if (!attempt) return { kind: "not-found" };
      if (attempt.transactionId !== transaction.id) {
        throw new Error("Payment attempt parent changed during finalization");
      }

      const transactionSplits = attempt.shareIndex === 0
        ? []
        : await tx
            .select()
            .from(splitPayments)
            .where(eq(splitPayments.transactionId, attempt.transactionId))
            .orderBy(splitPayments.splitIndex)
            .for("update");
      const splitPayment = attempt.shareIndex === 0
        ? null
        : transactionSplits.find(
            (split) => split.splitIndex === attempt.shareIndex,
          ) ?? null;
      const targetExists = attempt.shareIndex === 0
        ? !transaction.isSplit
        : transaction.isSplit && splitPayment !== null;

      const receiptIsValid =
        input.outcome === "approved"
          ? attempt.shareIndex === 0
            ? input.receiptShare === null
            : input.receiptShare === attempt.shareIndex
          : input.receiptShare === null;
      if (
        !targetExists ||
        !receiptIsValid ||
        attempt.processorSessionId !== input.processorSessionId ||
        (input.outcome === "approved" && input.processorTransactionId === null)
      ) {
        return { kind: "conflict", attempt };
      }

      if (paymentAttemptIsTerminal(attempt)) {
        return attempt.state === input.outcome &&
          attempt.outcome === input.outcome &&
          attempt.receiptShare === input.receiptShare
          ? {
              kind: "reused",
              attempt,
              transaction,
              splitPayment,
              counterIncremented: false,
            }
          : { kind: "conflict", attempt };
      }
      if (attempt.state !== "finalizing") {
        return { kind: "conflict", attempt };
      }
      if (
        !["pending", "processing"].includes(transaction.status) ||
        (splitPayment && !["pending", "processing"].includes(splitPayment.status))
      ) {
        return { kind: "conflict", attempt };
      }

      let updatedSplit: SplitPayment | null = null;
      if (splitPayment) {
        const splitRows = await tx
          .update(splitPayments)
          .set({
            status: input.outcome === "approved" ? "completed" : "pending",
            windcaveTransactionId:
              input.processorTransactionId ?? splitPayment.windcaveTransactionId,
            paymentMethod: input.paymentMethod ?? splitPayment.paymentMethod,
            paidAt: input.outcome === "approved" ? input.now : null,
          })
          .where(eq(splitPayments.id, splitPayment.id))
          .returning();
        updatedSplit = splitRows[0];
      }

      const completedSplits = updatedSplit
        ? transactionSplits.filter(
            (split) =>
              split.id === updatedSplit!.id
                ? updatedSplit!.status === "completed"
                : split.status === "completed",
          ).length
        : transaction.completedSplits ?? 0;
      const allSplitsComplete = updatedSplit !== null &&
        completedSplits >= (transaction.totalSplits ?? 1);
      const transactionStatus = updatedSplit
        ? input.outcome === "approved" && allSplitsComplete
          ? "completed"
          : "pending"
        : input.outcome === "approved"
          ? "completed"
          : input.outcome === "cancelled" ? "cancelled" : "failed";
      const updatedTransactionRows = await tx
        .update(transactions)
        .set({
          status: transactionStatus,
          completedAt:
            transactionStatus === "completed"
              ? transaction.completedAt ?? input.now
              : transaction.completedAt,
          completedSplits,
          windcaveTransactionId:
            input.processorTransactionId ?? transaction.windcaveTransactionId,
          paymentMethod: input.paymentMethod ?? transaction.paymentMethod,
          windcaveSessionId: input.processorSessionId,
          windcaveSessionState:
            updatedSplit && !allSplitsComplete ? "pending" : input.outcome,
          windcaveXId: attempt.processorXId,
        })
        .where(eq(transactions.id, transaction.id))
        .returning();
      const updatedTransaction = updatedTransactionRows[0];

      // No platform fee is charged or accrued: merchants pay a monthly
      // subscription. The counters below are a usage statistic only — they no
      // longer gate anything, so there is no quota branch and no unbilled total.
      let counterIncremented = false;
      if (input.outcome === "approved" && transaction.merchantId !== null) {
        let subscriptionRows = await tx
          .select()
          .from(merchantSubscriptions)
          .where(eq(merchantSubscriptions.merchantId, transaction.merchantId))
          .for("update")
          .limit(1);
        if (!subscriptionRows[0]) {
          await tx
            .insert(merchantSubscriptions)
            .values(newSubscriptionValues(transaction.merchantId, input.now))
            .onConflictDoNothing({ target: merchantSubscriptions.merchantId });
          subscriptionRows = await tx
            .select()
            .from(merchantSubscriptions)
            .where(eq(merchantSubscriptions.merchantId, transaction.merchantId))
            .for("update")
            .limit(1);
        }
        const subscription = subscriptionRows[0];
        if (!subscription) {
          throw new Error("Failed to create merchant subscription counter");
        }
        const monthStart = subscription.monthStartDate ?? input.now;
        const monthsElapsed =
          (input.now.getFullYear() - monthStart.getFullYear()) * 12 +
          (input.now.getMonth() - monthStart.getMonth());
        const currentMonthTransactions = monthsElapsed >= 1
          ? 0
          : subscription.currentMonthTransactions ?? 0;
        await tx
          .update(merchantSubscriptions)
          .set({
            currentMonthTransactions: currentMonthTransactions + 1,
            totalLifetimeTransactions:
              (subscription.totalLifetimeTransactions ?? 0) + 1,
            monthStartDate:
              monthsElapsed >= 1 ? input.now : subscription.monthStartDate,
            updatedAt: input.now,
          })
          .where(eq(merchantSubscriptions.id, subscription.id));
        counterIncremented = true;
      }

      const finalizedAttemptRows = await tx
        .update(paymentAttempts)
        .set({
          state: input.outcome,
          outcome: input.outcome,
          receiptShare: input.receiptShare,
          updatedAt: input.now,
        })
        .where(and(
          eq(paymentAttempts.id, attempt.id),
          eq(paymentAttempts.state, "finalizing"),
          eq(paymentAttempts.processorSessionId, input.processorSessionId),
        ))
        .returning();
      const finalizedAttempt = finalizedAttemptRows[0];
      if (!finalizedAttempt) {
        throw new Error("Payment attempt finalization compare-and-set failed");
      }
      return {
        kind: "finalized",
        attempt: finalizedAttempt,
        transaction: updatedTransaction,
        splitPayment: updatedSplit,
        counterIncremented,
      };
    });
  }

  async getActiveTransactionByMerchant(
    merchantId: number,
    scope: ActiveTransactionScope,
  ): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');

    const stoneCondition =
      scope.kind === "merchant-any"
        ? undefined
        : scope.kind === "legacy-no-board"
          ? and(
              isNull(transactions.taptStoneId),
              isNull(transactions.paymentTokenHash),
            )
          : eq(transactions.taptStoneId, scope.stoneId);

    // 1. Prefer pending/processing (in-flight) transactions
    const activeConditions = [
      eq(transactions.merchantId, merchantId),
      inArray(transactions.status, ['pending', 'processing']),
    ];
    if (stoneCondition) {
      activeConditions.push(stoneCondition);
    }
    const activeResult = await this.db
      .select()
      .from(transactions)
      .where(and(...activeConditions))
      .orderBy(sql`${transactions.createdAt} desc nulls last`, desc(transactions.id))
      .limit(1);
    if (activeResult[0]) return activeResult[0];

    // 2. Fall back to the most-recently completed transaction (within last 3 min)
    // so the terminal can detect the pending→completed transition and show the overlay.
    const cutoff = new Date(Date.now() - 3 * 60 * 1000);
    const completedConditions = [
      eq(transactions.merchantId, merchantId),
      eq(transactions.status, 'completed'),
      gte(transactions.createdAt, cutoff),
    ];
    if (stoneCondition) {
      completedConditions.push(stoneCondition);
    }
    const completedResult = await this.db
      .select()
      .from(transactions)
      .where(and(...completedConditions))
      .orderBy(sql`${transactions.createdAt} desc nulls last`, desc(transactions.id))
      .limit(1);
    return completedResult[0];
  }

  async createTransaction(input: TransactionStorageInput): Promise<Transaction> {
    if (!this.db) throw new Error('Database not available');
    const insertTransaction = sanitizeTransactionStorageInput(input);
    const transactionAmount = parseFloat(insertTransaction.price);

    // TaptPay charges no per-transaction fee — merchants pay a monthly
    // subscription (shared/plans.ts). Windcave handles their own fees, so
    // merchantNet has always been the full transaction price.
    const platformFeeAmount = 0;
    const merchantNet = transactionAmount;
    const completedAt = insertTransaction.status === "completed" ? new Date() : null;

    const transactionWithFees = {
      ...insertTransaction,
      windcaveFeeRate: "0.0000",
      windcaveFeeAmount: "0.00",
      platformFeeRate: "0.0000",
      platformFeeAmount: platformFeeAmount.toFixed(2),
      merchantNet: merchantNet.toFixed(2),
      totalRefunded: "0.00",
      refundableAmount: merchantNet.toFixed(2),
      completedAt,
    };

    const result = await this.db.insert(transactions).values(transactionWithFees).returning();
    return result[0];
  }

  async updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const updateData: any = {
      status,
      ...(status === "completed"
        ? { completedAt: sql`coalesce(${transactions.completedAt}, now())` }
        : {}),
    };
    if (windcaveTransactionId) {
      updateData.windcaveTransactionId = windcaveTransactionId;
    }
    
    const result = await this.db
      .update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async updateTransactionPaymentMethod(id: number, paymentMethod: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(transactions)
      .set({ paymentMethod })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async getTransactionByNfcSession(nfcSessionId: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.nfcSessionId, nfcSessionId))
      .limit(1);
    return result[0];
  }

  async updateTransactionSplitEnabled(id: number, splitEnabled: boolean): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(transactions)
      .set({ splitEnabled })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async updateTransactionNfcSession(id: number, nfcSessionId: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(transactions)
      .set({ nfcSessionId })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async updateTransactionWindcaveSession(id: number, sessionId: string, sessionState: string, xId: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(transactions)
      .set({ windcaveSessionId: sessionId, windcaveSessionState: sessionState, windcaveXId: xId })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async updateTransactionSessionState(id: number, sessionState: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(transactions)
      .set({ windcaveSessionState: sessionState })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async getTransactionByWindcaveSessionId(sessionId: string): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.windcaveSessionId, sessionId))
      .limit(1);
    return result[0];
  }

  async getTransactionsByMerchant(merchantId: number): Promise<Transaction[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(desc(transactions.createdAt));
  }

  async getMerchantAnalytics(merchantId: number): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    weeklyTransactions: number;
    weeklyRevenue: number;
    averageTransaction: number;
  }> {
    if (!this.db) throw new Error('Database not available');
    
    const merchantTransactions = await this.getTransactionsByMerchant(merchantId);
    const merchant = await this.getMerchant(merchantId);
    
    const totalTransactions = merchantTransactions.length;
    const completedTxs = merchantTransactions.filter(t => t.status === 'completed');
    const completedTransactions = completedTxs.length;
    const totalRevenue = completedTxs.reduce((sum, t) => sum + parseFloat(t.price), 0);
    const averageTransaction = completedTransactions > 0 
      ? totalRevenue / completedTransactions 
      : 0;
    
    // Calculate weekly metrics (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const weeklyTransactionsList = merchantTransactions.filter(t => {
      const transactionDate = t.createdAt ? new Date(t.createdAt) : null;
      return transactionDate && transactionDate >= weekAgo;
    });
    
    const weeklyCompletedTransactions = weeklyTransactionsList.filter(t => t.status === 'completed');
    const weeklyRevenue = weeklyCompletedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);
    
    return {
      totalTransactions,
      completedTransactions,
      totalRevenue,
      weeklyTransactions: weeklyTransactionsList.length,
      weeklyRevenue,
      averageTransaction,
    };
  }

  async getTransactionsByMerchantWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<Transaction[]> {
    if (!this.db) throw new Error('Database not available');
    
    let query = this.db
      .select()
      .from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(desc(transactions.createdAt));

    if (startDate || endDate) {
      // For database implementation, we would add date filtering here
      // For now, fall back to memory filtering
      const allTransactions = await query;
      return allTransactions.filter(transaction => {
        if (!transaction.createdAt) return false;
        const transactionDate = new Date(transaction.createdAt as Date);
        
        if (startDate && transactionDate < startDate) {
          return false;
        }
        
        if (endDate && transactionDate > endDate) {
          return false;
        }
        
        return true;
      });
    }

    return query;
  }

  async getMerchantAnalyticsWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    totalRevenue: number;
    dateRange: { start: Date | null; end: Date | null };
    averageTransactionValue: number;
    transactionsByStatus: { [key: string]: number };
  }> {
    if (!this.db) throw new Error('Database not available');
    
    const merchantTransactions = await this.getTransactionsByMerchantWithDateRange(merchantId, startDate, endDate);

    const totalTransactions = merchantTransactions.length;
    const completedTransactions = merchantTransactions.filter(t => t.status === 'completed');
    const totalRevenue = completedTransactions.reduce((sum, t) => sum + parseFloat(t.price), 0);

    // Calculate transaction breakdown by status
    const transactionsByStatus: { [key: string]: number } = {};
    merchantTransactions.forEach(t => {
      transactionsByStatus[t.status] = (transactionsByStatus[t.status] || 0) + 1;
    });

    return {
      totalTransactions,
      completedTransactions: completedTransactions.length,
      totalRevenue,
      dateRange: {
        start: startDate || null, 
        end: endDate || null 
      },
      averageTransactionValue: completedTransactions.length > 0 ? totalRevenue / completedTransactions.length : 0,
      transactionsByStatus,
    };
  }

  async clearTransactions(merchantId: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    
    try {
      // Delete all transactions for the merchant
      await this.db.delete(transactions).where(eq(transactions.merchantId, merchantId));
      console.log(`Cleared transactions for merchant ${merchantId} from database`);
      return true;
    } catch (error) {
      console.error('Error clearing transactions:', error);
      return false;
    }
  }

  async getRevenueOverTime(merchantId: number, days: number = 30): Promise<Array<{
    date: string;
    revenue: number;
    transactions: number;
  }>> {
    if (!this.db) throw new Error('Database not available');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const allTransactions = await this.getTransactionsByMerchantWithDateRange(merchantId, startDate, endDate);
    const completedTransactions = allTransactions.filter(t => t.status === "completed");

    // Group transactions by date
    const revenueByDate = new Map<string, { revenue: number; transactions: number }>();
    
    // Initialize all dates with 0 values
    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      revenueByDate.set(dateKey, { revenue: 0, transactions: 0 });
    }

    // Aggregate completed transactions by date
    completedTransactions.forEach(transaction => {
      if (transaction.createdAt) {
        const date = new Date(transaction.createdAt);
        const dateKey = date.toISOString().split('T')[0];
        const existing = revenueByDate.get(dateKey) || { revenue: 0, transactions: 0 };
        revenueByDate.set(dateKey, {
          revenue: existing.revenue + parseFloat(transaction.price),
          transactions: existing.transactions + 1
        });
      }
    });

    // Convert to array and sort by date
    return Array.from(revenueByDate.entries())
      .map(([date, data]) => ({
        date,
        revenue: Number(data.revenue.toFixed(2)),
        transactions: data.transactions
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async deleteMerchant(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    
    try {
      // First delete all transactions associated with the merchant
      await this.db.delete(transactions).where(eq(transactions.merchantId, id));
      
      // Then delete the merchant
      const result = await this.db.delete(merchants).where(eq(merchants.id, id));
      
      return true;
    } catch (error) {
      console.error('Error deleting merchant:', error);
      return false;
    }
  }

  async getSubscriptionRevenue(): Promise<SubscriptionRevenue> {
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db.select().from(merchantSubscriptions);
    return summariseSubscriptionRevenue(rows);
  }

  // Refund methods for DatabaseStorage
  async createRefund(insertRefund: InsertRefund): Promise<Refund> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(refunds).values(insertRefund).returning();
    return result[0];
  }

  async getRefund(id: number): Promise<Refund | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
    return result[0];
  }

  async getRefundsByTransaction(transactionId: number): Promise<Refund[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.select().from(refunds).where(eq(refunds.transactionId, transactionId));
  }

  async getRefundsByMerchant(merchantId: number): Promise<Refund[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.select().from(refunds).where(eq(refunds.merchantId, merchantId));
  }

  async updateRefundStatus(id: number, status: string, windcaveRefundId?: string): Promise<Refund | undefined> {
    if (!this.db) throw new Error('Database not available');
    const updateData: any = { status };
    if (windcaveRefundId) {
      updateData.windcaveRefundId = windcaveRefundId;
    }
    if (status === "completed") {
      updateData.completedAt = new Date();
    }
    
    const result = await this.db
      .update(refunds)
      .set(updateData)
      .where(eq(refunds.id, id))
      .returning();
    return result[0];
  }

  async updateTransactionAfterRefund(id: number, refundAmount: number): Promise<Transaction | undefined> {
    if (!this.db) throw new Error('Database not available');

    const [transaction] = await this.db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (!transaction) return undefined;

    const prevRefunded = parseFloat(transaction.totalRefunded || "0");
    const newTotalRefunded = prevRefunded + refundAmount;
    const originalPrice = parseFloat(transaction.price);
    const newRefundableAmount = Math.max(0, originalPrice - newTotalRefunded);
    const newStatus = newRefundableAmount <= 0 ? "refunded" : "partially_refunded";

    const result = await this.db
      .update(transactions)
      .set({
        totalRefunded: newTotalRefunded.toFixed(2),
        refundableAmount: newRefundableAmount.toFixed(2),
        status: newStatus,
      })
      .where(eq(transactions.id, id))
      .returning();
    return result[0];
  }

  async reserveRefundAmount(id: number, refundAmount: number): Promise<Transaction | null | undefined> {
    if (!this.db) throw new Error('Database not available');
    const amt = refundAmount.toFixed(2);
    // Single atomic UPDATE: increment totalRefunded, recompute refundableAmount and
    // status, guarded by (a) refundable status and (b) the CURRENT remaining balance
    // (price - already-refunded) being >= the requested amount. Concurrent/double
    // refunds serialize on the row; the second sees a reduced balance and its WHERE
    // fails, so 0 rows return -> caller treats it as a rejected reservation.
    const result = await this.db
      .update(transactions)
      .set({
        totalRefunded: sql`(COALESCE(${transactions.totalRefunded}, '0')::numeric + ${amt}::numeric)`,
        refundableAmount: sql`GREATEST(0, ${transactions.price}::numeric - (COALESCE(${transactions.totalRefunded}, '0')::numeric + ${amt}::numeric))`,
        status: sql`CASE WHEN ${transactions.price}::numeric - (COALESCE(${transactions.totalRefunded}, '0')::numeric + ${amt}::numeric) <= 0 THEN 'refunded' ELSE 'partially_refunded' END`,
      })
      .where(and(
        eq(transactions.id, id),
        inArray(transactions.status, ['completed', 'partially_refunded']),
        sql`(${transactions.price}::numeric - COALESCE(${transactions.totalRefunded}, '0')::numeric) >= ${amt}::numeric`,
      ))
      .returning();
    return result[0] ?? null;
  }

  async releaseRefundAmount(id: number, refundAmount: number): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    const amt = refundAmount.toFixed(2);
    await this.db
      .update(transactions)
      .set({
        totalRefunded: sql`GREATEST(0, COALESCE(${transactions.totalRefunded}, '0')::numeric - ${amt}::numeric)`,
        refundableAmount: sql`LEAST(${transactions.price}::numeric, ${transactions.price}::numeric - GREATEST(0, COALESCE(${transactions.totalRefunded}, '0')::numeric - ${amt}::numeric))`,
        status: sql`CASE WHEN GREATEST(0, COALESCE(${transactions.totalRefunded}, '0')::numeric - ${amt}::numeric) <= 0 THEN 'completed' ELSE 'partially_refunded' END`,
      })
      .where(eq(transactions.id, id));
  }

  // API Key operations - placeholder implementations
  async createApiKey(data: any): Promise<any> {
    // TODO: Implement when API tables are available
    return { ...data, id: Date.now(), keyPrefix: 'tapt_sandbox_', status: 'active', createdAt: new Date() };
  }

  async getApiKey(id: number): Promise<any> {
    return null;
  }

  async getApiKeyByKey(apiKey: string): Promise<any> {
    return null;
  }

  async getApiKeysByMerchant(merchantId: number): Promise<any[]> {
    return [];
  }

  async updateApiKeyStatus(id: number, status: string): Promise<any> {
    return null;
  }

  async revokeApiKey(id: number): Promise<boolean> {
    return true;
  }

  async updateApiKeyLastUsed(id: number): Promise<any> {
    return null;
  }

  async logApiRequest(data: any): Promise<any> {
    return { ...data, id: Date.now(), createdAt: new Date() };
  }

  async getApiMetrics(merchantId?: number): Promise<any> {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsToday: 0,
      webhookDeliveryRate: 0
    };
  }

  async getApiUsageData(merchantId?: number): Promise<any[]> {
    return [];
  }

  async createWebhookDelivery(data: any): Promise<any> {
    return { ...data, id: Date.now(), createdAt: new Date() };
  }

  async updateWebhookDelivery(id: number, data: any): Promise<any> {
    return null;
  }

  async getWebhookDeliveries(apiKeyId: number): Promise<any[]> {
    return [];
  }

  async createPushSubscription(data: PushSubscriptionInput): Promise<PushSubscription | null> {
    try {
      const [targetPreferenceRow] = await this.db!
        .select({ preferences: pushSubscriptions.preferences })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.merchantId, data.merchantId))
        .orderBy(desc(pushSubscriptions.id))
        .limit(1);
      const targetPreferences = normalizePushNotificationPreferences(
        targetPreferenceRow?.preferences,
      );
      const existing = await this.db!
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, data.endpoint));
      
      if (existing.length > 0) {
        const preferences = existing[0].merchantId === data.merchantId
          ? normalizePushNotificationPreferences(existing[0].preferences)
          : targetPreferences;
        const [updated] = await this.db!
          .update(pushSubscriptions)
          .set({
            merchantId: data.merchantId,
            p256dh: data.p256dh,
            auth: data.auth,
            userAgent: data.userAgent ?? existing[0].userAgent,
            preferences,
            isActive: true,
          })
          .where(eq(pushSubscriptions.endpoint, data.endpoint))
          .returning();
        return updated;
      }

      const [sub] = await this.db!
        .insert(pushSubscriptions)
        .values({
          merchantId: data.merchantId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          userAgent: data.userAgent || null,
          preferences: targetPreferences,
          isActive: true,
        })
        .returning();
      return sub;
    } catch (error) {
      console.error("Database error in createPushSubscription:", error);
      return null;
    }
  }

  async getPushSubscriptionsByMerchant(merchantId: number): Promise<PushSubscription[]> {
    try {
      return await this.db!
        .select()
        .from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.merchantId, merchantId), eq(pushSubscriptions.isActive, true)));
    } catch (error) {
      console.error("Database error in getPushSubscriptionsByMerchant:", error);
      return [];
    }
  }

  async getPushNotificationPreferences(merchantId: number): Promise<PushNotificationPreferences> {
    try {
      const [row] = await this.db!
        .select({ preferences: pushSubscriptions.preferences })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.merchantId, merchantId))
        .orderBy(desc(pushSubscriptions.id))
        .limit(1);
      return normalizePushNotificationPreferences(row?.preferences);
    } catch (error) {
      console.error("Database error in getPushNotificationPreferences:", error);
      return { ...DEFAULT_PUSH_NOTIFICATION_PREFERENCES };
    }
  }

  async updatePushNotificationPreferences(
    merchantId: number,
    preferences: PushNotificationPreferences,
  ): Promise<PushNotificationPreferences> {
    const safePreferences = normalizePushNotificationPreferences(preferences);
    await this.db!
      .update(pushSubscriptions)
      .set({ preferences: safePreferences })
      .where(eq(pushSubscriptions.merchantId, merchantId));
    return safePreferences;
  }

  async deactivatePushSubscription(id: number): Promise<void> {
    try {
      await this.db!
        .update(pushSubscriptions)
        .set({ isActive: false })
        .where(eq(pushSubscriptions.id, id));
    } catch (error) {
      console.error("Database error in deactivatePushSubscription:", error);
    }
  }

  async deactivatePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    try {
      await this.db!
        .update(pushSubscriptions)
        .set({ isActive: false })
        .where(eq(pushSubscriptions.endpoint, endpoint));
    } catch (error) {
      console.error("Database error in deactivatePushSubscriptionByEndpoint:", error);
    }
  }

  async getDailyPushPaymentSummaries(start: Date, end: Date): Promise<DailyPushPaymentSummary[]> {
    const db = this.db;
    if (!db) throw new Error("Database not available");

    // Read from the records that actually prove funds were received. The old
    // platform_fees table stopped receiving rows when TaptPay moved to monthly
    // subscriptions, so it is historical accounting data, not a payout ledger.
    const [retailRows, splitRows, rentRows, tradeRows] = await Promise.all([
      db
        .select({
          merchantId: transactions.merchantId,
          amountCents: sql<number>`round(coalesce(sum(${transactions.price}::numeric), 0) * 100)::int`,
          paymentCount: sql<number>`count(*)::int`,
        })
        .from(transactions)
        .where(and(
          isNotNull(transactions.merchantId),
          or(eq(transactions.isSplit, false), isNull(transactions.isSplit)),
          or(
            isNull(transactions.paymentMethod),
            notInArray(transactions.paymentMethod, ["cash", "manual"]),
          ),
          inArray(transactions.status, ["completed", "partially_refunded", "refunded"]),
          isNotNull(transactions.completedAt),
          gte(transactions.completedAt, start),
          lt(transactions.completedAt, end),
        ))
        .groupBy(transactions.merchantId),
      db
        .select({
          merchantId: splitPayments.merchantId,
          amountCents: sql<number>`round(coalesce(sum(${splitPayments.amount}::numeric), 0) * 100)::int`,
          paymentCount: sql<number>`count(*)::int`,
        })
        .from(splitPayments)
        .where(and(
          isNotNull(splitPayments.merchantId),
          eq(splitPayments.status, "completed"),
          isNotNull(splitPayments.paidAt),
          gte(splitPayments.paidAt, start),
          lt(splitPayments.paidAt, end),
        ))
        .groupBy(splitPayments.merchantId),
      db
        .select({
          merchantId: invoicesRentRequests.merchantId,
          amountCents: sql<number>`coalesce(sum(${invoicesRentRequests.amountCents}), 0)::int`,
          paymentCount: sql<number>`count(*)::int`,
        })
        .from(invoicesRentRequests)
        .where(and(
          eq(invoicesRentRequests.status, "paid"),
          isNotNull(invoicesRentRequests.paidAt),
          gte(invoicesRentRequests.paidAt, start),
          lt(invoicesRentRequests.paidAt, end),
        ))
        .groupBy(invoicesRentRequests.merchantId),
      db
        .select({
          merchantId: jobInvoices.merchantId,
          amountCents: sql<number>`coalesce(sum(${jobInvoices.amountCents}), 0)::int`,
          paymentCount: sql<number>`count(*)::int`,
        })
        .from(jobInvoices)
        .where(and(
          eq(jobInvoices.status, "paid"),
          isNotNull(jobInvoices.paidAt),
          gte(jobInvoices.paidAt, start),
          lt(jobInvoices.paidAt, end),
        ))
        .groupBy(jobInvoices.merchantId),
    ]);

    const summaries = new Map<number, { amountCents: number; paymentCount: number }>();
    for (const row of [...retailRows, ...splitRows, ...rentRows, ...tradeRows]) {
      if (row.merchantId == null) continue;
      const current = summaries.get(row.merchantId) ?? { amountCents: 0, paymentCount: 0 };
      current.amountCents += Number(row.amountCents);
      current.paymentCount += Number(row.paymentCount);
      summaries.set(row.merchantId, current);
    }
    return Array.from(summaries, ([merchantId, summary]) => ({
      merchantId,
      amount: (summary.amountCents / 100).toFixed(2),
      paymentCount: summary.paymentCount,
    }));
  }

  async claimPushNotificationDelivery(
    merchantId: number,
    eventType: PushNotificationEventType,
    eventKey: string,
    now = new Date(),
  ): Promise<string | null> {
    const staleBefore = new Date(now.getTime() - PUSH_NOTIFICATION_DELIVERY_LEASE_MS);
    const claimToken = randomUUID();
    const inserted = await this.db!
      .insert(pushNotificationDeliveries)
      .values({ merchantId, eventType, eventKey, status: "claimed", claimToken, claimedAt: now })
      .onConflictDoUpdate({
        target: [
          pushNotificationDeliveries.merchantId,
          pushNotificationDeliveries.eventType,
          pushNotificationDeliveries.eventKey,
        ],
        set: { status: "claimed", claimToken, claimedAt: now, completedAt: null },
        setWhere: or(
          eq(pushNotificationDeliveries.status, "failed"),
          and(
            eq(pushNotificationDeliveries.status, "claimed"),
            lte(pushNotificationDeliveries.claimedAt, staleBefore),
          ),
        ),
      })
      .returning({ claimToken: pushNotificationDeliveries.claimToken });
    return inserted[0]?.claimToken ?? null;
  }

  async completePushNotificationDelivery(
    merchantId: number,
    eventType: PushNotificationEventType,
    eventKey: string,
    claimToken: string,
    status: PushNotificationDeliveryStatus,
  ): Promise<void> {
    await this.db!
      .update(pushNotificationDeliveries)
      .set({ status, completedAt: new Date() })
      .where(and(
        eq(pushNotificationDeliveries.merchantId, merchantId),
        eq(pushNotificationDeliveries.eventType, eventType),
        eq(pushNotificationDeliveries.eventKey, eventKey),
        eq(pushNotificationDeliveries.claimToken, claimToken),
      ));
  }

  async createInfoPackLead(data: { name: string; email: string }): Promise<any> {
    const { infoPackLeads } = await import("@shared/schema");
    const [lead] = await this.db!
      .insert(infoPackLeads)
      .values({ name: data.name, email: data.email })
      .returning();
    return lead;
  }

  // Bill splitting operations
  async createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction | undefined> {
    const db = this.db;
    if (!db) throw new Error('Database not available');

    try {
      return await db.transaction(async (tx) => {
        const transactionRows = await tx
          .select()
          .from(transactions)
          .where(eq(transactions.id, transactionId))
          .for("update")
          .limit(1);
        const transaction = transactionRows[0];
        if (!transaction) return undefined;

        const amounts = transactionSplitAmounts(transaction.price, totalSplits);
        const existing = await tx
          .select()
          .from(splitPayments)
          .where(eq(splitPayments.transactionId, transactionId))
          .orderBy(splitPayments.splitIndex)
          .for("update");
        if (
          (transaction.completedSplits ?? 0) > 0 ||
          existing.some((split) => split.status !== "pending")
        ) {
          throw new BillSplitConflictError("split-in-progress");
        }
        if (transaction.status !== "pending") {
          throw new BillSplitConflictError("transaction-not-pending");
        }
        if (transaction.isSplit) {
          const isExactRetry =
            transaction.totalSplits === totalSplits &&
            existing.length === totalSplits &&
            existing.every(
              (split, index) =>
                split.splitIndex === index + 1 &&
                split.amount === amounts[index],
            );
          if (isExactRetry) return transaction;
          throw new BillSplitConflictError("already-configured");
        }
        if (existing.length > 0) {
          throw new BillSplitConflictError("inconsistent-split-state");
        }

        const updated = await tx
          .update(transactions)
          .set({
            isSplit: true,
            totalSplits,
            completedSplits: 0,
            splitAmount: amounts[0],
          })
          .where(and(
            eq(transactions.id, transactionId),
            eq(transactions.status, "pending"),
            or(eq(transactions.isSplit, false), isNull(transactions.isSplit)),
          ))
          .returning();
        if (!updated[0]) {
          throw new BillSplitConflictError("already-configured");
        }

        await tx
          .insert(splitPayments)
          .values(amounts.map((amount, index) => ({
            transactionId,
            merchantId: transaction.merchantId,
            splitIndex: index + 1,
            amount,
            status: "pending",
            windcaveTransactionId: null,
            paymentMethod: "qr_code",
            windcaveFeeAmount: "0.00",
            platformFeeAmount: "0.00",
            merchantNet: amount,
            paidAt: null,
          })));
        return updated[0];
      });
    } catch (error) {
      if (error instanceof BillSplitConflictError) throw error;
      if (isPostgresUniqueViolation(error)) {
        throw new BillSplitConflictError("already-configured");
      }
      throw error;
    }
  }

  async createSplitPayment(data: any): Promise<any> {
    try {
      const [splitPayment] = await this.db!
        .insert(splitPayments)
        .values(data)
        .returning();
      return splitPayment;
    } catch (error) {
      console.error("Database error in createSplitPayment:", error);
      return undefined;
    }
  }

  async getSplitPaymentsByTransaction(transactionId: number): Promise<any[]> {
    try {
      return await this.db!
        .select()
        .from(splitPayments)
        .where(eq(splitPayments.transactionId, transactionId))
        .orderBy(splitPayments.splitIndex);
    } catch (error) {
      console.error("Database error in getSplitPaymentsByTransaction:", error);
      return [];
    }
  }

  async getSplitPaymentById(id: number): Promise<any | undefined> {
    try {
      const [split] = await this.db!
        .select()
        .from(splitPayments)
        .where(eq(splitPayments.id, id))
        .limit(1);
      return split;
    } catch (error) {
      console.error("Database error in getSplitPaymentById:", error);
      return undefined;
    }
  }

  async updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any> {
    try {
      const now = new Date();
      // Update the split payment
      const [updatedSplit] = await this.db!
        .update(splitPayments)
        .set({
          status,
          windcaveTransactionId: windcaveTransactionId || undefined,
          paidAt: status === "completed" ? now : undefined,
        })
        .where(eq(splitPayments.id, id))
        .returning();

      if (status === "completed" && updatedSplit) {
        // Get all splits for this transaction to check if all are completed
        const allSplits = await this.getSplitPaymentsByTransaction(updatedSplit.transactionId!);
        const completedSplits = allSplits.filter(s => s.status === "completed").length;
        
        // Get the transaction to check total splits
        const [transaction] = await this.db!
          .select()
          .from(transactions)
          .where(eq(transactions.id, updatedSplit.transactionId!));
        
        if (transaction) {
          const finalStatus = completedSplits >= (transaction.totalSplits ?? 1) ? "completed" : "pending";
          
          // Update the main transaction
          await this.db!
            .update(transactions)
            .set({
              completedSplits: completedSplits,
              status: finalStatus,
              ...(finalStatus === "completed"
                ? { completedAt: sql`coalesce(${transactions.completedAt}, ${now})` }
                : {}),
            })
            .where(eq(transactions.id, updatedSplit.transactionId!));
        }
      }

      return updatedSplit;
    } catch (error) {
      console.error("Database error in updateSplitPaymentStatus:", error);
      return undefined;
    }
  }

  async getNextPendingSplit(transactionId: number): Promise<any | undefined> {
    try {
      const [split] = await this.db!
        .select()
        .from(splitPayments)
        .where(
          and(
            eq(splitPayments.transactionId, transactionId),
            eq(splitPayments.status, "pending")
          )
        )
        .orderBy(splitPayments.splitIndex)
        .limit(1);
      
      return split;
    } catch (error) {
      console.error("Database error in getNextPendingSplit:", error);
      return undefined;
    }
  }

  // Tapt Stone operations
  async createTaptStone(data: InsertTaptStone): Promise<TaptStone> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(taptStones).values(data).returning();
    return result[0];
  }

  async createNextTaptStone(merchantId: number, name?: string): Promise<TaptStone> {
    const db = this.db;
    if (!db) throw new Error('Database not available');

    try {
      return await db.transaction(async (tx) => {
        // Serialize allocators for this merchant before reading active numbers.
        // The transaction-scoped lock is released automatically on commit/rollback.
        await tx.execute(sql`
          select pg_advisory_xact_lock(
            ${TAPT_STONE_ALLOCATION_LOCK_NAMESPACE}::integer,
            ${merchantId}::integer
          )
        `);

        const activeStones = await tx
          .select({ stoneNumber: taptStones.stoneNumber })
          .from(taptStones)
          .where(and(
            eq(taptStones.merchantId, merchantId),
            eq(taptStones.isActive, true),
          ));
        const stoneNumber = firstFreeTaptStoneNumber(activeStones);
        if (stoneNumber === undefined) throw new TaptStoneCapacityError();

        const rows = await tx
          .insert(taptStones)
          .values({
            merchantId,
            stoneNumber,
            name: name?.trim() || `Stone ${stoneNumber}`,
          })
          .returning();
        return rows[0];
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) throw new TaptStoneConflictError();
      throw error;
    }
  }

  async getTaptStone(id: number): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(taptStones).where(eq(taptStones.id, id)).limit(1);
    return result[0];
  }

  async getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(taptStones)
      .where(and(eq(taptStones.merchantId, merchantId), eq(taptStones.isActive, true)))
      .orderBy(taptStones.stoneNumber);
  }

  async updateTaptStone(id: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(taptStones)
      .set({ 
        ...data,
        updatedAt: new Date() 
      })
      .where(eq(taptStones.id, id))
      .returning();
    return result[0];
  }

  async updateTaptStoneUrls(id: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(taptStones)
      .set({ 
        qrCodeUrl, 
        paymentUrl, 
        updatedAt: new Date() 
      })
      .where(eq(taptStones.id, id))
      .returning();
    return result[0];
  }

  async deleteTaptStone(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(taptStones)
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where(eq(taptStones.id, id))
      .returning();
    return result.length > 0;
  }

  async associateTransactionWithStone(transactionId: number, stoneId: number): Promise<void> {
    // For now, we'll just log the association. 
    // In a full implementation, you might add a junction table or field to track this
    console.log(`Transaction ${transactionId} associated with stone ${stoneId}`);
  }

  // Stock Item methods for DatabaseStorage
  async createStockItem(data: InsertStockItem): Promise<StockItem> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(stockItems).values(data).returning();
    return result[0];
  }

  async getStockItem(id: number): Promise<StockItem | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(stockItems).where(eq(stockItems.id, id)).limit(1);
    return result[0];
  }

  async getStockItemsByMerchant(merchantId: number): Promise<StockItem[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.merchantId, merchantId), eq(stockItems.isActive, true)))
      .orderBy(stockItems.name);
  }

  async updateStockItem(id: number, data: Partial<InsertStockItem>): Promise<StockItem | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(stockItems)
      .set({ 
        ...data,
        updatedAt: new Date() 
      })
      .where(eq(stockItems.id, id))
      .returning();
    return result[0];
  }

  async deleteStockItem(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(stockItems)
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where(eq(stockItems.id, id))
      .returning();
    return result.length > 0;
  }

  // Subscription methods for DatabaseStorage
  async getOrCreateSubscription(merchantId: number): Promise<MerchantSubscription> {
    if (!this.db) throw new Error('Database not available');
    
    // Try to get existing subscription
    const existing = await this.db
      .select()
      .from(merchantSubscriptions)
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .limit(1);
    
    if (existing[0]) {
      return existing[0];
    }
    
    // Create a new subscription on the default plan. A concurrent caller may win
    // the race, so fall back to reading the winner's row rather than throwing.
    const result = await this.db
      .insert(merchantSubscriptions)
      .values(newSubscriptionValues(merchantId))
      .onConflictDoNothing({ target: merchantSubscriptions.merchantId })
      .returning();
    if (result[0]) return result[0];

    const winner = await this.getSubscription(merchantId);
    if (!winner) throw new Error('Failed to create merchant subscription');
    return winner;
  }

  async getSubscription(merchantId: number): Promise<MerchantSubscription | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(merchantSubscriptions)
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .limit(1);
    return result[0];
  }

  async incrementTransactionCount(merchantId: number): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    
    // Get or create subscription
    const subscription = await this.getOrCreateSubscription(merchantId);
    
    // Check if we need to reset monthly counter (new month started)
    const now = new Date();
    const monthStart = new Date(subscription.monthStartDate || now);
    const monthsElapsed = (now.getFullYear() - monthStart.getFullYear()) * 12 + 
                         (now.getMonth() - monthStart.getMonth());
    
    // Reset monthly counter if new month started
    if (monthsElapsed >= 1) {
      await this.db
        .update(merchantSubscriptions)
        .set({
          currentMonthTransactions: 0,
          monthStartDate: now,
          updatedAt: now
        })
        .where(eq(merchantSubscriptions.merchantId, merchantId));
      
      // Refresh subscription after reset
      const refreshed = await this.getSubscription(merchantId);
      if (!refreshed) throw new Error('Failed to refresh subscription');
      subscription.currentMonthTransactions = 0;
    }
    
    // Usage statistic only. There is no per-transaction charge and no quota, so
    // nothing here affects what the merchant is billed.
    const currentCount = subscription.currentMonthTransactions || 0;

    await this.db
      .update(merchantSubscriptions)
      .set({
        currentMonthTransactions: currentCount + 1,
        totalLifetimeTransactions: (subscription.totalLifetimeTransactions || 0) + 1,
        updatedAt: now,
      })
      .where(eq(merchantSubscriptions.merchantId, merchantId));
  }

  /**
   * Cancels at period end: the merchant keeps everything they have paid for
   * until `currentPeriodEnd`, and the billing job simply does not renew. Status
   * stays `active` so nothing about the account degrades in the meantime.
   */
  async cancelSubscription(
    merchantId: number,
    reason: string,
  ): Promise<CancelSubscriptionResult> {
    if (!this.db) throw new Error('Database not available');
    const now = new Date();
    return await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.merchantId, merchantId))
        .for("update")
        .limit(1);
      const existing = rows[0];
      if (!existing) return { ok: false as const, reason: "not-found" as const };
      if (existing.billingClaimToken) {
        return { ok: false as const, reason: "billing-busy" as const };
      }
      const hasLivePaidPeriod =
        existing.status !== "cancelled"
        && !!existing.lastBillingDate
        && !!existing.currentPeriodEnd
        && new Date(existing.currentPeriodEnd).getTime() > now.getTime();
      const effectiveDate = hasLivePaidPeriod ? new Date(existing.currentPeriodEnd!) : now;
      const result = await tx
        .update(merchantSubscriptions)
        .set({
          status: hasLivePaidPeriod ? existing.status : "cancelled",
          cancelAtPeriodEnd: hasLivePaidPeriod,
          cancellationRequestedAt: now,
          cancellationEffectiveDate: effectiveDate,
          cancellationReason: reason,
          windcaveBillingRef: null,
          ...(!hasLivePaidPeriod ? {
            lastBillingDate: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            nextBillingDate: null,
          } : {}),
          updatedAt: now,
        })
        .where(eq(merchantSubscriptions.id, existing.id))
        .returning();
      return { ok: true as const, subscription: result[0] };
    });
  }

  /** Undoes only a live, not-yet-effective cancellation. */
  async resumeSubscription(merchantId: number): Promise<MerchantSubscription | null> {
    if (!this.db) throw new Error('Database not available');
    const now = new Date();
    const result = await this.db
      .update(merchantSubscriptions)
      .set({
        cancelAtPeriodEnd: false,
        cancellationRequestedAt: null,
        cancellationEffectiveDate: null,
        cancellationReason: null,
        updatedAt: now,
      })
      .where(and(
        eq(merchantSubscriptions.merchantId, merchantId),
        eq(merchantSubscriptions.cancelAtPeriodEnd, true),
        inArray(merchantSubscriptions.status, ["active", "past_due", "suspended"]),
        sql`${merchantSubscriptions.currentPeriodEnd} > ${now}`,
      ))
      .returning();
    return result[0] ?? null;
  }

  async getBillingHistory(merchantId: number, limit: number = 50): Promise<SubscriptionBillingHistory[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(subscriptionBillingHistory)
      .where(eq(subscriptionBillingHistory.merchantId, merchantId))
      .orderBy(desc(subscriptionBillingHistory.createdAt))
      .limit(limit);
  }

  async createBillingHistory(data: any): Promise<SubscriptionBillingHistory> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .insert(subscriptionBillingHistory)
      .values(data)
      .returning();
    return result[0];
  }

  /**
   * Applies a plan change.
   *
   * The subscription row is locked for the whole check-then-write so a
   * concurrent invite cannot slip a seat in between counting and downgrading.
   * A downgrade that would strand active logins is refused outright rather than
   * silently disabling somebody's account to make the numbers fit.
   */
  async changeSubscriptionPlan(merchantId: number, planId: PlanId, chargeUpgrade?: PlanUpgradeChargeExecutor): Promise<PlanChangeResult> {
    if (!this.db) throw new Error('Database not available');
    const plan = planFor(planId);
    const now = new Date();

    const prepared = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.merchantId, merchantId))
        .for("update")
        .limit(1);
      const subscription = rows[0];
      if (!subscription) {
        return {
          kind: "done" as const,
          result: { ok: false as const, reason: "not-found" as const },
        };
      }

      const seatRows = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(users)
        .where(and(
          eq(users.merchantId, merchantId),
          or(
            eq(users.status, "active"),
            and(eq(users.status, "invited"), sql`${users.inviteExpiresAt} > ${now}`),
          ),
        ));
      const seatsInUse = seatRows[0]?.value ?? 0;

      const currentPlan = planForOrDefault(subscription.planId);
      if (plan.id === currentPlan.id) {
        return {
          kind: "done" as const,
          result: { ok: true as const, subscription, applied: "immediate" as const },
        };
      }
      const currentPriceCents = subscription.priceCents ?? currentPlan.priceCents;
      const upgrade = isUpgrade(currentPlan.id, plan.id);
      const downgrade = !upgrade;

      if (plan.seats < seatsInUse) {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "too-many-seats" as const,
            seatsInUse,
            seatLimit: plan.seats,
          },
        };
      }

      const staleBefore = new Date(now.getTime() - SUBSCRIPTION_BILLING_CLAIM_LEASE_MS);
      const claimIsLive =
        !!subscription.billingClaimToken
        && !!subscription.billingClaimedAt
        && new Date(subscription.billingClaimedAt).getTime() >= staleBefore.getTime();
      if (claimIsLive) {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "billing-busy" as const,
            message: "Billing is already in progress. Please try again shortly.",
          },
        };
      }

      // Downgrades wait for the already-paid period. New/unpaid subscriptions can
      // choose any plan freely because no service has yet been delivered.
      const hasLivePaidPeriod =
        subscription.status !== "cancelled"
        && !!subscription.lastBillingDate
        && !!subscription.currentPeriodEnd
        && new Date(subscription.currentPeriodEnd).getTime() > now.getTime();
      if (downgrade && hasLivePaidPeriod) {
        const updated = await tx
          .update(merchantSubscriptions)
          .set(queuedPlanUpdates(planId, subscription.currentPeriodEnd ?? null, now))
          .where(eq(merchantSubscriptions.id, subscription.id))
          .returning();
        return {
          kind: "done" as const,
          result: { ok: true as const, subscription: updated[0], applied: "queued" as const },
        };
      }

      const paidUpgrade = upgrade && hasLivePaidPeriod;
      if (!paidUpgrade) {
        const updated = await tx
          .update(merchantSubscriptions)
          .set(immediatePlanUpdates(planId, now))
          .where(eq(merchantSubscriptions.id, subscription.id))
          .returning();
        return {
          kind: "done" as const,
          result: { ok: true as const, subscription: updated[0], applied: "immediate" as const },
        };
      }

      if (
        subscription.status !== "active"
        || subscription.cancelAtPeriodEnd
        || !subscription.currentPeriodStart
        || !subscription.currentPeriodEnd
      ) {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "invalid-state" as const,
            message: "Resolve the current subscription state before upgrading.",
          },
        };
      }
      if (!subscription.windcaveCardId) {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "payment-method-required" as const,
            message: "Add a payment method before upgrading.",
          },
        };
      }

      const amountCents = proratedUpgradeCents(
        currentPriceCents,
        plan.priceCents,
        new Date(subscription.currentPeriodStart),
        new Date(subscription.currentPeriodEnd),
        now,
      );
      if (amountCents <= 0) {
        const updated = await tx
          .update(merchantSubscriptions)
          .set(immediatePlanUpdates(planId, now))
          .where(eq(merchantSubscriptions.id, subscription.id))
          .returning();
        return {
          kind: "done" as const,
          result: { ok: true as const, subscription: updated[0], applied: "immediate" as const },
        };
      }
      if (!chargeUpgrade) {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "charge-failed" as const,
            message: "The upgrade charge could not be started.",
          },
        };
      }

      const anchor = new Date(subscription.currentPeriodStart).toISOString().slice(0, 10);
      const keyPrefix = `plan-${subscription.id}-${anchor}-${plan.id}-a`;
      const priorAttempts = await tx
        .select({
          value: sql<number>`coalesce(max(${subscriptionBillingHistory.attemptNumber}), 0)::int`,
        })
        .from(subscriptionBillingHistory)
        .where(and(
          eq(subscriptionBillingHistory.subscriptionId, subscription.id),
          eq(subscriptionBillingHistory.billingType, "plan_change"),
          sql`${subscriptionBillingHistory.idempotencyKey} like ${`${keyPrefix}%`}`,
        ));
      const attemptNumber = (priorAttempts[0]?.value ?? 0) + 1;
      const idempotencyKey = `${keyPrefix}${attemptNumber}`;
      const claimToken = randomUUID();
      const claimedRows = await tx
        .update(merchantSubscriptions)
        .set({
          billingClaimToken: claimToken,
          billingClaimedAt: now,
          updatedAt: now,
        })
        .where(eq(merchantSubscriptions.id, subscription.id))
        .returning();
      return {
        kind: "charge" as const,
        subscription: claimedRows[0],
        claimToken,
        amountCents,
        anchor,
        attemptNumber,
        idempotencyKey,
      };
    });

    if (prepared.kind === "done") return prepared.result;

    let charge: PlanUpgradeChargeResult;
    try {
      charge = await chargeUpgrade!({
        subscriptionId: prepared.subscription.id,
        merchantId,
        targetPlanId: plan.id,
        cardId: prepared.subscription.windcaveCardId!,
        amountCents: prepared.amountCents,
        idempotencyKey: prepared.idempotencyKey,
        reference: `TAPTPAY-UPGRADE-M${merchantId}-${plan.id.toUpperCase()}-${prepared.anchor}-A${prepared.attemptNumber}`,
      });
    } catch (error) {
      await this.releaseSubscriptionBillingClaim(
        prepared.subscription.id,
        prepared.claimToken,
      );
      throw error;
    }
    if (!charge.success) {
      await this.releaseSubscriptionBillingClaim(
        prepared.subscription.id,
        prepared.claimToken,
      );
      return {
        ok: false as const,
        reason: "charge-failed" as const,
        message: "The upgrade payment could not be confirmed. Please try again.",
      };
    }

    return await this.db.transaction(async (tx) => {
      const claimedRows = await tx
        .select()
        .from(merchantSubscriptions)
        .where(and(
          eq(merchantSubscriptions.id, prepared.subscription.id),
          eq(merchantSubscriptions.billingClaimToken, prepared.claimToken),
        ))
        .for("update")
        .limit(1);
      const claimed = claimedRows[0];
      if (!claimed) {
        return {
          ok: false as const,
          reason: "billing-busy" as const,
          message: "Billing was reconciled by another worker. Refresh and try again.",
        };
      }
      const completedAt = new Date();
      const historyBase = {
        merchantId,
        subscriptionId: claimed.id,
        billingType: "plan_change",
        amount: (prepared.amountCents / 100).toFixed(2),
        billingPeriodStart: now,
        billingPeriodEnd: claimed.currentPeriodEnd,
        windcaveTransactionId: charge.windcaveTransactionId ?? null,
        idempotencyKey: prepared.idempotencyKey,
        attemptNumber: prepared.attemptNumber,
        description: `Prorated upgrade to ${plan.name}`,
      };
      if (!charge.approved) {
        const failureReason = charge.declineReason || "The upgrade payment was declined.";
        await tx
          .insert(subscriptionBillingHistory)
          .values({
            ...historyBase,
            status: "failed",
            failureReason: failureReason.slice(0, 500),
          })
          .onConflictDoNothing();
        await tx
          .update(merchantSubscriptions)
          .set({
            billingClaimToken: null,
            billingClaimedAt: null,
            updatedAt: completedAt,
          })
          .where(and(
            eq(merchantSubscriptions.id, claimed.id),
            eq(merchantSubscriptions.billingClaimToken, prepared.claimToken),
          ));
        return {
          ok: false as const,
          reason: "declined" as const,
          message: failureReason,
        };
      }

      await tx
        .insert(subscriptionBillingHistory)
        .values({
          ...historyBase,
          status: "succeeded",
          paidAt: completedAt,
        })
        .onConflictDoNothing();
      const updated = await tx
        .update(merchantSubscriptions)
        .set({
          ...immediatePlanUpdates(planId, completedAt),
          billingClaimToken: null,
          billingClaimedAt: null,
        })
        .where(and(
          eq(merchantSubscriptions.id, claimed.id),
          eq(merchantSubscriptions.billingClaimToken, prepared.claimToken),
        ))
        .returning();
      return {
        ok: true as const,
        subscription: updated[0],
        applied: "immediate" as const,
      };
    });
  }

  async saveSubscriptionCard(merchantId: number, card: SubscriptionCardInput): Promise<MerchantSubscription> {
    if (!this.db) throw new Error('Database not available');
    await this.getOrCreateSubscription(merchantId);
    const now = new Date();
    const result = await this.db
      .update(merchantSubscriptions)
      .set({
        windcaveCardId: card.windcaveCardId,
        cardBrand: card.brand,
        cardLast4: card.last4,
        cardExpiry: card.expiry,
        updatedAt: now,
      })
      .where(eq(merchantSubscriptions.merchantId, merchantId))
      .returning();
    return result[0];
  }

  /**
   * Associates a provider-created card session with the authenticated merchant.
   * Confirmation must present this exact opaque id, preventing one merchant
   * from attaching a card token obtained from another merchant's session.
   */
  async bindSubscriptionCardSession(merchantId: number, sessionId: string): Promise<boolean> {
    if (!this.db) throw new Error("Database not available");
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) return false;

    await this.getOrCreateSubscription(merchantId);
    const rows = await this.db
      .update(merchantSubscriptions)
      .set({
        windcaveBillingRef: normalizedSessionId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(merchantSubscriptions.merchantId, merchantId),
        isNull(merchantSubscriptions.billingClaimToken),
      ))
      .returning({ id: merchantSubscriptions.id });
    return rows.length === 1;
  }

  /**
   * Completes card setup and, where necessary, establishes the paid period.
   *
   * A short database transaction validates the session and takes a durable
   * claim. The provider call happens after that transaction commits, then a
   * second claim-guarded transaction records history and advances the period.
   * This avoids holding a row lock or database connection over network I/O.
   * The session-derived provider key makes a lost response/finalize safe to
   * replay after the claim lease expires.
   */
  async completeSubscriptionCardSetup(
    merchantId: number,
    sessionId: string,
    card: SubscriptionCardInput,
    charge: SubscriptionCardChargeExecutor,
  ): Promise<SubscriptionCardSetupResult> {
    if (!this.db) throw new Error("Database not available");
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId || !card.windcaveCardId.trim()) {
      return {
        ok: false,
        reason: "session-mismatch",
        message: "The card session is invalid.",
      };
    }

    const prepared = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.merchantId, merchantId))
        .for("update")
        .limit(1);
      const subscription = rows[0];
      if (!subscription) {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "not-found" as const,
            message: "Subscription not found.",
          },
        };
      }
      const cardSessionState = subscriptionCardSessionState(subscription, normalizedSessionId);
      if (cardSessionState === "succeeded") {
        const now = new Date();
        const paidPeriodIsCurrent =
          subscription.status === "active"
          && !!subscription.lastBillingDate
          && !!subscription.currentPeriodEnd
          && new Date(subscription.currentPeriodEnd).getTime() > now.getTime();
        if (!paidPeriodIsCurrent) {
          return {
            kind: "done" as const,
            result: { ok: true as const, subscription, charged: false },
          };
        }
        const updated = await tx
          .update(merchantSubscriptions)
          .set({
            windcaveCardId: card.windcaveCardId,
            cardBrand: card.brand,
            cardLast4: card.last4,
            cardExpiry: card.expiry,
            windcaveBillingRef: terminalSubscriptionCardSessionRef("succeeded", normalizedSessionId),
            updatedAt: now,
          })
          .where(eq(merchantSubscriptions.id, subscription.id))
          .returning();
        return {
          kind: "done" as const,
          result: { ok: true as const, subscription: updated[0], charged: false },
        };
      }
      if (cardSessionState === "declined") {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "declined" as const,
            message: "The card was declined.",
          },
        };
      }
      if (cardSessionState !== "pending") {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "session-mismatch" as const,
            message: "The card session does not belong to this account.",
          },
        };
      }
      const now = new Date();
      const staleBefore = new Date(now.getTime() - SUBSCRIPTION_BILLING_CLAIM_LEASE_MS);
      const claimIsLive =
        !!subscription.billingClaimToken
        && !!subscription.billingClaimedAt
        && new Date(subscription.billingClaimedAt).getTime() >= staleBefore.getTime();
      if (claimIsLive) {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "billing-busy" as const,
            message: "Billing is already in progress. Please try again shortly.",
          },
        };
      }

      const paidPeriodIsCurrent =
        subscription.status === "active"
        && !!subscription.lastBillingDate
        && !!subscription.currentPeriodEnd
        && new Date(subscription.currentPeriodEnd).getTime() > now.getTime();
      const cardFields = {
        windcaveCardId: card.windcaveCardId,
        cardBrand: card.brand,
        cardLast4: card.last4,
        cardExpiry: card.expiry,
        updatedAt: now,
      };

      // Replacing a card during a paid period must not create another charge.
      if (paidPeriodIsCurrent) {
        const updated = await tx
          .update(merchantSubscriptions)
          .set({
            ...cardFields,
            windcaveBillingRef: terminalSubscriptionCardSessionRef("succeeded", normalizedSessionId),
          })
          .where(eq(merchantSubscriptions.id, subscription.id))
          .returning();
        return {
          kind: "done" as const,
          result: { ok: true as const, subscription: updated[0], charged: false },
        };
      }

      if (
        (subscription.cancelAtPeriodEnd && subscription.status !== "cancelled")
        || !["pending", "active", "past_due", "suspended", "cancelled"].includes(subscription.status)
      ) {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "invalid-state" as const,
            message: "Resolve the pending cancellation before adding a payment method.",
          },
        };
      }

      const plan = renewalPlan(subscription);
      const amountCents = subscription.pendingPlanId
        ? plan.priceCents
        : (subscription.priceCents ?? plan.priceCents);
      const idempotencyKey =
        `sub-${subscription.id}-card-${createHash("sha256")
          .update(normalizedSessionId)
          .digest("hex")
          .slice(0, 16)}`;
      const periodStart = nextBillingPeriodStart(subscription, now);
      const periodEnd = addOneMonth(periodStart);

      const priorRows = await tx
        .select()
        .from(subscriptionBillingHistory)
        .where(eq(subscriptionBillingHistory.idempotencyKey, idempotencyKey))
        .limit(1);
      const prior = priorRows[0];
      if (prior?.status === "failed") {
        await tx
          .update(merchantSubscriptions)
          .set({ windcaveBillingRef: terminalSubscriptionCardSessionRef("declined", normalizedSessionId) })
          .where(eq(merchantSubscriptions.id, subscription.id));
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "declined" as const,
            message: prior.failureReason || "The card was declined.",
          },
        };
      }
      if (prior && prior.status !== "succeeded") {
        return {
          kind: "done" as const,
          result: {
            ok: false as const,
            reason: "billing-busy" as const,
            message: "Card activation is already in progress.",
          },
        };
      }
      if (prior?.status === "succeeded") {
        const updated = await tx
          .update(merchantSubscriptions)
          .set({ windcaveBillingRef: terminalSubscriptionCardSessionRef("succeeded", normalizedSessionId) })
          .where(eq(merchantSubscriptions.id, subscription.id))
          .returning();
        return {
          kind: "done" as const,
          result: { ok: true as const, subscription: updated[0], charged: false },
        };
      }

      const claimToken = randomUUID();
      const claimedRows = await tx
        .update(merchantSubscriptions)
        .set({
          billingClaimToken: claimToken,
          billingClaimedAt: now,
          nextBillingDate: subscription.nextBillingDate ?? periodStart,
          updatedAt: now,
        })
        .where(eq(merchantSubscriptions.id, subscription.id))
        .returning();
      return {
        kind: "charge" as const,
        subscription: claimedRows[0],
        claimToken,
        plan,
        amountCents,
        idempotencyKey,
        periodStart,
        periodEnd,
        attemptNumber: (subscription.failedPaymentCount ?? 0) + 1,
      };
    });

    if (prepared.kind === "done") return prepared.result;

    let outcome: PlanUpgradeChargeResult;
    try {
      outcome = await charge({
        subscriptionId: prepared.subscription.id,
        merchantId,
        cardId: card.windcaveCardId,
        amountCents: prepared.amountCents,
        idempotencyKey: prepared.idempotencyKey,
        reference: `TAPTPAY-CARD-M${merchantId}-${prepared.plan.id.toUpperCase()}`,
      });
    } catch (error) {
      await this.releaseSubscriptionBillingClaim(
        prepared.subscription.id,
        prepared.claimToken,
      );
      throw error;
    }

    if (!outcome.success) {
      await this.releaseSubscriptionBillingClaim(
        prepared.subscription.id,
        prepared.claimToken,
      );
      return {
        ok: false as const,
        reason: "charge-failed" as const,
        message: "The payment could not be confirmed. Please try again.",
      };
    }

    return await this.db.transaction(async (tx) => {
      const claimedRows = await tx
        .select()
        .from(merchantSubscriptions)
        .where(and(
          eq(merchantSubscriptions.id, prepared.subscription.id),
          eq(merchantSubscriptions.billingClaimToken, prepared.claimToken),
        ))
        .for("update")
        .limit(1);
      const claimed = claimedRows[0];
      if (!claimed) {
        return {
          ok: false as const,
          reason: "billing-busy" as const,
          message: "Billing was reconciled by another worker. Refresh and try again.",
        };
      }
      const completedAt = new Date();
      const cardFields = {
        windcaveCardId: card.windcaveCardId,
        cardBrand: card.brand,
        cardLast4: card.last4,
        cardExpiry: card.expiry,
        updatedAt: completedAt,
      };
      if (!outcome.approved) {
        const failureReason = outcome.declineReason || "Card declined";
        const exhausted = prepared.attemptNumber >= MAX_PAYMENT_ATTEMPTS;
        await tx
          .insert(subscriptionBillingHistory)
          .values({
            merchantId,
            subscriptionId: claimed.id,
            billingType: "monthly_subscription",
            amount: (prepared.amountCents / 100).toFixed(2),
            billingPeriodStart: prepared.periodStart,
            billingPeriodEnd: prepared.periodEnd,
            windcaveTransactionId: outcome.windcaveTransactionId ?? null,
            idempotencyKey: prepared.idempotencyKey,
            attemptNumber: prepared.attemptNumber,
            status: "failed",
            description: `${prepared.plan.name} subscription activation`,
            failureReason,
          })
          .onConflictDoNothing();
        await tx
          .update(merchantSubscriptions)
          .set({
            ...cardFields,
            ...failedPaymentUpdates(claimed, completedAt, failureReason, exhausted),
            cancelAtPeriodEnd: false,
            cancellationRequestedAt: null,
            cancellationEffectiveDate: null,
            cancellationReason: null,
            lastBillingDate: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            nextBillingDate: prepared.periodStart,
            windcaveBillingRef: terminalSubscriptionCardSessionRef("declined", normalizedSessionId),
            billingClaimToken: null,
            billingClaimedAt: null,
          })
          .where(and(
            eq(merchantSubscriptions.id, claimed.id),
            eq(merchantSubscriptions.billingClaimToken, prepared.claimToken),
          ));
        return { ok: false as const, reason: "declined" as const, message: failureReason };
      }

      const updated = await tx
        .update(merchantSubscriptions)
        .set({
          ...nextPeriodUpdates(claimed, completedAt, prepared.periodStart),
          ...cardFields,
          cancelAtPeriodEnd: false,
          cancellationRequestedAt: null,
          cancellationEffectiveDate: null,
          cancellationReason: null,
          windcaveBillingRef: terminalSubscriptionCardSessionRef("succeeded", normalizedSessionId),
          billingClaimToken: null,
          billingClaimedAt: null,
        })
        .where(and(
          eq(merchantSubscriptions.id, claimed.id),
          eq(merchantSubscriptions.billingClaimToken, prepared.claimToken),
        ))
        .returning();
      await tx
        .insert(subscriptionBillingHistory)
        .values({
          merchantId,
          subscriptionId: claimed.id,
          billingType: "monthly_subscription",
          amount: (prepared.amountCents / 100).toFixed(2),
          billingPeriodStart: prepared.periodStart,
          billingPeriodEnd: prepared.periodEnd,
          windcaveTransactionId: outcome.windcaveTransactionId ?? null,
          idempotencyKey: prepared.idempotencyKey,
          attemptNumber: prepared.attemptNumber,
          status: "succeeded",
          description: `${prepared.plan.name} subscription activation`,
          paidAt: completedAt,
        })
        .onConflictDoNothing();
      return { ok: true as const, subscription: updated[0], charged: true };
    });
  }

  async removeSubscriptionCard(merchantId: number): Promise<MerchantSubscription> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.merchantId, merchantId))
        .for("update")
        .limit(1);
      const subscription = rows[0];
      if (!subscription) throw new Error("Subscription not found");
      if (subscription.billingClaimToken) throw new SubscriptionBillingBusyError();
      const result = await tx
        .update(merchantSubscriptions)
        .set({
          windcaveCardId: null,
          cardBrand: null,
          cardLast4: null,
          cardExpiry: null,
          updatedAt: new Date(),
        })
        .where(eq(merchantSubscriptions.id, subscription.id))
        .returning();
      return result[0];
    });
  }

  async getCancelledSubscriptionsPastPeriodEnd(now: Date): Promise<MerchantSubscription[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(merchantSubscriptions)
      .where(and(
        eq(merchantSubscriptions.cancelAtPeriodEnd, true),
        ne(merchantSubscriptions.status, "cancelled"),
        lte(merchantSubscriptions.currentPeriodEnd, now),
      ));
  }

  /** Claims due rows under SKIP LOCKED so overlapping instances cannot bill twice. */
  async claimSubscriptionsDueForBilling(
    now: Date,
    limit: number = 50,
    excludeSubscriptionIds: readonly number[] = [],
    claimedAt: Date = now,
  ): Promise<MerchantSubscription[]> {
    if (!this.db) throw new Error('Database not available');
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const staleBefore = new Date(claimedAt.getTime() - SUBSCRIPTION_BILLING_CLAIM_LEASE_MS);

    return await this.db.transaction(async (tx) => {
      const candidates = await tx
        .select()
        .from(merchantSubscriptions)
        .where(and(
          inArray(merchantSubscriptions.status, ["active", "past_due"]),
          eq(merchantSubscriptions.cancelAtPeriodEnd, false),
          sql`coalesce(${merchantSubscriptions.nextBillingDate}, ${merchantSubscriptions.currentPeriodEnd}) <= ${now}`,
          or(
            eq(merchantSubscriptions.status, "active"),
            and(
              eq(merchantSubscriptions.status, "past_due"),
              sql`coalesce(${merchantSubscriptions.failedPaymentCount}, 0) < ${MAX_PAYMENT_ATTEMPTS}`,
              sql`${merchantSubscriptions.nextBillingDate} + (
                case coalesce(${merchantSubscriptions.failedPaymentCount}, 0)
                  when 0 then interval '0 days'
                  when 1 then interval '1 day'
                  when 2 then interval '3 days'
                  when 3 then interval '7 days'
                  else interval '100 years'
                end
              ) <= ${now}`,
            ),
          ),
          or(
            isNull(merchantSubscriptions.billingClaimToken),
            isNull(merchantSubscriptions.billingClaimedAt),
            lt(merchantSubscriptions.billingClaimedAt, staleBefore),
          ),
          excludeSubscriptionIds.length > 0
            ? notInArray(merchantSubscriptions.id, [...excludeSubscriptionIds])
            : undefined,
        ))
        .orderBy(
          sql`coalesce(${merchantSubscriptions.nextBillingDate}, ${merchantSubscriptions.currentPeriodEnd}) asc`,
          asc(merchantSubscriptions.id),
        )
        .for("update", { skipLocked: true })
        .limit(safeLimit);

      const claimed: MerchantSubscription[] = [];
      for (const candidate of candidates) {
        const claimToken = randomUUID();
        const periodAnchor =
          candidate.nextBillingDate
          ?? candidate.currentPeriodEnd
          ?? nextBillingPeriodStart(candidate, now);
        const rows = await tx
          .update(merchantSubscriptions)
          .set({
            billingClaimToken: claimToken,
            billingClaimedAt: claimedAt,
            nextBillingDate: periodAnchor,
            updatedAt: claimedAt,
          })
          .where(eq(merchantSubscriptions.id, candidate.id))
          .returning();
        if (rows[0]) claimed.push(rows[0]);
      }
      return claimed;
    });
  }

  /** Applies the state change and reconciliation row in one claim-guarded commit. */
  async finalizeSubscriptionBillingClaim(
    subscriptionId: number,
    claimToken: string,
    updates: Record<string, unknown>,
    history: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(merchantSubscriptions)
        .set({
          ...(updates as any),
          billingClaimToken: null,
          billingClaimedAt: null,
        })
        .where(and(
          eq(merchantSubscriptions.id, subscriptionId),
          eq(merchantSubscriptions.billingClaimToken, claimToken),
        ))
        .returning({ id: merchantSubscriptions.id });
      if (!rows[0]) return false;

      await tx
        .insert(subscriptionBillingHistory)
        .values(history as any)
        .onConflictDoNothing();
      return true;
    });
  }

  async releaseSubscriptionBillingClaim(subscriptionId: number, claimToken: string): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    await this.db
      .update(merchantSubscriptions)
      .set({ billingClaimToken: null, billingClaimedAt: null })
      .where(and(
        eq(merchantSubscriptions.id, subscriptionId),
        eq(merchantSubscriptions.billingClaimToken, claimToken),
      ));
  }

  async expireCancelledSubscriptions(now: Date): Promise<number> {
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db
      .update(merchantSubscriptions)
      .set({
        status: "cancelled",
        cancelAtPeriodEnd: false,
        lastBillingDate: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        nextBillingDate: null,
        updatedAt: now,
      })
      .where(and(
        eq(merchantSubscriptions.cancelAtPeriodEnd, true),
        ne(merchantSubscriptions.status, "cancelled"),
        lte(merchantSubscriptions.currentPeriodEnd, now),
        isNull(merchantSubscriptions.billingClaimToken),
      ))
      .returning({ id: merchantSubscriptions.id });
    return rows.length;
  }

  // ── Team seats ─────────────────────────────────────────────────────────────

  async getTeamMembers(merchantId: number): Promise<User[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db
      .select()
      .from(users)
      .where(eq(users.merchantId, merchantId))
      .orderBy(users.id);
  }

  async countSeatsInUse(merchantId: number): Promise<number> {
    if (!this.db) throw new Error('Database not available');
    const now = new Date();
    const rows = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(users)
      .where(and(
        eq(users.merchantId, merchantId),
        or(
          eq(users.status, "active"),
          and(eq(users.status, "invited"), sql`${users.inviteExpiresAt} > ${now}`),
        ),
      ));
    return rows[0]?.value ?? 0;
  }

  /**
   * Creates an invited seat.
   *
   * Counting seats and inserting the row happen under a lock on the subscription
   * row. Without it two concurrent invites both read "4 of 5 used" and both
   * insert, producing a sixth seat on a five-seat plan.
   */
  async inviteTeamMember(
    merchantId: number,
    input: InviteTeamMemberInput,
  ): Promise<InviteTeamMemberResult> {
    if (!this.db) throw new Error('Database not available');
    const email = input.email.trim().toLowerCase();

    return await this.db.transaction(async (tx) => {
      const subRows = await tx
        .select()
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.merchantId, merchantId))
        .for("update")
        .limit(1);
      const subscription = subRows[0];
      const currentLimit = subscription?.seatLimit ?? planFor(DEFAULT_PLAN_ID).seats;
      const seatLimit = subscription?.pendingPlanId
        ? Math.min(currentLimit, planFor(subscription.pendingPlanId).seats)
        : currentLimit;

      const existing = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      if (existing[0]) return { ok: false as const, reason: "email-taken" as const };

      const seatRows = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(users)
        .where(and(
          eq(users.merchantId, merchantId),
          or(
            eq(users.status, "active"),
            and(
              eq(users.status, "invited"),
              sql`${users.inviteExpiresAt} > ${new Date()}`,
            ),
          ),
        ));
      const seatsInUse = seatRows[0]?.value ?? 0;
      if (seatsInUse >= seatLimit) {
        return { ok: false as const, reason: "seat-limit" as const, seatsInUse, seatLimit };
      }

      const inserted = await tx
        .insert(users)
        .values({
          email,
          // Placeholder hash: an invited user cannot sign in until they accept
          // the invite and set a real password. bcrypt never produces "!".
          password: "!",
          merchantId,
          role: "member",
          status: "invited",
          name: input.name ?? null,
          inviteTokenHash: input.inviteTokenHash,
          inviteExpiresAt: input.inviteExpiresAt,
        })
        .returning();

      return { ok: true as const, user: inserted[0] };
    });
  }

  async setTeamMemberStatus(
    merchantId: number,
    userId: number,
    status: UserStatus,
  ): Promise<TeamMemberStatusResult> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      // Serialise re-enables with invites and plan changes on the same row.
      const subscriptions = await tx
        .select()
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.merchantId, merchantId))
        .for("update")
        .limit(1);
      const subscription = subscriptions[0];
      const currentLimit = subscription?.seatLimit ?? planFor(DEFAULT_PLAN_ID).seats;
      const seatLimit = subscription?.pendingPlanId
        ? Math.min(currentLimit, planFor(subscription.pendingPlanId).seats)
        : currentLimit;

      const rows = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.merchantId, merchantId)))
        .for("update")
        .limit(1);
      const member = rows[0];
      if (!member) return { ok: false as const, reason: "not-found" as const };
      if (member.role === "owner") return { ok: false as const, reason: "owner" as const };
      if (
        (member.status !== "active" && member.status !== "disabled") ||
        (status !== "active" && status !== "disabled") ||
        member.status === status
      ) {
        return { ok: false as const, reason: "invalid-state" as const };
      }

      if (status === "active") {
        const now = new Date();
        const seats = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(users)
          .where(and(
            eq(users.merchantId, merchantId),
            or(
              eq(users.status, "active"),
              and(eq(users.status, "invited"), sql`${users.inviteExpiresAt} > ${now}`),
            ),
          ));
        const seatsInUse = seats[0]?.value ?? 0;
        if (seatsInUse >= seatLimit) {
          return { ok: false as const, reason: "seat-limit" as const, seatsInUse, seatLimit };
        }
      }

      const updated = await tx
        .update(users)
        .set({ status })
        .where(and(eq(users.id, userId), eq(users.status, member.status)))
        .returning();
      return updated[0]
        ? { ok: true as const, user: updated[0] }
        : { ok: false as const, reason: "invalid-state" as const };
    });
  }

  async rotateTeamInvite(
    merchantId: number,
    userId: number,
    input: Pick<InviteTeamMemberInput, "inviteTokenHash" | "inviteExpiresAt" | "name"> & { expectedTokenHash: string },
  ): Promise<RotateTeamInviteResult> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      const subscriptions = await tx
        .select()
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.merchantId, merchantId))
        .for("update")
        .limit(1);
      const subscription = subscriptions[0];
      const currentLimit = subscription?.seatLimit ?? planFor(DEFAULT_PLAN_ID).seats;
      const seatLimit = subscription?.pendingPlanId
        ? Math.min(currentLimit, planFor(subscription.pendingPlanId).seats)
        : currentLimit;

      const rows = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.merchantId, merchantId)))
        .for("update")
        .limit(1);
      const invited = rows[0];
      if (!invited || invited.role === "owner" || invited.status !== "invited") {
        return { ok: false as const, reason: "not-found" as const };
      }
      if (invited.inviteTokenHash !== input.expectedTokenHash) {
        return { ok: false as const, reason: "conflict" as const };
      }

      const now = new Date();
      const wasLive = !!invited.inviteExpiresAt && new Date(invited.inviteExpiresAt) > now;
      if (!wasLive) {
        const seats = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(users)
          .where(and(
            eq(users.merchantId, merchantId),
            or(
              eq(users.status, "active"),
              and(eq(users.status, "invited"), sql`${users.inviteExpiresAt} > ${now}`),
            ),
          ));
        const seatsInUse = seats[0]?.value ?? 0;
        if (seatsInUse >= seatLimit) {
          return { ok: false as const, reason: "seat-limit" as const, seatsInUse, seatLimit };
        }
      }

      const result = await tx
        .update(users)
        .set({
          inviteTokenHash: input.inviteTokenHash,
          inviteExpiresAt: input.inviteExpiresAt,
          ...(input.name !== undefined ? { name: input.name } : {}),
        })
        .where(and(
          eq(users.id, userId),
          eq(users.status, "invited"),
          eq(users.inviteTokenHash, input.expectedTokenHash),
        ))
        .returning();
      return result[0]
        ? { ok: true as const, user: result[0] }
        : { ok: false as const, reason: "conflict" as const };
    });
  }

  async revokeTeamInvite(merchantId: number, userId: number, expectedTokenHash?: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    const predicates = [
      eq(users.id, userId),
      eq(users.merchantId, merchantId),
      eq(users.status, "invited"),
      ne(users.role, "owner"),
    ];
    if (expectedTokenHash) predicates.push(eq(users.inviteTokenHash, expectedTokenHash));
    const result = await this.db
      .delete(users)
      .where(and(...predicates))
      .returning();
    return result.length > 0;
  }

  async removeTeamMember(merchantId: number, userId: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .delete(users)
      .where(and(
        eq(users.id, userId),
        eq(users.merchantId, merchantId),
        ne(users.role, "owner"),
      ))
      .returning();
    return result.length > 0;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .limit(1);
    return result[0];
  }

  async getUserById(id: number): Promise<User | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByInviteToken(tokenHash: string): Promise<User | undefined> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.inviteTokenHash, tokenHash))
      .limit(1);
    return result[0];
  }

  async activateInvitedUser(
    userId: number,
    tokenHash: string,
    passwordHash: string,
    name?: string | null,
    now: Date = new Date(),
  ): Promise<User | null> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(users)
      .set({
        password: passwordHash,
        status: "active",
        name: name ?? undefined,
        // Burn the token so an intercepted invite email cannot be replayed.
        inviteTokenHash: null,
        inviteExpiresAt: null,
      })
      .where(and(
        eq(users.id, userId),
        eq(users.status, "invited"),
        eq(users.inviteTokenHash, tokenHash),
        sql`${users.inviteExpiresAt} > ${now}`,
      ))
      .returning();
    return result[0] ?? null;
  }

  async recordUserLogin(userId: number, at: Date): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    await this.db.update(users).set({ lastLoginAt: at }).where(eq(users.id, userId));
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not available');
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const result = await tx
        .update(users)
        .set({ password: passwordHash })
        .where(eq(users.id, userId))
        .returning();
      const updated = result[0] ?? null;
      // The owner's credential also lives on the merchant row (password reset
      // and admin activation still read it), so commit both or neither.
      if (updated?.role === "owner" && updated.merchantId) {
        await tx
          .update(merchants)
          .set({ passwordHash, updatedAt: now })
          .where(eq(merchants.id, updated.merchantId));
      }
      return updated;
    });
  }

  async setUserResetToken(
    userId: number,
    tokenHash: string | null,
    expiry: Date | null,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    await this.db
      .update(users)
      .set({ resetToken: tokenHash, resetTokenExpiry: expiry })
      .where(eq(users.id, userId));
  }

  async getUserByResetToken(tokenHash: string): Promise<User | undefined> {
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.resetToken, tokenHash))
      .limit(1);
    return rows[0];
  }

  /** Atomically consumes a live reset token and synchronises an owner hash. */
  async resetUserPasswordByToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<User | null> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(users)
        .set({
          password: passwordHash,
          resetToken: null,
          resetTokenExpiry: null,
        })
        .where(and(
          eq(users.resetToken, tokenHash),
          eq(users.status, "active"),
          inArray(users.role, ["owner", "member"]),
          isNotNull(users.merchantId),
          sql`${users.resetTokenExpiry} > ${now}`,
        ))
        .returning();
      const updated = rows[0] ?? null;

      if (updated?.role === "owner" && updated.merchantId) {
        await tx
          .update(merchants)
          .set({ passwordHash, updatedAt: now })
          .where(eq(merchants.id, updated.merchantId));
      }
      return updated;
    });
  }

  // ── Property management — DatabaseStorage implementations ──────────────────
  async createTenantProfile(data: any): Promise<any> {
    const db = getDb(); if (!db) throw new Error('No database');
    const [r] = await db.insert(tenantProfiles).values(data).returning(); return r;
  }
  async getTenantProfile(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [r] = await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, id)).limit(1); return r;
  }
  async getTenantProfilesByMerchant(merchantId: number, opts: { search?: string; includeArchived?: boolean } = {}): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    const conds: any[] = [eq(tenantProfiles.merchantId, merchantId)];
    if (!opts.includeArchived) conds.push(eq(tenantProfiles.status, "active"));
    if (opts.search?.trim()) {
      const p = `%${opts.search.trim()}%`;
      conds.push(or(ilike(tenantProfiles.firstName, p), ilike(tenantProfiles.lastName, p), ilike(tenantProfiles.propertyAddress, p)));
    }
    return db.select().from(tenantProfiles).where(and(...conds)).orderBy(desc(tenantProfiles.createdAt));
  }
  async updateTenantProfile(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [r] = await db.update(tenantProfiles).set({ ...updates, updatedAt: new Date() }).where(eq(tenantProfiles.id, id)).returning(); return r;
  }
  async archiveTenantProfile(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const now = new Date();
    const [r] = await db.update(tenantProfiles).set({ status: "archived", archivedAt: now, updatedAt: now }).where(eq(tenantProfiles.id, id)).returning();
    await db.update(activeSchedules).set({ status: "terminated", terminatedAt: now, updatedAt: now }).where(and(eq(activeSchedules.tenantProfileId, id), sql`${activeSchedules.status} <> 'terminated'`));
    return r;
  }
  async unarchiveTenantProfile(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const now = new Date();
    // Reactivate the profile only — schedules terminated at archive time stay
    // terminated; the merchant can set up a fresh schedule if they want one.
    const [r] = await db.update(tenantProfiles).set({ status: "active", archivedAt: null, updatedAt: now }).where(eq(tenantProfiles.id, id)).returning();
    return r;
  }
  async createActiveSchedule(data: any): Promise<any> {
    const db = getDb(); if (!db) throw new Error('No database');
    const [r] = await db.insert(activeSchedules).values(data).returning(); return r;
  }
  async getActiveSchedule(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [r] = await db.select().from(activeSchedules).where(eq(activeSchedules.id, id)).limit(1); return r;
  }
  async getActiveSchedulesByTenant(tenantProfileId: string): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(activeSchedules).where(eq(activeSchedules.tenantProfileId, tenantProfileId));
  }
  async getActiveSchedulesByMerchant(merchantId: number): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(activeSchedules).where(eq(activeSchedules.merchantId, merchantId));
  }
  async updateActiveSchedule(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [r] = await db.update(activeSchedules).set({ ...updates, updatedAt: new Date() }).where(eq(activeSchedules.id, id)).returning(); return r;
  }
  async terminateActiveSchedule(id: string): Promise<any> {
    return this.updateActiveSchedule(id, { status: "terminated", terminatedAt: new Date() });
  }
  async getDueActiveSchedules(now: Date): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(activeSchedules).where(and(eq(activeSchedules.status, "active"), lte(activeSchedules.nextRunDate, now)));
  }
  async createInvoiceRentRequest(data: any): Promise<any> {
    const db = getDb(); if (!db) throw new Error('No database');
    if (data.scheduleId && data.billingPeriodStart) {
      const existing = await db.select().from(invoicesRentRequests).where(and(eq(invoicesRentRequests.scheduleId, data.scheduleId), eq(invoicesRentRequests.billingPeriodStart, data.billingPeriodStart))).limit(1);
      if (existing[0]) return existing[0];
    }
    const [r] = await db.insert(invoicesRentRequests).values(data).returning(); return r;
  }
  async getInvoiceRentRequest(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [r] = await db.select().from(invoicesRentRequests).where(eq(invoicesRentRequests.id, id)).limit(1); return r;
  }
  async getInvoiceRentRequestByToken(token: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    try {
      const [row] = await db.select().from(invoicesRentRequests).where(eq(invoicesRentRequests.token, token)).limit(1);
      return row;
    } catch (error) {
      if (isNeonEmptyResultError(error)) return undefined;
      throw error;
    }
  }
  async getInvoiceRentRequestByWindcaveSessionId(sessionId: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    try {
      const [row] = await db.select().from(invoicesRentRequests).where(eq(invoicesRentRequests.windcaveSessionId, sessionId)).limit(1);
      return row;
    } catch (error) {
      if (isNeonEmptyResultError(error)) return undefined;
      throw error;
    }
  }
  async atomicClaimSplitShare(invoiceId: string, sessionId: string): Promise<any | null> {
    const db = getDb(); if (!db) return null;
    // Atomic increment + array-append with three guards: session not already counted,
    // paid count not yet at splitCount, and invoice not already settled.
    // Using SQL arithmetic ensures concurrent calls each get a unique slot.
    const [updated] = await db
      .update(invoicesRentRequests)
      .set({
        splitPaidCount: sql`${invoicesRentRequests.splitPaidCount} + 1`,
        splitPaidSessions: sql`array_append(COALESCE(${invoicesRentRequests.splitPaidSessions}, ARRAY[]::text[]), ${sessionId})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoicesRentRequests.id, invoiceId),
          sql`NOT (${sessionId} = ANY(COALESCE(${invoicesRentRequests.splitPaidSessions}, ARRAY[]::text[])))`,
          sql`${invoicesRentRequests.splitPaidCount} < ${invoicesRentRequests.splitCount}`,
          sql`${invoicesRentRequests.status} NOT IN ('paid', 'paid_external', 'voided')`,
        )
      )
      .returning();
    return updated ?? null;
  }
  async getInvoiceRentRequestByWhatsappMessageId(messageId: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [r] = await db.select().from(invoicesRentRequests).where(eq(invoicesRentRequests.whatsappMessageId, messageId)).limit(1); return r;
  }
  async getInvoiceRentRequestsByMerchant(merchantId: number, opts: { status?: string; tenantProfileId?: string } = {}): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    const conds: any[] = [eq(invoicesRentRequests.merchantId, merchantId)];
    if (opts.status) conds.push(eq(invoicesRentRequests.status, opts.status));
    if (opts.tenantProfileId) conds.push(eq(invoicesRentRequests.tenantProfileId, opts.tenantProfileId));
    return db.select().from(invoicesRentRequests).where(and(...conds)).orderBy(desc(invoicesRentRequests.createdAt));
  }
  async updateInvoiceRentRequest(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [r] = await db.update(invoicesRentRequests).set({ ...updates, updatedAt: new Date() }).where(eq(invoicesRentRequests.id, id)).returning(); return r;
  }
  async getPendingDispatchInvoices(): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(invoicesRentRequests).where(eq(invoicesRentRequests.status, "pending_dispatch")).orderBy(invoicesRentRequests.createdAt);
  }
  async getOverdueEligibleInvoices(now: Date): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(invoicesRentRequests).where(and(eq(invoicesRentRequests.status, "dispatched"), lte(invoicesRentRequests.dueAt, now)));
  }
  async getReminderEligibleInvoices(): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    // Overdue, still unpaid — the reminder pass applies the per-merchant timing policy.
    return db.select().from(invoicesRentRequests).where(eq(invoicesRentRequests.status, "overdue")).orderBy(invoicesRentRequests.dueAt);
  }
  async getLiveInvoiceByTenant(tenantProfileId: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    // Most recent unpaid / non-voided invoice for this tenant (the one a "send" should resend).
    const [r] = await db.select().from(invoicesRentRequests)
      .where(and(
        eq(invoicesRentRequests.tenantProfileId, tenantProfileId),
        inArray(invoicesRentRequests.status, ["pending_dispatch", "dispatched", "overdue", "dispatch_failed"]),
      ))
      .orderBy(desc(invoicesRentRequests.createdAt))
      .limit(1);
    return r;
  }
  async logTransactionEvent(data: any): Promise<any> {
    const db = getDb(); if (!db) return {};
    const [r] = await db.insert(transactionEvents).values(data).returning(); return r;
  }
  async getTransactionEventsByTenant(tenantProfileId: string, limit = 100): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(transactionEvents).where(eq(transactionEvents.tenantProfileId, tenantProfileId)).orderBy(desc(transactionEvents.createdAt)).limit(limit);
  }
  async getTransactionEventsByInvoice(invoiceId: string): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(transactionEvents).where(eq(transactionEvents.invoiceId, invoiceId)).orderBy(desc(transactionEvents.createdAt));
  }

  // ───────── Trades: clients ─────────
  async createClientProfile(data: any): Promise<any> {
    const db = getDb(); if (!db) throw new Error('No database');
    const [row] = await db.insert(clientProfiles).values(data).returning();
    return row;
  }
  async getClientProfile(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.select().from(clientProfiles).where(eq(clientProfiles.id, id));
    return row;
  }
  async getClientProfilesByMerchant(merchantId: number): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(clientProfiles)
      .where(eq(clientProfiles.merchantId, merchantId))
      .orderBy(desc(clientProfiles.createdAt));
  }
  async updateClientProfile(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.update(clientProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clientProfiles.id, id)).returning();
    return row;
  }
  async archiveClientProfile(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.update(clientProfiles)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(clientProfiles.id, id)).returning();
    return row;
  }
  async unarchiveClientProfile(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.update(clientProfiles)
      .set({ status: "active", archivedAt: null, updatedAt: new Date() })
      .where(eq(clientProfiles.id, id)).returning();
    return row;
  }

  // ───────── Trades: quotes ─────────
  async createQuote(data: any): Promise<any> {
    const db = getDb(); if (!db) throw new Error('No database');
    const [row] = await db.insert(quotes).values(data).returning();
    return row;
  }
  async getQuote(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
    return row;
  }
  async getQuoteByToken(token: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    try {
      const [row] = await db.select().from(quotes).where(eq(quotes.token, token)).limit(1);
      return row;
    } catch (error) {
      if (isNeonEmptyResultError(error)) return undefined;
      throw error;
    }
  }
  async getQuotesByMerchant(merchantId: number, opts: { status?: string } = {}): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    const conds = [eq(quotes.merchantId, merchantId)];
    if (opts.status) conds.push(eq(quotes.status, opts.status));
    return db.select().from(quotes).where(and(...conds)).orderBy(desc(quotes.createdAt));
  }
  async updateQuote(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.update(quotes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(quotes.id, id)).returning();
    return row;
  }

  // ───────── Trades: job invoices ─────────
  async createJobInvoice(data: any): Promise<any> {
    const db = getDb(); if (!db) throw new Error('No database');
    const [row] = await db.insert(jobInvoices).values(data).returning();
    return row;
  }
  async getJobInvoice(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.select().from(jobInvoices).where(eq(jobInvoices.id, id));
    return row;
  }
  async getJobInvoiceByToken(token: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    try {
      const [row] = await db.select().from(jobInvoices).where(eq(jobInvoices.token, token)).limit(1);
      return row;
    } catch (error) {
      if (isNeonEmptyResultError(error)) return undefined;
      throw error;
    }
  }
  async getJobInvoiceByWindcaveSessionId(sessionId: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    try {
      const [row] = await db.select().from(jobInvoices).where(eq(jobInvoices.windcaveSessionId, sessionId)).limit(1);
      return row;
    } catch (error) {
      if (isNeonEmptyResultError(error)) return undefined;
      throw error;
    }
  }
  async getJobInvoiceByWhatsappMessageId(messageId: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    try {
      const [row] = await db.select().from(jobInvoices).where(eq(jobInvoices.whatsappMessageId, messageId)).limit(1);
      return row;
    } catch (error) {
      if (isNeonEmptyResultError(error)) return undefined;
      throw error;
    }
  }
  async getJobInvoicesByMerchant(merchantId: number, opts: { status?: string; clientProfileId?: string } = {}): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    const conds: any[] = [eq(jobInvoices.merchantId, merchantId)];
    if (opts.status) conds.push(eq(jobInvoices.status, opts.status));
    if (opts.clientProfileId) conds.push(eq(jobInvoices.clientProfileId, opts.clientProfileId));
    return db.select().from(jobInvoices).where(and(...conds)).orderBy(desc(jobInvoices.createdAt));
  }
  async getJobInvoicesByQuote(quoteId: string): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(jobInvoices).where(eq(jobInvoices.quoteId, quoteId)).orderBy(desc(jobInvoices.createdAt));
  }
  async getJobInvoiceByScheduleAndDue(scheduleId: string, dueAt: Date): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    // Ignore voided rows so a cancelled duplicate never blocks regeneration —
    // matches the partial unique index (which also excludes voided).
    const [row] = await db.select().from(jobInvoices)
      .where(and(eq(jobInvoices.scheduleId, scheduleId), eq(jobInvoices.dueAt, dueAt), ne(jobInvoices.status, "voided"))).limit(1);
    return row;
  }
  async updateJobInvoice(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.update(jobInvoices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobInvoices.id, id)).returning();
    return row;
  }
  async atomicClaimJobSplitShare(invoiceId: string, sessionId: string): Promise<any | null> {
    const db = getDb(); if (!db) return null;
    const [updated] = await db.update(jobInvoices)
      .set({
        splitPaidCount: sql`${jobInvoices.splitPaidCount} + 1`,
        splitPaidSessions: sql`array_append(COALESCE(${jobInvoices.splitPaidSessions}, ARRAY[]::text[]), ${sessionId})`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(jobInvoices.id, invoiceId),
        sql`NOT (${sessionId} = ANY(COALESCE(${jobInvoices.splitPaidSessions}, ARRAY[]::text[])))`,
        sql`${jobInvoices.splitPaidCount} < ${jobInvoices.splitCount}`,
        sql`${jobInvoices.status} NOT IN ('paid', 'paid_external', 'voided')`,
      ))
      .returning();
    return updated ?? null;
  }
  async getPendingDispatchJobInvoices(): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(jobInvoices)
      .where(inArray(jobInvoices.status, ["pending_dispatch", "dispatch_failed"]))
      .orderBy(jobInvoices.createdAt);
  }
  async getOverdueEligibleJobInvoices(now: Date): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(jobInvoices)
      .where(and(inArray(jobInvoices.status, ["dispatched", "viewed", "dispatch_failed"]), lte(jobInvoices.dueAt, now)));
  }
  async getReminderEligibleJobInvoices(): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(jobInvoices)
      .where(eq(jobInvoices.status, "balance_due"))
      .orderBy(jobInvoices.dueAt);
  }

  // ───────── Trades: job schedules ─────────
  async createJobSchedule(data: any): Promise<any> {
    const db = getDb(); if (!db) throw new Error('No database');
    const [row] = await db.insert(jobSchedules).values(data).returning();
    return row;
  }
  async getJobSchedule(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.select().from(jobSchedules).where(eq(jobSchedules.id, id));
    return row;
  }
  async getJobSchedulesByMerchant(merchantId: number): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(jobSchedules)
      .where(eq(jobSchedules.merchantId, merchantId))
      .orderBy(desc(jobSchedules.createdAt));
  }
  async getDueJobSchedules(now: Date): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(jobSchedules)
      .where(and(eq(jobSchedules.status, "active"), lte(jobSchedules.nextRunDate, now)));
  }
  async updateJobSchedule(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.update(jobSchedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobSchedules.id, id)).returning();
    return row;
  }
  async terminateJobSchedule(id: string): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.update(jobSchedules)
      .set({ status: "terminated", terminatedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobSchedules.id, id)).returning();
    return row;
  }

  // ───────── Trades: events ─────────
  async createJobEvent(data: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.insert(jobEvents).values(data).returning();
    return row;
  }
  async getJobEventsByClient(clientProfileId: string, limit = 50): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(jobEvents)
      .where(eq(jobEvents.clientProfileId, clientProfileId))
      .orderBy(desc(jobEvents.createdAt)).limit(limit);
  }

}

// ── Storage selection ────────────────────────────────────────────────────────
// In production, a database connection is mandatory. If DATABASE_URL is missing
// or the Neon client could not be initialised, fail fast so the deployment logs
// surface a clear error instead of silently running on in-memory storage where
// every restart would permanently lose all merchant and transaction data.
const _isProduction = process.env.NODE_ENV === 'production';
if (_isProduction && !isDatabaseConnected()) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════╗');
  console.error('║  FATAL: No database connection in production             ║');
  console.error('║                                                          ║');
  console.error('║  DATABASE_URL is not set or the Neon client failed to    ║');
  console.error('║  initialise. TaptPay cannot run in production without a  ║');
  console.error('║  database — merchant and transaction data would be lost  ║');
  console.error('║  on every restart.                                       ║');
  console.error('║                                                          ║');
  console.error('║  Fix: ensure DATABASE_URL is set in your deployment      ║');
  console.error('║  secrets (Replit → Deployments → Secrets).              ║');
  console.error('╚══════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

export const storage: IStorage & { clearAllMerchants?: () => void } = isDatabaseConnected()
  ? new DatabaseStorage()
  : new MemStorage();

// Log the active storage backend so every deployment log makes it obvious
// which backend is in use and confirms data will (or will not) persist.
if (isDatabaseConnected()) {
  const rawUrl = process.env.DATABASE_URL || '';
  // Extract just the host portion — never log credentials.
  const dbHost = rawUrl.replace(/^[^@]*@/, '').split('/')[0] || 'unknown host';
  console.log(`✅ Storage: DatabaseStorage (Neon PostgreSQL @ ${dbHost})`);
} else {
  console.log('⚠️  Storage: MemStorage — data will NOT persist across restarts (dev mode)');
}
