# Handoff — independent review of the latest pushes, and its fixes, 2026-10-11

Read the newest continuation ledger entry, then this handover. It sits on top of
`docs/HANDOFF-2026-10-11-r1-t10-accessibility-completion.md`, whose remaining
acceptance items and next work are unchanged.
**T10e/T10f/R1/release and the final independent implementation review remain open.**

Repository / branch: `olliewallywally/taptpay`, `ccr-e07e3100-0wm8kr`.
Base: `fix/qwen-aligned-20261010` at `3720c5f1`; Codex's later `c7001802` (checkout
wordmark `role="img"`, client-only) is merged in at `8bcac703`. With it: typecheck
pass, client **126 / 1,463**.
Implementation: `1bec6b68` (middleware removal, React-19-safe `inertWhen`),
`128b09bb` (lockfile), `b6100c03` (the new push's hand-written `inert` sites).
Derive the evidence checkpoint from the commit containing this handover and verify
it with `git ls-remote origin refs/heads/ccr-e07e3100-0wm8kr`. To land it on the
Codex branch, fast-forward `fix/qwen-aligned-20261010` to this branch if that
branch has not moved past `c7001802`; otherwise merge it in again.

## Review of `10f12c8d`

Reran on that commit: typecheck; full client **123 suites / 1,447 tests** and
server **186 / 4,573** pass; tutorial contrast recomputed by hand (16.361:1 /
6.242:1, old 2.418:1). The original 14-finding Qwen guide is not in the repository.

## Review of `2e96a318` / `3720c5f1`

- Claims rechecked: server/shared/package files unchanged; typecheck passes; client
  is **124 / 1,458** before this branch's added suite (125 / 1,461 with it).
- **Open finding, for the owner — browser-zoom detection misfires.**
  `browserZoomFactor()` in `client/src/hooks/use-device-class.ts` reads
  `outerWidth / innerWidth > 1.2` as browser zoom. A side panel or docked DevTools
  narrows `innerWidth` without changing `outerWidth`. Probe with the real exports:
  an 800px page in a 1200px window reads as 1.5× and classifies **desktop**
  instead of **tablet**; a 1040×600 page in a 1440px window reads as 1.38×.
  `ScaledCanvas` then multiplies the available size by that factor and turns the
  stage into a scroll box, so the canvas no longer fits the window. Headless
  matrices cannot see this because there `outerWidth` equals `innerWidth`.
  Not changed here: choosing another zoom signal is a product tradeoff.
- `accessibility-reflow.css`: the ≤320px block matches the WCAG reflow width
  (it also applies to 320px phones at 100%); the ≤767px block only affects admin.

## Findings fixed and withdrawn

Owner direction: `docs/decisions/2026-10-11-review-findings-fix-owner-direction.md`.

1. **Fixed** — removed the unmounted `server/middleware/merchant-validation.ts` the
   Qwen "indistinguishable refusals" item edited; correction note in
   `docs/evidence/qwen-aligned-patch-2026-10-10.md`.
2. **Fixed** — `inertWhen` picks `""` (React 18) or `true` (React ≥19). Nine sites
   use it: retail stack overlay, trades phone quote directory, and the seven the
   new push added (three desktop home notification panels, board builder, tenant
   directory, landing menu, landing form body). The source guard now also catches
   the ternary form. React 18.3 output is unchanged.
3. **Fixed** — 86 lockfile `resolved` URLs moved from
   `package-firewall.replit.local` to `registry.npmjs.org`. If a Replit install
   rewrites them back, normalize again before committing.
4. **Withdrawn** — tutorial overlay polling cost (code inspection, no perpetual
   mutator on merchant pages; not device-profiled).
5. **Withdrawn** — evidence JSON size: about 243 KB compressed in a 963 MB pack.

## Verification on `b6100c03`

- Failing first: the `inert-when` suite failed on the missing version mapping and
  the first two sites; after the rebase the widened guard listed the six new files.
- Typecheck pass; client **125 / 1,461**; server rerun recorded in the ledger
  entry. `npm ci` from the public registry installs 1,414 packages with integrity
  checks (E405 before).
- Isolated production build, frozen outside the checkout. Device matrix on all 11
  surfaces whose markup changed (`/terminal`, `/stack`, `/property/terminal`,
  `/trades/terminal`, `/trades/quote`, `/dashboard`, `/property`, `/trades`,
  `/board-builder`, `/property/tenants`, `/`) × four contexts: normal **44/44**,
  `--accessibility` **44/44**, `--tutorial-accessibility` **40/40** (the ten
  merchant surfaces), every process exit 0. Chromium:
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Not rerun: the complete 876-cell selection, zoom/reduced-motion variants, golden
  images, React 19 itself (only the version mapping is tested).

No deployment, migration, provider, payment, message, feature-flag or golden
activity. Rollback: revert any of the four commits; no data rollback. Stage
explicit paths only; never `git add -A`. Untracked `logs/` is runtime output.
