---
name: app-perf-loading
description: Perf work 2026-07-10 — slow load root cause (3.5MB eager vendor chunk) + seamless page-transition plan and progress
metadata: 
  node_type: memory
  type: project
  originSessionId: a83f4c97-f89b-4cba-99c8-6e7b62b5b4b2
---

Task (2026-07-10, branch feat/property-dashboard-redesign): app loads slow + user wants flawless no-reload page transitions with skeleton loading.

**Diagnosis (done):**
- Root cause of slow load: `vite.config.ts` manualChunks catch-all `return "vendor"` merges ALL remaining node_modules into one 3.57 MB (1.09 MB gz) `vendor-*.js` that index.html loads eagerly. It contains @react-pdf + yoga (only used by dynamically-imported report generators — the careful code-splitting in [[report-gen-integration]] was defeated), recharts, stripe, capacitor.
- Page-to-page "reload" feel: routes are lazy; first visit to a page shows full-screen `PageLoader` spinner (Suspense fallback) instead of a transition. No hard `window.location.href` navs in active pages (only old merchant-terminal-mobile.tsx, which is unrouted; v2 only uses it for logout).
- Dashboards render $0/zeros while queries load — no skeletons.
- BottomNavigation already wraps setLocation in startTransition; PageTransition uses framer-motion AnimatePresence mode="wait" keyed on location.

**Plan / progress:**
1. ✅ Diagnose (above)
2. ✅ Chunking fixed — eager payload 1,271 kB gz → 203 kB gz (-84%). Three changes:
   - vite.config.ts: dropped catch-all `return "vendor"`; pinned ONLY virtual helpers (`commonjsHelpers` + `\0vite*`) to a tiny eager "helpers" chunk. Gotcha 1: unpinned, commonjsHelpers lands inside a big lazy chunk and every chunk then eagerly imports it. Gotcha 2: a blanket `\0` match drags ?commonjs-proxy libs (pako/qrcode/brotli) into the eager chunk — must stay narrow. Gotcha 3 (concurrent session found): pinning @react-pdf's dep tree to a manual vendor-pdf chunk re-eagered it because shared tiny deps (tslib etc.) got merged in; leave it unassigned instead.
   - landing-page.tsx: `LandingRuntime` (pulls three.js ~1.2MB min = 176 kB gz) now dynamic-imported in useEffect; markup paints instantly, 3D rig attaches after. Entry chunk 795→124 kB.
   - savePdf/@react-pdf (487 kB gz) now loads only on report export; landingRuntime only on landing page.
3. ✅ Seamless navigation: App.tsx `useRoutePreload` warms ~19 route chunks sequentially on requestIdleCallback (1s head start), gated to authenticated users so marketing visitors don't download the app. Dock nav already used startTransition. Also sw.js (client/public + root public copies): /assets/* now cache-first (content-hashed = never stale) → instant repeat visits; other statics stay network-first.
4. Skeleton loading states for retail/property/trades dashboards
5. Rebuild + verify chunk sizes and transitions

Note: another session is working concurrently on this repo (finished report-gen Task #59, edited vite.config.ts alongside me).
