# R0-T5 device verifier correction — 2026-09-12

Branch: `remediation/r1-continuation-20260907`.
Base: `ada0d5bd61285b4450cbb7ec35199833a71ac7fa`; verifier changes remain uncommitted.
Scope: finish the interrupted frame-measurement verifier repair. No application,
CSS, migration, credential, deployment or capability change.

## Finding and review

The September 11 desktop failures measured the full-viewport backdrop marked
`data-testid="desktop-frame"`. The actual rounded frame is its direct
`.tapt-desktop-frame` child. The earlier claim that desktop renders full-bleed,
and the associated request for an owner decision, are withdrawn.
See [preflight and original failing-run record](R0-T5-frame-measurement-preflight-2026-09-12.md).
The current component, CSS and freshly captured desktop terminal screenshot
independently agree with the corrected measurement.

## Changes and verification

The verifier selects the actual frame and checks device class, dimensions,
centering, clipping, radius and the 1180×880 logical canvas. It adds all five
routes at the locked fine-pointer 1440×650 viewport. Existing page-error,
unavailable-control and unexpected API-write assertions remain in place.

Commands:

- `node --check scripts/verify-r0-device-containment.mjs` — passed.
- `git diff --check` — passed.
- `vite preview --host 127.0.0.1 --port 5199 --strictPort` — served existing
  `dist/public` assets from the preceding preflight build; no rebuild this turn.
- `R0_BROWSER_BASE_URL=http://127.0.0.1:5199 node scripts/verify-r0-device-containment.mjs`
  — exit 0, **20/20 passed**.

The sandbox blocked the preview listener and Chromium launch; both were rerun
with tool escalation. Static loopback preview only: APIs intercepted with
synthetic fixtures, external origins blocked, service workers disabled. No
application server or database was started. No provider request was made.

| Device | Viewport | Actual frame | Position | Radius | Routes passed |
|---|---|---|---|---|---|
| Phone | 390×844 | No desktop shell | — | — | 5/5 |
| Tablet | 1194×834 | 1194×834 | 0, 0 | 0 | 5/5 |
| Desktop | 1440×900 | 1000×745.75 | 220, 77.125 | 28px | 5/5 |
| Short desktop | 1440×650 | 819.28125×610.984375 | 310.359375, 19.5 | 28px | 5/5 |

Routes: `/terminal`, `/property/terminal`, `/trades/terminal`, `/settings`, `/nfc`.
[Sanitized complete results](R0-T5-frame-measurement-results-2026-09-12.json).
Screenshots are temporary at `/tmp/taptpay-r0-device-containment/`.

## Limits and next prerequisites

This closes the erroneous desktop-frame blocker and the existing synthetic
containment smoke matrix. It does not establish a before/after pixel comparison,
real-device UAT, auth/onboarding/tutorial acceptance or the complete R1-H1 visual
baseline. Those remain separate gates. R0 overall remains open, including the
recorded operational and human checks; later feature phases remain gated.
The existing split-session replay finding remains open for R3.

Rollback: revert the verifier-only diff; no data or application rollback needed.
No commit, push, migration or deployment was performed.
