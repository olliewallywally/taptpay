-- Adopt `crypto_transactions` into the migration history.
--
-- Why this exists
-- ---------------
-- The R0-T6A restore rehearsal (docs/evidence/remediation-v2-2/r0/
-- R0-T6A-restore-rehearsal-2026-09-09.md) restored production into an isolated
-- database and compared it to a database built from `migrations/` alone. They
-- differed by exactly one table: production has `public.crypto_transactions`
-- and the migration history has no idea it exists.
--
-- It predates `0000`. It was created by an old `drizzle-kit push` from the
-- crypto-payment feature that the 2026-07-20 handoff removed; removing the code
-- left the table behind. So "rebuild from migrations reproduces production" was
-- false by one table, and would have been false in a real restore.
--
-- This migration makes the history true. It does not resurrect the feature:
-- `FEATURE_CRYPTO` is still a false-only kill switch (server/config.ts:267
-- throws if it is ever set true) and no live source reads this table.
--
-- Every statement is IF NOT EXISTS: this is a no-op against dev and prod, which
-- already have it. It records history, it does not change either database, and
-- it neither reads, backfills nor deletes a single row.
--
-- Shape is copied from the live catalogue, not from the deleted Drizzle
-- declaration: column order, types, nullability, defaults and all four
-- constraint NAMES match what production actually carries, so the R0-T6A schema
-- fingerprint of a rebuilt database matches production exactly rather than
-- approximately. `id serial` reproduces `crypto_transactions_id_seq` and the
-- `crypto_transactions_pkey` primary key by Postgres' own naming.
--
-- Deliberate exception, do not "fix" it
-- ------------------------------------
-- This is the ONLY table created by a migration that is not declared in
-- shared/schema.ts, and it stays that way on purpose — declaring it would
-- re-import a removed feature's surface into the ORM. The consequence is that
-- `drizzle-kit push` (npm run db:push) diffs `public` against shared/schema.ts
-- and WILL OFFER TO DROP THIS TABLE. That hazard already existed before this
-- migration; `npm run db:push` has always been unsafe here. The invariant is
-- pinned by migration-schema-parity.test.ts so it cannot drift silently.

BEGIN;

CREATE TABLE IF NOT EXISTS crypto_transactions (
  id serial PRIMARY KEY,
  transaction_id integer,
  merchant_id integer,
  cryptocurrency text NOT NULL,
  wallet_address text NOT NULL,
  crypto_amount text NOT NULL,
  fiat_amount numeric(10, 2) NOT NULL,
  exchange_rate numeric(18, 8) NOT NULL,
  coinbase_charge_id text,
  coinbase_charge_code text,
  hosted_url text,
  blockchain_tx_hash text,
  confirmations integer DEFAULT 0,
  required_confirmations integer DEFAULT 1,
  network_fee_amount text,
  network_fee_fiat numeric(10, 2),
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamp,
  completed_at timestamp,
  created_at timestamp DEFAULT now(),
  CONSTRAINT crypto_transactions_coinbase_charge_id_unique UNIQUE (coinbase_charge_id),
  CONSTRAINT crypto_transactions_transaction_id_transactions_id_fk
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  CONSTRAINT crypto_transactions_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

COMMIT;
