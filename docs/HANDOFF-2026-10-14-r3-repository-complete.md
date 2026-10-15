# R3 repository completion — October 14

R3 implementation and repository verification are complete. Official phase exit
and release remain held for Windcave UAT and the production-sized restore/migration
sign-off. Claude owns R4; the owner deploys on Replit. No R5 implementation began.

Branch `fix/qwen-aligned-20261010`, base `27d235b8d5dc53e364875bf056e2ff76af786b3a`. The exact candidate is
the commit containing this handoff and the [frozen source evidence](evidence/remediation-v2-2/r3/R3-final-verification-2026-10-14.json).
[Final review](evidence/remediation-v2-2/r3/R3-FINAL-REPOSITORY-REVIEW-2026-10-14.md).

## Completed behavior

- Numbered/token retail and property/trades normal/split paths share durable
  inbox processing, actual R2 verification and atomic financial finalizers.
  UUID, tenant, exact session/share, cents/reference/account/environment and
  pre-send identity remain fixed; unknown acceptance never authorizes another
  purchase. FPRNs ACK only after receipt commit. Wallet submission is once-only.
- Invoice UX selects full amount or split and optional receipt email before
  preparation; methods share one session and retry/reload retain the assigned
  share/email. Only confirmed unsent expiry releases the matching browser UUID.
- Cancellation/void/external records reconcile retained sessions outside money
  locks, refuse captured money and preserve uncertain attempts and independent
  late captures. Declines retain their provider evidence without filling captured
  money fields or blocking a legitimate cancellation.
- Creation receipts and cash/manual/quote/balance/subscription commands preserve
  tenant, fingerprint and original actor. Replay cannot create another bill or
  overwrite later intent. Quote view cannot overwrite acceptance; balance retries
  retain the original exact remainder and skip initial dispatch.
- Zero-value card verification and positive subscription billing use separate
  concrete attempts, persisted pending transaction IDs and GET-only recovery.
  Cancellation/removal/replacement and competing paid-period races are covered.
  Superseded/satisfied setup cannot charge a later month. Billing history keys are
  namespaced by subscription; card DTOs contain masked fields only.
- Actual stable-key Resend receipts and immutable target progress, held unknown
  pushes, multi-instance SSE observation and browser/service-worker event-ID
  suppression are integrated. Cash/manual delivery runs while provider querying
  is paused. Repeated expired leases still reach finite retry caps; committed
  inbox dead-letters emit fixed diagnostics. The quote-blocked notice preserves
  owned customer name, amount and Billing action with escaped, frozen content
  and the existing rolling 24-hour throttle.
- Cash replays are labelled; owned conflicts identify the already recorded sale
  and release only the phone's matching command for the next explicit action.
  No automatic replacement sale is submitted. Property feed-under-dock remains.

## Verification

All **214 server suites / 5020 tests** are covered by the completed full run plus
explicit corrected/affected-suite reruns. The original full command was red
(196/214 suites); its 18 failed files and the affected policy/receiver files were
rerun together: **28 suites / 1591 tests passed**. The exact method and raw-result
hashes are recorded in evidence; no partial/red run is described as green.

Full client: **133 suites / 1504 tests**, no skips. Typecheck and production build
pass. Real owned PostgreSQL: **74 durability, 19 subscription, 15 command,
24 registered HTTP and 11 delivery checks** pass. Database-safety tests: 8;
fingerprint-contract tests: 28. Inventories: 194 registrations, zero unclassified
or suspected gaps, 273 storage methods. Typed transition tables are regenerated.

Both owned schemas have all **49 migration files** through 0047, unchanged
checksums and validated constraints; identical schema
`sha256:800ae81466f3165b21366a31159c863e952f347d4188d12824cd4d35f0b564ef`. The preserved synthetic restore retains 1000 rent
invoices, 1000 job invoices and 1000 quotes. Both pass 580 structural baseline
requirements; historical activation data predicates are not asserted against
later synthetic fixtures. This is not production-sized timing evidence.

## Remaining sign-off

1. Record sanitized [Windcave UAT](operations/r3-uat-checklist.md) on this exact
   candidate: purchase, zero-value setup, stored-card charge, timeout/retry,
   final-decline lifecycle, FPRN method/shape and uncertain session/X-ID recovery.
2. Rehearse the exact migrations on a production-sized restored clone; review
   dirty/historical identities and statuses, UTC and lock/timing; approve the
   separate migration/deploy release. Missing historical expected account/money
   stays held, never inferred from a provider response/current credentials.

Claude's `021d3f05` branch was fetched/read. Relevant R3 findings were evaluated
and repaired against this converged path; independent legacy finalizers and R4
implementation were not merged. R4 schema integration must preserve canonical
0034–0047. No production flag changes, shared migrations or actual provider,
email or push sends occurred. Owner app PID 4196 remained running. Private logs
stay under `/tmp/taptpay-r3-postgres`; never stage logs, dumps or Claude settings.
