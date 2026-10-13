/** Read-only counts. No identifier, token, hash, body or row values returned. */
export const PAYMENT_DURABILITY_PREFLIGHT_QUERIES = {
  duplicateRetailSessions:`SELECT count(*)::int AS n FROM (SELECT processor_session_id FROM payment_attempts WHERE processor_session_id IS NOT NULL GROUP BY processor_session_id HAVING count(*)>1) x`,
  duplicateRetailXIds:`SELECT count(*)::int AS n FROM (SELECT processor_x_id FROM payment_attempts WHERE processor_x_id IS NOT NULL GROUP BY processor_x_id HAVING count(*)>1) x`,
  duplicateSplitTransactions:`SELECT count(*)::int AS n FROM (SELECT windcave_transaction_id FROM split_payments WHERE windcave_transaction_id IS NOT NULL GROUP BY windcave_transaction_id HAVING count(*)>1) x`,
  concurrentRetailShares:`SELECT count(*)::int AS n FROM (SELECT transaction_id,share_index FROM payment_attempts WHERE state IN ('claiming','ready','finalizing') GROUP BY transaction_id,share_index HAVING count(*)>1) x`,
  orphanRetailAttempts:`SELECT count(*)::int AS n FROM payment_attempts a LEFT JOIN transactions t ON t.id=a.transaction_id WHERE t.id IS NULL`,
  invalidRetailStates:`SELECT count(*)::int AS n FROM transactions WHERE status NOT IN ('pending','processing','completed','failed','cancelled','partially_refunded','refunded')`,
  invalidRetailShareStates:`SELECT count(*)::int AS n FROM split_payments WHERE status NOT IN ('pending','processing','completed','failed')`,
  invalidPropertyStates:`SELECT count(*)::int AS n FROM invoices_rent_requests WHERE status NOT IN ('pending_dispatch','dispatched','dispatch_failed','sent','viewed','overdue','paid','paid_external','voided')`,
  invalidTradesStates:`SELECT count(*)::int AS n FROM job_invoices WHERE status NOT IN ('pending_dispatch','dispatched','dispatch_failed','sent','viewed','overdue','paid','paid_external','voided')`,
  invalidQuoteStates:`SELECT count(*)::int AS n FROM quotes WHERE status NOT IN ('draft','sent','viewed','accepted','declined','expired')`,
  invalidAttemptStates:`SELECT count(*)::int AS n FROM payment_attempts WHERE state NOT IN ('claiming','ready','finalizing','approved','declined','cancelled','abandoned')`,
  conflictingAggregateSessions:`SELECT count(*)::int AS n FROM (
    SELECT session_id FROM (
      SELECT windcave_session_id AS session_id,'retail:'||id AS target FROM transactions WHERE windcave_session_id IS NOT NULL
      UNION ALL SELECT processor_session_id,'retail:'||transaction_id FROM payment_attempts WHERE processor_session_id IS NOT NULL
      UNION ALL SELECT windcave_session_id,'property:'||id FROM invoices_rent_requests WHERE windcave_session_id IS NOT NULL
      UNION ALL SELECT windcave_session_id,'trades:'||id FROM job_invoices WHERE windcave_session_id IS NOT NULL
      UNION ALL SELECT windcave_session_id,CASE WHEN rent_invoice_id IS NOT NULL THEN 'property:'||rent_invoice_id ELSE 'trades:'||job_invoice_id END FROM invoice_split_sessions
    ) identities GROUP BY session_id HAVING count(DISTINCT target)>1) conflicts`,
} as const;
export async function readPaymentDurabilityPreflight(client:{query(sql:string,values?:any[]):Promise<{rows:any[]}>}) {
  const counts:Record<string,number>={};
  for(const [name,sql] of Object.entries(PAYMENT_DURABILITY_PREFLIGHT_QUERIES)) counts[name]=(await client.query(sql)).rows[0].n;
  const expanded=(await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_attempts' AND column_name='expected_provider_account') AS yes")).rows[0].yes;
  const canonical=(await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_attempts' AND column_name='expected_amount_cents') AS yes")).rows[0].yes;
  const missingExpected=canonical ? (await client.query(`SELECT count(*)::int AS n FROM payment_attempts a
    WHERE a.state IN ('claiming','ready','finalizing') AND (a.expected_amount_cents IS NULL OR a.expected_currency IS NULL
      OR a.expected_merchant_reference IS NULL OR a.provider_environment IS NULL)`)).rows[0].n :
    (await client.query("SELECT count(*)::int AS n FROM payment_attempts WHERE state IN ('claiming','ready','finalizing')")).rows[0].n;
  const sizes=(await client.query(`SELECT c.relname AS table,pg_total_relation_size(c.oid)::float8 AS bytes FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname`,
    [['transactions','payment_attempts','split_payments','invoices_rent_requests','job_invoices','quotes','invoice_payment_attempts','payment_session_bindings','payment_notification_inbox','payment_settlement_events','payment_delivery_outbox']])).rows;
  return {counts,liveRetailMissingExpectations:missingExpected,expanded,sizes};
}
