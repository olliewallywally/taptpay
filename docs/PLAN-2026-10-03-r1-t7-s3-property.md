# R1-T7 S3 — property storage

Base: `6c2fafab`; branch `remediation/r1-continuation-20260907`.
Owner direction: finish R1 without routine permission questions.
S3a: profiles, archive cascade and history; S3b: schedules and replacement;
S3c: invoices and authenticated resend. Every batch needs both implementations,
actual SQL and route tests. Public checkout/provider/cron retain explicit lanes.

## Verification of Prior Fixes

S2 independently verified in this session: 268 affected tests, 25 actual PostgreSQL
checks, typecheck/build/inventory/whitespace pass. Read S2 changes and actual property
routes/storage/fakes. Memory property is DB-only: preserve throwing creates, undefined
single reads/mutations and empty lists; do not invent partial property support.

## Blocking Issues

None for S3a. S3b/S3c remain separately reviewed batches; no claim of whole S3 closure.

## High-Risk Concerns

Tenant AND id in every query/update. Profile archive currently cancels all schedules
with the profile id; new transaction must change profile and only same-merchant
schedules together, and touch no child on a refused profile. Runtime update projection
permits only profile fields; scope controls create identity. History requires event
tenant AND current parent tenant in the same SQL query.

## Missing Steps

Failing SQL/stub and HTTP races, implementations/callers, real SQL concurrent ownership,
archive rollback/cascade, existing family matrix, inventory/typecheck/build/evidence.
Remove profile global mutations after confirming no provider/cron consumers.

## Unsafe Assumptions

Property HTTP fakes prove decisions, not actual PostgreSQL. Existing DatabaseStorage
property methods use global getDb; new methods use the injected instance's DB so they
can be genuinely verified. Keep public profile lookup global for checkout/provider.
Do not silently change archived-profile reads or automatic schedule reactivation.

## Required Ordering Changes

S3a tests first; verify real SQL before proceeding into schedules/invoices.

## Open Product / Provider / Legal Questions

None for scoped profile hardening; preserve prior archive and replacement decisions.

## Compliance and Data-Handling Notes

Synthetic loopback verification only; no schema/live database/provider action or UI change.

## Test and Rollback Adequacy

Invalid tenants issue no query; foreign/missing results match; update fields cannot move
ownership/identity; archive refusal has no child/event/delivery effects. Real two-tenant
SQL and ownership races plus existing positive owner/member cases. Fix forward.

## Final Recommendation (Approve / Do not approve)

**Approve S3a only on `6c2fafab`**, tests first.

## Separate reread

Separately reread profile routes, archive cascade, history query and all consumers.
Only routes and test fakes use profile create/update/archive/unarchive, so retire those
global methods. Profile reads remain needed by public checkout/email services. Archive
and unarchive log only after a returned mutation; no resurrected schedules. Schema
allows contact/address/channel edits, not identity/status metadata. History needs its
own scoped query despite a checked route parent. **Approve the same S3a scope.**
