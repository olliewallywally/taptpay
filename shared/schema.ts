import { pgTable, text, serial, decimal, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  role: text("role").notNull().default("merchant"), // merchant, admin
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  businessName: text("business_name").notNull(),
  businessType: text("business_type"),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  address: text("address"),
  status: text("status").notNull().default("pending"), // pending, verified, active, inactive
  verificationToken: text("verification_token"),
  passwordHash: text("password_hash"),
  qrCodeUrl: text("qr_code_url"),
  paymentUrl: text("payment_url"),
  currentProviderRate: decimal("current_provider_rate", { precision: 5, scale: 4 }).default("0.0290"), // Default 2.9%
  ourRate: decimal("our_rate", { precision: 5, scale: 4 }).default("0.0020"), // Our 0.20%
  
  // Additional business details
  director: text("director"),
  nzbn: text("nzbn"), // New Zealand Business Number
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  businessAddress: text("business_address"),
  
  // Bank account details
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankBranch: text("bank_branch"),
  accountHolderName: text("account_holder_name"),
  
  // Tax information
  gstNumber: text("gst_number"),
  
  // Branding customization
  customLogoUrl: text("custom_logo_url"), // Custom merchant logo for customer payment page
  
  // Payment integration
  windcaveApiKey: text("windcave_api_key"), // Encrypted Windcave API key
  
  // Theme customization
  themeId: text("theme_id").default("classic"),
  
  // Crypto payment settings
  coinbaseCommerceApiKey: text("coinbase_commerce_api_key"),
  coinbaseWebhookSecret: text("coinbase_webhook_secret"),
  cryptoEnabled: boolean("crypto_enabled").default(false),
  enabledCryptocurrencies: text("enabled_cryptocurrencies").array(),
  autoConvertToFiat: boolean("auto_convert_to_fiat").default(false),
  minConfirmations: integer("min_confirmations").default(1),
  
  // Dashboard preferences
  dailyGoal: decimal("daily_goal", { precision: 10, scale: 2 }).default("500.00"), // Daily revenue goal in dollars
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  taptStoneId: integer("tapt_stone_id").references(() => taptStones.id), // Link to specific tapt stone
  itemName: text("item_name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed, refunded, partially_refunded
  windcaveTransactionId: text("windcave_transaction_id"),
  
  // Payment method tracking
  paymentMethod: text("payment_method").default("qr_code"), // qr_code, nfc_tap, card_reader, manual
  nfcSessionId: text("nfc_session_id"), // For NFC/tap payments
  deviceId: text("device_id"), // Device that initiated the transaction
  
  // Bill splitting functionality
  isSplit: boolean("is_split").default(false), // Whether this transaction is split
  totalSplits: integer("total_splits").default(1), // Total number of splits
  completedSplits: integer("completed_splits").default(0), // Number of completed splits
  splitAmount: decimal("split_amount", { precision: 10, scale: 2 }), // Amount per split (price / totalSplits)
  
  // Fee tracking (Marketplace Model)
  windcaveFeeRate: decimal("windcave_fee_rate", { precision: 5, scale: 4 }).default("0.0290"), // 2.9% typical Windcave rate
  windcaveFeeAmount: decimal("windcave_fee_amount", { precision: 10, scale: 2 }), // Calculated Windcave fee
  platformFeeRate: decimal("platform_fee_rate", { precision: 5, scale: 4 }).default("0.0050"), // 0.5% platform fee
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }), // Calculated platform fee
  merchantNet: decimal("merchant_net", { precision: 10, scale: 2 }), // Amount to settle to merchant
  
  // Refund tracking
  totalRefunded: decimal("total_refunded", { precision: 10, scale: 2 }).default("0.00"), // Total amount refunded
  refundableAmount: decimal("refundable_amount", { precision: 10, scale: 2 }), // Amount still available for refund
  
  // Offline sync support
  offlineId: text("offline_id").unique(), // Client-generated ID for offline transactions to ensure idempotency
  createdOfflineAt: text("created_offline_at"), // When the transaction was created offline
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Crypto transactions table for cryptocurrency payments
export const cryptoTransactions = pgTable("crypto_transactions", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").references(() => transactions.id),
  merchantId: integer("merchant_id").references(() => merchants.id),
  
  // Crypto payment details
  cryptocurrency: text("cryptocurrency").notNull(), // BTC, ETH, USDC, etc.
  walletAddress: text("wallet_address").notNull(), // Generated unique address for this payment
  cryptoAmount: text("crypto_amount").notNull(), // Amount in crypto (stored as string for precision)
  fiatAmount: decimal("fiat_amount", { precision: 10, scale: 2 }).notNull(), // Original amount in fiat
  exchangeRate: decimal("exchange_rate", { precision: 18, scale: 8 }).notNull(), // Crypto to fiat rate at time of payment
  
  // Coinbase Commerce details
  coinbaseChargeId: text("coinbase_charge_id").unique(), // Coinbase Commerce charge ID
  coinbaseChargeCode: text("coinbase_charge_code"), // Short code for the charge
  hostedUrl: text("hosted_url"), // Coinbase hosted payment page URL
  
  // Blockchain tracking
  blockchainTxHash: text("blockchain_tx_hash"), // Transaction hash on blockchain
  confirmations: integer("confirmations").default(0), // Number of blockchain confirmations
  requiredConfirmations: integer("required_confirmations").default(1), // Required confirmations for completion
  
  // Network fees
  networkFeeAmount: text("network_fee_amount"), // Gas/network fees (in crypto)
  networkFeeFiat: decimal("network_fee_fiat", { precision: 10, scale: 2 }), // Network fees in fiat
  
  // Status and timing
  status: text("status").notNull().default("pending"), // pending, confirming, confirmed, completed, failed, expired
  expiresAt: timestamp("expires_at"), // When the payment request expires
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Split payments table to track individual payments for split bills
export const splitPayments = pgTable("split_payments", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").references(() => transactions.id),
  merchantId: integer("merchant_id").references(() => merchants.id),
  splitIndex: integer("split_index").notNull(), // Which split this is (1, 2, 3, etc.)
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Amount for this split
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  windcaveTransactionId: text("windcave_transaction_id"), // External payment processor ID for this split
  paymentMethod: text("payment_method").default("qr_code"), // qr_code, nfc_tap, card_reader, manual
  
  // Fee tracking for this split
  windcaveFeeAmount: decimal("windcave_fee_amount", { precision: 10, scale: 2 }),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }),
  merchantNet: decimal("merchant_net", { precision: 10, scale: 2 }),
  
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Refunds table to track all refund activities
export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").references(() => transactions.id),
  merchantId: integer("merchant_id").references(() => merchants.id),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).notNull(),
  refundReason: text("refund_reason"),
  refundMethod: text("refund_method").default("original_payment_method"), // original_payment_method, bank_transfer, manual
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  windcaveRefundId: text("windcave_refund_id"), // External refund processor ID
  
  // Fee handling for refunds
  windcaveFeeRefunded: decimal("windcave_fee_refunded", { precision: 10, scale: 2 }).default("0.00"),
  platformFeeRefunded: decimal("platform_fee_refunded", { precision: 10, scale: 2 }).default("0.00"),
  
  initiatedBy: text("initiated_by"), // merchant, customer, admin
  customerNotified: boolean("customer_notified").default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Platform settlements - tracks money owed to merchants (Marketplace Model)
export const merchantSettlements = pgTable("merchant_settlements", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  settlementPeriod: text("settlement_period").notNull(), // e.g., "2025-01-01"
  totalTransactionAmount: decimal("total_transaction_amount", { precision: 10, scale: 2 }).notNull(),
  totalWindcaveFees: decimal("total_windcave_fees", { precision: 10, scale: 2 }).notNull(),
  totalPlatformFees: decimal("total_platform_fees", { precision: 10, scale: 2 }).notNull(),
  netSettlementAmount: decimal("net_settlement_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  settlementDate: timestamp("settlement_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Platform fees table for tracking revenue collection
export const platformFees = pgTable("platform_fees", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").references(() => transactions.id),
  merchantId: integer("merchant_id").references(() => merchants.id),
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }).notNull(),
  transactionAmount: decimal("transaction_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, collected, failed
  collectedAt: timestamp("collected_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Split payments schemas
export const insertSplitPaymentSchema = createInsertSchema(splitPayments).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});

export const createSplitPaymentSchema = z.object({
  transactionId: z.number().min(1, "Transaction ID is required"),
  splitIndex: z.number().min(1, "Split index is required"),
  amount: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, "Amount must be a positive number"),
  paymentMethod: z.enum(["qr_code", "nfc_tap", "card_reader", "manual"]).default("qr_code"),
});

// Bill split creation schema
export const createBillSplitSchema = z.object({
  transactionId: z.number().min(1, "Transaction ID is required"),
  totalSplits: z.number().min(2, "Must have at least 2 splits").max(10, "Maximum 10 splits allowed"),
});

// Add refund schemas only - keeping existing schemas intact
export const insertRefundSchema = createInsertSchema(refunds).omit({
  id: true,
  createdAt: true,
});

export const createRefundSchema = z.object({
  transactionId: z.number().min(1, "Transaction ID is required"),
  refundAmount: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, "Refund amount must be a positive number"),
  refundReason: z.string().min(1, "Refund reason is required").max(500, "Reason must be under 500 characters"),
  refundMethod: z.enum(["original_payment_method", "bank_transfer", "manual"]).default("original_payment_method"),
});

export const createMerchantSchema = z.object({
  name: z.string().min(1, "Merchant name is required").max(50),
  businessName: z.string().min(1, "Business name is required").max(100),
  businessType: z.string().min(1, "Business type is required").max(50),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required").max(20),
  address: z.string().min(1, "Address is required").max(200),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const verifyMerchantSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password confirmation is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const updateMerchantRatesSchema = z.object({
  currentProviderRate: z.string().regex(/^\d+(\.\d{1,4})?$/, "Rate must be a valid percentage"),
});

export const updateMerchantDetailsSchema = z.object({
  businessName: z.string().min(1, "Business name is required").max(100),
  contactEmail: z.string().email("Valid email is required"),
  contactPhone: z.string().min(1, "Phone number is required").max(20),
  businessAddress: z.string().min(1, "Business address is required").max(200),
});

export const updateBankAccountSchema = z.object({
  bankName: z.string().min(1, "Bank name is required").max(50),
  bankAccountNumber: z.string().regex(/^\d{2}-\d{4}-\d{7}-\d{2,3}$/, "Must be valid NZ account format (12-3456-1234567-12)"),
  bankBranch: z.string().min(1, "Bank branch is required").max(50),
  accountHolderName: z.string().min(1, "Account holder name is required").max(100),
});

export const updateThemeSchema = z.object({
  themeId: z.string().min(1, "Theme selection is required"),
});

export const updateDailyGoalSchema = z.object({
  dailyGoal: z.string().regex(/^\d+(\.\d{1,2})?$/, "Daily goal must be a valid amount"),
});

export const updateCryptoSettingsSchema = z.object({
  coinbaseCommerceApiKey: z.string().optional(),
  coinbaseWebhookSecret: z.string().optional(),
  cryptoEnabled: z.boolean(),
  enabledCryptocurrencies: z.array(z.string()).optional(),
  minConfirmations: z.number().min(1).max(6).default(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  windcaveTransactionId: true,
}).extend({
  merchantId: z.number(),
  price: z.string().regex(/^\d+(\.\d{2})?$/, "Price must be a valid decimal"),
  status: z.enum(["pending", "processing", "completed", "failed"]).default("pending"),
  selectedStoneId: z.number().optional(),
});

// Password reset schemas
export const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email is required"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password confirmation is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const insertPlatformFeeSchema = createInsertSchema(platformFees).omit({
  id: true,
  createdAt: true,
  collectedAt: true,
});

// Tapt Stones table - multiple QR codes per merchant
export const taptStones = pgTable("tapt_stones", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  name: text("name").notNull(), // e.g., "Stone 1", "Stone 2", etc.
  stoneNumber: integer("stone_number").notNull(), // 1, 2, 3, etc.
  qrCodeUrl: text("qr_code_url"),
  paymentUrl: text("payment_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stock Items table - merchant inventory management
export const stockItems = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  name: text("name").notNull(),
  description: text("description"),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// API Keys table for ecommerce integration
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id),
  keyName: text("key_name").notNull(), // User-friendly name for the key
  apiKey: text("api_key").notNull().unique(), // The actual API key (hashed)
  keyPrefix: text("key_prefix").notNull(), // First 8 chars for display (e.g., "tapt_live_")
  environment: text("environment").notNull().default("sandbox"), // sandbox, live
  status: text("status").notNull().default("active"), // active, inactive, revoked
  permissions: text("permissions").notNull().default("create_transactions,read_transactions"), // Comma-separated permissions
  webhookUrl: text("webhook_url"), // Optional webhook endpoint
  webhookSecret: text("webhook_secret"), // Secret for webhook signing
  lastUsedAt: timestamp("last_used_at"),
  rateLimitPerHour: integer("rate_limit_per_hour").default(1000), // API rate limiting
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Optional expiration
});

// API Requests tracking table
export const apiRequests = pgTable("api_requests", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").references(() => apiKeys.id),
  merchantId: integer("merchant_id").references(() => merchants.id),
  endpoint: text("endpoint").notNull(), // e.g., "/api/v1/transactions"
  method: text("method").notNull(), // GET, POST, PUT, DELETE
  statusCode: integer("status_code").notNull(), // HTTP status code
  responseTime: integer("response_time"), // Response time in milliseconds
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestSize: integer("request_size"), // Request body size in bytes
  responseSize: integer("response_size"), // Response body size in bytes
  errorMessage: text("error_message"), // Error details if any
  createdAt: timestamp("created_at").defaultNow(),
});

// Webhook Deliveries tracking
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").references(() => apiKeys.id),
  merchantId: integer("merchant_id").references(() => merchants.id),
  transactionId: integer("transaction_id").references(() => transactions.id),
  eventType: text("event_type").notNull(), // transaction.created, transaction.completed, etc.
  webhookUrl: text("webhook_url").notNull(),
  payload: text("payload").notNull(), // JSON payload sent
  httpStatus: integer("http_status"), // Response HTTP status
  responseBody: text("response_body"), // Response from merchant webhook
  attemptCount: integer("attempt_count").default(1),
  maxAttempts: integer("max_attempts").default(3),
  nextRetryAt: timestamp("next_retry_at"),
  deliveredAt: timestamp("delivered_at"),
  failedAt: timestamp("failed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Merchant Subscriptions table - tracks subscription tier and transaction counts
export const merchantSubscriptions = pgTable("merchant_subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull().unique(),
  tier: text("tier").notNull().default("free"), // free, paid
  status: text("status").notNull().default("active"), // active, cancelled, past_due, suspended
  
  // Transaction tracking
  currentMonthTransactions: integer("current_month_transactions").default(0),
  totalLifetimeTransactions: integer("total_lifetime_transactions").default(0),
  monthStartDate: timestamp("month_start_date").defaultNow(), // When current month started (resets monthly)
  
  // Billing configuration
  billingFrequency: text("billing_frequency").default("monthly"), // weekly, bi_weekly, monthly
  nextBillingDate: timestamp("next_billing_date"),
  unbilledTransactionCount: integer("unbilled_transaction_count").default(0), // Transactions not yet billed
  unbilledAmount: decimal("unbilled_amount", { precision: 10, scale: 2 }).default("0.00"), // Total unbilled fees
  
  // Cancellation tracking
  cancellationRequestedAt: timestamp("cancellation_requested_at"),
  cancellationEffectiveDate: timestamp("cancellation_effective_date"), // 30 days after request
  cancellationReason: text("cancellation_reason"),
  
  // Stripe integration
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePaymentMethodId: text("stripe_payment_method_id"),
  lastBillingDate: text("last_billing_date"), // ISO string of last successful billing
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscription Billing History table - tracks all billing events
export const subscriptionBillingHistory = pgTable("subscription_billing_history", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id).notNull(),
  subscriptionId: integer("subscription_id").references(() => merchantSubscriptions.id),
  
  // Billing details
  billingType: text("billing_type").notNull(), // tier_upgrade, transaction_fees, monthly_subscription
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  transactionCount: integer("transaction_count").default(0), // Number of transactions billed
  billingPeriodStart: timestamp("billing_period_start"),
  billingPeriodEnd: timestamp("billing_period_end"),
  
  // Stripe payment details
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  status: text("status").notNull().default("pending"), // pending, succeeded, failed, refunded
  
  // Details
  description: text("description"), // e.g., "Transaction fees: 150 transactions @ $0.10 each"
  failureReason: text("failure_reason"),
  
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// API Key schemas
export const createApiKeySchema = z.object({
  keyName: z.string().min(1, "Key name is required").max(100, "Key name too long"),
  environment: z.enum(["sandbox", "live"]).default("sandbox"),
  permissions: z.array(z.string()).min(1, "At least one permission required"),
  webhookUrl: z.string().url("Valid webhook URL required").optional().or(z.literal("")),
  rateLimitPerHour: z.number().min(100).max(10000).default(1000),
  expiresAt: z.string().optional(), // ISO date string
});

export const updateApiKeySchema = z.object({
  keyName: z.string().min(1, "Key name is required").max(100, "Key name too long"),
  status: z.enum(["active", "inactive", "revoked"]),
  permissions: z.array(z.string()).min(1, "At least one permission required"),
  webhookUrl: z.string().url("Valid webhook URL required").optional().or(z.literal("")),
  rateLimitPerHour: z.number().min(100).max(10000),
});

// Tapt Stone schemas
export const insertTaptStoneSchema = createInsertSchema(taptStones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createTaptStoneSchema = z.object({
  merchantId: z.number().min(1, "Merchant ID is required"),
  name: z.string().min(1, "Stone name is required").max(50, "Name too long"),
  stoneNumber: z.number().min(1, "Stone number must be at least 1").max(10, "Maximum 10 stones allowed"),
});

// Stock Item schemas
export const insertStockItemSchema = createInsertSchema(stockItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createStockItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional(),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid cost format"),
});

export const updateStockItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional(),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid cost format"),
});

// User schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  resetToken: true,
  resetTokenExpiry: true,
});

// Crypto transaction schemas
export const insertCryptoTransactionSchema = createInsertSchema(cryptoTransactions).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const createCryptoTransactionSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  fiatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
  cryptocurrency: z.enum(["BTC", "ETH", "USDC", "USDT", "LTC", "BCH"]).default("BTC"),
});

// Merchant settings schemas
export const updateMerchantCryptoSettingsSchema = z.object({
  coinbaseCommerceApiKey: z.string().min(1, "API key is required"),
  cryptoEnabled: z.boolean().default(true),
  enabledCryptocurrencies: z.array(z.string()).min(1, "Select at least one cryptocurrency"),
  autoConvertToFiat: z.boolean().default(false),
  minConfirmations: z.number().min(1).max(6).default(1),
});

export const updateMerchantPaymentMethodSchema = z.object({
  stripePaymentMethodId: z.string().min(1, "Payment method is required"),
  paymentMethodLast4: z.string().length(4, "Last 4 digits required"),
  paymentMethodBrand: z.string().min(1, "Card brand is required"),
});

// Subscription schemas
export const insertMerchantSubscriptionSchema = createInsertSchema(merchantSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSubscriptionSchema = z.object({
  tier: z.enum(["free", "paid"]).optional(),
  billingFrequency: z.enum(["weekly", "bi_weekly", "monthly"]).optional(),
});

export const cancelSubscriptionSchema = z.object({
  cancellationReason: z.string().min(1, "Cancellation reason is required").max(500, "Reason too long"),
});

export const insertBillingHistorySchema = createInsertSchema(subscriptionBillingHistory).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});

// Type exports - consolidated to avoid duplicates
export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = z.infer<typeof createMerchantSchema>;
export type CreateMerchant = z.infer<typeof createMerchantSchema>;
export type VerifyMerchant = z.infer<typeof verifyMerchantSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type PlatformFee = typeof platformFees.$inferSelect;
export type InsertPlatformFee = z.infer<typeof insertPlatformFeeSchema>;
export type MerchantSettlement = typeof merchantSettlements.$inferSelect;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Refund types
export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type CreateRefund = z.infer<typeof createRefundSchema>;

// Tapt Stone types
export type TaptStone = typeof taptStones.$inferSelect;
export type InsertTaptStone = z.infer<typeof insertTaptStoneSchema>;
export type CreateTaptStone = z.infer<typeof createTaptStoneSchema>;

// Stock Item types
export type StockItem = typeof stockItems.$inferSelect;
export type InsertStockItem = z.infer<typeof insertStockItemSchema>;
export type CreateStockItem = z.infer<typeof createStockItemSchema>;

// Crypto Transaction types
export type CryptoTransaction = typeof cryptoTransactions.$inferSelect;
export type InsertCryptoTransaction = z.infer<typeof insertCryptoTransactionSchema>;
export type CreateCryptoTransaction = z.infer<typeof createCryptoTransactionSchema>;

// Subscription types
export type MerchantSubscription = typeof merchantSubscriptions.$inferSelect;
export type InsertMerchantSubscription = z.infer<typeof insertMerchantSubscriptionSchema>;
export type UpdateSubscription = z.infer<typeof updateSubscriptionSchema>;
export type CancelSubscription = z.infer<typeof cancelSubscriptionSchema>;

// Billing History types
export type SubscriptionBillingHistory = typeof subscriptionBillingHistory.$inferSelect;
export type InsertBillingHistory = z.infer<typeof insertBillingHistorySchema>;
