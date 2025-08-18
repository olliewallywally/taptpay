import { pgTable, text, serial, decimal, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  merchantId: serial("merchant_id").references(() => merchants.id),
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
  
  // Theme customization
  themeId: text("theme_id").default("classic"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  merchantId: serial("merchant_id").references(() => merchants.id),
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
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Split payments table to track individual payments for split bills
export const splitPayments = pgTable("split_payments", {
  id: serial("id").primaryKey(),
  transactionId: serial("transaction_id").references(() => transactions.id),
  merchantId: serial("merchant_id").references(() => merchants.id),
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
  transactionId: serial("transaction_id").references(() => transactions.id),
  merchantId: serial("merchant_id").references(() => merchants.id),
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
  merchantId: serial("merchant_id").references(() => merchants.id),
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
  transactionId: serial("transaction_id").references(() => transactions.id),
  merchantId: serial("merchant_id").references(() => merchants.id),
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
  merchantId: serial("merchant_id").references(() => merchants.id),
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
  merchantId: serial("merchant_id").references(() => merchants.id),
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
  merchantId: serial("merchant_id").references(() => merchants.id),
  keyName: text("key_name").notNull(), // User-friendly name for the key
  apiKey: text("api_key").notNull().unique(), // The actual API key (hashed)
  keyPrefix: text("key_prefix").notNull(), // First 8 chars for display (e.g., "tapt_live_")
  environment: text("environment").notNull().default("sandbox"), // sandbox, live
  status: text("status").notNull().default("active"), // active, inactive, revoked
  permissions: text("permissions").notNull().default("create_transactions,read_transactions"), // Comma-separated permissions
  webhookUrl: text("webhook_url"), // Optional webhook endpoint
  webhookSecret: text("webhook_secret"), // Secret for webhook signing
  lastUsedAt: timestamp("last_used_at"),
  rateLimitPerHour: serial("rate_limit_per_hour").default(1000), // API rate limiting
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Optional expiration
});

// API Requests tracking table
export const apiRequests = pgTable("api_requests", {
  id: serial("id").primaryKey(),
  apiKeyId: serial("api_key_id").references(() => apiKeys.id),
  merchantId: serial("merchant_id").references(() => merchants.id),
  endpoint: text("endpoint").notNull(), // e.g., "/api/v1/transactions"
  method: text("method").notNull(), // GET, POST, PUT, DELETE
  statusCode: serial("status_code").notNull(), // HTTP status code
  responseTime: serial("response_time"), // Response time in milliseconds
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestSize: serial("request_size"), // Request body size in bytes
  responseSize: serial("response_size"), // Response body size in bytes
  errorMessage: text("error_message"), // Error details if any
  createdAt: timestamp("created_at").defaultNow(),
});

// Webhook Deliveries tracking
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  apiKeyId: serial("api_key_id").references(() => apiKeys.id),
  merchantId: serial("merchant_id").references(() => merchants.id),
  transactionId: serial("transaction_id").references(() => transactions.id),
  eventType: text("event_type").notNull(), // transaction.created, transaction.completed, etc.
  webhookUrl: text("webhook_url").notNull(),
  payload: text("payload").notNull(), // JSON payload sent
  httpStatus: serial("http_status"), // Response HTTP status
  responseBody: text("response_body"), // Response from merchant webhook
  attemptCount: serial("attempt_count").default(1),
  maxAttempts: serial("max_attempts").default(3),
  nextRetryAt: timestamp("next_retry_at"),
  deliveredAt: timestamp("delivered_at"),
  failedAt: timestamp("failed_at"),
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
