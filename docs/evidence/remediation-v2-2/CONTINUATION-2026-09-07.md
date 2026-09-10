# Full integration continuation audit — 2026-09-07

Latest continuation: **[R0-T6A closure](r0/R0-T6A-closure-2026-09-10.md) — every Check criterion met**, following [the drift findings closed — repair, adoption and an exhaustive gate](r0/R0-T6A-fk-repair-and-adoption-2026-09-10.md)
(decision: [FK default repair and orphan column adoption](../../decisions/2026-09-10-fk-default-repair-and-orphan-column-adoption.md)),
following [the baseline contract's two blind spots, closed](r0/R0-T6A-baseline-contract-blind-spots-2026-09-10.md),
which also found that a `0009` requirement names the wrong table and could never
have been satisfied. Follows [the live-database drift finding](r0/R0-T6A-live-drift-2026-09-09.md),
[R0-T6A safety gate, release command and CI convergence](r0/R0-T6A-release-gate-handoff-2026-09-08.md)
and the first real-database evidence in [empty-database convergence](r0/R0-T6A-convergence-2026-09-08.md).
Earlier: [R0-T6A explicit migration target identity](r0/R0-T6A-target-handoff-2026-09-08.md),
[R0-T6A migration budget hardening](r0/R0-T6A-budget-handoff-2026-09-08.md)
and [R0-T7 reviewed source cleanup](r0/R0-T7-review-followup-2026-09-08.md).
**2026-09-09: the repository was found to be public with `.claude-home/` — including
file-history snapshots of a real `.env` — in the current tree of `origin/main` and
nine other remote branches. See [public repository exposure](r0/R0-T7-public-exposure-2026-09-09.md).
R0-H2 is reopened; this branch was not pushed.**
The CI target decision is configured but unexercised: [what CI is allowed to migrate](../../decisions/2026-09-08-ci-migration-target.md).
History disposition and database/release gates remain open. These records supersede the recovery snapshot only for their scope.

Follow-up: [September 8 R0-T7 repository safeguards](r0/R0-T7-handoff-2026-09-08.md)
adds the env inventory, ignore boundaries, metadata-only CI scanning and response
runbook. Scanner findings remain unclassified; R0 exit is still not established.
The September 7 dispositions below remain the historical recovery snapshot.

The full plan is **not complete**. This tracker preserves every named task/phase
and the inherited control checklist; a prior green test count or handoff label
cannot close a task whose required evidence is missing.

Source of truth: [corrected full integration plan](../../../attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt).
This file is an execution/evidence index, not a replacement plan or a waiver.
Every source task's dependency, required implementation, Check and exit criteria
remain binding, even where the row below summarizes its status.

## Recovered working state

- Workspace initially showed `feat/tablet-desktop-app` at
  `0df129166bf90e1bca9c04bb9a3f2bbb1ca42e24`, with a clean tree.
- Claude's latest integration work is `remediation/r1-foundation` at
  `ec2072795fa3adc48b508e227884b3837685a3aa`, dated 2026-09-06.
- The old `/home/runner/workspace-r1` worktree directory is absent; its branch
  and commits are intact. No worktree metadata was pruned.
- Continued from that exact tip on `remediation/r1-continuation-20260907`.
  No merge, cherry-pick, reset, rebase, commit, push or deployment performed.
  The separate UI branch and all other branch tips remain preserved.
- The accepted execution-base record is `r0/R0-T0-baseline-2026-08-31.md`;
  its approved corrected source SHA is `b00054f9bab40c6ba5f2364124d8b7f668073674`.
  Later UI-branch commits are not silently imported into this lineage.
- Existing R0/R1 test counts are historical, not newly regenerated release evidence.

## Owner direction recorded this turn

R0-H2 was closed by Oliver's instruction on 2026-09-07 (no secrets currently
require rotation) and **reopened on 2026-09-09** when the public `.env` exposure
was found. See the [2026-09-07 disposition](../../decisions/2026-09-07-R0-H2-owner-rotation-disposition.md)
and the [2026-09-09 reopening](../../decisions/2026-09-09-R0-H2-reopened-public-env-exposure.md).
Neither record claims a performed rotation, and neither closes the access,
backup, deployment or restore checks.

## Gaps that must not be silently skipped

1. **R0 exit is not established.** The R1-H1/T1 handoff calls `de753501` an R0
   exit, but the R0-T5/T7 evidence explicitly leaves operator follow-up open.
   **R0-T6A now has a completion artifact and is closed** (2026-09-10); R0 exit
   still waits on T5/T7 and the human gates. New R1 feature implementation must wait for
   actual R0 closure; existing work is preserved, not rolled back.
2. **R0-T6 was partial.** The surviving manual script selected both ambient
   databases, produced unencrypted gzip files and pruned retained files. This
   continuation replaces it with an explicit, confirmed encrypted-backup command
   and synthetic failure-path tests. No actual backup has been taken.
3. **R0-T7 is partial.** `.env.example` and a redacted secret-scan CI job/runbook
   were absent at recovery, despite the tracked runtime block being removed.
4. **R1-T2 is an inventory foundation, not the complete policy.** Its own handoff
   says 97/218 routes are unclassified and required policy fields are not
   populated. The tests inventory `routes.ts`; `index.ts`/`vite.ts` middleware,
   ALL-method semantics and mounted-router adversarial coverage need completion.
5. **R1-T3 password handling contradicts the source requirement.** The handoff
   accepts ignoring the merchant path ID because only the caller's password
   changes. The plan explicitly says to use `/api/account/password` or prove the
   path merchant equals the authenticated account, and never ignore the path ID.
   Preserve the current test as defect evidence, then correct the contract.
6. **R1-T6 exceptions are not approval.** The last handoff leaves four `size`
   and one `days` permissive query parsers. R1-T6 requires strict scalar query
   validation and zero permissive path/query parsing, plus a source guard.
   Keep optional defaults only for absent inputs and preserve intended size/day
   bounds using a reviewed typed schema; reject repeated/array/object/garbage
   inputs. Do not add an allowlist that silently weakens the requirement.
7. **R1-T7 depends on completed T2/T3/T6.** Moving uploaded-file SQL behind
   storage does not close authorization-before-body, private object storage,
   content/quarantine/retention or the full tenant-method/runtime matrix.
8. **Client work remains gated.** R1-H1 explicitly needs owner acceptance of the
   exact visual baseline. D10's product choice is already locked; do not ask the
   owner to choose it again. Auth/onboarding layout, actual phones, the desktop
   frame and tutorial contracts remain protected.
9. **CI is not the final isolated release gate.** The existing workflow still
   uses repository database/JWT secrets, migrates that target, and skips its
   server/browser jobs without them. R8 requires isolated approved targets,
   least privilege, no production secrets, mandatory source guards and sanitized
   artifacts. Adding the synthetic backup test does not close those gaps.
10. **The repository is public and `origin/main` carries local agent state.**
   Found 2026-09-09. `.claude-home/` sits in the current tree of `main` (1441
   files) and nine other remote branches, including four file-history snapshots
   of a real `.env`. The 2026-09-08 scanners recorded the hits; all 287 were left
   `review-required`, so nobody established that they were publicly served. This
   supersedes any reading of gap 3 as merely "partial", blocks pushing this
   branch, and reopens R0-H2. See
   [public repository exposure](r0/R0-T7-public-exposure-2026-09-09.md).
   Classifying that backlog then found **two public Google Cloud service-account
   private keys** — [GCP key exposure](r0/R0-T7-gcp-key-exposure-2026-09-09.md).
   Revocation is outstanding.
   Continuing the classification found a third class: Claude Code's own OAuth
   store, `.claude-home/.credentials.json`, in 50 commits — 20 public — whose
   **Figma OAuth client secret is still the live value**
   ([OAuth credential exposure](r0/R0-T7-oauth-credential-exposure-2026-09-09.md)).
   The reviewed decisions now live in `.gitleaks-dispositions.jsonl` and the scan
   gates on undispositioned findings
   ([how to disposition](../../operations/secret-scan-dispositions.md)).

## Every named task and phase

Status is deliberately conservative. “Recorded” means the prior artifact exists,
not that every acceptance check has been independently repeated. Human discovery
may proceed where the plan allows it. Code lanes remain gated by their dependencies.

| ID | Task / phase | Source line | Responsible lane | Current disposition |
|---|---|---:|---|---|
| R0-T0 | Cut the branch and record the base | 383 | Engineering | Prior owner-approved base recorded; continuation preserves its lineage. No merge/cherry-pick. Fresh release evidence remains required. |
| R0-T1 | Write the failing tests that prove each hole | 404 | Engineering | Original failing evidence recorded; prior tests passed. Full runtime no-side-effect matrix is not established by source tests alone. |
| R0-T2 | Fail-closed configuration module | 431 | Engineering | Implementation and prior tests recorded; review remaining P2.2/exit invariants before closure. |
| R0-T3 | Make VAPID rotation survivable | 444 | Engineering | Recovery code/tests recorded; real-device resubscribe and real test-push acceptance explicitly open. |
| R0-T4 | Tombstone cross-tenant clearing, lock down seeding | 455 | Engineering | Implementation and prior tests recorded; preserve runtime production/no-delete checks for final SHA. |
| R0-T5 | Remove fake-success and merchant credential surfaces | 473 | Engineering | Containment implemented; complete device, concurrency, no-side-effect and historical-credential count evidence not found. |
| R0-T6 | Stop startup database dumps and the side-effectful build | 517 | Engineering | Startup/build fixed previously; manual backup safeguard implemented in this continuation. 17 synthetic and 3 existing R0-T6 tests pass; operational restore proof remains open. |
| R0-T6A | Re-prove the migration contract and continuously gate complete history | 531 | Engineering | **CLOSED 2026-09-10** — [closure record](r0/R0-T6A-closure-2026-09-10.md): empty build, restored snapshot and production all fingerprinted and reconciled section by section; both recorded ORM/live disagreements resolved (`0019`, and `tier` toward the database); N/N+1 proved in both directions; lock budgets measured at 5 ms each against 600,000 rows (metadata-only, size-independent); 22 names/checksums recorded; four accepted live-fingerprint differences documented. **Two items are carried forward, neither owned by this task**: a restored snapshot grants `CREATE` on `public` to `PUBLIC` where production grants only `USAGE`, which belongs to the restore procedure; and neither new migration has been applied to a live database. History of the work: bounded budgets, explicit target identity, the destructive/nontransactional safety gate and a migrate-first release command are implemented, and **empty-database convergence is now proven on a real isolated PostgreSQL 16** (19 applied, 29 tables, fingerprint `4b709a2c…`, CI-gated without secrets); re-proven 2026-09-09 at **20 applied, 30 tables, fingerprint `964f4251…`** after `0018_adopt_crypto_transactions.sql` adopted the one orphan table the restore rehearsal found, closing the last known gap between the migration history and production's table set. The fingerprint was then widened to views, triggers, routines, policies, privileges, default privileges, extensions and types (`fingerprintVersion` 2, digest `5f3f248f…`): every newly visible dimension matches between the live database and a clean build — nothing is granted to anyone. **The first object-level comparison against a live database, however, found real drift**: dev has 7 orphan columns, is missing an index `0010a` creates, and carries 6 foreign-key columns with rogue `nextval` defaults of which **5 have no repair migration anywhere**. Root cause: migrations 0000–0013 were baselined on that database and never executed. The recorded FK `nextval` disagreement is resolved as migration lag, not a repository defect. The baseline contract's two proven blind spots are now closed: it can express "this column has no default" (all three `DROP DEFAULT` statements in the history are requirements, enforced by a test) and it requires `0010a`'s index. Verified on an isolated PostgreSQL 16.10: 0 unmet on a clean build, and on a database given dev's two defects the pre-change contract saw neither and raised one false positive while the new one sees both and raises none. That run also found a latent defect — the `0009` requirement named `job_invoices.gst_mode` where the migration and `shared/schema.ts` both say `quotes`, so it would have refused any baseline plan containing `0009`; introduced 2026-08-10, one day after dev was baselined, now corrected. **Recommendations 1–3 of the drift finding are now closed.** `0019_drop_rogue_fk_defaults.sql` repairs all seven foreign-key columns that can carry a rogue `nextval` default — including the five no migration anywhere could fix — and `0020_adopt_orphan_columns.sql` adopts the seven orphan columns, following the owner's 2026-09-09 adopt-not-drop decision on the identical question for `crypto_transactions`; all seven are empty and no live database was modified. Contract coverage went from sampled to exhaustive per class (43/43 indexes, 10/10 dropped defaults, 2/2 dropped NOT NULLs, 78 requirements to 131), each enforced by a parser-backed test. Verified on an isolated PostgreSQL 16.10: 22 applied, 0 pending/drifted/orphaned, 0 unmet requirements on a clean build, fingerprint delta exactly +7 columns and 0 everywhere else, and on a database given dev's five unrepairable defaults the gate reports all five and `0019` clears them. New fingerprint `8c40c156…`, CI repointed. 98 suites / 1386 tests pass. **Recommendation 4 is now closed too — production has been fingerprinted** ([production fingerprint](r0/R0-T6A-production-fingerprint-2026-09-10.md), read-only, owner-approved). It confirms the lane's findings hold beyond the dev fork: production carries **all six** rogue foreign-key defaults — including the five only `0019` can repair — is missing `0010a`'s `tapt_stones_merchant_id_idx`, and has all seven orphan columns, so after `0020` the column counts agree **exactly** (497 = 497), as do tables, constraints and foreign keys. Two new minor facts: one index differs by name only (`_unique` vs `_key`, Drizzle-vs-Postgres naming), and Neon's two `cloud_admin`→`neon_superuser` default privileges cannot be reproduced by `migrations/`, so digest equality can never gate a local build against production. Nothing was applied to production; all four drift recommendations are now closed. Restored-snapshot convergence, N/N+1, lock timings on a production-sized clone, restore rehearsal and target approval remain absent. |
| R0-T7 | Scrub the tracked configuration | 547 | Engineering | PARTIAL, and worse than recorded: tracked runtime block scrubbed, but 287 scanner findings remain `review-required` and the unread hits included a public `.env` exposure on `origin/main`. Classification of those findings is now blocking, not deferred. |
| R0-H1 | Declare and inventory | 554 | Owner/professional/provider | Prior owner incident inventory exists; no incident-closure record found. |
| R0-H2 | Generate and enter replacement secrets through an owner-controlled channel | 560 | Owner/professional/provider | **REOPENED 2026-09-09.** Closed 2026-09-07 by owner direction; reopened when `.env` snapshots were found in the public `origin/main` tree. `JWT_SECRET` liveness unconfirmed and `ADMIN_PASSWORD_HASH` exposed; `VAPID_PRIVATE_KEY` verified already rotated; no database URI or `WINDCAVE_API_KEY` present. No performed-rotation claim. |
| R0-H3 | Deploy and verify the rotation took | 567 | Owner/professional/provider | OPEN: no deployment/credential acceptance record found; do not claim rotation-dependent checks ran. |
| R0-H4 | Review access logs and scan history | 578 | Owner/professional/provider | OPEN: owner-reported no suspicious activity is recorded, but full redacted history/access review and disposition remain unverified. |
| R0-H5 | Classify tracked uploads and local dumps | 585 | Owner/professional/provider | PARTIAL: tracked PNG classification recorded; prior inventory was 41; this workspace now has 38 ignored entries. Owner disposition remains open; no contents inspected. |
| R1-T1 | No-live-system HTTP test harness | 610 | Engineering | Harness implemented early; audit all transport/clock/SSE/push injection and no-network proof after the R0 exit gate. |
| R1-T2 | Checked-in route policy inventory | 622 | Engineering | PARTIAL: route markers/inventory exist; required per-route fields and all-method/use/mounted-router coverage remain incomplete. |
| R1-T3 | Explicit role and tenant matrix | 639 | Engineering | PARTIAL: owner defaults fixed; full principal/tenant matrix and runtime coverage open. Password path contract still violates the plan. |
| R1-H1 | Accept the device baseline commit before R1 client changes | 651 | Owner/professional/provider | D10 implementation/ADR recorded; exact post-R0 visual baseline and owner acceptance explicitly outstanding. |
| R1-T4 | OAuth rebuild, session storage and shared security primitives | 660 | Engineering | GATED: R0 exit and R1-H1 acceptance; OAuth/session/reset/CORS/distributed-abuse work remains. |
| R1-T5 | Sign in with Apple — protocol-specific adapter on T4's primitives | 686 | Engineering | GATED: R1-T4, then real Apple provisioning/device verification. |
| R1-T6 | Strict numeric path and query parsing — review snapshot has 71 path and 7 query sites | 699 | Engineering | PARTIAL: five permissive query sites remain; no source guard. UUID paths and typed query schemas need complete inventory. |
| R1-T7 | Tenant-scoped storage — close the generated authenticated-route gap | 732 | Engineering | PARTIAL: upload SQL moved behind storage; other tenant methods, upload authorization/content/privacy and two-merchant matrix remain. |
| R1-T8 | Fix the hook-order crash | 758 | Engineering | GATED: R0 exit and R1-H1; crash characterization is not a fix. |
| R1-T9 | Truthful frontend failure states | 773 | Engineering | GATED: R1-T8; essential/optional failure states and duplicate-action tests remain. |
| R1-T10 | Device and tutorial acceptance matrix | 780 | Engineering | GATED: T3/T5/T7/T9 and H1; typed routes, devices, tutorials and accessibility acceptance remain. |
| R2 | Provider boundary and exact verification | 818 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R3 | Durable notifications and payment convergence | 831 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R4 | Durable refunds | 871 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R5 | Encryption | 881 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R6 | Entitlement, scheduler, health, observability | 905 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R7 | Native truthfulness and full regression | 914 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| R8 | CI, dependency hygiene, truthfulness, rehearsal | 926 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-H1 | Formalise the locked companion-v1 subscription model | 974 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| A-H2 | Confirm legal entity, capabilities, wallet scope and truthful reviewer environment | 980 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| A-H3 | Approve deletion, retention and legal-hold policy | 988 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| A-T1 | Info.plist usage strings and export compliance | 996 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T2 | Entitlements and Sign in with Apple/push provisioning | 1002 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T3 | Evidence-driven privacy manifest and App Store privacy label | 1008 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T4 | Production bundled shell and API boundary | 1015 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T5 | Offline, external-navigation and deep-link safety | 1021 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T6 | Idempotent account-closure workflow | 1028 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T7 | Native Settings, subscription, privacy and wallet truth | 1034 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-T8 | Signed release-candidate and review rehearsal | 1040 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| A-H4 | Prepare metadata, submit with manual release, and monitor | 1048 | Owner/professional/provider | GATED human release/pilot: requires signed post-R8 candidate and track-specific approvals. |
| X-H1 | Register the app and freeze current vendor/commercial facts | 1087 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| X-H2 | Approve accounting, GST, payment-provenance and settlement semantics | 1098 | Owner/professional/provider | OPEN human gate: discovery may begin as allowed; named approvals/evidence not found in the recovered handoffs. |
| X-T1 | Create immutable local accounting documents and allocations | 1114 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T2 | Create connection-scoped Xero schema | 1121 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T3 | Transactional storage contract | 1134 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T4 | Feature gates, route policy and connection lifecycle contracts | 1140 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T5 | OAuth consent, organisation selection, reconnect and disconnect | 1146 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T6 | Serialized token refresh coordinator | 1153 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T7 | Transactional outbox worker and ambiguous-response recovery | 1159 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T8 | Distributed rate, concurrency and outage control | 1166 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T9 | Persistent account and tax mappings | 1172 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T10 | Stable contact mapping without email identity | 1178 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T11 | Trades invoice export from immutable snapshots | 1184 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T12 | Payment allocation and settlement reconciliation | 1190 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T13 | Credit-note, allocation and refund-payment state machine | 1196 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-T14 | Settings, repair controls, observability and full fault/scale suite | 1202 | Engineering | GATED: implement only after the source dependencies; no full-phase completion evidence recorded. |
| X-H3 | Approve and run the canary pilot | 1217 | Owner/professional/provider | GATED human release/pilot: requires signed post-R8 candidate and track-specific approvals. |

## Decisions and cross-workstream rules

D1–D25 remain in the source P9 register. Locked decisions are not reopened.
D7's accepted lineage is recorded above; R0-H2's current disposition is the dated
owner instruction. D8 retention, D9 entitlement/dunning, D12 funds model and
D17 vendor confirmation retain their named external gates. D10/D16/D20/D23/D25
are product choices, not substitutes for baseline, accountant, provider or device
proof. Apple discovery A-H1/H2/H3 and Xero discovery X-H1/H2 may run in parallel;
submission and remote merchant/accounting writes cannot bypass their dependencies.
Property/Retail Xero, Tap to Pay, crypto, broad redesign and the other P8.4 deferred
items remain explicitly deferred. No capability or payment-mode flag was enabled.

## Inherited individual controls — mapping backlog

P8.4a requires the still-applicable v2.2 §22 checkboxes to have individual task,
owner, test and artifact mappings before phase decomposition. The checklist below
retains every source checkbox verbatim by subsection and line, so none disappears
inside a grouped “covered elsewhere” claim. **These are open mapping/review items,
not verified work.** Applicability and destination are resolved through P8.4a;
§22.14 remains deferred and must not be promoted without an ADR. Phase-level rows
above are navigation only and do not satisfy this individual mapping requirement.

Source: [v2.2 audit input](../../PLAN-2026-08-24-taptpay-remediation-v2-2.md).


### 22. Master content checklist and phase crosswalk


### 22.1 Governance, D1–D8, and constraints

- [ ] Source 22.1, line 1537: Record D1–D8 in `docs/decisions/`, including D4 platform-owned Windcave credentials and D8 encrypt-and-keep bank data as **provisional product/legal decisions**.
- [ ] Source 22.1, line 1538: D1 assumes live merchants and real payments exist and treats every production row/artifact as live.
- [ ] Source 22.1, line 1539: D2 keeps historical Stripe schema columns until dead-proof and a separately reviewed migration; this remediation proposes no drop.
- [ ] Source 22.1, line 1540: D3 keeps Replit + Neon as the target for the remediation period.
- [ ] Source 22.1, line 1541: D4 permits platform-owned `WINDCAVE_USERNAME` / `WINDCAVE_API_KEY` technically for UAT; real processing also needs D12 funds-flow approval.
- [ ] Source 22.1, line 1542: D5 keeps crypto OFF. `FEATURE_CRYPTO` is a false-only kill switch/invariant; true is rejected and no crypto code is recreated.
- [ ] Source 22.1, line 1543: D6 runs synthetic beta merchants against sandbox/UAT first; real processing waits for every applicable gate.
- [ ] Source 22.1, line 1544: D7 cuts/records the remediation branch from the product-approved active tablet/desktop SHA.
- [ ] Source 22.1, line 1545: D8 encrypts and keeps legacy bank data provisionally, with no new collection and a later retention/deletion decision.
- [ ] Source 22.1, line 1546: Enforce the feature freeze: no new verticals or noncritical features.
- [ ] Source 22.1, line 1547: Use the ADR decision log for every locked choice, change, exception, open provider/legal choice, and superseding decision.
- [ ] Source 22.1, line 1548: Complete the §21 reviewer template and independent second pass before implementation; final recommendation must be Approve.
- [ ] Source 22.1, line 1549: Apply boring-over-clever, fail-fast/fail-closed, never-trust-the-client, money-is-traceable, and reversible-change principles from §1.4.

### 22.2 Requested Phase −1 — handoff and preflight

- [ ] Source 22.2, line 1555: **Step 0 prerequisite — reconcile, do not blindly apply.** Read the pending-migration instructions in `docs/PLAN-2026-08-10-finish-review-and-fix.md`, name the target, and run read-only migration status/fingerprint. The 2026-08-24 inspected dev target reports 19 applied, 0 pending, 0 drifted, 0 orphaned, so Step 0 is currently satisfied without an apply. If a named dev target later shows a legitimate pending migration, stop, restore-test, rehearse, obtain migration approval, and apply only that reviewed forward migration. Any failure is a stop condition.
- [ ] Source 22.2, line 1556: Read `CLAUDE.md`, `AGENTS.md`, all listed handoffs/plans, `replit.md`, and `DEPLOYMENT.md`.
- [ ] Source 22.2, line 1557: Inventory active branch/SHA, dirty and in-flight work, worktrees, unmerged migrations, open PRs, deployment candidate, and owners. Do not infer open-PR state without checking the authorized remote.
- [ ] Source 22.2, line 1558: Inventory deployments: public/admin/payment/provider hosts; canonical domains; Replit build/run/release commands; autoscaling; env/secret sources; Neon projects/branches/roles; WebSocket adapter; scheduler; object storage; DNS/TLS; backup and rollback capability.
- [ ] Source 22.2, line 1559: Inventory and preserve existing auth middleware, JWT/admin validation, hashed retail bearer tokens, payment attempts/dedupe, DTO allowlists, redaction, migration runner, PostgreSQL verifiers, browser checks, rate limiting, and state claims.
- [ ] Source 22.2, line 1560: Classify live data, uploads, local/managed backups, logs, Git history, provider identifiers, bank fields, OAuth tokens, push subscriptions, and synthetic/test data.
- [ ] Source 22.2, line 1561: Record the coordination agreement: existing phone behavior, tablet full-bleed UI, centered desktop frame, auth/onboarding, tutorial adaptation, real API wiring, and no mock merchant data remain acceptance constraints.

### 22.3 Requested Phase 0 — safety nets before churn

- [ ] Source 22.3, line 1567: Create a managed Neon snapshot and, if required, an encrypted logical backup; restore into an isolated scratch project and verify schema, representative counts, tenant isolation, and decryptability. Record RPO/RTO and owner.
- [ ] Source 22.3, line 1568: After review approval, create `pre-remediation-<date>` tag, archive/checksum the deploy artifact in approved storage, and record exact rollback commands, flag rollback, schema compatibility, secret-rotation caveats, and responsible operator.
- [ ] Source 22.3, line 1569: Route-enforce `FEATURE_LIVE_WINDCAVE`, `FEATURE_REFUNDS`, `FEATURE_CRYPTO=false`, `FEATURE_WOOCOMMERCE=false`, `FEATURE_TAP_TO_PAY`, and `FEATURE_SPLIT_PAYMENTS`. §5 defines canonical mappings and adds per-domain flags so a broad switch cannot accidentally stop reconciliation.
- [ ] Source 22.3, line 1570: Defaults are off/fail-closed for staging and new deployments. A production enablement/change needs a business decision, merchant-impact/maintenance plan, rollback owner, and observation window.
- [ ] Source 22.3, line 1571: Run the current CI characterization without masking hook crashes, React warnings, page errors, tolerated visual defects, or pre-existing lint configuration failures.
- [ ] Source 22.3, line 1572: Add Zod configuration validation with `ENV_VALIDATION_MODE=audit|enforce`. First deploy may audit/warn for inventoried noncritical optional groups without values. Security-critical variables, invalid payment/environment combinations, partial credential pairs, and production seed/simulation are always enforced immediately. Move each feature group to enforce only after its inventory is complete; production money enablement requires all relevant groups enforced.
- [ ] Source 22.3, line 1573: Make deployment build side-effect-free: replace `npm run build && npm run db:migrate` with build only. Migrations run in a separately approved release step.
- [ ] Source 22.3, line 1574: Remove automatic production DB dumping from development startup.

### 22.4 Requested Phase 1 — non-destructive Stripe removal

- [ ] Source 22.4, line 1580: Run case-insensitive searches across source, generated entry points, routes, webhooks, UI, env templates, deployment config, package/lock files, WooCommerce, and current docs.
- [ ] Source 22.4, line 1581: Require zero Stripe runtime imports/routes/UI/webhooks/env reads. If a reachable runtime path is found, remove it with focused tests.
- [ ] Source 22.4, line 1582: Uninstall a Stripe package only if lockfile/import/build proof shows it remains; at review time Stripe packages are already absent.
- [ ] Source 22.4, line 1583: Inventory every historical `stripe_*` column/table reference, annotate deprecated/historical, and preserve it. A future drop needs data count, code/history dead-proof, backup, forward migration, and approval.
- [ ] Source 22.4, line 1584: Remove stale Stripe and unsafe production-ready/compliance wording from `SECURITY.md`, `APPLE_PAY_GOOGLE_PAY_COMPLIANCE.md`, `DEPLOYMENT.md`, README/product/plugin/legal copy while preserving truthful historical migration notes.

### 22.5 Requested Phase 2 — dependency and repository hygiene

- [ ] Source 22.5, line 1590: Capture `npm ls --all`, direct/transitive dependency graph, package-lock integrity, import graph, build bundle evidence, runtime dynamic imports, and native/build/test consumers.
- [ ] Source 22.5, line 1591: Treat every old v1 “typo/removal” list as examples to verify, never an uninstall list.
- [ ] Source 22.5, line 1592: For each proven-unused group run targeted `npm uninstall <exact packages>`, then `npm ci`, review `package.json` and lockfile diff, typecheck/test/build. Never delete or regenerate the lockfile casually.
- [ ] Source 22.5, line 1593: Verify compatible `react` and `react-dom` remain runtime dependencies. Move `@types/*`, compilers, test runners, linters, and build-only tooling to `devDependencies` only after production build/install proof.
- [ ] Source 22.5, line 1594: Select and retain one email delivery provider/adapter. Remove SendGrid/Resend/Nodemailer alternatives only after route/job/config/template and production delivery proof. Preserve a provider-independent interface and test fake.
- [ ] Source 22.5, line 1595: Make scripts explicit and portable: use `cross-env` where environment assignment must work on Windows, keep explicit Vite + esbuild production build, use a clear `tsx watch` development script, and prove Linux/Replit behavior does not regress.
- [ ] Source 22.5, line 1596: Add `.nvmrc`/Node engines, complete `.gitignore`, and a key-name-only `.env.example`; rename package `rest-express` to the approved TaptPay package name with lockfile review.
- [ ] Source 22.5, line 1597: Inventory `taptpay-ios.zip`, visual/demo archives, tracked `uploads/`, `attached_assets/`, screenshots, `.verify1.mjs`, stray HTML, generated bundles, local audit scripts, database dumps, and AI-tool folders. Classify reachability, design provenance, licensing, PII, and handoff need before removal. Move required artifacts to approved storage/docs, remove proven junk with explicit paths, and document/ignore `.claude-home/**`, local AI state, dumps, traces, and runtime uploads. Never wholesale-delete design sources or live uploads based only on a filename.

### 22.6 Requested Phase 3 — database correctness and migration safety

- [ ] Source 22.6, line 1601: Verify/preserve the Neon WebSocket Drizzle adapter; remove a conflicting SQLite import only if a new source audit finds one. Current audit found none.
- [ ] Source 22.6, line 1602: Harden the existing runner rather than replacing it: explicit target identity, advisory-lock timeout, `lock_timeout`, `statement_timeout`, structured/redacted logging, backup/rehearsal gate, destructive/drop approval, and no auto-apply from build/startup.
- [ ] Source 22.6, line 1603: Run count-only dirty-data preflights before every unique/CHECK/FK/not-null change and record reviewed cleanup decisions without row values.
- [ ] Source 22.6, line 1604: Rehearse on a production-sized restored clone and measure locks. Handle concurrent indexes only through an explicitly reviewed runner mode or approved short-lock window.
- [ ] Source 22.6, line 1605: Review constraints/indexes for provider notification identity, client/provider idempotency keys, normalized email uniqueness, FK integrity, tenant ownership, merchant/status/created-at queries, session/X-ID/provider-transaction lookup, refund reconciliation, and job claims. Add only query- and data-proven indexes.
- [ ] Source 22.6, line 1606: Plan `timestamptz`/UTC normalization as separate forward migrations: define ambiguous legacy timezone, convert on a restored clone, store UTC, display in merchant/user locale, and test DST boundaries. Do not mix this with money schema.
- [ ] Source 22.6, line 1607: Financial records have no hard-delete API. Use void/cancel/correction events and, for nonfinancial mutable records where deletion is allowed, reviewed `deleted_at` semantics.

### 22.7 Requested Phase 4 — Windcave notification integrity

- [ ] Source 22.7, line 1611: Remove any route-local `express.urlencoded()` / `express.json()` parser on Windcave notifications so one bounded application/provider parser owns the body. Do not add raw-body signature machinery unless Windcave proves a signed mode is active.
- [ ] Source 22.7, line 1612: Treat the notification as a hint: extract bounded `sessionId` / `transactionId`, durably record it, query Windcave with validated platform credentials, and match final status, exact cents, currency, platform provider account/environment, locally bound merchant/aggregate, merchant reference, session, type, and provider transaction.
- [ ] Source 22.7, line 1613: Reject/quarantine every missing, malformed, ambiguous, pending-as-final, or mismatched result. Log a sanitized failure/security event with request ID, never the raw body or full provider identity.
- [ ] Source 22.7, line 1614: Dedupe through the existing durable retail payment attempt plus the R3 provider-notification inbox. Its unique provider/session/kind key is the Windcave equivalent of requested `webhook_events(provider,event_id)`; do not invent an event ID the provider does not supply.
- [ ] Source 22.7, line 1615: Multiple, duplicate, delayed, and out-of-order FPRNs/callbacks are safe; only one atomic finalizer can create the terminal domain/event/message effects.

### 22.8 Requested Phase 5 — incident response, secrets, uploads, and encryption

- [ ] Source 22.8, line 1619: D4 uses platform-owned `WINDCAVE_USERNAME` / `WINDCAVE_API_KEY` as the short-term technical model and remains provisional for real funds.
- [ ] Source 22.8, line 1620: Support `MASTER_ENCRYPTION_KEY` only as an initial single-key/E1 compatibility input if needed; production design must expose an active key ID and readable keyring so rotation is possible. Validate a 32-byte key and never log it.
- [ ] Source 22.8, line 1621: The checklist shorthand `enc:v1:iv:tag:cipher` remains the versioned AES-256-GCM envelope concept. New writes use the safer rotation-capable `enc:v1:<key-id>:<base64url(iv)>:<base64url(tag)>:<base64url(ciphertext)>`.
- [ ] Source 22.8, line 1622: Deploy dual-read plaintext compatibility, then encrypt-on-write, then dry-run and idempotent CAS backfill. “Instant rollback via dual-read” means rolling back to an E1-compatible reader while stopping the writer/job; it never means resuming plaintext writes or deploying pre-E1 code after ciphertext exists.
- [ ] Source 22.8, line 1623: Detect/count plaintext and malformed/unknown/decrypt-failed envelopes without printing values. Decrypt only inside authorized server data/provider/operations services; never in browser DTOs, general logging, analytics, or templates that do not require it.
- [ ] Source 22.8, line 1624: Mask secrets and legacy bank fields in every API DTO; extend the central redactor to nested logs/errors/events.
- [ ] Source 22.8, line 1625: Audit sanitized backfill success/skip/failure counts and secret/key rotation events.
- [ ] Source 22.8, line 1626: Run gitleaks or approved equivalent on current tree/history; rotate and execute §7.1 incident steps for every real secret/PII exposure.
- [ ] Source 22.8, line 1627: Secure file uploads: authenticate and tenant-authorize before streaming; strict byte-size, count, extension-independent MIME/magic validation; randomized object keys; malware scanning/quarantine where appropriate; no executable serving; private object storage; short-lived signed download URLs after authorization; retention/deletion audit; no commits of runtime uploads.

### 22.9 Requested Phase 6 — authentication, authorization, and state machines

- [ ] Source 22.9, line 1631: Keep JWT bearer auth short-term. Schedule and ADR an evaluation of HttpOnly secure SameSite cookies + CSRF for web and OS secure storage for native; do not silently swap token transport during remediation.
- [ ] Source 22.9, line 1632: Remove `express-session`, `connect-pg-simple`, `memorystore`, and related packages only after route/import/runtime dead-proof.
- [ ] Source 22.9, line 1633: Standardize minimal JWT claims: subject/user ID, merchant ID where applicable, role/principal type, issued/expiry, token version/session ID, issuer/audience; no bank/provider secrets or mutable profile data. Use centralized `requireAuth`, `requireMerchant`, and `requireAdmin` middleware (or documented equivalent names) with server/database validation.
- [ ] Source 22.9, line 1634: Complete the route policy matrix for method, path, principal, role, tenant scope, parameter/body/file validation, feature/billing gate, idempotency, rate limit, DTO, and side effects.
- [ ] Source 22.9, line 1635: Dynamic two-merchant and admin integration tests prove Merchant A never sees or changes Merchant B.
- [ ] Source 22.9, line 1636: Production seed/demo login is disabled and audited.
- [ ] Source 22.9, line 1637: Password reset tokens are random, digest-only at rest, single-use, short-lived, tenant/account scoped, invalidated on success/password change, and responses do not enumerate accounts. Password change invalidates prior sessions/token version.
- [ ] Source 22.9, line 1638: Shared/distributed rate limits cover login, signup, reset, payment/session creation, public payment/result polling, admin, provider notification abuse, email/SMS/WhatsApp, upload, and API-key paths with proxy/IP correctness and account/tenant dimensions.
- [ ] Source 22.9, line 1639: Lock CORS to exact approved origins/methods/headers/credentials; provider server-to-server routes do not rely on browser CORS as authentication.
- [ ] Source 22.9, line 1640: Enforce aggregate-specific state machines. The requested current public subset `pending`, `completed`, `failed`, `refunded`, `partially_refunded` is preserved, but repository reality also requires `processing` and `cancelled`; no silent renaming to provider `approved/declined`.

### 22.10 Requested Phase 7 — payment engine hardening

- [ ] Source 22.10, line 1644: Preserve the existing hash-only retail public payment token model; audit entropy, digest comparison, expiry/rotation/single-resource scope and return-state use. Do not create a second retail token system. Property/trades raw link tokens follow the staged hash migration in §10.1.
- [ ] Source 22.10, line 1645: Enforce exact UAT/production Windcave hosts and returned-link relations in code, not only CSP.
- [ ] Source 22.10, line 1646: Test every disabled money route for its specified `404/503` (or role `403`) and zero DB/provider/SSE/push/outbox effects. The exact code follows §5.4 rather than interchangeable 403/404.
- [ ] Source 22.10, line 1647: Move route orchestration into focused `server/services/payments/` modules or an equivalently documented domain directory. Route handlers authenticate/validate/call services/map DTOs; they do not implement provider state machines.
- [ ] Source 22.10, line 1648: Use durable client idempotency, request fingerprints, stable provider X-IDs, leases, and database uniqueness for payments, refunds, subscriptions, and notification processing.
- [ ] Source 22.10, line 1649: Preserve/extend `transaction_events` for created, session-bound, processing, approved/completed, declined/failed, cancelled, refunded, webhook/FPRN, split, manual correction, and reconciliation events. Events are append-only and written with the state change.
- [ ] Source 22.10, line 1650: Reserve the schema names `financial_ledger_accounts` and `financial_ledger_entries` in the D12 accounting ADR. Ship domain events now. Implement the append-only balanced ledger only if funds-flow/accounting review makes it a gate; do not create decorative unused tables.
- [ ] Source 22.10, line 1651: Centralize integer-cents parsing/formatting/allocation; no binary float math for new financial logic. Define currency scale and overflow.
- [ ] Source 22.10, line 1652: Test NZ GST 15% inclusive and exclusive, cent rounding/allocation, line totals, quotes→invoices, split shares, partial/full refunds, and reporting/export totals against approved accounting examples.
- [ ] Source 22.10, line 1653: Split safeguards: min/max participant/share count, exact total allocation with deterministic remainder, immutable share binding, unique live attempt, caps, transactions/locks, abandonment/expiry, and idempotent completion.
- [ ] Source 22.10, line 1654: Refund safeguards follow R4: eligibility, owner role, confirmed captured gateway/share ID, remaining cap, stable idempotency/X-ID, unknown reconciliation, verified notification/query, and one terminal update.
- [ ] Source 22.10, line 1655: Windcave provider interface exposes typed `createSession`, `querySession/queryTransaction`, `createRefund`, `verifyOutcome`, and sanitized error categories through injected transport.
- [ ] Source 22.10, line 1656: Hosted payment retry rules: same client key reuses the live session; never create a second session while a provider-bound attempt is unknown; persist and validate return state; model 3DS required/redirect/complete/failed/expired fields in attempts/events before enabling that path.
- [ ] Source 22.10, line 1657: Build a settlement reconciliation report comparing local confirmed operations with authoritative gateway exports/API: counts, gross cents, processor fees, refunds, disputes where available, net, unmatched local, unmatched provider, and age. It does not claim merchant payout correctness until D12 is resolved.

### 22.11 Requested Phase 8 — frontend and native

- [ ] Source 22.11, line 1661: Add centralized typed route constants/builders in `shared/routes.ts` (or an ADR-approved split for server/client) and replace payment/auth/protected hardcoded strings in reviewed batches.
- [ ] Source 22.11, line 1662: Audit protection and device shell for `/terminal`, `/stack`, `/smart-terminal`, `/property/*`, `/trades/*`, and `/admin/*`; test unauthenticated, member, owner, other tenant, and admin cases.
- [ ] Source 22.11, line 1663: Preserve/extend the global React/chunk error boundary with a friendly retry/reload action, request ID where safe, and no stack/internal error details.
- [ ] Source 22.11, line 1664: Every data page distinguishes loading, error, true empty, partial/unknown, retrying, and success; money CTAs disable on essential uncertainty.
- [ ] Source 22.11, line 1665: One terminal payment UI/controller state machine owns idle, validating, claiming, redirect/native pending, processing, approved, declined, cancelled, error, and retry; one client action cannot double-submit.
- [ ] Source 22.11, line 1666: Capacitor work aligns `startTapToPay` in TypeScript, Swift, and `CAPPluginMethod`; removes `window.TaptPay`; uses `useTapToPay`; and detects web/iOS/unsupported OS-device/SDK/entitlement/offline/server-feature/provider-mode. Until real proof, capability is false.
- [ ] Source 22.11, line 1667: Re-run tablet/desktop/mobile/auth/onboarding/tutorial acceptance after every terminal-affecting batch.
- [ ] Source 22.11, line 1668: Accessibility pass covers names/labels, error association, focus order/trap/restore, keyboard operation, visible focus, semantic status/alerts, contrast, reduced motion, screen reader payment status, and approved tap-target geometry without blindly changing mobile layout.

### 22.12 Requested Phase 9 — operations, observability, staging, and delivery

- [ ] Source 22.12, line 1672: Add secret-free `/healthz` and `/readyz` per §13.4.
- [ ] Source 22.12, line 1673: Propagate validated/generated `X-Request-ID` (response header may use canonical `X-Request-Id`) through all request/job/provider logs.
- [ ] Source 22.12, line 1674: Emit structured logs through existing extended redaction.
- [ ] Source 22.12, line 1675: Record sanitized payment events/metrics for created, processing, approved/completed, declined/failed, cancelled/expired, refund states, FPRN mismatch/failure, duplicate ignored, reconciliation, and Tap-to-Pay capability/actions if ever enabled.
- [ ] Source 22.12, line 1676: Add a Sentry-class error tracker only after DPA/data-region/sampling/retention review and a before-send scrubber proves no secret, card, bank, token, raw provider body, or PII leakage. Keep it disabled until configured.
- [ ] Source 22.12, line 1677: Use durable background work/leases/outbox for expiry, provider retry, email/SMS/WhatsApp, reminders, PDFs, reports, subscription billing, payouts, and reconciliation. Reuse existing jobs; add missing durability rather than duplicating them.
- [ ] Source 22.12, line 1678: Staging has a separate Neon database/project/roles, UAT credentials, synthetic merchants/customers, separate push/email destinations, no production PII or copied live secrets, and external side effects captured/allowlisted.
- [ ] Source 22.12, line 1679: Runbooks cover backup/restore, Windcave outage, DB outage, secret leak, suspected breach, fraud spike, notification backlog/failure, refund unknown, subscription double-charge risk, admin compromise, scheduler stale, rollback, and customer/merchant communications.
- [ ] Source 22.12, line 1680: CI/branch protection requires PR review, typecheck, repaired lint, tests, build, isolated PostgreSQL/migration verification, secret scan, dependency triage, and migration-owner review.
- [ ] Source 22.12, line 1681: Use releases/tags/changelog with exact SHA, migrations, flags, known issues, artifact checksum, rollback, and evidence links.
- [ ] Source 22.12, line 1682: Provide a portability escape hatch: reviewed `Dockerfile`/container build, environment contract, health checks, migration release command, and deployment docs that can run away from Replit without pretending this remediation is a platform migration.

### 22.13 Requested Phase 10 — compliance and legal truthfulness

- [ ] Source 22.13, line 1686: Validate PCI scope against the actual enabled Windcave HPP, Hosted Fields/AJAX, wallet, subscription-token, and native data flows; documentation alone is not evidence.
- [ ] Source 22.13, line 1687: Correct every “production ready,” PCI/SAQ, native/wallet, encryption, monitoring, and endpoint-protection claim until its gate passes.
- [ ] Source 22.13, line 1688: Product/legal owns and approves Terms of Service, Privacy Policy, Merchant Agreement, Payer Terms, Refund Policy, and Acceptable Use Policy; link versions/effective dates and acceptance evidence.
- [ ] Source 22.13, line 1689: Define retention/deletion/legal-hold for merchants, users, financial records, provider identifiers, bank data, uploads, messages, logs, audit events, backups, and encryption keys.
- [ ] Source 22.13, line 1690: Record lawful consent and per-channel communication preferences/opt-out for email, SMS, WhatsApp, and push.
- [ ] Source 22.13, line 1691: Obtain NZ GST/tax/accounting review and provide exportable, immutable financial/event records with defined rounding and timezone.
- [ ] Source 22.13, line 1692: Obtain professional AML/KYB, sanctions, merchant onboarding, fraud, chargeback, refund, merchant-of-record, and settlement review before real onboarding/processing.
- [ ] Source 22.13, line 1693: Audit every admin action and impersonation/configuration/secret/merchant-status change with actor, target, reason, time, request ID, and before/after classification without sensitive values.
- [ ] Source 22.13, line 1694: Complete the bank-data handling and D8 retention review.

### 22.14 Requested Phase 11 — explicitly deferred after gates

- [ ] Source 22.14, line 1698: Merchant god-table normalization; organization/membership/role redesign; locations, terminals, and device management.
- [ ] Source 22.14, line 1699: Broader vertical isolation and long-term WooCommerce/trades/property product strategy beyond safety kill switches.
- [ ] Source 22.14, line 1700: Full OpenAPI contract, generated typed client, pagination strategy, and generalized reporting module.
- [ ] Source 22.14, line 1701: Broad load testing, disaster-recovery drills beyond release restore proof, fraud engine, payout tracking, synthetic monitoring, and independent penetration test.

### 22.15 Complete verification matrix


### 22.16 Checklist stop conditions and final approval
