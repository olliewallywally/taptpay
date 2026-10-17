# Structure repair execution ledger

Plan: [S0–S7 and H1–H7](PLAN.md). Baseline:
`df33a139a8e887f90498ee51445a917ef6e3a018` on
`remediation/r8-ci-20261016`. Owner authorised publishing and starting on 2026-10-17.

| Package | Owner | Status | Scope / evidence |
| --- | --- | --- | --- |
| Plan publication | Codex | Pushed `1cbf5c04463121453093584db0fa8c9e7e3d2927` | README, plan, Qwen dispositions, plan review and this ledger. |
| S0 map / implementation preflight | Codex | Complete for S1 | [Source/owner map](../../evidence/structure-repair/s1/S0-SOURCE-MAP-2026-10-17.md), [preflight](../../evidence/structure-repair/s1/S1-PREFLIGHT-2026-10-17.md) and separate reread. |
| S1 module-aware route safety | Codex | Pushed `d4803d62f9acb2338afb1a04566b2903fe518ba2` | Explicit same-app composition, ordered runtime/source contract, injected helper and retained factory facts; exact original 196 route/fact behaviour. [Verification](../../evidence/structure-repair/s1/S1-VERIFICATION-2026-10-17.json), [handoff](../../HANDOFF-2026-10-17-structure-s1.md). No business-route movement. |
| S2 stock pilot | Codex | Complete; containing source/evidence commit | Four unchanged handlers moved to a typed, injected stock registrar at the original call position. All 196 facts/order match; generator ordering/boundaries and one false heuristic label repaired. [Verification](../../evidence/structure-repair/s2/S2-VERIFICATION-2026-10-17.json), [handoff](../../HANDOFF-2026-10-17-structure-s2.md), [recipe/rollback](EXTRACTION-RECIPE.md). |
| S3 ordinary business domains | Codex | Next; concrete preflight pending | Begin with property profiles and schedules in separate contiguous groups; keep invoice financial commands separate. |
| S4–S7 | See plan | Pending | Storage/sensitive/frontend work and final integrated evidence. |
| H1 documentation | Codex | README and lint guidance repaired | Current commands, maintained security/release status and coordination links. |
| R4 | Claude | Separate owned work | Do not edit or assume accepted integration. Refund extraction remains gated. |
| R8 release gates | Named owners | Open | See the [existing checklist](../../operations/r8-closeout-checklist.md). |

Codex has completed S2 for the documented supported syntax. Fresh broader server
regression passes 5,328 tests/246 suites; final affected regression passes 549
tests/21 suites after the last tooling/import/metadata edits. All 13 static,
25 owned PostgreSQL and 5 build/install stages pass; lint is 557 existing/0 new.
No baseline edit, storage/schema/dependency/client/native change or deployment.
S3 property profiles and schedules are next with their own preflight.
Claude should continue R4 and avoid simultaneous edits to
`server/routes.ts`, `server/storage.ts`, route generators or policy files without
an agreed integration boundary. Follow the extraction recipe before allocating
additional domain files. Broader legacy heuristic marker cleanup remains separate;
actual facts/review/runtime contracts stay authoritative.
No message has been sent to an external Claude service; these checked-in files are
the coordination record requested by the owner.

The earlier 6772-test/browser/SQL results belong to their frozen source. This ledger
does not relabel them as new results. Future code slices need their own actual
checks and source/evidence binding. No migration, deployment or payment activation.
