-- Lead engine (Phase 4): outreach engine — campaigns, steps, enrollments, messages

CREATE TABLE "campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "segment" text,
  "status" text NOT NULL DEFAULT 'draft',
  "channel" text NOT NULL DEFAULT 'email',
  "daily_cap" integer NOT NULL DEFAULT 50,
  "from_identity" text,
  "created_by" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "campaign_steps" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL REFERENCES "campaigns"("id"),
  "step_order" integer NOT NULL,
  "day_offset" integer NOT NULL DEFAULT 0,
  "channel" text NOT NULL DEFAULT 'email',
  "source" text NOT NULL DEFAULT 'template',
  "subject" text,
  "body" text,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "campaign_steps_campaign_order_idx" ON "campaign_steps" ("campaign_id", "step_order");
--> statement-breakpoint

CREATE TABLE "campaign_enrollments" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL REFERENCES "campaigns"("id"),
  "lead_id" integer NOT NULL REFERENCES "leads"("id"),
  "status" text NOT NULL DEFAULT 'active',
  "current_step" integer NOT NULL DEFAULT 0,
  "next_send_at" timestamp,
  "enrolled_at" timestamp DEFAULT now(),
  "last_sent_at" timestamp,
  "completed_at" timestamp,
  "note" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_campaign_lead_unique" ON "campaign_enrollments" ("campaign_id", "lead_id");
--> statement-breakpoint
CREATE INDEX "enrollments_status_next_idx" ON "campaign_enrollments" ("status", "next_send_at");
--> statement-breakpoint

CREATE TABLE "outreach_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "enrollment_id" integer NOT NULL REFERENCES "campaign_enrollments"("id"),
  "campaign_id" integer NOT NULL,
  "lead_id" integer NOT NULL,
  "step_order" integer NOT NULL,
  "channel" text NOT NULL,
  "to_address" text NOT NULL,
  "subject" text,
  "body" text,
  "status" text NOT NULL DEFAULT 'queued',
  "provider_id" text,
  "unsubscribe_token" text,
  "error" text,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_messages_token_unique" ON "outreach_messages" ("unsubscribe_token");
--> statement-breakpoint
CREATE INDEX "outreach_messages_campaign_sent_idx" ON "outreach_messages" ("campaign_id", "sent_at");
