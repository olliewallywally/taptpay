# Apply the external reviewer's R1 fixes patch — owner decision

Date: 2026-09-29 UTC. Owner: Oliver. Base: `b0500c5d` (`remediation/r1-continuation-20260907`,
merged to `main` as `17932265`). Applied on `claude/trusting-cannon-l7wb6n`.

## What was asked

The owner supplied a patch (`TaptPay-R1-fixes-2026-09-30.patch`) and its handoff, produced by an
external review pass (Codex) against `b0500c5d`, and asked: "please implement patch".

## What this authorizes

- Applying the patch unchanged, verifying it (typecheck, server and client suites), committing it
  with its handoff as evidence
  ([R1-review-fixes-2026-09-29.md](../evidence/remediation-v2-2/r1/R1-review-fixes-2026-09-29.md)),
  and pushing it to `claude/trusting-cannon-l7wb6n`.

## What it does not authorize or decide

- Any migration, database write, deployment or live provider call. The patch needs none.
- The open questions the handoff lists as still open (§ "Limits and required follow-up" 6–7): the
  bad reset/confirmation/invite-token 400-versus-401 question, platform-admin access on the 23
  business routes, payment availability during initial loading, and the Google
  nonce/issuer/audience scope. They stay open.
- Independent approval of the new code. The patch's author did not claim it, and applying it is
  not a review.
