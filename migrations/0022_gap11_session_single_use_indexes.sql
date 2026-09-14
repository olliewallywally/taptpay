-- Gap 11 / C1 — partial unique indexes closing single-use consumption of a
-- Windcave provider session, as independent defense in depth.
--
-- See docs/decisions/2026-09-13-gap11-split-session-single-use-design.md,
-- section 4 "Recommendation" / "Suggested sequence", step C1. This is C1
-- exactly as scoped there: two additive partial unique indexes, no behaviour
-- change, no schema drop, no compare-and-set finaliser (that is C2, separately
-- scoped future work — not touched here). It does NOT modify
-- finaliseHostedPayment, getNextPendingSplit, updateSplitPaymentStatus, or any
-- of the four call sites the memo's section 1.1 table names.
--
-- Why this exists
-- ---------------
-- A Windcave session, once it has legitimately funded one split-bill share,
-- is never marked spent (memo section 1). Every finalisation path re-derives
-- "which split to credit" by asking for the next pending split, so replaying
-- the same session — deliberately, or via an ordinary provider notification
-- retry (memo section 1.4a) — can credit additional shares for free. A
-- partial unique index makes a second row for the same non-null provider
-- identity a constraint violation instead of a silent double-credit:
--
--   * `payment_attempts (processor_session_id) WHERE ... IS NOT NULL` is also
--     independently required by R2 section 9.4; gap 11 closes as a by-product
--     of work the plan already mandates (memo section 3, Option C).
--   * `split_payments (windcave_transaction_id) WHERE ... IS NOT NULL` is the
--     retail split table's equivalent guard (memo section 3, Option B), so
--     the same provider transaction cannot be recorded as funding two shares
--     even if a caller bypasses the attempt engine.
--
-- Preflight (required before this migration runs, per the memo's "Suggested
-- sequence" step C0 and section 10.6 rule 1 of the plan it draws on): count
-- duplicate non-null `processor_session_id` in `payment_attempts`, duplicate
-- non-null `windcave_transaction_id` in `split_payments`, `split_payments`
-- rows `completed` with a null `windcave_transaction_id`, and transactions
-- whose `completed_splits` disagrees with their actually-completed split
-- rows. Ran via `scripts/count-gap11-session-replay-duplicates.mjs` against
-- this database on 2026-09-14: all four counts were 0 (independently
-- re-verified with a second, differently-phrased read-only query path).
-- `payment_attempts` and `split_payments` both had 0 rows in this database at
-- preflight time (no split-bill transactions exist here yet), so the result
-- is vacuously true here, not a proof under real split-payment load — the
-- same script must be re-run, and must again report all-zero, before this
-- migration is applied anywhere else (including production).
--
-- The DO blocks below re-run the same two duplicate checks as a second,
-- database-native gate at apply time, so this migration independently
-- refuses to proceed in any environment — this one or a later one — where
-- the preflight's assumption no longer holds, rather than relying solely on
-- an external script having been run first. No row is renamed, recomputed,
-- or removed by this migration; it is additive and performs no remediation.
--
-- Deliberately NOT `CREATE INDEX CONCURRENTLY`: the runner (server/migrate.ts)
-- wraps each migration in a transaction and CONCURRENTLY cannot run inside
-- one — the same reasoning as 0021. Both tables are expected to be small in
-- every environment this has been checked against (0 rows here today), so a
-- brief ACCESS EXCLUSIVE lock during a plain CREATE UNIQUE INDEX is
-- acceptable; this is not the R2 §9.4 index applied to a large, live table,
-- which would need the reviewed non-transactional mode called for by plan
-- section 10.6 rule 4.
--
-- IF NOT EXISTS: a no-op if the index already exists with this name and
-- definition. It does not hide a wrong existing shape — nothing in the
-- current schema or migration history creates an index by either of these
-- names — so there is no pre-existing shape to hide behind it (plan section
-- 10.6 rule 5 does not apply the way it did to 0021's repair).

BEGIN;

LOCK TABLE payment_attempts IN SHARE MODE;

DO $$
DECLARE
  duplicate_detail text;
BEGIN
  SELECT string_agg(
    format('processor_session_id=%s rows=%s', processor_session_id, duplicate_count),
    '; ' ORDER BY duplicate_count DESC, processor_session_id
  )
  INTO duplicate_detail
  FROM (
    SELECT processor_session_id, count(*) AS duplicate_count
      FROM payment_attempts
     WHERE processor_session_id IS NOT NULL
     GROUP BY processor_session_id
    HAVING count(*) > 1
     ORDER BY count(*) DESC, processor_session_id
     LIMIT 20
  ) duplicates;

  IF duplicate_detail IS NOT NULL THEN
    RAISE EXCEPTION
      '0022 aborted: duplicate non-null processor_session_id values exist in payment_attempts'
      USING DETAIL = duplicate_detail,
            HINT =
              'This is gap 11 (see docs/decisions/2026-09-13-gap11-split-session-single-use-design.md) live in data. Reconcile from evidence before retrying; this migration performs no remediation.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_processor_session_id_uq
  ON payment_attempts (processor_session_id)
  WHERE processor_session_id IS NOT NULL;

LOCK TABLE split_payments IN SHARE MODE;

DO $$
DECLARE
  duplicate_detail text;
BEGIN
  SELECT string_agg(
    format('windcave_transaction_id=%s rows=%s', windcave_transaction_id, duplicate_count),
    '; ' ORDER BY duplicate_count DESC, windcave_transaction_id
  )
  INTO duplicate_detail
  FROM (
    SELECT windcave_transaction_id, count(*) AS duplicate_count
      FROM split_payments
     WHERE windcave_transaction_id IS NOT NULL
     GROUP BY windcave_transaction_id
    HAVING count(*) > 1
     ORDER BY count(*) DESC, windcave_transaction_id
     LIMIT 20
  ) duplicates;

  IF duplicate_detail IS NOT NULL THEN
    RAISE EXCEPTION
      '0022 aborted: duplicate non-null windcave_transaction_id values exist in split_payments'
      USING DETAIL = duplicate_detail,
            HINT =
              'This is gap 11 (see docs/decisions/2026-09-13-gap11-split-session-single-use-design.md) live in data. Reconcile from evidence before retrying; this migration performs no remediation.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS split_payments_windcave_transaction_id_uq
  ON split_payments (windcave_transaction_id)
  WHERE windcave_transaction_id IS NOT NULL;

COMMIT;
