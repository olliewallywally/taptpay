BEGIN;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS tutorial_generation integer NOT NULL DEFAULT 1;

-- Add this nullable first so only rows that existed at migration time receive
-- false. Re-running the migration cannot disable tutorials for newer merchants.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS tutorial_auto_enabled boolean;

-- Do not surprise merchants who already existed before tutorial mode shipped.
-- New merchant rows use the column default and receive tutorials automatically.
UPDATE merchants
SET tutorial_auto_enabled = false
WHERE tutorial_auto_enabled IS NULL;

ALTER TABLE merchants ALTER COLUMN tutorial_auto_enabled SET DEFAULT true;
ALTER TABLE merchants ALTER COLUMN tutorial_auto_enabled SET NOT NULL;

CREATE TABLE IF NOT EXISTS merchant_tutorial_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  page_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'completed', 'dismissed')),
  last_step integer NOT NULL DEFAULT 0 CHECK (last_step >= 0),
  started_at timestamp DEFAULT now(),
  completed_at timestamp,
  dismissed_at timestamp,
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_tutorial_progress_run_page_idx
  ON merchant_tutorial_progress (merchant_id, generation, page_key);

CREATE INDEX IF NOT EXISTS merchant_tutorial_progress_merchant_generation_idx
  ON merchant_tutorial_progress (merchant_id, generation);

COMMIT;
