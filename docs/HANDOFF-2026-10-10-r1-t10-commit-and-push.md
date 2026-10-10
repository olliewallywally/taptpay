# R1-T10 detailed handover — 2026-10-10

This is the immediate handover for the next AI. Branch:
`remediation/r1-continuation-20260907`. The owner's request in this session was to
find the interrupted state, commit and push all completed tasks, then also write
and push a very detailed handover. This authorizes the Git push, not a deployment,
database migration, production enablement, or a change to product policy.

## 1. Read first and establish ground truth

1. Read `CLAUDE.md`, determine the current branch, and read its matching rules.
2. Read this handover and the newest entries at the top of
   `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md`.
3. Read `docs/PLAN-2026-10-06-r1-t10-acceptance-matrix.md` and the two preflights:
   `docs/evidence/remediation-v2-2/r1/R1-T10c-2-preflight-2026-10-08.md` and
   `R1-T10c-3-preflight-2026-10-08.md` in that directory.
4. For the program's wider scope and required reviewer headings, read
   `docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`, especially §21.1.
5. Run `git status --short`, `git log -10 --oneline`, and check the actual remote.
   A handover describes intent until Git and verification evidence confirm it.

`docs/HANDOFF-2026-10-06-r1-t10.md` remains useful historical context, but its
"not started" description of T10c-2/T10c-3 and "nothing pushed" statement are
superseded by this session. The September 14 workflow handovers are historical;
do not resume their obsolete task IDs or redo their already implemented work.

House rules: failing checks first; independently reverify prior claims; escalate
product/security tradeoffs to Oliver; every owner decision gets its own dated
file in `docs/decisions/`. Stage explicit paths, never `git add -A`. Exclude
`.claude-home/**` and `.claude/settings.local.json`. Keep local credentials,
cookies, raw browser traces and runtime uploads out of Git. Do not blindly apply
the obsolete August pending-migration instructions: the remediation ledger's
reconciliation and approval gates supersede them.

## 2. Interrupted state recovered

The session started at `92f34f87` with 15 changed/untracked paths. No commit or
push was assumed to have happened. GitHub's branch was read directly and pointed
at `fe7e41bf873c7523256c42a3ffc08b51497eb038`; local Git already had two further
commits, `2bba50ad` and `92f34f87`. The latter were existing snapshots of device
geometry, verifier and preflight work. They are retained rather than rewritten.

The unsaved work had two distinct slices:

- The phone Transactions sheet's covered graph controls remained focusable when
  expanded. The verifier exercises expansion, collapse, focus restoration and
  unchanged graph geometry. Oliver's existing decision preserves the swipe layout.
- Historical layout gates still used fake localStorage JWTs after the app moved
  to cookie sessions. Shared fixtures and their consumers had been repaired, with
  protocol checks, a local server runner, representative-screen checks and evidence.

The October 8 evidence referred to `/tmp/taptpay-t10-build-final-20261008`, which
no longer existed. Therefore its claimed passes were not taken as fresh evidence.
This session built and reran the relevant checks. No app database, provider,
production migration, external message or deployment was used.

## 3. Completed application slice

Commit `ebcba947`: `fix(transactions): prevent focus on controls covered by the swipe sheet`.

Files:

- `client/src/pages/transactions.tsx`: an effect sets `topRef.current.inert` when
  `currentOffset < 40`, and the same region gets `aria-hidden` at that threshold.
  Both restore on collapse. This uses the sheet's existing expanded threshold;
  no font, initial position, visual styling or API behavior changes.
- `scripts/verify-r1-t10-device-matrix.ts`: retains first-load geometry, performs
  a real pointer drag, requires a covered period button to reject focus, collapses
  and requires restored focus, compares its original bounding box within 1.25px,
  expands again and measures the readable sheet. Hidden/transparent/aria-hidden
  ancestors are excluded when finding the screen's mark.
- The separate owner decision:
  `docs/decisions/2026-10-08-transactions-swipe-sheet-acceptance.md`.
- T10c-2 preflight additions documenting the earlier failing browser observations,
  scope and recorded review/reread.

The owner-selected exception is exact: keep this phone Transactions swipe layout
and assess text after expansion. The initial cropped text remains in results.
It is not permission to ignore clipping elsewhere or change golden baselines.
Fresh targeted evidence: initial clipped text count 2; expanded clipped text 0;
missed taps 0; covered focus rejected; collapsed focus restored; geometry restored.
Intermediate freely parked offsets are not covered by this correction.

## 4. Completed fixture slice and its limits

Commit `e0e69b4d`: `test(devices): repair browser fixtures for cookie session startup`.

`scripts/browser-session-fixture.mjs` installs a random opaque HttpOnly cookie,
`taptpay-session` for HTTP or `__Host-taptpay-session` for HTTPS. It uses root path,
SameSite Lax and Secure for HTTPS. Its exact `/api/auth/session` reply reflects
whether the expected fixture cookie is present; public fixtures opt out.

The observer checks the actual request and response: GET, HTTP 200, no bearer
authorization, expected cookie, signed-in state, synthetic identity/merchant/role,
onboarding state and nonempty CSRF token. Each top-level navigation gets its own
startup observation, so a late previous response cannot satisfy the next page.
`assertBusinessSessionFixture` refuses bad/missing startup before geometry is read.
This is synthetic layout evidence, not proof of the real server's session security.

Consumers repaired:

- `scripts/desktop-shots/retail-fixtures.mjs` and `trades-fixtures.mjs`: remove
  fake JWT initialization and `/auth/me`; retain mode/merchant/rows/clock behavior;
  register broad tutorial handler before exact state so the latter wins.
- Trades imports the common base URL and Chromium path instead of another convention.
- `scripts/verify-mobile-responsive.mjs`, `verify-terminal-dock.mjs` and
  `verify-desktop-p0.mjs`: require successful observed session startup.
- Dock's public absence case uses a signed-out fixture, requires the actual Login
  page at `/login` and fails on an unexpected dock instead of skipping it.
- `scripts/run-fixture-browser-gate.mjs`: serves real built client files on loopback,
  or Vite source in `--dev` mode. It does not start the application server. Unhandled
  APIs return 404; the historical gates still intercept their synthetic API replies.
- `scripts/verify-browser-session-fixture.mjs`: 33 positive/negative protocol checks.
- `scripts/verify-r1-t10-fixture-surfaces.mjs`: six retail/property/trades screens
  across desktop/tablet plus public Login and protected-to-Login redirect.

Off-origin HTTP traffic is intercepted with empty script/style replies or 204;
local/data/blob handling remains with existing fixtures. Tests send nothing to
analytics, Replit, a provider or a real application database.

Full desktop P0 must use `--dev` because its isolation assertion reads `/src/`
module requests. A built-only substitute would remove that proof. The dev process
still emits inherited Replit cartographer `traverse is not a function` warnings
and old browser-data warnings; those were not repaired or claimed absent.

Twelve private legacy screenshot/probe fixtures remain outside the approved scope.
Their names and limits are listed in
`docs/evidence/remediation-v2-2/r1/R1-T10c-3-session-fixtures-2026-10-08.md`.
Do not treat them as acceptance gates without repairing and verifying them.

## 5. Fresh verification in this session

The immutable build directory used by final checks is `/tmp/taptpay-resume-build`.
Temporary evidence is useful only while it exists; recreate it after an environment
reset. The source and commands are the durable artifacts, not process IDs.

| Check | Fresh result |
|---|---|
| `npm run check` | Exit 0 |
| `npm run test:client -- --runInBand` | 118 suites, 1,427 tests pass; exit 0 |
| `npx vite build --outDir /tmp/taptpay-resume-build` | Final rerun exit 0; existing chunk-size/browser-data warnings |
| `node scripts/verify-browser-session-fixture.mjs` | 33 checks pass; exit 0 |
| Real-route matrix filtered to phone `/transactions` | 1/1 pass, all three focus/geometry assertions true; exit 0 |
| Fixture representative surfaces | 8/8 pass; exit 0 |
| Mobile fixture gate `--verbose` | 21 cells, no regression against existing baseline; exit 0; trades 390 rows improved 2 to 3; no baseline update |
| Desktop P0 with `--dev` | Exit 0; desktop/tablet/phone assertions pass; phone loads zero desktop source modules |
| `git diff --check` | Pass |

Full matrix and dock final outcomes are recorded in the final verification addendum
below. No full server suite, database verifier, migration rehearsal, real iPhone or
Safari run was repeated in this session. Historical server results in the older
handover are historical, not fresh passes on this commit.

### Verification incidents to keep visible

1. Sandbox Chromium launch failed with SIGTRAP; browser/loopback checks were run
   through approved escalation. `.git` is read-only in the sandbox; explicit
   staging/commits likewise required escalation. GitHub DNS failed in the sandbox;
   remote inspection/push use approved network escalation.
2. A second Vite build was accidentally started in the directory already being
   served by the running matrix/dock. Its cleaning briefly removed assets and
   produced ENOENT/404s. Those contaminated runs were stopped. The replacement
   matrix uses `/tmp/resume-matrix-final`; dock uses `/tmp/resume-dock-final.log`.
   Never rebuild, clean or mutate a directory while a browser gate serves it.
3. Dock's full final run reported one finding: its planted flick only achieved
   0.15px/ms, below its required >0.4px/ms; it therefore did not test the velocity
   branch. This is a failed check, not an app regression established by that run.
   The failure is retained; any isolated rerun result is reported separately.
4. The application slice commit succeeded, but Git's automatic maintenance emitted
   pre-existing ref/reflog lock warnings. Do not delete locks blindly or rewrite
   history. Later commit commands disable automatic maintenance for that invocation.
5. The agent server restarted during verification. Git edits/logs remained, and the
   actual local browser processes survived this particular restart; old tool session
   handles did not resolve. This does not establish that background work survives
   other resets. Re-derive from Git, actual processes and completed results each time.

## 6. Commands for the next AI

Build once, wait for its exit, then run gates against that finished directory:

```bash
npm run check
npm run test:client -- --runInBand
npx vite build --outDir /tmp/taptpay-next-build
node scripts/verify-browser-session-fixture.mjs
node --import tsx scripts/verify-r1-t10-device-matrix.ts /tmp/taptpay-next-matrix /tmp/taptpay-next-build
node --import tsx scripts/verify-r1-t10-device-matrix.ts /tmp/taptpay-next-selftest /tmp/taptpay-next-build --self-test
node scripts/run-fixture-browser-gate.mjs /tmp/taptpay-next-build scripts/verify-r1-t10-fixture-surfaces.mjs
node scripts/run-fixture-browser-gate.mjs /tmp/taptpay-next-build scripts/verify-mobile-responsive.mjs --verbose
node scripts/run-fixture-browser-gate.mjs /tmp/taptpay-next-build scripts/verify-terminal-dock.mjs
node scripts/run-fixture-browser-gate.mjs --dev scripts/verify-desktop-p0.mjs
git diff --check
```

For a targeted real-route cell append `--context phone --surface /transactions`.
For a dock diagnostic section use `DOCK_GATE_ONLY=gesture` with the fixture runner.
Capture command exit codes directly; a pipe to `tail` can hide failure. Chromium is
selected by the shared fixture, with `PLAYWRIGHT_CHROMIUM_PATH` as an override.
Use the available nix browser rather than installing another browser blindly.
Do not point these fixture gates at production. No dev server on :5000 is needed
for the loopback runner; keep any ordinary app development server single-instance.

## 7. Next work, in order

1. Read final verification outcomes and actual Git state. Confirm pushed branch SHA
   matches local HEAD. Any push failure means the handover is local until retried.
2. Obtain independent implementation review of T10c-2/T10c-3 and the Transactions
   correction. Prior approved preflights and implementer rereads do not equal final
   independent review. This session performed re-verification, not a reviewer panel.
3. Complete durable T10c-2 evidence: describe the current 204-cell list, geometry
   evaluator/source checksum, admin and token-pay entries, planted-fault checks and
   exact owner-selected Transactions interaction. Read the prior committed geometry
   evidence rather than claiming new self-tests this session did not run.
4. Resolve/report any dock timing-check limitation without weakening its threshold
   or counting an invalid flick as a pass. A targeted pass does not erase a failed
   full run; keep both and decide whether another full isolated run is needed.
5. T10d: exercise every tutorial completion/restart at all four sizes, including real
   target visibility/placement. Known finding: the phone trades home uses desktop
   targets that are absent there. Fix only under the task's review discipline.
6. T10e: automated accessibility plus keyboard/focus/labels/alerts, 200% zoom,
   reduced motion, contrast and touch targets. A matrix first-load pass is not this.
7. T10f remains owner/manual: golden-image approval, baseline allowances to zero,
   approved iPhone orientations, real devices, keyboard/screen-reader evidence and
   acceptance against R1-H1. Do not silently update mobile/golden baselines.

## 8. Wider program limits and owner actions

R1-T10 is not closed by these commits. R1-T5 Apple engineering is built but still
needs independent review, owner Apple settings and recorded real-iPhone checks.
Read `docs/operations/sign-in-with-apple.md` and its handover for those steps.
Other R1 batches also await independent review; the ledger remains authoritative.

Inherited owner items to recheck, not execute automatically: development migrations
0030–0033; ClamAV where the app runs; scheduler operation; the Apple setup; decisions
on unknown API responses (currently HTML/200), Replit's external banner script,
unused legacy pages and orientations. No new answer was collected on those here.
The split-payment replay follow-up C2–C5 remains at its R3 schema gate. Native
Keychain is A-T4. Production remains gated. Read the ledger for R2–R8, App Store,
Xero, funds-flow, retention, backup and professional/provider obligations.

Do not interpret committing/pushing as authorization to merge, deploy, rotate live
secrets, apply migrations, enable payments or declare remediation complete.

## 9. Final verification and Git addendum

The full real-route matrix completed: **204 cells, 204 pass, 0 fail**, 840 API
requests to 45 registered routes, none to an address absent from the policy.
It still lists phone `/trades` as known only by fallback `.td-card`, the tutorial
finding owned by T10d. Full results: `/tmp/resume-matrix-final/results.json`;
log: `/tmp/resume-matrix-final.log`. The old tool handle was lost at restart,
so its completion is established by the completed results and terminal summary,
not by a recovered exit-status handle.

The isolated dock gesture rerun **exited 0** and passed all gesture clauses.
Its flick achieved **0.88px/ms in 23ms**, above the unchanged 0.4px/ms threshold;
icon navigation and Enter/Space checks also passed. Log:
`/tmp/resume-dock-gesture.log`. This explains the difference between the full
run's invalid 0.15px/ms gesture and the isolated valid gesture; it does not erase
the full run failure. A fresh fully green A–F run remains outstanding if required
as acceptance evidence. No assertion, timing threshold or app dock code changed.

Completed work is saved as `ebcba947` and `e0e69b4d`. This handover, the ledger
update and its discovery pointer in `CLAUDE.md` form the following documentation
commit. The owner requested a normal push of this branch to GitHub `origin`:
`https://github.com/olliewallywally/taptpay.git`. This includes the two earlier
local commits `2bba50ad` and `92f34f87` beyond the observed remote `fe7e41bf`.
No force push or history rewrite is required.

To identify this document's exact commit and independently confirm publication:

```bash
git log -1 --format='%H %s' -- docs/HANDOFF-2026-10-10-r1-t10-commit-and-push.md
git rev-parse HEAD
git ls-remote --heads origin remediation/r1-continuation-20260907
git status --short
```

The final user-facing response confirms the push outcome after those checks.
No background task needs resuming at handover completion. Temporary files are
verification artifacts only. The next substantive work is §7 above, not another
commit of the same source changes.
