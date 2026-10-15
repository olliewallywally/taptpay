# R6 preflight — remaining operations and entitlement work

Branch remediation/r6-operations-20261015, base
3534978f1443dad6429fdd902bbc833836048c88. Existing owner app PID 4196 is preserved;
all integration rehearsals use separately named owned synthetic targets. No R4
work is merged and no shared/live migration, provider call or deployment is planned.
Reuse existing setup; no worktree, dependency or environment changes are needed.

## Scope and observed gaps

Plan §13 remains authoritative. R3 already supplies canonical payment/billing
attempts, unique identities, job-level claims and durable settlement delivery. R5
supplies compatible encrypted card/link boundaries. Do not rebuild or bypass these.
R5 official live-target/retention gates remain open independently.

Current gaps: routes.ts cronRunning/lastCronRun are process-local; parent/per-job
run history and freshness alerts are absent. index.ts has no health/readiness
routes; port-manager shutdown waits for connections before its bounded hard exit,
and worker stops occur only on server close. request-log has no request ID/JSON
context, recursion bounds or error-cause handling; security/provider/job code still
uses separate redaction and raw console arguments. billing-card access still
requires lastBillingDate; migration-grant provenance and report are absent.

## Required entitlement decision

D9/product sign-off precedes changed access rules. Asked owner whether to honor
verified explicit migration grants to their recorded end without inventing a bill,
keeping current four attempts (initial/day1/day3/day7) and eight-day paid grace.
Pending response is not approval. Existing eligibility/gates remain unchanged
until approval and exact provenance/report/migration review. Never infer a grant
from missing payment history alone. No new trial/complimentary grants are inferred.

## Implementation sequence

1. §13.5: shared request/job async context, safe UUID request IDs and response
   header, bounded central redaction, one-line structured event serializer, audit
   integration, sanitized global errors; then inventory provider/job/security
   call sites and move them through that boundary. No generic console monkeypatch.
2. §13.3: review concrete durable cron policy/schema before implementation. Keep
   the external URL/header and every current pass/order/feature gate. Replace
   process-local serialization with database coordination, durable run/job history,
   fencing/cancellation at job boundaries, retry semantics and authenticated
   aggregate freshness/backlog/dead-letter status. Coordinator locks do not replace
   per-job idempotency. Rehearse takeover/failure/duplicate triggers with real PG.
3. §13.4: injected liveness/readiness state with bounded real DB probe and cached
   verified schema/migration contract, boot/config/draining gates; minimal public
   responses. No scheduler freshness traffic-removal policy inferred. On shutdown,
   mark draining first, stop new initiations/jobs, then bounded HTTP/SSE/worker
   drain before releasing resources. Test isolated child processes only.
4. §13.1/2: counts-only entitlement before/after report and approved provenance
   policy/migration; preserve truthful payment history. UAT checklist/evidence
   capture preserves charging-off defaults. Actual provider UAT/report from the
   real target remain external prerequisites, not synthetic completion claims.

## Logging contract for the first implementation slice

Only UUID-shaped inbound X-Request-Id is accepted (canonical lowercase); otherwise
make a UUID. Attach response header and AsyncLocalStorage before body parsing so
parser/security errors receive context too. Shared job context retains parent
request ID; independent workers use a server-generated job UUID. Request output is
JSON, bounded, one line, with method, trusted route template, status and duration;
unmatched URLs are a fixed marker, never raw URLs/query/body/headers.

Central redactor bounds depth, fields, arrays and string length; handles cycles,
errors, getters and byte buffers without leaking exception/stack/cause text.
Sensitive key families include authorization/cookies/passwords, tokens/hashes,
return state, bank/card/account/API/OAuth data, raw provider identifiers and raw
notification/query/response/header bodies. Log serializer drops arbitrary prose;
only application-owned event/enum identifiers, numeric counts, booleans, masked
email policy and validated correlation fields survive. Other correlation IDs use
a documented truncated SHA256 diagnostic identity, never an authorization key.
Keep audit queue bounds, private file mode and reliable fixed failure diagnostics.
No raw secret values in redaction test output or evidence; use synthetic markers.

## Verification and stop conditions

Failing-first real HTTP parser/error/context/concurrent-request tests; nested
secret/array/cause/getter/cycle/large-input tests; existing auth/audit/provider
and route inventory regressions. Typecheck and build. Later PG tests must prove
one executor, retry/failure history and lost-lease/takeover semantics, not mock SQL
matching. No official R6 exit without D9/report, real UAT, combined integration
and externally configured scheduler/alert ownership. Any new blocking evidence
returns its affected slice to a concrete reviewer pass before implementation.
