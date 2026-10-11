# R2 §21.1 review — pass 1, 2026-10-11

Reviewed: [R2 preflight](R2-preflight-2026-10-11.md) against plan v2.2 §5.2, §9 and
§10.6, at `ccr-e07e3100-0wm8kr` `0cf210be`. **Pass 1 was performed by the same session
that wrote the preflight.** Plan §21.1 still needs a second pass by another reviewer,
or a separately recorded independent reread, before any R2 implementation starts.

## Verification of Prior Fixes

None for R2: this is the phase's first review. Inputs re-derived from source rather
than from earlier documents: `server/config.ts` already enforces §5.2 (payment mode,
exact endpoints, complete credentials, live switch, reconciliation flag in UAT);
migration 0022's `processor_session_id` partial unique index exists in
`shared/schema.ts`. R1 is not closed; the owner chose to start R2 in parallel
([decision](../../../decisions/2026-10-11-r2-start-while-codex-finishes-r1.md)).

## Blocking Issues

None for the T1–T3 scope (no schema, no product decision). T4–T6 are blocked on the
owner questions in preflight §4: legacy-flow disposition for R2, migration approval
and rehearsal, and invoice reference format.

## High-Risk Concerns

1. **Parser strictness versus real Windcave replies.** A parser stricter than
   Windcave's actual shapes fails closed and stops UAT payments. Fixtures must follow
   the official REST and Hosted Fields documentation, and real UAT replies must be
   checked before release (owner/provider gate D6).
2. **Behaviour change on live UAT paths.** RF-2's fix turns today's "declined" for an
   empty or non-final query into "pending/unknown". Callers must keep that attempt
   reconcilable instead of 503-looping or stranding a lease; covered in T1 tests.
3. **Google Pay (RF-1).** Moving to a session query after submit is the right fix but
   adds a provider round trip; Windcave's documented behaviour after `done` needs
   confirming in UAT.
4. **Parallel R1.** R2 changes `server/windcave.ts` and `server/routes.ts` while Codex
   finishes R1 (client accessibility so far). Merge Codex's final R1 before any R2
   release candidate and re-run R2 verification.

## Missing Steps

- Collect sanitized official-shape fixtures before T3 (query: approved, declined,
  cancelled, pending, empty, multiple; session create 202/200 duplicate X-ID; Google
  Pay `done` and `3DSecure`).
- A count-only duplicate preflight for provider transaction IDs before T4's unique
  index (§10.6.1), and a lock/size estimate on a restored clone (§10.6.2, owner).
- An ADR if T4 needs a non-transactional migration mode (§10.6.4).

## Unsafe Assumptions

- That Windcave's session GET returns 202 while pending and 200 only when final, with
  `transactions[]` carrying `authorised`, `amount` (decimal string), `currency`,
  `type` and `merchantReference`. The current code assumes this; it is not verified
  here.
- That `PUBLIC_ORIGIN` is set wherever callback links are validated; `config.ts`
  requires it in staging/production, not in development.

## Required Ordering Changes

T1 → T2 → T3 (each independently revertible) → owner answers → T4 (migration rehearsed
locally, then the owner's apply) → T5 → T6. RF-1 and RF-2 change live UAT outcomes,
so they ship together with T5's verifier rather than alone.

## Open Product / Provider / Legal Questions

Preflight §4 questions 1–3. D4 and D12 (funds flow) remain open and gate real money
regardless of R2.

## Compliance and Data-Handling Notes

Fixtures and evidence must contain no real session IDs, X-IDs, tokens, card data or
customer details. Google Pay tokens are never logged or persisted. RF-6's logging
fix applies to every provider log line, including errors that wrap provider bodies.

## Test and Rollback Adequacy

Adequate for T1–T3: unit tests with injected transport, clock and waits; the existing
retail attempt, checkout binding, invoice split and route-matrix suites must stay
green; each slice reverts cleanly with no data change. T4 is additive (expand-only);
rollback is a code revert with the columns left in place, which needs stating in its
migration review.

## Final Recommendation (Approve / Do not approve)

**Approve, pending the required second pass: scope R2-T1, R2-T2 and R2-T3 only**, on
`ccr-e07e3100-0wm8kr` from `0cf210be`. RF-1/RF-2 behaviour changes on live paths wait
for T5. **Do not approve R2-T4–T6** until the owner answers preflight §4.
