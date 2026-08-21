---
name: probe-transitions-cannot-exit-zero
description: "probe-transitions.mjs always exits 1 in this environment — it gates on third-party network errors, and client/index.html loads the Replit dev banner, which headless chromium blocks"
metadata: 
  node_type: memory
  type: project
  originSessionId: 491f649c-7013-4f14-ac0c-0ba12c52338f
  modified: 2026-08-19T07:21:39.640Z
---

`scripts/desktop-shots/probe-transitions.mjs` folds **`t.errors`** (every browser/HTTP
error, third-party included) into its `bad` count, so `process.exitCode = 1` even when
every signal the plans actually care about is clean.

Observed 2026-08-19: 0 chrome remounts, 0 route-loader flashes, 0 wrong surfaces,
0 chunk errors — and still exit 1, on **44 browser errors per device class**, all of
them `GET https://replit.com/public/js/replit-dev-banner.js — net::ERR_BLOCKED_BY_ORB`.
That script tag is `client/index.html:227`; headless chromium blocks it via ORB.

**Why:** the next queued task is building the verification harness — `npm run verify:*`
and the `.github/workflows/verify.yml` that does not exist yet (there is no `.github`
directory at all). Wiring this probe in as-is makes CI red on day one for a reason
that has nothing to do with the code, which is exactly how gates become advisory again.

**How to apply:**
- Judge this probe by its printed summary line, not its exit code, until it is fixed.
- `probe-cascade.mjs` already models the fix — it classifies these as
  "N third-party request failure(s), **not gated**" and exits 0. Port that split
  (first-party vs third-party) into probe-transitions before gating on it.
- The plan's own criteria for this probe are only "0 chrome remounts, 0 route-loader
  flashes" — both were met when Phase 9 was committed as `cedef72`.

Related: [[playwright-nix-chromium]], [[desktop-transitions-work]], [[mobile-44px-rule]].
