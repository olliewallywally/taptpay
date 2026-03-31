-- Add email_verified column to merchants table
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false;

-- Backfill: existing active/verified merchants are already verified
UPDATE "merchants" SET "email_verified" = true WHERE "status" IN ('active', 'verified');
