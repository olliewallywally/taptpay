# Configuration and secret exposure response

R0-H2 is complete by Oliver's [September 7 disposition](../decisions/2026-09-07-R0-H2-owner-rotation-disposition.md):
no secrets currently require rotation. This runbook is for owner-directed future
response and verification; it does not reopen that decision or claim a rotation.

## Local configuration

`.env.example` lists the current `server/config.ts` inputs with **no values**.
It is an inventory, not a runnable default. Copy to an ignored `.env.local` on
your own workstation, fill required values privately and remove unused optional
keys. Blank booleans fail validation; absent capability flags default false.
Use `APP_ENV=development`, `DATABASE_TARGET=local`, `PAYMENT_MODE=disabled` and
`ENV_VALIDATION_MODE=audit` for isolated development, with an independently chosen
local JWT secret. Never use production database/provider inputs locally.

Node 22 can load this file explicitly before application imports:

```bash
node --env-file=.env.local --import=tsx server/index.ts
```

The existing npm dev command does not itself load dotenv. Do not assume Vite's
client environment loading populates the server. No secret belongs in a `VITE_`
variable. VAPID's public key is obtained through the existing server endpoint.
Environment files are not read, printed or populated by the agent.

## Scan and disposition

Use Gitleaks **8.30.1** (release checksum pinned in
`.github/workflows/secret-scan.yml`). The wrapper follows the upstream
[CLI and custom report contract](https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md).

```bash
node scripts/scan-secrets.mjs tree
node scripts/scan-secrets.mjs history
```

For a binary installed outside PATH, set `GITLEAKS_BIN` to its path. Exit 0 means
no findings for that scope, 1 requires review, and 2 means the scan failed.
The tree mode scans tracked current files and nonignored untracked files; it
does not scan ignored local backups or environment files. Already tracked files
remain in scope even if later ignored. History scans all locally available refs
and refuses a shallow checkout; it does not fetch missing refs. Neither mode is
a malware, binary-document/PII or complete encoded-secret audit.

Output contains only rule, file, commit and status plus aggregate counts. Native
scanner diagnostics, source snippets, author identities and matched values are
discarded. Temporary reports contain the same metadata only, and are deleted.
Source is read through temporary links without copying files. No scan artifacts
are uploaded by CI. The upstream default rules/allowlists are retained; there
is one **reviewed evidence exception** for enumerated Git commit identifiers,
restricted to one rule and two evidence path suffixes with AND semantics; see
[review and negative tests](../evidence/remediation-v2-2/r0/R0-T7-review-followup-2026-09-08.md).
Inline suppression is disabled and
ambient scanner settings cannot override the pinned config.

Do not baseline or suppress findings to get a green check. An incident owner
reviews each rule/file/commit in a private trusted environment, records real
exposure versus synthetic/false positive, and approves any narrowly scoped
exception separately. New verified exposure returns to H1/H4 and the owner for
disposition. CI stays failed while findings remain unapproved. History rewriting,
retained data deletion, scanning ignored dumps and provider log access require
their own explicit owner direction.

## Owner-controlled rotation sequence

1. Record incident owner, exposure window, repository visibility, deployed
   revisions and access scope. Preserve metadata-only evidence; keep payment
   initiation disabled. Review access logs for unusual auth/admin, cross-tenant,
   simulator, clearing, refund and API-key activity.
2. Confirm the tracked configuration scrub and VAPID recovery code are deployed
   safely. Inventory JWT, independent payment-return state, admin, VAPID, database,
   Windcave, OAuth, API/webhook and scheduler credentials by **key name only**.
3. The owner generates independent replacements through a password manager or
   trusted offline hidden-input tool and enters them directly into the owning
   provider console/deployment secret store. Never use recorded terminals,
   command arguments, agent output, screenshots or commit messages for values.
4. JWT: invalidate old sessions; do not keep a compromised key as a grace
   verifier. Admin: replace the password/hash through a hidden-input flow and
   verify old authentication fails. Payment-return state must remain independent
   from JWT; use the incident's in-flight reconciliation policy.
5. VAPID: replace the pair together. On a real subscribed device verify automatic
   subscription replacement, one received test push and stale endpoint pruning.
   A unit test alone does not close this check.
6. Windcave: only the owner changes platform credentials. Confirm old credentials
   are rejected and the intended environment/account authenticates with the new
   pair through the approved provider path. Preserve reconciliation for legitimate
   in-flight attempts; do not enable new payments as a rotation test. Apply the
   equivalent revocation/verification to other inventoried providers.
7. Record key name, time and verification status only. Confirm a new legitimate
   login works, revoked credentials fail, and boot uses no tracked secrets.
   Review supplemental history findings, access evidence and retained uploads/
   backups separately. Only the incident owner closes the incident.

Rollback is a safe code rollback or forward correction with initiation disabled.
Never restore compromised credentials, fake success, automatic dumps or deleted
financial data. Actual restore acceptance remains in the
[encrypted-backup runbook](encrypted-backup.md).
