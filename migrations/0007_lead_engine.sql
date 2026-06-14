-- Lead engine (Phase 0): lead_sources, leads, suppressions

CREATE TABLE "lead_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "label" text,
  "params" jsonb,
  "total_found" integer NOT NULL DEFAULT 0,
  "total_imported" integer NOT NULL DEFAULT 0,
  "created_by" text,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "leads" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_name" text NOT NULL,
  "segment" text,
  "category" text,
  "website" text,
  "domain" text,
  "email" text,
  "phone" text,
  "contact_name" text,
  "address" text,
  "suburb" text,
  "city" text,
  "region" text,
  "country" text NOT NULL DEFAULT 'NZ',
  "nzbn" text,
  "status" text NOT NULL DEFAULT 'new',
  "score" integer NOT NULL DEFAULT 0,
  "notes" text,
  "source_id" integer REFERENCES "lead_sources"("id"),
  "dedupe_key" text NOT NULL,
  "consent_basis" text,
  "consent_source_url" text,
  "last_contacted_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "leads_dedupe_key_unique" ON "leads" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" ("status");
--> statement-breakpoint
CREATE INDEX "leads_segment_idx" ON "leads" ("segment");
--> statement-breakpoint
CREATE INDEX "leads_domain_idx" ON "leads" ("domain");
--> statement-breakpoint

CREATE TABLE "suppressions" (
  "id" serial PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "value" text NOT NULL,
  "reason" text NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "suppressions_type_value_unique" ON "suppressions" ("type", "value");
