# R0-T7 — Claude Code's OAuth credential store was committed and public

Date: 2026-09-09 UTC.
Status: **OPEN — one live credential requires rotation.**

The third distinct credential class found while classifying the scanner backlog,
after the [`.env` snapshots](R0-T7-public-exposure-2026-09-09.md) and the
[two Google Cloud service-account keys](R0-T7-gcp-key-exposure-2026-09-09.md).
It was not visible in the earlier passes because it is a `generic-api-key` hit —
one of 234 — and nothing distinguished it from the noise until the findings were
keyed and counted.

## What was committed

`.claude-home/.credentials.json` is Claude Code's own OAuth credential store. It
was tracked in **50 commits, 20 of them reachable from a remote**, from
**2026-06-07 to 2026-08-30**. `30f58914` ("stop tracking local Claude Code state
and credentials", 2026-08-31) removed it going forward and, as ever, left the
prior blobs intact.

Structure only — no value was read out of the file:

| Key | What it is |
| --- | --- |
| `claudeAiOauth.accessToken` | Claude.ai OAuth access token |
| `claudeAiOauth.refreshToken` | Claude.ai OAuth **refresh** token |
| `claudeAiOauth.expiresAt`, `.scopes`, `.subscriptionType`, `.rateLimitTier` | session metadata |
| `mcpOAuth.plugin:figma:…​.accessToken` | Figma MCP connector access token |
| `mcpOAuth.plugin:figma:…​.clientId` | Figma OAuth client identifier |
| `mcpOAuth.plugin:figma:…​.clientSecret` | Figma OAuth **client secret** |

## Liveness

Compared by SHA-256 digest against the current file. Digests were computed, never
printed or recorded here.

| Credential | Verdict |
| --- | --- |
| `claudeAiOauth.refreshToken` | **Rotated since.** Differs from current. |
| `claudeAiOauth.accessToken` | **Rotated since**, and the exposed one expired 2026-08-29. |
| `mcpOAuth…clientSecret` | **STILL LIVE — byte-identical to the current value.** |

Claude Code rotates its own tokens regularly, which is why the Claude half aged
out on its own. The Figma OAuth client secret does not rotate on a schedule and
has not been changed, so the value that sat in a public repository for
approximately three months is the value in use today.

## Required owner action

**Rotate the Figma OAuth client secret**, in the Figma app/connector settings
that issued it, and reconnect the MCP connector afterwards. An agent must not
rotate credentials.

No action is required for the Claude.ai tokens: the exposed pair no longer
authenticates. Revoking active Claude Code sessions is optional belt-and-braces,
not a remediation of this finding.

## Why this class was missed twice

The `.env` pass looked for `.env`-shaped assignments and found the file-history
snapshots. The private-key pass looked for PEM blocks and found the two Google
keys. This file is neither: it is JSON holding OAuth material, and it surfaced
only when every finding was keyed to `(rule, file, commit)` and the counts were
read. It is the clearest argument for the disposition file — 234
`generic-api-key` findings with no structure is precisely where a real credential
hides.

Dispositioned `exposed-unresolved` in `.gitleaks-dispositions.jsonl`, which keeps
the history scan red until the Figma secret is rotated and the entry becomes
`rotated`.
