---
name: ui-consistency-plan-2026-07-12
description: "Approved 5-item UI consistency plan (2026-07-12) — execution order 5→2→3→4→1, commit + memory update after each step"
metadata: 
  node_type: memory
  type: project
  originSessionId: c9d2317c-7d0c-4569-abe8-6b78546105d8
---

Approved plan from 2026-07-12, executing in order **5 → 2 → 3 → 4 → 1**, committing and updating this memory after each step. **✅ ALL 5 STEPS COMPLETE** — final commit `7695178`.

1. **Analytics sheet drag** — port property-analytics' pointer-event free-park drag (no snapping, mouse+touch) to `trades/trades-analytics.tsx` and `transactions.tsx`, replacing their touch-only two-position snap. — ✅ commit `7695178` (measuredTop/sheetOffset split, onPointerDown/Move/Up handlers, currentOffset<40 for overflow; dropped `snapped` state; verified headlessly — 120px mouse drag free-parks mid-range on both)
2. **Page widths to 430** — `property/tenant-profile.tsx` (390 ×3), `trades/client-profile.tsx` (390 ×2), `trades/recurring-schedules.tsx` (620). Verify hero morph directory→profile still aligns. — ✅ commit `ed999f8` (also caught: directory add-sheets at 390, SmartTransitions retail terminal viewport at 390; all pages measured 430 headlessly at 700px viewport, hero morph verified)
3. **Navy bleed** — `transactions.tsx` outer wrapper is navy; standard is white outer + centered 430 column. Fix + screenshot-sweep all routes at 1280px for other offenders. — ✅ commit `6b01dd8` (transactions was the only offender; all 17 merchant routes sampled white gutters at 1280px)
4. **Retail stock page** — `stock-management.tsx` uses Tailwind `max-w-3xl`; rebuild to white gutter + 430 column. — ✅ commit `edc6a8d` (outer white flex-center wrapper + inner maxWidth:430; dropped dead `max-w-3xl mx-auto`; verified headlessly at 430px & 1280px — white gutters, navy header intact)
5. **Dashboard graphs** — in all 3 dashboards (`dashboard.tsx`, `property-dashboard.tsx`, `trades-dashboard.tsx`): remove dashed ghost "wireframe" bars (+ unused plumbing); zero-value bars currently 6px-tall full-width pills (`rx=bw/2`, "too oval") → small subtle centered circle/dot. — ✅ commit `8bd4049` (DOT=7, opacity 0.45; billed prop + buildBilledBuckets plumbing removed; verified via screenshots incl. mixed bars+dots on property year view)

Standard app pattern (established while auditing): full-viewport **white** wrapper, centered **maxWidth: 430** column. Terminals use `.tp-viewport` (430 centered) — already compliant.

**Verification per step:** typecheck + headless browser (see [[playwright-nix-chromium]]); final sweep at 390px/1280px across all routes.

Update the ☐ boxes as steps land. Related: [[trades-vertical-project]], [[quickinv-pagetransition-fix]].
