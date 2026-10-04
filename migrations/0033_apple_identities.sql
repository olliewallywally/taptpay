-- R1-T5b — Sign in with Apple identities (owner decision 2026-09-29,
-- docs/decisions/2026-09-29-finish-r1-owner-answers.md, answer 2).
--
-- One row per Apple identity: Apple's issuer, this app's client id and Apple's stable subject for
-- the person, together unique. `user_id` is the login it signs in; a row with none is pending: the
-- identity is known but may not sign anyone in (its email already had a TaptPay login when it first
-- arrived, and an identity is never joined to a login by email). A login has at most one Apple
-- identity, and a linked identity is never moved to another login. The email is the one Apple gave
-- on the first authorization (it may be a private relay address); no Apple token or code is kept.
-- The row goes when its login goes.
-- Additive: a new table. Nothing reads it until Sign in with Apple is configured.
BEGIN;

CREATE TABLE apple_identities (
  id serial PRIMARY KEY,
  issuer text NOT NULL,
  client_id text NOT NULL,
  subject text NOT NULL,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  email text,
  is_private_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz,
  CONSTRAINT apple_identities_linked_chk CHECK ((user_id IS NULL) = (linked_at IS NULL))
);

CREATE UNIQUE INDEX apple_identities_subject_uq ON apple_identities (issuer, client_id, subject);
CREATE UNIQUE INDEX apple_identities_user_id_uq ON apple_identities (user_id) WHERE user_id IS NOT NULL;

COMMIT;
