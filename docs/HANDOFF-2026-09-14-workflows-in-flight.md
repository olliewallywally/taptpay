> **SUPERSEDED 2026-09-19 — kept for the trail only; do not act on anything below.**
> Both gap-12 tracks it tracked landed (commits `72230602`, `8666dafc`), and its step 5 — the uploads
> Option C work — has been implemented; see
> [`R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md`](evidence/remediation-v2-2/r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md).
> None of the task/run IDs below resolve (background workflow state does not survive a session boundary,
> as this file itself warned). The live state is the **newest entry at the top of**
> [`evidence/remediation-v2-2/CONTINUATION-2026-09-07.md`](evidence/remediation-v2-2/CONTINUATION-2026-09-07.md).

# In-flight background workflows — 2026-09-14/15 (third session, round 3 — resumed)

**Round 2 update (2026-09-14, later): both round-2 workflows partially failed on the session's
own usage limit, not on review content.** Track A (`wu8zx5bog`): both reviewers errored
("You've hit your session limit"), correctly left `approved: false` (0 valid reviews), implement
never even attempted — 0 tool calls, 0 tokens. Safe. Track B (`w4pyb7ouo`): review:1 errored the
same way, but review:2 completed and said "Approve" — **and the orchestration script incorrectly
treated that single surviving approval as sufficient**, invoking `implement`, which itself then
also hit the session limit immediately (0 tool calls, 0 tokens — confirmed via journal, and
confirmed via `git status`/`git diff` showing a completely clean tree, so no partial edits
resulted). This was a real bug in the review-gate logic (a reviewer erroring silently dropped out
of the quorum instead of failing the whole review closed) — **fixed** in both script files
(`allSucceeded = reviews.every(Boolean)` gates `approved` now, before checking recommendations)
before resuming. Both workflows resumed via `resumeFromRunId` on the same run IDs, which should
reuse the completed Plan-stage results (and Track B's one genuine "Approve") from cache and retry
only the reviewers that errored, now that the usage limit has reset (new day, 2026-09-15).

New task IDs from the resume: **Track A `w1wa27u5b`, Track B `whn2jbsff`** (both same run IDs as
before: `wf_c47d2679-5cb` / `wf_fbaf83f0-bd0`). Everything else below (mandatory fixes, owner
sign-off, scope) is unchanged from round 2.

---

# In-flight background workflows — 2026-09-14 (third session, round 2)

Supersedes this file's own prior version (third session, round 1). Gap 11 C0/C1 is done and
committed (`5318496b`); the four owner-decision docs are transcribed and committed (`4ba429af`).
This round covers the two gap-12 tracks.

## Round 1 redo attempt — both tracks correctly blocked by review

Task `w5kjofgqm` / run `wf_22210ec4-0a0` completed. Its own review gate (2 independent reviewers
per track, unanimous approval required) worked exactly as designed and blocked both tracks before
any code was written — this is a good outcome, not a failure of the workflow:

- **gap12-sse-failclosed**: 2/2 "Do not approve". Both reviewers independently found the same
  core flaw: the plan made the shared SSE broadcast funnel (`broadcastToStone` ->
  `sseBroker.broadcast`) async and awaited a new DB ambiguity check *before* dispatching to ANY
  subscriber of a merchant — delaying/reordering delivery to the authenticated-merchant and board
  audiences, which the task must not touch. The proposed "cheap short-circuit"
  (`sseBroker.subscriberCount(merchantId) > 0`) is audience-agnostic, so it isn't cheap — it would
  fire on nearly every stoneless broadcast whenever a merchant simply has their own dashboard
  open. One reviewer also independently found a genuinely new residual leak (not in any prior
  memo): if sale B completes while sale A is still pending, the pending-bucket count drops back
  to 1 at that instant, so B's completion event is judged non-ambiguous and delivered in full to
  every legacy-no-board subscriber — including customer A, who gets redirected to *B's* receipt.
  Also flagged: the endpoint the fix must correct is polled not only by the customer page but by
  three staff terminal screens + demo-terminal.tsx (files this task may not edit), so fixing it
  properly is a real, observable behavior change to files outside its stated scope — reviewers
  explicitly said this needs Oliver's sign-off, not a sub-agent's self-approval.
- **gap12-terminal-linkmode**: split 1 approve / 1 reject (unanimity required, so blocked). The
  rejecting reviewer found a real bug: the plan gated the new "share this link" UI on whether the
  create-transaction response "carries paymentUrl/qrCodeUrl" — but `server/url-utils.ts`'s
  `generatePaymentUrl`/`generateQrCodeUrl` populate those fields **unconditionally** on every
  successful create, board-selected or not. As written, the plan would label a board's standing
  shared address as a private per-sale link — a real trust/labeling bug in payment-terminal UI.

Full findings (both reviewers' complete text, both plans) are in
`/home/runner/.claude/projects/-home-runner-workspace/cc78254e-7d92-4aa5-9388-5459f9e8be99/subagents/workflows/wf_22210ec4-0a0/journal.jsonl`
if that path is still reachable this session; otherwise treat this summary as the record.

## Oliver's sign-off (2026-09-14, this session)

Asked directly (not written as a separate decision doc yet — do that once the SSE track lands, or
before if this session ends first): shown the exact staff-terminal collateral-effect question
above, Oliver answered **"Yes, proceed (Recommended)"**. This authorizes exactly that behavior
change (staff terminals showing "no active transaction" instead of a guessed one during a genuine
ambiguity window) and nothing else — it does not authorize touching those terminal files, the
residual leak, or Option A/B.

## Round 2 — corrected relaunches, both running now

**Track A — `gap12-sse-failclosed`. Task `wu8zx5bog`, Run `wf_c47d2679-5cb`.**
Script: `/home/runner/.claude/projects/-home-runner-workspace/cc78254e-7d92-4aa5-9388-5459f9e8be99/workflows/scripts/gap12-sse-failclosed-redo2-wf_c47d2679-5cb.js`
Transcript dir: `/home/runner/.claude/projects/-home-runner-workspace/cc78254e-7d92-4aa5-9388-5459f9e8be99/subagents/workflows/wf_c47d2679-5cb/`
Brief now bakes in as mandatory: (1) decouple dispatch so merchant/board delivery stays fully
synchronous, only legacy-no-board fan-out gated behind the async check; (2) an audience-scoped
subscriber-count short-circuit, not the merchant-wide one; (3) explicit documentation (not a fix)
of the sale-B-completes-while-sale-A-pending residual leak; (4) a doc-comment marking the
superseded `getActiveTransactionByMerchant` legacy-no-board branch if it's kept rather than
modified in place; and records Oliver's sign-off above.
Expected deliverable: `docs/evidence/remediation-v2-2/r1/R1-T2-gap12-option-c-fail-closed-2026-09-14.md`.

**Track B — `gap12-terminal-linkmode`. Task `w4pyb7ouo`, Run `wf_fbaf83f0-bd0`.**
Script: `/home/runner/.claude/projects/-home-runner-workspace/cc78254e-7d92-4aa5-9388-5459f9e8be99/workflows/scripts/gap12-terminal-linkmode-redo2-wf_fbaf83f0-bd0.js`
Transcript dir: `/home/runner/.claude/projects/-home-runner-workspace/cc78254e-7d92-4aa5-9388-5459f9e8be99/subagents/workflows/wf_fbaf83f0-bd0/`
Brief now mandates the correct discriminator: gate the share-link UI on whether a board/stone was
selected for that specific create call (client-known at call time, or the response's own
`taptStoneId`), never on `paymentUrl`/`qrCodeUrl` presence — and requires the legacy/board-selected
test case to mock a response that still includes those fields, so the fix is actually exercised.
Expected deliverable: `docs/evidence/remediation-v2-2/r1/R1-T2-gap12-terminal-linkmode-migration-2026-09-14.md`.

**If this session also ends before either lands**: do not assume these IDs are recoverable —
confirmed twice now that background workflow state does not survive a session boundary. Check
`TaskOutput`/transcript dirs first; if absent, re-derive from `git status`/`git diff`, and treat
this document as intent only, not outcome, exactly as both prior rounds required.

## What to do once these land

1. Read each track's actual result via its notification (or `journal.jsonl`) — a track reporting
   `skipped: true` means its review panel didn't unanimously approve again; read why before
   re-attempting a third time or escalating further.
2. Independently re-verify (`git status`/`git diff`, `npm run check`, `npm run test:server`,
   `npx jest --selectProjects client`) before treating either as done.
3. Commit each track separately if verified.
4. Write up Oliver's sign-off above as its own dated decision doc under `docs/decisions/`,
   matching this program's established format, once Track A actually lands (no point recording it
   before there's a real change it authorized).
5. Start the uploads full-tenant-auth work (Option C) — queued behind Track A specifically (it
   also touches `server/routes.ts`/`shared/schema.ts`), not blocked by Track B.
6. Update `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md`'s gap-list items 11-13.
7. Delete or archive this file once step 5 has started.
