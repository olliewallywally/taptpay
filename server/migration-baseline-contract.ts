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
  kind:
    | "table"
    | "column"
    | "column_no_default"
    | "column_nullable"
    | "index"
    | "constraint"
    | "trigger"
    | "function"
    | "verified_subscriptions_active"
    | "verified_onboarding_complete";
  relationName: string;
  objectName: string;
  definition?: string;
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
  r("0003_property_management.sql", "index", "active_schedules", "active_schedules_next_run_date_idx"),
  r("0003_property_management.sql", "index", "active_schedules", "active_schedules_merchant_status_idx"),
  r("0003_property_management.sql", "index", "invoices_rent_requests", "invoices_schedule_billing_period_unique"),
  r("0003_property_management.sql", "index", "invoices_rent_requests", "invoices_status_due_idx"),
  r("0003_property_management.sql", "index", "invoices_rent_requests", "invoices_merchant_status_idx"),
  r("0003_property_management.sql", "index", "invoices_rent_requests", "invoices_token_idx"),
  r("0003_property_management.sql", "index", "transaction_events", "transaction_events_tenant_created_idx"),
  r("0003_property_management.sql", "index", "transaction_events", "transaction_events_merchant_created_idx"),
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
  r("0007_trades_vertical.sql", "index", "quotes", "quotes_merchant_status_idx"),
  r("0007_trades_vertical.sql", "index", "quotes", "quotes_token_idx"),
  r("0007_trades_vertical.sql", "index", "job_schedules", "job_schedules_next_run_date_idx"),
  r("0007_trades_vertical.sql", "index", "job_schedules", "job_schedules_merchant_status_idx"),
  r("0007_trades_vertical.sql", "index", "job_invoices", "job_invoices_status_due_idx"),
  r("0007_trades_vertical.sql", "index", "job_invoices", "job_invoices_merchant_status_idx"),
  r("0007_trades_vertical.sql", "index", "job_invoices", "job_invoices_token_idx"),
  r("0007_trades_vertical.sql", "index", "job_events", "job_events_client_created_idx"),
  r("0007_trades_vertical.sql", "index", "job_events", "job_events_merchant_created_idx"),
  r("0008_trades_phase3c_fixes.sql", "column", "merchants", "trade_reminders_enabled"),
  r("0008_trades_phase3c_fixes.sql", "index", "job_invoices", "job_invoices_schedule_due_uq"),
  r("0009_trades_gst_mode.sql", "column", "merchants", "trade_gst_mode"),
  r("0009_trades_gst_mode.sql", "column", "quotes", "gst_mode"),
  r("0010_merchant_tutorial_progress.sql", "column", "merchants", "tutorial_generation"),
  r("0010_merchant_tutorial_progress.sql", "column", "merchants", "tutorial_auto_enabled"),
  r("0010_merchant_tutorial_progress.sql", "table", "merchant_tutorial_progress"),
  r("0010_merchant_tutorial_progress.sql", "index", "merchant_tutorial_progress", "merchant_tutorial_progress_run_page_idx"),
  r("0010_merchant_tutorial_progress.sql", "index", "merchant_tutorial_progress", "merchant_tutorial_progress_merchant_generation_idx"),
  r("0010a_reconcile_retail_payment_baseline.sql", "table", "tapt_stones"),
  r("0010a_reconcile_retail_payment_baseline.sql", "table", "split_payments"),
  r("0010a_reconcile_retail_payment_baseline.sql", "table", "platform_fees"),
  r("0010a_reconcile_retail_payment_baseline.sql", "table", "merchant_subscriptions"),
  r("0010a_reconcile_retail_payment_baseline.sql", "column", "transactions", "tapt_stone_id"),
  r("0010a_reconcile_retail_payment_baseline.sql", "index", "tapt_stones", "tapt_stones_merchant_id_idx"),
  r("0010a_reconcile_retail_payment_baseline.sql", "column_no_default", "transactions", "merchant_id"),
  r("0010a_reconcile_retail_payment_baseline.sql", "column_nullable", "transactions", "merchant_id"),
  r("0010a_reconcile_retail_payment_baseline.sql", "index", "transactions", "transactions_merchant_id_idx"),
  r("0010a_reconcile_retail_payment_baseline.sql", "index", "transactions", "transactions_tapt_stone_id_idx"),
  r("0010a_reconcile_retail_payment_baseline.sql", "index", "split_payments", "split_payments_transaction_id_idx"),
  r("0010a_reconcile_retail_payment_baseline.sql", "index", "split_payments", "split_payments_merchant_id_idx"),
  r("0011_payment_links_and_board_numbers.sql", "column", "transactions", "payment_token_hash"),
  r("0011_payment_links_and_board_numbers.sql", "table", "payment_attempts"),
  r("0011_payment_links_and_board_numbers.sql", "index", "payment_attempts", "payment_attempts_return_state_hash_uq"),
  r("0011_payment_links_and_board_numbers.sql", "index", "tapt_stones", "tapt_stones_active_merchant_number_uq"),
  r("0011_payment_links_and_board_numbers.sql", "index", "transactions", "transactions_payment_token_hash_uq"),
  r("0011_payment_links_and_board_numbers.sql", "index", "payment_attempts", "payment_attempts_transaction_idx"),
  r("0011_payment_links_and_board_numbers.sql", "index", "payment_attempts", "payment_attempts_transaction_share_key_uq"),
  r("0011_payment_links_and_board_numbers.sql", "index", "payment_attempts", "payment_attempts_live_transaction_share_uq"),
  r("0011_payment_links_and_board_numbers.sql", "index", "split_payments", "split_payments_transaction_split_uq"),
  r("0012_push_notification_preferences.sql", "table", "push_subscriptions"),
  r("0012_push_notification_preferences.sql", "column", "push_subscriptions", "preferences"),
  r("0012_push_notification_preferences.sql", "table", "push_notification_deliveries"),
  r("0012_push_notification_preferences.sql", "index", "push_notification_deliveries", "push_notification_deliveries_merchant_event_key_uq"),
  r("0013_subscription_plans.sql", "column", "merchant_subscriptions", "plan_id"),
  r("0013_subscription_plans.sql", "column", "merchant_subscriptions", "current_period_start"),
  r("0013_subscription_plans.sql", "column_no_default", "merchant_subscriptions", "current_period_start"),
  r("0013_subscription_plans.sql", "column", "merchant_subscriptions", "billing_claim_token"),
  r("0013_subscription_plans.sql", "table", "subscription_billing_history"),
  r("0013_subscription_plans.sql", "column_no_default", "users", "merchant_id"),
  r("0013_subscription_plans.sql", "column_nullable", "users", "merchant_id"),
  r("0013_subscription_plans.sql", "column", "users", "invite_token_hash"),
  r("0013_subscription_plans.sql", "column", "users", "reset_token"),
  r("0013_subscription_plans.sql", "constraint", "merchant_subscriptions", "merchant_subscriptions_plan_id_check"),
  r("0013_subscription_plans.sql", "constraint", "users", "users_status_check"),
  r("0013_subscription_plans.sql", "index", "users", "users_email_lower_uq"),
  r("0013_subscription_plans.sql", "index", "subscription_billing_history", "subscription_billing_history_merchant_created_idx"),
  r("0013_subscription_plans.sql", "index", "subscription_billing_history", "subscription_billing_history_idempotency_key_uq"),
  r("0013_subscription_plans.sql", "index", "users", "users_merchant_id_idx"),
  r("0013_subscription_plans.sql", "index", "users", "users_invite_token_hash_uq"),
  r("0013_subscription_plans.sql", "index", "users", "users_reset_token_hash_uq"),
  r("0014_reconcile_subscription_activation.sql", "verified_subscriptions_active", "merchant_subscriptions"),
  r("0015_startup_schema_cleanup.sql", "column", "merchants", "business_description"),
  r("0015_startup_schema_cleanup.sql", "column", "merchants", "estimated_annual_turnover"),
  r("0015_startup_schema_cleanup.sql", "column", "merchants", "onboarding_completed"),
  r("0015_startup_schema_cleanup.sql", "table", "info_pack_leads"),
  r("0015_startup_schema_cleanup.sql", "table", "uploaded_files"),
  r("0015_startup_schema_cleanup.sql", "verified_onboarding_complete", "merchants"),

  r("0016_transaction_completion_time.sql", "column", "transactions", "completed_at"),
  r("0016_transaction_completion_time.sql", "index", "transactions", "transactions_merchant_completed_at_idx"),

  r("0017_schema_history_catchup.sql", "column", "merchants", "google_id"),
  r("0017_schema_history_catchup.sql", "column", "merchants", "windcave_api_key"),
  r("0017_schema_history_catchup.sql", "column", "merchants", "daily_goal"),
  r("0017_schema_history_catchup.sql", "column", "merchants", "reset_token_expiry"),
  r("0017_schema_history_catchup.sql", "column", "invoices_rent_requests", "kind"),
  r("0017_schema_history_catchup.sql", "column", "invoices_rent_requests", "document_url"),
  r("0017_schema_history_catchup.sql", "table", "refunds"),
  r("0017_schema_history_catchup.sql", "index", "refunds", "refunds_merchant_id_idx"),
  r("0017_schema_history_catchup.sql", "table", "merchant_settlements"),
  r("0017_schema_history_catchup.sql", "table", "stock_items"),
  r("0017_schema_history_catchup.sql", "table", "api_keys"),
  r("0017_schema_history_catchup.sql", "constraint", "api_keys", "api_keys_api_key_unique"),
  r("0017_schema_history_catchup.sql", "table", "api_requests"),
  r("0017_schema_history_catchup.sql", "table", "webhook_deliveries"),
  r("0017_schema_history_catchup.sql", "index", "refunds", "refunds_transaction_id_idx"),
  r("0018_adopt_crypto_transactions.sql", "table", "crypto_transactions"),
  r("0018_adopt_crypto_transactions.sql", "constraint", "crypto_transactions",
    "crypto_transactions_coinbase_charge_id_unique"),
  r("0019_drop_rogue_fk_defaults.sql", "column_no_default", "transactions", "merchant_id"),
  r("0019_drop_rogue_fk_defaults.sql", "column_no_default", "users", "merchant_id"),
  r("0019_drop_rogue_fk_defaults.sql", "column_no_default", "refunds", "merchant_id"),
  r("0019_drop_rogue_fk_defaults.sql", "column_no_default", "refunds", "transaction_id"),
  r("0019_drop_rogue_fk_defaults.sql", "column_no_default", "platform_fees", "merchant_id"),
  r("0019_drop_rogue_fk_defaults.sql", "column_no_default", "platform_fees", "transaction_id"),
  r("0019_drop_rogue_fk_defaults.sql", "column_no_default", "merchant_settlements", "merchant_id"),
  r("0020_adopt_orphan_columns.sql", "column", "merchants", "coinbase_commerce_api_key"),
  r("0020_adopt_orphan_columns.sql", "column", "merchants", "coinbase_webhook_secret"),
  r("0020_adopt_orphan_columns.sql", "column", "merchants", "crypto_enabled"),
  r("0020_adopt_orphan_columns.sql", "column", "merchants", "enabled_cryptocurrencies"),
  r("0020_adopt_orphan_columns.sql", "column", "merchants", "auto_convert_to_fiat"),
  r("0020_adopt_orphan_columns.sql", "column", "merchants", "min_confirmations"),
  r("0020_adopt_orphan_columns.sql", "column", "invoices_rent_requests", "scheduled_send_at"),
  r("0021_create_missing_tapt_stones_index.sql", "index", "tapt_stones", "tapt_stones_merchant_id_idx"),
  r("0022_gap11_session_single_use_indexes.sql", "index", "payment_attempts", "payment_attempts_processor_session_id_uq"),
  r("0022_gap11_session_single_use_indexes.sql", "index", "split_payments", "split_payments_windcave_transaction_id_uq"),
  r("0023_uploaded_files_tenant_column.sql", "column", "uploaded_files", "merchant_id"),
  r("0023_uploaded_files_tenant_column.sql", "index", "uploaded_files", "uploaded_files_merchant_id_idx"),
  r("0024_invoice_document_security.sql", "table", "invoice_document_access_audit"),
  r("0024_invoice_document_security.sql", "table", "invoice_document_read_limits"),
  r("0025_verified_upload_ownership.sql", "table", "uploaded_file_ownership_evidence"),
  r("0026_auth_handoff_codes.sql", "table", "auth_handoff_codes"),
  r("0026_auth_handoff_codes.sql", "index", "auth_handoff_codes", "auth_handoff_codes_expires_at_idx"),
  r("0027_users_session_version.sql", "column", "users", "session_version"),
  r("0028_auth_throttle.sql", "table", "auth_throttle"),
  r("0028_auth_throttle.sql", "index", "auth_throttle", "auth_throttle_updated_at_idx"),
  r("0029_push_subscriptions_user.sql", "column", "push_subscriptions", "user_id"),
  r("0029_push_subscriptions_user.sql", "constraint", "push_subscriptions", "push_subscriptions_user_id_fkey"),
  r("0029_push_subscriptions_user.sql", "index", "push_subscriptions", "push_subscriptions_user_id_idx"),
  r("0030_invoice_split_sessions.sql", "table", "invoice_split_sessions"),
  r("0030_invoice_split_sessions.sql", "constraint", "invoice_split_sessions", "invoice_split_sessions_one_invoice_chk"),
  r("0030_invoice_split_sessions.sql", "index", "invoice_split_sessions", "invoice_split_sessions_rent_invoice_idx"),
  r("0030_invoice_split_sessions.sql", "index", "invoice_split_sessions", "invoice_split_sessions_job_invoice_idx"),
  r("0031_auth_sessions.sql", "table", "auth_sessions"),
  r("0031_auth_sessions.sql", "constraint", "auth_sessions", "auth_sessions_principal_chk"),
  r("0031_auth_sessions.sql", "constraint", "auth_sessions", "auth_sessions_user_id_fkey"),
  r("0031_auth_sessions.sql", "index", "auth_sessions", "auth_sessions_user_id_idx"),
  r("0031_auth_sessions.sql", "index", "auth_sessions", "auth_sessions_absolute_expires_at_idx"),
  r("0032_uploaded_file_scans.sql", "table", "uploaded_file_scans"),
  r("0032_uploaded_file_scans.sql", "constraint", "uploaded_file_scans", "uploaded_file_scans_verdict_chk"),
  r("0032_uploaded_file_scans.sql", "constraint", "uploaded_file_scans", "uploaded_file_scans_signature_chk"),
  r("0032_uploaded_file_scans.sql", "constraint", "uploaded_file_scans", "uploaded_file_scans_file_id_fkey"),
  r("0033_apple_identities.sql", "table", "apple_identities"),
  r("0033_apple_identities.sql", "constraint", "apple_identities", "apple_identities_linked_chk"),
  r("0033_apple_identities.sql", "constraint", "apple_identities", "apple_identities_user_id_fkey"),
  r("0033_apple_identities.sql", "index", "apple_identities", "apple_identities_subject_uq"),
  r("0033_apple_identities.sql", "index", "apple_identities", "apple_identities_user_id_uq"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempts", "processor_transaction_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "quotes", "token_hash"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "quotes", "quotes_token_hash_check"),
  r("0036_durable_payment_reconciliation.sql", "index", "quotes", "quotes_token_hash_uq"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "send_started_at"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_attempt_send_started_check"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "processor_x_id"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_processor_x_id_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_processor_x_id_check"),
  r("0036_durable_payment_reconciliation.sql", "function", "", "taptpay_r3_immutable_identity"),
  r("0036_durable_payment_reconciliation.sql", "function", "", "taptpay_r3_transaction_identity"),
  r("0036_durable_payment_reconciliation.sql", "function", "", "taptpay_r3_attached_identity"),
  r("0036_durable_payment_reconciliation.sql", "trigger", "invoice_payment_attempts", "invoice_attempt_immutable"),
  r("0036_durable_payment_reconciliation.sql", "trigger", "invoice_payment_attempts", "invoice_attached_immutable"),
  r("0036_durable_payment_reconciliation.sql", "trigger", "payment_attempt_expectations", "retail_expectation_immutable"),
  r("0036_durable_payment_reconciliation.sql", "trigger", "payment_attempts", "retail_attempt_immutable"),
  r("0036_durable_payment_reconciliation.sql", "trigger", "payment_attempts", "retail_attached_immutable"),
  r("0036_durable_payment_reconciliation.sql", "trigger", "payment_session_bindings", "payment_binding_immutable"),
  r("0036_durable_payment_reconciliation.sql", "trigger", "payment_session_bindings", "payment_binding_transaction_immutable"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_attempts", "payment_attempts_processor_transaction_id_uq"),
  r("0036_durable_payment_reconciliation.sql", "table", "invoice_payment_attempts", ""),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "id"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "merchant_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "rent_invoice_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "job_invoice_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "share_index"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "amount_cents"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "idempotency_key"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "request_fingerprint"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "processor_x_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "currency"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "reference"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "environment"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "provider_account"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "state"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "outcome"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "lease_expires_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "return_state_hash"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "return_state_expires_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "reconciled_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "created_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoice_payment_attempts", "updated_at"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_environment_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_share_index_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_amount_cents_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_request_fingerprint_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_processor_x_id_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_currency_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_reference_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_provider_account_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_state_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_outcome_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_return_state_hash_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_attempt_one_invoice_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_attempt_lease_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_attempt_return_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_attempt_outcome_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_pkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_processor_x_id_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_return_state_hash_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_payment_attempts_merchant_id_fkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_attempt_rent_tenant_fk"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoice_payment_attempts", "invoice_attempt_job_tenant_fk"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_payment_attempts_pkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_payment_attempts_processor_x_id_key"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_payment_attempts_return_state_hash_key"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_attempt_rent_key_uq"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_attempt_job_key_uq"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_attempt_rent_live_uq"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_attempt_job_live_uq"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_attempt_rent_paid_uq"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoice_payment_attempts", "invoice_attempt_job_paid_uq"),
  r("0036_durable_payment_reconciliation.sql", "table", "payment_attempt_expectations", ""),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "payment_attempt_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "transaction_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "merchant_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "amount_cents"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "currency"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "reference"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "environment"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "provider_account"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "request_fingerprint"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_attempt_expectations", "created_at"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_amount_cents_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_currency_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_reference_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_environment_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_provider_account_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_request_fingerprint_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_pkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_payment_attempt_id_transactio_fkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempt_expectations", "payment_attempt_expectations_transaction_id_merchant_id_fkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_attempt_expectations", "payment_attempt_expectations_pkey"),
  r("0036_durable_payment_reconciliation.sql", "table", "payment_delivery_outbox", ""),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "event_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "channel"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "status"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "attempt_count"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "next_attempt_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "lease_owner"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "lease_started_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "lease_expires_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_delivery_outbox", "completed_at"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_channel_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_status_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_attempt_count_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_delivery_outbox", "payment_outbox_lease_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_pkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_event_id_channel_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_event_id_fkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_delivery_outbox", "payment_delivery_outbox_pkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_delivery_outbox", "payment_delivery_outbox_event_id_channel_key"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_delivery_outbox", "payment_outbox_due_idx"),
  r("0036_durable_payment_reconciliation.sql", "table", "payment_notification_inbox", ""),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "provider"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "kind"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "session_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "status"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "first_received_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "last_received_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "arrival_count"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "attempt_count"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "next_attempt_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "lease_owner"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "lease_started_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "lease_expires_at"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "last_error_code"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "observed_transaction_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_notification_inbox", "completed_at"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_provider_kind_session_id_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_provider_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_kind_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_session_id_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_status_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_arrival_count_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_attempt_count_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_last_error_code_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_observed_transaction_id_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_inbox_lease_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_notification_inbox", "payment_notification_inbox_pkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_notification_inbox", "payment_notification_inbox_pkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_notification_inbox", "payment_notification_inbox_provider_kind_session_id_key"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_notification_inbox", "payment_inbox_due_idx"),
  r("0036_durable_payment_reconciliation.sql", "table", "payment_session_bindings", ""),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_session_bindings", "session_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_session_bindings", "provider"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_session_bindings", "processor_x_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_session_bindings", "payment_attempt_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_session_bindings", "invoice_attempt_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_session_bindings", "provider_transaction_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_session_bindings", "created_at"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_invoice_attempt_id_fkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_session_id_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_provider_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_processor_x_id_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_provider_transaction_id_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_binding_one_attempt_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_pkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_processor_x_id_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_payment_attempt_id_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_invoice_attempt_id_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_provider_transaction_id_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_session_bindings", "payment_session_bindings_payment_attempt_id_fkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_session_bindings", "payment_session_bindings_pkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_session_bindings", "payment_session_bindings_processor_x_id_key"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_session_bindings", "payment_session_bindings_payment_attempt_id_key"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_session_bindings", "payment_session_bindings_invoice_attempt_id_key"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_session_bindings", "payment_session_bindings_provider_transaction_id_key"),
  r("0036_durable_payment_reconciliation.sql", "table", "payment_settlement_events", ""),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_settlement_events", "id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_settlement_events", "session_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_settlement_events", "merchant_id"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_settlement_events", "outcome"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_settlement_events", "amount_cents"),
  r("0036_durable_payment_reconciliation.sql", "column", "payment_settlement_events", "created_at"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_settlement_events", "payment_settlement_events_outcome_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_settlement_events", "payment_settlement_events_amount_cents_check"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_settlement_events", "payment_settlement_events_pkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_settlement_events", "payment_settlement_events_session_id_key"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_settlement_events", "payment_settlement_events_session_id_fkey"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_settlement_events", "payment_settlement_events_merchant_id_fkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_settlement_events", "payment_settlement_events_pkey"),
  r("0036_durable_payment_reconciliation.sql", "index", "payment_settlement_events", "payment_settlement_events_session_id_key"),
  r("0036_durable_payment_reconciliation.sql", "column", "invoices_rent_requests", "token_hash"),
  r("0036_durable_payment_reconciliation.sql", "column", "job_invoices", "token_hash"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "transactions", "transactions_id_merchant_uq"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "payment_attempts", "payment_attempts_id_transaction_uq"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoices_rent_requests", "invoices_id_merchant_uq"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "job_invoices", "job_invoices_id_merchant_uq"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "invoices_rent_requests", "invoices_token_hash_check"),
  r("0036_durable_payment_reconciliation.sql", "index", "invoices_rent_requests", "invoices_token_hash_uq"),
  r("0036_durable_payment_reconciliation.sql", "constraint", "job_invoices", "job_invoices_token_hash_check"),
  r("0036_durable_payment_reconciliation.sql", "index", "job_invoices", "job_invoices_token_hash_uq"),
  r("0034_payment_attempt_expected_values.sql", "column_nullable", "payment_attempts", "expected_amount_cents"),
  r("0034_payment_attempt_expected_values.sql", "column_nullable", "payment_attempts", "expected_currency"),
  r("0034_payment_attempt_expected_values.sql", "column_nullable", "payment_attempts", "expected_merchant_reference"),
  r("0034_payment_attempt_expected_values.sql", "column_nullable", "payment_attempts", "provider_environment"),
  r("0034_payment_attempt_expected_values.sql", "column_nullable", "payment_attempts", "provider_transaction_id"),
  r("0034_payment_attempt_expected_values.sql", "column_nullable", "payment_attempts", "last_reconciliation_code"),
  r("0034_payment_attempt_expected_values.sql", "column_nullable", "payment_attempts", "last_reconciled_at"),
  r("0034_payment_attempt_expected_values.sql", "constraint", "payment_attempts", "payment_attempts_expected_pair_check"),
  r("0034_payment_attempt_expected_values.sql", "constraint", "payment_attempts", "payment_attempts_expected_amount_check"),
  r("0034_payment_attempt_expected_values.sql", "constraint", "payment_attempts", "payment_attempts_expected_currency_check"),
  r("0034_payment_attempt_expected_values.sql", "constraint", "payment_attempts", "payment_attempts_expected_reference_check"),
  r("0034_payment_attempt_expected_values.sql", "constraint", "payment_attempts", "payment_attempts_provider_environment_check"),
  r("0034_payment_attempt_expected_values.sql", "index", "payment_attempts", "payment_attempts_provider_transaction_id_uq"),
  r("0035_payment_attempt_processor_x_id_unique.sql", "index", "payment_attempts", "payment_attempts_processor_x_id_uq"),
  r("0037_retail_payment_canonical_integration.sql", "column_nullable", "payment_attempts", "expected_provider_account"),
  r("0037_retail_payment_canonical_integration.sql", "column_nullable", "payment_attempts", "request_fingerprint"),
  r("0037_retail_payment_canonical_integration.sql", "column_nullable", "payment_attempts", "send_started_at"),
  r("0037_retail_payment_canonical_integration.sql", "constraint", "payment_attempts", "payment_attempts_account_fingerprint_check"),
  r("0037_retail_payment_canonical_integration.sql", "constraint", "payment_attempts", "payment_attempts_send_started_check"),
  r("0037_retail_payment_canonical_integration.sql", "constraint", "payment_attempts", "payment_attempts_reconciliation_code_check"),
  r("0037_retail_payment_canonical_integration.sql", "function", "", "taptpay_r3_retail_expected_identity"),
  r("0037_retail_payment_canonical_integration.sql", "trigger", "payment_attempts", "retail_expected_identity"),
  r("0038_cash_command_identity.sql", "column_nullable", "transactions", "cash_idempotency_key"),
  r("0038_cash_command_identity.sql", "column_nullable", "transactions", "cash_request_fingerprint"),
  r("0038_cash_command_identity.sql", "constraint", "transactions", "transactions_cash_identity_check"),
  r("0038_cash_command_identity.sql", "index", "transactions", "transactions_cash_key_uq"),
  r("0038_cash_command_identity.sql", "column_nullable", "transaction_events", "transaction_id"),
  r("0038_cash_command_identity.sql", "constraint", "transaction_events", "transaction_events_transaction_merchant_fk"),
  r("0038_cash_command_identity.sql", "index", "transaction_events", "transaction_events_cash_record_uq"),
  r("0038_cash_command_identity.sql", "column_nullable", "payment_delivery_outbox", "event_id"),
  r("0038_cash_command_identity.sql", "column_nullable", "payment_delivery_outbox", "transaction_event_id"),
  r("0038_cash_command_identity.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_transaction_event_id_fkey"),
  r("0038_cash_command_identity.sql", "constraint", "payment_delivery_outbox", "payment_outbox_transaction_event_channel_uq"),
  r("0038_cash_command_identity.sql", "constraint", "payment_delivery_outbox", "payment_outbox_event_source_check"),
  r("0038_cash_command_identity.sql", "function", "", "taptpay_cash_identity"),
  r("0038_cash_command_identity.sql", "trigger", "transactions", "cash_command_immutable"),
  r("0039_payment_wallet_submission.sql", "table", "payment_wallet_submissions"),
  r("0039_payment_wallet_submission.sql", "column", "payment_wallet_submissions", "session_id"),
  r("0039_payment_wallet_submission.sql", "column", "payment_wallet_submissions", "payment_method"),
  r("0039_payment_wallet_submission.sql", "column", "payment_wallet_submissions", "send_started_at"),
  r("0039_payment_wallet_submission.sql", "constraint", "payment_wallet_submissions", "payment_wallet_submissions_pkey"),
  r("0039_payment_wallet_submission.sql", "constraint", "payment_wallet_submissions", "payment_wallet_submissions_payment_method_check"),
  r("0039_payment_wallet_submission.sql", "constraint", "payment_wallet_submissions", "payment_wallet_submissions_session_id_fkey"),
  r("0039_payment_wallet_submission.sql", "trigger", "payment_wallet_submissions", "payment_wallet_submission_immutable"),
  r("0040_invoice_attempt_payer.sql", "column_nullable", "invoice_payment_attempts", "payer_email"),
  r("0040_invoice_attempt_payer.sql", "constraint", "invoice_payment_attempts", "invoice_attempt_payer_email_check"),
  r("0041_invoice_share_reservations.sql", "index", "invoice_payment_attempts", "invoice_attempt_rent_command_uq"),
  r("0041_invoice_share_reservations.sql", "index", "invoice_payment_attempts", "invoice_attempt_job_command_uq"),
  r("0042_payment_command_delivery.sql", "column_nullable", "payment_settlement_events", "previous_aggregate_status"),
  r("0042_payment_command_delivery.sql", "column_nullable", "payment_delivery_outbox", "job_event_id"),
  r("0042_payment_command_delivery.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_job_event_id_fkey"),
  r("0042_payment_command_delivery.sql", "index", "payment_delivery_outbox", "payment_outbox_job_event_channel_uq"),
  r("0042_payment_command_delivery.sql", "trigger", "transaction_events", "transaction_event_append_only"),
  r("0042_payment_command_delivery.sql", "trigger", "job_events", "job_event_append_only"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "subscription_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "merchant_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "idempotency_key"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "request_fingerprint"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "processor_x_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "reference"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "environment"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "provider_account"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "state"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "lease_expires_at"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_card_attempts", "send_started_at"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_card_attempts", "session_id"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_card_attempts", "provider_transaction_id"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_card_attempts", "return_state_hash"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_card_attempts", "return_state_expires_at"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_card_attempts", "card_digest"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_card_attempts", "applied_at"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "created_at"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_card_attempts", "updated_at"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_card_attempts", "card_attempt_tenant_fk"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_card_attempts", "card_attempt_merchant_fk"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_card_attempts", "card_attempt_id_merchant_uq"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_card_attempts", "card_attempt_command_uq"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_card_attempts", "card_attempt_lease_check"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_card_attempts", "card_attempt_send_check"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_card_attempts", "card_attempt_return_check"),
  r("0043_subscription_payment_attempts.sql", "index", "subscription_card_attempts", "card_attempt_live_uq"),
  r("0043_subscription_payment_attempts.sql", "table", "subscription_card_attempts"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "subscription_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "merchant_id"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_billing_attempts", "card_attempt_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "kind"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "idempotency_key"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "request_fingerprint"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "processor_x_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "amount_cents"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "currency"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "reference"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "environment"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "provider_account"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "card_digest"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "plan_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "prior_plan_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "prior_status"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "actor"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "price_cents"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "seat_limit"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "period_start"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "period_end"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "attempt_number"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "state"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_billing_attempts", "send_started_at"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_billing_attempts", "provider_transaction_id"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_billing_attempts", "lease_owner"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_billing_attempts", "lease_expires_at"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "lease_generation"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "next_attempt_at"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "reconciliation_count"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_billing_attempts", "last_error_code"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_billing_attempts", "applied_at"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "created_at"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_billing_attempts", "updated_at"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_billing_attempts", "billing_attempt_tenant_fk"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_billing_attempts", "billing_attempt_card_tenant_fk"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_billing_attempts", "billing_attempt_merchant_fk"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_billing_attempts", "billing_attempt_id_merchant_uq"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_billing_attempts", "billing_attempt_command_uq"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_billing_attempts", "billing_attempt_lease_check"),
  r("0043_subscription_payment_attempts.sql", "index", "subscription_billing_attempts", "billing_attempt_unapplied_uq"),
  r("0043_subscription_payment_attempts.sql", "index", "subscription_billing_attempts", "billing_attempt_due_idx"),
  r("0043_subscription_payment_attempts.sql", "table", "subscription_billing_attempts"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_payment_events", "id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_payment_events", "merchant_id"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_payment_events", "card_attempt_id"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "subscription_payment_events", "billing_attempt_id"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_payment_events", "event_type"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_payment_events", "payload"),
  r("0043_subscription_payment_attempts.sql", "column", "subscription_payment_events", "created_at"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_payment_events", "subscription_event_source_check"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_payment_events", "subscription_event_card_fk"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_payment_events", "subscription_event_billing_fk"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_payment_events", "subscription_event_card_uq"),
  r("0043_subscription_payment_attempts.sql", "constraint", "subscription_payment_events", "subscription_event_billing_uq"),
  r("0043_subscription_payment_attempts.sql", "table", "subscription_payment_events"),
  r("0043_subscription_payment_attempts.sql", "constraint", "merchant_subscriptions", "subscription_id_merchant_uq"),
  r("0043_subscription_payment_attempts.sql", "column_nullable", "payment_delivery_outbox", "subscription_event_id"),
  r("0043_subscription_payment_attempts.sql", "constraint", "payment_delivery_outbox", "payment_delivery_outbox_subscription_event_id_fkey"),
  r("0043_subscription_payment_attempts.sql", "index", "payment_delivery_outbox", "payment_outbox_subscription_event_channel_uq"),
  r("0043_subscription_payment_attempts.sql", "trigger", "subscription_card_attempts", "subscription_card_identity"),
  r("0043_subscription_payment_attempts.sql", "trigger", "subscription_card_attempts", "subscription_card_send_identity"),
  r("0043_subscription_payment_attempts.sql", "trigger", "subscription_billing_attempts", "subscription_billing_identity"),
  r("0043_subscription_payment_attempts.sql", "trigger", "subscription_billing_attempts", "subscription_billing_send_identity"),
  r("0043_subscription_payment_attempts.sql", "trigger", "subscription_payment_events", "subscription_event_append_only"),
  r("0044_subscription_identity_registry.sql", "column_nullable", "payment_session_bindings", "card_attempt_id"),
  r("0044_subscription_identity_registry.sql", "constraint", "payment_session_bindings", "payment_session_bindings_card_attempt_id_fkey"),
  r("0044_subscription_identity_registry.sql", "index", "payment_session_bindings", "payment_binding_card_attempt_uq"),
  r("0044_subscription_identity_registry.sql", "constraint", "subscription_card_attempts", "card_approved_identity_check"),
  r("0044_subscription_identity_registry.sql", "constraint", "subscription_billing_attempts", "billing_approved_identity_check"),
  r("0044_subscription_identity_registry.sql", "constraint", "subscription_billing_attempts", "billing_finite_lease_check"),
  r("0044_subscription_identity_registry.sql", "table", "provider_transaction_claims"),
  r("0044_subscription_identity_registry.sql", "column", "provider_transaction_claims", "provider_transaction_id"),
  r("0044_subscription_identity_registry.sql", "column_nullable", "provider_transaction_claims", "binding_session_id"),
  r("0044_subscription_identity_registry.sql", "column_nullable", "provider_transaction_claims", "billing_attempt_id"),
  r("0044_subscription_identity_registry.sql", "column", "provider_transaction_claims", "created_at"),
  r("0044_subscription_identity_registry.sql", "constraint", "provider_transaction_claims", "provider_transaction_claims_pkey"),
  r("0044_subscription_identity_registry.sql", "constraint", "provider_transaction_claims", "provider_transaction_claims_binding_session_id_fkey"),
  r("0044_subscription_identity_registry.sql", "constraint", "provider_transaction_claims", "provider_transaction_claims_billing_attempt_id_fkey"),
  r("0044_subscription_identity_registry.sql", "constraint", "provider_transaction_claims", "provider_transaction_claim_source_check"),
  r("0044_subscription_identity_registry.sql", "function", "", "taptpay_r3_claim_provider_transaction"),
  r("0044_subscription_identity_registry.sql", "trigger", "payment_session_bindings", "binding_provider_transaction_claim"),
  r("0044_subscription_identity_registry.sql", "trigger", "subscription_billing_attempts", "billing_provider_transaction_claim"),
  r("0044_subscription_identity_registry.sql", "trigger", "provider_transaction_claims", "provider_transaction_claim_immutable"),
  r("0044_subscription_identity_registry.sql", "trigger", "payment_delivery_outbox", "payment_outbox_identity"),
  r("0045_provider_operation_keys.sql", "table", "provider_operation_keys"),
  r("0045_provider_operation_keys.sql", "column", "provider_operation_keys", "processor_x_id"),
  r("0045_provider_operation_keys.sql", "column", "provider_operation_keys", "created_at"),
  r("0045_provider_operation_keys.sql", "function", "", "taptpay_r3_claim_operation_key"),
  r("0045_provider_operation_keys.sql", "constraint", "provider_operation_keys", "provider_operation_key_source_check"),
  r("0045_provider_operation_keys.sql", "constraint", "provider_operation_keys", "provider_operation_keys_pkey"),
  r("0045_provider_operation_keys.sql", "constraint", "provider_operation_keys", "provider_operation_keys_processor_x_id_check"),
  r("0045_provider_operation_keys.sql", "column_nullable", "provider_operation_keys", "payment_attempt_id"),
  r("0045_provider_operation_keys.sql", "constraint", "provider_operation_keys", "provider_operation_keys_payment_attempt_id_fkey"),
  r("0045_provider_operation_keys.sql", "column_nullable", "provider_operation_keys", "invoice_attempt_id"),
  r("0045_provider_operation_keys.sql", "constraint", "provider_operation_keys", "provider_operation_keys_invoice_attempt_id_fkey"),
  r("0045_provider_operation_keys.sql", "column_nullable", "provider_operation_keys", "card_attempt_id"),
  r("0045_provider_operation_keys.sql", "constraint", "provider_operation_keys", "provider_operation_keys_card_attempt_id_fkey"),
  r("0045_provider_operation_keys.sql", "column_nullable", "provider_operation_keys", "billing_attempt_id"),
  r("0045_provider_operation_keys.sql", "constraint", "provider_operation_keys", "provider_operation_keys_billing_attempt_id_fkey"),
  r("0045_provider_operation_keys.sql", "column", "subscription_card_attempts", "amount_cents"),
  r("0045_provider_operation_keys.sql", "constraint", "subscription_card_attempts", "subscription_card_attempts_amount_cents_check"),
  r("0045_provider_operation_keys.sql", "column", "subscription_card_attempts", "currency"),
  r("0045_provider_operation_keys.sql", "constraint", "subscription_card_attempts", "subscription_card_attempts_currency_check"),
  r("0045_provider_operation_keys.sql", "column", "subscription_card_attempts", "provider_type"),
  r("0045_provider_operation_keys.sql", "constraint", "subscription_card_attempts", "subscription_card_attempts_provider_type_check"),
  r("0045_provider_operation_keys.sql", "trigger", "payment_attempts", "retail_operation_key"),
  r("0045_provider_operation_keys.sql", "trigger", "invoice_payment_attempts", "invoice_operation_key"),
  r("0045_provider_operation_keys.sql", "trigger", "subscription_card_attempts", "card_operation_key"),
  r("0045_provider_operation_keys.sql", "trigger", "subscription_billing_attempts", "billing_operation_key"),
  r("0045_provider_operation_keys.sql", "trigger", "provider_operation_keys", "provider_operation_key_immutable"),
  r("0046_payment_delivery_targets.sql","table","payment_delivery_targets"),
  r("0046_payment_delivery_targets.sql","column_nullable","payment_delivery_outbox","targets_prepared_at"),
  r("0046_payment_delivery_targets.sql","constraint","payment_delivery_targets","payment_delivery_targets_outbox_id_fkey"),
  r("0046_payment_delivery_targets.sql","constraint","payment_delivery_targets","payment_delivery_targets_merchant_id_fkey"),
  r("0046_payment_delivery_targets.sql","constraint","payment_delivery_targets","payment_delivery_targets_push_subscription_id_fkey"),
  r("0046_payment_delivery_targets.sql","constraint","payment_delivery_targets","delivery_target_push_check"),
  r("0046_payment_delivery_targets.sql","constraint","payment_delivery_targets","delivery_target_lease_check"),
  r("0046_payment_delivery_targets.sql","constraint","payment_delivery_targets","delivery_target_complete_check"),
  r("0046_payment_delivery_targets.sql","index","payment_delivery_targets","payment_delivery_targets_outbox_idx"),
  r("0046_payment_delivery_targets.sql","index","payment_delivery_targets","payment_delivery_targets_realtime_idx"),
  r("0046_payment_delivery_targets.sql","trigger","payment_delivery_targets","delivery_target_immutable"),
  r("0046_payment_delivery_targets.sql","trigger","payment_delivery_targets","delivery_target_first_send_once"),
  r("0046_payment_delivery_targets.sql","trigger","payment_delivery_outbox","payment_outbox_identity"),
  r("0046_payment_delivery_targets.sql","trigger","payment_delivery_outbox","payment_outbox_preparation_once"),
  r("0047_payment_creation_commands.sql","table","payment_creation_commands"),
  r("0047_payment_creation_commands.sql","constraint","payment_creation_commands","creation_command_source_check"),
  r("0047_payment_creation_commands.sql","constraint","payment_creation_commands","creation_command_key_uq"),
  r("0047_payment_creation_commands.sql","constraint","payment_creation_commands","creation_command_retail_fk"),
  r("0047_payment_creation_commands.sql","constraint","payment_creation_commands","creation_command_property_fk"),
  r("0047_payment_creation_commands.sql","constraint","payment_creation_commands","creation_command_trades_fk"),
  r("0047_payment_creation_commands.sql","trigger","payment_creation_commands","creation_command_immutable"),
  r("0047_payment_creation_commands.sql","column_nullable","subscription_payment_events","subscription_id"),
  r("0047_payment_creation_commands.sql","column_nullable","subscription_payment_events","idempotency_key"),
  r("0047_payment_creation_commands.sql","column_nullable","subscription_payment_events","request_fingerprint"),
  r("0047_payment_creation_commands.sql","constraint","subscription_payment_events","subscription_event_parent_fk"),
  r("0047_payment_creation_commands.sql","constraint","subscription_payment_events","subscription_manual_command_check"),
  r("0047_payment_creation_commands.sql","index","subscription_payment_events","subscription_event_command_uq"),
  r("0048a_data_encryption_workflows.sql","table","data_encryption_control"),
  r("0048a_data_encryption_workflows.sql","constraint","data_encryption_control","encryption_control_writer_check"),
  r("0048a_data_encryption_workflows.sql","constraint","data_encryption_control","encryption_contract_review_check"),
  r("0048a_data_encryption_workflows.sql","table","data_encryption_runs"),
  r("0048a_data_encryption_workflows.sql","table","data_encryption_batches"),
  r("0048a_data_encryption_workflows.sql","constraint","data_encryption_batches","encryption_batch_number_uq"),
  r("0048a_data_encryption_workflows.sql","trigger","data_encryption_control","encryption_control_monotonic"),
  r("0048a_data_encryption_workflows.sql","trigger","merchants","guard_encrypted_bank_writes"),
  r("0048a_data_encryption_workflows.sql","trigger","data_encryption_batches","encryption_batch_immutable"),
  r("0048a_data_encryption_workflows.sql","trigger","data_encryption_runs","encryption_run_identity"),
  r("0048b_active_secret_vault.sql","column","data_encryption_control","active_secret_stage"),
  r("0048b_active_secret_vault.sql","column","data_encryption_control","active_secret_review_reference"),
  r("0048b_active_secret_vault.sql","constraint","data_encryption_control","active_secret_contract_review_check"),
  r("0048b_active_secret_vault.sql","column","data_encryption_runs","scope"),
  r("0048b_active_secret_vault.sql","column","data_encryption_runs","table_cursor"),
  r("0048b_active_secret_vault.sql","column","data_encryption_runs","last_record_id"),
  r("0048b_active_secret_vault.sql","trigger","data_encryption_control","encryption_active_control_monotonic"),
  r("0048b_active_secret_vault.sql","trigger","data_encryption_runs","encryption_run_scope_identity"),
  r("0048b_active_secret_vault.sql","trigger","merchant_subscriptions","guard_active_secret_writes"),
  r("0048b_active_secret_vault.sql","trigger","invoices_rent_requests","guard_active_secret_writes"),
  r("0048b_active_secret_vault.sql","trigger","job_invoices","guard_active_secret_writes"),
  r("0048b_active_secret_vault.sql","trigger","quotes","guard_active_secret_writes"),
  {
    migration: "0048c_invoice_email_constraint_canonical.sql", kind: "constraint",
    relationName: "invoice_payment_attempts", objectName: "invoice_attempt_payer_email_check",
    // Presence alone would falsely baseline the old nested BETWEEN expression.
    definition: "CHECK (((payer_email IS NULL) OR ((length(payer_email) >= 3) AND (length(payer_email) <= 254) AND (POSITION(('@'::text) IN (payer_email)) > 1))))",
  },
  ...['cron_runs','cron_jobs'].map(table=>r('0049a_durable_cron.sql','table',table)),
  ...['id','owner','scheduled_for','attempt','state','started_at','heartbeat_at','lease_expires_at','deadline_at','finished_at','duration_ms'].map(column=>r('0049a_durable_cron.sql','column','cron_runs',column)),
  ...['id','run_id','name','state','started_at','finished_at','duration_ms','metrics','error_code','resolved_at','review_digest'].map(column=>r('0049a_durable_cron.sql','column','cron_jobs',column)),
  ...['cron_run_slot_attempt_uq','cron_run_attempt_check','cron_run_state_check','cron_run_times_check','cron_run_finish_check'].map(name=>r('0049a_durable_cron.sql','constraint','cron_runs',name)),
  ...['cron_jobs_run_id_fkey','cron_job_run_name_uq','cron_job_name_check','cron_job_state_check','cron_job_metrics_check','cron_job_error_check','cron_job_finish_check','cron_job_resolution_check'].map(name=>r('0049a_durable_cron.sql','constraint','cron_jobs',name)),
  ...['cron_one_running_uq','cron_run_latest_idx','cron_run_success_idx'].map(name=>r('0049a_durable_cron.sql','index','cron_runs',name)),
  ...['cron_job_active_name_uq','cron_job_run_idx','cron_job_held_idx'].map(name=>r('0049a_durable_cron.sql','index','cron_jobs',name)),
  r('0049a_durable_cron.sql','function','','taptpay_cron_metrics_valid'),r('0049a_durable_cron.sql','function','','taptpay_cron_history_guard'),
  r('0049a_durable_cron.sql','trigger','cron_runs','cron_run_history_guard'),r('0049a_durable_cron.sql','trigger','cron_jobs','cron_job_history_guard'),
];

export const FIND_MISSING_BASELINE_EFFECTS_SQL = `
WITH requirements AS (
  SELECT *
  FROM jsonb_to_recordset($1::jsonb) AS requirement(
    migration text,
    kind text,
    "relationName" text,
    "objectName" text,
    definition text
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
  WHEN 'column_no_default' THEN EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = requirement."relationName"
      AND column_info.column_name = requirement."objectName"
      AND column_info.column_default IS NULL
  )
  WHEN 'column_nullable' THEN EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = requirement."relationName"
      AND column_info.column_name = requirement."objectName"
      AND column_info.is_nullable = 'YES'
  )
  WHEN 'index' THEN to_regclass('public.' || quote_ident(requirement."objectName")) IS NOT NULL
  WHEN 'function' THEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=requirement."objectName"
  )
  WHEN 'trigger' THEN EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=requirement."relationName" AND t.tgname=requirement."objectName" AND NOT t.tgisinternal AND t.tgenabled='O'
  )
  WHEN 'constraint' THEN EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    JOIN pg_class AS relation_info ON relation_info.oid = constraint_info.conrelid
    JOIN pg_namespace AS namespace_info ON namespace_info.oid = relation_info.relnamespace
    WHERE namespace_info.nspname = 'public'
      AND relation_info.relname = requirement."relationName"
      AND constraint_info.conname = requirement."objectName"
      AND (requirement.definition IS NULL OR pg_get_constraintdef(constraint_info.oid) = requirement.definition)
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
/**
 * `column_no_default` and `column_nullable` each fail for two reasons — an absent
 * column, or a column that kept the property — so their wording has to hold for
 * both, and "missing <kind> <name>" would be wrong half the time. The other kinds
 * assert plain existence and keep their original phrasing.
 */
function describeUnmetRequirement(item: Requirement): string {
  if (item.kind === "column_no_default") {
    return `${item.migration}: ${item.relationName}.${item.objectName} must exist without a column default`;
  }
  if (item.kind === "column_nullable") {
    return `${item.migration}: ${item.relationName}.${item.objectName} must exist and be nullable`;
  }
  const detail = item.objectName || item.relationName || item.kind;
  return `${item.migration}: missing ${item.kind} ${detail}`;
}

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
      missing.push(describeUnmetRequirement(item));
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
