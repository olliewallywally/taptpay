import { z } from "zod";
import {
  LANDING_DEMO_PAYMENT_METHODS,
  LANDING_DEMO_SCENES,
  type LandingDemoActionRequest,
} from "@shared/landing-demo";

const revision = z.number().int().nonnegative();
const base = { expectedRevision: revision };

export const landingDemoSceneSchema = z.enum(LANDING_DEMO_SCENES);
export const landingDemoActionSchema: z.ZodType<LandingDemoActionRequest> =
  z.discriminatedUnion("type", [
    z.object({ ...base, type: z.literal("RESET_SCENE"), scene: landingDemoSceneSchema }).strict(),
    z.object({ ...base, type: z.literal("CREATE_WEEKLY_RENT"), tenantKey: z.literal("tenant-mia"), amountCents: z.literal(62_000), frequency: z.literal("weekly") }).strict(),
    z.object({ ...base, type: z.literal("SEND_PROPERTY_BILL"), tenantKey: z.literal("tenant-mia"), billKey: z.literal("water-bill"), amountCents: z.literal(8_640), dueKey: z.literal("due-seven-days"), attachmentKey: z.literal("water-invoice-pdf") }).strict(),
    z.object({ ...base, type: z.literal("SETTLE_PROPERTY_BILL"), billKey: z.literal("water-bill") }).strict(),
    z.object({ ...base, type: z.literal("SEND_TRADES_INVOICE"), clientKey: z.literal("client-dave"), invoiceKey: z.literal("emergency-callout"), amountCents: z.literal(48_000) }).strict(),
    z.object({ ...base, type: z.literal("SETTLE_TRADES_INVOICE"), invoiceKey: z.literal("emergency-callout") }).strict(),
    z.object({ ...base, type: z.literal("SEND_TRADES_QUOTE"), clientKey: z.literal("client-dave"), quoteKey: z.literal("heat-pump-quote"), quantity: z.literal(1), unitAmountCents: z.literal(125_000), depositPercent: z.literal(20) }).strict(),
    z.object({ ...base, type: z.literal("ACCEPT_TRADES_QUOTE"), quoteKey: z.literal("heat-pump-quote") }).strict(),
    z.object({ ...base, type: z.literal("CREATE_RETAIL_SALE"), saleKey: z.literal("flat-white-sale"), amountCents: z.literal(1_250), quantity: z.literal(2) }).strict(),
    z.object({ ...base, type: z.literal("SETTLE_RETAIL_SALE"), saleKey: z.literal("flat-white-sale") }).strict(),
    z.object({ ...base, type: z.literal("CREATE_RETAIL_SPLIT"), splitKey: z.literal("split-four"), amountCents: z.literal(12_000), payerCount: z.literal(4) }).strict(),
    z.object({ ...base, type: z.literal("PAY_RETAIL_SPLIT_SHARE"), splitKey: z.literal("split-four"), shareIndex: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }).strict(),
    z.object({ ...base, type: z.literal("PAY_CHECKOUT_DEPOSIT"), quoteKey: z.literal("heat-pump-quote"), method: z.enum(LANDING_DEMO_PAYMENT_METHODS) }).strict(),
  ]);

export const landingDemoEmptyBodySchema = z.object({}).strict();
