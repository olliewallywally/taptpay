-- R1-T4 phase A — Google sign-in hands the browser a one-time code, never an
-- account token (owner decision 2026-09-21,
-- docs/decisions/2026-09-21-r1-t4-t9-owner-answers.md).
--
-- The code itself is never stored: only its SHA-256. It reaches the browser in an
-- HttpOnly cookie, expires 60 seconds after it is issued, and is redeemed once —
-- consumed_at is set atomically by the redemption. The application reclaims
-- expired rows. Additive: apply before the code that uses it.
BEGIN;

CREATE TABLE auth_handoff_codes (
  code_hash text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_user boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_handoff_codes_expires_at_idx ON auth_handoff_codes (expires_at);

COMMIT;
