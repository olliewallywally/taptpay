# R1-H1 — auth/onboarding visual baseline capture, 2026-09-12

Branch: `remediation/r1-continuation-20260907`. Script:
`scripts/capture-r1-h1-auth-baseline.mjs` (left uncommitted and never run by the
prior, crashed session; run for the first time in this continuation against the
already-running local dev server).

## Purpose

R1-H1 requires owner acceptance of the exact pre-change visual baseline before any
R1 client work touches auth/onboarding. This is that baseline: `/login`, `/signup`,
`/forgot-password`, `/reset-password` (with a fixture token so the real form
renders), and `/onboarding` (the one authenticated screen, reached via a synthetic
fixture JWT and mocked `/api/auth/me`/`/api/merchants/:id`/`/api/billing/card`
responses — no real API traffic).

## Method

Synthetic Playwright/Chromium only, against `http://127.0.0.1:5000`. The script
refuses to run against a non-localhost `R1_BROWSER_BASE_URL`. For each of 4 device
classes (phone 390×844, tablet 1194×834, desktop 1440×900, desktop-short 1440×650)
× 5 routes: intercepts all `/api/*` requests to record any non-GET/HEAD call as an
"unexpected write," records `pageerror` events, waits for real content (not just
`networkidle`, since these routes lazy-load), and screenshots. Full raw output:
[`baseline-2026-09-12/auth-baseline-results.json`](baseline-2026-09-12/auth-baseline-results.json).

## Result: 20/20 captured, zero page errors, zero unexpected writes

| Route | insideMerchantFrame | Notes |
|---|---|---|
| `/login` | false (all 4 devices) | Title "Login - TapTpay Payment Terminal"; 8 controls; no `h1`/`h2` heading detected |
| `/signup` | false (all 4 devices) | Heading "Let's start with you"; 11 controls |
| `/forgot-password` | false (all 4 devices) | 4 controls; no `h1`/`h2` heading detected |
| `/reset-password?token=...` | false (all 4 devices) | Real form rendered (fixture token accepted); 1 control; no `h1`/`h2` heading detected |
| `/onboarding` | false (all 4 devices) | Heading "Complete Your Business Profile"; 6 controls |

- `insideMerchantFrame` is `false` and `deviceClass` is `null` for all 20 captures
  — confirms these routes render outside the merchant tablet/desktop frame at
  every device size, matching the design expectation recorded in the script's own
  comment (plan R1-T10).
- `bodyScrollWidth` equals the viewport width in every capture (390/1194/1440) —
  no horizontal overflow at any device class, including the 650px-tall short
  desktop.
- Zero `pageErrors` and zero `unexpectedWrites` across all 20 captures — no route
  fired a mutating API call or threw a JS error while rendering.
- `/login`, `/forgot-password`, and `/reset-password` report no `h1`/`h2` in the
  page — not necessarily a defect (they may use a different heading level or a
  logo/title element instead), but noted here rather than silently assumed fine,
  since this baseline is meant to be read by a human, not just machine-checked.

## What this does and does not establish

This is a **capture**, not an **acceptance**. It proves the five screens render
without error or overflow at four device sizes today, on this branch, against a
local dev server with fixture data. It does not:
- Constitute Oliver's sign-off on the visual design itself (R1-H1's actual
  requirement).
- Cover the merchant-frame tablet/desktop routes (that's
  `verify-r0-device-containment.mjs`'s job, already run — see R0-T5 evidence).
- Send any real API traffic or touch the database (by design — `serviceWorkers:
  'block'`, all `/api/*` calls intercepted and fulfilled locally).

Screenshots are in
[`baseline-2026-09-12/`](baseline-2026-09-12/) (20 PNG files, one per
device×route combination) for Oliver to review.
