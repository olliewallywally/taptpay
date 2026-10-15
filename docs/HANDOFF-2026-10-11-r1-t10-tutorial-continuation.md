# Handoff — R1-T10 tutorial continuation, 2026-10-11

Read the owner-revised
`attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt`,
the newest entries in `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md`,
and this handover. This supersedes October 10's immediate T10 task state, while
preserving its prior commits, recorded failures and independent-review limits.

## Repository and authorization

Repository: `olliewallywally/taptpay`, working directory `/workspace/taptpay`.
Continuation branch: `fix/qwen-aligned-20261010`; base/security-fix commit
`27158eeb54a77898f67066f3876630089ee1b2f7`. The remote branch was reverified at
that SHA during this continuation. The prior upstream handover push remains
`bd5d120498503e0e0607c0bc814a88c81a80e1e9`, October 10 at 11:39:10 UTC;
older `main` is not the program's current implementation lineage.

Oliver asked to review the handover and continue the full integration plan,
then repeatedly said continue. He will deploy through Replit. This continuation
does not deploy or change live providers, databases, flags, migrations or approved
visual/golden baselines. Preserve `.claude-home/**`, local settings, runtime logs
and all existing user state; never stage them with `git add -A`/`git add .`.

Implementation commit: `07ccd385a9bf72241a9835e8016d738a1c889df0`.
The evidence checkpoint is the commit containing this handover. Normal push of
this branch is already authorized; publication must be verified against GitHub
after committing. Derive and verify the exact checkpoint rather than assuming a
written handover proves publication:

```sh
git log -1 --format='%H %s' -- docs/HANDOFF-2026-10-11-r1-t10-tutorial-continuation.md
git rev-parse HEAD
git ls-remote origin refs/heads/fix/qwen-aligned-20261010
```

## Where the plan stood and what was continued

R1-T10c-2/T10c-3 code was already implemented. Durable c2 evidence, final review,
a fresh full dock run, T10d tutorials, T10e accessibility and T10f owner/manual
acceptance were still owed. The continuation reverified c2/c3 checkers, supplied
the missing c2 evidence and obtained a fresh full A–F dock pass without relaxing
thresholds. The historical invalid-flick/full-run failures remain documented.

T10d's real browser matrix was added and its observed defects corrected after
failing checks and separately recorded correction rereads. See:

- `docs/evidence/remediation-v2-2/r1/R1-T10c-2-geometry-2026-10-11.md`;
- `docs/evidence/remediation-v2-2/r1/R1-T10d-preflight-2026-10-10.md`;
- `docs/evidence/remediation-v2-2/r1/R1-T10d-tutorials-2026-10-11.md`.
- `docs/evidence/remediation-v2-2/r1/R1-T10d-regression-history-2026-10-11.md`.

Tutorial fixes cover phone Trades anchors, active and pending first-visit
responsive lifecycles, actual-route eligibility, device-dependent step limits,
visible-target/fallback selection and recovery, lazy/animated target measurements,
phone quote fallback and non-scrolling focus. Merchant streams now stop on page
departure and reconnect after cached page restoration; explicit disconnect cannot
revive them. No financial API/controller/state-machine behavior was changed.

Successful phone Settings restart also returns to the grouped controls rather
than leaving its walkthrough over a detail page without targets. Cancellation
and API failure preserve that section. Forced-fallback checks distinguish a
separately rendered alternate from an alias or a related ancestor/descendant.

## Verification and reproducible commands

Final observed browser results: **88/88 tutorial cells** (all 20 page keys, all
22 surfaces at each of four contexts), **176 completed/persisted rounds**,
**588 ordinary step measurements**, **55 independent fallback recovery pairs**,
**176 responsive measurements**, and **88 route-exit/Back checks**. All four
processes exited 0; every cell has zero faults. Normal device run: **204/204**,
**840 API requests / 45 registered routes**, no fallback-only cells and exit 0.
The phone Transactions actual-drag test restores geometry/focus on collapse and
rejects focus on covered controls after expansion; its original two clipped text
samples remain recorded under the owner's existing acceptance decision.

Durable source/build and per-cell results:
`docs/evidence/remediation-v2-2/r1/R1-T10d-browser-summary-2026-10-11.json`.
The implementation's committed source/test blobs match the tested manifest.
The isolated client build in `final-build/public` under the review directory has
421 files, tree SHA-256
`74d86115d426df39598cc6ac23f15f9a8699b660f6dc5c5da81575bd584416f4`.
After the normal screen run only the tutorial probe checker and fixture changed;
the application and normal geometry checker remained byte-identical. That run
also exited 0, and its two non-application hash differences are recorded.

Also observed on the final source: `npm run check`, production Vite/esbuild
builds into an isolated output directory, focused five suites / 29 regressions,
quiet full client **121 suites / 1,440 tests**, tutorial geometry **18 fixtures**,
invalid tutorial selections/options **4 checks**.
Earlier continuation checker runs: device geometry **35 fixtures**, device gate
**23 planted faults / five clean controls**, session protocol **33 checks**, and
isolated full dock **A–F pass**. Earlier client/browser failures and interrupted
candidate runs are retained, not promoted to passes. The two untouched client
suites that failed under load passed in isolation before the quiet full pass.

Detailed logs and failures:
`/workspace/reviews/r1-t10-continuation-2026-10-10/`.
`final-source-manifest.json` records production/verifier/test hashes and the built
index hash. Local process IDs are not reusable after environment reset; derive
actual state from Git, artifacts and processes, as the prior handover requires.

From the repository, after a fresh build, with absolute output paths:

```sh
npm run check
npm run test:client -- --runInBand
npm run build
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-tutorial-geometry.mjs
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/verify-r1-t10-device-matrix.ts /tmp/t10-tutorial-phone "$PWD/dist/public" --tutorials --context phone
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/verify-r1-t10-device-matrix.ts /tmp/t10-device "$PWD/dist/public"
```

Run the tutorial command for `tablet`, `desktop` and `desktop-short` with distinct
output directories, or omit the context filter for one serial 88-cell run.
Separate processes isolate tutorial generations; pages sharing one merchant
must not reset its generation concurrently. Do not rebuild or edit candidate
source while a browser run is using its build. Keep CPU-heavy client tests
separate from the final browser runs; retain any failures even if a quiet rerun
passes. Narrow filters are diagnostics, not full acceptance.

## Next work and remaining gates

1. Obtain the handover's final independent implementation review of T10c-2/c3,
   Transactions and this T10d diff/evidence. Implementer rereads do not satisfy
   that requirement. P8.5 permits separate preflight rereads, but do not call them
   a second human/agent review or silently mark final review closed.
2. T10e is next. Write/review its bounded preflight; run an automated accessibility
   scan on every matrix surface and active tutorial/dialog states. Capture failures
   before corrections. Add meaningful keyboard/focus order/visible-focus tests,
   dialog trap and return, names/states/alerts, 200% zoom/reflow, reduced motion,
   contrast and touch targets. Record the manual keyboard/screen-reader checklist.
3. T10f is owner/manual: golden-image acceptance, each baseline allowance reaching
   zero or an explicit product decision, approved iPhone orientations and real
   devices, keyboard/screen-reader evidence and acceptance against R1-H1.
4. R1-T3/T7/T9 independent review and Apple owner/provider/native gates remain as
   documented in the older ledger/handovers. **R1-T10 and R1 stay open; do not
   start R2 or call this release/deployment approval.**

## P8.5 continuation record and preserved controls

Phase: R1-T10c evidence/reverification and T10d implementation/verification;
not a release. The implementation commit identifies the exact code and preflight;
this handover and its linked JSON identify the recorded browser candidate.
Changed files are enumerated by `git show --stat <implementation-commit>` and
the JSON source/test hash manifest. All test/build/browser commands and actual
results are recorded above and in the linked evidence.

Migrations and database preflight queries: none; the harness uses isolated
in-memory synthetic records. Provider/UAT activity, external messages and
deployment: none. Feature flags and payment mode after deploy: no deploy;
production flags were neither inspected nor changed. In-flight production
operations and reconciliation were not inspected. Runtime logs and all local
user settings remain excluded from commits.

Failing-first output and no-side-effect controls are in the T10d evidence:
responsive/startup/hidden-target/restart/stream regressions, restart cancellation
and refusal, actual-route denial, explicit stream disconnect and genuine error
reporting. The browser gate clicks tutorial/navigation controls and never creates
or sends a business payment, quote, message or provider request. Structural
evidence contains no session cookies, tokens or customer payloads.

Rollback point: `27158eeb54a77898f67066f3876630089ee1b2f7`, retaining the reviewed
security fixes. Revert the tutorial implementation commit if needed; it has no
data/schema migration. Never roll back the security commit as part of this
tutorial rollback. Review/approval is limited to the preflight's recorded
correction rereads. Final independent review and owner release acceptance remain
open. No observed stop condition was bypassed: every failed candidate is retained,
no measurement threshold was relaxed, and no required owner/provider decision,
secret, migration or live side effect was introduced.

The applicable source-22 control crosswalk below separates this continuation's
checks from broader controls it cannot close. Task IDs retain the existing T10
decomposition. Agent-owned work is engineering; F and release acceptance are owner
work. The final independent reviewer still must confirm the preservation claims.

| Source checkbox | Numbered task / owner | Test and handover artifact | Status in this continuation |
|---|---|---|---|
| 22.11:1661 typed route constants/builders | T10a/b / Agent | Existing typed `apiTo` tutorial routes; full client suite; T10d evidence and source manifest | Existing contract preserved; no new route or builder design |
| 22.11:1662 protected routes/device shells and role/tenant cases | T10c / Agent | 204-cell real-route matrix; 23 planted faults/five controls; c2 evidence | Device/sign-in checks reverified; this browser run does not replace server member/other-tenant authorization review |
| 22.11:1663 friendly React/chunk error boundary | T10c/d / Agent | Existing boundary regressions in the full client suite; strict browser page/console observers; T10d evidence | Boundary retained; no new error-detail exposure or boundary implementation |
| 22.11:1664 truthful loading/error/empty/unknown and disabled money CTAs | T9, T10c/d / Agent | Existing client failure-state regressions; normal matrix and T10d seeded-state evidence | No data-page state or money CTA change; T9 independent review and unseeded states remain open |
| 22.11:1665 terminal controller and double-submit prevention | T9, T10d / Agent | Existing controller regressions in full client suite; tutorial-only clicks documented in T10d | Business mutations/controller unchanged; not a new concurrency or provider proof |
| 22.11:1666 native capability false until actual proof | R1-T1/native owner gates, T10d / Agent + owner | NFC tutorial asserts unavailable/QR alternative; T10d evidence | Capability remains disabled; no native/SDK/device proof claimed |
| 22.11:1667 phone/tablet/desktop/auth/onboarding/tutorial acceptance | T10c/d/f / Agent + owner | 204 screen cells, 88 tutorial cells, retained failures and candidate hashes in browser summary | Automated continuation scope verified; independent review/golden/real-device acceptance still open |
| 22.11:1668 accessibility names/focus/keyboard/alerts/contrast/motion/status/targets | T10e/f / Agent + owner | T10d geometry/control-hit subset; next-work checklist above | Not closed by geometry or client counts; automated/manual accessibility evidence still required |
| 22.12:1681 exact release SHA/checksums/flags/rollback/evidence | T10 evidence / Agent, release owner | Exact implementation SHA, build-tree checksum, this handover and browser summary | Engineering checkpoint only; no tag/release/deploy or production flag claim |
| 22.13:1687 truthful readiness/native/provider claims | T10 evidence / Agent, legal/product owner | Explicit Chromium/synthetic/provider/native/review limits in c2/T10d evidence | No production-readiness or whole-R1 completion claim |

Browser evidence uses Chromium, real application/session routes and synthetic
local data, with property/trades storage reads substituted as documented. It does
not prove PostgreSQL, production providers, native/Safari or manual device behavior.
The older c3 fixture gates use intercepted session replies; do not equate them
with the real-route matrix. Legacy standalone JWT screenshot scripts listed in
c3 evidence remain outside acceptance. Existing browser-data/cartographer warnings
were not silently repaired or claimed absent. The final Vite build also emitted
its large-chunk warning; this continuation did not alter chunking or its threshold.
