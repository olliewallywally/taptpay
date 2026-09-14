# In-flight background workflows — 2026-09-14 (second session)

This supersedes `docs/HANDOFF-2026-09-14-session-checkpoint.md`'s punch list —
everything in that list is now done or explicitly superseded below. Delete or
archive this file once all three workflows below have landed and been
committed; it exists only so a session interruption doesn't lose track of
what's running, after the prior session's checkpoint showed how costly that
loss is.

**Important lesson from the prior session's checkpoint**: its task/run IDs
did not survive into this new session (`TaskOutput` returned "No task found",
the journal path did not exist). Background Workflow state appears to be
tied to the launching session, not durable across a session boundary. If
this session also ends before these land, do NOT assume the IDs below are
recoverable — check first with `TaskOutput` (block: false) and by looking for
the transcript directories; if absent, re-derive ground truth from `git log`
and `git diff` against this repo the same way this session did for the prior
checkpoint (see the domain-5 evidence file's "Continuity note" section for
that method), rather than trusting any in-progress description.

## Owner decisions this session (2026-09-14, second half) — all recorded, none yet transcribed into their own decision docs

Oliver answered four questions this session, via the interactive tool, not
yet written into `docs/decisions/*.md`:

1. **Gap 11 vs gap 12 confirmation**: confirmed — his prior "fix it properly,
   both paths, boards and without via payment links" answer is about **gap
   12**, not gap 11. (This resolves the open question in
   `docs/HANDOFF-2026-09-14-session-checkpoint.md` §4.)
2. **Gap 11 pacing**: "Land the safe pieces now, schedule the rest" — i.e.
   C0 (count-only preflight) + C1 (additive partial unique indexes) now;
   C2–C5 (compare-and-set, migrate to attempt engine, callback/notification
   reconciliation, durable inbox) separately scheduled later, not started.
3. **Gap 12 terminal migration**: "Yes, proceed now" — migrate the three
   legacy terminals to `linkMode: "per_payment"` for board-less sales plus
   build the missing share-link UI.
4. **Uploads tenant authorization** (the gap found this session, see
   `docs/decisions/2026-09-14-uploads-tenant-authorization-escalation.md`):
   **"Full tenant-scoped auth"** — Option C in that memo: add a tenant
   column to `uploaded_files` and require an authenticated, ownership-checked
   download route for invoice documents (logos stay public). **Not started
   yet** — deliberately queued behind the two workflows below that also touch
   `server/routes.ts` and `shared/schema.ts`, to avoid concurrent-edit
   conflicts on those files. Start this once workflows 1 and 2 below are
   both landed and committed.

**TODO when resuming**: write the four decision docs (matching the style of
`docs/decisions/2026-09-14-r1-h1-visual-baseline-acceptance.md`) transcribing
these, and update the relevant `CONTINUATION-2026-09-07.md` rows/gap-list
items if the workflow writeups below didn't already do it.

## Three workflows launched this session, running in parallel (disjoint files, safe to run concurrently)

### 1. Gap 12 Option C — fail-closed on concurrent-stoneless-sale ambiguity

Task ID `wu60b7zur`, Run ID `wf_9ed8da0f-de9`.
Script: `/home/runner/.claude/projects/-home-runner-workspace/ccda1510-89dc-41e4-91c6-6944e3f84979/workflows/scripts/gap12-option-c-fail-closed-ambiguity-wf_9ed8da0f-de9.js`
Transcript dir: `/home/runner/.claude/projects/-home-runner-workspace/ccda1510-89dc-41e4-91c6-6944e3f84979/subagents/workflows/wf_9ed8da0f-de9/`

Implements the fail-closed-on-ambiguity containment piece of gap 12 (spec:
`docs/decisions/2026-09-13-gap12-anonymous-sse-addressing-options.md`,
"Option C"). Touches: `server/storage.ts` (`getActiveTransactionByMerchant`),
`server/routes.ts` (the REST active-transaction route and the
`broadcastToStone`/SSE choke point), `server/sse-broker.ts`, and
`client/src/pages/customer-payment.tsx`. Deliberately does NOT implement the
options memo's payload-narrowing suggestion (dropping `itemName`) — verified
this session that `itemName` is genuinely rendered on `checkout.tsx`, so that
would be a real product regression, not a safe narrowing.

Expected deliverable: `docs/evidence/remediation-v2-2/r1/R1-T2-gap12-option-c-fail-closed-2026-09-14.md`.

### 2. Gap 11 — C0 preflight + C1 additive unique indexes

Task ID `wju5gtmfl`, Run ID `wf_881183d5-edb`.
Script: `/home/runner/.claude/projects/-home-runner-workspace/ccda1510-89dc-41e4-91c6-6944e3f84979/workflows/scripts/gap11-c0-preflight-c1-index-wf_881183d5-edb.js`
Transcript dir: `/home/runner/.claude/projects/-home-runner-workspace/ccda1510-89dc-41e4-91c6-6944e3f84979/subagents/workflows/wf_881183d5-edb/`

Implements ONLY C0+C1 of the six-step plan in
`docs/decisions/2026-09-13-gap11-split-session-single-use-design.md` §4 — a
read-only duplicate-count preflight against the dev `DATABASE_URL`, then (only
if the preflight is clean) two additive partial unique indexes
(`payment_attempts.processor_session_id`, `split_payments.windcave_transaction_id`)
as defense in depth. Does NOT implement C2–C5 (compare-and-set finaliser,
migrating to the attempt engine, callback/notification reconciliation,
durable inbox) — those remain gap 11's actual fix, separately scheduled.
**This does not close gap 11** — the replay defect in `finaliseHostedPayment`
etc. is still live in application code either way; read the workflow's
writeup carefully for whether C1 actually landed (it's conditional on C0
finding zero conflicts — if C0 finds duplicates, C1 is deliberately skipped
and escalated instead, per the workflow's own fail-closed design).

Expected deliverable:
`docs/evidence/remediation-v2-2/r1/R1-T7-gap11-c0-preflight-c1-index-2026-09-14.md`.

**Also needed after this lands**: the preflight script this workflow writes
under `scripts/` should eventually be re-run against **production** by
someone with production DB access before C1's index is applied there — this
workflow only covers the dev database.

### 3. Gap 12 terminal migration — three legacy terminals to per-payment links

Task ID `wti0p2945`, Run ID `wf_3dc51ddb-01b`.
Script: `/home/runner/.claude/projects/-home-runner-workspace/ccda1510-89dc-41e4-91c6-6944e3f84979/workflows/scripts/gap12-terminal-linkmode-migration-wf_3dc51ddb-01b.js`
Transcript dir: `/home/runner/.claude/projects/-home-runner-workspace/ccda1510-89dc-41e4-91c6-6944e3f84979/subagents/workflows/wf_3dc51ddb-01b/`

Migrates `client/src/pages/merchant-terminal.tsx`,
`merchant-terminal-mobile.tsx`, `merchant-terminal-mobile-v2.tsx` to send
`linkMode: "per_payment"` for board-less sales (matching
`client/src/desktop/pages/retail-terminal.tsx`'s already-correct pattern),
plus build the missing per-sale "share this link" UI each of those three
files currently lacks. Client-only; does not touch any server file. Does NOT
retire the standing `/pay/:merchantId` address (needs a production
traffic-drain window, separately scheduled per the memo) and does NOT touch
the SSE ambiguity fix from workflow 1.

Expected deliverable:
`docs/evidence/remediation-v2-2/r1/R1-T2-gap12-terminal-linkmode-migration-2026-09-14.md`.

## What to do once all three land

1. Read each workflow's actual result via its notification (or
   `<transcriptDir>/journal.jsonl` if the notification was missed) — do not
   trust this document's description of intent as confirmation of outcome.
   Verify with `git status`/`git diff` and by running `npm run check` +
   `npm run test:server` yourself before treating any of them as done.
2. Commit each workflow's changes separately (they touch disjoint files, so
   this should be clean) with a commit message summarizing what actually
   landed, per this repo's established granular-commit style.
3. Write the four transcription decision docs listed above.
4. Start the uploads full-tenant-auth work (Option C from the escalation
   memo) — now safe to touch `server/routes.ts`/`shared/schema.ts` since
   workflows 1 and 2 are done and committed.
5. Delete this file once step 4 has started (it will be stale at that point).
