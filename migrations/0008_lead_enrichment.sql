-- Lead engine (Phase 2): enrichment columns on leads + enrichment_cache

ALTER TABLE "leads" ADD COLUMN "linkedin_url" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facebook_url" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "instagram_url" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "signals" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_confidence" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "enriched_at" timestamp;
--> statement-breakpoint

CREATE TABLE "enrichment_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "domain" text NOT NULL,
  "url" text,
  "status" text NOT NULL,
  "payload" jsonb,
  "fetched_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "enrichment_cache_domain_unique" ON "enrichment_cache" ("domain");
