# R0-T7 — public repository exposure of local agent state

Date: 2026-09-09 UTC.
Branch: `remediation/r1-continuation-20260907` at `29f6b3d9`.
Status: **OPEN — owner action required.** Nothing here is remediated by this record.

Discovered while checking what pushing this branch would publish, which is a
check that should have run before the branch was ever created. It did not, and
the finding is older and larger than the push.

## The finding

`olliewallywally/taptpay` is a **public** repository. `.claude-home/` — Claude
Code's local session, plugin and file-history state — is present in the **current
tree** of `origin/main` and of nine other remote branches. Not only in history:
`git ls-tree -r origin/main` lists them, so they render on github.com today.

| Remote ref | `.claude-home` files in tip tree |
| --- | ---: |
| `origin/main` (and `origin/HEAD`) | 1441 |
| `feat/tablet-desktop-app` | 2376 |
| `feat/property-dashboard-redesign` | 2272 |
| `feat/trades-phase3c-cross-cutting` | 1441 |
| `claude/install-frontend-design-skills-h98zqx` | 1441 |
| `feat/trades-phase1-foundation`, `-phase2-nav`, `-phase3a-terminal`, `-phase3b-quotes`, `-phase4-delivery-payments`, `fix/trades-token-empty-result` | 808 each |

`.claude-home/` is ignored **now** (`.gitignore:14`) and is untracked at this
branch's HEAD; `30f58914` ("stop tracking local Claude Code state and
credentials") stopped the bleeding on this lineage only. Ignoring a path never
removes it from a tree that already contains it, and `main` was never corrected.

## What is exposed

Seven files on `origin/main` carry secret-shaped assignments. Four are Claude
Code file-history snapshots of a real `.env` — the same file captured in two
sessions at two versions:

```text
.claude-home/file-history/826740c4-…/6f8fb2802d164473@v1
.claude-home/file-history/826740c4-…/6f8fb2802d164473@v2
.claude-home/file-history/94da0d14-…/6f8fb2802d164473@v1
.claude-home/file-history/94da0d14-…/6f8fb2802d164473@v2
```

The remaining three are session transcripts under
`.claude-home/projects/-home-runner-workspace/*.jsonl`.

The snapshot holds twelve assignments: `JWT_SECRET`, `VAPID_PRIVATE_KEY`,
`VAPID_PUBLIC_KEY`, `VITE_VAPID_PUBLIC_KEY`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD_HASH`, `WINDCAVE_USERNAME`, `WINDCAVE_ENDPOINT`,
`WINDCAVE_GOOGLE_PAY_MERCHANT_ID`, `PRODUCTION_DOMAIN`,
`GOOGLE_ANALYTICS_PROPERTY_ID`, `VITE_GA4_MEASUREMENT_ID`.

Per rule 4, no value appears here. Shape only, because shape is what decides
severity:

| Key | Shape | Disposition |
| --- | --- | --- |
| `JWT_SECRET` | 128 chars, high entropy | **Liveness unconfirmed — highest priority.** Not exposed to the agent's environment, so no comparison was possible. A second 35-char value also appears in a transcript. |
| `VAPID_PRIVATE_KEY` | 43 chars (P-256) | **Already rotated.** Differs from the current environment value. Consistent with R0-T3. |
| `ADMIN_PASSWORD_HASH` | 60 chars, bcrypt-shaped | Exposed. A hash, but publicly crackable offline. |
| `ADMIN_EMAIL` | 36 chars | Exposed. |
| `WINDCAVE_USERNAME` | two values, 9 and 12 chars | Exposed. |

Deliberately checked and **not** found anywhere in `.claude-home` on `main`:

- no `postgres://user:password@…` connection URI,
- no `-----BEGIN … PRIVATE KEY-----` PEM block,
- no `WINDCAVE_API_KEY` carrying a value.

So neither database credentials nor the Windcave API key are in this exposure.
That bounds it materially.

Separately, `attached_assets/Pasted--type-service-account-project-id-swift-cursor-492707-t7_1775633514319.txt`
is **tracked** and on `main`. It is a Google service-account document carrying a
real `project_id`, `private_key_id` and `client_email`, but its `private_key`
field is **empty** — no key material. Identifier disclosure, not a usable
credential.

## Method

Read-only, on already-committed objects. No value was printed, copied, or sent
anywhere. Liveness was tested by comparing SHA-256 digests of the committed
value against the current environment; digests are omitted here for the same
reason the values are.

## Relationship to the recorded scans

[`R0-T7-history-scan-2026-09-08.jsonl`](R0-T7-history-scan-2026-09-08.jsonl)
holds 277 findings across 74 commits and
[`R0-T7-tree-scan-2026-09-08.jsonl`](R0-T7-tree-scan-2026-09-08.jsonl) holds 10.
**All 287 are `review-required`.** The scanners found this in substance on
2026-09-08; nothing classified them, so no one established that `main` was
publicly serving the hits.

Of the 74 commits, 41 are already reachable from a remote ref and 33 are not.
The unpushed 33 carry 141 findings — 122 `generic-api-key`, 7
`sourcegraph-access-token`, 5 `jwt`, 4 `private-key`, 2 `curl-auth-header`, 1
`slack-webhook-url` — and add 108 further session transcripts. **This branch was
therefore not pushed.**

## Required owner actions

1. **Determine whether `JWT_SECRET` is still live, and rotate it if so.** It
   signs merchant sessions; a public signing key forges any session. An agent
   must not rotate secrets.
2. **Make the repository private.** At discovery: 0 forks, 0 stars, created
   2026-05-11, last remote push 2026-08-26 — so containment is clean and no fork
   network splits off. This does not undo prior public availability.
3. **Rotate `ADMIN_PASSWORD_HASH`'s underlying password.**
4. **Decide the history disposition.** Purging `.claude-home/**` from all refs
   rewrites history, which the plan forbids without explicit owner direction.
   Rotation without purging is a legitimate choice; leaving both undone is not.
5. **Classify the 287 scanner findings.** They are the reason this was not
   caught, and they remain unclassified.

## Consequences for other records

R0-H2 was closed on 2026-09-07 as "no secrets currently require rotation". That
disposition was made without this fact and is reopened —
[2026-09-09 R0-H2 reopened](../../../decisions/2026-09-09-R0-H2-reopened-public-env-exposure.md).
R0-H4 (access-log and history review) is directly implicated: the exposure
window runs from each commit's date to the visibility change.

Rollback: none applicable. This record adds no code and changes no behaviour.
