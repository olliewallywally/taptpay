# Owner direction — fix the independent review's findings on the latest push

Date: 2026-10-11 UTC. Owner: Oliver.
Branch: `ccr-e07e3100-0wm8kr`, first based on `fix/qwen-aligned-20261010` at
`10f12c8d` (the latest push, reviewed in the same session), then rebased onto
Codex's next push `3720c5f1`.

## Context

An independent review of `fix/qwen-aligned-20261010` reran typecheck and the full
client (123 suites / 1,447 tests) and server (186 / 4,573) suites, all passing, and
raised five findings:

1. The Qwen "indistinguishable merchant and transaction refusals" change edits
   `server/middleware/merchant-validation.ts`, which no route mounts.
2. The tutorial overlay's document-wide observer might keep measuring every frame
   on pages that mutate styles continuously.
3. The retail stack's `inert=''` (and the shared `inertWhen` helper) stops working
   under React 19, which reads `inert=""` as false.
4. About 7.8 MB of structural evidence JSON was committed in one day.
5. `package-lock.json` pins 86 packages to `package-firewall.replit.local`, so
   `npm ci` fails outside Replit (E405).

## Decision

The owner asked, verbatim:

> Ok can you make a fix for all your findings

The same session then checked each finding again before changing code:

- **1, fixed:** both middlewares deleted with their test. They were already
  listed as dead code awaiting removal in
  `docs/PLAN-2026-08-10-finish-review-and-fix.md` Step 10; this direction is that
  approval. The Qwen report carries a dated correction note.
- **3, fixed:** `inertWhen` chooses `""` (React 18) or `true` (React ≥19) from the
  installed React; the retail stack overlay and the trades phone quote directory
  now use it, and a source guard keeps hand-written `inert` out of React markup.
  Codex's later push `2e96a318` added seven more hand-written sites (desktop home
  notification panels, board builder, tenant directory, landing menu and form
  body); under the same direction they were routed through the helper after the
  rebase, and the guard was widened to the ternary form it had missed.
- **5, fixed:** only the 86 `resolved` URLs were rewritten to
  `https://registry.npmjs.org/`; the other 1,497 entries already used it and install
  on Replit. Integrity hashes are unchanged and `npm ci` verifies them.
- **2, withdrawn:** no merchant page has a perpetual style mutator (dashboard and
  dock rAF use is one-shot; `TerminalFeaturesSection`'s interval is imported by
  nothing), the overlay ignores its own mutations, and its rect equality guard stops
  a feedback loop. Polling ends 800 ms after the page settles. Not device-profiled.
- **4, withdrawn:** git stores those three files compressed at about 243 KB in a
  963 MB pack. The remaining cost is review noise in diffs, not clone size.

## Consequences and rollback

No product, payment, security-policy, schema, migration, feature-flag or golden
baseline change. Revert the implementing commit to undo all three fixes. If Replit
rewrites the lockfile URLs back on a later install, normalize them again rather
than committing the mirror addresses.
