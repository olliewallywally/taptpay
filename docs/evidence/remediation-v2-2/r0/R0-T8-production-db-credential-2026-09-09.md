# R0 — the production database URI and password were public, and no scanner saw it

Date: 2026-09-09 UTC.
Status: **OPEN — the most severe finding in this sequence. Rotate the production database role.**

## The finding

`.claude-home/projects/-home-runner-workspace/1d0c3b2c-a758-49f9-9935-71e531a8ed08.jsonl`
is a Claude Code session transcript. It contains a complete PostgreSQL connection
URI:

```text
postgresql://<12-char user>:<16-char password>@ep-mute-grass-af2foouy.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require
```

That host and database are named **Production** in
[what CI is allowed to migrate](../../../decisions/2026-09-08-ci-migration-target.md).
The password is 16 characters in Neon's generated-role shape (three characters, an
underscore, twelve alphanumerics). It is not placeholder-shaped, and no
placeholder token appears anywhere in the credential.

It was introduced at `f0150cefe599` (2026-06-25), which is reachable from
`origin`, and — unlike every other finding in this sequence — **the blob is in the
tip tree of `origin/main`**. It was not merely in history. It rendered on
github.com for the entire period the repository was public, roughly 2026-05-11 to
2026-09-09.

## No scanner ever flagged it

This blob is **not among the 276 findings** in the recorded history scan, nor the
tree scan. gitleaks' default rule set has no detector for a PostgreSQL connection
URI, so the most valuable credential in the repository was the one nothing looked
for. Classifying only the recorded findings would never have reached it.

This is the strongest argument in the whole exercise against treating a scanner's
output as the boundary of the problem.

## And a review error made it worse

[The 2026-09-09 exposure record](R0-T7-public-exposure-2026-09-09.md) states that
no `postgres://user:password@…` URI exists in `.claude-home` on `main`, and says
it was "specifically checked". It was checked, with a malformed expression: the
pattern `postgres\(ql\)\?://…` was passed to `grep -E`, where escaped parentheses
are **literal characters**, so it searched for the literal text `postgres(ql)?://`
and correctly reported zero matches. The corrected expression returns this file
immediately.

A negative result from a regex nobody re-read was recorded as an assurance. That
record is corrected in place.

## How it got there

Not from a committed configuration file. A Bash diagnostic printed the
environment to the terminal — `DATABASE_URL set in shell: postgresql://…` — and
the session transcript persisted the raw tool result, as transcripts do. The
whole `.claude-home/` directory was then committed.

Two distinct controls are needed and neither is "be careful with secrets":

1. `.claude-home/` must never be tracked. It is ignored now (`.gitignore:14`) and
   was removed at `30f58914`, which does not clear the published blobs.
2. Diagnostics must not echo credential-bearing environment variables, because
   whatever reaches a terminal reaches the transcript.

## Required owner action

1. **Rotate the production Neon database role's password now.** This is a live
   credential for the production database, published for approximately four
   months. It is a rotation an agent must not perform.
2. **Review Neon's connection logs** for that role since 2026-06-25 — connections
   from outside Replit and this workspace's egress in particular.
3. Treat the four-month window as the exposure period regardless of what the logs
   show; a public GitHub repository is continuously harvested.

Note that the corresponding *application* credential path is unaffected by any
`sslmode` question: this is the password itself, not a TLS setting.

## Scope check performed alongside

- The other `origin/main` match for a connection URI,
  `.claude-home/plugins/marketplaces/.../security-auditor.md`, contains **no**
  credential — it is third-party plugin documentation. **False positive.**
- **18 distinct Claude OAuth refresh tokens** are published across
  `.claude-home/.credentials.json`. Every one was compared by digest against the
  current value and **none matches**, so all published Claude tokens are
  superseded. See [OAuth credential exposure](R0-T7-oauth-credential-exposure-2026-09-09.md).
- The Figma MCP OAuth `clientSecret` is identical to the current value in 16 of
  those 18 snapshots. **Still live**, rotation outstanding.
