import { users, type User, type UserStatus, merchants, merchantTutorialProgress, transactions, uploadedFiles, merchantSettlements, refunds, splitPayments, paymentAttempts, PAYMENT_RETURN_STATE_MAX_AGE_MS, taptStones, stockItems, merchantSubscriptions, subscriptionBillingHistory, pushSubscriptions, pushNotificationDeliveries, normalizePushNotificationPreferences, DEFAULT_PUSH_NOTIFICATION_PREFERENCES, tenantProfiles, activeSchedules, invoicesRentRequests, transactionEvents, clientProfiles, quotes, jobInvoices, jobSchedules, jobEvents, type Merchant, type MerchantTutorialProgress, type Transaction, type SplitPayment, type PaymentAttempt, type InsertMerchant, type InsertTransaction, type CreateMerchant, type Refund, type InsertRefund, type TaptStone, type InsertTaptStone, type StockItem, type InsertStockItem, type MerchantSubscription, type SubscriptionBillingHistory, type PushSubscription, type PushNotificationPreferences, type PushNotificationEventType } from "@shared/schema";
import { DEFAULT_PLAN_ID, isUpgrade, planFor, planForOrDefault, type PlanId } from "@shared/plans";
import { decideBilling, failedPaymentUpdates, immediatePlanUpdates, MAX_PAYMENT_ATTEMPTS, nextBillingPeriodStart, nextPeriodUpdates, proratedUpgradeCents, queuedPlanUpdates, renewalPlan } from "./subscription-billing";
import { getDb, isDatabaseConnected } from "./database";
import { config } from "./config";
import { nextRunDateAfter } from "./property-schedule";
import { parseInvoiceDocumentRef } from "./upload-policy";
import { eq, ne, desc, asc, and, inArray, notInArray, gt, gte, lte, lt, or, ilike, like, sql, isNull, isNotNull } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { authHandoffCodes, authSessions, authThrottle, invoiceDocumentAccessAudit, invoiceDocumentReadLimits, invoiceSplitSessions, type AuthSession, type InvoiceSplitSession, type NewAuthSession } from "@shared/schema";
import { SESSION_RECLAIM_AFTER_MS } from "./auth-sessions";
import {
  AUTH_THROTTLE_RECLAIM_AFTER_MS, planAuthThrottleTake, settleAuthThrottleRow, uniqueAuthThrottleBuckets,
  type AuthThrottleBucket, type AuthThrottleOutcome, type AuthThrottleRow, type AuthThrottleTake,
} from "./auth-throttle";
import { DOCUMENT_READ_TOKEN_LIMIT, DOCUMENT_READ_WINDOW_MS, documentReadTokenKey } from "./invoice-document-security";
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

// The anonymous business-wide "legacy-no-board" scope was retired on 2026-09-25 with the
// address it served (server/no-board-address.ts): no public caller reads a no-board sale.
/** A split invoice (0030): rent ("property") or trades, by its id. */
export type InvoiceSplitRef = { vertical: "property" | "trades"; invoiceId: string };
/** One provider session opened for a split invoice: the amount it was opened for and its payer's email. */
export type InvoiceSplitSessionInput = InvoiceSplitRef & {
  sessionId: string;
  amountCents: number;
  payerEmail: string | null;
};

export type ActiveTransactionScope =
  | { kind: "merchant-any" }
  | { kind: "board"; stoneId: number };

export type TenantProfileChanges = Partial<Pick<typeof tenantProfiles.$inferInsert,
  "firstName" | "lastName" | "email" | "phone" | "propertyAddress" | "coTenantsText" | "preferredChannel">>;

function tenantProfileChanges(data: TenantProfileChanges): TenantProfileChanges {
  return Object.fromEntries(["firstName", "lastName", "email", "phone", "propertyAddress", "coTenantsText", "preferredChannel"]
    .filter(key => (data as any)[key] !== undefined).map(key => [key, (data as any)[key]]));
}

export type ActiveScheduleInput = Pick<typeof activeSchedules.$inferInsert,
  "amountCents" | "frequency" | "deliveryChannel" | "startDate" | "endDate">;
export type ActiveScheduleChanges = Partial<Pick<typeof activeSchedules.$inferInsert,
  "amountCents" | "frequency" | "deliveryChannel">> & { status?: "active" | "paused" };
export type PropertyScheduleMutationResult =
  | { kind: "ok"; schedule: typeof activeSchedules.$inferSelect }
  | { kind: "not-found" }
  | { kind: "conflict"; reason: "archived" | "terminated" };

export type PropertyInvoiceMutationResult =
  | { kind: "ok"; invoice: typeof invoicesRentRequests.$inferSelect }
  | { kind: "not-found" }
  | { kind: "conflict"; reason: "paid" | "voided" };

export type PropertyInvoiceInput = Pick<typeof invoicesRentRequests.$inferInsert,
  "amountCents" | "deliveryChannel" | "dueAt" | "splitEnabled" | "kind" | "chargeType" | "description" | "documentUrl" | "documentName">;
export type PropertyInvoiceCreationResult =
  | { kind: "ok"; invoice: typeof invoicesRentRequests.$inferSelect; reused: boolean }
  | { kind: "not-found" }
  | { kind: "invalid-document" };
export type PropertyInvoiceDeliverySnapshot = {
  invoice: typeof invoicesRentRequests.$inferSelect;
  tenant: typeof tenantProfiles.$inferSelect;
};
export type PropertyInvoiceDeliveryInput = { channel?: string; messageId?: string };

function propertyInvoiceInput(data: PropertyInvoiceInput): PropertyInvoiceInput {
  return { amountCents: data.amountCents, deliveryChannel: data.deliveryChannel, dueAt: data.dueAt,
    splitEnabled: data.splitEnabled, kind: data.kind === "charge" ? "charge" : "rent",
    chargeType: data.chargeType, description: data.description, documentUrl: data.documentUrl, documentName: data.documentName };
}

export type ClientProfileInput = Pick<typeof clientProfiles.$inferInsert,
  "firstName" | "lastName" | "email" | "phone" | "siteAddress" | "notes" | "preferredChannel"> & { status?: "active" | "prospect" };
export type ClientProfileChanges = Partial<Omit<ClientProfileInput, "status">>;
export type ClientProfilePromotionResult =
  | { kind: "ok"; client: typeof clientProfiles.$inferSelect }
  | { kind: "not-found" }
  | { kind: "conflict" };

function clientProfileChanges(data: ClientProfileChanges): ClientProfileChanges {
  return Object.fromEntries(["firstName", "lastName", "email", "phone", "siteAddress", "notes", "preferredChannel"]
    .filter(key => (data as any)[key] !== undefined).map(key => [key, (data as any)[key]]));
}

export type JobInvoiceMutationResult =
  | { kind: "ok"; invoice: typeof jobInvoices.$inferSelect }
  | { kind: "not-found" }
  | { kind: "conflict"; reason: "paid" | "voided" | "deposit" | "unpaid" };
export type TradesQuoteDeliverySnapshot = {
  quote: typeof quotes.$inferSelect;
  client: typeof clientProfiles.$inferSelect;
};
export type TradesInvoiceDeliverySnapshot = {
  invoice: typeof jobInvoices.$inferSelect;
  client: typeof clientProfiles.$inferSelect;
};
export type TradesReceiptRecord = { sent: boolean; reference: string };

/** The business's own saved client, or the hidden prospect a quote or quick invoice is made with. */
export type TradesClientRef = { clientProfileId: string } | { prospect: ClientProfileChanges };
export type QuoteInput = Pick<typeof quotes.$inferInsert,
  "lineItems" | "subtotalCents" | "gstCents" | "gstMode" | "totalCents" | "depositEnabled" | "depositType" | "depositValue" | "depositCents"
  | "deliveryChannel" | "validUntil" | "notes" | "documentUrl" | "documentName">;
export type QuoteCreationResult =
  | { kind: "ok"; quote: typeof quotes.$inferSelect; client: typeof clientProfiles.$inferSelect }
  | { kind: "not-found" }
  | { kind: "invalid-document" };
export type JobInvoiceInput = Pick<typeof jobInvoices.$inferInsert,
  "kind" | "amountCents" | "deliveryChannel" | "jobDetails" | "dueAt" | "scheduledSendAt" | "splitEnabled" | "documentUrl" | "documentName" | "quoteId">;
export type JobInvoiceCreationResult =
  | { kind: "ok"; invoice: typeof jobInvoices.$inferSelect; client: typeof clientProfiles.$inferSelect }
  | { kind: "not-found" }
  | { kind: "quote-not-found" }
  | { kind: "invalid-document" };
export type JobBalanceCreationResult =
  | { kind: "ok"; invoice: typeof jobInvoices.$inferSelect }
  | { kind: "not-found" }
  | { kind: "conflict"; reason: "not-deposit" | "unpaid" | "no-quote" | "quote-not-found" | "exists" | "none-remaining" };
export type TradesQuoteDeliveryRecord = { sent: boolean; channel?: string; reason?: string };
export type TradesInvoiceDeliveryRecord = { channel?: string; messageId?: string };

function quoteInput(data: QuoteInput): QuoteInput {
  return { lineItems: data.lineItems, subtotalCents: data.subtotalCents, gstCents: data.gstCents, gstMode: data.gstMode, totalCents: data.totalCents,
    depositEnabled: data.depositEnabled, depositType: data.depositType, depositValue: data.depositValue, depositCents: data.depositCents,
    deliveryChannel: data.deliveryChannel, validUntil: data.validUntil, notes: data.notes, documentUrl: data.documentUrl, documentName: data.documentName };
}

// A balance is made by its own contract and a recurring invoice by the cron: this create takes a deposit or a full invoice.
function jobInvoiceInput(data: JobInvoiceInput): JobInvoiceInput {
  return { kind: data.kind === "deposit" ? "deposit" : "full", amountCents: data.amountCents, deliveryChannel: data.deliveryChannel,
    jobDetails: data.jobDetails ?? null, dueAt: data.dueAt, scheduledSendAt: data.scheduledSendAt ?? null, splitEnabled: !!data.splitEnabled,
    documentUrl: data.documentUrl ?? null, documentName: data.documentName ?? null, quoteId: data.quoteId ?? null };
}

function activeScheduleChanges(data: ActiveScheduleChanges): ActiveScheduleChanges {
  const patch = Object.fromEntries(["amountCents", "frequency", "deliveryChannel"]
    .filter(key => (data as any)[key] !== undefined).map(key => [key, (data as any)[key]]));
  if (data.status === "active" || data.status === "paused") patch.status = data.status;
  return patch;
}

export type MerchantRefundInput = Pick<InsertRefund, "refundAmount" | "refundReason" | "refundMethod">;

function scopedRefundInput(transactionId: number, merchantId: number, input: MerchantRefundInput): InsertRefund {
  return { transactionId, merchantId, refundAmount: input.refundAmount,
    refundReason: input.refundReason, refundMethod: input.refundMethod, status: "pending" };
}

export class TransactionCreationScopeError extends Error {
  constructor() { super("Selected payment board is unavailable"); this.name = "TransactionCreationScopeError"; }
}

function scopedTransactionInput(merchantId: number, input: TransactionStorageInput): TransactionStorageInput {
  const { id: _id, createdAt: _createdAt, ...data } = sanitizeTransactionStorageInput(input) as TransactionStorageInput & { id?: unknown; createdAt?: unknown };
  return { ...data, merchantId };
}

export type TransactionCancellationResult =
  | { kind: "cancelled"; transaction: Transaction }
  | { kind: "not-found" }
  | { kind: "conflict"; status: string };

export class PushSessionEndedError extends Error {
  constructor() { super("The session registering this device has ended"); }
}

export type PushSubscriptionInput = {
  /** Captured by authentication; checked under the users-row lock before activation. */
  sessionVersion?: number;
  merchantId: number;
  /** R1-T4 (0029): the login registering this device; null only for rows from before. */
  userId: number | null;
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

/** Management may change these fields, never the stock item's identity or business. */
export type StockItemChanges = Partial<Pick<InsertStockItem, "name" | "description" | "cost" | "emoji" | "variations">>;

function isManagementTenantId(merchantId: number): boolean {
  // merchants.id and these foreign keys are PostgreSQL serial/integer, not bigint.
  return isTenantId(merchantId) && merchantId <= 2_147_483_647;
}

function stockItemChanges(data: StockItemChanges): StockItemChanges {
  // Runtime projection as well as a narrow type: preserve omitted fields and explicit nulls.
  return {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.cost !== undefined ? { cost: data.cost } : {}),
    ...(data.emoji !== undefined ? { emoji: data.emoji } : {}),
    ...(data.variations !== undefined ? { variations: data.variations } : {}),
  };
}

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
  /** Global read for reviewed public-resource, provider and validated-admin operations. */
  getTransaction(id: number): Promise<Transaction | undefined>;
  getTransactionForMerchant(id: number, merchantId: number): Promise<Transaction | undefined>;
  /** Recheck tenant and pending/processing state at the write boundary. */
  cancelTransactionForMerchant(id: number, merchantId: number): Promise<TransactionCancellationResult>;
  getTransactionByPaymentTokenHash(paymentTokenHash: string): Promise<Transaction | undefined>;
  /**
   * Find the merchant's newest active transaction within an explicit scope: a
   * board's customer page uses `board`; the business's own signed-in terminal,
   * which sees every board and every sale with its own link, uses
   * `merchant-any`. Newest pending/processing first, else a completion within
   * the last 3 minutes (so a terminal sees pending turn to completed).
   */
  getActiveTransactionByMerchant(merchantId: number, scope: ActiveTransactionScope): Promise<Transaction | undefined>;
  getTransactionByNfcSession(nfcSessionId: string): Promise<Transaction | undefined>;
  createTransaction(transaction: TransactionStorageInput): Promise<Transaction>;
  createTransactionForMerchant(merchantId: number, transaction: TransactionStorageInput): Promise<Transaction>;
  updateTransactionStatusForMerchant(id: number, merchantId: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined>;
  updateTransactionPaymentMethodForMerchant(id: number, merchantId: number, paymentMethod: string): Promise<Transaction | undefined>;
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
  getRefundsForTransactionForMerchant(transactionId: number, merchantId: number): Promise<Refund[]>;
  getRefundsByMerchant(merchantId: number): Promise<Refund[]>;
  createRefundForMerchant(transactionId: number, merchantId: number, data: MerchantRefundInput): Promise<Refund | undefined>;
  updateRefundStatusForMerchant(id: number, merchantId: number, status: "failed" | "completed", windcaveRefundId?: string): Promise<Refund | undefined>;
  /** Legacy balance reservation; R4 must add durable operation/idempotency before enablement. */
  reserveRefundAmountForMerchant(id: number, merchantId: number, refundAmount: number): Promise<Transaction | null>;
  releaseRefundAmountForMerchant(id: number, merchantId: number, refundAmount: number): Promise<boolean>;

  // Tapt Stone operations
  createTaptStone(data: InsertTaptStone): Promise<TaptStone>;
  createNextTaptStone(merchantId: number, name?: string): Promise<TaptStone>;
  /** Public board/payment resolution; management uses the tenant-required read below. */
  getTaptStone(id: number): Promise<TaptStone | undefined>;
  getTaptStoneForMerchant(id: number, merchantId: number): Promise<TaptStone | undefined>;
  getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]>;
  updateTaptStoneForMerchant(id: number, merchantId: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined>;
  updateTaptStoneUrlsForMerchant(id: number, merchantId: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined>;
  deleteTaptStoneForMerchant(id: number, merchantId: number): Promise<boolean>;
  
  // Stock Item operations
  createStockItem(data: InsertStockItem): Promise<StockItem>;
  getStockItemForMerchant(id: number, merchantId: number): Promise<StockItem | undefined>;
  getStockItemsByMerchant(merchantId: number): Promise<StockItem[]>;
  updateStockItemForMerchant(id: number, merchantId: number, data: StockItemChanges): Promise<StockItem | undefined>;
  deleteStockItemForMerchant(id: number, merchantId: number): Promise<boolean>;
  
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
  /** Sets a login's password and ends every session issued before it (advances session_version). */
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
  /** One login's active devices (owner decision 2026-09-26: each login its own notifications). */
  getPushSubscriptionsForLogin(merchantId: number, userId: number): Promise<PushSubscription[]>;
  /**
   * One login's switches, from its newest subscription (the defaults if it has none); `null`
   * reads the business's unattributed subscriptions from before 0029.
   */
  getPushNotificationPreferences(merchantId: number, userId: number | null): Promise<PushNotificationPreferences>;
  /** Sets one login's switches on each of its subscriptions, and no other login's. */
  updatePushNotificationPreferences(
    merchantId: number,
    userId: number | null,
    preferences: PushNotificationPreferences,
  ): Promise<PushNotificationPreferences>;
  deactivatePushSubscription(id: number): Promise<void>;
  deactivatePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
  /**
   * R1-T4: that login's sessions ended — stop its devices, and the merchant's
   * unattributed subscriptions from before 0029, which cannot be shown to be
   * anyone else's.
   */
  deactivatePushSubscriptionsForLogin(merchantId: number, userId: number): Promise<void>;
  /** R1-T4: that login's iPhones, and the merchant's unattributed ones (no device token known). */
  deactivateNativePushSubscriptionsForLogin(merchantId: number, userId: number): Promise<void>;
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
  createTenantProfileForMerchant(merchantId: number, data: TenantProfileChanges): Promise<any>;
  getTenantProfileForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  updateTenantProfileForMerchant(id: string, merchantId: number, updates: TenantProfileChanges): Promise<any | undefined>;
  archiveTenantProfileForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  unarchiveTenantProfileForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  getTransactionEventsByTenantForMerchant(tenantProfileId: string, merchantId: number, limit?: number): Promise<any[]>;
  getTenantProfile(id: string): Promise<any | undefined>;
  getTenantProfilesByMerchant(merchantId: number, opts?: { search?: string; includeArchived?: boolean }): Promise<any[]>;

  createActiveScheduleForMerchant(tenantProfileId: string, merchantId: number, data: ActiveScheduleInput): Promise<PropertyScheduleMutationResult>;
  getActiveScheduleForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  updateActiveScheduleForMerchant(id: string, merchantId: number, updates: ActiveScheduleChanges): Promise<PropertyScheduleMutationResult>;
  terminateActiveScheduleForMerchant(id: string, merchantId: number): Promise<PropertyScheduleMutationResult>;
  /** Public invoice checkout only; authenticated schedule management uses explicit scope. */
  getActiveSchedule(id: string): Promise<any | undefined>;
  getActiveSchedulesByMerchant(merchantId: number): Promise<any[]>;
  /** Internal cron date advance; not an authenticated management mutation. */
  updateActiveSchedule(id: string, updates: any): Promise<any | undefined>;
  getDueActiveSchedules(now: Date): Promise<any[]>;

  getInvoiceRentRequestForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  voidInvoiceRentRequestForMerchant(id: string, merchantId: number): Promise<PropertyInvoiceMutationResult>;
  markInvoiceRentRequestPaidExternalForMerchant(id: string, merchantId: number, externalPaymentReference?: string): Promise<PropertyInvoiceMutationResult>;
  createOrReuseInvoiceRentRequestForMerchant(tenantProfileId: string, merchantId: number, data: PropertyInvoiceInput): Promise<PropertyInvoiceCreationResult>;
  getInvoiceRentRequestDeliveryForMerchant(id: string, merchantId: number): Promise<PropertyInvoiceDeliverySnapshot | undefined>;
  recordInvoiceRentRequestDeliveryForMerchant(id: string, merchantId: number, tenantProfileId: string, data: PropertyInvoiceDeliveryInput): Promise<PropertyInvoiceMutationResult>;
  /** Internal recurring generation only; authenticated creation uses explicit scope. */
  createInvoiceRentRequest(data: any): Promise<any>;
  /** Provider, cron and public-checkout lane; authenticated management uses explicit scope. */
  getInvoiceRentRequest(id: string): Promise<any | undefined>;
  getInvoiceRentRequestByToken(token: string): Promise<any | undefined>;
  getInvoiceRentRequestByWindcaveSessionId(sessionId: string): Promise<any | undefined>;
  getInvoiceRentRequestsByMerchant(merchantId: number, opts?: { status?: string; tenantProfileId?: string }): Promise<any[]>;
  /** Provider, cron and public-checkout lane; never authenticated invoice management. */
  updateInvoiceRentRequest(id: string, updates: any): Promise<any | undefined>;
  atomicClaimSplitShare(invoiceId: string, sessionId: string): Promise<any | null>;
  /**
   * Split invoices (0030; owner decision 2026-09-26): each provider session opened for one,
   * and the one share it paid. A split share is paid only by a session recorded here.
   */
  recordInvoiceSplitSession(input: InvoiceSplitSessionInput): Promise<void>;
  getInvoiceSplitSession(sessionId: string): Promise<InvoiceSplitSession | undefined>;
  invoiceHasSplitSessions(invoice: InvoiceSplitRef): Promise<boolean>;
  markInvoiceSplitSessionPaid(sessionId: string, paidAt: Date): Promise<void>;
  getPaidInvoiceSplitPayerEmails(invoice: InvoiceSplitRef): Promise<string[]>;
  getInvoiceRentRequestByWhatsappMessageId(messageId: string): Promise<any | undefined>;
  getPendingDispatchInvoices(): Promise<any[]>;
  getOverdueEligibleInvoices(now: Date): Promise<any[]>;
  getReminderEligibleInvoices(): Promise<any[]>;

  logTransactionEvent(data: any): Promise<any>;
  getTransactionEventsByTenant(tenantProfileId: string, limit?: number): Promise<any[]>;
  getTransactionEventsByInvoice(invoiceId: string): Promise<any[]>;

  // ── Trades vertical ───────────────────────────────────────────────────────
  createClientProfileForMerchant(merchantId: number, data: ClientProfileInput): Promise<any>;
  getClientProfileForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  updateClientProfileForMerchant(id: string, merchantId: number, updates: ClientProfileChanges): Promise<any | undefined>;
  archiveClientProfileForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  unarchiveClientProfileForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  promoteClientProfileForMerchant(id: string, merchantId: number): Promise<ClientProfilePromotionResult>;
  getJobEventsByClientForMerchant(clientProfileId: string, merchantId: number, limit?: number): Promise<any[]>;
  /** Public/provider/delivery lane; authenticated client management uses explicit scope. */
  getClientProfile(id: string): Promise<any | undefined>;
  getClientProfilesByMerchant(merchantId: number): Promise<any[]>;

  createQuoteForMerchant(merchantId: number, client: TradesClientRef, data: QuoteInput): Promise<QuoteCreationResult>;
  recordQuoteDeliveryForMerchant(id: string, merchantId: number, clientProfileId: string, record: TradesQuoteDeliveryRecord): Promise<boolean>;
  /** Checkout lane; signed-in reads use explicit scope. */
  getQuote(id: string): Promise<any | undefined>;
  getQuoteByToken(token: string): Promise<any | undefined>;
  getQuotesByMerchant(merchantId: number, opts?: { status?: string }): Promise<any[]>;
  getQuoteDeliveryForMerchant(id: string, merchantId: number): Promise<TradesQuoteDeliverySnapshot | undefined>;
  updateQuote(id: string, updates: any): Promise<any | undefined>;

  getJobInvoiceForMerchant(id: string, merchantId: number): Promise<any | undefined>;
  getJobInvoiceDeliveryForMerchant(id: string, merchantId: number): Promise<TradesInvoiceDeliverySnapshot | undefined>;
  voidJobInvoiceForMerchant(id: string, merchantId: number): Promise<JobInvoiceMutationResult>;
  markJobInvoicePaidExternalForMerchant(id: string, merchantId: number, externalPaymentReference?: string): Promise<JobInvoiceMutationResult>;
  completeJobInvoiceForMerchant(id: string, merchantId: number): Promise<JobInvoiceMutationResult>;
  recordJobInvoiceReceiptForMerchant(id: string, merchantId: number, clientProfileId: string, receipt: TradesReceiptRecord): Promise<boolean>;
  createJobInvoiceForMerchant(merchantId: number, client: TradesClientRef, data: JobInvoiceInput): Promise<JobInvoiceCreationResult>;
  createJobBalanceInvoiceForMerchant(depositInvoiceId: string, merchantId: number, splitEnabled: boolean): Promise<JobBalanceCreationResult>;
  recordJobInvoiceDeliveryForMerchant(id: string, merchantId: number, clientProfileId: string, record: TradesInvoiceDeliveryRecord): Promise<JobInvoiceMutationResult>;
  /** The public quote acceptance and the cron's generate pass; a signed-in create uses explicit scope. */
  createJobInvoice(data: any): Promise<any>;
  /** Checkout, provider, WhatsApp status, cron and delivery lanes; signed-in management uses explicit scope. */
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

  // Uploaded file blobs (logos, invoice attachments), keyed by their
  // /uploads/<path> — R1-T7: routes.ts used to query the uploaded_files table
  // directly via `db`, which is always null in MemStorage/no-database mode.
  //
  // Gap 13 (plan §8.5): every write is stamped with its owning merchant and every
  // read/delete that serves or removes a tenant's file is scoped to one. A
  // NULL-tenant row (predates migration 0023 and could not be attributed) is
  // matched by no merchant scope, so no tenant-scoped route ever serves it.
  //
  // Rejects — without touching the existing row — when `relPath` already belongs
  // to a different merchant. The owner may overwrite their own path (a logo
  // re-upload relies on this).
  saveUploadedFile(relPath: string, mimeType: string, data: Buffer, merchantId: number): Promise<void>;
  // UNSCOPED — it ignores the tenant, so its callers carry the authorization.
  // There are exactly two: the public logo route (authorized by folder,
  // PUBLIC_UPLOAD_FOLDERS in upload-policy.ts) and the platform-admin branch of
  // GET /api/invoice-documents/:name (authorized by the validated admin
  // principal, and audited). Do not use it to serve anything else.
  getUploadedFile(relPath: string): Promise<{ mimeType: string; data: Buffer } | undefined>;
  getUploadedFileForMerchant(relPath: string, merchantId: number): Promise<{ mimeType: string; data: Buffer } | undefined>;
  // Metadata-only existence + ownership check (never reads the blob), for the
  // attach-time and checkout-resolve validations.
  uploadedFileOwnedByMerchant(relPath: string, merchantId: number): Promise<boolean>;
  deleteUploadedFile(relPath: string, merchantId: number): Promise<void>;
  recordInvoiceDocumentAdminRead(adminUserId: number, documentName: string): Promise<void>;
  consumeInvoiceDocumentReadLimit(token: string): Promise<boolean>;
  /** R1-T4: keep a Google sign-in handoff code — its hash only — and reclaim long-expired ones. */
  createAuthHandoffCode(input: { codeHash: string; userId: number; newUser: boolean; expiresAt: Date }): Promise<void>;
  /** R1-T4: redeem a handoff code exactly once; undefined when unknown, already used or expired. */
  consumeAuthHandoffCode(codeHash: string, now: Date): Promise<{ userId: number; newUser: boolean } | undefined>;
  /** R1-T4 phase D: end every session of one login; false when there is no such login. */
  advanceUserSessionVersion(userId: number): Promise<boolean>;
  /**
   * R1-T4 phase C: count one attempt against every bucket — or, when any bucket is
   * still waiting, count nothing and say how long. All-or-nothing, and atomic across
   * app instances: a burst of attempts gets exactly the allowance.
   */
  takeAuthThrottleSlot(buckets: readonly AuthThrottleBucket[], now: Date): Promise<AuthThrottleTake>;
  /** R1-T4 phase C: after an attempt was let through — see AuthThrottleOutcome. */
  settleAuthThrottle(buckets: readonly AuthThrottleBucket[], outcome: AuthThrottleOutcome, now: Date): Promise<void>;
  /** R1-T4 phase C: forget buckets outright — these keys, and every key starting with a prefix. */
  forgetAuthThrottle(keys: readonly string[], keyPrefixes: readonly string[]): Promise<void>;
  /**
   * R1-T4 phase E: keep a new sign-in session (secret digests only), reclaiming rows that could last
   * have been used more than 30 days ago (SESSION_RECLAIM_AFTER_MS) on the way in.
   */
  createAuthSession(session: NewAuthSession, now: Date): Promise<void>;
  /** R1-T4 phase E: one session by its id, ended or not; undefined when there is none. */
  getAuthSession(id: string): Promise<AuthSession | undefined>;
  /**
   * R1-T4 phase E: the daily swap offers a new secret, only while the session has not been ended, its
   * current secret became current at or before `rotateBefore`, and no offer is newer than
   * `reofferBefore`. One statement: of two concurrent offers exactly one is made. False when none was.
   */
  offerAuthSessionSecret(
    id: string,
    offer: { secretHash: string; now: Date; rotateBefore: Date; reofferBefore: Date },
  ): Promise<boolean>;
  /**
   * R1-T4 phase E: the offered secret was used, so it becomes current and the one it replaces is
   * accepted until `previousValidUntil`. False when the offer is no longer this one or the session ended.
   */
  promoteAuthSessionSecret(
    id: string,
    promotion: { offeredSecretHash: string; now: Date; previousValidUntil: Date },
  ): Promise<boolean>;
  /** R1-T4 phase E: record a use at `now` (only ever forward) with its new idle expiry. */
  touchAuthSession(id: string, now: Date, idleExpiresAt: Date): Promise<void>;
  /** R1-T4 phase E: end one session, with why; false when it had already been ended. */
  revokeAuthSession(id: string, reason: string, now: Date): Promise<boolean>;
  /** R1-T4 phase E: end every live session of one login, except `keepId`; how many were ended. */
  revokeAuthSessionsForLogin(userId: number, reason: string, now: Date, keepId?: string): Promise<number>;
}

// A tenant id that can match a real merchant. 0 is the platform admin's
// principal id and must never match a tenant; NaN/fractions are never valid.
function isTenantId(merchantId: number): boolean {
  return Number.isInteger(merchantId) && merchantId > 0;
}

export class UploadPathOwnershipError extends Error {
  constructor() {
    super("Upload path is owned by another merchant");
    this.name = "UploadPathOwnershipError";
  }
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
  private uploadedFileBlobs: Map<string, { mimeType: string; data: Buffer; merchantId: number }>;
  private documentReadLimits = new Map<string, { count: number; expiresAt: number }>();
  private authHandoffCodes = new Map<string, { userId: number; newUser: boolean; expiresAt: Date; consumedAt: Date | null }>();
  private authThrottleRows = new Map<string, AuthThrottleRow>();
  private invoiceSplitSessionRows = new Map<string, InvoiceSplitSession>();
  private authSessionRows = new Map<string, AuthSession>();
  private documentAccessAudit: Array<{ adminUserId: number; documentName: string }> = [];

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
    this.uploadedFileBlobs = new Map();
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
      sessionVersion: current?.sessionVersion ?? 0,
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
      // R0-T5: never accept a merchant-supplied Windcave credential through this path.
      windcaveApiKey: null,
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

  async getTransactionForMerchant(id: number, merchantId: number): Promise<Transaction | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const row = this.transactions.get(id);
    return row?.merchantId === merchantId ? row : undefined;
  }

  async cancelTransactionForMerchant(id: number, merchantId: number): Promise<TransactionCancellationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    // No await between checking and replacing: the memory mutation is atomic.
    const row = this.transactions.get(id);
    if (!row || row.merchantId !== merchantId) return { kind: "not-found" };
    if (row.status !== "pending" && row.status !== "processing") {
      return { kind: "conflict", status: row.status };
    }
    const transaction = { ...row, status: "cancelled" };
    this.transactions.set(id, transaction);
    return { kind: "cancelled", transaction };
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

  async createTransactionForMerchant(merchantId: number, input: TransactionStorageInput): Promise<Transaction> {
    if (!isManagementTenantId(merchantId)) throw new TransactionCreationScopeError();
    const data = scopedTransactionInput(merchantId, input);
    if (data.taptStoneId != null) {
      const board = this.taptStones.get(data.taptStoneId);
      if (!board || board.merchantId !== merchantId || !board.isActive) throw new TransactionCreationScopeError();
    }
    // Existing memory constructor inserts synchronously, with no await/yield after the board check.
    return this.createTransaction(data);
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

  async getRefundsForTransactionForMerchant(transactionId: number, merchantId: number): Promise<Refund[]> {
    if (!isManagementTenantId(merchantId)) return [];
    if (this.transactions.get(transactionId)?.merchantId !== merchantId) return [];
    return Array.from(this.refunds.values()).filter(
      (refund) => refund.transactionId === transactionId && refund.merchantId === merchantId
    );
  }

  async getRefundsByMerchant(merchantId: number): Promise<Refund[]> {
    return Array.from(this.refunds.values()).filter(
      (refund) => refund.merchantId === merchantId
    );
  }

  async createRefundForMerchant(transactionId: number, merchantId: number, data: MerchantRefundInput): Promise<Refund | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    if (this.transactions.get(transactionId)?.merchantId !== merchantId) return undefined;
    // createRefund mutates synchronously; no yield separates ownership check and insert.
    return this.createRefund(scopedRefundInput(transactionId, merchantId, data));
  }

  async updateRefundStatusForMerchant(id: number, merchantId: number, status: "failed" | "completed", windcaveRefundId?: string): Promise<Refund | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const refund = this.refunds.get(id);
    if (!refund || refund.merchantId !== merchantId || refund.transactionId === null
      || this.transactions.get(refund.transactionId)?.merchantId !== merchantId) return undefined;
    const updated = { ...refund, status, windcaveRefundId: windcaveRefundId || refund.windcaveRefundId,
      completedAt: status === "completed" ? new Date() : refund.completedAt };
    this.refunds.set(id, updated);
    return updated;
  }

  async reserveRefundAmountForMerchant(id: number, merchantId: number, refundAmount: number): Promise<Transaction | null> {
    if (!isManagementTenantId(merchantId)) return null;
    const transaction = this.transactions.get(id);
    if (!transaction || transaction.merchantId !== merchantId) return null;
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

  async releaseRefundAmountForMerchant(id: number, merchantId: number, refundAmount: number): Promise<boolean> {
    if (!isManagementTenantId(merchantId)) return false;
    const transaction = this.transactions.get(id);
    if (!transaction || transaction.merchantId !== merchantId) return false;
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
    return true;
  }

  async updateTransactionStatusForMerchant(id: number, merchantId: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const transaction = this.transactions.get(id);
    if (!transaction || transaction.merchantId !== merchantId) return undefined;
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

  async updateTransactionPaymentMethodForMerchant(id: number, merchantId: number, paymentMethod: string): Promise<Transaction | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const transaction = this.transactions.get(id);
    if (!transaction || transaction.merchantId !== merchantId) return undefined;
    const updated = { ...transaction, paymentMethod };
    this.transactions.set(id, updated);
    return updated;
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

    // R0-T5: no general update path may write a Windcave credential. R5 owns
    // historical values through its own reviewed path, not this one.
    const { windcaveApiKey: _rejectedWindcaveApiKey, ...safeUpdates } = updates;
    const updatedMerchant = {
      ...merchant,
      ...safeUpdates,
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
    // Match the upload FK: reject before deleting any child records.
    if ([...this.uploadedFileBlobs.values()].some((file) => file.merchantId === id)) return false;

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

  /**
   * Full reset for test isolation between cases. Mirrors the constructor
   * field-for-field — previously cleared only merchants/transactions while
   * leaving users, subscriptions and every lock map live, so a merchant
   * created after a reset could collide with a previous test's leftover
   * team members or subscription state once currentMerchantId wrapped back
   * to a reused id (found via R1-T3's role-gate tests: seat-limit errors on
   * a supposedly fresh merchant).
   */
  clearAllMerchants() {
    this.merchants.clear();
    this.transactions.clear();
    this.refunds.clear();
    this.splitPayments.clear();
    this.paymentAttempts.clear();
    this.merchantTransactionCounts.clear();
    this.taptStones.clear();
    this.stockItems.clear();
    this.users.clear();
    this.subscriptions.clear();
    this.subscriptionHistory.clear();
    this.pushSubs = [];
    this.pushDeliveryClaims.clear();
    this.tutorialProgress.clear();
    this.currentMerchantId = 1;
    this.currentTransactionId = 1;
    this.currentRefundId = 1;
    this.currentSplitPaymentId = 1;
    this.currentTaptStoneId = 1;
    this.currentStockItemId = 1;
    this.currentUserId = 1;
    this.currentSubscriptionId = 1;
    this.currentSubscriptionHistoryId = 1;
    this.taptStoneCreationLocks.clear();
    this.paymentAttemptLocks.clear();
    this.billSplitLocks.clear();
    this.accountMutationLocks.clear();
    this.uploadedFileBlobs.clear();
    this.documentReadLimits.clear();
    this.authThrottleRows.clear();
    this.invoiceSplitSessionRows.clear();
    this.authSessionRows.clear();
    this.documentAccessAudit = [];
    console.log("All merchants and transactions cleared from memory");
  }

  async saveUploadedFile(relPath: string, mimeType: string, data: Buffer, merchantId: number): Promise<void> {
    if (!isTenantId(merchantId)) throw new Error("A valid merchantId is required to save an upload");
    const existing = this.uploadedFileBlobs.get(relPath);
    if (existing && existing.merchantId !== merchantId) throw new UploadPathOwnershipError();
    this.uploadedFileBlobs.set(relPath, { mimeType, data, merchantId });
  }

  async getUploadedFile(relPath: string): Promise<{ mimeType: string; data: Buffer } | undefined> {
    const file = this.uploadedFileBlobs.get(relPath);
    return file ? { mimeType: file.mimeType, data: file.data } : undefined;
  }

  async getUploadedFileForMerchant(relPath: string, merchantId: number): Promise<{ mimeType: string; data: Buffer } | undefined> {
    if (!isTenantId(merchantId)) return undefined;
    const file = this.uploadedFileBlobs.get(relPath);
    return file && file.merchantId === merchantId ? { mimeType: file.mimeType, data: file.data } : undefined;
  }

  async uploadedFileOwnedByMerchant(relPath: string, merchantId: number): Promise<boolean> {
    if (!isTenantId(merchantId)) return false;
    return this.uploadedFileBlobs.get(relPath)?.merchantId === merchantId;
  }

  async deleteUploadedFile(relPath: string, merchantId: number): Promise<void> {
    if (!isTenantId(merchantId)) return;
    if (this.uploadedFileBlobs.get(relPath)?.merchantId === merchantId) this.uploadedFileBlobs.delete(relPath);
  }

  async recordInvoiceDocumentAdminRead(adminUserId: number, documentName: string): Promise<void> {
    this.documentAccessAudit.push({ adminUserId, documentName });
  }

  async createAuthHandoffCode(input: { codeHash: string; userId: number; newUser: boolean; expiresAt: Date }): Promise<void> {
    const dayAgo = Date.now() - 86_400_000;
    for (const [key, row] of this.authHandoffCodes) {
      if (row.expiresAt.getTime() < dayAgo) this.authHandoffCodes.delete(key);
    }
    if (this.authHandoffCodes.has(input.codeHash)) throw new Error("handoff code already exists");
    this.authHandoffCodes.set(input.codeHash, {
      userId: input.userId, newUser: input.newUser, expiresAt: input.expiresAt, consumedAt: null,
    });
  }

  async consumeAuthHandoffCode(codeHash: string, now: Date): Promise<{ userId: number; newUser: boolean } | undefined> {
    const row = this.authHandoffCodes.get(codeHash);
    if (!row || row.consumedAt || row.expiresAt.getTime() <= now.getTime()) return undefined;
    row.consumedAt = now;
    return { userId: row.userId, newUser: row.newUser };
  }

  async advanceUserSessionVersion(userId: number): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    return true;
  }

  // No await between reading and writing the rows: each call is atomic here.
  async takeAuthThrottleSlot(buckets: readonly AuthThrottleBucket[], now: Date): Promise<AuthThrottleTake> {
    const cutoff = now.getTime() - AUTH_THROTTLE_RECLAIM_AFTER_MS;
    for (const [key, row] of this.authThrottleRows) {
      if (row.updatedAt.getTime() < cutoff) this.authThrottleRows.delete(key);
    }
    const unique = uniqueAuthThrottleBuckets(buckets);
    const rows = unique.flatMap((bucket) => this.authThrottleRows.get(bucket.key) ?? []);
    const plan = planAuthThrottleTake(unique, rows, now);
    if (!plan.allowed) return plan;
    for (const row of plan.charged) this.authThrottleRows.set(row.bucketKey, row);
    return { allowed: true };
  }

  async settleAuthThrottle(buckets: readonly AuthThrottleBucket[], outcome: AuthThrottleOutcome, now: Date): Promise<void> {
    for (const bucket of uniqueAuthThrottleBuckets(buckets)) {
      const row = this.authThrottleRows.get(bucket.key);
      if (row) this.authThrottleRows.set(bucket.key, settleAuthThrottleRow(row, outcome, now));
    }
  }

  async forgetAuthThrottle(keys: readonly string[], keyPrefixes: readonly string[]): Promise<void> {
    for (const key of Array.from(this.authThrottleRows.keys())) {
      if (keys.includes(key) || keyPrefixes.some((prefix) => key.startsWith(prefix))) this.authThrottleRows.delete(key);
    }
  }

  // R1-T4 phase E. No await between reading and writing a row: each call is atomic here, as the
  // database's single conditional statements are.
  async createAuthSession(session: NewAuthSession, now: Date): Promise<void> {
    const cutoff = now.getTime() - SESSION_RECLAIM_AFTER_MS;
    for (const [id, row] of this.authSessionRows) {
      if (row.absoluteExpiresAt.getTime() < cutoff) this.authSessionRows.delete(id);
    }
    if (this.authSessionRows.has(session.id)) throw new Error("auth session already exists");
    this.authSessionRows.set(session.id, {
      id: session.id,
      principal: session.principal,
      userId: session.userId ?? null,
      sessionVersion: session.sessionVersion ?? null,
      adminTag: session.adminTag ?? null,
      secretHash: session.secretHash,
      offeredSecretHash: session.offeredSecretHash ?? null,
      offeredAt: session.offeredAt ?? null,
      previousSecretHash: session.previousSecretHash ?? null,
      previousValidUntil: session.previousValidUntil ?? null,
      deviceLabel: session.deviceLabel ?? null,
      createdAt: session.createdAt ?? now,
      lastUsedAt: session.lastUsedAt,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      rotatedAt: session.rotatedAt,
      revokedAt: session.revokedAt ?? null,
      revokedReason: session.revokedReason ?? null,
    });
  }

  async getAuthSession(id: string): Promise<AuthSession | undefined> {
    const row = this.authSessionRows.get(id);
    return row ? { ...row } : undefined;
  }

  async offerAuthSessionSecret(
    id: string,
    offer: { secretHash: string; now: Date; rotateBefore: Date; reofferBefore: Date },
  ): Promise<boolean> {
    const row = this.authSessionRows.get(id);
    if (!row || row.revokedAt) return false;
    if (row.rotatedAt.getTime() > offer.rotateBefore.getTime()) return false;
    if (row.offeredAt && row.offeredAt.getTime() > offer.reofferBefore.getTime()) return false;
    row.offeredSecretHash = offer.secretHash;
    row.offeredAt = offer.now;
    return true;
  }

  async promoteAuthSessionSecret(
    id: string,
    promotion: { offeredSecretHash: string; now: Date; previousValidUntil: Date },
  ): Promise<boolean> {
    const row = this.authSessionRows.get(id);
    if (!row || row.revokedAt || row.offeredSecretHash !== promotion.offeredSecretHash) return false;
    row.previousSecretHash = row.secretHash;
    row.previousValidUntil = promotion.previousValidUntil;
    row.secretHash = promotion.offeredSecretHash;
    row.offeredSecretHash = null;
    row.offeredAt = null;
    row.rotatedAt = promotion.now;
    return true;
  }

  async touchAuthSession(id: string, now: Date, idleExpiresAt: Date): Promise<void> {
    const row = this.authSessionRows.get(id);
    if (!row || row.revokedAt || row.lastUsedAt.getTime() >= now.getTime()) return;
    row.lastUsedAt = now;
    row.idleExpiresAt = idleExpiresAt;
  }

  async revokeAuthSession(id: string, reason: string, now: Date): Promise<boolean> {
    const row = this.authSessionRows.get(id);
    if (!row || row.revokedAt) return false;
    row.revokedAt = now;
    row.revokedReason = reason;
    return true;
  }

  async revokeAuthSessionsForLogin(userId: number, reason: string, now: Date, keepId?: string): Promise<number> {
    let ended = 0;
    for (const row of this.authSessionRows.values()) {
      if (row.userId !== userId || row.id === keepId || row.revokedAt) continue;
      if (row.idleExpiresAt.getTime() <= now.getTime() || row.absoluteExpiresAt.getTime() <= now.getTime()) continue;
      row.revokedAt = now;
      row.revokedReason = reason;
      ended += 1;
    }
    return ended;
  }

  async consumeInvoiceDocumentReadLimit(token: string): Promise<boolean> {
    const now = Date.now();
    for (const [key, row] of this.documentReadLimits) {
      if (row.expiresAt <= now) this.documentReadLimits.delete(key);
    }
    const key = documentReadTokenKey(token);
    const row = this.documentReadLimits.get(key);
    if (row && row.count >= DOCUMENT_READ_TOKEN_LIMIT) return false;
    this.documentReadLimits.set(key, { count: (row?.count ?? 0) + 1, expiresAt: row?.expiresAt ?? now + DOCUMENT_READ_WINDOW_MS });
    return true;
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
    // A device takes the switches of the login it is recorded against (owner decision 2026-09-26).
    const targetPreferences = await this.getPushNotificationPreferences(data.merchantId, data.userId ?? null);
    if (data.sessionVersion !== undefined) {
      const user = data.userId === null ? undefined : await this.getUserById(data.userId);
      if (!user || user.status !== "active" || user.merchantId !== data.merchantId || (user.sessionVersion ?? 0) !== data.sessionVersion) {
        throw new PushSessionEndedError();
      }
    }
    const { sessionVersion: _sessionVersion, ...subscriptionData } = data;
    const existing = this.pushSubs.find(s => s.endpoint === data.endpoint);
    if (existing) {
      const preferences = existing.merchantId === data.merchantId && (existing.userId ?? null) === (data.userId ?? null)
        ? normalizePushNotificationPreferences(existing.preferences)
        : targetPreferences;
      existing.isActive = true;
      existing.merchantId = data.merchantId;
      existing.userId = data.userId;
      existing.p256dh = data.p256dh;
      existing.auth = data.auth;
      existing.userAgent = data.userAgent ?? existing.userAgent;
      existing.preferences = { ...preferences };
      return existing;
    }
    const sub: PushSubscription = {
      id: this.pushSubs.length + 1,
      ...subscriptionData,
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

  async getPushSubscriptionsForLogin(merchantId: number, userId: number): Promise<PushSubscription[]> {
    return this.pushSubs.filter(s => s.merchantId === merchantId && s.userId === userId && s.isActive);
  }

  async getPushNotificationPreferences(merchantId: number, userId: number | null): Promise<PushNotificationPreferences> {
    const latest = this.pushSubs
      .filter((sub) => sub.merchantId === merchantId && (sub.userId ?? null) === userId)
      .sort((a, b) => b.id - a.id)[0];
    return latest
      ? normalizePushNotificationPreferences(latest.preferences)
      : { ...DEFAULT_PUSH_NOTIFICATION_PREFERENCES };
  }

  async updatePushNotificationPreferences(
    merchantId: number,
    userId: number | null,
    preferences: PushNotificationPreferences,
  ): Promise<PushNotificationPreferences> {
    const safePreferences = normalizePushNotificationPreferences(preferences);
    for (const sub of this.pushSubs) {
      if (sub.merchantId === merchantId && (sub.userId ?? null) === userId) sub.preferences = { ...safePreferences };
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

  async deactivatePushSubscriptionsForLogin(merchantId: number, userId: number): Promise<void> {
    for (const sub of this.pushSubs) {
      if (sub.userId === userId || (sub.merchantId === merchantId && sub.userId == null)) sub.isActive = false;
    }
  }

  async deactivateNativePushSubscriptionsForLogin(merchantId: number, userId: number): Promise<void> {
    for (const sub of this.pushSubs) {
      if (!sub.endpoint.startsWith("apns://") || sub.merchantId !== merchantId) continue;
      if (sub.userId === userId || sub.userId == null) sub.isActive = false;
    }
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

  async getTaptStoneForMerchant(id: number, merchantId: number): Promise<TaptStone | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const stone = this.taptStones.get(id);
    return stone?.merchantId === merchantId ? stone : undefined;
  }

  async getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]> {
    return Array.from(this.taptStones.values()).filter(
      (stone) => stone.merchantId === merchantId && stone.isActive
    );
  }

  async updateTaptStoneForMerchant(id: number, merchantId: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const stone = this.taptStones.get(id);
    if (stone?.merchantId === merchantId) {
      if (data.name !== undefined) {
        stone.name = data.name;
      }
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return stone;
    }
    return undefined;
  }

  async updateTaptStoneUrlsForMerchant(id: number, merchantId: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const stone = this.taptStones.get(id);
    if (stone?.merchantId === merchantId) {
      stone.qrCodeUrl = qrCodeUrl;
      stone.paymentUrl = paymentUrl;
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return stone;
    }
    return undefined;
  }

  async deleteTaptStoneForMerchant(id: number, merchantId: number): Promise<boolean> {
    if (!isManagementTenantId(merchantId)) return false;
    const stone = this.taptStones.get(id);
    if (stone?.merchantId === merchantId) {
      stone.isActive = false;
      stone.updatedAt = new Date();
      this.taptStones.set(id, stone);
      return true;
    }
    return false;
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

  async getStockItemForMerchant(id: number, merchantId: number): Promise<StockItem | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const item = this.stockItems.get(id);
    return item?.merchantId === merchantId ? item : undefined;
  }

  async getStockItemsByMerchant(merchantId: number): Promise<StockItem[]> {
    return Array.from(this.stockItems.values()).filter(
      (item) => item.merchantId === merchantId && item.isActive
    );
  }

  async updateStockItemForMerchant(id: number, merchantId: number, data: StockItemChanges): Promise<StockItem | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const item = this.stockItems.get(id);
    if (item?.merchantId === merchantId) {
      const updatedItem = {
        ...item,
        ...stockItemChanges(data),
        updatedAt: new Date(),
      };
      this.stockItems.set(id, updatedItem);
      return updatedItem;
    }
    return undefined;
  }

  async deleteStockItemForMerchant(id: number, merchantId: number): Promise<boolean> {
    if (!isManagementTenantId(merchantId)) return false;
    const item = this.stockItems.get(id);
    if (item?.merchantId === merchantId) {
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
  async createTenantProfileForMerchant(merchantId: number, data: TenantProfileChanges): Promise<any> { throw new Error("Property requires database"); }
  async getTenantProfileForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async updateTenantProfileForMerchant(id: string, merchantId: number, updates: TenantProfileChanges): Promise<any> { return undefined; }
  async archiveTenantProfileForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async unarchiveTenantProfileForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async getTransactionEventsByTenantForMerchant(tenantProfileId: string, merchantId: number, limit?: number): Promise<any[]> { return []; }
  async getTenantProfile(id: string): Promise<any> { return undefined; }
  async getTenantProfilesByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }

  async createActiveScheduleForMerchant(tenantProfileId: string, merchantId: number, data: ActiveScheduleInput): Promise<PropertyScheduleMutationResult> { throw new Error("Property management requires database"); }
  async getActiveScheduleForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async updateActiveScheduleForMerchant(id: string, merchantId: number, updates: ActiveScheduleChanges): Promise<PropertyScheduleMutationResult> { return { kind: "not-found" }; }
  async terminateActiveScheduleForMerchant(id: string, merchantId: number): Promise<PropertyScheduleMutationResult> { return { kind: "not-found" }; }
  async getActiveSchedule(id: string): Promise<any> { return undefined; }
  async getActiveSchedulesByMerchant(merchantId: number): Promise<any[]> { return []; }
  async updateActiveSchedule(id: string, updates: any): Promise<any> { return undefined; }
  async getDueActiveSchedules(now: Date): Promise<any[]> { return []; }
  async getInvoiceRentRequestForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async voidInvoiceRentRequestForMerchant(id: string, merchantId: number): Promise<PropertyInvoiceMutationResult> { return { kind: "not-found" }; }
  async markInvoiceRentRequestPaidExternalForMerchant(id: string, merchantId: number, externalPaymentReference?: string): Promise<PropertyInvoiceMutationResult> { return { kind: "not-found" }; }
  async createOrReuseInvoiceRentRequestForMerchant(tenantProfileId: string, merchantId: number, data: PropertyInvoiceInput): Promise<PropertyInvoiceCreationResult> { throw new Error("Property management requires database"); }
  async getInvoiceRentRequestDeliveryForMerchant(id: string, merchantId: number): Promise<PropertyInvoiceDeliverySnapshot | undefined> { return undefined; }
  async recordInvoiceRentRequestDeliveryForMerchant(id: string, merchantId: number, tenantProfileId: string, data: PropertyInvoiceDeliveryInput): Promise<PropertyInvoiceMutationResult> { return { kind: "not-found" }; }
  async createInvoiceRentRequest(data: any): Promise<any> { throw new Error("Property management requires database"); }
  async getInvoiceRentRequest(id: string): Promise<any> { return undefined; }
  async getInvoiceRentRequestByToken(token: string): Promise<any> { return undefined; }
  async getInvoiceRentRequestByWindcaveSessionId(sessionId: string): Promise<any> { return undefined; }
  async getInvoiceRentRequestsByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }
  async updateInvoiceRentRequest(id: string, updates: any): Promise<any> { return undefined; }
  async atomicClaimSplitShare(invoiceId: string, sessionId: string): Promise<any | null> { return null; }
  async recordInvoiceSplitSession(input: InvoiceSplitSessionInput): Promise<void> {
    if (this.invoiceSplitSessionRows.has(input.sessionId)) return;
    this.invoiceSplitSessionRows.set(input.sessionId, {
      windcaveSessionId: input.sessionId,
      rentInvoiceId: input.vertical === "property" ? input.invoiceId : null,
      jobInvoiceId: input.vertical === "trades" ? input.invoiceId : null,
      amountCents: input.amountCents,
      payerEmail: input.payerEmail,
      openedAt: new Date(),
      paidAt: null,
    });
  }
  async getInvoiceSplitSession(sessionId: string): Promise<InvoiceSplitSession | undefined> {
    const row = this.invoiceSplitSessionRows.get(sessionId);
    return row ? { ...row } : undefined;
  }
  private splitSessionsOf(invoice: InvoiceSplitRef): InvoiceSplitSession[] {
    return Array.from(this.invoiceSplitSessionRows.values()).filter((row) =>
      invoice.vertical === "property" ? row.rentInvoiceId === invoice.invoiceId : row.jobInvoiceId === invoice.invoiceId);
  }
  async invoiceHasSplitSessions(invoice: InvoiceSplitRef): Promise<boolean> {
    return this.splitSessionsOf(invoice).length > 0;
  }
  async markInvoiceSplitSessionPaid(sessionId: string, paidAt: Date): Promise<void> {
    const row = this.invoiceSplitSessionRows.get(sessionId);
    if (row && !row.paidAt) row.paidAt = paidAt;
  }
  async getPaidInvoiceSplitPayerEmails(invoice: InvoiceSplitRef): Promise<string[]> {
    return this.splitSessionsOf(invoice)
      .filter((row) => row.paidAt && row.payerEmail)
      .map((row) => row.payerEmail as string);
  }
  async getInvoiceRentRequestByWhatsappMessageId(messageId: string): Promise<any | undefined> { return undefined; }
  async getPendingDispatchInvoices(): Promise<any[]> { return []; }
  async getOverdueEligibleInvoices(now: Date): Promise<any[]> { return []; }
  async getReminderEligibleInvoices(): Promise<any[]> { return []; }
  async logTransactionEvent(data: any): Promise<any> { return {}; }
  async getTransactionEventsByTenant(tenantProfileId: string, limit?: number): Promise<any[]> { return []; }
  async getTransactionEventsByInvoice(invoiceId: string): Promise<any[]> { return []; }

  // ── Trades — MemStorage stubs (DB-only feature) ───────────────────────────
  async createClientProfileForMerchant(merchantId: number, data: ClientProfileInput): Promise<any> { throw new Error("Trades requires database"); }
  async getClientProfileForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async updateClientProfileForMerchant(id: string, merchantId: number, updates: ClientProfileChanges): Promise<any> { return undefined; }
  async archiveClientProfileForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async unarchiveClientProfileForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async promoteClientProfileForMerchant(id: string, merchantId: number): Promise<ClientProfilePromotionResult> { return { kind: "not-found" }; }
  async getJobEventsByClientForMerchant(clientProfileId: string, merchantId: number, limit?: number): Promise<any[]> { return []; }
  async getClientProfile(id: string): Promise<any> { return undefined; }
  async getClientProfilesByMerchant(merchantId: number): Promise<any[]> { return []; }
  async createQuoteForMerchant(merchantId: number, client: TradesClientRef, data: QuoteInput): Promise<QuoteCreationResult> { throw new Error("Trades requires database"); }
  async recordQuoteDeliveryForMerchant(id: string, merchantId: number, clientProfileId: string, record: TradesQuoteDeliveryRecord): Promise<boolean> { return false; }
  async getQuote(id: string): Promise<any> { return undefined; }
  async getQuoteByToken(token: string): Promise<any> { return undefined; }
  async getQuotesByMerchant(merchantId: number, opts?: any): Promise<any[]> { return []; }
  async getQuoteDeliveryForMerchant(id: string, merchantId: number): Promise<TradesQuoteDeliverySnapshot | undefined> { return undefined; }
  async updateQuote(id: string, updates: any): Promise<any> { return undefined; }
  async getJobInvoiceForMerchant(id: string, merchantId: number): Promise<any> { return undefined; }
  async getJobInvoiceDeliveryForMerchant(id: string, merchantId: number): Promise<TradesInvoiceDeliverySnapshot | undefined> { return undefined; }
  async voidJobInvoiceForMerchant(id: string, merchantId: number): Promise<JobInvoiceMutationResult> { return { kind: "not-found" }; }
  async markJobInvoicePaidExternalForMerchant(id: string, merchantId: number, externalPaymentReference?: string): Promise<JobInvoiceMutationResult> { return { kind: "not-found" }; }
  async completeJobInvoiceForMerchant(id: string, merchantId: number): Promise<JobInvoiceMutationResult> { return { kind: "not-found" }; }
  async recordJobInvoiceReceiptForMerchant(id: string, merchantId: number, clientProfileId: string, receipt: TradesReceiptRecord): Promise<boolean> { return false; }
  async createJobInvoiceForMerchant(merchantId: number, client: TradesClientRef, data: JobInvoiceInput): Promise<JobInvoiceCreationResult> { throw new Error("Trades requires database"); }
  async createJobBalanceInvoiceForMerchant(depositInvoiceId: string, merchantId: number, splitEnabled: boolean): Promise<JobBalanceCreationResult> { throw new Error("Trades requires database"); }
  async recordJobInvoiceDeliveryForMerchant(id: string, merchantId: number, clientProfileId: string, record: TradesInvoiceDeliveryRecord): Promise<JobInvoiceMutationResult> { return { kind: "not-found" }; }
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
        sessionVersion: 0,
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
      // As push_subscriptions.user_id's ON DELETE CASCADE does (0029).
      this.pushSubs = this.pushSubs.filter((sub) => sub.userId !== userId);
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
      // R1-T4 phase D: a password change ends every session issued before it.
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
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
      // R1-T4 phase D: a reset ends every session issued before it.
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
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
  constructor(private db = getDb()) {}

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
      // R0-T5: never accept a merchant-supplied Windcave credential through this path.
      const { windcaveApiKey: _rejectedWindcaveApiKey, ...safeMerchantData } = merchantData;
      const insertData = {
        ...safeMerchantData,
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
    // R0-T5: no general update path may write a Windcave credential. R5 owns
    // historical values through its own reviewed path, not this one.
    const { windcaveApiKey: _rejectedWindcaveApiKey, ...safeUpdates } = updates;
    const result = await this.db
      .update(merchants)
      .set({ ...safeUpdates, updatedAt: new Date() })
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

  async getTransactionForMerchant(id: number, merchantId: number): Promise<Transaction | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    if (!this.db) throw new Error('Database not available');
    const rows = await this.db.select().from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.merchantId, merchantId))).limit(1);
    return rows[0];
  }

  async cancelTransactionForMerchant(id: number, merchantId: number): Promise<TransactionCancellationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    if (!this.db) throw new Error('Database not available');
    return this.db.transaction(async (tx: any): Promise<TransactionCancellationResult> => {
      // The payment finalizer locks this same parent. Re-read tenant/state after waiting on it.
      const [row] = await tx.select().from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.merchantId, merchantId)))
        .limit(1).for("update");
      if (!row) return { kind: "not-found" };
      if (row.status !== "pending" && row.status !== "processing") {
        return { kind: "conflict", status: row.status };
      }
      const [transaction] = await tx.update(transactions).set({ status: "cancelled" })
        .where(and(
          eq(transactions.id, id), eq(transactions.merchantId, merchantId),
          inArray(transactions.status, ["pending", "processing"]),
        )).returning();
      return transaction ? { kind: "cancelled", transaction } : { kind: "not-found" };
    });
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

  async createTransactionForMerchant(merchantId: number, input: TransactionStorageInput): Promise<Transaction> {
    if (!isManagementTenantId(merchantId)) throw new TransactionCreationScopeError();
    if (!this.db) throw new Error('Database not available');
    const data = scopedTransactionInput(merchantId, input);
    return this.db.transaction(async (tx: any) => {
      if (data.taptStoneId != null) {
        const [board] = await tx.select().from(taptStones)
          .where(and(eq(taptStones.id, data.taptStoneId), eq(taptStones.merchantId, merchantId), eq(taptStones.isActive, true)))
          .limit(1).for("update");
        if (!board) throw new TransactionCreationScopeError();
      }
      // Reuse the exact constructor/defaults with the transaction-bound DB handle.
      return new DatabaseStorage(tx).createTransaction(data);
    });
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

  async updateTransactionStatusForMerchant(id: number, merchantId: number, status: string, windcaveTransactionId?: string): Promise<Transaction | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
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
      .where(and(eq(transactions.id, id), eq(transactions.merchantId, merchantId)))
      .returning();
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

  async updateTransactionPaymentMethodForMerchant(id: number, merchantId: number, paymentMethod: string): Promise<Transaction | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    if (!this.db) throw new Error('Database not available');
    const result = await this.db
      .update(transactions)
      .set({ paymentMethod })
      .where(and(eq(transactions.id, id), eq(transactions.merchantId, merchantId)))
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
      // Any FK refusal must roll back the child deletes too. In particular,
      // migration 0023's upload FK must not leave a surviving merchant without
      // its transactions. The database also arbitrates concurrent upload writes.
      return await this.db.transaction(async (tx) => {
        await tx.delete(transactions).where(eq(transactions.merchantId, id));
        const deleted = await tx.delete(merchants).where(eq(merchants.id, id)).returning({ id: merchants.id });
        return deleted.length > 0;
      });
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

  async getRefundsForTransactionForMerchant(transactionId: number, merchantId: number): Promise<Refund[]> {
    if (!isManagementTenantId(merchantId)) return [];
    if (!this.db) throw new Error('Database not available');
    return this.db.select().from(refunds).where(and(
      eq(refunds.transactionId, transactionId), eq(refunds.merchantId, merchantId),
      sql`exists (select 1 from ${transactions} where ${transactions.id} = ${refunds.transactionId}
        and ${transactions.merchantId} = ${merchantId})`,
    ));
  }

  async getRefundsByMerchant(merchantId: number): Promise<Refund[]> {
    if (!this.db) throw new Error('Database not available');
    return await this.db.select().from(refunds).where(eq(refunds.merchantId, merchantId));
  }

  async createRefundForMerchant(transactionId: number, merchantId: number, data: MerchantRefundInput): Promise<Refund | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    if (!this.db) throw new Error('Database not available');
    return this.db.transaction(async (tx: any) => {
      const [parent] = await tx.select().from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.merchantId, merchantId)))
        .limit(1).for("update");
      if (!parent) return undefined;
      const [refund] = await tx.insert(refunds).values(scopedRefundInput(transactionId, merchantId, data)).returning();
      return refund;
    });
  }

  async updateRefundStatusForMerchant(id: number, merchantId: number, status: "failed" | "completed", windcaveRefundId?: string): Promise<Refund | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    if (!this.db) throw new Error('Database not available');
    return this.db.transaction(async (tx: any) => {
      const [refund] = await tx.select().from(refunds)
        .where(and(eq(refunds.id, id), eq(refunds.merchantId, merchantId))).limit(1);
      if (!refund || refund.transactionId === null) return undefined;
      // Parent first: same lock ordering as finalization/creation, protecting current ownership.
      const [parent] = await tx.select().from(transactions)
        .where(and(eq(transactions.id, refund.transactionId), eq(transactions.merchantId, merchantId)))
        .limit(1).for("update");
      if (!parent) return undefined;
      const changes: any = { status };
      if (windcaveRefundId) changes.windcaveRefundId = windcaveRefundId;
      if (status === "completed") changes.completedAt = new Date();
      const [updated] = await tx.update(refunds).set(changes)
        .where(and(eq(refunds.id, id), eq(refunds.merchantId, merchantId), eq(refunds.transactionId, parent.id))).returning();
      return updated;
    });
  }

  async reserveRefundAmountForMerchant(id: number, merchantId: number, refundAmount: number): Promise<Transaction | null> {
    if (!isManagementTenantId(merchantId)) return null;
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
        eq(transactions.id, id), eq(transactions.merchantId, merchantId),
        inArray(transactions.status, ['completed', 'partially_refunded']),
        sql`(${transactions.price}::numeric - COALESCE(${transactions.totalRefunded}, '0')::numeric) >= ${amt}::numeric`,
      ))
      .returning();
    return result[0] ?? null;
  }

  async releaseRefundAmountForMerchant(id: number, merchantId: number, refundAmount: number): Promise<boolean> {
    if (!isManagementTenantId(merchantId)) return false;
    if (!this.db) throw new Error('Database not available');
    const amt = refundAmount.toFixed(2);
    const result = await this.db
      .update(transactions)
      .set({
        totalRefunded: sql`GREATEST(0, COALESCE(${transactions.totalRefunded}, '0')::numeric - ${amt}::numeric)`,
        refundableAmount: sql`LEAST(${transactions.price}::numeric, ${transactions.price}::numeric - GREATEST(0, COALESCE(${transactions.totalRefunded}, '0')::numeric - ${amt}::numeric))`,
        status: sql`CASE WHEN GREATEST(0, COALESCE(${transactions.totalRefunded}, '0')::numeric - ${amt}::numeric) <= 0 THEN 'completed' ELSE 'partially_refunded' END`,
      })
      .where(and(eq(transactions.id, id), eq(transactions.merchantId, merchantId))).returning();
    return result.length > 0;
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
      return await this.db!.transaction(async (tx) => {
        if (data.sessionVersion !== undefined) {
          const [user] = await tx.select().from(users).where(eq(users.id, data.userId ?? -1)).for("update");
          if (!user || user.status !== "active" || user.merchantId !== data.merchantId || (user.sessionVersion ?? 0) !== data.sessionVersion) {
            throw new PushSessionEndedError();
          }
        }
        // A device takes the switches of the login it is recorded against (owner decision 2026-09-26).
        const [latest] = await tx.select({ preferences: pushSubscriptions.preferences })
          .from(pushSubscriptions)
          .where(and(eq(pushSubscriptions.merchantId, data.merchantId),
            data.userId === null ? isNull(pushSubscriptions.userId) : eq(pushSubscriptions.userId, data.userId)))
          .orderBy(desc(pushSubscriptions.id)).limit(1);
        const targetPreferences = normalizePushNotificationPreferences(latest?.preferences);
        const existing = await tx
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, data.endpoint));

        if (existing.length > 0) {
          const preferences = existing[0].merchantId === data.merchantId && (existing[0].userId ?? null) === (data.userId ?? null)
            ? normalizePushNotificationPreferences(existing[0].preferences)
            : targetPreferences;
          const [updated] = await tx
            .update(pushSubscriptions)
            .set({
              merchantId: data.merchantId,
              userId: data.userId,
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

        const [sub] = await tx
          .insert(pushSubscriptions)
          .values({
            merchantId: data.merchantId,
            userId: data.userId,
            endpoint: data.endpoint,
            p256dh: data.p256dh,
            auth: data.auth,
            userAgent: data.userAgent || null,
            preferences: targetPreferences,
            isActive: true,
          })
          .returning();
        return sub;
      });
    } catch (error) {
      if (error instanceof PushSessionEndedError) throw error;
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

  async getPushSubscriptionsForLogin(merchantId: number, userId: number): Promise<PushSubscription[]> {
    return await this.db!
      .select()
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.merchantId, merchantId),
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.isActive, true),
      ));
  }

  async getPushNotificationPreferences(merchantId: number, userId: number | null): Promise<PushNotificationPreferences> {
    try {
      const [row] = await this.db!
        .select({ preferences: pushSubscriptions.preferences })
        .from(pushSubscriptions)
        .where(and(
          eq(pushSubscriptions.merchantId, merchantId),
          userId === null ? isNull(pushSubscriptions.userId) : eq(pushSubscriptions.userId, userId),
        ))
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
    userId: number | null,
    preferences: PushNotificationPreferences,
  ): Promise<PushNotificationPreferences> {
    const safePreferences = normalizePushNotificationPreferences(preferences);
    await this.db!
      .update(pushSubscriptions)
      .set({ preferences: safePreferences })
      .where(and(
        eq(pushSubscriptions.merchantId, merchantId),
        userId === null ? isNull(pushSubscriptions.userId) : eq(pushSubscriptions.userId, userId),
      ));
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
    // A fault reaches the caller: turning a device's notifications off is never reported done
    // when it failed (C10 batch 5).
    await this.db!
      .update(pushSubscriptions)
      .set({ isActive: false })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  // The devices are locked in id order, then stopped. Each login's ending also stops the business's
  // unattributed devices, so endings that happen together share rows; taken in whatever order each
  // statement met them, they could deadlock, and the statement rolled back left its login's devices on
  // (found on real PostgreSQL, 2026-10-01). Devices already stopped are not rewritten.
  async deactivatePushSubscriptionsForLogin(merchantId: number, userId: number): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    await this.db.execute(sql`
      WITH held AS MATERIALIZED (
        SELECT id FROM push_subscriptions
        WHERE is_active AND (user_id = ${userId} OR (merchant_id = ${merchantId} AND user_id IS NULL))
        ORDER BY id
        FOR UPDATE
      )
      UPDATE push_subscriptions SET is_active = false FROM held WHERE push_subscriptions.id = held.id`);
  }

  // Locked in id order, as above: the business's unattributed iPhones are shared between its logins.
  async deactivateNativePushSubscriptionsForLogin(merchantId: number, userId: number): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    await this.db.execute(sql`
      WITH held AS MATERIALIZED (
        SELECT id FROM push_subscriptions
        WHERE is_active AND merchant_id = ${merchantId} AND endpoint LIKE 'apns://%'
          AND (user_id = ${userId} OR user_id IS NULL)
        ORDER BY id
        FOR UPDATE
      )
      UPDATE push_subscriptions SET is_active = false FROM held WHERE push_subscriptions.id = held.id`);
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

  async getTaptStoneForMerchant(id: number, merchantId: number): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    if (!isManagementTenantId(merchantId)) return undefined;
    const result = await this.db.select().from(taptStones)
      .where(and(eq(taptStones.id, id), eq(taptStones.merchantId, merchantId))).limit(1);
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

  async updateTaptStoneForMerchant(id: number, merchantId: number, data: Partial<{ name: string }>): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    if (!isManagementTenantId(merchantId)) return undefined;
    const result = await this.db
      .update(taptStones)
      .set({ 
        name: data.name,
        updatedAt: new Date() 
      })
      .where(and(eq(taptStones.id, id), eq(taptStones.merchantId, merchantId)))
      .returning();
    return result[0];
  }

  async updateTaptStoneUrlsForMerchant(id: number, merchantId: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone | undefined> {
    if (!this.db) throw new Error('Database not available');
    if (!isManagementTenantId(merchantId)) return undefined;
    const result = await this.db
      .update(taptStones)
      .set({ 
        qrCodeUrl, 
        paymentUrl, 
        updatedAt: new Date() 
      })
      .where(and(eq(taptStones.id, id), eq(taptStones.merchantId, merchantId)))
      .returning();
    return result[0];
  }

  async deleteTaptStoneForMerchant(id: number, merchantId: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    if (!isManagementTenantId(merchantId)) return false;
    const result = await this.db
      .update(taptStones)
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where(and(eq(taptStones.id, id), eq(taptStones.merchantId, merchantId)))
      .returning();
    return result.length > 0;
  }

  // Stock Item methods for DatabaseStorage
  async createStockItem(data: InsertStockItem): Promise<StockItem> {
    if (!this.db) throw new Error('Database not available');
    const result = await this.db.insert(stockItems).values(data).returning();
    return result[0];
  }

  async getStockItemForMerchant(id: number, merchantId: number): Promise<StockItem | undefined> {
    if (!this.db) throw new Error('Database not available');
    if (!isManagementTenantId(merchantId)) return undefined;
    const result = await this.db.select().from(stockItems)
      .where(and(eq(stockItems.id, id), eq(stockItems.merchantId, merchantId))).limit(1);
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

  async updateStockItemForMerchant(id: number, merchantId: number, data: StockItemChanges): Promise<StockItem | undefined> {
    if (!this.db) throw new Error('Database not available');
    if (!isManagementTenantId(merchantId)) return undefined;
    const result = await this.db
      .update(stockItems)
      .set({ 
        ...stockItemChanges(data),
        updatedAt: new Date() 
      })
      .where(and(eq(stockItems.id, id), eq(stockItems.merchantId, merchantId)))
      .returning();
    return result[0];
  }

  async deleteStockItemForMerchant(id: number, merchantId: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not available');
    if (!isManagementTenantId(merchantId)) return false;
    const result = await this.db
      .update(stockItems)
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where(and(eq(stockItems.id, id), eq(stockItems.merchantId, merchantId)))
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
        // R1-T4 phase D: a password change ends every session issued before it.
        .set({ password: passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
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
          // R1-T4 phase D: a reset ends every session issued before it.
          sessionVersion: sql`${users.sessionVersion} + 1`,
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
  async createTenantProfileForMerchant(merchantId: number, data: TenantProfileChanges): Promise<any> {
    if (!isManagementTenantId(merchantId)) throw new Error("Invalid tenant scope");
    const db = this.db; if (!db) throw new Error("Property requires database");
    const [row] = await db.insert(tenantProfiles).values({ ...tenantProfileChanges(data), merchantId } as any).returning();
    return row;
  }
  async getTenantProfileForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.select().from(tenantProfiles)
      .where(and(eq(tenantProfiles.id, id), eq(tenantProfiles.merchantId, merchantId))).limit(1);
    return row;
  }
  async updateTenantProfileForMerchant(id: string, merchantId: number, updates: TenantProfileChanges): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.update(tenantProfiles).set({ ...tenantProfileChanges(updates), updatedAt: new Date() })
      .where(and(eq(tenantProfiles.id, id), eq(tenantProfiles.merchantId, merchantId))).returning();
    return row;
  }
  async archiveTenantProfileForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    return db.transaction(async (tx: any) => {
      const now = new Date();
      const [row] = await tx.update(tenantProfiles).set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(and(eq(tenantProfiles.id, id), eq(tenantProfiles.merchantId, merchantId))).returning();
      if (!row) return undefined;
      await tx.update(activeSchedules).set({ status: "terminated", terminatedAt: now, updatedAt: now })
        .where(and(eq(activeSchedules.tenantProfileId, id), eq(activeSchedules.merchantId, merchantId), sql`${activeSchedules.status} <> 'terminated'`));
      return row;
    });
  }
  async unarchiveTenantProfileForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.update(tenantProfiles).set({ status: "active", archivedAt: null, updatedAt: new Date() })
      .where(and(eq(tenantProfiles.id, id), eq(tenantProfiles.merchantId, merchantId))).returning();
    return row;
  }
  async getTransactionEventsByTenantForMerchant(tenantProfileId: string, merchantId: number, limit = 100): Promise<any[]> {
    if (!isManagementTenantId(merchantId)) return [];
    const db = this.db; if (!db) return [];
    return db.select().from(transactionEvents).where(and(
      eq(transactionEvents.tenantProfileId, tenantProfileId), eq(transactionEvents.merchantId, merchantId),
      sql`exists (select 1 from ${tenantProfiles} where ${tenantProfiles.id} = ${transactionEvents.tenantProfileId} and ${tenantProfiles.merchantId} = ${merchantId})`,
    )).orderBy(desc(transactionEvents.createdAt)).limit(limit);
  }
  async getTenantProfile(id: string): Promise<any> {
    const db = this.db; if (!db) return undefined;
    const [r] = await db.select().from(tenantProfiles).where(eq(tenantProfiles.id, id)).limit(1); return r;
  }
  async getTenantProfilesByMerchant(merchantId: number, opts: { search?: string; includeArchived?: boolean } = {}): Promise<any[]> {
    const db = this.db; if (!db) return [];
    const conds: any[] = [eq(tenantProfiles.merchantId, merchantId)];
    if (!opts.includeArchived) conds.push(eq(tenantProfiles.status, "active"));
    if (opts.search?.trim()) {
      const p = `%${opts.search.trim()}%`;
      conds.push(or(ilike(tenantProfiles.firstName, p), ilike(tenantProfiles.lastName, p), ilike(tenantProfiles.propertyAddress, p)));
    }
    return db.select().from(tenantProfiles).where(and(...conds)).orderBy(desc(tenantProfiles.createdAt));
  }
  async createActiveScheduleForMerchant(tenantProfileId: string, merchantId: number, data: ActiveScheduleInput): Promise<PropertyScheduleMutationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) throw new Error("Property management requires database");
    return db.transaction(async (tx: any) => {
      // Parent first, as in archive. Serializes replacements even before any child exists.
      const [parent] = await tx.select().from(tenantProfiles)
        .where(and(eq(tenantProfiles.id, tenantProfileId), eq(tenantProfiles.merchantId, merchantId)))
        .limit(1).for("update");
      if (!parent) return { kind: "not-found" };
      if (parent.status === "archived") return { kind: "conflict", reason: "archived" };
      const now = new Date();
      const replaced = await tx.update(activeSchedules).set({ status: "terminated", terminatedAt: now, updatedAt: now })
        .where(and(eq(activeSchedules.tenantProfileId, tenantProfileId), eq(activeSchedules.merchantId, merchantId), sql`${activeSchedules.status} <> 'terminated'`)).returning();
      const values = Object.fromEntries(["amountCents", "frequency", "deliveryChannel", "startDate", "endDate"]
        .filter(key => (data as any)[key] !== undefined).map(key => [key, (data as any)[key]]));
      const [schedule] = await tx.insert(activeSchedules).values({ ...values, merchantId, tenantProfileId, status: "active", nextRunDate: data.startDate }).returning();
      await tx.insert(transactionEvents).values([
        { merchantId, tenantProfileId, scheduleId: schedule.id, eventType: "Schedule_Created", payload: { amountCents: schedule.amountCents, frequency: schedule.frequency } },
        ...replaced.map((old: any) => ({ merchantId, tenantProfileId, scheduleId: old.id, eventType: "Schedule_Terminated", payload: { replacedBy: schedule.id } })),
      ]);
      return { kind: "ok", schedule };
    });
  }
  async getActiveScheduleForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.select().from(activeSchedules).where(and(
      eq(activeSchedules.id, id), eq(activeSchedules.merchantId, merchantId),
      sql`exists (select 1 from ${tenantProfiles} where ${tenantProfiles.id} = ${activeSchedules.tenantProfileId} and ${tenantProfiles.merchantId} = ${merchantId})`,
    )).limit(1);
    return row;
  }
  private async mutateActiveScheduleForMerchant(id: string, merchantId: number, updates?: ActiveScheduleChanges): Promise<PropertyScheduleMutationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) return { kind: "not-found" };
    return db.transaction(async (tx: any) => {
      const [candidate] = await tx.select({ tenantProfileId: activeSchedules.tenantProfileId }).from(activeSchedules)
        .where(and(eq(activeSchedules.id, id), eq(activeSchedules.merchantId, merchantId))).limit(1);
      if (!candidate) return { kind: "not-found" };
      const tenantProfileId = candidate.tenantProfileId;
      const [parent] = await tx.select().from(tenantProfiles)
        .where(and(eq(tenantProfiles.id, tenantProfileId), eq(tenantProfiles.merchantId, merchantId)))
        .limit(1).for("update");
      if (!parent) return { kind: "not-found" };
      const scope = and(eq(activeSchedules.id, id), eq(activeSchedules.merchantId, merchantId), eq(activeSchedules.tenantProfileId, tenantProfileId));
      const [current] = await tx.select().from(activeSchedules).where(scope).limit(1).for("update");
      if (!current) return { kind: "not-found" };
      if (updates && current.status === "terminated") return { kind: "conflict", reason: "terminated" };
      if (updates && parent.status === "archived") return { kind: "conflict", reason: "archived" };
      const now = new Date();
      const patch: any = updates ? activeScheduleChanges(updates) : { status: "terminated", terminatedAt: now };
      if (current.status === "paused" && patch.status === "active") {
        patch.nextRunDate = nextRunDateAfter(new Date(current.nextRunDate), patch.frequency ?? current.frequency, now);
      }
      const [schedule] = await tx.update(activeSchedules).set({ ...patch, updatedAt: now }).where(scope).returning();
      if (!schedule) return { kind: "not-found" };
      const eventType = !updates ? "Schedule_Terminated" : patch.status === "paused" ? "Schedule_Paused" : patch.status === "active" ? "Schedule_Resumed" : undefined;
      if (eventType) await tx.insert(transactionEvents).values({ merchantId, tenantProfileId, scheduleId: id, eventType, payload: {} });
      return { kind: "ok", schedule };
    });
  }
  async updateActiveScheduleForMerchant(id: string, merchantId: number, updates: ActiveScheduleChanges): Promise<PropertyScheduleMutationResult> {
    return this.mutateActiveScheduleForMerchant(id, merchantId, updates);
  }
  async terminateActiveScheduleForMerchant(id: string, merchantId: number): Promise<PropertyScheduleMutationResult> {
    return this.mutateActiveScheduleForMerchant(id, merchantId);
  }
  async getActiveSchedule(id: string): Promise<any> {
    const db = this.db; if (!db) return undefined;
    const [r] = await db.select().from(activeSchedules).where(eq(activeSchedules.id, id)).limit(1); return r;
  }
  async getActiveSchedulesByMerchant(merchantId: number): Promise<any[]> {
    if (!isManagementTenantId(merchantId)) return [];
    const db = this.db; if (!db) return [];
    return db.select().from(activeSchedules).where(and(eq(activeSchedules.merchantId, merchantId),
      sql`exists (select 1 from ${tenantProfiles} where ${tenantProfiles.id} = ${activeSchedules.tenantProfileId} and ${tenantProfiles.merchantId} = ${merchantId})`));
  }
  async updateActiveSchedule(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [r] = await db.update(activeSchedules).set({ ...updates, updatedAt: new Date() }).where(eq(activeSchedules.id, id)).returning(); return r;
  }
  async getDueActiveSchedules(now: Date): Promise<any[]> {
    const db = getDb(); if (!db) return [];
    return db.select().from(activeSchedules).where(and(eq(activeSchedules.status, "active"), lte(activeSchedules.nextRunDate, now)));
  }
  async getInvoiceRentRequestForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.select().from(invoicesRentRequests).where(and(
      eq(invoicesRentRequests.id, id), eq(invoicesRentRequests.merchantId, merchantId),
      sql`exists (select 1 from ${tenantProfiles} where ${tenantProfiles.id} = ${invoicesRentRequests.tenantProfileId} and ${tenantProfiles.merchantId} = ${merchantId})`,
    )).limit(1);
    return row;
  }
  private async mutatePropertyInvoiceForMerchant(id: string, merchantId: number, operation: "void" | "paid-external" | "resent", externalPaymentReference?: string,
    delivery?: { tenantProfileId: string; data: PropertyInvoiceDeliveryInput }): Promise<PropertyInvoiceMutationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) return { kind: "not-found" };
    return db.transaction(async (tx: any) => {
      // Find the parent without taking a child lock. Every management mutation
      // locks parent first, so it has the same lock order as profile archival.
      const [candidate] = await tx.select().from(invoicesRentRequests).where(and(
        eq(invoicesRentRequests.id, id), eq(invoicesRentRequests.merchantId, merchantId),
      )).limit(1);
      if (!candidate) return { kind: "not-found" };
      if (delivery && candidate.tenantProfileId !== delivery.tenantProfileId) return { kind: "not-found" };
      const [parent] = await tx.select().from(tenantProfiles).where(and(
        eq(tenantProfiles.id, candidate.tenantProfileId), eq(tenantProfiles.merchantId, merchantId),
      )).limit(1).for("update");
      if (!parent) return { kind: "not-found" };
      const scope = and(eq(invoicesRentRequests.id, id), eq(invoicesRentRequests.merchantId, merchantId),
        eq(invoicesRentRequests.tenantProfileId, parent.id));
      const [invoice] = await tx.select().from(invoicesRentRequests).where(scope).limit(1).for("update");
      if (!invoice) return { kind: "not-found" };
      if (invoice.status === "paid" || invoice.status === "paid_external") return { kind: "conflict", reason: "paid" };
      if (operation !== "void" && invoice.status === "voided") return { kind: "conflict", reason: "voided" };
      // Issued invoices stay payable when the profile is archived (owner decision
      // 2026-09-27). Only ownership and current invoice state gate this write.
      const now = new Date();
      const patch = operation === "void"
        ? { status: "voided", voidedAt: now, updatedAt: now }
        : operation === "paid-external"
          ? { status: "paid_external", paidAt: now, externalPaymentReference: externalPaymentReference ?? null, updatedAt: now }
          : { dispatchedAt: now, sentAt: now, updatedAt: now,
              ...(invoice.status === "pending_dispatch" || invoice.status === "dispatch_failed" ? { status: "dispatched" } : {}),
              ...(delivery?.data.channel === "whatsapp" && delivery.data.messageId ? { whatsappMessageId: delivery.data.messageId } : {}) };
      const [updated] = await tx.update(invoicesRentRequests).set(patch).where(scope).returning();
      if (!updated) return { kind: "not-found" };
      await tx.insert(transactionEvents).values({ merchantId, tenantProfileId: parent.id, invoiceId: id,
        eventType: operation === "void" ? "Invoice_Voided" : operation === "paid-external" ? "Payment_External" : "Invoice_Resent",
        payload: operation === "void" ? {} : operation === "paid-external" ? { externalPaymentReference } : { channel: delivery?.data.channel, status: updated.status } });
      return { kind: "ok", invoice: updated };
    });
  }
  async voidInvoiceRentRequestForMerchant(id: string, merchantId: number): Promise<PropertyInvoiceMutationResult> {
    return this.mutatePropertyInvoiceForMerchant(id, merchantId, "void");
  }
  async markInvoiceRentRequestPaidExternalForMerchant(id: string, merchantId: number, externalPaymentReference?: string): Promise<PropertyInvoiceMutationResult> {
    return this.mutatePropertyInvoiceForMerchant(id, merchantId, "paid-external", externalPaymentReference);
  }
  async recordInvoiceRentRequestDeliveryForMerchant(id: string, merchantId: number, tenantProfileId: string, data: PropertyInvoiceDeliveryInput): Promise<PropertyInvoiceMutationResult> {
    return this.mutatePropertyInvoiceForMerchant(id, merchantId, "resent", undefined, { tenantProfileId, data });
  }
  async getInvoiceRentRequestDeliveryForMerchant(id: string, merchantId: number): Promise<PropertyInvoiceDeliverySnapshot | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    // One statement snapshots invoice and current owned contact together.
    const [row] = await db.select({ invoice: invoicesRentRequests, tenant: tenantProfiles }).from(invoicesRentRequests)
      .innerJoin(tenantProfiles, eq(tenantProfiles.id, invoicesRentRequests.tenantProfileId))
      .where(and(eq(invoicesRentRequests.id, id), eq(invoicesRentRequests.merchantId, merchantId), eq(tenantProfiles.merchantId, merchantId))).limit(1);
    return row;
  }
  async createOrReuseInvoiceRentRequestForMerchant(tenantProfileId: string, merchantId: number, data: PropertyInvoiceInput): Promise<PropertyInvoiceCreationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) throw new Error("No database");
    const input = propertyInvoiceInput(data);
    return db.transaction(async (tx: any) => {
      const [parent] = await tx.select().from(tenantProfiles).where(and(
        eq(tenantProfiles.id, tenantProfileId), eq(tenantProfiles.merchantId, merchantId),
      )).limit(1).for("update");
      if (!parent) return { kind: "not-found" };
      if (input.documentUrl) {
        const ref = parseInvoiceDocumentRef(input.documentUrl);
        if (!ref) return { kind: "invalid-document" };
        const [document] = await tx.select({ id: uploadedFiles.id }).from(uploadedFiles).where(and(
          eq(uploadedFiles.path, ref.relPath), eq(uploadedFiles.merchantId, merchantId),
        )).limit(1).for("share");
        if (!document) return { kind: "invalid-document" };
      }
      if (input.kind !== "charge") {
        // Preserve the existing latest-live rule: if the latest live invoice is
        // a charge, create rent separately rather than searching past that charge.
        const [live] = await tx.select().from(invoicesRentRequests).where(and(
          eq(invoicesRentRequests.tenantProfileId, parent.id), eq(invoicesRentRequests.merchantId, merchantId),
          inArray(invoicesRentRequests.status, ["pending_dispatch", "dispatched", "overdue", "dispatch_failed"]),
        )).orderBy(desc(invoicesRentRequests.createdAt)).limit(1).for("update");
        if (live && live.kind !== "charge") {
          let invoice = live;
          if (input.amountCents !== live.amountCents) {
            [invoice] = await tx.update(invoicesRentRequests).set({ amountCents: input.amountCents, updatedAt: new Date() })
              .where(and(eq(invoicesRentRequests.id, live.id), eq(invoicesRentRequests.merchantId, merchantId), eq(invoicesRentRequests.tenantProfileId, parent.id))).returning();
          }
          if (!invoice) return { kind: "not-found" };
          return { kind: "ok", invoice, reused: true };
        }
      }
      const [invoice] = await tx.insert(invoicesRentRequests).values({ ...input, merchantId, tenantProfileId: parent.id,
        token: randomBytes(20).toString("base64url"), status: "pending_dispatch" }).returning();
      await tx.insert(transactionEvents).values({ merchantId, tenantProfileId: parent.id, invoiceId: invoice.id,
        eventType: input.kind === "charge" ? "Charge_Created" : "Invoice_Generated",
        payload: { amountCents: invoice.amountCents, channel: invoice.deliveryChannel,
          ...(input.kind === "charge" ? { chargeType: input.chargeType, description: input.description } : {}) } });
      return { kind: "ok", invoice, reused: false };
    });
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
  async recordInvoiceSplitSession(input: InvoiceSplitSessionInput): Promise<void> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    await db.insert(invoiceSplitSessions).values({
      windcaveSessionId: input.sessionId,
      rentInvoiceId: input.vertical === "property" ? input.invoiceId : null,
      jobInvoiceId: input.vertical === "trades" ? input.invoiceId : null,
      amountCents: input.amountCents,
      payerEmail: input.payerEmail,
    }).onConflictDoNothing();
  }
  async getInvoiceSplitSession(sessionId: string): Promise<InvoiceSplitSession | undefined> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    const [row] = await db.select().from(invoiceSplitSessions).where(eq(invoiceSplitSessions.windcaveSessionId, sessionId));
    return row;
  }
  private splitSessionInvoiceMatch(invoice: InvoiceSplitRef) {
    return invoice.vertical === "property"
      ? eq(invoiceSplitSessions.rentInvoiceId, invoice.invoiceId)
      : eq(invoiceSplitSessions.jobInvoiceId, invoice.invoiceId);
  }
  async invoiceHasSplitSessions(invoice: InvoiceSplitRef): Promise<boolean> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    const rows = await db.select({ id: invoiceSplitSessions.windcaveSessionId }).from(invoiceSplitSessions)
      .where(this.splitSessionInvoiceMatch(invoice)).limit(1);
    return rows.length > 0;
  }
  async markInvoiceSplitSessionPaid(sessionId: string, paidAt: Date): Promise<void> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    await db.update(invoiceSplitSessions).set({ paidAt })
      .where(and(eq(invoiceSplitSessions.windcaveSessionId, sessionId), isNull(invoiceSplitSessions.paidAt)));
  }
  async getPaidInvoiceSplitPayerEmails(invoice: InvoiceSplitRef): Promise<string[]> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    const rows = await db.select({ payerEmail: invoiceSplitSessions.payerEmail }).from(invoiceSplitSessions)
      .where(and(this.splitSessionInvoiceMatch(invoice), isNotNull(invoiceSplitSessions.paidAt), isNotNull(invoiceSplitSessions.payerEmail)));
    return rows.map((row) => row.payerEmail as string);
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
    if (!isManagementTenantId(merchantId)) return [];
    const db = this.db; if (!db) return [];
    const conds: any[] = [eq(invoicesRentRequests.merchantId, merchantId),
      sql`exists (select 1 from ${tenantProfiles} where ${tenantProfiles.id} = ${invoicesRentRequests.tenantProfileId} and ${tenantProfiles.merchantId} = ${merchantId})`];
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
  async createClientProfileForMerchant(merchantId: number, data: ClientProfileInput): Promise<any> {
    if (!isManagementTenantId(merchantId)) throw new Error("Invalid tenant scope");
    const db = this.db; if (!db) throw new Error("Trades requires database");
    const [row] = await db.insert(clientProfiles).values({ ...clientProfileChanges(data), merchantId,
      status: data.status === "prospect" ? "prospect" : "active" } as any).returning();
    return row;
  }
  async getClientProfileForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, id), eq(clientProfiles.merchantId, merchantId))).limit(1);
    return row;
  }
  async getClientProfile(id: string): Promise<any> {
    const db = this.db; if (!db) return undefined;
    const [row] = await db.select().from(clientProfiles).where(eq(clientProfiles.id, id));
    return row;
  }
  async getClientProfilesByMerchant(merchantId: number): Promise<any[]> {
    if (!isManagementTenantId(merchantId)) return [];
    const db = this.db; if (!db) return [];
    return db.select().from(clientProfiles)
      .where(eq(clientProfiles.merchantId, merchantId))
      .orderBy(desc(clientProfiles.createdAt));
  }
  async updateClientProfileForMerchant(id: string, merchantId: number, updates: ClientProfileChanges): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.update(clientProfiles)
      .set({ ...clientProfileChanges(updates), updatedAt: new Date() })
      .where(and(eq(clientProfiles.id, id), eq(clientProfiles.merchantId, merchantId))).returning();
    return row;
  }
  async archiveClientProfileForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    return db.transaction(async (tx: any) => {
      const now = new Date();
      // UPDATE locks the owned parent first, matching schedule management's order.
      const [row] = await tx.update(clientProfiles).set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(and(eq(clientProfiles.id, id), eq(clientProfiles.merchantId, merchantId))).returning();
      if (!row) return undefined;
      const cancelled = await tx.update(jobSchedules).set({ status: "terminated", terminatedAt: now, updatedAt: now })
        .where(and(eq(jobSchedules.merchantId, merchantId), eq(jobSchedules.clientProfileId, id), ne(jobSchedules.status, "terminated"))).returning();
      for (const schedule of cancelled) await tx.insert(jobEvents).values({ merchantId, clientProfileId: id,
        scheduleId: schedule.id, eventType: "schedule_terminated", payload: { reason: "client_archived" } });
      return row;
    });
  }
  async unarchiveClientProfileForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.update(clientProfiles)
      .set({ status: "active", archivedAt: null, updatedAt: new Date() })
      .where(and(eq(clientProfiles.id, id), eq(clientProfiles.merchantId, merchantId))).returning();
    return row;
  }
  async promoteClientProfileForMerchant(id: string, merchantId: number): Promise<ClientProfilePromotionResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) return { kind: "not-found" };
    return db.transaction(async (tx: any) => {
      const scope = and(eq(clientProfiles.id, id), eq(clientProfiles.merchantId, merchantId));
      const [client] = await tx.select().from(clientProfiles).where(scope).limit(1).for("update");
      if (!client) return { kind: "not-found" };
      if (client.status !== "prospect") return { kind: "conflict" };
      const [updated] = await tx.update(clientProfiles).set({ status: "active", updatedAt: new Date() }).where(scope).returning();
      return updated ? { kind: "ok", client: updated } : { kind: "not-found" };
    });
  }

  // ───────── Trades: quotes ─────────
  /** The business's own client, row-locked for a create: the same first lock as the client's archive. */
  private async lockOwnedTradesClient(tx: any, id: string, merchantId: number): Promise<any | undefined> {
    const [parent] = await tx.select().from(clientProfiles)
      .where(and(eq(clientProfiles.id, id), eq(clientProfiles.merchantId, merchantId))).limit(1).for("update");
    return parent;
  }
  /** No attachment, or the business's own upload held under a share lock through the insert (gap 13). */
  private async holdOwnedInvoiceDocument(tx: any, merchantId: number, documentUrl: string | null | undefined): Promise<boolean> {
    if (!documentUrl) return true;
    const ref = parseInvoiceDocumentRef(documentUrl);
    if (!ref) return false;
    const [document] = await tx.select({ id: uploadedFiles.id }).from(uploadedFiles)
      .where(and(eq(uploadedFiles.path, ref.relPath), eq(uploadedFiles.merchantId, merchantId))).limit(1).for("share");
    return !!document;
  }
  private async insertTradesProspect(tx: any, merchantId: number, prospect: ClientProfileChanges): Promise<any> {
    const [row] = await tx.insert(clientProfiles).values({ ...clientProfileChanges(prospect), merchantId, status: "prospect" } as any).returning();
    return row;
  }
  async createQuoteForMerchant(merchantId: number, client: TradesClientRef, data: QuoteInput): Promise<QuoteCreationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) throw new Error("Trades requires database");
    const input = quoteInput(data);
    return db.transaction(async (tx: any) => {
      // A refusal returned from here still commits what was written before it, so
      // every check comes first and the hidden prospect is made last.
      let parent = "clientProfileId" in client ? await this.lockOwnedTradesClient(tx, client.clientProfileId, merchantId) : undefined;
      if ("clientProfileId" in client && !parent) return { kind: "not-found" };
      if (!(await this.holdOwnedInvoiceDocument(tx, merchantId, input.documentUrl))) return { kind: "invalid-document" };
      if (!parent) parent = await this.insertTradesProspect(tx, merchantId, (client as { prospect: ClientProfileChanges }).prospect);
      const [quote] = await tx.insert(quotes).values({ ...input, merchantId, clientProfileId: parent.id,
        token: randomBytes(20).toString("base64url"), status: "sent", sentAt: new Date() }).returning();
      await tx.insert(jobEvents).values({ merchantId, clientProfileId: parent.id, quoteId: quote.id, eventType: "quote_sent" });
      return { kind: "ok", quote, client: parent };
    });
  }
  async recordQuoteDeliveryForMerchant(id: string, merchantId: number, clientProfileId: string, record: TradesQuoteDeliveryRecord): Promise<boolean> {
    if (!isManagementTenantId(merchantId)) return false;
    const db = this.db; if (!db) return false;
    return db.transaction(async (tx: any) => {
      // The quote went (or failed to go) to this captured client: its history line
      // needs that client and the quote both still the business's, client first.
      const parent = await this.lockOwnedTradesClient(tx, clientProfileId, merchantId);
      if (!parent) return false;
      const [quote] = await tx.select({ id: quotes.id }).from(quotes)
        .where(and(eq(quotes.id, id), eq(quotes.merchantId, merchantId), eq(quotes.clientProfileId, parent.id))).limit(1).for("share");
      if (!quote) return false;
      await tx.insert(jobEvents).values({ merchantId, clientProfileId: parent.id, quoteId: id,
        eventType: record.sent ? "quote_dispatched" : "quote_dispatch_failed", payload: { channel: record.channel, reason: record.reason } });
      return true;
    });
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
    if (!isManagementTenantId(merchantId)) return [];
    const db = this.db; if (!db) return [];
    const conds: any[] = [eq(quotes.merchantId, merchantId),
      sql`exists (select 1 from ${clientProfiles} where ${clientProfiles.id} = ${quotes.clientProfileId} and ${clientProfiles.merchantId} = ${merchantId})`];
    if (opts.status) conds.push(eq(quotes.status, opts.status));
    return db.select().from(quotes).where(and(...conds)).orderBy(desc(quotes.createdAt));
  }
  async getQuoteDeliveryForMerchant(id: string, merchantId: number): Promise<TradesQuoteDeliverySnapshot | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    // One statement snapshots the quote and its current owned client together.
    const [row] = await db.select({ quote: quotes, client: clientProfiles }).from(quotes)
      .innerJoin(clientProfiles, eq(clientProfiles.id, quotes.clientProfileId))
      .where(and(eq(quotes.id, id), eq(quotes.merchantId, merchantId), eq(clientProfiles.merchantId, merchantId))).limit(1);
    return row;
  }
  async updateQuote(id: string, updates: any): Promise<any> {
    const db = getDb(); if (!db) return undefined;
    const [row] = await db.update(quotes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(quotes.id, id)).returning();
    return row;
  }

  // ───────── Trades: job invoices ─────────
  async getJobInvoiceForMerchant(id: string, merchantId: number): Promise<any> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    const [row] = await db.select().from(jobInvoices).where(and(
      eq(jobInvoices.id, id), eq(jobInvoices.merchantId, merchantId),
      sql`exists (select 1 from ${clientProfiles} where ${clientProfiles.id} = ${jobInvoices.clientProfileId} and ${clientProfiles.merchantId} = ${merchantId})`,
    )).limit(1);
    return row;
  }
  async getJobInvoiceDeliveryForMerchant(id: string, merchantId: number): Promise<TradesInvoiceDeliverySnapshot | undefined> {
    if (!isManagementTenantId(merchantId)) return undefined;
    const db = this.db; if (!db) return undefined;
    // One statement snapshots the invoice and its current owned client together.
    const [row] = await db.select({ invoice: jobInvoices, client: clientProfiles }).from(jobInvoices)
      .innerJoin(clientProfiles, eq(clientProfiles.id, jobInvoices.clientProfileId))
      .where(and(eq(jobInvoices.id, id), eq(jobInvoices.merchantId, merchantId), eq(clientProfiles.merchantId, merchantId))).limit(1);
    return row;
  }
  private async mutateJobInvoiceForMerchant(id: string, merchantId: number, operation: "void" | "paid-external" | "complete" | "dispatched",
    externalPaymentReference?: string, delivery?: { clientProfileId: string; record: TradesInvoiceDeliveryRecord }): Promise<JobInvoiceMutationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) return { kind: "not-found" };
    return db.transaction(async (tx: any) => {
      // Find the client without taking a child lock. Every management mutation
      // locks the owned client first, the same order as the client's archive.
      const [candidate] = await tx.select({ clientProfileId: jobInvoices.clientProfileId }).from(jobInvoices)
        .where(and(eq(jobInvoices.id, id), eq(jobInvoices.merchantId, merchantId))).limit(1);
      if (!candidate) return { kind: "not-found" };
      // A delivery is recorded only for the client its message was sent to.
      if (delivery && candidate.clientProfileId !== delivery.clientProfileId) return { kind: "not-found" };
      const [parent] = await tx.select().from(clientProfiles)
        .where(and(eq(clientProfiles.id, candidate.clientProfileId), eq(clientProfiles.merchantId, merchantId)))
        .limit(1).for("update");
      if (!parent) return { kind: "not-found" };
      const scope = and(eq(jobInvoices.id, id), eq(jobInvoices.merchantId, merchantId), eq(jobInvoices.clientProfileId, parent.id));
      const [invoice] = await tx.select().from(jobInvoices).where(scope).limit(1).for("update");
      if (!invoice) return { kind: "not-found" };
      // An archived client's issued invoices stay manageable (owner decision
      // 2026-09-27). Only ownership and the invoice's current state gate the write.
      const paid = invoice.status === "paid" || invoice.status === "paid_external";
      if (operation === "complete") {
        if (invoice.kind === "deposit") return { kind: "conflict", reason: "deposit" };
        if (!paid) return { kind: "conflict", reason: "unpaid" };
      } else {
        if (operation !== "void" && invoice.status === "voided") return { kind: "conflict", reason: "voided" };
        if (paid) return { kind: "conflict", reason: "paid" };
      }
      const now = new Date();
      const patch = operation === "void"
        ? { status: "voided", voidedAt: now, updatedAt: now }
        : operation === "paid-external"
          ? { status: "paid_external", paidAt: now, externalPaymentReference: externalPaymentReference ?? null, updatedAt: now }
          : operation === "complete"
            ? { completedAt: now, updatedAt: now }
            // A delivery: only an invoice still waiting to go becomes dispatched, and
            // only WhatsApp's message id is kept (its status callback looks it up).
            : { dispatchedAt: now, sentAt: now, updatedAt: now,
                ...(invoice.status === "pending_dispatch" || invoice.status === "dispatch_failed" ? { status: "dispatched" } : {}),
                ...(delivery?.record.channel === "whatsapp" && delivery.record.messageId ? { whatsappMessageId: delivery.record.messageId } : {}) };
      const [updated] = await tx.update(jobInvoices).set(patch).where(scope).returning();
      if (!updated) return { kind: "not-found" };
      await tx.insert(jobEvents).values({ merchantId, clientProfileId: parent.id, jobInvoiceId: id,
        eventType: operation === "void" ? "invoice_voided" : operation === "paid-external" ? "paid_external" : operation === "complete" ? "job_completed" : "invoice_dispatched",
        ...(operation === "dispatched" ? { payload: { channel: delivery?.record.channel } } : {}) });
      return { kind: "ok", invoice: updated };
    });
  }
  async voidJobInvoiceForMerchant(id: string, merchantId: number): Promise<JobInvoiceMutationResult> {
    return this.mutateJobInvoiceForMerchant(id, merchantId, "void");
  }
  async markJobInvoicePaidExternalForMerchant(id: string, merchantId: number, externalPaymentReference?: string): Promise<JobInvoiceMutationResult> {
    return this.mutateJobInvoiceForMerchant(id, merchantId, "paid-external", externalPaymentReference);
  }
  async completeJobInvoiceForMerchant(id: string, merchantId: number): Promise<JobInvoiceMutationResult> {
    return this.mutateJobInvoiceForMerchant(id, merchantId, "complete");
  }
  async recordJobInvoiceReceiptForMerchant(id: string, merchantId: number, clientProfileId: string, receipt: TradesReceiptRecord): Promise<boolean> {
    if (!isManagementTenantId(merchantId)) return false;
    const db = this.db; if (!db) return false;
    return db.transaction(async (tx: any) => {
      // The receipt went to this captured client: its history line needs that
      // client and the invoice both still owned, client first as above.
      const [parent] = await tx.select({ id: clientProfiles.id }).from(clientProfiles)
        .where(and(eq(clientProfiles.id, clientProfileId), eq(clientProfiles.merchantId, merchantId)))
        .limit(1).for("update");
      if (!parent) return false;
      const [invoice] = await tx.select({ id: jobInvoices.id }).from(jobInvoices)
        .where(and(eq(jobInvoices.id, id), eq(jobInvoices.merchantId, merchantId), eq(jobInvoices.clientProfileId, parent.id)))
        .limit(1).for("update");
      if (!invoice) return false;
      await tx.insert(jobEvents).values({ merchantId, clientProfileId: parent.id, jobInvoiceId: id,
        eventType: receipt.sent ? "invoice_email_sent" : "invoice_email_failed", payload: { reference: receipt.reference } });
      return true;
    });
  }
  async recordJobInvoiceDeliveryForMerchant(id: string, merchantId: number, clientProfileId: string, record: TradesInvoiceDeliveryRecord): Promise<JobInvoiceMutationResult> {
    return this.mutateJobInvoiceForMerchant(id, merchantId, "dispatched", undefined, { clientProfileId, record });
  }
  async createJobInvoiceForMerchant(merchantId: number, client: TradesClientRef, data: JobInvoiceInput): Promise<JobInvoiceCreationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) throw new Error("Trades requires database");
    const input = jobInvoiceInput(data);
    return db.transaction(async (tx: any) => {
      // As the quote create: every check first, the hidden prospect last.
      let parent = "clientProfileId" in client ? await this.lockOwnedTradesClient(tx, client.clientProfileId, merchantId) : undefined;
      if ("clientProfileId" in client && !parent) return { kind: "not-found" };
      if (input.quoteId) {
        // A deposit's quote must be the business's and this client's, held through
        // the insert. A quick invoice's prospect has no quote.
        if (!parent) return { kind: "quote-not-found" };
        const [quote] = await tx.select({ id: quotes.id }).from(quotes)
          .where(and(eq(quotes.id, input.quoteId), eq(quotes.merchantId, merchantId), eq(quotes.clientProfileId, parent.id))).limit(1).for("share");
        if (!quote) return { kind: "quote-not-found" };
      }
      if (!(await this.holdOwnedInvoiceDocument(tx, merchantId, input.documentUrl))) return { kind: "invalid-document" };
      if (!parent) parent = await this.insertTradesProspect(tx, merchantId, (client as { prospect: ClientProfileChanges }).prospect);
      const [invoice] = await tx.insert(jobInvoices).values({ ...input, merchantId, clientProfileId: parent.id,
        token: randomBytes(20).toString("base64url"), status: "pending_dispatch" }).returning();
      await tx.insert(jobEvents).values({ merchantId, clientProfileId: parent.id, jobInvoiceId: invoice.id, eventType: "invoice_sent" });
      return { kind: "ok", invoice, client: parent };
    });
  }
  async createJobBalanceInvoiceForMerchant(depositInvoiceId: string, merchantId: number, splitEnabled: boolean): Promise<JobBalanceCreationResult> {
    if (!isManagementTenantId(merchantId)) return { kind: "not-found" };
    const db = this.db; if (!db) throw new Error("Trades requires database");
    return db.transaction(async (tx: any) => {
      const [candidate] = await tx.select({ clientProfileId: jobInvoices.clientProfileId }).from(jobInvoices)
        .where(and(eq(jobInvoices.id, depositInvoiceId), eq(jobInvoices.merchantId, merchantId))).limit(1);
      if (!candidate) return { kind: "not-found" };
      const parent = await this.lockOwnedTradesClient(tx, candidate.clientProfileId, merchantId);
      if (!parent) return { kind: "not-found" };
      const [deposit] = await tx.select().from(jobInvoices)
        .where(and(eq(jobInvoices.id, depositInvoiceId), eq(jobInvoices.merchantId, merchantId), eq(jobInvoices.clientProfileId, parent.id)))
        .limit(1).for("update");
      if (!deposit) return { kind: "not-found" };
      if (deposit.kind !== "deposit") return { kind: "conflict", reason: "not-deposit" };
      if (!["paid", "paid_external", "deposit_paid"].includes(deposit.status)) return { kind: "conflict", reason: "unpaid" };
      if (!deposit.quoteId) return { kind: "conflict", reason: "no-quote" };
      const [quote] = await tx.select().from(quotes)
        .where(and(eq(quotes.id, deposit.quoteId), eq(quotes.merchantId, merchantId))).limit(1).for("share");
      if (!quote) return { kind: "conflict", reason: "quote-not-found" };
      // Everything already billed to this client on the quote and not voided (the
      // deposit plus any other invoice), read inside the client's lock: two sends
      // cannot both find no balance, and a balance never double-bills.
      const onQuote = await tx.select().from(jobInvoices)
        .where(and(eq(jobInvoices.merchantId, merchantId), eq(jobInvoices.clientProfileId, parent.id),
          eq(jobInvoices.quoteId, deposit.quoteId), ne(jobInvoices.status, "voided")));
      if (onQuote.some((invoice: any) => invoice.kind === "balance")) return { kind: "conflict", reason: "exists" };
      const alreadyBilled = onQuote.reduce((sum: number, invoice: any) => sum + (invoice.amountCents || 0), 0);
      const balanceCents = Math.max(quote.totalCents - alreadyBilled, 0);
      if (balanceCents <= 0) return { kind: "conflict", reason: "none-remaining" };
      const due = new Date(); due.setDate(due.getDate() + 7);
      const [invoice] = await tx.insert(jobInvoices).values({ merchantId, clientProfileId: parent.id, quoteId: deposit.quoteId,
        kind: "balance", amountCents: balanceCents, token: randomBytes(20).toString("base64url"),
        deliveryChannel: deposit.deliveryChannel, status: "pending_dispatch", dueAt: due, splitEnabled: !!splitEnabled }).returning();
      await tx.insert(jobEvents).values({ merchantId, clientProfileId: parent.id, jobInvoiceId: invoice.id, eventType: "balance_sent" });
      return { kind: "ok", invoice };
    });
  }
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
    if (!isManagementTenantId(merchantId)) return [];
    const db = this.db; if (!db) return [];
    const conds: any[] = [eq(jobInvoices.merchantId, merchantId),
      sql`exists (select 1 from ${clientProfiles} where ${clientProfiles.id} = ${jobInvoices.clientProfileId} and ${clientProfiles.merchantId} = ${merchantId})`];
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
  async getJobEventsByClientForMerchant(clientProfileId: string, merchantId: number, limit = 50): Promise<any[]> {
    if (!isManagementTenantId(merchantId)) return [];
    const db = this.db; if (!db) return [];
    return db.select().from(jobEvents)
      .where(and(eq(jobEvents.clientProfileId, clientProfileId), eq(jobEvents.merchantId, merchantId),
        sql`exists (select 1 from ${clientProfiles} where ${clientProfiles.id} = ${jobEvents.clientProfileId} and ${clientProfiles.merchantId} = ${merchantId})`))
      .orderBy(desc(jobEvents.createdAt)).limit(limit);
  }

  // ───────── Uploaded file blobs ─────────
  async saveUploadedFile(relPath: string, mimeType: string, data: Buffer, merchantId: number): Promise<void> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    if (!isTenantId(merchantId)) throw new Error("A valid merchantId is required to save an upload");
    // The conflict branch only fires for the row's own tenant. When the path is
    // already owned by a different merchant (or by no one — a NULL-tenant legacy
    // row, which `merchant_id = <n>` never matches), ON CONFLICT ... WHERE is
    // false, nothing is written and RETURNING is empty: refuse rather than
    // overwrite or re-stamp another tenant's file.
    const written = await db.insert(uploadedFiles)
      .values({ path: relPath, mimeType, data, merchantId })
      .onConflictDoUpdate({
        target: uploadedFiles.path,
        set: { mimeType, data, createdAt: new Date() },
        setWhere: eq(uploadedFiles.merchantId, merchantId),
      })
      .returning({ id: uploadedFiles.id });
    if (written.length === 0) throw new UploadPathOwnershipError();
  }

  async getUploadedFile(relPath: string): Promise<{ mimeType: string; data: Buffer } | undefined> {
    const db = this.db; if (!db) return undefined;
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.path, relPath));
    return file ? { mimeType: file.mimeType, data: file.data } : undefined;
  }

  async getUploadedFileForMerchant(relPath: string, merchantId: number): Promise<{ mimeType: string; data: Buffer } | undefined> {
    const db = this.db; if (!db || !isTenantId(merchantId)) return undefined;
    const [file] = await db.select({ mimeType: uploadedFiles.mimeType, data: uploadedFiles.data })
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.path, relPath), eq(uploadedFiles.merchantId, merchantId)));
    return file ? { mimeType: file.mimeType, data: file.data } : undefined;
  }

  async uploadedFileOwnedByMerchant(relPath: string, merchantId: number): Promise<boolean> {
    const db = this.db; if (!db || !isTenantId(merchantId)) return false;
    // Selects the id only — the blob is never read for an ownership check.
    const [row] = await db.select({ id: uploadedFiles.id })
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.path, relPath), eq(uploadedFiles.merchantId, merchantId)))
      .limit(1);
    return !!row;
  }

  async deleteUploadedFile(relPath: string, merchantId: number): Promise<void> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    if (!isTenantId(merchantId)) return;
    await db.delete(uploadedFiles).where(and(eq(uploadedFiles.path, relPath), eq(uploadedFiles.merchantId, merchantId)));
  }

  async recordInvoiceDocumentAdminRead(adminUserId: number, documentName: string): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    await this.db.insert(invoiceDocumentAccessAudit).values({ adminUserId, documentName });
  }

  async createAuthHandoffCode(input: { codeHash: string; userId: number; newUser: boolean; expiresAt: Date }): Promise<void> {
    if (!this.db) throw new Error("Database not connected");
    // A code lives 60 seconds; rows a day past expiry are reclaimed on the way in.
    await this.db.delete(authHandoffCodes)
      .where(lt(authHandoffCodes.expiresAt, sql`now() - interval '1 day'`));
    await this.db.insert(authHandoffCodes).values({
      codeHash: input.codeHash,
      userId: input.userId,
      newUser: input.newUser,
      expiresAt: input.expiresAt,
    });
  }

  async consumeAuthHandoffCode(codeHash: string, now: Date): Promise<{ userId: number; newUser: boolean } | undefined> {
    if (!this.db) throw new Error("Database not connected");
    // One statement: of two concurrent redemptions, exactly one sees consumed_at IS NULL.
    const rows = await this.db.update(authHandoffCodes)
      .set({ consumedAt: now })
      .where(and(
        eq(authHandoffCodes.codeHash, codeHash),
        isNull(authHandoffCodes.consumedAt),
        gt(authHandoffCodes.expiresAt, now),
      ))
      .returning({ userId: authHandoffCodes.userId, newUser: authHandoffCodes.newUser });
    return rows[0];
  }

  async advanceUserSessionVersion(userId: number): Promise<boolean> {
    if (!this.db) throw new Error("Database not connected");
    // One statement, so concurrent calls each advance it: none is lost.
    const rows = await this.db.update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return rows.length === 1;
  }

  async takeAuthThrottleSlot(buckets: readonly AuthThrottleBucket[], now: Date): Promise<AuthThrottleTake> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    const unique = uniqueAuthThrottleBuckets(buckets);
    if (unique.length === 0) return { allowed: true };
    const keys = unique.map((bucket) => bucket.key);
    // Reclaim rows no policy counts any more, a bounded batch per attempt. SKIP
    // LOCKED: a row another attempt holds is left for later — never waited on, and
    // never deleted after that attempt has counted it afresh.
    await db.execute(sql`DELETE FROM auth_throttle WHERE bucket_key IN (
      SELECT bucket_key FROM auth_throttle
      WHERE updated_at < ${new Date(now.getTime() - AUTH_THROTTLE_RECLAIM_AFTER_MS)}
      LIMIT 100 FOR UPDATE SKIP LOCKED)`);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      // Hold every bucket's row, in key order (so two attempts never deadlock),
      // before deciding: of concurrent attempts on any instance, each sees the
      // counts the ones before it wrote. A row must exist to be locked, and another
      // attempt's reclaim or a reset can delete one between the insert and the
      // lock — so insert again until all are held.
      let rows: AuthThrottleRow[] = [];
      for (let round = 0; rows.length < keys.length; round += 1) {
        if (round === 3) throw new Error("auth throttle rows kept disappearing while being locked");
        await tx.insert(authThrottle)
          .values(keys.map((bucketKey) => ({ bucketKey, failures: 0, windowStartedAt: now, nextAllowedAt: null, updatedAt: now })))
          .onConflictDoNothing();
        rows = await tx.select().from(authThrottle)
          .where(inArray(authThrottle.bucketKey, keys))
          .orderBy(asc(authThrottle.bucketKey))
          .for("update");
      }
      const plan = planAuthThrottleTake(unique, rows, now);
      // Refused: nothing is counted (a row inserted just now holds zero).
      if (!plan.allowed) return plan;
      for (const row of plan.charged) {
        await tx.update(authThrottle)
          .set({ failures: row.failures, windowStartedAt: row.windowStartedAt, nextAllowedAt: row.nextAllowedAt, updatedAt: row.updatedAt })
          .where(eq(authThrottle.bucketKey, row.bucketKey));
      }
      return { allowed: true } as const;
    });
  }

  async settleAuthThrottle(buckets: readonly AuthThrottleBucket[], outcome: AuthThrottleOutcome, now: Date): Promise<void> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    // One row per statement, in key order: each is atomic on its own.
    for (const { key } of uniqueAuthThrottleBuckets(buckets)) {
      await db.update(authThrottle)
        .set(outcome === "success"
          ? { failures: 0, windowStartedAt: now, nextAllowedAt: null, updatedAt: now }
          : { failures: sql`GREATEST(${authThrottle.failures} - 1, 0)`, nextAllowedAt: null, updatedAt: now })
        .where(eq(authThrottle.bucketKey, key));
    }
  }

  async forgetAuthThrottle(keys: readonly string[], keyPrefixes: readonly string[]): Promise<void> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    if (keys.length > 0) await db.delete(authThrottle).where(inArray(authThrottle.bucketKey, [...keys]));
    for (const prefix of keyPrefixes) {
      await db.delete(authThrottle).where(like(authThrottle.bucketKey, `${prefix.replace(/[\\%_]/g, "\\$&")}%`));
    }
  }

  // R1-T4 phase E. Every change is one conditional statement, so concurrent requests on any
  // instance cannot both make an offer, both promote, or revive an ended session.
  async createAuthSession(session: NewAuthSession, now: Date): Promise<void> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    await db.delete(authSessions)
      .where(lt(authSessions.absoluteExpiresAt, new Date(now.getTime() - SESSION_RECLAIM_AFTER_MS)));
    await db.insert(authSessions).values(session);
  }

  async getAuthSession(id: string): Promise<AuthSession | undefined> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    const rows = await db.select().from(authSessions).where(eq(authSessions.id, id)).limit(1);
    return rows[0];
  }

  async offerAuthSessionSecret(
    id: string,
    offer: { secretHash: string; now: Date; rotateBefore: Date; reofferBefore: Date },
  ): Promise<boolean> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    const rows = await db.update(authSessions)
      .set({ offeredSecretHash: offer.secretHash, offeredAt: offer.now })
      .where(and(
        eq(authSessions.id, id),
        isNull(authSessions.revokedAt),
        lte(authSessions.rotatedAt, offer.rotateBefore),
        or(isNull(authSessions.offeredAt), lte(authSessions.offeredAt, offer.reofferBefore)),
      ))
      .returning({ id: authSessions.id });
    return rows.length === 1;
  }

  async promoteAuthSessionSecret(
    id: string,
    promotion: { offeredSecretHash: string; now: Date; previousValidUntil: Date },
  ): Promise<boolean> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    // Every right-hand side reads the row as it was, so the current secret becomes the previous one.
    const rows = await db.update(authSessions)
      .set({
        previousSecretHash: sql`${authSessions.secretHash}`,
        previousValidUntil: promotion.previousValidUntil,
        secretHash: sql`${authSessions.offeredSecretHash}`,
        offeredSecretHash: null,
        offeredAt: null,
        rotatedAt: promotion.now,
      })
      .where(and(
        eq(authSessions.id, id),
        isNull(authSessions.revokedAt),
        eq(authSessions.offeredSecretHash, promotion.offeredSecretHash),
      ))
      .returning({ id: authSessions.id });
    return rows.length === 1;
  }

  async touchAuthSession(id: string, now: Date, idleExpiresAt: Date): Promise<void> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    await db.update(authSessions)
      .set({ lastUsedAt: now, idleExpiresAt })
      .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt), lt(authSessions.lastUsedAt, now)));
  }

  async revokeAuthSession(id: string, reason: string, now: Date): Promise<boolean> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    const rows = await db.update(authSessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return rows.length === 1;
  }

  async revokeAuthSessionsForLogin(userId: number, reason: string, now: Date, keepId?: string): Promise<number> {
    const db = this.db; if (!db) throw new Error("Database not connected");
    const rows = await db.update(authSessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(and(
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.idleExpiresAt, now),
        gt(authSessions.absoluteExpiresAt, now),
        ...(keepId ? [ne(authSessions.id, keepId)] : []),
      ))
      .returning({ id: authSessions.id });
    return rows.length;
  }

  async consumeInvoiceDocumentReadLimit(token: string): Promise<boolean> {
    if (!this.db) throw new Error("Database not connected");
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      // Reclaim spent counters. The route counts only real invoices (it looks
      // the link up first), so this holds at most one row per invoice whose
      // document was opened in the last minute — nothing a made-up link can grow.
      await tx.delete(invoiceDocumentReadLimits)
        .where(lte(invoiceDocumentReadLimits.expiresAt, sql`clock_timestamp()`));
      // One atomic upsert per link: concurrent requests on any instance cannot
      // both take the last unit of the budget.
      const result = await tx.execute(sql`
        INSERT INTO invoice_document_read_limits (key, count, expires_at)
        VALUES (${documentReadTokenKey(token)}, 1, clock_timestamp() + interval '60 seconds')
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN invoice_document_read_limits.expires_at <= clock_timestamp()
                       THEN 1 ELSE invoice_document_read_limits.count + 1 END,
          expires_at = CASE WHEN invoice_document_read_limits.expires_at <= clock_timestamp()
                            THEN clock_timestamp() + interval '60 seconds'
                            ELSE invoice_document_read_limits.expires_at END
        WHERE invoice_document_read_limits.expires_at <= clock_timestamp()
           OR invoice_document_read_limits.count < ${DOCUMENT_READ_TOKEN_LIMIT}
        RETURNING key`);
      return result.rows.length === 1;
    });
  }

}

// ── Storage selection ────────────────────────────────────────────────────────
// In production, a database connection is mandatory. If DATABASE_URL is missing
// or the Neon client could not be initialised, fail fast so the deployment logs
// surface a clear error instead of silently running on in-memory storage where
// every restart would permanently lose all merchant and transaction data.
const _isProduction = config.isProduction;
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
  const rawUrl = config.databaseUrl ?? '';
  // Extract just the host portion — never log credentials.
  const dbHost = rawUrl.replace(/^[^@]*@/, '').split('/')[0] || 'unknown host';
  console.log(`✅ Storage: DatabaseStorage (Neon PostgreSQL @ ${dbHost})`);
} else {
  console.log('⚠️  Storage: MemStorage — data will NOT persist across restarts (dev mode)');
}
