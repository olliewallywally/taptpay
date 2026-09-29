# TaptPay Remediation v2.1 Handoff

Date: 2026-08-23
Status: saved for later; do not implement until the remaining blockers below are patched.

## Context

This note preserves the current remediation-plan review state from the v2 -> v2.1 review cycle. It is a planning handoff only.

The active repo rules still apply:

- Read `CLAUDE.md` and `AGENTS.md` before changing code.
- Do not use `git add -A`.
- Exclude `.claude-home/**` and `.claude/settings.local.json` from commits.
- The active tablet/desktop merchant app work and its acceptance rules remain a regression boundary.

## Locked Decisions

- D1 Prod data: assume live production merchants/payment records until proven otherwise.
- D2 Stripe schema: historical-but-kept; no drops without dead-proof and reviewed migration.
- D3 Host/DB: Replit + Neon for remediation.
- D4 Windcave credentials: current short-term runtime model is platform-owned env credentials, `WINDCAVE_USERNAME` and `WINDCAVE_API_KEY`. Per-merchant credential resolution is deferred unless explicitly approved.
- D5 Crypto: off behind kill switch.
- D6 Go-live: beta merchants on sandbox first; real processing only after all gates.
- D7 Branch: remediation branch cut from the active tablet/desktop branch.
- D8 Bank data: encrypt-and-keep interim; product/legal decision remains provisional.

## v2.1 Review Result

Recommendation: approve with changes.

v2.1 fixed the material v2 blockers:

- Phase -1 now includes the repo Step 0 migration prerequisite.
- Windcave credentials now match current runtime reality: platform-owned env vars.
- `FEATURE_LIVE_WINDCAVE` is fail-closed for staging/new deploys.
- Windcave notification integrity now defaults to query-session plus field matching, not assumed webhook signatures.
- Encryption now has a versioned dual-read/backfill plan.

## Remaining Blocking Patches

Patch these into the plan before implementation:

1. Clarify that Phase -1.0 pending-migration application is for dev/local reconciliation only. Production migrations must wait for backup, restore test, rehearsal, and deploy sequencing.
2. Add key-rotation support to the encryption format before implementation. Prefer a format like `enc:v1:k1:<base64(iv)>:<base64(tag)>:<base64(cipher)>` so future rows can identify the decryption key.

## Remaining High-Risk Details

Resolve these while patching the final implementation plan:

- Define exact production semantics for missing `FEATURE_LIVE_WINDCAVE`.
- Do not churn Windcave body parsing unless the active provider mode needs raw bytes.
- Feature-flag tests must prove no DB mutation, no Windcave call, and no success SSE event when a money-moving feature is disabled.
- Encryption backfill needs a dry-run report: plaintext rows, encrypted rows, invalid ciphertext rows, and failed decryptions.
- Windcave domain checks must validate both configured endpoints and returned provider links before following URLs or forwarding credentials.

## Next Step

Create v2.2 by applying the two blocking patches above. Then perform a final review pass before any implementation work.
