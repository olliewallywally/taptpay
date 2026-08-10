/**
 * Observable effects required before an existing database may mark a migration
 * as applied without executing it. A populated `public` schema alone proves
 * nothing about which migrations ran, so every checked-in migration has an
 * explicit contract here.
 */

export interface BaselineContractClient {
  query<Row = any>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
}

type Requirement = {
  migration: string;
  kind: "table" | "column" | "index" | "constraint" | "verified_subscriptions_active" | "verified_onboarding_complete";
  relationName: string;
  objectName: string;
};

const r = (
  migration: string,
  kind: Requirement["kind"],
  relationName: string,
  objectName = "",
): Requirement => ({ migration, kind, relationName, objectName });

export const BASELINE_EFFECT_REQUIREMENTS: readonly Requirement[] = [
  r("0000_vengeful_zaladane.sql", "table", "merchants"),
  r("0000_vengeful_zaladane.sql", "table", "transactions"),
  r("0000_vengeful_zaladane.sql", "table", "users"),
  r("0001_add_email_verified.sql", "column", "merchants", "email_verified"),
  r("0002_add_billing_card_fields.sql", "column", "merchants", "billing_card_last4"),
  r("0002_add_billing_card_fields.sql", "column", "merchants", "billing_card_brand"),
  r("0002_add_billing_card_fields.sql", "column", "merchants", "billing_card_expiry"),
  r("0003_property_management.sql", "table", "tenant_profiles"),
  r("0003_property_management.sql", "table", "active_schedules"),
  r("0003_property_management.sql", "table", "invoices_rent_requests"),
  r("0003_property_management.sql", "table", "transaction_events"),
  r("0004_rent_reminders.sql", "column", "merchants", "rent_reminder_enabled"),
  r("0004_rent_reminders.sql", "column", "invoices_rent_requests", "reminder_count"),
  r("0005_split_bill.sql", "column", "invoices_rent_requests", "split_enabled"),
  r("0005_split_bill.sql", "column", "invoices_rent_requests", "split_paid_sessions"),
  r("0006_whatsapp_delivery.sql", "column", "invoices_rent_requests", "whatsapp_message_id"),
  r("0006_whatsapp_delivery.sql", "index", "invoices_rent_requests", "invoices_whatsapp_message_idx"),
  r("0007_trades_vertical.sql", "column", "merchants", "gst_registered"),
  r("0007_trades_vertical.sql", "table", "client_profiles"),
  r("0007_trades_vertical.sql", "table", "quotes"),
  r("0007_trades_vertical.sql", "table", "job_schedules"),
  r("0007_trades_vertical.sql", "table", "job_invoices"),
  r("0007_trades_vertical.sql", "table", "job_events"),
  r("0008_trades_phase3c_fixes.sql", "column", "merchants", "trade_reminders_enabled"),
  r("0008_trades_phase3c_fixes.sql", "index", "job_invoices", "job_invoices_schedule_due_uq"),
  r("0009_trades_gst_mode.sql", "column", "merchants", "trade_gst_mode"),
  r("0009_trades_gst_mode.sql", "column", "job_invoices", "gst_mode"),
  r("0010_merchant_tutorial_progress.sql", "column", "merchants", "tutorial_generation"),
  r("0010_merchant_tutorial_progress.sql", "column", "merchants", "tutorial_auto_enabled"),
  r("0010_merchant_tutorial_progress.sql", "table", "merchant_tutorial_progress"),
  r("0010_merchant_tutorial_progress.sql", "index", "merchant_tutorial_progress", "merchant_tutorial_progress_run_page_idx"),
  r("0010a_reconcile_retail_payment_baseline.sql", "table", "tapt_stones"),
  r("0010a_reconcile_retail_payment_baseline.sql", "table", "split_payments"),
  r("0010a_reconcile_retail_payment_baseline.sql", "table", "platform_fees"),
  r("0010a_reconcile_retail_payment_baseline.sql", "table", "merchant_subscriptions"),
  r("0010a_reconcile_retail_payment_baseline.sql", "column", "transactions", "tapt_stone_id"),
  r("0011_payment_links_and_board_numbers.sql", "column", "transactions", "payment_token_hash"),
  r("0011_payment_links_and_board_numbers.sql", "table", "payment_attempts"),
  r("0011_payment_links_and_board_numbers.sql", "index", "payment_attempts", "payment_attempts_return_state_hash_uq"),
  r("0011_payment_links_and_board_numbers.sql", "index", "tapt_stones", "tapt_stones_active_merchant_number_uq"),
  r("0012_push_notification_preferences.sql", "table", "push_subscriptions"),
  r("0012_push_notification_preferences.sql", "column", "push_subscriptions", "preferences"),
  r("0012_push_notification_preferences.sql", "table", "push_notification_deliveries"),
  r("0012_push_notification_preferences.sql", "index", "push_notification_deliveries", "push_notification_deliveries_merchant_event_key_uq"),
  r("0013_subscription_plans.sql", "column", "merchant_subscriptions", "plan_id"),
  r("0013_subscription_plans.sql", "column", "merchant_subscriptions", "current_period_start"),
  r("0013_subscription_plans.sql", "column", "merchant_subscriptions", "billing_claim_token"),
  r("0013_subscription_plans.sql", "table", "subscription_billing_history"),
  r("0013_subscription_plans.sql", "column", "users", "invite_token_hash"),
  r("0013_subscription_plans.sql", "column", "users", "reset_token"),
  r("0013_subscription_plans.sql", "constraint", "merchant_subscriptions", "merchant_subscriptions_plan_id_check"),
  r("0013_subscription_plans.sql", "constraint", "users", "users_status_check"),
  r("0013_subscription_plans.sql", "index", "users", "users_email_lower_uq"),
  r("0014_reconcile_subscription_activation.sql", "verified_subscriptions_active", "merchant_subscriptions"),
  r("0015_startup_schema_cleanup.sql", "column", "merchants", "business_description"),
  r("0015_startup_schema_cleanup.sql", "column", "merchants", "estimated_annual_turnover"),
  r("0015_startup_schema_cleanup.sql", "column", "merchants", "onboarding_completed"),
  r("0015_startup_schema_cleanup.sql", "table", "info_pack_leads"),
  r("0015_startup_schema_cleanup.sql", "table", "uploaded_files"),
  r("0015_startup_schema_cleanup.sql", "verified_onboarding_complete", "merchants"),

  r("0016_transaction_completion_time.sql", "column", "transactions", "completed_at"),
  r("0016_transaction_completion_time.sql", "index", "transactions", "transactions_merchant_completed_at_idx"),
];

export const FIND_MISSING_BASELINE_EFFECTS_SQL = `
WITH requirements AS (
  SELECT *
  FROM jsonb_to_recordset($1::jsonb) AS requirement(
    migration text,
    kind text,
    "relationName" text,
    "objectName" text
  )
)
SELECT migration, kind, "relationName", "objectName"
FROM requirements AS requirement
WHERE requirement.kind NOT IN ('verified_subscriptions_active', 'verified_onboarding_complete')
  AND NOT CASE requirement.kind
  WHEN 'table' THEN to_regclass('public.' || quote_ident(requirement."relationName")) IS NOT NULL
  WHEN 'column' THEN EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = requirement."relationName"
      AND column_info.column_name = requirement."objectName"
  )
  WHEN 'index' THEN to_regclass('public.' || quote_ident(requirement."objectName")) IS NOT NULL
  WHEN 'constraint' THEN EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    JOIN pg_class AS relation_info ON relation_info.oid = constraint_info.conrelid
    JOIN pg_namespace AS namespace_info ON namespace_info.oid = relation_info.relnamespace
    WHERE namespace_info.nspname = 'public'
      AND relation_info.relname = requirement."relationName"
      AND constraint_info.conname = requirement."objectName"
  )
  ELSE false
END
ORDER BY migration, kind, "relationName", "objectName"`;

export const VERIFY_SUBSCRIPTION_ACTIVATION_SQL = `SELECT NOT EXISTS (
  SELECT 1
  FROM merchants AS merchant
  JOIN merchant_subscriptions AS subscription ON subscription.merchant_id = merchant.id
  WHERE merchant.status IN ('verified', 'active')
    AND subscription.status = 'pending'
) AS ok`;


export const VERIFY_ONBOARDING_BACKFILL_SQL = `SELECT NOT EXISTS (
  SELECT 1 FROM merchants
  WHERE status IN ('verified', 'active')
    AND onboarding_completed IS DISTINCT FROM true
) AS ok`;
export async function findMissingBaselineEffects(
  client: BaselineContractClient,
  migrations: readonly string[],
): Promise<string[]> {
  const selected = BASELINE_EFFECT_REQUIREMENTS.filter((item) => migrations.includes(item.migration));
  const covered = new Set(selected.map((item) => item.migration));
  const missing = migrations
    .filter((migration) => !covered.has(migration))
    .map((migration) => `${migration}: no baseline verification contract`);

  const schemaRequirements = selected.filter((item) => !item.kind.startsWith("verified_"));
  if (schemaRequirements.length > 0) {
    const result = await client.query<Requirement>(FIND_MISSING_BASELINE_EFFECTS_SQL, [
      JSON.stringify(schemaRequirements),
    ]);
    for (const item of result.rows) {
      const detail = item.objectName || item.relationName || item.kind;
      missing.push(`${item.migration}: missing ${item.kind} ${detail}`);
    }
  }

  const needsActivationCheck = selected.some((item) => item.kind === "verified_subscriptions_active");
  if (missing.length === 0 && needsActivationCheck) {
    const result = await client.query<{ ok: boolean }>(VERIFY_SUBSCRIPTION_ACTIVATION_SQL);
    if (result.rows[0]?.ok !== true) {
      missing.push("0014_reconcile_subscription_activation.sql: verified merchant has a pending subscription");
    }
  }

  const needsOnboardingCheck = selected.some((item) => item.kind === "verified_onboarding_complete");
  if (missing.length === 0 && needsOnboardingCheck) {
    const result = await client.query<{ ok: boolean }>(VERIFY_ONBOARDING_BACKFILL_SQL);
    if (result.rows[0]?.ok !== true) {
      missing.push("0015_startup_schema_cleanup.sql: verified merchant onboarding backfill is incomplete");
    }
  }
  return missing;
}
