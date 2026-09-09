# Dispositioning secret-scan findings

`scripts/scan-secrets.mjs` reports what a scanner found. It cannot know whether a
match is a real credential, and it must never be taught to guess. This documents
how a human answers that question once, in a reviewed record, so the answer
survives and the next scan is about what is *new*.

It is the companion to [rotating a leaked secret](secret-rotation.md). This file
covers deciding what a finding *is*; that one covers what to do when it is real.

## Why a disposition file and not an allowlist

`.gitleaks.toml` already carries narrow allowlists, and they remain the right tool
for a **pattern** that is structurally not a secret — the reviewed exception there
matches Git object IDs in evidence files. An allowlist teaches the scanner to stop
matching.

A disposition is the opposite: the scanner was right to match, and a human has
ruled on that specific occurrence. Occurrences are what history is made of, so
dispositions key on the exact triple the scanner emits.

The practical difference: an allowlist is forward-looking and applies to text not
yet written; a disposition applies to one object that already exists and can
never apply to anything else.

## The file

`.gitleaks-dispositions.jsonl` at the repository root, one JSON object per line.
Blank lines and `#` comments are allowed.

```json
{"rule":"private-key","file":"path/to/file","commit":"<40-hex>","disposition":"false-positive","reason":"why, in a sentence","reviewed":"2026-09-09"}
```

Every field is required and is a string. `commit` must be a full 40-character
object ID. `reviewed` must be `YYYY-MM-DD`. `reason` must be non-empty. No field
may contain `*`, `?`, `[` or `]`, and a duplicate triple is refused — if two
reviews disagree, the file must not hide which one applies.

**A disposition never contains a secret value.** It records rule, path, commit and
a human sentence. That is the same discipline the scanner itself follows.

## The two kinds

**Clearing** — the finding cannot be used against us, so it stops failing the scan:

| Disposition | Means |
| --- | --- |
| `false-positive` | Not a credential. A detection pattern, a documentation example, a placeholder, a fixture. |
| `third-party-fixture` | Vendored third-party content whose sample credentials are not ours. |
| `rotated` | It *was* a real credential of ours. It has been revoked or rotated and no longer authenticates. |

**Recording** — the finding is real and unresolved, so it keeps failing:

| Disposition | Means |
| --- | --- |
| `exposed-unresolved` | A live credential is in history and has not been revoked. Recorded so it is named and tracked, **not** so it stops failing. |

That last row is the point of the design. A known leak nobody has revoked is not
a passing state, and a mechanism that let it go green would be a worse version of
the 287 unread `review-required` rows it replaces. The scan turns green when the
credential is dead, or when the object is gone — not when someone files it.

## Reviewing a finding

1. `git show <commit>:<path>` and read the match in context. **Do not read `HEAD`
   and infer.** A file scrubbed later still carries the credential in the commit
   the scanner named; that mistake was made once here already.
2. Decide whether the matched text is a credential at all.
3. If it is, establish whether it is still valid — compare a digest against the
   current environment, never the values themselves.
4. If it is live, rotate first and disposition `rotated` afterwards. Filing
   `exposed-unresolved` is for recording work in flight, not for closing it.
5. Add the line, with a reason a stranger could act on.

## Reading the output

Each finding is emitted as `status: "dispositioned"` or `status: "review-required"`,
carrying its `disposition` when one applies. The final row summarises:

```json
{"status":"review-required","mode":"history","findings":285,"dispositioned":270,"unresolved":15}
```

The command exits non-zero when `unresolved` is above zero — not when `findings`
is. A repository with a long, fully-reviewed history passes.

## What this does not do

It does not remove anything from history. Purging objects rewrites history and is
an owner decision, taken separately. Until then a disposition is a record of a
judgement, not a remedy — and for `exposed-unresolved`, deliberately not even a
silencer.
