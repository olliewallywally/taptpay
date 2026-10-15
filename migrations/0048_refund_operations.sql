-- R4-T2 — refund operations on `refunds` (plan v2.2 §11.2-§11.4). Numbered 0048: written as
-- 0039, renumbered after Codex's R3 0039-0047, which R4 preserves unchanged.
--
-- See docs/decisions/2026-10-14-r4-t2-refund-operation-schema.md (ADR, revision 3) and its §21.1
-- reviews: docs/evidence/remediation-v2-2/r4/R4-review-pass-{3,4,5,6}-2026-10-14.md.
--
-- What it adds
-- ------------
-- Columns that make a refund a durable operation: a public operation ID, a typed state,
-- the business-scoped idempotency key and request fingerprint, the provider X-ID and
-- reference fixed before the call, the capture being refunded, exact cents, the provider
-- refund transaction, a lease, an attempt count, the next reconciliation time, a sanitized
-- error code, the initiating user and reason, and timestamptz timestamps. A row whose
-- state is null is a legacy refund: every new rule leaves it alone, and it can never
-- become an operation. No legacy column is dropped, renamed or retyped.
--
-- Reservations are not stored: an operation that is requested, submitted or unknown is the
-- reservation (the ADR's formula; R4-T3).
--
-- Preflight (in the migration)
-- ----------------------------
-- Existing objects with the new names are refused rather than trusted. Nothing about legacy
-- rows is required: they stay legacy. The count-only rehearsal queries are in
-- docs/operations/runbook-2026-10-14-apply-0039-refund-operations.md.
--
-- Locks
-- -----
-- operation_id's volatile default rewrites `refunds` under ACCESS EXCLUSIVE; no other table is
-- locked. The runner bounds the wait with lock_timeout and statement_timeout. Apply with the
-- app stopped. Refund initiation has never been enabled, so the table should be small; the
-- runbook measures it.
--
-- Rollback: a code revert, only while the refund flag is off and no operation is live (the
-- legacy route cannot see live reservations). Legacy writers never set `state` or any new
-- column, so the new rules leave them alone. The ledger is forward-only: no down migration.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'refunds'
       AND column_name IN ('operation_id', 'state', 'idempotency_key', 'request_fingerprint',
         'processor_x_id', 'merchant_reference', 'original_provider_transaction_id',
         'original_share_index', 'provider_environment', 'amount_cents', 'currency',
         'provider_refund_transaction_id', 'lease_owner', 'lease_expires_at', 'attempt_count',
         'next_reconciliation_at', 'last_error_code', 'initiated_by_user_id', 'reason_code',
         'reason_text', 'requested_at', 'submitted_at', 'finished_at', 'updated_at')
  ) OR EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'taptpay_refund_operation_guard'
  ) THEN
    RAISE EXCEPTION '0048 aborted: a refund operation column or function already exists'
      USING HINT = 'This migration does not trust an existing shape. Compare it with this file and resolve by hand.';
  END IF;
END
$$;

LOCK TABLE refunds IN ACCESS EXCLUSIVE MODE;

ALTER TABLE refunds
  ADD COLUMN operation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN state text,
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN request_fingerprint text,
  ADD COLUMN processor_x_id text,
  ADD COLUMN merchant_reference text,
  ADD COLUMN original_provider_transaction_id text,
  ADD COLUMN original_share_index integer,
  ADD COLUMN provider_environment text,
  ADD COLUMN amount_cents bigint,
  ADD COLUMN currency text,
  ADD COLUMN provider_refund_transaction_id text,
  ADD COLUMN lease_owner uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN next_reconciliation_at timestamptz,
  ADD COLUMN last_error_code text,
  ADD COLUMN initiated_by_user_id integer,
  ADD COLUMN reason_code text,
  ADD COLUMN reason_text text,
  ADD COLUMN requested_at timestamptz,
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN finished_at timestamptz,
  ADD COLUMN updated_at timestamptz;

ALTER TABLE refunds
  -- Value shapes (each holds for any row that sets the column).
  ADD CONSTRAINT refunds_state_check CHECK (state IS NULL OR state IN
    ('requested', 'submitted', 'unknown', 'succeeded', 'failed', 'cancelled')),
  ADD CONSTRAINT refunds_fingerprint_check CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT refunds_processor_x_id_check CHECK (processor_x_id IS NULL OR processor_x_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  ADD CONSTRAINT refunds_merchant_reference_check CHECK (merchant_reference IS NULL OR length(merchant_reference) BETWEEN 1 AND 64),
  ADD CONSTRAINT refunds_original_transaction_check CHECK (original_provider_transaction_id IS NULL OR original_provider_transaction_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  ADD CONSTRAINT refunds_original_share_check CHECK (original_share_index IS NULL OR original_share_index >= 0),
  ADD CONSTRAINT refunds_provider_environment_check CHECK (provider_environment IS NULL OR provider_environment IN ('uat', 'production')),
  ADD CONSTRAINT refunds_amount_cents_check CHECK (amount_cents IS NULL OR amount_cents > 0),
  ADD CONSTRAINT refunds_currency_check CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT refunds_provider_refund_transaction_check CHECK (provider_refund_transaction_id IS NULL OR
    (provider_refund_transaction_id ~ '^[A-Za-z0-9_-]{1,64}$'
      AND provider_refund_transaction_id IS DISTINCT FROM original_provider_transaction_id)),
  ADD CONSTRAINT refunds_lease_pair_check CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  ADD CONSTRAINT refunds_attempt_count_check CHECK (attempt_count >= 0),
  ADD CONSTRAINT refunds_error_code_check CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z][a-z0-9_:]{0,63}$'),
  ADD CONSTRAINT refunds_reason_code_check CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{0,31}$'),
  ADD CONSTRAINT refunds_reason_text_check CHECK (reason_text IS NULL OR length(reason_text) BETWEEN 1 AND 500),
  -- A legacy row (state null) carries none of the operation fields.
  ADD CONSTRAINT refunds_legacy_shape_check CHECK (state IS NOT NULL OR (
    idempotency_key IS NULL AND request_fingerprint IS NULL AND processor_x_id IS NULL
    AND merchant_reference IS NULL AND original_provider_transaction_id IS NULL
    AND original_share_index IS NULL AND provider_environment IS NULL AND amount_cents IS NULL
    AND currency IS NULL AND provider_refund_transaction_id IS NULL AND lease_owner IS NULL
    AND lease_expires_at IS NULL AND attempt_count = 0 AND next_reconciliation_at IS NULL
    AND last_error_code IS NULL AND initiated_by_user_id IS NULL AND reason_code IS NULL
    AND reason_text IS NULL AND requested_at IS NULL AND submitted_at IS NULL
    AND finished_at IS NULL AND updated_at IS NULL)),
  -- Every operation row: identity set, legacy amount equal, replaced legacy columns empty.
  ADD CONSTRAINT refunds_operation_shape_check CHECK (state IS NULL OR (
    transaction_id IS NOT NULL AND merchant_id IS NOT NULL AND idempotency_key IS NOT NULL
    AND request_fingerprint IS NOT NULL AND amount_cents IS NOT NULL AND currency IS NOT NULL
    AND initiated_by_user_id IS NOT NULL AND requested_at IS NOT NULL AND updated_at IS NOT NULL
    AND refund_amount * 100 = amount_cents
    AND refund_method IS NOT NULL AND refund_method IN ('original_payment_method', 'bank_transfer', 'manual')
    AND windcave_refund_id IS NULL AND refund_reason IS NULL AND completed_at IS NULL)),
  -- The legacy status tells a reader not yet on R4-T5's DTOs the truth.
  ADD CONSTRAINT refunds_operation_status_check CHECK (state IS NULL OR status = CASE state
    WHEN 'requested' THEN 'pending' WHEN 'submitted' THEN 'processing' WHEN 'unknown' THEN 'processing'
    WHEN 'succeeded' THEN 'completed' ELSE 'failed' END),
  -- A provider refund names what it refunds and where; a record-only refund names nothing
  -- that could say the provider moved money, and is never sent, leased or reconciled.
  ADD CONSTRAINT refunds_operation_method_check CHECK (state IS NULL OR CASE
    WHEN refund_method = 'original_payment_method' THEN
      processor_x_id IS NOT NULL AND merchant_reference IS NOT NULL
      AND original_provider_transaction_id IS NOT NULL AND original_share_index IS NOT NULL
      AND provider_environment IS NOT NULL
    ELSE
      processor_x_id IS NULL AND merchant_reference IS NULL AND original_provider_transaction_id IS NULL
      AND original_share_index IS NULL AND provider_environment IS NULL
      AND provider_refund_transaction_id IS NULL AND submitted_at IS NULL AND lease_owner IS NULL
      AND attempt_count = 0 AND next_reconciliation_at IS NULL AND state = 'succeeded'
    END),
  -- What each state carries.
  ADD CONSTRAINT refunds_operation_state_shape_check CHECK (state IS NULL OR (
    ((state IN ('succeeded', 'failed', 'cancelled')) = (finished_at IS NOT NULL))
    AND (state NOT IN ('succeeded', 'failed', 'cancelled') OR (lease_owner IS NULL AND next_reconciliation_at IS NULL))
    -- An unknown operation with no next time is parked for review, its reservation kept.
    AND (state NOT IN ('requested', 'submitted') OR next_reconciliation_at IS NOT NULL)
    -- A sent operation is always held: the sender's lease covers the call and its polls, and
    -- only an expired lease lets a worker take it over (never finish it under a live one).
    AND (state <> 'submitted' OR lease_owner IS NOT NULL)
    AND (state NOT IN ('requested', 'cancelled') OR submitted_at IS NULL)
    AND (refund_method <> 'original_payment_method' OR state IN ('requested', 'cancelled') OR submitted_at IS NOT NULL)
    -- A pending reply's refund ID is kept from submitted on, for polling.
    AND (state NOT IN ('requested', 'cancelled') OR provider_refund_transaction_id IS NULL)
    AND (refund_method <> 'original_payment_method' OR state <> 'succeeded' OR provider_refund_transaction_id IS NOT NULL))),
  ADD CONSTRAINT refunds_operation_time_check CHECK (state IS NULL OR (
    updated_at >= requested_at
    AND (submitted_at IS NULL OR submitted_at >= requested_at)
    AND (finished_at IS NULL OR finished_at >= requested_at)));

CREATE UNIQUE INDEX refunds_operation_id_uq ON refunds (operation_id);
CREATE UNIQUE INDEX refunds_merchant_idempotency_key_uq ON refunds (merchant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX refunds_processor_x_id_uq ON refunds (processor_x_id) WHERE processor_x_id IS NOT NULL;
CREATE UNIQUE INDEX refunds_provider_refund_transaction_id_uq ON refunds (provider_refund_transaction_id)
  WHERE provider_refund_transaction_id IS NOT NULL;
CREATE INDEX refunds_live_transaction_idx ON refunds (transaction_id)
  WHERE state IN ('requested', 'submitted', 'unknown');
CREATE INDEX refunds_reconciliation_due_idx ON refunds (next_reconciliation_at)
  WHERE state IN ('requested', 'submitted', 'unknown');

CREATE FUNCTION taptpay_refund_operation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  probe refunds;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- A live operation is a reservation and a finished one is in the totals: never deleted.
    IF OLD.state IS NOT NULL THEN
      RAISE EXCEPTION 'a refund operation is never deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state IS NOT NULL AND NOT coalesce(
      (NEW.refund_method = 'original_payment_method' AND NEW.state = 'requested'
        AND NEW.attempt_count = 0 AND NEW.submitted_at IS NULL)
      OR (NEW.refund_method IN ('bank_transfer', 'manual') AND NEW.state = 'succeeded'), false
    ) THEN
      RAISE EXCEPTION 'a refund operation starts requested, or recorded' USING ERRCODE = '23514';
    END IF;
    IF NEW.state IS NOT NULL THEN
      -- The sale is held (KEY SHARE) while this insert commits, so its business cannot change
      -- under the check; R4-T3 also holds it FOR UPDATE.
      PERFORM 1 FROM transactions t WHERE t.id = NEW.transaction_id AND t.merchant_id = NEW.merchant_id FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'a refund operation names a sale of its own business' USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.initiated_by_user_id AND u.merchant_id = NEW.merchant_id) THEN
        RAISE EXCEPTION 'a refund operation names a user of its own business' USING ERRCODE = '23514';
      END IF;
      -- The capture must be this sale's own: an unsplit sale's (share 0; a split sale's own
      -- column holds its last share's capture), the share's, or one an approved attempt for that
      -- share recorded in the same environment. Share indexes match split_payments.split_index.
      IF NEW.refund_method = 'original_payment_method' AND NOT (
        EXISTS (SELECT 1 FROM transactions t WHERE t.id = NEW.transaction_id AND NEW.original_share_index = 0
                 AND t.is_split IS NOT TRUE
                 AND t.windcave_transaction_id = NEW.original_provider_transaction_id)
        OR EXISTS (SELECT 1 FROM split_payments s WHERE s.transaction_id = NEW.transaction_id
                 AND s.split_index = NEW.original_share_index
                 AND s.windcave_transaction_id = NEW.original_provider_transaction_id)
        OR EXISTS (SELECT 1 FROM payment_attempts a WHERE a.transaction_id = NEW.transaction_id
                 AND a.share_index = NEW.original_share_index AND a.outcome = 'approved'
                 AND a.provider_environment = NEW.provider_environment
                 AND a.provider_transaction_id = NEW.original_provider_transaction_id)
      ) THEN
        RAISE EXCEPTION 'a refund operation refunds a capture of its own sale' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state IS NULL THEN
    IF NEW.state IS NOT NULL THEN
      RAISE EXCEPTION 'a legacy refund cannot become an operation' USING ERRCODE = '23514';
    END IF;
    IF NEW.operation_id IS DISTINCT FROM OLD.operation_id THEN
      RAISE EXCEPTION 'a refund operation ID never changes' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state IS NULL THEN
    RAISE EXCEPTION 'a refund operation cannot become legacy' USING ERRCODE = '23514';
  END IF;

  IF (NEW.operation_id, NEW.merchant_id, NEW.transaction_id, NEW.idempotency_key,
      NEW.request_fingerprint, NEW.processor_x_id, NEW.merchant_reference,
      NEW.original_provider_transaction_id, NEW.original_share_index, NEW.provider_environment,
      NEW.amount_cents, NEW.currency, NEW.refund_amount, NEW.refund_method,
      NEW.initiated_by_user_id, NEW.reason_code, NEW.requested_at, NEW.created_at)
    IS DISTINCT FROM
     (OLD.operation_id, OLD.merchant_id, OLD.transaction_id, OLD.idempotency_key,
      OLD.request_fingerprint, OLD.processor_x_id, OLD.merchant_reference,
      OLD.original_provider_transaction_id, OLD.original_share_index, OLD.provider_environment,
      OLD.amount_cents, OLD.currency, OLD.refund_amount, OLD.refund_method,
      OLD.initiated_by_user_id, OLD.reason_code, OLD.requested_at, OLD.created_at)
    -- The reason may only be cleared (a privacy redaction).
    OR (NEW.reason_text IS NOT NULL AND NEW.reason_text IS DISTINCT FROM OLD.reason_text) THEN
    RAISE EXCEPTION 'immutable refund operation identity' USING ERRCODE = '23514';
  END IF;

  IF OLD.state IN ('succeeded', 'failed', 'cancelled') THEN
    probe := NEW;
    probe.customer_notified := OLD.customer_notified;
    probe.updated_at := OLD.updated_at;
    probe.reason_text := OLD.reason_text;
    IF probe IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'a finished refund operation is frozen' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'requested' AND NEW.state IN ('requested', 'submitted', 'cancelled'))
    OR (OLD.state = 'submitted' AND NEW.state IN ('submitted', 'unknown', 'succeeded', 'failed'))
    OR (OLD.state = 'unknown' AND NEW.state IN ('unknown', 'succeeded', 'failed'))
  ) THEN
    -- Only the stored (checked) state is named; the writer's value is never echoed.
    RAISE EXCEPTION 'refund operation % cannot change to that state', OLD.state USING ERRCODE = '23514';
  END IF;
  IF OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'a refund operation is submitted once' USING ERRCODE = '23514';
  END IF;
  IF OLD.provider_refund_transaction_id IS NOT NULL
     AND NEW.provider_refund_transaction_id IS DISTINCT FROM OLD.provider_refund_transaction_id THEN
    RAISE EXCEPTION 'a provider refund number is written once' USING ERRCODE = '23514';
  END IF;
  IF NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'a refund attempt count never decreases' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER refund_operation_guard BEFORE INSERT OR UPDATE OR DELETE ON refunds FOR EACH ROW
  EXECUTE FUNCTION taptpay_refund_operation_guard();

COMMIT;
