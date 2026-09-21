# Gap 13 — independent review corrections

Branch: `remediation/r1-continuation-20260907`. Reviewed code: `454f4120..b0da2f08`.
This is implementation evidence, not an independent approval of these fixes.

## Scope and decisions

The owner requested: “ok please fix all issues, be careful and detailed to ensure nothing is missed”.
The review reproduced unsafe legacy attribution, partial merchant deletion, and
successful uploads whose names cannot be attached or downloaded. It also found
best-effort admin auditing and process-local document throttling.

**Pending owner decision:** existing invoice documents have no reliable record
of whether `merchant_id` came from authenticated upload or reference inference.
Quarantining these existing documents versus requiring a trusted ownership
inventory has been escalated. No live migration is authorized by this evidence.
*Answered later on 2026-09-19 — "Require a trusted ownership inventory before
migration" ([decision](../../../decisions/2026-09-19-gap13-trusted-ownership-inventory.md)).
See [Re-verification](#re-verification--claude-2026-09-21) for where that work stands.*

## Implemented corrections

- Merchant deletion executes child/parent deletes in one transaction. An upload
  FK refusal rolls back the transaction deletions. MemStorage mirrors the refusal.
- New document storage extensions come from the accepted MIME type. Client names
  remain display labels; a successful `bill.` PDF upload produces a valid `.pdf`
  storage reference. Existing reference parsing remains strict.
- Admin downloads require a successful database audit insert before sending
  bytes. Database errors return 503. The existing local audit log is supplemental.
  Records contain admin user ID, generated document name and database timestamp,
  never file contents, bearer tokens or IP addresses. Retention remains an owner
  policy question; no audit deletion is introduced.
- PostgreSQL owns the document-download budget: 10 requests per token per rolling
  60-second bucket and 600 aggregate attempts per bucket across all instances.
  These are engineering defaults, not production capacity claims. Aggregate
  capacity is consumed before per-token checks, even when a token is over limit.
  Invalid tokens that pass the bounded syntax check also consume budget before
  lookup. A full budget returns 429 with Retry-After: 60; storage failures return
  503 without invoice lookup. Payment/checkout resolution budgets are unchanged.
- Bucket keys store only a constant or SHA-256 of a high-entropy bearer token.
  Aggregate gating and expired-row cleanup bound per-token cardinality. No proxy
  trust or client-supplied IP headers are used. The global gate serializes the
  short counter transaction; statement/lock timeouts bound waiting. This limits
  document access, not network ingress or the database cost of rejected requests.
- The historical reference-count preflight labels single-merchant reference
  consensus accurately and requires review for all existing invoice documents,
  including single-merchant references and orphans. It does not prove ownership.

## Reproducible verification

- `npm run check`
- `npm run test:server`
- `npm run test:client -- --runInBand`
- `node scripts/count-gap13-uploaded-files-attribution.test.mjs`
- `TEST_DATABASE_URL=<empty-disposable-database> TAPTPAY_TEST_DATABASE=1 npx tsx scripts/verify-gap13-postgres.ts`
- `npx tsx scripts/verify-gap13-browser.ts`

The PostgreSQL verifier refuses an occupied database and either ambient app DB.
It applies the actual migration chain through `server/migrate.ts`, seeds a
foreign legacy reference before 0023, and exercises actual DatabaseStorage using
node-postgres. It retains only synthetic fixtures for inspection. It covers the
production upsert under a cross-tenant race, scoped reads/deletes, merchant-delete
rollback, durable audit reads from a new connection, concurrent shared budgets,
aggregate cardinality and expiry. It must remain red until legacy authority is
corrected; do not label the unresolved legacy assertions expected failures.

The browser verifier binds an ephemeral loopback port, uses the real checkout
component and upload/download routes with synthetic MemStorage fixtures, and
blocks external browser requests. It clicks View invoice at 390px, 820px and
1440px and checks the returned bytes plus no-store/nosniff headers. It starts no
cron, provider client calls or live database. This is not device/provider UAT.

### Results in this session

- Failing HTTP baseline: 6 failed / 2 passed before implementing the repairs.
- Full server suite after the repairs: 62 suites / 1,197 tests passed. Two later
  tests cover audit-commit ordering and limiter expiry; the final focused suite
  passed all 10 tests (the broader suite was not redundantly rerun for those
  test-only additions).
- Full client suite: 57 suites / 511 tests passed.
- TypeScript check passed; `git diff --check` passed.
- Reference preflight: failing test first, then 9 tests passed. Existing verifier
  safety tests: 8 passed.
- PostgreSQL 16.10: all migrations through 0024 applied through the runner on an
  empty synthetic database; a runner rerun applied zero migrations. Transaction
  rollback, logo continuity, durable audit, 30 competing token-budget requests,
  and the 600-token aggregate/expiry checks passed. **Two assertions remain red**:
  legacy foreign-reference ownership and rejection of overwrite of that same
  falsely attributed legacy row. Both require the pending ownership disposition.
- Browser: actual attachment download succeeded at all three viewport sizes,
  with matching synthetic image bytes, private/no-store and nosniff headers, and
  no page errors. Screenshots are in `/tmp/gap13-checkout-{390,820,1440}.png`.
- Migration 0023 remains byte-identical to reviewed code (Git blob
  `293aef02854f11f977b4c0a483857f613e9b985a`).

Evidence logs are under `/tmp/gap13-fix-*.log`; they are session artifacts, not
committed long-term evidence. The checked-in verifiers are the reproducible
source. No final independent approval is claimed for the changed code.

## Release and rollback requirements — supersedes earlier gap-13 guidance

Migration 0023 was reported applied to development. Its checked-in bytes must
remain immutable. Its assertions that reference consensus proves ownership and
that old-code rollback is safe are superseded by this review. **Never rerun its
backfill as a repair, and never drop tenant columns to facilitate rollback.**

1. Resolve the legacy ownership disposition before approving the release.
2. Inventory the exact target with read-only counts, migration status and schema
   fingerprint. Review the affected-document counts with the owner; the inventory
   must never print contents, tokens or document paths.
3. Obtain the target-specific migration approval, take and restore-test a backup,
   then rehearse on an isolated target of representative size. Synthetic timing
   is not evidence of production lock duration.
4. Stop/drain old upload/document handlers during the migration cutover. Apply
   the full reviewed forward migration set before exposing new code. Do not run
   0023 alone as a release step or serve traffic between ownership migrations.
5. Verify ledger checksums, schema objects, counts, ownership denial and audited
   admin access; then deploy/enable the fixed code and verify browser downloads.
6. Rollback must retain the public-folder restriction, ownership enforcement,
   durable-audit requirement and shared limiter. Do not deploy `454f4120` or the
   rejected `b0da2f08` as a rollback. If a compatible artifact is unavailable,
   disable document download/upload routes during recovery; leave checkout
   payment resolution operational with a hidden document link where necessary.
   Retain additive schema and file bytes; recover by reviewed forward fixes.

Production state, production-sized load/locks, backup restoration and actual
target deployment are UNVERIFIED. No live migration has been applied in this
fixing session. Fixing code is not approval to deploy or to claim compliance.

## Re-verification — Claude, 2026-09-21

Claude did not write these corrections (Codex did), so this pass is independent of
them, though not of the original gap-13 code Claude wrote. The session resumed after
an environment reset: the `/tmp/gap13-fix-*.log` files and screenshots named above no
longer exist, so **every result below was re-run on this tree, not relayed.**

**Scope:** the corrections above, committed with explicit paths. **Not** in that
commit: the unfinished ownership-inventory gate (see *Not finished*), and an unrelated
`.replit` port mapping (`24678 → 5173`, Vite's default HMR port — most likely added by
the workspace when an earlier browser run opened that port; the verifier now shares
its own server instead).

| Check | Result |
|---|---|
| `npx tsc` | clean with the unfinished inventory files set aside; with them present, **7 errors, all in those two files**. "TypeScript check passed" above predates them. |
| `npm run test:server` | 63 suites / 1,213 tests, **3 fail**: 2 are the unfinished gate's own red tests; 1 is `http-params-team-batch` → "the owner resends a real pending invite" (`502`), which **fails identically on a clean checkout of `acef4e42`** — an ambient `RESEND_API_KEY` reaches the test and the sandbox blocks the provider call. Pre-existing; not gap 13. |
| `npx jest --selectProjects client` | 57 / 511 pass |
| script tests (4 files) | 51 / 51 pass |
| Red on the old code | `gap13-review-regressions.test.ts` run against `acef4e42`'s source: **8 failed / 2 passed** — the two passes are `bill.PDF` and `bill`, which the old code already handled |
| Mutation checks | re-breaking each correction turns a test red: audit write not awaited → 2 fail; extension from the client's filename → 4 fail; limiter outage fails open → 1 fails; merchant delete without a transaction → the PostgreSQL verifier's rollback check fails |
| `scripts/verify-gap13-postgres.ts` | throwaway PostgreSQL 16.10 on loopback, all 25 migrations through the runner, rerun a no-op: **5 PASS; the 2 legacy-ownership checks FAIL, as designed** |
| Preflight, real SQL | same database: 1 single-merchant reference, 1 orphan, `requiresOwnerReview: true`, exit 2 |
| `scripts/verify-gap13-browser.ts` | "View invoice" at 390 / 820 / 1440 px: `200`, bytes match, `private, no-store`, `nosniff`, no page errors. Screenshots now go under `os.tmpdir()` rather than a fixed `/tmp` path (one-line change). |
| `0023` bytes | blob `293aef02…` equals the reviewed `b0da2f08` |

**Also checked by reading the code:** production's driver (`drizzle-orm/neon-serverless`
over a `Pool`) supports the interactive transactions both database fixes rely on — more
than twenty existing storage methods already use them; the admin principal's id is always
a positive integer (`server/auth.ts` rejects anything else), so the audit row's
`NOT NULL integer` cannot refuse a genuine admin; every checkout-token generator emits
27-character base64url, inside the new `^[A-Za-z0-9_-]{1,200}$` pre-check; the
MIME→extension map covers exactly the five types multer accepts, so no upload that used
to succeed is now refused.

### Findings for the owner — not changed here

1. **One anonymous client can switch off "View invoice" for every tenant.** Every
   request counts against the platform-wide 600-a-minute pool *before* its token is
   looked up, made-up tokens included, so ~600 junk requests a minute make every
   document link return `429` until the minute rolls over. Payment is unaffected (its
   own budget). The pool exists to cap the limiter table's size; that trade was taken
   as an "engineering default", not put to the owner. An alternative caps the table
   the same way without a platform-wide switch: look the token up first (the payment
   page already does the same lookup) and count only real invoices. **Owner call.**
2. **CI would fail on push.** `verify.yml`'s empty-database fingerprint still points at
   2026-09-10's schema; `0022` and `0023` changed that schema and `0024` changes it
   again. Pre-existing since `5318496b`; hidden only because the branch is not pushed.
3. **Test hygiene.** `server/__tests__/support/test-env.ts` does not clear
   `RESEND_API_KEY`. With a real key present and network access, the invite-resend test
   would call the real email provider.

### Not finished

The owner's answer (above) came after the rest of this file was written. Its
implementation was started but left incomplete and is **not committed**:
`server/upload-ownership-inventory.ts` (artifact validator, coverage check, in-transaction
staging) and `server/__tests__/upload-ownership-inventory.test.ts` exist, but
`server/migrate.ts` is not wired to them, `migrations/0025_verified_upload_ownership.sql`
does not exist, `tsc` fails on the two files, and two of their tests fail. Until it
lands, the PostgreSQL verifier's two legacy checks stay red and gap 13 stays open.

*Completed later on 2026-09-21 — see
[R1-T7-gap13-ownership-inventory-gate-2026-09-21](R1-T7-gap13-ownership-inventory-gate-2026-09-21.md).
The PostgreSQL verifier now passes 11/11.*
