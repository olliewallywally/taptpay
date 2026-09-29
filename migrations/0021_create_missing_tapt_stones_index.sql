-- Create the index 0010a was recorded as having created but never did.
--
-- Why this exists
-- ---------------
-- `0010a:20` creates `tapt_stones_merchant_id_idx`. Both live databases
-- **baselined** 0000-0013 on 2026-08-09 - recorded as applied without executing
-- (server/migrate.ts:54) - so that CREATE INDEX never ran on either. The
-- 2026-09-10 fingerprints confirm it: a clean build has 82 indexes, the
-- development database and production have 81, and the missing one is this.
--
-- Nothing detected it for a year because the baseline contract sampled four
-- tables and one column out of 0010a's twelve statements, and an index was not
-- among them. That contract is now exhaustive (43/43 indexes), so a future
-- baseline cannot pass while an index it claims is absent - but the contract
-- gates *future* stamps and cannot retroactively create what the old one let
-- through. This migration is that repair, the same shape as 0019.
--
-- It matters for reads, not just for tidiness. `tapt_stones` carries only
-- `tapt_stones_pkey` and the partial
-- `tapt_stones_active_merchant_number_uq ... WHERE (is_active IS TRUE)`. That
-- partial index leads on `merchant_id` but cannot serve a query that includes
-- inactive stones, so every such lookup falls back to a sequential scan.
--
-- IF NOT EXISTS, so this is a no-op on a clean build - the R0-T6A empty
-- database fingerprint is unchanged by it - and it only does work on a database
-- that baselined 0010a. It creates an index and touches no row.
--
-- Deliberately NOT `CREATE INDEX CONCURRENTLY`: the runner wraps each migration
-- in a transaction and CONCURRENTLY cannot run inside one. It would need the
-- explicitly reviewed non-transactional mode R0-T6A requires for that, which is
-- not warranted here - `tapt_stones` is a small table and the ACCESS EXCLUSIVE
-- lock is momentary.

BEGIN;

CREATE INDEX IF NOT EXISTS tapt_stones_merchant_id_idx
  ON tapt_stones (merchant_id);

COMMIT;
