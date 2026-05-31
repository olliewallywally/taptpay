-- WhatsApp delivery tracking: store Evolution API message IDs on invoices so
-- webhook events can be matched back to invoices and delivery status recorded.

ALTER TABLE "invoices_rent_requests" ADD COLUMN IF NOT EXISTS "whatsapp_message_id" text;
--> statement-breakpoint
ALTER TABLE "invoices_rent_requests" ADD COLUMN IF NOT EXISTS "whatsapp_delivered_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_whatsapp_message_idx" ON "invoices_rent_requests" ("whatsapp_message_id");
