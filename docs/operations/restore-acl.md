# Restore public-schema permissions

R0-T6A found that the restored snapshot granted `PUBLIC` both `USAGE` and
`CREATE` on `public`; the approved production fingerprint grants only `USAGE`.
Apply this procedure to the owner-approved isolated restore before accepting it
as a recovery candidate. This is an operator procedure, never a migration,
application startup task, or production command.

1. Follow [encrypted backup handling](encrypted-backup.md) and the
   [owner-controlled transfer rule](../../.agents/memory/owner-controlled-restore-verification.md).
   Keep the recovery private key on the owner's computer. Transfer only ciphertext
   encrypted to the disposable restore environment's short-lived key. Stream the
   decrypted dump directly into the isolated target. Keep external jobs, provider
   credentials and customer messaging disabled.
2. Independently identify the disposable target by its approved host, port,
   database and role. In the private operator session, compare
   `current_database()`, `current_user`, `inet_server_addr()` and
   `inet_server_port()` to that target before any write. Do not use ambient
   production URLs or print connection strings. Stop on any identity mismatch.
3. Complete the restore first: a subsequent dump replay can reintroduce grants.
   Capture a schema-only fingerprint with `scripts/schema-fingerprint.mjs` using
   its explicit `FINGERPRINT_DATABASE_URL` input through the approved secret
   channel. Compare every fingerprint section against the approved source,
   including named role grants and owners. Summary counts and whole-document
   digests cannot establish restore equivalence.
4. In that same verified disposable connection, execute this transaction with
   the SQL client's stop-on-error option enabled. It changes only the public
   schema's `PUBLIC CREATE` privilege. It neither changes ownership nor grants
   missing privileges. If `USAGE` is missing, rollback and review the unexpected
   policy instead of widening it automatically.

```sql
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $verify$
DECLARE public_usage boolean; public_create boolean; public_grantable boolean;
BEGIN
  SELECT coalesce(bool_or(a.privilege_type = 'USAGE'), false),
         coalesce(bool_or(a.privilege_type = 'CREATE'), false),
         coalesce(bool_or(a.is_grantable), false)
    INTO public_usage, public_create, public_grantable
    FROM pg_catalog.pg_namespace n
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
   WHERE n.nspname = 'public' AND a.grantee = 0;
  IF NOT public_usage OR public_create OR public_grantable THEN
    RAISE EXCEPTION 'RESTORE_ACL_POLICY_MISMATCH';
  END IF;
END
$verify$;
COMMIT;
```

5. Capture a fresh fingerprint after commit. Run the offline gate:

```text
node scripts/verify-restore-acl.mjs APPROVED_SOURCE_FINGERPRINT.json RESTORED_FINGERPRINT.json
```

The gate checks fingerprint integrity and the exact `PUBLIC` policy; it must
return `status: pass`. It does not approve owners, named-role grants, table or
default privileges, data, decryptability, RPO/RTO or the rest of the schema.
Continue the full section-by-section comparison and count-only recovery checks.
Record accepted ownership/provider differences explicitly. Never replace the
source fingerprint with the restored one to make a check pass.

On SQL failure, rollback or disconnect; do not accept the target. After a
successful repair, rollback of application code must not restore `PUBLIC CREATE`.
Repeat the permission check after every subsequent restore. Dispose of the
short-lived key, transfer ciphertext and owner-side plaintext under the approved
cleanup procedure; retain the original recovery-encrypted backup. Record only
sanitised pass/fail, scope, timings and count-only evidence.
