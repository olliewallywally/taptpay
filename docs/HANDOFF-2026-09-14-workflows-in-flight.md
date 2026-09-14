# In-flight background workflows — 2026-09-14 (third session)

This supersedes its own prior version (second session, `cd51f3b9`). That
session ended (usage limit) with three background workflows launched; their
task/run IDs did **not** survive the session boundary — confirmed this
session via `TaskOutput` (`No task found`) and by checking their transcript
directories directly (all three absent under
`/home/runner/.claude/projects/-home-runner-workspace/ccda1510-89dc-41e4-91c6-6944e3f84979/subagents/workflows/`).
Ground truth was re-derived from `git status`/`git diff` instead, per that
session's own recorded lesson.

## What actually survived from the second session

Of the three workflows launched then, only **one** left any trace in the
working tree or filesystem:

1. **Gap 12 Option C fail-closed (SSE)** — task `wu60b7zur` — **lost, no
   trace**. No file in its scope (`server/storage.ts`, `server/routes.ts`,
   `server/sse-broker.ts`, `client/src/pages/customer-payment.tsx`) was
   modified; its expected evidence doc
   (`docs/evidence/remediation-v2-2/r1/R1-T2-gap12-option-c-fail-closed-2026-09-14.md`)
   was never created. **Redone this session — see below.**
2. **Gap 11 C0 preflight + C1 indexes** — task `wju5gtmfl` — **landed**. Its
   evidence doc, migration, scripts and schema/test-contract diffs were all
   present in the working tree, fully self-consistent and independently
   re-verified this session (fresh `tsc`, fresh 55-suite/1046-test run, fresh
   `db:migrate:status` = 24/0/0/0, fresh `pg_indexes` check — all matched the
   evidence doc exactly). **Committed this session: `5318496b`.**
3. **Gap 12 terminal linkMode migration** — task `wti0p2945` — **lost, no
   trace**. No terminal file was modified; its expected evidence doc
   (`docs/evidence/remediation-v2-2/r1/R1-T2-gap12-terminal-linkmode-migration-2026-09-14.md`)
   was never created. **Redone this session — see below.**

## Owner decisions from the second session — now transcribed to their own files

The four owner answers the second session recorded inline (not yet written
as dated decision docs) are now written up:

1. [gap11-vs-gap12-scope-confirmation](decisions/2026-09-14-gap11-vs-gap12-scope-confirmation.md)
2. [gap11-c0-c1-now-c2-c5-scheduled](decisions/2026-09-14-gap11-c0-c1-now-c2-c5-scheduled.md)
3. [gap12-terminal-linkmode-migration-approval](decisions/2026-09-14-gap12-terminal-linkmode-migration-approval.md)
4. [uploads-tenant-authorization-option-c-disposition](decisions/2026-09-14-uploads-tenant-authorization-option-c-disposition.md)

(Paths above are relative to `docs/decisions/`.)

## This session's background workflow — redoing the two lost tracks

**Task ID `w5kjofgqm`, Run ID `wf_22210ec4-0a0`.**
Script: `/home/runner/.claude/projects/-home-runner-workspace/cc78254e-7d92-4aa5-9388-5459f9e8be99/workflows/scripts/gap12-redo-sse-failclosed-and-terminal-linkmode-wf_22210ec4-0a0.js`
Transcript dir: `/home/runner/.claude/projects/-home-runner-workspace/cc78254e-7d92-4aa5-9388-5459f9e8be99/subagents/workflows/wf_22210ec4-0a0/`

**If this session also ends before it lands**: do not assume the IDs above
are recoverable. Check first with `TaskOutput` (block: false) and by looking
for the transcript directory; if absent, re-derive ground truth from
`git status`/`git diff` the same way this session did (see above), and treat
this document's description of intent as intent only, not confirmation of
outcome.

Two disjoint-file tracks running as one pipelined workflow, each gated by an
independent 2-reviewer panel (per plan §21.1's required-reviewer-pass
template) before any code is written, then independently re-verified after:

### Track 1 — `gap12-sse-failclosed`

Implements Option C from
[gap12-anonymous-sse-addressing-options](decisions/2026-09-13-gap12-anonymous-sse-addressing-options.md):
fail closed when a merchant has 2+ concurrent pending/processing stoneless
sales, on both `GET /api/merchants/:id/active-transaction` and
`GET /api/merchants/:id/events`, instead of silently routing every anonymous
customer to the newest one (a payment-correctness defect per the memo's
§3.3, not only a confidentiality leak). Does NOT implement payload narrowing
(dropping `itemName` — already found to be a real product regression in a
prior session), and does NOT implement Option A/B (retiring/replacing the
standing address) — that remains separately scheduled.
Expected deliverable: `docs/evidence/remediation-v2-2/r1/R1-T2-gap12-option-c-fail-closed-2026-09-14.md`.

### Track 2 — `gap12-terminal-linkmode`

Per Oliver's approval
([gap12-terminal-linkmode-migration-approval](decisions/2026-09-14-gap12-terminal-linkmode-migration-approval.md)):
migrates `client/src/pages/merchant-terminal.tsx`,
`merchant-terminal-mobile.tsx`, `merchant-terminal-mobile-v2.tsx` to send
`linkMode: "per_payment"` for board-less sales (mirroring
`client/src/desktop/pages/retail-terminal.tsx`'s already-correct pattern),
plus builds the missing per-sale "share this link" UI each of those three
currently lacks (reusing the existing `QRCodeDisplay` component). Client-only;
does not touch any server file or `customer-payment.tsx` (Track 1's territory).
Expected deliverable: `docs/evidence/remediation-v2-2/r1/R1-T2-gap12-terminal-linkmode-migration-2026-09-14.md`.

## What to do once this workflow lands

1. Read each track's actual result via its notification (or
   `<transcriptDir>/journal.jsonl` if missed) — do not trust intent as
   outcome. A track whose review panel did not unanimously approve will
   report `skipped: true` with no code written; that is expected behavior
   (fail closed), not a bug — read why, and decide whether to re-plan or
   escalate to Oliver.
2. Independently re-verify with `git status`/`git diff`, `npm run check`,
   `npm run test:server`, `npx jest --selectProjects client` yourself before
   treating either track as done — exactly as this session did for the gap 11
   handoff before committing it.
3. Commit each track separately if verified (they touch disjoint files, so
   this should be clean either way, and either can land independently of the
   other).
4. Start the uploads full-tenant-auth work (Option C from
   [uploads-tenant-authorization-option-c-disposition](decisions/2026-09-14-uploads-tenant-authorization-option-c-disposition.md))
   — it was deliberately queued behind these two tracks to avoid concurrent
   edits to `server/routes.ts`/`shared/schema.ts`. Track 1 above also touches
   both those files, so wait for Track 1 specifically to be committed before
   starting this, even if Track 2 lands first.
5. Update `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md`'s
   gap-list items 11-13 to reflect whatever actually landed.
6. Delete or archive this file once step 4 has started.
