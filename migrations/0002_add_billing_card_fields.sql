-- Add billing card fields to merchants table
-- These are masked placeholders only. Windcave will handle tokenization when live.
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "billing_card_last4" text;
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "billing_card_brand" text;
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "billing_card_expiry" text;
