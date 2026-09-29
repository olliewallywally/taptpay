-- R1-T4 phase D — end every session of a login at once (owner decision
-- 2026-09-21, docs/decisions/2026-09-21-r1-t4-t9-owner-answers.md).
--
-- Each account token carries the session_version it was issued under; a token
-- whose version is behind the row's is refused. The version is raised by a
-- password reset and by "sign out everywhere". Tokens issued before this column
-- existed carry none and count as version 0, so nobody is signed out by the
-- deploy. A constant default: no table rewrite. Additive: apply before the code.
BEGIN;

ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;

COMMIT;
