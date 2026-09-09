# R0-H2 — reopened by public `.env` exposure

Date: 2026-09-09 UTC.
Status: **R0-H2 reopened. Owner action required.**
Supersedes: [2026-09-07 owner rotation disposition](2026-09-07-R0-H2-owner-rotation-disposition.md).

## What changed

R0-H2 was closed on 2026-09-07 by Oliver's direction — "there arent any secrets
to rotate right now so mark as complete". That disposition is not withdrawn as a
judgement; it is superseded by a fact that was not available when it was made.

On 2026-09-09 the repository was found to be **public**, with Claude Code's local
state directory `.claude-home/` present in the current tree of `origin/main` and
nine other remote branches. Four of those files are file-history snapshots of a
real `.env`. Full detail, with shapes rather than values, in
[R0-T7 public repository exposure](../evidence/remediation-v2-2/r0/R0-T7-public-exposure-2026-09-09.md).

There were secrets to rotate. They were published, not pending.

## Disposition

R0-H2 returns to **OPEN**. Specifically:

- `JWT_SECRET` — **liveness unconfirmed, rotate unless proven already rotated.**
  The agent has no access to it and could not compare it. This is the item that
  matters: it signs merchant sessions.
- `ADMIN_PASSWORD_HASH` — exposed bcrypt hash; rotate the underlying password.
- `ADMIN_EMAIL`, `WINDCAVE_USERNAME` — exposed identifiers; no rotation path,
  note in the incident record.
- `VAPID_PRIVATE_KEY` — **already rotated**, verified by digest comparison
  against the current environment. No further action.
- Database URIs and `WINDCAVE_API_KEY` — **not present** in the exposed files.
  Specifically checked. No rotation indicated on this evidence.

No credential was generated, read, printed, rotated or tested by the agent, and
none will be: rotating secrets and altering Replit Secrets are on the
agent-never list. This records what must be rotated and by whom, not a
performed rotation.

## Knock-on

- **R0-H3** (deploy and verify the rotation took) cannot be represented as
  performed and now has real work behind it.
- **R0-H4** (access-log and history review) is directly implicated. The exposure
  window opens at each commit's date and closes when the repository becomes
  private; access-log review should cover that window.
- **R0-H1** (declare and inventory) should record this as an incident.
- The 287 `review-required` scanner findings that would have surfaced this
  remain unclassified. Closing R0-T7 without classifying them repeats the
  failure that produced this record.

## Why this was missed

The scanners worked. `R0-T7-history-scan-2026-09-08.jsonl` and
`R0-T7-tree-scan-2026-09-08.jsonl` recorded the hits on 2026-09-08. Every one was
left `review-required`, and the continuation tracker noted "Scanner findings
remain unclassified" without treating that as blocking. A finding nobody reads is
indistinguishable from a scan nobody ran.
