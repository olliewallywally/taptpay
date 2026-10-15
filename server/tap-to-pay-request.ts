import { z } from "zod";

// Match the ledger's decimal(10,2) capacity. Accept the terminals' JSON numbers
// and existing decimal-string callers, without rounding sub-cent charges.
export const tapToPayAmountSchema = z.union([z.number().finite(), z.string().max(11)])
  .transform(String)
  .refine((value) => /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value) && Number(value) > 0,
    "Amount must be between 0.01 and 99999999.99 with at most two decimal places")
  .transform((value) => Number(value).toFixed(2));

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const tapToPayRequestSchema = z.object({
  merchantId: positiveId,
  transactionId: positiveId.optional(),
  amount: tapToPayAmountSchema,
  // Opaque provider tokens must reach the provider unchanged. Request-body size
  // is bounded by the JSON parser; there is no documented 512-character limit.
  windcaveToken: z.string().refine((value) => value.trim().length > 0, "Token must not be blank").optional(),
}).strict();
