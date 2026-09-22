-- R1-T4 phase D follow-up — each push subscription records the login that made it
-- (owner decision 2026-09-22, docs/decisions/2026-09-22-r1-t4-phase-d-owner-answers.md).
--
-- Log Out stops that device's notifications; "sign out of all devices", a password
-- reset and a password change stop every device of that login. Subscriptions from
-- before this migration stay NULL (unattributed): ending the sessions of any login
-- of their merchant stops them too. A browser still signed in re-registers under
-- its login the next time the app opens; an iPhone, the next time its notifications
-- are turned on. A deleted login takes its subscriptions with it. Additive: a
-- nullable column (no rewrite) and one index.
BEGIN;

ALTER TABLE push_subscriptions
  ADD COLUMN user_id integer REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions (user_id);

COMMIT;
