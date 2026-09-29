# R0-T7 — the scanner backlog is classified

Date: 2026-09-09 UTC.
Branch: `remediation/r1-continuation-20260907`.
Status: **Classification complete. R0-T7's remaining exit criteria are not all met — see the end.**

The gap this closes was recorded as "Scanner findings remain unclassified" and was
not treated as blocking. Inside those unread findings were a public `.env`
snapshot, two live Google Cloud service-account keys, a live Figma OAuth client
secret, and — found only by going past the findings — the production database
password.

## Final state

```text
{"status":"review-required","mode":"history","findings":4852,"dispositioned":4564,"unresolved":288}
{"status":"clean","mode":"tree","findings":0,"dispositioned":0,"unresolved":0}
```

| | |
| --- | --- |
| Distinct `(rule, file, commit)` triples | 283 |
| Unreviewed | **0** |
| Rows cleared | 4564 of 4852 |
| Rows kept red (`exposed-unresolved`) | 288 |
| Tree gate | clean, exit 0 |

Dispositions: 54 `false-positive`, 90 `third-party-fixture`, 139
`exposed-unresolved`. The history scan exits non-zero, correctly: 139 triples are
real credentials that have not been rotated. It turns green when they are, not
when someone files them.

## What the classification found

Four credential classes, each recorded separately:

1. [`.env` snapshots and the public repository](R0-T7-public-exposure-2026-09-09.md)
   — `JWT_SECRET`, `ADMIN_PASSWORD_HASH`, `VAPID_PRIVATE_KEY` (since rotated).
2. [Two Google Cloud service-account private keys](R0-T7-gcp-key-exposure-2026-09-09.md)
   — full RSA bodies, public for roughly four months. **Revocation outstanding.**
3. [Claude Code's OAuth store](R0-T7-oauth-credential-exposure-2026-09-09.md) —
   Claude tokens verified rotated across all 18 published snapshots; the **Figma
   OAuth client secret is still live**. Rotation outstanding.
4. [The production database credential](R0-T8-production-db-credential-2026-09-09.md)
   — in `origin/main`'s **tip tree**, and **not among the findings at all**.
   Rotation outstanding.

The false positives were, in bulk: 40-hex Git object IDs read as Sourcegraph
tokens; Anthropic's own plugin cache; vendored third-party documentation with
deliberately-bad examples; mock display data; and offline test fixtures.

## What the exercise actually demonstrated

**The scanner's output was not the boundary of the problem.** The most valuable
credential in the repository — the production database password — was never
flagged, because gitleaks ships no connection-URI detector. It was found by
sweeping the blobs rather than the findings. A `connection-uri-password` rule now
exists, deliberately unanchored, because the real leak read
`...set in shell: YESpostgresql://` and a `\b` matched nothing there.

**A review that reads `HEAD` proves nothing about a commit.** The `swift-cursor`
service-account file has an empty `private_key` in the tree and a full one at
`dacd826ff`. That error was made and corrected here.

**A negative result is only as good as the expression that produced it.** The
claim that no database URI existed was produced by `postgres\(ql\)\?://` passed
to `grep -E`, where escaped parentheses are literal. It searched for text that
never existed and truthfully reported zero.

**The prevention control is not "don't print secrets".** One class arrived
through a terminal echo, one through Claude Code's automatic pre-edit snapshots,
and one — `.credentials.json` — was never printed by anything; it was published
because the whole state directory was committed. The control is: never track
`.claude-home/`.

## Still open for R0-T7

- **Four rotations, all owner-only**: the production database role, the Figma
  OAuth client secret, and the two Google Cloud keys. `JWT_SECRET` remains
  owner-dispositioned as not requiring rotation; its liveness was never
  established.
- **History disposition.** 139 triples are real credentials in reachable objects.
  Rotation resolves the credential; only a purge or the objects' expiry resolves
  the exposure, and a purge rewrites history — an owner decision, not taken.
- **The stale-branch reduction.** `origin/claude/install-frontend-design-skills-h98zqx`
  is unmerged and solely carries 14,335 vendored files plus 1,441 `.claude-home`
  files. Deleting it removes a large share of the surface with no history
  rewrite. Not done: deleting a remote branch is destructive and needs the owner.
- R0-T7's other exit criteria (`.env.example` completeness, the rotation runbook)
  are recorded elsewhere and are not re-proved here.

Verification: pinned gitleaks 8.30.1 with the release checksum verified;
`scan-secrets` 11/11, `config-hygiene` 3/3. The final disposition file was
regenerated from the authoritative scan and re-checked through the scanner's own
`loadDispositions`, giving 0 unreviewed.
