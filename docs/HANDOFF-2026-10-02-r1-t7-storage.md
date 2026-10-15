# R1-T7 continuation — 2026-10-02

Branch: `remediation/r1-continuation-20260907`. Read CLAUDE.md and the newest execution-ledger entry.
This handoff follows [the E3 recovery handoff](HANDOFF-2026-10-02-full-integration-continuation.md).
The supplied full integration plan governs; this is the security program, not the tablet UI branch.

## Completed and committed

**`47fdab71a48e71c4ea834bb7754a60ab2e1640a8` — tenant-required stock and board management storage.**
S0 execution inventory and S1 implementation complete, local; independent review remains owed.
E3 was already committed (`8d5bad38`, docs `bc5eba3c`) when the owner asked to commit and continue.

- Seven reads/mutations require merchantId in both storage implementations. SQL constrains id AND
  merchantId at the write itself; invalid tenant scopes fail closed before SQL. Patches preserve
  identity and ownership. Five routes and four existing test fixtures use the scoped methods.
- Added direct memory/SQL, two-tenant HTTP and read/write-race regressions; a real PostgreSQL verifier
  proves all five mutations refuse after waiting on a committed concurrent ownership change.
- Generated inventory covers 187 routes, 119 session/admin-authenticated registrations and all
  225 storage contract methods (217 declared + 8 inherited). Classification is not whole-task closure.
- Full server: **136 suites / 3,590 tests pass**. Focused: **40 pass**; real PostgreSQL: **10 pass**;
  final inventory checks: **26 pass**; typecheck, build and whitespace pass. Tests failed first.

[Evidence and independent-review brief](evidence/remediation-v2-2/r1/R1-T7-S1-stock-board-storage-2026-10-02.md)
records the initial oversized-ID failure and correction, full-run timing relative to that correction,
commands, scope limits and remaining work. [Plan/preflight](PLAN-2026-10-02-r1-t7-tenant-storage.md)
decomposes S0–S6. The documentation commit follows the code commit above.

The disposable PostgreSQL instance was stopped. No application database/provider was contacted;
no development/production migration, push or deployment. No live background workflow is required to
resume. Re-derive ground truth from git status/diff and history after any session reset.

## Start here next

1. Obtain/record independent review of S1 with the evidence brief; E1/E2/E3 and the older scopes in
   the ledger still need their independent reviews. An implementer's reread does not close these gates.
2. S2 transaction/refund storage: use the generated route/contract inventory to enumerate authenticated
   reads/writes, separate public-token/provider transitions, and write the required preflight plus
   separate reread before production edits. Preserve financial state gates and current HTTP semantics.
   Write failing tenant/refusal tests first, covering both implementations and actual SQL where needed.
3. Continue S3 property, S4 trades, S5 settings/exports and S6 upload lifecycle after their reviews.
   Do not claim whole R1-T7 complete from this stock/board slice.

Unchanged owner gates: gap 11 C2–C5 needs the R3 schema decision; upload provider/scanning/retention
choices need concrete decisions. R1-T5 needs real Apple provisioning/device evidence; R1-T10 remains
gated by T5/T7 and its broader device/tutorial/accessibility acceptance. Keychain remains A-T4.
Development migrations 0030/0031 remain recorded owner actions; neither was applied here.

Stage exact reviewed paths only. Never git add -A / git add .; always exclude `.claude-home/**` and
`.claude/settings.local.json`. No push is part of the current request.
