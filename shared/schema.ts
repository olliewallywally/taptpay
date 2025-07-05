import { pgTable, text, serial, decimal, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  qrCodeUrl: text("qr_code_url").notNull(),
  paymentUrl: text("payment_url").notNull(),
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

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
