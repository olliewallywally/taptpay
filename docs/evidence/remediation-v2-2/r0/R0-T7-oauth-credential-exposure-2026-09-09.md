# R0-T7 — Claude Code's OAuth credential store was committed and public

Date: 2026-09-09 UTC.
Status: **OPEN — our copy is deleted; the credential is still live at Figma.**
Updated 2026-09-10: see [the deletion](#2026-09-10--deleted-not-rotated) at the end.

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

**Delete the Figma OAuth app** in Figma's developer settings — see the 2026-09-10
update below, which supersedes the original "rotate and reconnect" advice.

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


## 2026-09-10 — deleted, not rotated

The owner's decision: *"just straight up delete figma key its pointless and
unused."* The evidence supports "unused" — the connector's `accessToken` was an
**empty string**, so it had never completed an authorisation. Nothing in this
repository uses the Figma connector.

**Done:** the `mcpOAuth."plugin:figma:…"` entry was removed from
`.claude-home/.credentials.json`. That object is now gone entirely — the file
holds only `claudeAiOauth` — and the workspace retains no full copy of the
value. The remaining `clientSecret` matches in `.claude-home/` are session
transcripts holding this document's own text, unrelated `GOOGLE_CLIENT_SECRET`
env-var *names* in source, and one deliberate `len=40 prefix='kKdd…'` redaction
from the original investigation. A four-character prefix is not a credential.
The file is untracked and `.claude-home/` is ignored (`.gitignore:14`), so no
new commit can carry it.

**Not done, and it is the part that matters:**

> Deleting our copy does not revoke the secret. A Figma OAuth client secret is
> issued by an app registered at **figma.com/developers/apps**. That app still
> exists and still accepts that secret. The value sat in a public repository for
> roughly three months, so it must be assumed taken — and it will keep
> authenticating until the app itself is deleted.

One owner action closes this: open figma.com/developers/apps, find the app whose
client ID ends in the identifier recorded against `plugin:figma:figma|d39d3b62…`,
and **delete the app**. No reconnect is needed, because nothing uses it.

The disposition therefore stays `exposed-unresolved` on all 50 entries, per the
runbook's own rule — `rotated` means the credential no longer authenticates, and
this one still does. The reason field now records the deletion and what remains.
Flip those entries to `rotated` once the Figma app is gone.
