-- R1-T4 phase E — sign-ins become sessions the server keeps (owner decisions 2026-09-29 and
-- 2026-09-30, docs/decisions/2026-09-29-r1-t4-phase-e-owner-answers.md and
-- docs/decisions/2026-09-30-r1-t4-phase-e-go-owner-answers.md).
--
-- One row per signed-in device. The browser holds `<id>.<secret>` in an HttpOnly cookie; only
-- SHA-256 digests of secrets are stored: the current one, one offered by the daily swap and not yet
-- used, and the one it replaced, accepted for 60 seconds after the new one's first use. A business
-- session records its login's session_version, so advancing the version (a password reset or
-- change, "sign out everywhere") ends it; an admin session, which has no login row, records an HMAC
-- tag of the admin's credentials instead. No address is kept; the device label is a browser and
-- platform name. The application reclaims rows 30 days after they could last have been used.
-- Additive: a new table. Once the code that writes it runs, sign-in fails until it exists.
BEGIN;

CREATE TABLE auth_sessions (
  id text PRIMARY KEY,
  principal text NOT NULL,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  session_version integer,
  admin_tag text,
  secret_hash text NOT NULL,
  offered_secret_hash text,
  offered_at timestamptz,
  previous_secret_hash text,
  previous_valid_until timestamptz,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  rotated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  CONSTRAINT auth_sessions_principal_chk CHECK (
    (principal = 'business' AND user_id IS NOT NULL AND session_version IS NOT NULL AND admin_tag IS NULL)
    OR (principal = 'admin' AND user_id IS NULL AND session_version IS NULL AND admin_tag IS NOT NULL)
  ),
  CONSTRAINT auth_sessions_offer_chk CHECK ((offered_secret_hash IS NULL) = (offered_at IS NULL)),
  CONSTRAINT auth_sessions_previous_chk CHECK ((previous_secret_hash IS NULL) = (previous_valid_until IS NULL)),
  CONSTRAINT auth_sessions_revoked_chk CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_absolute_expires_at_idx ON auth_sessions (absolute_expires_at);

COMMIT;
