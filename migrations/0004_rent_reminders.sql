-- Overdue rent reminder policy (per merchant) + reminder counter on invoices

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "rent_reminder_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "rent_reminder_delay_days" integer NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "rent_reminder_interval_days" integer NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "rent_reminder_max_count" integer NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "invoices_rent_requests" ADD COLUMN IF NOT EXISTS "reminder_count" integer NOT NULL DEFAULT 0;
