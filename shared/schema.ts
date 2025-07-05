import { pgTable, text, serial, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
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
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  merchantId: serial("merchant_id").references(() => merchants.id),
  itemName: text("item_name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  windcaveTransactionId: text("windcave_transaction_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
  status: true,
  verificationToken: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
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

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  resetToken: true,
  resetTokenExpiry: true,
});

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type CreateMerchant = z.infer<typeof createMerchantSchema>;
export type VerifyMerchant = z.infer<typeof verifyMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
