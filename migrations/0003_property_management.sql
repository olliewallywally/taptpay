-- Property management tables: tenant_profiles, active_schedules, invoices_rent_requests, transaction_events

CREATE TABLE "tenant_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "email" text,
  "phone" text,
  "property_address" text NOT NULL,
  "co_tenants_text" text,
  "preferred_channel" text NOT NULL DEFAULT 'email',
  "status" text NOT NULL DEFAULT 'active',
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "active_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "tenant_profile_id" uuid NOT NULL REFERENCES "tenant_profiles"("id"),
  "amount_cents" integer NOT NULL,
  "frequency" text NOT NULL,
  "delivery_channel" text NOT NULL DEFAULT 'email',
  "start_date" timestamp NOT NULL,
  "end_date" timestamp,
  "next_run_date" timestamp NOT NULL,
  "last_run_date" timestamp,
  "pause_next_cycle" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active',
  "terminated_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "active_schedules_next_run_date_idx" ON "active_schedules" ("next_run_date");
--> statement-breakpoint
CREATE INDEX "active_schedules_merchant_status_idx" ON "active_schedules" ("merchant_id", "status");
--> statement-breakpoint

CREATE TABLE "invoices_rent_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "tenant_profile_id" uuid NOT NULL REFERENCES "tenant_profiles"("id"),
  "schedule_id" uuid REFERENCES "active_schedules"("id"),
  "amount_cents" integer NOT NULL,
  "token" text NOT NULL UNIQUE,
  "delivery_channel" text NOT NULL,
  "billing_period_start" timestamp,
  "status" text NOT NULL DEFAULT 'pending_dispatch',
  "due_at" timestamp NOT NULL,
  "dispatched_at" timestamp,
  "sent_at" timestamp,
  "paid_at" timestamp,
  "voided_at" timestamp,
  "external_payment_reference" text,
  "last_reminder_sent_at" timestamp,
  "windcave_session_id" text,
  "windcave_transaction_id" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "invoices_schedule_billing_period_unique" ON "invoices_rent_requests" ("schedule_id", "billing_period_start") WHERE "schedule_id" IS NOT NULL AND "billing_period_start" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "invoices_rent_requests" ("status", "due_at");
--> statement-breakpoint
CREATE INDEX "invoices_merchant_status_idx" ON "invoices_rent_requests" ("merchant_id", "status");
--> statement-breakpoint
CREATE INDEX "invoices_token_idx" ON "invoices_rent_requests" ("token");
--> statement-breakpoint

CREATE TABLE "transaction_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "tenant_profile_id" uuid REFERENCES "tenant_profiles"("id"),
  "invoice_id" uuid REFERENCES "invoices_rent_requests"("id"),
  "schedule_id" uuid REFERENCES "active_schedules"("id"),
  "event_type" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "transaction_events_tenant_created_idx" ON "transaction_events" ("tenant_profile_id", "created_at");
--> statement-breakpoint
CREATE INDEX "transaction_events_merchant_created_idx" ON "transaction_events" ("merchant_id", "created_at");
