# R3 in-flight regression — October 14

Historical checkpoint. The completed repository status and remaining external
sign-off are in [`HANDOFF-2026-10-14-r3-repository-complete.md`](HANDOFF-2026-10-14-r3-repository-complete.md).

Historical checkpoint. The final repository handoff will supersede the progress
counts below after final verification; do not use this file as phase-exit evidence.

Owner: finish R3, no R5. Claude owns R4. Continue autonomously through repository
regression/review and the authorized commit/push. Replit deployment remains the
owner's work. This is an in-flight handoff, not phase exit or a release approval.

Branch `fix/qwen-aligned-20261010`; last pushed commit `27d235b8`. The large R3
working tree is uncommitted. Preserve all applied migration checksums; never
stage logs, credentials, dumps, `.claude-home` or `.claude/settings.local.json`.
Do not stop/restart the owner app PID 4196. Use the existing owned PostgreSQL on
55440 and `/workspace/.onboarding/r3-postgres/test-env.sh` without printing values.

## Completed implementation and latest targeted evidence

- Retail/numeric/token and invoice full/split paths converge on durable attempts,
  shared R2 verification and concrete finalizers. Approved choose-amount-before-
  prepare UX, wallet-once marker, stable checkout UUID, frozen payer email and
  browser-return recovery are implemented. Cancellation preserves uncertain
  attempts and independent late captures with original aggregate status.
- Subscription card verification and positive billing are separate durable
  domains. Pre-send X-ID registry, global session/transaction identity registries,
  pending transaction ID persistence and GET-only recovery are integrated.
  Card confirmation ignores browser outcomes and returns masked fields.
- Fixed cancellation during card setup: original setup status is persisted and
  checked again under the subscription lock before activation. Explicit restart
  works; a second cancellation during restart retains captured money/history and
  holds entitlement resolution. Scoped terminal cancellation releases the
  browser's original card command only when verified.
- Manual subscription plan/cancel/resume/remove-card commands retain UUID/actor
  and atomically record a concrete subscription event/outbox. Old replay cannot
  overwrite a later owner command. Paid-upgrade UUID replay cannot purchase again
  or revert a newer plan. Cancellation expiry records one internal event/outbox.
- Retail/property/trades creation receipts have checked tenant aggregate FKs;
  retail credentials are deterministic HMAC and hashed at rest. Same-command
  replay reuses the original aggregate. Quote response/deposit and view/expiry
  use client/quote locks, preventing view overwrite. Blocked-acceptance notice
  retains the original rolling 24-hour throttle. Balance replay returns the
  original exact remainder and skips dispatch. Retail split locks are parent,
  attempts, shares and refuse changing captured/prepared money.
- Actual keyed Resend email receiver and concrete immutable per-target progress
  are wired; missing credentials cannot simulate receipt success. Unknown email
  retries preserve exact key/body/recipient inside the window, then hold.
  Unknown unkeyed push is held; successful destinations do not repeat. SSE
  per-instance observation and browser/service-worker event-ID suppression are
  implemented. Card verification / missing method / parent drift and receipt GST
  wording now report actual outcomes. Creation UI distinguishes pending delivery.
- Generated policy: 194 registrations, zero unclassified/suspected gaps;
  tenant inventory: 273 methods. Candidate caller/idempotency and generated typed
  transition tables are under `evidence/remediation-v2-2/r3/`.

Owned synthetic checks under `/tmp/taptpay-r3-postgres`:

- `r3-through-0047-durability.log`: **72 PostgreSQL checks pass**.
- `subscription-cancel-restart-final.log`: **15 subscription checks pass**.
- `subscription-all-commands.log`: **14 command checks pass**.
- `delivery-completion-green.log`: **10 actual-receiver storage checks pass**.
- `delivery-email-adapter-green.log`: installed Resend SDK stable key/body,
  refusal/missing-ID/timeout adapter tests pass (synthetic fetch only).
- `r3-typecheck-final-candidate.log`: typecheck passes.
- Scratch and preserved synthetic restore have all **49 migration files** through
  0047 (numbering starts 0000 and includes 0010a), immutable checksums and identical
  schema `sha256:800ae81466f3165b21366a31159c863e952f347d4188d12824cd4d35f0b564ef`.
  Restore retains 1000 rent invoices, 1000 job invoices and 1000 quotes. All
  constraints are validated. CI fingerprint now targets the 0047 artifact.

## Active work — do not stop at this checkpoint

Full regression is running/being diagnosed. Full client first run: 133 suites,
131 pass, 2 fail; 1482/1500 tests pass. `login-apple` began with a timeout and
cascaded; rerun it independently before changing unrelated Apple code. Three
billing-required helper fixtures sent POST without bodies; updated to actual
JSON creation requests and rerun. Full server still in progress at this handoff;
old completion fixtures do not supply UUID/share/persisted attempts or concrete
R2 evidence. Update their setup and assert the active durable contract; do not
restore boolean-only money acceptance or weaken assertions/skip tests.

Full client rerun is now **133 suites / 1500 tests passing, no skips**, recorded
in `r3-full-client-recheck-results.json`. Build passes (`r3-build-candidate.log`).
Both owned schemas pass **580 structural migration baseline requirements**.
The historical activation/onboarding data predicates do not hold after later
synthetic fixtures; they are not schema drift and were not repaired by inventing
paid access. Structural requirements are checked directly and in full.
Completed failing test files for invoice creation are being updated with real
UUID headers; checkout/runtime source remains frozen during the ongoing server
run. The final server rerun must use the final test/source tree.

The first red full server run was stopped intentionally (exit 143) after known
failures; no final JSON/count exists for that run. Only the owned verifier process
was terminated; owner app 4196 was preserved. Do not describe it as a completed
full run. Creation scope/actor/receiver compatibility is being repaired in tests.

New independent served proof: `scripts/verify-r3-http-postgres.ts` serves the real
registered routes with `DatabaseStorage`, actual durable repository/runtime and
R2 normalizer/verifier, plus a synthetic provider. **24 checks pass** in
`served-http-postgres-verified.log`: four domains, full/split, cross-aggregate
equal-value session refusal, exact settlement once, duplicate FPRNs/two workers,
and mismatched money. Retail retains its existing 333/333/335 allocation for
1001 cents; invoices retain their existing 334/334/333 allocation. All fake links
must use R2's `/pxmi3/` HPP path and provider evidence uses `authorised`, not the
browser's `approved`. Bigint event cents from plain pg are strings and normalized
explicitly before assertions. No production defect was inferred from those
incorrect initial test fixtures.

`retail-checkout-durable-http.test.ts`: **14 tests pass** in
`retail-durable-served-contract-verified.log`. Its in-memory port is served
contract evidence only; PostgreSQL durability is the independent script above.
`subscription-unsent-cancel-green.log`: **16 checks pass**, including a new red-
then-green cancellation between preparation and send. An unsent activation is
abandoned with policy event/outbox and allows a fresh explicit restart; a sent
attempt is never abandoned this way. The card confirmation DTO reports that
scoped terminal cancellation. The bounded reread is in the subscription review.

Finish the full regression, baseline-contract/schema/restore verification,
build, complete bounded reviewer pass and separately recorded reread; update
final evidence/handoff and explicitly stage/commit/push all reviewed R3 work.
Refresh remote Claude branch read-only before committing; do not wholesale merge
his R4 work into this tree. The last inspected Claude commit was `9888af20`.

## External phase/release gates

Owner can arrange Windcave UAT; use `operations/r3-uat-checklist.md` on the frozen
candidate. Official provider evidence and a production-sized restored rehearsal
remain open. Synthetic restore is not that rehearsal. No live/shared migration,
provider/payment request, outbound email/push or deployment occurred. No flags
were enabled. R4 refund correctness and R5 raw-token contract removal are separate.
