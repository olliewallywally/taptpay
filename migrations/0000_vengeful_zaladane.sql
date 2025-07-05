CREATE TABLE "merchants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"business_name" text NOT NULL,
	"business_type" text,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_token" text,
	"password_hash" text,
	"qr_code_url" text,
	"payment_url" text,
	"current_provider_rate" numeric(5, 4) DEFAULT '0.0290',
	"our_rate" numeric(5, 4) DEFAULT '0.0020',
	"contact_email" text,
	"contact_phone" text,
	"business_address" text,
	"bank_name" text,
	"bank_account_number" text,
	"bank_branch" text,
	"account_holder_name" text,
	"gst_number" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "merchants_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" serial NOT NULL,
	"item_name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"windcave_transaction_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"merchant_id" serial NOT NULL,
	"role" text DEFAULT 'merchant' NOT NULL,
	"reset_token" text,
	"reset_token_expiry" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;