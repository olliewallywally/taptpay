---
name: quickinv-pagetransition-fix
description: "Quick-invoice + client-directory redesign verified E2E 2026-07-12; root-caused app-wide PageTransition double-mount bug (fixed, uncommitted)"
metadata: 
  node_type: memory
  type: project
  originSessionId: c9d2317c-7d0c-4569-abe8-6b78546105d8
---

Trades quick-invoice flow (dashboard tile → keypad → inline recipient → send → add client) and the client-directory redesign (mirrors tenant directory, `cdir-*` ↔ `tdir-*`) are complete and verified: 12 API tests + 8 browser E2E steps + 5 nav sanity checks all pass (2026-07-12). Uncommitted on `feat/property-dashboard-redesign`.

**Root cause found while verifying:** `PageTransition` (`client/src/components/page-transition.tsx`) with `AnimatePresence mode="wait"` let the *exiting* page's live `Switch` re-render to the new route via context — every client-side navigation mounted the destination page **twice** (~0.22s apart). The throwaway first mount ran effects and consumed one-shot URL params (`/trades/terminal?quick=1` stripped its own query, so the real mount landed on home). Fixed by making PageTransition's children a render prop and pinning `<Switch location={transitionLocation}>` in App.tsx.

**Why:** any future page with mount effects (analytics, one-shot params, autofocus) would silently double-fire without this pin.

**How to apply:** if adding another Switch/route tree inside PageTransition, always pass the render-prop location to `Switch location=`. Related: [[trades-vertical-project]], [[app-perf-loading]].
