# This branch's history, cleaned of `.claude-home/` before its first push (2026-09-22)

Decision: [2026-09-22-push-cleaned-branch-history](../../../decisions/2026-09-22-push-cleaned-branch-history.md).
Lookup table, every rewritten commit: [commit map](R1-branch-history-clean-2026-09-22-commit-map.tsv)
(`original⇥cleaned⇥subject`, 174 rows).

## Why

`remediation/r1-continuation-20260907` had never been pushed. Its 174 commits not on GitHub
run from `83014135` through the WIP `31f0ba1d`; the parent of `83014135` is `151bbf02`, which is
`origin/feat/tablet-desktop-app`. A push of the finished tip `7ba8bc7d` would have sent 2,247
objects (`git rev-list --objects 7ba8bc7d --not --remotes=origin`). **101** of them were under
`.claude-home/`: 72 files and 29 folders across 90 paths. The files include 9 `.claude.json`
backups, two versions of `.credentials.json`, 26 files under `projects/` (session transcripts and
tool results), 8 shell snapshots, 8 session records, `history.jsonl` and `settings.json`. The
push would also have sent `.claude/settings.local.json`. The branch tip tracked none of them; the
problem was history only.

The 2026-09-21 pass reported "about 1,440 files" (1,442). That was the number of distinct
`.claude-home/` paths in the branch's history that `origin/main`'s history lacks. Most of their
content was already on GitHub: `151bbf02` alone tracks 2,376 `.claude-home/` files. The
object-level figure above is the one that describes the upload.

## How (2026-09-21, 11:44 UTC)

Backup branch `backup/r1-continuation-20260907-pre-clean` = `31f0ba1d`. In a separate worktree
(filter-branch refuses a tree with the unrelated `.replit` change):

```
git filter-branch -f --index-filter \
  'git rm -r --cached --ignore-unmatch -q .claude-home .claude/settings.local.json' \
  --prune-empty -- r1-clean-tmp --not --remotes=origin
```

The session hit its usage limit during verification. Its last check printed "2377 excluded paths
left", which was never interpreted. Everything below was re-run from scratch on 2026-09-22.

## Verification (2026-09-22)

1. **GitHub, read live with `gh api`:** repository private; last push 2026-08-26; this branch
   absent; all 15 branch heads equal the local `origin/*` refs (fetched 2026-09-03). So
   `--not --remotes=origin` matches what GitHub advertises.
2. **Commit by commit:** 173 of 174 originals pair with a rewritten commit carrying identical
   author, committer, both dates and message; `git diff --name-only` for every pair lists only
   `.claude-home/` or `.claude/settings.local.json` paths; every rewritten commit's parent is the
   rewritten twin of its original's parent. No merges. The one dropped commit, `a765882f`
   ("Published your App", Replit Agent, 2026-09-02), touched only `.claude-home/`.
3. **The 2377:** `git log --name-status` over the range shows 2,377 entries, all `D`, all in
   `392db3a0` (the rewrite of `83014135`). They are exactly what its parent `151bbf02` tracks
   there: 2,376 `.claude-home/` files plus `.claude/settings.local.json`. A deletion sends no
   content. `--name-only` lists deletions too, which is why the check alarmed.
4. **What a push of the finished tip (`662371ba`) would send:**
   `git rev-list --objects 662371ba --not --remotes=origin` lists 2,140 objects, 1,042 of them
   blobs. **0** paths under `.claude-home/`, **0** `.claude/settings.local.json`.
5. **Secret scan of those 1,042 blobs** (GitHub tokens, AWS keys, private-key headers,
   `sk_live_`/`rk_live_`, Slack, Anthropic and Google API keys, and database URLs with an unmasked
   password): 15 hits, all database URLs in test fixtures: `migrator@127.0.0.1` (CI's throwaway
   convergence database, `verify.yml`), `app:secret@db.internal`, `fixture@localhost` and
   `fixture:secret@example.invalid` (`scripts/schema-fingerprint.test.mjs`,
   `scripts/db-backup-safety.test.mjs`). The `sk_live_` strings found before the rewrite are in
   `attached_assets/APIManagement_1763168150568.tsx`, already on `origin/main`, not in this push.
6. **Content:** the cleaned `7ba8bc7d` (`662371ba`) and the cleaned WIP (`f650590f`) have trees
   byte-identical to their originals.

## Commit IDs the ledger and evidence cite most

Every ID in this program's documents written before 2026-09-22 refers to the original history,
still reachable locally through the backup branch. On GitHub, use the cleaned twin:

| original | cleaned | what |
|---|---|---|
| `94f24635` | `23b5a8eb` | gap 13, tenant-scoped uploads (0023) |
| `b0da2f08` | `dd245d53` | gap 13 S1, admin opens invoice documents |
| `acef4e42` | `4779ace9` | gap 13 review brief (base of its review range) |
| `8d271733` | `25717adc` | gap 13 review fixes |
| `e268d91e` | `77b0ae72` | gap 13, ownership-inventory gate |
| `165fd605` | `19e79892` | harness never reaches a live email/SMS provider |
| `d0e99c23` | `251488e3` | gap 13, document budget counts real invoices |
| `60a2ca0b` | `aac667ad` | gap 13, automatic ownership |
| `a25aaf09` | `9ee57916` | gap 13, drafting tool fix |
| `4a9129df` | `18605661` | gap 13 re-verification + refreshed brief |
| `7822b19a` | `4fe793c4` | R0 exit established |
| `c6667985` | `e3390394` | act() attribution correction (base of R1-T8's review range) |
| `387d189d` | `53f5a8b9` | R1-T8 hook-order fix |
| `20bea52b` | `55a10f4d` | R1-T8 evidence |
| `d7edd749` | `c37f1602` | R1-T8 review brief |
| `2c013f33` | `025d638d` | R1-T9 pilot |
| `107d1264` | `0f9d4160` | R1-T9 proposal docs |
| `eba45c5e` | `0c0323c0` | R1-T4 plan |
| `8f574dc9` | `ed847cda` | R1-T4/R1-T9 owner answers |
| `7ba8bc7d` | `662371ba` | R1-T4 schema 0026–0028 (last finished commit pushed) |
| `31f0ba1d` | `f650590f` | R1-T4 phase A WIP (local only; re-parented onto the docs commit) |

Review ranges translate the same way, e.g. gap 13's `acef4e42..` becomes `4779ace9..`, and R1-T8's
`c6667985..387d189d` becomes `e3390394..53f5a8b9`.

## Left behind, deliberately

- `backup/r1-continuation-20260907-pre-clean` keeps the original history, local only.
- `stash@{0}` (2026-09-13) is based on the original `8837b2ee` (cleaned: `1b371485`). It still
  applies; its base is kept alive by the backup branch.
- Other local branches (`feat/mobile-quote-steps` among them) were not rewritten.
