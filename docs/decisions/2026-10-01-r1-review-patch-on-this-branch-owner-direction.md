# Owner direction — the R1 review patch on this branch; "mark R1 as complete" (2026-10-01)

Date: 2026-10-01 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `cee3cf05`, with
phase E2's client an uncommitted draft from the session that stopped on 2026-09-30). His message, verbatim:

> "ok pick up where you left off, also i uploaded a patch for R1 please find it and ensure its applied and
> mark r1 as complete"

## What was found

- The patch was not in the workspace. It is on GitHub: commit `ce4473df` on
  `claude/trusting-cannon-l7wb6n`, where a Claude cloud session applied the owner's
  `TaptPay-R1-fixes-2026-09-30.patch` (an external review's fixes for R1-T1/T2/T3/T4/T8/T9) unchanged on
  `b0500c5d`, by his decision of 2026-09-29
  ([record](2026-09-29-apply-r1-review-fixes-patch.md), brought onto this branch with the patch).
- This branch is 13 commits and the sign-in rebuild (phase E1) past that base.

## What this authorizes

- **Applying the patch on this branch.** Taken as "its fixes hold on this branch's code": applied
  verbatim, the patch's own tests pass and its stream fix does nothing for a browser signed in by cookie.
  Each fix was carried across and tested against the new sign-in
  ([evidence](../evidence/remediation-v2-2/r1/R1-review-fixes-on-phase-E-2026-10-01.md)). Fetching the
  patch's branch from GitHub (read-only) to do so.
- **Carrying on with R1-T4 phase E** (E2 the client, E3 the token retired), approved 2026-09-30.
- Committing each finished step on this branch, as before. Nothing is pushed without his word.

## What it does not settle

- **"Mark R1 as complete."** Not done, because it would not be true yet. The patch fixes what the review
  found in work already built; it does not build what is still to be built. By the plan's R1 exit gate
  (integration plan R1.D; v2.2 §8.10) and his own answers of 2026-09-29 on finishing R1
  ([record](2026-09-29-finish-r1-owner-answers.md)), R1 still wants:
  - phase E finished (E2, E3), and the admin home page's totals;
  - Sign in with Apple built (R1-T5), then his Apple setup and a real-iPhone check;
  - uploads scanned by ClamAV before anyone can open them, and unattached uploads deleted after 12 months;
  - R1-T7's remainder (storage scoped by business across every domain; gap 11's replay waits on an R3
    schema decision);
  - R1-T10 (the device, tutorial and accessibility acceptance matrix, approved by him);
  - an independent review's approval of each piece (plan §21.1). The external review covered
    R1-T1/T2/T3/T4/T8/T9 as they stood at `b0500c5d`, and its author states the patch "does not …
    constitute independent approval of the new code".
  Whether to close R1 now with any of these moved to a later phase is his to decide; it is put to him.
- The questions the patch's handoff leaves open: whether a terminal may send a payment while its sales are
  still loading; the scope of the plan's Google nonce, issuer and audience checks. (Its other two, the
  400-or-401 answer and the platform admin on money routes, he answered on 2026-09-29.)
- Any push, migration applied to a database, deployment or live provider call.
