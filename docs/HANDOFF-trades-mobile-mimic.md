# Handoff — Trades vertical: full mobile mimic of the Property vertical

**Date:** 2026-06-25
**Branch:** `feat/trades-phase3c-cross-cutting`
**Goal (from the user, verbatim intent):** Make the **Trades** vertical a *complete* mimic of the
**Property Management** vertical — the nav bar, **every page**, the structure and design — all in
**mobile format**. No desktop-only screens, no desktop form popups (forms must be mobile bottom
sheets). Tablet/desktop will be handled later. The terminal is already the closest match.

This is a page-by-page **port**: copy each `client/src/pages/property/*` page and transform it into its
`client/src/pages/trades/*` counterpart, keeping the **exact mobile layout/structure/animations**,
swapping to the trades palette, and renaming the domain.

---

## ⚠️ Verification constraint (read first)
This sandbox **cannot launch a browser** (Playwright Chromium fails: missing `libglib-2.0.so.0`).
So all work here is **build-verified only** (`npx tsc --noEmit` + `npm run build`), NOT visually
verified. The user must eyeball each page when they run it. Do not claim visual correctness.

Gates to run after every page:
```
npx tsc --noEmit        # must be exit 0
npm run build           # must be exit 0
```

---

## The palette (FINAL — set by user 2026-06-25)
`client/src/lib/trades-theme.ts` — `TRADES_THEME`:
- `INK = '#06150E'`  — deep forest green, the **dark base** (property's `navy #040D6D` role)
- `ACCENT = '#222222'` — graphite grey (property's `sky-blue #58ABFF` role)
- `OFFW = '#F4F4F4'` — off-white (unchanged)
- `GREEN/RED/AMBER` — status colours, unchanged.

### The KEY adaptation rule (this is the whole trick)
Property's accent (`sky #58ABFF`) is a **mid/light** colour, so property uses it as a foreground on
dark navy AND puts navy text on sky-coloured cards. **Trades has no mid tone** — both `INK` and
`ACCENT` are near-black. Therefore, when porting, decide colour by **surface lightness**:

| Property usage | Trades equivalent |
|---|---|
| `sky` text/icon/line **on a dark (navy) surface** | **`OFFW`** (off-white) — accent is invisible on dark |
| navy/`ink` text **on a `sky` card** (card bg was sky) | card bg → `ACCENT`; text → **`OFFW`** |
| `sky` accent/label **on a light surface** (#F4F4F4/gray/glass) | **`ACCENT`** (`#222222`, dark, reads on light) |
| bright action button (e.g. `btn #3F9BFF`) on a dark hero | bg → **`OFFW`**, icon/text → **`INK`** |
| navy text on white/glass cards | **`INK`** (unchanged role) |
| `navy` dark surface bg | **`INK`** |
| `#F4F4F4` light sheet, `gray`, `mute`, status colours | **unchanged** |

Net effect: trades reads as a **very dark, monochrome** theme (near-black surfaces + off-white text +
green/amber/red status pops), instead of property's bright-blue-on-navy. The user approved this.
**This rule was applied consistently in the already-ported terminal, dashboard, and analytics — copy it.**

Also: there were hardcoded literals to convert (already done across existing trades pages):
`rgba(255,122,26,*)` (old amber) → graphite, `rgba(26,29,33,*)` (old charcoal) → forest. New code
should just use `TRADES_THEME` tokens / the rgb of `#06150E`=`6,21,14` and `#222222`=`34,34,34`.

---

## Domain rename map (property → trades)
- `tenant` → `client`; `tenantName` → `clientName`; `tenantProfileId` → `clientProfileId`
- `propertyAddress` → `siteAddress`
- `rent` → `job` / `invoice`; "rent transactions" → "job invoices"; "Rent payment" → "Invoice"
- API: `/api/property/tenants` → `/api/trades/clients`; `/api/property/invoices` → `/api/trades/invoices`;
  `/api/property/schedules` → `/api/trades/schedules`
- fetch helper: `propFetch` (`@/lib/property-api`) → `tradesFetch` (`@/lib/trades-api`); headers via
  `tradesHeaders()`
- routes: `/property` → `/trades`, `/property/tenants` → `/trades/clients`, etc.
- Trades live invoice statuses (more than property):
  `['pending_dispatch','dispatched','viewed','deposit_paid','balance_due','dispatch_failed']`

### Trades client create API contract (from existing `client-directory.tsx`)
`POST /api/trades/clients` body: `{ firstName, lastName, email, phone, siteAddress, preferredChannel, notes }`
(required: firstName, lastName, siteAddress; email required if channel=email else phone required).
NOTE: property's add-tenant sheet also has **subtenants/co-tenants** — trades clients may not support
that field. Check `shared/schema.ts` `createClientProfileSchema` before copying the subtenant UI; drop
it if the trades API/schema doesn't accept it.

---

## STATUS — what's done vs left

### ✅ DONE (committed, build-green)
- **Palette finalised** + on-accent text flipped to off-white (terminal). Commit `14857f8`.
- **Bottom nav** (`client/src/components/bottom-navigation.tsx`): added a **trades mode** —
  `TRADES_ITEMS` (home `/trades` · clients `/trades/clients` · terminal `/trades/terminal` ·
  analytics `/trades/analytics` · settings `/settings`), trades-mode detection, `showNav` now includes
  `/trades/*` (excluding the public `/trades/quote/:token`), themed (INK bar, off-white active icons).
  Commit `14857f8`.
- **Dashboard** (`trades-dashboard.tsx`): full mirror of `property-dashboard.tsx` — active-jobs hero,
  collected-this-month + collection gauge `Ring`, 4-stat strip (clients/outstanding/queued/paused),
  recent job-invoice list. Commit `14857f8`.
- **Analytics** (`trades-analytics.tsx`): full mirror of `property-analytics.tsx` — period pills,
  revenue total, animated `RevenueChart`, swipeable payment-history sheet. Commit `9ba35ff`.
- **Terminal** (`trades-terminal.tsx`): was already a close port; palette + off-white-on-forest applied.

### ⛔ LEFT TO DO (the remaining tasks)
1. **Client directory** — `client/src/pages/trades/client-directory.tsx` is a ~60-line partial with a
   plain inline form. Port `client/src/pages/property/tenant-directory.tsx` (505 lines):
   - hero (active-clients count + floating `+`), search row, **mobile bottom-sheet add form**
     (`AddTenantSheet` → `AddClientSheet`, slides up, NOT a desktop modal), tenant/client card pairs
     (`TenantRow` → `ClientRow`: info card + next-payment card), archived section + restore.
   - Apply the palette rule above. The add-sheet sits on a **light** `#F4F4F4` sheet → field labels and
     accents there use `ACCENT` (dark), avatars/dark surfaces use `OFFW` foreground.
   - Decide on the property `property-transition` hero-morph: it's property-specific
     (`@/lib/property-transition`). Recommend **plain `setLocation` navigation** for trades (don't import
     the property transition lib — risk of cross-vertical state). Note this as a deviation; a
     `trades-transition` could be added later.
   - Drop the **subtenants** block unless `createClientProfileSchema` supports it (see contract note).
   - Endpoints: `/api/trades/clients` (+ `?includeArchived=true` if supported — verify), restore via
     `POST /api/trades/clients/:id/unarchive` (verify this route exists in `server/routes.ts`; if not,
     either add it or omit the archived/restore UI).
2. **Client profile** — `client/src/pages/trades/client-profile.tsx` (~250 ln) vs
   `client/src/pages/property/tenant-profile.tsx` (~600 ln). Same treatment: mirror structure, mobile
   edit form as a bottom sheet, palette rule, domain rename. Verify trades endpoints for
   get/update/archive client + the client's invoices/quotes/schedules.
3. **Settings** — `client/src/pages/settings.tsx` is **shared** across verticals (has the 3-way
   Retail/Property/Trades switcher ~line 1170, and a trades GST card already). Ensure the trades-relevant
   settings sections match property's, mobile-formatted. This is a review/align task, not a new file.
4. **(Cross-cutting) Forms must be mobile bottom sheets** — the user explicitly does NOT want desktop
   popups. The property `AddTenantSheet` pattern (fixed inset, backdrop blur, sheet slides up from bottom
   with `@keyframes atSlideUp`, max-width 390, rounded top, pull handle) is the template for every
   trades form. Apply it to the directory add form and the profile edit form.

### Live task list (TaskCreate IDs in this session)
- #5 bottom nav — **done**
- #6 dashboard — **done**
- #7 analytics — **done**
- #8 client directory — **in progress / not started in code**
- #9 client profile — pending
- #10 trades settings sections — pending

---

## Per-page porting recipe (repeat for each remaining page)
1. `Read` the property source (`client/src/pages/property/<x>.tsx`) fully.
2. `Read` the current trades stub to learn the trades API contract/field names it already uses.
3. Copy property structure verbatim; then:
   - replace the `C` token block with trades tokens (see rule table);
   - rename domain (tenant→client, propertyAddress→siteAddress, endpoints, propFetch→tradesFetch);
   - for every `C.sky`/`C.navy`/`C.btn` usage, pick the trades colour by **surface lightness**;
   - keep all animations/keyframes/refs/measurement logic **identical**.
4. `npx tsc --noEmit` then `npm run build` → both exit 0.
5. Commit per page: `feat(trades): port <page> to property parity`.
6. Tell the user to eyeball it (no browser here).

## Reference files
- Palette: `client/src/lib/trades-theme.ts`
- Done examples to copy the transform from: `trades-dashboard.tsx`, `trades-analytics.tsx`,
  `trades-terminal.tsx`, and the trades-mode block in `components/bottom-navigation.tsx`.
- Property sources: `client/src/pages/property/{tenant-directory,tenant-profile,property-dashboard,property-analytics}.tsx`
- Memory: `~/.claude/projects/-home-runner-workspace/memory/trades-vertical-project.md`

## Other open threads (not part of this mimic, but uncommitted-state context)
- Earlier this session: trades GST+quote-PDF feature finished, migrations 0008/0009 applied to DB,
  login auth-state bug fixed (`login.tsx` full-page nav), landing-page login button + logo tweak — all
  committed earlier on this branch.
- The branch has commits that are **local only** (not pushed to `origin/feat/trades-phase3c-cross-cutting`).
- A harness auto-commit `f0150ce` ("Saved progress…") bundled the original landing-page work with
  `.claude-home/` noise — worth untangling before any push.
