## Verification of Prior Fixes

Base b7fa2de91b508eb624d2257eafc2dee7c53b1439 is clean except excluded logs and
matches the pushed durable-cron step. Its source manifest rechecked successfully;
cron owns committed leases with short transactions and explicitly held unknown
effects. Applied0048a/b/c and0049a remain frozen. Owner app4196 is running and
must not be signalled. R5 closeout remains deferred; Claude owns R4.

## Blocking Issues

Current shutdown closes HTTP before stopping workers, does not await active worker
tasks or close application pools, and can be blocked by SSE. No public probes
exist. Startup migration checking covers the ledger but not an actual schema
fingerprint. These block this readiness step until the changes/tests below pass.

## High-Risk Concerns

Stop admission and cron/worker claims before draining; retain R3 durable unknown
outcomes and the approved R6 holds. Timeout never establishes provider cancellation.
Do not close pools while normal draining tasks still need them. Enforce a final
process deadline even if a resource or audit sink hangs. Second signals must not
extend the deadline or skip the bounded audit attempt. Never kill an unrelated
process to acquire a port.

## Missing Steps

Add minimal no-store health and readiness endpoints before body parsing. Liveness
has no DB/provider dependency. Readiness requires completed boot, successful config
validation, a bounded single-flight SELECT1, fresh cached ledger plus strict public
schema digest validation and not-draining. Refresh schema validation periodically
in a read-only snapshot; invalidate failures, expire stale successes, do not query
the catalog per HTTP request. Reuse the canonical fingerprint algorithm/digest.
Add shutdown hooks to stop timers/claims immediately, await tracked HTTP/cron/
worker/SSE tasks within a fixed budget, then close pools and flush audit logs.

## Unsafe Assumptions

No schema writes, live data/provider calls or new migration. Missing DB in the
development MemStorage workflow keeps readiness false while liveness works.
Validated optional audit diagnostics are not invented required settings. Scheduler
freshness remains authenticated ops status per plan13.4; no readiness gate for
stale cron is added. A timeout wrapper must not create unbounded pending probes.
Cancelled scheduling is not cancellation of a charge/send already accepted.

## Required Ordering Changes

Record this review/reread first, write failing behavior tests, then implement.
Construct lifecycle/signal handling before awaited bootstrap work. Mark draining
before listener close; stop registered work immediately (including resources
registered during a startup race), close SSE, drain, then pool/audit cleanup.
Check draining between startup phases and before listening/starting workers.
Keep default port5000; startup conflict must return failure without signalling
the existing port owner. Preserve existing production fail-fast startup gates.

## Open Product / Provider / Legal Questions

No new owner decision is required for this plan13.4 repository implementation.
D9, actual provider UAT, scheduler/alert recipient activation, R4 integration and
R5 live-target/retention closeout remain separate release gates. Do not deploy or
enable charging. Professional independent release review is still required.

## Compliance and Data-Handling Notes

Probes expose only fixed status bodies, with no diagnostics, identity, catalog,
URL or error text. Catalog queries read metadata only in READ ONLY transactions;
ledger is read without creation. Tests use explicit owned synthetic targets or
memory adapters. Signal tests launch and signal only their own child processes.
No credentials/logs/dumps/Claude local metadata enter commits.

## Test and Rollback Adequacy

Prove startup, valid/invalid config, DB down/hang/recovery, schema/ledger drift,
cache expiry, single-flight bounds and late results while draining. Actual HTTP
tests cover minimal responses/security/no-store and refusal before initiation.
Test real SIGTERM/SIGINT, repeated signals, open SSE, active HTTP/worker work,
stalled work, pool order, audit failure and startup port conflict. Reverify the
cron and R3 billing/delivery suites, compiler and production build. Real PostgreSQL
proof uses new owned clones and restores any synthetic drift before exit. Rollback
retains frozen schema/history/holds and must not resume uncoordinated old cron.

## Final Recommendation (Approve / Do not approve)

**Approve** implementation and verification of this exact R6 health/readiness and
bounded full-server shutdown repository step on base b7fa2de9. No official R6 exit,
live target mutation, provider call, deployment, D9 or R4 work is approved here.

Separate pre-implementation reread checked boot/signal races, mid-request drain,
SSE reauthorization still in flight, pending DB query growth, stale positive cache,
pool closure before lease cleanup, repeated/fatal signals and unknown external
effects. The scoped design resolves those interactions without changing the
approved uncertainty policy. Same scoped approval; no external/delegated reviewer
is claimed. Final evidence review remains required after implementation.
