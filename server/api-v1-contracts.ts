import { z } from "zod";

/**
 * Versioned ecommerce request contract. It intentionally remains separate from
 * the merchant-terminal contract and uses the public API's snake_case names.
 */
export const apiV1CreateTransactionSchema = z.object({
  amount: z.string()
    .regex(/^\d+(\.\d{1,2})?$/, "amount must be a positive decimal with at most two places")
    .refine((value) => Number(value) > 0, "amount must be greater than zero"),
  currency: z.literal("NZD").optional().default("NZD"),
  item_name: z.string().trim().min(1).max(200),
  customer_email: z.string().email().max(320).optional(),
  return_url: z.string().url().max(2048).optional(),
  webhook_url: z.string().url().max(2048).optional(),
}).strict();

export type ApiV1CreateTransaction = z.infer<typeof apiV1CreateTransactionSchema>;
