# R1-T7 S3a — property profiles, archive and history

Code: `8e7f315f`; base: `6c2fafab`; branch `remediation/r1-continuation-20260907`.
[Preflight/separate reread](../../../PLAN-2026-10-03-r1-t7-s3-property.md).
Code complete, independent review remains. S3 schedules/invoices and whole R1 remain open.

Six explicit-merchant contracts cover create/read/update/archive/restore/history.
Create/update project contact/address/channel fields and refuse identity/tenant/lifecycle
injection. Reads and updates scope id AND merchant. Archive changes profile and only
same-merchant schedules in one transaction; a refused parent touches no child. Restore
never resumes terminated schedules. History requires event merchant and current profile
merchant in the same SQL query. Four obsolete global profile mutation contracts removed;
public/provider profile read remains separate. Memory remains explicitly DB-only.
The two existing profile reads now use the instance DB handle, enabling real verification.

Six profile registrations migrated. Raced writes return existing tenant-safe 404 and
log no event; raced history returns an empty list. Existing roles/body order/DTOs and
archived reads/repeated archive/restore semantics preserved. No client/schema change.

Red storage/SQL: **15 fail**. The initial HTTP fixture recursively wrapped a Jest spy;
corrected it, replayed against committed `6c2fafab` while preserving/restoring current
sources, and obtained **4 genuine failures**: three writes answered 200 after ownership
changed, and history returned events despite a moved parent. Final focused **19 pass**.
Affected property/roles/attachment/matrix regression **10 suites / 227 pass**. After
correcting only reviewed schema labels, final generated-policy checks **3 suites / 33
pass**. Typecheck/build/whitespace pass. Inventories **187 routes / 0 unclassified /
0 gaps; 231 methods**. No new full-server/client/browser run is claimed.

Fresh actual PostgreSQL: **9 pass / 0 fail**. Includes two-merchant refusals, projected
fields, scoped archive cascade with an intentionally inconsistent foreign child,
restore preserving cancellation, dual-owner history predicates, a real trigger-induced
child failure rolling back the profile, and all three updates actually waiting on a
concurrent ownership change then refusing. Synthetic test trigger/function removed;
disposable instance stopped. No application database/provider/migration/deploy/push.

Review focus: runtime field projection, query tenant predicates, archive rollback and
scope, history parent EXISTS, refusal before event logging, and unchanged public lanes.
Tests use HTTP fakes for route decisions and actual SQL for storage; neither is a
substitute for the outstanding independent review. Logs: `/tmp/taptpay-s3a-*`.
