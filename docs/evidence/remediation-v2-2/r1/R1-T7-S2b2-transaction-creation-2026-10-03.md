# R1-T7 S2b2 — transaction creation and disabled native writes

Code: `cb8a61cf`; base: `42792fd8`; branch
`remediation/r1-continuation-20260907`. [Preflight/separate reread](../../../PLAN-2026-10-03-r1-t7-s2b2-transaction-creation.md).

`createTransactionForMerchant` makes scope authoritative, removes injected row id/
creation time, canonicalizes board aliases, and verifies an active owned board at
insert. PostgreSQL holds the board row lock through insertion using the exact existing
constructor/defaults in that transaction. Memory checks and insertion execute without
yielding. Retail/API-key token minting/collision retries stay in their existing service,
using an explicit scoped writer. Cash completion/defaults preserved. The unused,
log-only board-association operation is removed after caller proof.

The disabled native branch uses tenant-required reads/create/status/method operations,
and refuses outcome persistence failures without falling back to stale-row success.
This is tenant hardening, not native SDK or provider-state-machine approval. Tap to Pay
remains off; public/provider operations are untouched. No client/schema/default change.

Tests first: **15 storage/SQL fail; 2 actual HTTP races fail**. Final focused **17 pass**.
The first green attempt detected a route-reader substitution error; corrected it,
then reran both suites (17 pass), followed by **12 affected suites / 268 tests pass**.
Typecheck, build, generated inventories and whitespace pass. Inventories: **187 routes /
0 unclassified / 0 gaps; 229 methods**. No full-server rerun is claimed for this batch.

Actual PostgreSQL expanded S2 verifier: **25 pass / 0 fail** on a new empty loopback
database, with ambient credentials removed. Both board ownership/activity races proved
the insert actually waited for a row lock, then refused without inserting any sale.
All previous cancellation/refund checks also pass. Disposable instance stopped.
No application database/provider/migration, push or deployment action.

Review: board predicate/lock lifetime, construction in the transaction, native tenant
UPDATE predicates/refusal, and unchanged token collision/DTO behavior. Independent
review remains; S2 engineering scope is implemented but whole R1-T7 and R1 are open.
Logs use `/tmp/taptpay-s2b2-*` and may disappear on reset.
