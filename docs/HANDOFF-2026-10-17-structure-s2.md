# Structure repair S2 handoff

Branch: `remediation/r8-ci-20261016`. Base: pushed S1
`d4803d62f9acb2338afb1a04566b2903fe518ba2`. The containing S2 source/evidence commit
binds the [source manifest](evidence/structure-repair/s2/S2-SOURCE-MANIFEST-2026-10-17.json)
and [verification](evidence/structure-repair/s2/S2-VERIFICATION-2026-10-17.json).
Read the [execution ledger](architecture/structure-repair-2026-10-17/EXECUTION.md),
[preflight](evidence/structure-repair/s2/S2-PREFLIGHT-2026-10-17.md),
[final review](evidence/structure-repair/s2/S2-FINAL-REVIEW-2026-10-17.md) and
[separate local reread](evidence/structure-repair/s2/S2-FINAL-REREAD-2026-10-17.md).

## Completed scope

The four stock routes now live in `server/domains/stock/routes.ts`, with a narrow
type-only five-command storage contract. The original app passes its same storage,
authentication and ownership functions at the same registration position.
Handlers retain identical token streams; all 196 route facts, order and runtime
registration contracts remain unchanged. URLs, validation, role/tenant behaviour,
scoped reads/writes, safe errors, storage implementation and customer UX are unchanged.

Generation follows actual composition order and stops heuristic windows at domain
calls. Stock DELETE's false generated API-key label is corrected to merchant-user;
its real auth policy/facts and reviewed caller matrix are unchanged. The generated
table now points at actual source locations. The browser API contract is unchanged.
One already-unused schema binding on the stock-edited import line was removed
instead of weakening/rebaselining lint. No refund handler or R4 migration changed.

## Fresh checks and limits

The final affected run passed 549 tests in 21 suites with no failures, skips or
open handles. All 13 static stages, five build/install/serving/dev stages and
25 owned PostgreSQL stages pass. Lint is 557 existing/0 new; no baseline edit.
The final guarded build retains the same server bundle as the five-stage proof.
The broader server run passed 5,328 tests/246 suites with no failures/skips/open
handles. The final affected run follows the last tooling/import/metadata edits
and includes the 3-case boundary suite added after full-run file collection.
The private real generator reproduces policy/table/API bytes; all 198 web files
match the native copy and the current-tree scan has 0 findings. The verification
record and source hashes identify the actual checked slice.

No fresh client/browser/device/provider/restore or live-target evidence is claimed.
No storage command, frozen SQL, dependency, feature flag, client/native source or
payment capability changed. Broader legacy marker heuristics remain a separate
tooling cleanup; the actual facts/review/runtime checks remain authoritative.
Existing R8 audit/history/email/assets and real release gates remain open.

## Next task: S3 ordinary business domains

Start with property profiles and schedules after its own concrete preflight.
Use separate registrars for interleaved groups and preserve each original position.
Keep invoice financial commands out of that first move. Follow the
[extraction recipe and rollback](architecture/structure-repair-2026-10-17/EXTRACTION-RECIPE.md)
and [complete plan](architecture/structure-repair-2026-10-17/PLAN.md).
Claude retains R4; coordinate shared routes/storage/generator/policy edits.
Do not infer accepted R4 integration or begin refund extraction.

User handles any separately approved Replit deployment. S2 is a repository
refactor, not R8 completion, migration approval or payment activation.
