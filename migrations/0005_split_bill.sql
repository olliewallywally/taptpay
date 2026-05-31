-- Split-bill support on rent invoices: tenant-side splitting among flatmates

ALTER TABLE "invoices_rent_requests" ADD COLUMN IF NOT EXISTS "split_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "invoices_rent_requests" ADD COLUMN IF NOT EXISTS "split_count" integer;
--> statement-breakpoint
ALTER TABLE "invoices_rent_requests" ADD COLUMN IF NOT EXISTS "split_paid_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "invoices_rent_requests" ADD COLUMN IF NOT EXISTS "split_paid_sessions" text[];
--> statement-breakpoint
ALTER TABLE "invoices_rent_requests" ADD COLUMN IF NOT EXISTS "split_payer_emails" text[];
