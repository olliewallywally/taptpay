BEGIN;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS trade_gst_mode text NOT NULL DEFAULT 'inclusive';

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS gst_mode text;

COMMIT;
