# Handoff — R1-T10 terminal/harness followup, 2026-10-12

Repository `olliewallywally/taptpay`, branch `fix/qwen-aligned-20261010`, published
base `b5730b8aa7f5ebdd224509499a7c11381594e921`. Implementation
`7b10df91c2fb1c0a7d2527a2357d69388a875d79` was committed and pushed to
`origin/fix/qwen-aligned-20261010`; fresh `git ls-remote` verified that exact SHA.
This documentation-only publication record follows it.
Oliver authorized continued outstanding work and commit/push. He deploys on Replit.
Claude retains independent task 7 and the separate stock hidden-focus review.

Read [preflight](evidence/remediation-v2-2/r1/R1-T10-terminal-followup-preflight-2026-10-12.md),
[structural evidence](evidence/remediation-v2-2/r1/R1-T10-terminal-followup-browser-summary-2026-10-12.json),
[owner layout decision](decisions/2026-10-12-property-feed-under-dock.md),
[device procedure](operations/r1-t10-real-device-acceptance.md) and
[next-task readiness review](evidence/remediation-v2-2/r1/R1-next-phase-readiness-2026-10-12.md).
The October 11 tasks 2–6 handover/report remains historical evidence, including
its full 306-cell matrix, dock gate and adverse mobile/golden/tutorial results.
Do not relabel those results as runs on this followup candidate.

## Completed repairs

- Both keypad backspaces have the name **Delete last digit** and explicit button
  type. Real Enter/Space checks prove deletion to one cent, zero and empty zero.
- Keypad digits and trades blue-button/avatar text use the existing navy paint.
  Zero amounts, faint helper/placeholder/empty text and split-rent text use the
  established readable secondary ink; small navy-panel metadata has stronger paint.
  The selected property invoice status uses opaque blue because its tinted selected
  background still yielded 4.13:1 at alpha 0.85; the corrected rendered bound is 5.12:1.
- Durable `tests/terminal-accessibility.spec.ts` covers all 15 property/trades states,
  original WCAG findings, actual key operations, rendered key/amount contrast and
  runtime/request errors. Original incompletes and unsupported manual candidates
  are retained. No business/provider implementation changed.
- Golden fixtures now intercept the exact synthetic cash-sale request and the external
  Replit banner before navigation. The Trades flow uses its real **Close quote**
  control. A 360-second complete-flow budget leaves the existing 20-second screenshot
  bound, zero permitted differing pixels, references and tolerances unchanged.

## Actual verification

Final source SHA256 (manifest's sorted SHA256/path rows):
`48eb0f03d131ee4d0db7a5fb44e82e032dc3f49f64b0919c312e0fde14bace2d`.
422-file build tree SHA256:
`925b24608f4db30365207d0280b2bfe0f64cf754a5cc2c288515415845a13b1f`.
Per-file source/build/checker/test manifests remain private and are verified by the
structural summary generator. This digest format is stated explicitly; original
October 11 manifest digests are retained with their original format.

- Final full client **126 suites / 1,461 tests**, typecheck and production build
  exit 0. Build warnings: stale browser-data packages and an existing large chunk.
- Final terminal browser regression **2/2 flows / all 15 states**, exit 0; **zero
  selected WCAG findings / zero measured low bounds**. Retains **15 original
  incomplete findings**, 120 bounded results, 30 manual candidates and one
  experimental incomplete. These counts do not establish universal/manual acceptance.
- Both real terminal routes at normal, native 200% phone zoom and reduced motion:
  **six selected route cells**, all exit 0, with keyboard/dialog and original audits.
- Canonical tier-3 goldens render **24/24 comparisons**, actual exit 1 in all three
  flows, due exclusively to screenshot differences. Missing cash producer, obsolete
  close selector, per-flow budget exhaustion and external-banner fixture dependency
  are corrected. No golden reference/tolerance was changed.
- Full quiet reduced-motion active tutorials: **88/88 cells / 176/176 cases**,
  exit 0, including both trials of the previously failing desktop-short Trades
  terminal cell. Focus return/trap/visible focus, contrast and motion assertions
  pass. The earlier 87/88 run remains retained; no app or checker change was made
  to force the focus-origin assertion green. Normal/zoom full tutorial runs remain
  the earlier candidate-6 evidence, not new full runs on this followup build.

## Owner choices and remaining acceptance

Oliver explicitly chose **Keep the current feed-under-dock layout**. The dated
owner decision is recorded; do not ask that layout question again or apply the
private clearance proposal. The five covered property tap-centre measurements
remain recorded, not converted to zero or silently absorbed into a new baseline.
Earlier full isolated dock phases A–F passed at 29ms goo / 20ms flag-off; dock,
keyframe and geometry-checker source remains unchanged by this followup.

The private current owner packet is
`/workspace/reviews/r1-t10-terminal-followup-2026-10-12/terminal-visual-review.html`:
15 before/after states with 30 embedded images and a hashed manifest. Final fixture
isolation refreshes two captures; all other images match the earlier packet bytes.
The new color-review question is pending; no visual approval is fabricated.
The older complete 42-state/31-strict-triple/20-auth-pair packet remains historical
review material. Terminal color approval, other visuals/H1 baseline approval,
golden-reference updates, actual devices and independent review are separate.

The owner has an iPhone 12 and needs a reachable dev URL. A question asks only for
his Replit development hostname, not credentials. Use the device procedure's
`REPLIT_DEV_DOMAIN`/port-5000 synthetic mode on this published branch; record the
hub's actual index hash. Earlier manual-mode smoke proved real synthetic login,
CSRF and blocked business writes on candidate 6; its server/mode code is unchanged.
No new public URL, actual Safari/VoiceOver/iPad/rotation/keyboard/JS-motion outcome
is claimed. The owner/physical tester must supply that evidence.

The next available task, **R1 exit/dependency readiness for R2**, is now reviewed
read-only in the linked document. It does not establish phase exit or R2 approval;
R2's source dependencies and concrete preflight/reviewer pass still need disposition.
Claude retains task 7. **R1-T10/R1/release remain open.**

## Adverse evidence, scope and rollback

Private root `/workspace/reviews/r1-t10-terminal-followup-2026-10-12/` retains:
unchanged-build regressions (27 assertion errors), candidate A's passing bounded
run and remaining selected-row low bound, the aborted mistargeted server restart,
final-app runtime failures on an unmocked Replit banner, final isolated passes,
strict golden triples and final source/build/checker/test manifests. Original
October 11 history remains in its separate root.

No live DB/provider/payment/message, migration, flag, golden update, merge or
deployment. Stop only owned static/browser/test processes; preserve the owner's
server PID 4196 if still that server. Rollback is a source/fixture commit revert;
no data rollback. Explicit staging only; exclude logs, private images/results,
`.claude-home/**`, `.claude/settings.local.json`, uploads and generated bundles.
Keep hooks, disable automatic maintenance for Git mutations and verify the remote SHA.
