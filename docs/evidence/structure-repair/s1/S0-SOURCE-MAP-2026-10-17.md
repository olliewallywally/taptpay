# S0 source, ownership and verification map

Planning baseline: df33a139a8e887f90498ee51445a917ef6e3a018. Published plan/README:
1cbf5c04463121453093584db0fa8c9e7e3d2927 on remediation/r8-ci-20261016.
The remote branch matched before implementation. Other owner work was absent
from the working tree; no worktree or dependency replacement was created.

## Actual assembly and existing authoritative maps

| Boundary | Existing source / responsibility | Preserve / verify |
| --- | --- | --- |
| HTTP pipeline | server/app.ts createApp: 2 probe routes and 8 middleware registrations | Request context, security headers, compression, readiness/drain, bearer cache, parsers and CSRF/cross-site order. |
| Business route composition | server/routes.ts registerRoutes: 194 registrations | Async guard first; shared injected storage, payment/subscription runtimes and cron; tenant/role guards; original call order. |
| Bootstrap | server/index.ts: 2 middleware, no extra routes | Lifecycle, global error handler, serving mode, owned worker/drain shutdown. |
| Web serving | server/vite.ts: 4 conditional middleware, no routes | Actual development/production serving and production-only dependency boundary. |
| Route details | server/route-policy.ts, route-review.ts and route-matrix.ts | Exact 196 method/path/fact entries, caller/tenant/role/side-effect contracts; fresh source/runtime checks. |
| Client route names | shared/api-routes.ts, shared/api-path.ts and api-route-contract.test.ts | Existing path/parameter spelling and clients; provider/cron-only paths are intentionally outside the browser list. |
| Stateful helpers | routes.ts checkRateLimit/ownership/admin gates, shared auth/session and payment/cron runtimes | Inject existing instances/functions; no fresh per-module buckets, timers, runtimes or alternative auth rules. |
| Persistence | server/storage.ts IStorage, MemStorage and DatabaseStorage; durable-payment-storage.ts | Whole transaction/locks/state/history/outbox commands; existing unsupported memory behaviours; Neon adapter. |
| Payment handlers | payment-checkout-handlers.ts, invoice-checkout-handlers.ts, durable-payment-notification.ts | Real nested handler and injected-limiter facts remain analysed after registrar relocation. |
| Financial orchestration | durable-retail-checkout.ts, durable-invoice-checkout.ts, durable-subscription-card/billing.ts, payment-runtime/reconciliation/delivery | Persist intent before send; stable identity/unknown acceptance/reconciliation/exact-once effects. S5, not S1. |

The full per-route map is the existing generated policy plus independent reviewed
matrix and current AST facts, rather than a second manually drifting list. S1
records exact baseline fact equality and a new 196-entry ordered contract.

## Concrete task ownership and proof

| Package | Paths / owner | Dependencies / acceptance / rollback |
| --- | --- | --- |
| S1 | Codex: route composition manifest/analyser, source helper resolver, route facts/inventory and their tests | Explicit source functions only; module-aware discovery/order/async guard/guard-effect facts; relevant existing policy/HTTP/security/types/lint and actual build/install proof. Revert this tooling slice together, no data rollback. |
| S2 | Codex: four stock routes currently in routes.ts; narrow existing stock port | S1 must pass; existing tenant-stock-board HTTP/storage and owned PostgreSQL verifier; separate concrete preflight. Do not begin within S1 evidence scope. |
| S3/S4 | One integration owner for shared routes/storage/generator/policy files | Cohesive domain allocation before parallel file editing; whole atomic persistence commands and memory/SQL parity. |
| R4/refund integration | Claude | Read accepted R4 source/migrations and reconcile canonical history before refund extraction. No ownership transfer or completion inferred here. |
| R8 external gates | Existing named owners | Provider/email/history/asset/restore/device/operations/professional inputs remain tracked, not waived. |

## S1 supported syntax and limits

- Named synchronous exported domain functions, imported by name (aliases allowed),
  called unconditionally at their actual literal call position on the same app.
- Domain dependencies use an explicit object at the call site. Ordinary named
  references and supported source functions can be traced through destructured
  parameters, local bindings and property calls. Source code is never executed.
- Unlisted/unreached/repeated/cyclic/conditional/deferred/indirect registrars,
  wrong apps, shadowed names and unsupported dynamic dependency bags refuse this
  source analysis. Mounted routers remain unsupported and are independently
  rejected by the existing actual runtime gate. New syntax requires a reviewed extension.
- Helpers can be traced only within the approved parsed sources. Existing
  external functions/services retain named-call/status classification and their
  independent runtime tests; this is not a whole-program semantic verifier.
- Broader auth/payment source assertions that inspect named private functions
  remain coupled to their current actual source and must be reviewed with the
  corresponding S5 move. Per-route assertions now locate the actual registered
  AST call; no stock-specific assertion is weakened or skipped.

No business route, storage command, schema, dependency, native/frontend asset,
provider behaviour or flag has changed in S1. Existing real release evidence is
not supplied by these synthetic/static checks.

## Verified loading relationship

`server/auth.ts` has lazy storage reads and a type-only IStorage import.
`server/auth-sessions.ts` also lazily reads storage (lines 202/238 at the baseline),
while `server/storage.ts` imports its SESSION_RECLAIM_AFTER_MS constant. Preserve
that loading relationship during S1; do not replace lazy imports with new eager
imports based solely on Qwen's suggested comment. The concrete dependency map,
not a guessed circular-import explanation, governs the later auth slice.
