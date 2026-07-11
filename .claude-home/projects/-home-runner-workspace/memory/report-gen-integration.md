---
name: report-gen-integration
description: "Task #59 report generation — @react-pdf architecture, what's built vs remaining, data shapes per vertical"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6f543e3e-df2b-4df0-93d0-453bc3af61c4
---

Task **#59 — Report Generation Across All Verticals** (spec was pasted; 3 retail + 4 property + 4 trades = 11 reports). Branch `feat/property-dashboard-redesign`. Each analytics/dashboard page gets an "Export" button → bottom-sheet modal → PDF (and CSV where noted). No new API endpoints; all data already in TanStack cache.

**Key decision (diverged from the pasted spec):** dropped the spec's "browser print-to-PDF, zero-dependency" idea in favour of **`@react-pdf/renderer`** (v4.5.1, installed + committed). Reports are React `<Document>`s composing shared primitives — NOT HTML strings + window.print().

**Foundation (built, committed, tsc-clean as of 2026-07-10):**
- `client/src/lib/report-utils.ts` — pure helpers (money in cents, NZ 15% GST, NZ-tz dates, aged buckets, CSV). Unit-tested.
- `client/src/lib/report-pdf/theme.ts` — @react-pdf theme (navy #040D6D / sky #58ABFF / Outfit fonts).
- `client/src/lib/report-pdf/components.tsx` — primitives: ReportPage, KpiRow, DataTable, ReportBarChart, DonutStat, Money, StatusText. (I fixed 2 latent tsc errors here: alignStyle returned undefined in a style array; footer render used totalPages missing from v4 types.)
- `client/src/lib/report-pdf/savePdf.ts` — **I built this**: `savePdf(doc, filename, title)` (Web Share on mobile, download fallback), `downloadCsv`, `reportFilename`.

**Property vertical — DONE (2026-07-10), tsc + vite build clean:**
- `report-pdf/reports/property.tsx` — 4 reports (Rent Roll, Collection Statement [+CSV], Aged Arrears, Annual Income Statement [landscape matrix]) + `runPropertyReport(id,format,data,range)` dispatcher. Added `orientation` prop to ReportPage for the landscape income statement.
- `report-pdf/reports/property-options.ts` — lightweight `PROPERTY_REPORT_OPTIONS` (no @react-pdf import, so pages list reports without pulling the 1 MB engine).
- `report-pdf/reports/types.ts` — shared modal contract (`ReportOption`, `ReportFormat`, `DateRange`).
- `components/reports/ReportModal.tsx` — generic bottom-sheet (report cards + period presets/custom + optional client selector + CSV/PDF actions) + `ExportButton` (tone onLight/onDark). Vertical-agnostic.
- `components/reports/PropertyReportsButton.tsx` — drop-in: binds tenants/invoices/schedules/merchant, **lazy-imports** property.tsx on first generate.
- `lib/merchant.ts` — `useMerchantProfile()` for report headers.
- Wired into property-dashboard.tsx (navy hero, tone onDark) + property-analytics.tsx ("Payment History" row, onLight).

**Retail + trades — DONE (2026-07-10):** same trio pattern as property. All 11 reports built; buttons wired into all 5 pages (dashboard, property-dashboard/-analytics, trades-dashboard/-analytics). Trades button scopes by `siteFilter` (invoices resolved to site via client) and feeds the Client Statement client selector.

**Chunking saga (2026-07-10, resolved):** the vite manualChunks catch-all `"vendor"` swallowed @react-pdf into the 3.5 MB eager chunk, defeating the dynamic imports. Tried pinning a manual `vendor-pdf` chunk — WRONG: a manual chunk reachable from the eager graph gets a side-effect import from index.js (execution-order preservation), so 1.4 MB loaded eagerly anyway. Correct fix (converged with the parallel perf session, see [[app-perf-loading]]): NO manual chunk for @react-pdf + no catch-all; Rollup colocates the engine into a lazy `savePdf-*.js` (~1.4 MB) chunk shared by the three report generator chunks, loaded only on first Generate. Virtual `commonjsHelpers` modules are pinned to a tiny eager `helpers` chunk (narrow match — a blanket `\0` match drags whole ?commonjs-proxy libraries eager).

**Verified 2026-07-10 (headless):** all 11 PDFs + 3 CSVs rendered via a node esbuild harness (scratchpad pdf-verify: alias `@/`→client/src, stub savePdf→renderToFile, .ttf file-loader with absolute publicPath so fontkit reads Outfit from fs). Eyeballed: cover band, KPI cards, tables, zebra rows, landscape annual matrix, donut, aged buckets, multi-client statement all correct; totals/GST cross-checked. CSV quoting correct. Minor nit: "Balance outstanding" footer label wraps to 2 lines in Client Statement — cosmetic. NOT committed (parallel session active in same tree).

**Verify note:** tsc(0), report-utils jest(20/20), vite build all pass. NOT visually confirmed in a browser — the PDF layout (esp. the landscape Annual matrix column widths) should be eyeballed by generating one from a property page. savePdf uses Web Share on mobile, download fallback on desktop.

**Data shapes (property):** tenants `tenantProfiles` {id, firstName,lastName, email, propertyAddress, status active|archived}; invoices `invoicesRentRequests` {id, tenantProfileId, amountCents, kind rent|charge, status pending_dispatch|dispatched|paid|overdue|voided|paid_external, dueAt,paidAt,createdAt}; rent/frequency live on `activeSchedules` {tenantProfileId, amountCents, frequency weekly|fortnightly|monthly, status} via existing `GET /api/property/schedules`. Merchant header (businessName/gstNumber/nzbn/gstRegistered) from `useQuery(["/api/merchants", merchantId])` (shared with settings.tsx). Client hooks live in `client/src/lib/property-data.ts`.

Related: [[taptpay-design-language]], [[trades-vertical-project]].
