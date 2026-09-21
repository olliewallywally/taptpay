-- R1-T4 phase C — sign-in and account-recovery throttles shared by every app
-- instance, slowing repeated failures down rather than locking an account (owner
-- decision 2026-09-21, docs/decisions/2026-09-21-r1-t4-t9-owner-answers.md).
--
-- bucket_key is a purpose prefix and an HMAC of the subject (an email address or
-- a client address) under a server secret: no email or IP address is stored. The
-- application reclaims rows idle past their window. Additive: apply before the
-- code that uses it.
BEGIN;

CREATE TABLE auth_throttle (
  bucket_key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  next_allowed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_throttle_updated_at_idx ON auth_throttle (updated_at);

COMMIT;
