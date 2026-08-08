import {
  normalizePushNotificationPreferences,
  type Merchant,
  type Transaction,
  type User,
  type SubscriptionBillingHistory,
} from "@shared/schema";
import { planForOrDefault } from "@shared/plans";

type MerchantInput = Merchant & Record<string, unknown>;
type TransactionInput = Transaction & Record<string, unknown>;

/** Allowlisted push-settings projection; never pass a subscription row to JSON. */
export function pushNotificationPreferencesDto(value: unknown) {
  const preferences = normalizePushNotificationPreferences(value);
  return {
    paymentReceived: preferences.paymentReceived,
    dailyPayoutSummary: preferences.dailyPayoutSummary,
    failedPaymentAlerts: preferences.failedPaymentAlerts,
  };
}

/**
 * Owner view of a subscription. Allowlisted: the row carries the Windcave card
 * token and the superseded Stripe columns, none of which may reach a browser.
 */
export function subscriptionDto(subscription: any, seatsInUse: number) {
  const plan = planForOrDefault(subscription?.planId);
  const pendingPlan = subscription?.pendingPlanId
    ? planForOrDefault(subscription.pendingPlanId)
    : null;
  return {
    planId: plan.id,
    planName: plan.name,
    priceCents: subscription?.priceCents ?? plan.priceCents,
    seatLimit: subscription?.seatLimit ?? plan.seats,
    seatsInUse,
    status: subscription?.status ?? "active",
    currentPeriodStart: subscription?.currentPeriodStart ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    nextBillingDate: subscription?.nextBillingDate ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    cancellationEffectiveDate: subscription?.cancellationEffectiveDate ?? null,
    pendingPlanId: pendingPlan?.id ?? null,
    pendingPlanName: pendingPlan?.name ?? null,
    pendingPlanEffectiveAt: subscription?.pendingPlanEffectiveAt ?? null,
    failedPaymentCount: subscription?.failedPaymentCount ?? 0,
    // Masked card metadata only — never the Windcave card token.
    card: subscription?.cardLast4
      ? {
          brand: subscription.cardBrand,
          last4: subscription.cardLast4,
          expiry: subscription.cardExpiry,
        }
      : null,
    currentMonthTransactions: subscription?.currentMonthTransactions ?? 0,
    totalLifetimeTransactions: subscription?.totalLifetimeTransactions ?? 0,
  };
}

/** Browser billing history omits provider ids, idempotency keys and tenant ids. */
export function billingHistoryDto(entry: SubscriptionBillingHistory) {
  return {
    id: entry.id,
    billingType: entry.billingType,
    amount: entry.amount,
    status: entry.status,
    description: entry.description,
    failureReason: entry.failureReason,
    billingPeriodStart: entry.billingPeriodStart,
    billingPeriodEnd: entry.billingPeriodEnd,
    paidAt: entry.paidAt,
    createdAt: entry.createdAt,
  };
}

/** Team seat view. Password hashes and invite tokens never leave the server. */
export function teamMemberDto(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export function publicMerchantBrandDto(merchant: MerchantInput) {
  return {
    id: merchant.id,
    name: merchant.name,
    businessName: merchant.businessName,
    businessAddress: merchant.businessAddress,
    contactEmail: merchant.contactEmail,
    contactPhone: merchant.contactPhone,
    gstNumber: merchant.gstNumber,
    nzbn: merchant.nzbn,
    customLogoUrl: merchant.customLogoUrl,
    themeId: merchant.themeId,
  };
}

export function ownerMerchantDto(merchant: MerchantInput) {
  return {
    id: merchant.id,
    name: merchant.name,
    businessName: merchant.businessName,
    businessType: merchant.businessType,
    email: merchant.email,
    phone: merchant.phone,
    address: merchant.address,
    status: merchant.status,
    qrCodeUrl: merchant.qrCodeUrl,
    paymentUrl: merchant.paymentUrl,
    director: merchant.director,
    nzbn: merchant.nzbn,
    contactEmail: merchant.contactEmail,
    contactPhone: merchant.contactPhone,
    businessAddress: merchant.businessAddress,
    businessDescription: merchant.businessDescription,
    websiteUrl: merchant.websiteUrl,
    estimatedAnnualTurnover: merchant.estimatedAnnualTurnover,
    gstNumber: merchant.gstNumber,
    customLogoUrl: merchant.customLogoUrl,
    themeId: merchant.themeId,
    emailVerified: merchant.emailVerified,
    onboardingCompleted: merchant.onboardingCompleted,
    gstRegistered: merchant.gstRegistered,
    tradeGstMode: merchant.tradeGstMode,
    dailyGoal: merchant.dailyGoal,
    tutorialGeneration: merchant.tutorialGeneration,
    tutorialAutoEnabled: merchant.tutorialAutoEnabled,
    billingCardLast4: merchant.billingCardLast4,
    billingCardBrand: merchant.billingCardBrand,
    billingCardExpiry: merchant.billingCardExpiry,
    windcaveApiConfigured: Boolean(merchant.windcaveApiKey),
    rentReminderEnabled: merchant.rentReminderEnabled,
    rentReminderDelayDays: merchant.rentReminderDelayDays,
    rentReminderIntervalDays: merchant.rentReminderIntervalDays,
    rentReminderMaxCount: merchant.rentReminderMaxCount,
    tradeRemindersEnabled: merchant.tradeRemindersEnabled,
    createdAt: merchant.createdAt,
    updatedAt: merchant.updatedAt,
  };
}

export function adminMerchantSummaryDto(merchant: MerchantInput) {
  return {
    id: merchant.id,
    name: merchant.name,
    businessName: merchant.businessName,
    email: merchant.email,
    status: merchant.status,
    director: merchant.director,
    nzbn: merchant.nzbn,
    createdAt: merchant.createdAt,
  };
}

export function adminMerchantDto(merchant: MerchantInput) {
  return {
    ...adminMerchantSummaryDto(merchant),
    businessType: merchant.businessType,
    phone: merchant.phone,
    address: merchant.address,
    qrCodeUrl: merchant.qrCodeUrl,
    paymentUrl: merchant.paymentUrl,
    director: merchant.director,
    contactEmail: merchant.contactEmail,
    contactPhone: merchant.contactPhone,
    businessAddress: merchant.businessAddress,
    businessDescription: merchant.businessDescription,
    websiteUrl: merchant.websiteUrl,
    estimatedAnnualTurnover: merchant.estimatedAnnualTurnover,
    gstNumber: merchant.gstNumber,
    customLogoUrl: merchant.customLogoUrl,
    windcaveMerchantId: merchant.windcaveMerchantId,
    windcaveApiConfigured: Boolean(merchant.windcaveApiKey),
    emailVerified: merchant.emailVerified,
    onboardingCompleted: merchant.onboardingCompleted,
    gstRegistered: merchant.gstRegistered,
    tradeGstMode: merchant.tradeGstMode,
    createdAt: merchant.createdAt,
    updatedAt: merchant.updatedAt,
  };
}

function transactionAddressFields(transaction: TransactionInput) {
  const result: Record<string, unknown> = {};
  if (typeof transaction.paymentUrl === "string") result.paymentUrl = transaction.paymentUrl;
  if (typeof transaction.qrCodeUrl === "string") result.qrCodeUrl = transaction.qrCodeUrl;
  return result;
}

export function publicTransactionDto(transaction: TransactionInput) {
  return {
    id: transaction.id,
    merchantId: transaction.merchantId,
    taptStoneId: transaction.taptStoneId,
    itemName: transaction.itemName,
    price: transaction.price,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod,
    isSplit: transaction.isSplit,
    totalSplits: transaction.totalSplits,
    completedSplits: transaction.completedSplits,
    splitAmount: transaction.splitAmount,
    splitEnabled: transaction.splitEnabled,
    createdAt: transaction.createdAt,
    ...transactionAddressFields(transaction),
  };
}

/**
 * Bearer-token customer view. It deliberately has no transaction, merchant, or
 * board identifier: possession of the token is the complete public address.
 */
export function tokenPaymentDto(transaction: TransactionInput, merchant: MerchantInput) {
  return {
    itemName: transaction.itemName,
    price: transaction.price,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod,
    splitEnabled: transaction.splitEnabled,
    isSplit: transaction.isSplit,
    totalSplits: transaction.totalSplits,
    completedSplits: transaction.completedSplits,
    splitAmount: transaction.splitAmount,
    createdAt: transaction.createdAt,
    merchant: {
      name: merchant.name,
      businessName: merchant.businessName,
      contactEmail: merchant.contactEmail,
      contactPhone: merchant.contactPhone,
      businessAddress: merchant.businessAddress,
      gstNumber: merchant.gstNumber,
      nzbn: merchant.nzbn,
      customLogoUrl: merchant.customLogoUrl,
      themeId: merchant.themeId,
    },
  };
}

/**
 * Token-authorized receipt view. `share.index` is local to this transaction;
 * global transaction, merchant, board, and split-payment identifiers stay
 * internal so the browser never needs to downgrade to a numeric route.
 */
export function tokenReceiptDto(
  transaction: TransactionInput,
  merchant: MerchantInput,
  share?: Record<string, any> | null,
) {
  const payment = tokenPaymentDto(transaction, merchant);
  return {
    transaction: {
      itemName: payment.itemName,
      price: payment.price,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      isSplit: payment.isSplit,
      totalSplits: payment.totalSplits,
      completedSplits: payment.completedSplits,
      createdAt: payment.createdAt,
    },
    merchant: payment.merchant,
    share: share
      ? {
          index: share.splitIndex,
          amount: share.amount,
          paymentMethod: share.paymentMethod,
          paidAt: share.paidAt,
        }
      : null,
  };
}

export function ownerTransactionDto(transaction: TransactionInput) {
  return {
    ...publicTransactionDto(transaction),
    windcaveTransactionId: transaction.windcaveTransactionId,
    // No fee fields: TaptPay charges no per-transaction fee, and Windcave's own
    // fees are settled on their side and were never tracked here.
    merchantNet: transaction.merchantNet,
    totalRefunded: transaction.totalRefunded,
    refundableAmount: transaction.refundableAmount,
  };
}

export const merchantSseTransactionDto = ownerTransactionDto;
export const adminTransactionDto = ownerTransactionDto;

export function publicSplitPaymentDto(split: Record<string, any>) {
  return {
    id: split.id,
    transactionId: split.transactionId,
    splitIndex: split.splitIndex,
    amount: split.amount,
    status: split.status,
    paymentMethod: split.paymentMethod,
    paidAt: split.paidAt,
    createdAt: split.createdAt,
  };
}
