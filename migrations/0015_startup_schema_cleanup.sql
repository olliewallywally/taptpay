-- Move the remaining app-start schema/data mutations into reviewed migration
-- history. Production startup is now read-only with respect to schema.

BEGIN;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS estimated_annual_turnover text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS info_pack_leads (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id serial PRIMARY KEY,
  path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

UPDATE merchants
SET onboarding_completed = true
WHERE status IN ('verified', 'active')
  AND onboarding_completed IS DISTINCT FROM true;

COMMIT;
