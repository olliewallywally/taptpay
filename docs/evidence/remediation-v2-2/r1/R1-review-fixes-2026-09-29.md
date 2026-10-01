# R1 review fixes — external patch, applied 2026-09-29

Applied unchanged on `claude/trusting-cannon-l7wb6n` (tree identical to `b0500c5d`) per the
[owner decision](../../../decisions/2026-09-29-apply-r1-review-fixes-patch.md). The patch author's
handoff follows verbatim, then the verification made when applying it.

---

## TaptPay R1 fixes — handoff for Claude

Written against `b0500c5de0e32d8cd6f03faa20c6ec53c8eceb63` on `remediation/r1-continuation-20260907`.
These are uncommitted local changes. No push, migration, database write, live provider call, or deployment was performed. This patch fixes the reproduced defects; it does not resolve the owner's open policy questions or constitute independent approval of the new code.

### Changes

| Finding | Fix | Regression evidence |
|---|---|---|
| R1-T1 DNS/proxy escape | Inspect fetch/HTTP(S) destination before proxy dispatch; deny native DNS resolve/reverse calls and synthesize loopback lookup answers. Keep socket/UDP guard and swallowed-error reporting. | Existing 9 guard tests pass with inherited proxy settings; native DNS dispatch is intercepted and verified unused. |
| R1-T2 missed OPTIONS route | Inventory all Node HTTP methods plus Express ALL/del; recognize literal computed methods; reject unsupported dynamic methods, dynamic paths and chained registrations. | OPTIONS addition to bootstrap now fails completeness; 10 new extractor cases. Still 184 registrations, zero unclassified. |
| R1-T3 unobserved refusal effects | Observe SSE, push, mail, payment-provider calls, fetch and filesystem writes/deletions alongside storage snapshots in four refusal suites. Permit append-only writes to the exact security-audit file. | Previously surviving refusal broadcast now fails 115 matrix cases. |
| R1-T4 late push activation | Capture authenticated session generation and check it at activation. PostgreSQL locks the user row and performs all subscription reads/writes in the same transaction; revoked registrations return 401 SESSION_ENDED. | Both web and native registrations paused until after sign-out are refused with no active endpoint. Two driver-free transaction tests cover current/spent generations. |
| R1-T4 cross-instance streams | Production merchant streams reuse the complete authentication policy before each event and every five seconds while idle. Revocation, expiry and failed verification close the stream; queued writes stop after unsubscribe. | Two-broker/shared-storage model, idle closure and production-route validator binding pass. |
| R1-T4 retained OAuth state | HMAC-authenticate timestamp/state/verifier; enforce ten-minute expiry server-side; atomically consume a hashed replay marker through the existing shared auth_throttle store before provider exchange. Never refund this marker. | Expired/edited cookie and simultaneous callback replay tests pass. No new schema required. |
| R1-T8 traceability | Record the cleaned introducing SHA `53f5a8b9ca689b8b92dc951d6a69e86dd13dd51e` in the old evidence file. | Existing history mapping identifies this SHA. The approved hook implementation is unchanged. |
| R1-T9 malformed success | Validate successful response bodies before using them as loaded data. Retail sales require valid record IDs, price, date and status; property/trades lists reject malformed rows; Settings/reminder objects reject null/non-objects. Pin client-test timezone to Pacific/Auckland. | Null/object/null-row/empty-row/bad-price sales and null business-profile cases display errors, suppress fabricated totals, and disable dependent actions. |

The inventory table was regenerated only to refresh source references; no R1-T3 matrix-to-table rollout was added.

### Validation performed

- `npm run check`: passed.
- `npm run test:server`: 125 suites, 3,141 tests passed. The two new driver-free transaction cases were added after that full run started and pass separately; they are not included in that total.
- `npm run test:client`: 105 suites, 1,163 tests passed.
- Targeted final checks include the no-network guard, inventory/facts, session race/streams and transaction boundary tests.
- Seven mutations all caused failures: unclassified OPTIONS (1); refusal broadcast (115); omitted push generation check (2); ignored state TTL (1); ignored state replay refusal (1); skipped stream revalidation (2); skipped sales validation (6).
- Mutation work used a separate copy. The deliverable contains restored fixes, not mutant code.
- `git diff --check`: passed.

### Limits and required follow-up

1. Real PostgreSQL concurrent registration/revocation has NOT been executed. The transaction test verifies lock usage and connection boundaries against a driver double, not database isolation behavior. Exercise insert and endpoint-reactivation races in an authorized isolated database before release.
2. Cross-instance SSE is tested with two brokers sharing fixture storage, not two deployed processes. Idle closure is periodic (five seconds, plus verification latency), not instantaneous distributed cancellation. Test the deployed topology before claiming that guarantee.
3. The no-network harness is an application-level test guard, not an OS sandbox. Child processes/native extensions remain outside it; use network isolation for a universal zero-egress guarantee.
4. Signed state cookies invalidate old-format Google sign-ins already in progress during deployment; those users must restart sign-in. All instances need the same JWT secret. Replay rows contain hashes, expire logically with the cookie and are reclaimed by existing throttle cleanup.
5. List/object validation fixes the reproduced malformed-response class, not a complete schema certification of every endpoint. Existing valid cached-data behavior remains as approved.
6. Keep the bad reset/confirmation/invite-token 400-versus-401 question open; keep platform-admin access on the 23 business routes unchanged; keep payment availability during initial loading unchanged pending the owner's decision.
7. The original plan's Google nonce/issuer/audience checks still need an explicit scope decision. Phase E and the missing admin-home GET /api/transactions are not included.
8. No live trusted-proxy, Google/provider integration, browser deployment, or rollback test was performed.

### Applying the patch

On a clean checkout of the exact base above, from the repository root:

```sh
git apply --check /path/to/TaptPay-R1-fixes-2026-09-30.patch
git apply /path/to/TaptPay-R1-fixes-2026-09-30.patch
npm run check
npm run test:server
npm run test:client
```

Review the changes and the open decisions before committing or deploying. No dependency or migration change is required. Roll forward if a security regression appears; reverting the new guards reopens the reported failures. A source-only patch reversal is not a tested production rollback plan.

---

## Verification on apply (2026-09-29, Claude Code, cloud container, Node 22.22.2)

Tree before applying: identical to `b0500c5d` (`git diff --quiet b0500c5 HEAD`). `git apply --check`
clean; applied unchanged. Dependencies from `package-lock.json` (86 mirror-host tarball URLs pointed at
the public registry for the install only, same integrity hashes; the lockfile is unchanged).

- `npm run check`: exit 0.
- `npm run test:server`: 126 suites, 3,143 tests passed (the handoff's 3,141 plus its two
  driver-free transaction cases).
- `npm run test:client`: 105 suites, 1,163 tests passed.
- `git diff --check`: clean.
- Four of the handoff's seven mutations re-run in a separate worktree, each restored afterwards;
  failure counts match the handoff: push generation check skipped (2), OAuth replay refusal ignored
  (1), stream revalidation skipped (2), sales validation skipped (6).

Not re-run: the other three mutations, and none of the handoff's limits 1–3 and 8 (real PostgreSQL
races, deployed multi-instance SSE, live provider/browser/rollback) — they remain open.

Review notes from applying it (not defects found by a test):

1. `retailResponse` rejects the whole sales list if any row's `createdAt` is not a parseable
   string. `transactions.created_at` is nullable in `shared/schema.ts` (`defaultNow()`, no
   `notNull()`), so a legacy row with `NULL` would put that business's retail terminal and analytics
   into the error state. Not checked against any database; a read-only
   `SELECT count(*) FROM transactions WHERE created_at IS NULL` would settle it.
2. Each open signed-in stream now runs the full `authenticateToken` (users and merchants reads)
   every five seconds and before each event it receives. Streams also close at JWT expiry and on
   an auth-storage error (fail-closed; the client reconnects).
3. Push registration reads the login's preferences inside the new transaction, so a read error now
   fails the registration (500) instead of falling back to default preferences.
4. In the test harness, `dns.lookupService` is now refused even for loopback addresses.
