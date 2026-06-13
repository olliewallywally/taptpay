-- Lead engine (Phase 3): AI personalization draft columns on leads

ALTER TABLE "leads" ADD COLUMN "draft_subject" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "draft_body" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "draft_status" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "draft_model" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "draft_generated_at" timestamp;
