# Handoff — R1-T10 tasks 2–6 engineering checkpoint, 2026-10-11

Repository `olliewallywally/taptpay`, branch `fix/qwen-aligned-20261010`.
Base `c70018022d19b641ddc7612d79061ddb8aee8a45`. Implementation is the commit
containing this checkpoint; publication will be verified against the remote.
Oliver authorized commit/push and deploys on Replit. **Do not deploy, update
goldens or declare R1-T10/R1/release closed.** Claude owns independent task 7
and the separate stock hidden-focus review.

Read [evidence](evidence/remediation-v2-2/r1/R1-T10-tasks-2-6-checkpoint-2026-10-11.md),
[structural browser report](evidence/remediation-v2-2/r1/R1-T10-tasks-2-6-browser-summary-2026-10-11.json),
[preflight](evidence/remediation-v2-2/r1/R1-T10-tasks-2-6-preflight-2026-10-11.md),
[implementer reread](evidence/remediation-v2-2/r1/R1-T10-tasks-2-6-review-2026-10-11.md)
and [actual-device instructions](operations/r1-t10-real-device-acceptance.md).
This supersedes the earlier October 11 immediate task-state description, while
preserving its evidence and broader security/integration prerequisites.

## Current task ownership and acceptance

| Task | Engineering / remaining acceptance |
| --- | --- |
| 2: contrast / experimental review | Bounded repairs complete; a later 15-state audit found split-rent contrast, two unnamed backspace keys and additional static-paint contrast defects awaiting app fixes; faded/moving/offscreen/custom-palette and actual AT/voice/orientation acceptance also remains open |
| 3: expanded keyboard drafts/dialogs | Local draft operations tested with real keys; 45 expanded states across normal/zoom/reduced phones; no business save; stock guard independent review belongs to Claude |
| 4: actual Safari/device checks | Synthetic preview implemented/smoke-tested and Replit procedure ready; actual iPhone 12/iOS/VoiceOver/page zoom/orientation/keyboards/JS motion and iPad evidence pending |
| 5: legacy dock/mobile | Full isolated dock phases A–F pass (29ms goo / 20ms flag-off, unchanged 32ms limit); strict mobile has five property tap-centre failures awaiting the owner layout decision |
| 6: owner visual/golden | Concrete private packet ready: 42 candidate states, 31 strict difference triples, 20 auth pairs and measured layout/palette alternatives; owner acceptance pending; original golden suite remains red |
| 7: independent final review | Claude; not performed by this implementer reread |

## Exact candidate and verification

Frozen candidate 6 source SHA256
`4cb64b978be8098113e9589ae4c97c53ed9bb3f4c96976939a8679dfb9185857`;
422-file build tree SHA256
`53fb8879e5d22e3eb435501f94c1154b37d7b385e135c2aba06d84be7efbc5e2`;
index SHA256
`57d3170810f92c999a6e02e5d69e01deb848e1a5bcaa035cf298dda7892d0d1d`.
Full client **126 suites / 1,461 tests**, typecheck/build and meaningful contrast /
36 geometry controls pass. Fresh **306 selected browser cells** pass: 204 normal
at four contexts plus 51 phone zoom and 51 phone reduced motion. Original
incomplete/experimental findings remain in the structural report. Active tutorials
pass 88/88 normal and 88/88 zoom. The reduced run has 87/88 full cells and a
pre-tutorial focus-origin establishment failure on desktop-short Trades terminal;
that exact cell passes in isolation, while the full run's exit 1 remains recorded.
The final conservative checker guard leaves paint-transition candidates untouched
and manual; meaningful controls and a targeted real-route smoke verify it. Earlier
supplement counts use the explicitly retained prior checker manifest.

## Concrete outside actions

Before task 2 acceptance, fix the later terminal sub-state findings listed in the
evidence. Preserve the 15-state red audit and the failing transition fixtures.
The unsupported-transition guard is complete; the broader transition-support
experiment remains private. On 2026-10-12 the owner requested publishing completed
work; no additional app palette/keypad patch has been applied at this checkpoint.

1. **Property layout choice.** The August 30 feed-under-dock design has five
   covered row tap centres across 320/360/375/412/430px phones. The private tested
   clearance proposal has zero tap misses/text clipping and three fully visible
   rows at all six widths. Do not apply it or record an allowance from silence.
   The pending owner question presents both images. Record the actual reply in a
   dated `docs/decisions/` file, then implement/rebuild/rerun affected gates if
   clearance is chosen. Do not overwrite the stored mobile baseline automatically.
2. **Reachable test URL.** The owner needs a URL for his iPhone 12. This Linux
   environment could not connect the public tunnel. Run the published synthetic
   mode in the Replit development shell using `REPLIT_DEV_DOMAIN` and port 5000,
   open Webview in a new tab and send/open its `/__acceptance` URL. It lists 51
   routes and temporary fixture logins. Real credentials/business submissions are
   unnecessary; the mode blocks business writes and expires after two hours.
3. **Actual evidence and visual acceptance.** Record actual iOS/Safari/build hash,
   VoiceOver, Safari 200% page zoom (not pinch), rotation/software and hardware
   keyboards, reduced CSS/JS/Canvas motion, all surfaces/tutorials and supported
   iPad outcomes. The owner visual question links the complete private packet;
   no answer/approval is currently recorded. An iPhone does not close the iPad or
   desktop AT lane. Golden changes require separate actual approval.
4. **Claude review.** Independently verify the source/evidence and stock focus
   candidates. This checkpoint is an implementer reread, not task 7 acceptance.

## Private artifacts and publication discipline

Private root `/workspace/reviews/r1-t10-tasks-2-6-2026-10-11/` contains frozen
source/build/checker manifests, final and adverse logs, strict golden triples,
auth pairs, positive/negative controls and the standalone `visual-review-packet.html`
with all images embedded and a checksummed manifest. Retain it outside Git. Earlier
roots are historical evidence. Re-derive outcomes from files/Git, not old session IDs.

No live DB/provider/payment/message, migration, flag, golden or deployment work.
Only owned preview/test processes are stopped; preserve the owner's dev server
PID 4196 if it still belongs to that server. Rollback is an implementation revert;
no data rollback. Stage explicit paths; exclude `logs/`, private artifacts,
`.claude-home/**`, `.claude/settings.local.json`, uploads and generated assets.
Keep hooks and use `git -c gc.auto=0 -c maintenance.auto=false`; verify remote SHA
with `git ls-remote`. No force push or unsolicited merge/deployment.
