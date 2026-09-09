# R0-T7 — two Google Cloud service-account private keys were publicly exposed

Date: 2026-09-09 UTC.
Status: **OPEN — revocation required. Supersedes the same-day "nothing to rotate" disposition for these two credentials only.**

Found while classifying the 287 `review-required` scanner findings
([public repository exposure](R0-T7-public-exposure-2026-09-09.md)). This is a
different and more serious class than the `.env` snapshots: complete asymmetric
private keys, in `origin`'s history, on a repository that was public.

## The two keys

Both are Google Cloud service accounts named `taptpay-analytics`, in two
different projects. Both blobs contain a full PEM `PRIVATE KEY` body (~1678
base64 characters — RSA 2048), not a placeholder or a truncated field.

| | Key A | Key B |
| --- | --- | --- |
| Project | `upbeat-nation-489422-u4` | `swift-cursor-492707-t7` |
| Service account | `taptpay-analytics@upbeat-nation-489422-u4.iam.gserviceaccount.com` | `taptpay-analytics@swift-cursor-492707-t7.iam.gserviceaccount.com` |
| `private_key_id` | `7b85d31e7946da519755cc6b2519df69ccdeed1b` | `74e40c04f2725e9f4d301e8bc3131a945f95a4ae` |
| File | `attached_assets/upbeat-nation-489422-u4-7b85d31e7946_1772836166020.json` | `attached_assets/Pasted--type-service-account-project-id-swift-cursor-492707-t7_1775633514319.txt` |
| Authored | 2026-03-06 | 2026-04-08 |
| Public via | `7d5cf6fe1` (main history), `1bb512b16` (`origin/replit-agent`) | `dacd826ff` (main history), `6ccffecc2` (`origin/replit-agent`) |

Both are additionally reachable from `origin/claude/install-frontend-design-skills-h98zqx`,
`origin/claude/optimistic-turing-aldQP` and `origin/claude/pensive-babbage-pt12n6`.

**Exposure window:** the repository was created 2026-05-11 and made private
2026-09-09, so public availability is bounded at roughly four months. The commit
dates are earlier because the commits were authored locally before the push.

The other remotes carry the same history but are not public: `gitsafe-backup`
(`git://gitsafe:5418/backup.git`) and `subrepl-korgy55r` are Replit-internal
hosts, not GitHub.

## Correction to the earlier record

[The 2026-09-09 exposure record](R0-T7-public-exposure-2026-09-09.md) states that
the `swift-cursor` file's `private_key` field is empty and calls it "identifier
disclosure, not a usable credential". That is true of the file **as it stands in
the current tree** — the field was blanked later — and false of its **history**.
Commits `dacd826ff` and `6ccffecc2` carry the full key. The earlier record's
conclusion was drawn from the tip blob alone and is corrected here.

The lesson generalises: for this class, a clean tree proves nothing. `git show`
each flagged commit, not just `HEAD`.

## What is not affected

- The two real `PRIVATE KEY` bodies inside
  `.claude-home/projects/…/7e19adf9-….jsonl` (commits `243b9b7e5`, `496415139`)
  are **not reachable from any remote**. They never left this workspace, and are
  a further reason the branch was not pushed.
- `.config/replit/.semgrep/semgrep_rules.json` (`168806756`, `42d5fa154`) matches
  the `private-key` rule but contains **no PEM block** — these are Semgrep's own
  detection patterns. **False positive**, dispositioned.

## Required owner actions

An agent must not touch these; all four are console/CLI actions for the owner.

1. **Delete key `7b85d31e7946…`** from `taptpay-analytics@upbeat-nation-489422-u4`.
2. **Delete key `74e40c04f272…`** from `taptpay-analytics@swift-cursor-492707-t7`.
3. **Review the IAM roles** granted to both service accounts. The name suggests
   Analytics read access, consistent with `GOOGLE_ANALYTICS_PROPERTY_ID` in the
   exposed `.env`, but the roles are what bound the impact and they have not been
   established here.
4. **Review GCP audit logs** for authentications by either service account since
   2026-05-11, from unfamiliar IPs or user agents.

Making the repository private stops further discovery. It does not undo four
months of public availability, and public GitHub content is continuously
harvested, so both keys should be treated as compromised regardless of whether
the logs show use.

## Method

Read-only inspection of committed objects. Key bodies were measured, never
printed, copied or transmitted. `private_key_id`, `client_email` and `project_id`
are recorded deliberately: they are identifiers rather than secrets, and the
owner needs them to find the right key in the console.
