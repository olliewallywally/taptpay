# Push this branch as a cleaned copy — owner decision

Date: 2026-09-21 UTC, confirmed 2026-09-22 UTC. Owner: Oliver. Execution lineage:
`remediation/r1-continuation-20260907`.

## Instructions, verbatim

2026-09-21 11:36 UTC, interrupting the R1-T4 work:

> "can you quckly stgop save and commit and push all completed commiits"

The unfinished phase A work was saved as a local commit marked do-not-push (`31f0ba1d`). Before
pushing, the agent found that the branch had never been on GitHub and that its history carried
files from `.claude-home/`, the agent's private folder, including backups of its settings file,
which can hold sign-in tokens. It reported "about 1,440 files" GitHub lacked. **Corrected
2026-09-22:** that counted paths missing from `origin/main`'s history. Measured against every
GitHub branch, the push would have uploaded 72 such files and 29 folders, plus
`.claude/settings.local.json`. They include 9 settings-file backups, two versions of
`.credentials.json`, session transcripts and shell snapshots. The rest was already on GitHub,
through `feat/tablet-desktop-app`. The correction does not change the choice. At 11:39 UTC it put
three options:

> 1. **Push a clean copy (my recommendation).** I make a copy of the branch with that folder
>    removed from every past commit and push that. It takes a few minutes; the commit IDs change,
>    but nothing else does.
> 2. **Push as is.** The repository is private, but those files then sit on GitHub.
> 3. **Don't push for now.** Everything stays saved here.

Answer, 11:43 UTC:

> "1"

The session hit its usage limit at 11:46 UTC, after making the copy and before verifying or
pushing it. On 2026-09-22 the copy was re-verified from scratch
([evidence](../evidence/remediation-v2-2/r1/R1-branch-history-clean-2026-09-22.md)) and the owner
was asked "Should I finish yesterday's push now?". Answer:

> "Push, then carry on (Recommended)"

That option read: upload the finished work only, not the half-done sign-in piece; then switch this
folder over to the cleaned copy so the old files can never slip up later (files the same, commit
IDs change, an old→new lookup table added, the original kept as a backup); then resume the
sign-in fix at the login page.

## What this authorizes

- Pushing the finished commits of the cleaned history — through the cleaned `7ba8bc7d`
  (`662371ba`) plus the commit that records this decision — to `origin` as
  `remediation/r1-continuation-20260907`.
- Moving the local branch onto the cleaned history, with the original kept as
  `backup/r1-continuation-20260907-pre-clean`.

## What it does not authorize

- Pushing the unfinished phase A work, or any later commit, without the owner asking.
- Rewriting anything already on GitHub. Purging `.claude-home/` from `origin/main`'s own history
  stays owed before the repository is ever public again (R0 exit record, carried forward).
- Applying a migration, deploying or merging. Each piece still needs plan §21.1's independent
  review before it merges.
