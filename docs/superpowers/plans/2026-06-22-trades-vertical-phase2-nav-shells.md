# Trades Vertical — Phase 2 (Nav & Shells) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Trades vertical reachable and navigable — a 3-way settings switcher, `/trades/*` routes, a single swappable `TRADES_THEME` token block, and empty-but-rendering page shells — building on the Phase 1 backend (schema/storage/`/api/trades` routes already shipped in PR #4).

**Architecture:** Mirror the Property vertical's frontend exactly. Property lives in `client/src/pages/property/*` with routes registered in `client/src/App.tsx` and a mode switcher in `client/src/pages/settings.tsx`. Phase 2 adds a parallel `client/src/pages/trades/*` directory with the same five-screen shape, wired identically. No business logic yet — shells render a themed header + empty state; real screens (QuoteBuilder, QuickInvoice, action bar, action sheet) are Phase 3+.

**Tech Stack:** React + TypeScript, `wouter` routing (`<Route>` + `lazy()`), inline-style design tokens (the codebase uses per-file style objects, not Tailwind config, for these verticals), `@tanstack/react-query` for data (not exercised by shells yet).

## Global Constraints

- **Branch:** Build Phase 2 on a branch off the clean Phase 1 branch `feat/trades-phase1-foundation` (the one in PR #4) — name it `feat/trades-phase2-nav`. Do NOT build on `feat/trades-vertical` (its tip carries unrelated `.claude-home` churn + a landing-page commit). This keeps the Phase 2 PR diff = Phase 2 only once PR #4 merges.
- **NEVER run `npm run db:push`** on any trades branch — live DB is ahead of `main`; push wants destructive serial→int changes. Phase 2 touches zero schema, so no DB work at all.
- **Verification gate per task:** `npm run check` (tsc) must show ZERO errors in files this plan creates/modifies. Baseline is 42 pre-existing repo errors in OTHER files (checkout, terminals, routes.ts, storage, seed, etc.) — those are not ours; do not "fix" them. There is NO working unit-test runner (jest smoke test is a pre-existing JSX-transpile config failure), so "tests" for this UI phase = tsc clean + the route renders without console errors.
- **Theme tokens, one-place edit:** every trades colour must come from the `TRADES_THEME` export. No hard-coded trades hex anywhere except inside the `TRADES_THEME` block itself. Placeholder palette (user has NOT finalised colours): `INK '#1A1D21'`, `ACCENT '#FF7A1A'`, `OFFW '#F4F4F4'`, `GREEN '#1BBF85'`, `RED '#FF3B4E'`, `AMBER '#FFB02E'`.
- **Responsive standing rule:** the 3-card switcher must fit a phone width (≤ 375px) without horizontal overflow — reduce per-card padding/font vs the current 2-card layout.
- **Copy:** vertical is named **Trades**; switcher subtitle "quotes · jobs · invoices". Post-payment doc is "Invoice" (relevant later, not this phase).

---

### Task 1: `TRADES_THEME` shared token block

**Files:**
- Create: `client/src/lib/trades-theme.ts`

**Interfaces:**
- Produces: `export const TRADES_THEME` with keys `INK, ACCENT, OFFW, GREEN, RED, AMBER` (all `string`). Consumed by every file in Tasks 2–6.

- [ ] **Step 1: Create the token file**

```ts
// client/src/lib/trades-theme.ts
// Trades vertical theme tokens — swap these to restyle the WHOLE vertical.
// Colours are placeholders; the user has not finalised them. Keep this the
// single source of trades colour so a restyle is a one-place edit.
export const TRADES_THEME = {
  INK:    '#1A1D21', // charcoal base (property's NAVY equivalent)
  ACCENT: '#FF7A1A', // safety amber (property's BLUE equivalent)
  OFFW:   '#F4F4F4',
  GREEN:  '#1BBF85',
  RED:    '#FF3B4E',
  AMBER:  '#FFB02E',
} as const;

export type TradesTheme = typeof TRADES_THEME;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run check 2>&1 | grep "trades-theme" || echo "clean"`
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/trades-theme.ts
git commit -m "feat(trades): TRADES_THEME swappable token block"
```

---

### Task 2: Five page shells under `client/src/pages/trades/`

**Files:**
- Create: `client/src/pages/trades/trades-dashboard.tsx`
- Create: `client/src/pages/trades/client-directory.tsx`
- Create: `client/src/pages/trades/client-profile.tsx`
- Create: `client/src/pages/trades/trades-analytics.tsx`
- Create: `client/src/pages/trades/trades-terminal.tsx`

**Interfaces:**
- Consumes: `TRADES_THEME` from `@/lib/trades-theme` (Task 1).
- Produces: five default-exported React components: `TradesDashboard`, `ClientDirectory`, `ClientProfile`, `TradesAnalytics`, `TradesTerminal`. Consumed by App.tsx route wiring (Task 3).

Each shell is a minimal themed page proving the route renders and the theme is wired. Full screens are Phase 3+. Use a tiny shared inline-style shell so all five are consistent. The dashboard shell includes a "back to settings" link (so the vertical is escapable while screens are stubs); `client-profile` reads the `:id` route param to prove param plumbing works.

- [ ] **Step 1: Create `trades-dashboard.tsx`**

```tsx
import { useLocation } from "wouter";
import { TRADES_THEME as T } from "@/lib/trades-theme";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: T.OFFW, color: T.INK, padding: '24px 18px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, background: T.ACCENT, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>Trades</div>
        <h1 style={{ fontWeight: 800, fontSize: 26, margin: '14px 0 4px', letterSpacing: '-0.5px' }}>{title}</h1>
        <p style={{ color: '#6B7177', fontSize: 14, margin: 0 }}>{subtitle}</p>
        <div style={{ marginTop: 24 }}>{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ border: `1.5px dashed rgba(26,29,33,0.18)`, borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#8A9097', fontSize: 14 }}>
      {label}
    </div>
  );
}

export { Shell, EmptyState };

export default function TradesDashboard() {
  const [, setLocation] = useLocation();
  return (
    <Shell title="Jobs" subtitle="Your quotes, jobs and invoices">
      <EmptyState label="No jobs yet — Phase 3 brings the quote & invoice flow." />
      <button
        onClick={() => setLocation('/settings')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to settings
      </button>
    </Shell>
  );
}
```

- [ ] **Step 2: Create `client-directory.tsx`**

```tsx
import { useLocation } from "wouter";
import { Shell, EmptyState } from "@/pages/trades/trades-dashboard";
import { TRADES_THEME as T } from "@/lib/trades-theme";

export default function ClientDirectory() {
  const [, setLocation] = useLocation();
  return (
    <Shell title="Clients" subtitle="People and sites you invoice">
      <EmptyState label="No clients yet — add them from the quote flow (Phase 3)." />
      <button
        onClick={() => setLocation('/trades')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to jobs
      </button>
    </Shell>
  );
}
```

- [ ] **Step 3: Create `client-profile.tsx`** (reads `:id` param)

```tsx
import { useParams, useLocation } from "wouter";
import { Shell, EmptyState } from "@/pages/trades/trades-dashboard";
import { TRADES_THEME as T } from "@/lib/trades-theme";

export default function ClientProfile() {
  const params = useParams();
  const [, setLocation] = useLocation();
  return (
    <Shell title="Client" subtitle={`Client #${params.id ?? '—'}`}>
      <EmptyState label="Client detail, quotes & job timeline land in Phase 3." />
      <button
        onClick={() => setLocation('/trades/clients')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to clients
      </button>
    </Shell>
  );
}
```

- [ ] **Step 4: Create `trades-analytics.tsx`**

```tsx
import { useLocation } from "wouter";
import { Shell, EmptyState } from "@/pages/trades/trades-dashboard";
import { TRADES_THEME as T } from "@/lib/trades-theme";

export default function TradesAnalytics() {
  const [, setLocation] = useLocation();
  return (
    <Shell title="Analytics" subtitle="Revenue, deposits and job throughput">
      <EmptyState label="Trades analytics arrives after the core flow (Phase 4+)." />
      <button
        onClick={() => setLocation('/trades')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to jobs
      </button>
    </Shell>
  );
}
```

- [ ] **Step 5: Create `trades-terminal.tsx`** (will host the action bar + `TRADES_THEME` consumer in Phase 3)

```tsx
import { useLocation } from "wouter";
import { Shell, EmptyState } from "@/pages/trades/trades-dashboard";
import { TRADES_THEME as T } from "@/lib/trades-theme";

export default function TradesTerminal() {
  const [, setLocation] = useLocation();
  return (
    <Shell title="Terminal" subtitle="Take a deposit or balance payment">
      <EmptyState label="The trades terminal & action bar (clients · quote · invoice · external) is Phase 3." />
      <button
        onClick={() => setLocation('/trades')}
        style={{ marginTop: 18, background: 'none', border: 'none', color: T.ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
      >
        ← Back to jobs
      </button>
    </Shell>
  );
}
```

- [ ] **Step 6: Verify all five compile**

Run: `npm run check 2>&1 | grep "pages/trades/" || echo "clean"`
Expected: `clean`

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/trades/
git commit -m "feat(trades): page shells — dashboard, clients, client profile, analytics, terminal"
```

---

### Task 3: Wire `/trades/*` routes in App.tsx

**Files:**
- Modify: `client/src/App.tsx` (lazy imports near line 46–50; route block after the property section near line 269)

**Interfaces:**
- Consumes: the five default exports from Task 2.
- Produces: live routes `/trades`, `/trades/clients`, `/trades/clients/:id`, `/trades/analytics`, `/trades/terminal`, each wrapped in `<ProtectedRoute>` (mirrors property).

- [ ] **Step 1: Add lazy imports** — after the property lazy imports (currently App.tsx:46-50), insert:

```tsx
const TradesDashboard       = lazy(() => import("@/pages/trades/trades-dashboard"));
const TradesClientDirectory = lazy(() => import("@/pages/trades/client-directory"));
const TradesClientProfile   = lazy(() => import("@/pages/trades/client-profile"));
const TradesAnalytics       = lazy(() => import("@/pages/trades/trades-analytics"));
const TradesTerminal        = lazy(() => import("@/pages/trades/trades-terminal"));
```

- [ ] **Step 2: Add the route block** — immediately after the property terminal route closes (currently App.tsx:269, the `</Route>` ending `/property/terminal`), insert:

```tsx
          {/* ── Trades section ── */}
          <Route path="/trades">
            <ProtectedRoute><TradesDashboard /></ProtectedRoute>
          </Route>
          <Route path="/trades/clients">
            <ProtectedRoute><TradesClientDirectory /></ProtectedRoute>
          </Route>
          <Route path="/trades/clients/:id">
            <ProtectedRoute><TradesClientProfile /></ProtectedRoute>
          </Route>
          <Route path="/trades/analytics">
            <ProtectedRoute><TradesAnalytics /></ProtectedRoute>
          </Route>
          <Route path="/trades/terminal">
            <ProtectedRoute><TradesTerminal /></ProtectedRoute>
          </Route>
```

- [ ] **Step 3: Verify App.tsx still compiles (no NEW errors)**

Run: `npm run check 2>&1 | grep "App.tsx"`
Expected: same pre-existing App.tsx error(s) as baseline, no new ones referencing Trades imports. (Baseline App.tsx errors are unrelated digital-wallet/native-payment typing — confirm none mention `Trades`.)

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(trades): register /trades/* routes mirroring property"
```

---

### Task 4: 3-way settings switcher (add Trades card, make responsive)

**Files:**
- Modify: `client/src/pages/settings.tsx` (the mode-switcher block, currently ~1163-1209)

**Interfaces:**
- Consumes: `TRADES_THEME` from `@/lib/trades-theme` (for the Trades card accent) — import at top of settings.tsx if not already importing it.
- Produces: a 3-card switcher (Retail → `/dashboard`, Property → `/property`, Trades → `/trades`) that fits ≤375px width.

The current two cards use `padding: '18px 16px'`, 40×40 icon, 14px title, 11px subtitle. With three cards on a phone this overflows — reduce to `padding: '14px 10px'`, 34×34 icon, 13px title, 10px subtitle, and `gap: 8` on the row. Apply the SAME reduced sizing to all three cards so they match.

- [ ] **Step 1: Add the import** — at the top of `settings.tsx`, with the other `@/lib` imports:

```tsx
import { TRADES_THEME } from "@/lib/trades-theme";
```

- [ ] **Step 2: Replace the switcher block** — replace the whole `{/* Mode switcher … */}` block (currently settings.tsx:1163-1209) with the three-card version below. Note the comment rename, `gap: 8`, and reduced per-card padding/icon/font on ALL cards:

```tsx
        {/* Mode switcher: Retail · Property · Trades */}
        <div className="mb-5 flex" style={{ gap: 8 }}>
          <button
            onClick={() => setLocation('/dashboard')}
            style={{ flex: 1, background: '#0055FF', borderRadius: 16, padding: '14px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(0,229,204,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#00E5CC" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h10M4 17h7"/><rect x="14" y="13" width="7" height="7" rx="1.5"/></svg>
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#00E5CC', letterSpacing: '-0.2px' }}>Retail</div>
              <div style={{ fontWeight: 400, fontSize: 10, color: 'rgba(0,229,204,0.65)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>terminal · sales</div>
            </div>
          </button>
          <button
            onClick={() => setLocation('/property')}
            style={{ flex: 1, background: '#040D6D', borderRadius: 16, padding: '14px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(88,171,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#58ABFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20V9.5z"/><path d="M9 21.5V14h6v7.5"/></svg>
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#FFFFFF', letterSpacing: '-0.2px' }}>Property</div>
              <div style={{ fontWeight: 400, fontSize: 10, color: 'rgba(88,171,255,0.65)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>tenants · rent</div>
            </div>
          </button>
          <button
            onClick={() => setLocation('/trades')}
            style={{ flex: 1, background: TRADES_THEME.INK, borderRadius: 16, padding: '14px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,122,26,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={TRADES_THEME.ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 00-5.4 5.4l-6 6a1.5 1.5 0 002.1 2.1l6-6a4 4 0 005.4-5.4l-2.3 2.3-2.1-2.1z"/></svg>
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#FFFFFF', letterSpacing: '-0.2px' }}>Trades</div>
              <div style={{ fontWeight: 400, fontSize: 10, color: 'rgba(255,122,26,0.72)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>quotes · jobs</div>
            </div>
          </button>
        </div>
```

- [ ] **Step 3: Verify settings.tsx compiles**

Run: `npm run check 2>&1 | grep "settings.tsx" || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/settings.tsx
git commit -m "feat(trades): 3-way settings switcher (Retail · Property · Trades), responsive"
```

---

### Task 5: Manual verification & whole-phase check

**Files:** none (verification only)

- [ ] **Step 1: Full type check, confirm no NEW errors**

Run: `npm run check 2>&1 | grep -E "error TS" | wc -l`
Expected: `42` (the pre-existing baseline — Phase 2 adds zero). If higher, the delta is ours; fix before proceeding.

- [ ] **Step 2: Confirm no trades file regressed**

Run: `npm run check 2>&1 | grep -iE "trades|pages/trades|trades-theme" || echo "clean"`
Expected: `clean`

- [ ] **Step 3: Visual smoke (use the `run` skill / dev server)**

Start the app (`npm run dev`), log in, open `/settings`, confirm three cards fit on a 375px-wide viewport with no horizontal scroll, and that each card navigates: Retail→`/dashboard`, Property→`/property`, Trades→`/trades`. From `/trades`, confirm `/trades/clients`, `/trades/clients/1`, `/trades/analytics`, `/trades/terminal` all render their themed shell with no console errors. Capture a screenshot of the 3-card switcher.

- [ ] **Step 4: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "chore(trades): Phase 2 verification tweaks" --allow-empty
```

---

## Self-Review

**Spec coverage (§3 nav, §4 theme):**
- §3 3-way switch (Retail/Property/Trades, routes, mobile-readable) → Task 4 + Task 3. ✓
- §3 new `/trades/*` routes mirroring property → Task 3. ✓
- §4 swappable `TRADES_THEME` single token block, no hard-coded hex in consumers → Task 1, consumed in Tasks 2 & 4. ✓
- Page shells for the five screens → Task 2. ✓
- Out of scope for Phase 2 (deferred to Phase 3+, correctly NOT in this plan): action bar, QuoteBuilder, QuickInvoice, action sheet, GST display, fees, data fetching. These are nav/shells only.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every step has literal code or a literal command + expected output. ✓

**Type consistency:** `TRADES_THEME` keys (`INK/ACCENT/OFFW/GREEN/RED/AMBER`) defined in Task 1 are the only keys referenced in Tasks 2 & 4. Default exports `TradesDashboard/ClientDirectory/ClientProfile/TradesAnalytics/TradesTerminal` (Task 2) match the lazy imports in Task 3. `Shell`/`EmptyState` named exports defined in `trades-dashboard.tsx` (Task 2 Step 1) are imported by Steps 2–5. Route paths in Task 3 match the switcher target `/trades` in Task 4 and the spec table. ✓
