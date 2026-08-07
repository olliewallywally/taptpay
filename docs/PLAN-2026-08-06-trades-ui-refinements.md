# Plan — Trades-side UI refinements (tablet/desktop)

Date: 2026-08-06
Branch: `feat/tablet-desktop-app`
Status: **implemented and browser-verified on desktop and touch-tablet**
Source: Oliver, 2026-08-06, plus his clarification of §2 the same day. His wording
is quoted verbatim per item so intent is not lost in paraphrase.
Verification: `docs/VERIFY-2026-08-07-tablet-desktop-final-qa.md`; implementation
commits run from `41267fb` through `d611405`.

> **Baseline requirement.** Build this only after the payment-safety, no-board link, and notification-preference work on this branch is committed and verified. The mobile Trades terminal is the canonical logic source for §0.

---

## 0. Missing from the first draft — desktop clientless Quick Invoice

This earlier explicit requirement was the largest omission in the first draft:

> "when i click quick invoice from the trade dashboard, i need it to go right into the quick invoice section of the terminal"
>
> "we dont need to have made a client for a quick invoice ... you just have a field to enter those details"
>
> "after you send the payment on a quick invoice, have a button for add client which will save them as a new client"

### 0.1 Reuse the working mobile contract

The phone implementation in `client/src/pages/trades/trades-terminal.tsx` is already the logic source: `?quick=1` opens Quick Invoice, recipient details replace a selected client, sending creates a hidden prospect linked to the invoice, and the success action promotes that same prospect through the existing endpoint near `server/routes.ts:7590`. Desktop must reuse those request shapes, query keys, billing-card handling, and promotion endpoint. No new server endpoint or schema belongs in this work.

### 0.2 Desktop behaviour

**File:** `client/src/desktop/pages/trades-terminal.tsx`

1. Consume `?quick=1` on entry and paint the invoice composer immediately, without flashing the normal terminal state.
2. Allow no selected client. Show customer name, delivery channel, and the matching email or phone field. Name and destination are required; address and notes are optional.
3. Keep amount, job description, split setting, keypad, billing gate, and delivery behaviour identical to a normal invoice.
4. On success, keep confirmation in the right pane and show **add client**. Disable while saving and show `client saved ✓` after promotion. Repeated clicks must never create a second client.
5. Invalidate the shared Trades client and invoice query keys after promotion so Home, Directory, and Terminal agree immediately.
6. Remove `?quick=1` with history replacement after it is consumed. Refresh/back must never resend or silently recreate a payment.

### 0.3 Safety and tests

Never put recipient PII or internal ids in the URL. Preserve entered data after a failed send. Keep send single-flight under double click. A failed promotion must not alter the already-sent invoice. Hidden prospects remain absent from the directory until promotion.

Tests must cover dashboard deep-link consumption, clientless validation, payload parity with mobile, successful and failed send paths, one-time promotion, and query invalidation. Capture compose and success states at desktop and tablet sizes.

---

## 1. Trades home — "jobs quoted" under revenue

> "on the hero section, below rev collected add in smaller text, have jobs quoted"

**File:** `client/src/desktop/pages/trades-home.tsx`

The hero renders amount + growth pill, then `revenue collected` (`:298`, class
`th-hero-sub`). Add a smaller second line beneath it.

**Data already exists — add no query.** `desktop/data/trades-data.ts` loads and
scopes quotes already (`TRADES_QUOTES_QUERY_KEY` `:105`, `sumQuoteCents` `:198`,
`scopeTradesData` `:279`). Read the **scoped** set so the figure follows the site
scope like every other number on the screen.

**Styling:** new `th-hero-sub2`, smaller than `th-hero-sub` (16px / weight 300).
Suggest 13px, dimmer than `NAV_DIM`, `margin-top:4px`. Must read as secondary to
"revenue collected", not as a competing metric.

**Decision:** show period-scoped value and count; see §6.

---

## 2. Client / tenant profile panel — REVISED after Oliver's clarification

> "when I on one of the clients, on the right side of the screen that's empty, I
> want the profile to appear there while the rest of the page remaining, I don't
> want it to open another page for the actual profile page."
>
> Clarification: "i want the tenant profile page to appear on the right side with
> everything over the background with no boxes or anything around it, just layer
> it all on the tablet background not having any over background over it"
>
> "on the left side, have the selected profile just a slight highlighted box"

**My first pass got this wrong in three ways.** It planned to port only the hero
card and timeline, it only removed the *outer* card background, and it assumed
trades-only. Corrected below.

### 2.1 It is the whole profile page, not an extract

Port the **entire** mobile profile page into the right-hand region — not a summary
of it. Inventory of `client/src/pages/trades/client-profile.tsx`:

| Section | Lines | Desktop |
|---|---|---|
| Top bar: back ‹, "CLIENT PROFILE", edit ✎ | 507-516 | back **dropped** (list stays visible); title; edit is deferred per §6 |
| Hero: avatar, "PRIMARY CLIENT", name, status pill | 520-535 | keep, unboxed |
| Field grid: site / invoice via / active work / contact / notes | 536-542 | keep, unboxed |
| "ACTIVITY TIMELINE" header + event count | 543-546 | keep |
| Timeline: connector, node dots, event rows, paid cards | 553-600+ | keep, unboxed |
| Edit bottom sheet (modal + backdrop blur) | 264-340 | see §6 |

### 2.2 The "no boxes" rule — every surface to strip

> "no boxes or anything around it, just layer it all on the tablet background not
> having any over background over it"

This is stronger than "drop the outer card". **Every** container fill goes. The
ones that exist today, all of which my first pass would have left in place:

1. **Page background** — `screenStyle` `C.white` / `appStyle` `C.cream` (`:344-345`). Gone; the navy canvas shows through.
2. **Hero card** — `background: C.ink, borderRadius: 24, padding: 20px 20px 22px` (`:520`). Gone.
3. **Each field tile** — `HeroField` is `background: rgba(255,255,255,0.07), borderRadius: 12, padding: 10px 12px` (`:179`). **Every field is its own box today.** All gone.
4. **Paid-event card in the timeline** — `background: C.panel, borderRadius: 16, padding: 14px 15px` (`:566`). Gone.
5. **Top-bar circular buttons** — 34px `C.gray` circles (`:509`, `:513`). Gone or restyled; the desktop has no back button at all.

**What is NOT a "box" and should stay** — these are content, not chrome:
- the 50px avatar circle (`:522`) — it is an avatar
- the timeline connector rule and node dots (`:221-222`) — that is the timeline's structure
- the small 24px event-type icon chips (`:585`)
- **the status pill** (`:170`) is a genuine judgement call — it is a badge whose
  fill carries the status colour. Keep it because stripping its
  fill destroys the status signal; see §6.

Structure is then carried entirely by **type hierarchy, spacing and dividers**,
not fills. Expect to add vertical rhythm (label/value pairs, generous
`margin-bottom`) to compensate — without the tiles, a naive port will read as an
undifferentiated wall of text. This is the main design risk in §2.

### 2.3 Colour inversion — the part that is easy to miss

The mobile profile is a **light** screen: cream page, `C.ink` (dark navy) text,
white cards. The desktop canvas is **dark navy**. So this is not a copy — every
colour must be re-mapped to the desktop palette already used by
`trades-clients.tsx`: `TEXT_SOFT` `#F4F6FF`, `ACCENT` `#5E9EFF`, `ACCENT_SOFT`,
`NAV_DIM`, plus the `STATUS_DOT` map for status colours.

Do **not** import the mobile `C.*` palette. Any value copied from
`client-profile.tsx` will be dark-on-dark and invisible. Audit every colour.

### 2.4 Layout

`.tc-body` is `padding: 26px 52px 0` on the 1180px canvas → 1076px of content.
`.tc-list` is `width: 400px` (`:407`). The free region is therefore roughly
**x 452 → 1128, ~676px wide** — the empty right side Oliver means.

- Panel top aligns with the **list top**, not the scope pill.
- Available height ≈ the list's `max-height: 490px` band, but the timeline can be
  long: the panel needs its own scroll (`overflow-y: auto`, hidden scrollbar, as
  `.tc-list` does) and must not push the 813px canvas.
- Gap between list and panel: suggest 52px, matching the body padding.

### 2.5 Data

Mobile runs five queries (`client-profile.tsx:363-394`): client, events, invoices,
quotes, schedules. On desktop **quotes and invoices are already loaded** by the
directory through `trades-data.ts` — filter those by client rather than refetching.
Genuinely new:

- `/api/trades/clients/:id/events` — **required**, nothing else loads it.
- `/api/trades/clients/:id` — only if the panel needs fields the directory row
  lacks (notes, preferred channel). Check `buildTradesClientRows` first.

Add both through `desktop/data/trades-data.ts` on the **mobile query keys**, per
the handoff rule that every trades screen reads through that layer — that is what
keeps a client's status identical across home, directory and terminal.

Property equivalents: `/api/property/tenants/:id` + its events (confirm paths
against `client/src/pages/property/tenant-profile.tsx`).

### 2.6 Selection, not navigation

`ClientRow` currently calls `onOpen(\`/trades/clients/${row.id}\`)` (`:364`).
Replace with local `selectedClientId` state. **Leave the
`/trades/clients/:id` and `/property/tenants/:id` routes intact** — mobile uses
them and they are the deep-link targets.

**Decide:** should the desktop URL still reflect the selection (so a selected
client is linkable/refreshable)? Recommendation: yes, but *without* unmounting the
directory — a shallow route or query param. Use the `?client=<uuid>` decision in §6.

### 2.7 Animation

> "with a bounce pop in cascading effect"

Mobile already implements exactly this: `pt-bounce` / `pt-slide-top` with a
`--pt-d` delay custom property per element (`:517`, `:543`, `:551`). **Reuse that
stagger pattern.** The directory's own `popIn` keyframe
(`cubic-bezier(.34,1.42,.5,1)`, on `.tc-list` `:407`) is the bounce curve to match.

- Cascade order: hero → fields → timeline header → timeline rows, ~40-50ms apart.
- **Re-trigger on every client change**, not just first mount — key the panel on
  the selected id so React remounts it.
- Cap the stagger: with 10 timeline events at 50ms the last arrives 500ms late.
  Either cap total stagger (~300ms) or stagger only the first few rows.
- Honour `prefers-reduced-motion`.

### 2.8 Selected row highlight

> "just a slight highlighted box"

`.tc-row:hover` is `rgba(94,158,255,0.06)`. Selected should be slightly stronger —
suggest `rgba(94,158,255,0.12)`, existing 10px radius — and must stay
distinguishable from hover on a row that is both. Set `aria-current="true"`.

### 2.9 Both verticals — build it once

Oliver said "client side" but wrote **"tenant profile page"**. Property has a
structurally identical mobile page: `client/src/pages/property/tenant-profile.tsx`
uses the same `pt-hero` dark card + `borderRadius: 24` (`:239`), the same
`rgba(255,255,255,0.07)` field tiles (`:76`, `:260`), and the same "activity
timeline" section (`:294`). Both desktop directories navigate away identically
(`property-clients.tsx:258` → `/property/tenants/:id`).

**Recommendation: build one shared panel component and use it in both 3b and 2b.**
Reasons: the two screens have the identical empty-right-side layout, the content
shapes match, Oliver has previously wanted 2b/3b consistent (the hero-count
ruling), and building it twice guarantees drift. This shared approach is the decision in §6.

Shape it like `DesktopSettingsPage`: one component, a `vertical` prop, thin
per-vertical wrappers.

### 2.10 Empty state

Nothing is selected on first load. Recommendation: leave the right side empty
rather than adding a "select a client" placeholder — the design has no such
element. This empty state is the decision in §6.

### 2.11 Existing tests

`client/src/desktop/client-directory-boundaries.test.tsx` (untracked, in flight)
covers this screen. Read it before changing behaviour and update it in the same
commit.

---

## 3. Trades terminal — default mode + morphing rail indicator

> "I want the normal screen it starts on to be the + button."
>
> "on the middle action bar, as its start of the + button selected, when you click
> to another button I want a slurping, oozing, smooth moving, morphing of the light
> blue circle that moves to which ever button is pressed. the animation must be
> smooth"

**File:** `client/src/desktop/pages/trades-terminal.tsx`

### 3.1 Default mode
`:106` is `useState<Mode>("invoice")` → `"keypad"`, the `+` button
(`railBtn("keypad", true, <path d="M12 5v14M5 12h14" />)`, `:655`).

Check what the compose block renders for `mode === "keypad"` on first paint with
no client selected — the `invoice` default may have been masking an empty state.

### 3.2 The indicator is static today — this is the real work

`.tt-rail-big` (`:1091`) is the light blue circle, applied via the `big` boolean
passed to `railBtn` and **hardcoded to the keypad button**. It is styling on one
button, not a selection indicator, so it cannot currently move. Rebuild as a
single travelling element.

1. **Uniform buttons.** Make all five `.tt-rail-btn`46px; the blob becomes the only
   large element (54px). Travel math becomes trivial and the morph reads cleanly.
   - Rail geometry: `padding: 30px 0`, `gap: 40px`, 46px buttons → centre of button
     *i* = `30 + i*86 + 23` → **53, 139, 225, 311, 397**; rail height
     `30*2 + 5*46 + 4*40` = **450**. Derive from the constants in code; do not
     hardcode five magic numbers.
   - **Consequence:** `+` loses permanent size emphasis — big only while selected.
     As the new default it is big on arrival. This uniform geometry is the decision in §6.
2. **One absolutely-positioned blob** inside `.tt-rail`, behind the icons; active
   icon inverts colour.
3. **The "slurping / oozing" quality.** A plain translate reads mechanical. Use the
   **gooey SVG filter** on the blob's container —
   `feGaussianBlur stdDeviation≈8` → `feColorMatrix` alpha `20 -9` — combined with
   **squash-and-stretch** (scale along the travel axis mid-flight, settling to 1).
   The stretch seen through the blur is what produces the ooze.
4. **Easing:** "smooth", not springy — a long ease such as
   `cubic-bezier(.65,.02,.28,1)` over ~420-480ms. Avoid the overshoot bounce used
   elsewhere on these screens; overshoot fights the oozing read.
5. `prefers-reduced-motion` → jump to target, no morph.

**Trap:** the canvas is `transform: scale(...)`. Transforms *inside* it are fine —
only **pointer** deltas need dividing by scale (handoff §4). No scale math here.

**Verify in the nix Chromium** used by the shot scripts: SVG filters inside a
scaled, transformed container are exactly where renderer differences appear.
Capture a mid-transition frame.

---

## 4. Analytics sheet rest position — ALL verticals

> "this goes for every single analytics page for the tablet/desktop pages. I want
> the white slider box to start in the middle just under the bottom of the graph."

**Files (identical geometry in all three):**
- `retail-analytics.tsx:62-64` · `trades-analytics.tsx:66-68` · `property-analytics.tsx:56-58`

```ts
const SHEET_H = 664;
const PEEK    = 152;
const CLOSED  = SHEET_H - PEEK;   // 512
```
The sheet is `absolute; bottom:0; height:664` in the 813px main area, so its
untranslated top is `813 − 664 = 149` and at rest it sits at `149 + 512` = **661** —
a 152px strip.

**Target:** rest position with the sheet's top edge just below the chart's visual
bottom.

**Derivation — do not eyeball:**
```
desiredSheetTop = chartVisualBottom + gap        // gap ≈ 16-24px
CLOSED_new      = desiredSheetTop − 149
```

`chartVisualBottom` is **not** the chart container's bottom — the svg overscans.
Retail places it `top:-131px; height:301px` in a 266px container, so the fill
baseline is at chart-local **y = −131 + 301 = 170**. Trades is `top:-47; height:221`
→ **174**. Property must be measured. Per page:
`chartVisualBottom = chartContainerTop + localBaseline`.

**Method:** with the dev server up, measure once in the nix Chromium —
`.ra-chart`/`.ta-chart`/`.pa-chart` `getBoundingClientRect().top` relative to
`.tapt-desktop-main`. The canvas is a fixed 1180×880 with no responsive reflow, so
the result is a **stable constant**: record it per page with the derivation in a
comment. Do **not** compute at runtime — `CLOSED` is used in five places including
the drag clamp (`:394`) and snap (`:402`), and a runtime value complicates all of them.

**Knock-ons:**
- **Drag clamp** `Math.max(0, Math.min(CLOSED, …))` — still correct, `CLOSED` is smaller.
- **Snap threshold** `dragY < CLOSED / 2` — a smaller `CLOSED` means the sheet snaps
  open on a shorter drag. Re-tune if twitchy.
- **`historyStart` preference** (Settings → Dashboard Preferences) starts the sheet
  expanded; that path (`sheetOpen` → `y = 0`) is unaffected, but confirm the two
  settings still make sense together.
- **Peek content** — 152px was sized to show the sheet header plus first rows; a
  taller peek shows more. Check nothing was positioned assuming 152.
- **Sheet modes** — `history` / `tiles` / `filters` all render inside the sheet.
  Check each at the new rest height.

---

## 5. Verification

```bash
npx tsc --noEmit
npx vite build
node scripts/verify-desktop-p0.mjs
npx jest client/src/desktop client/src/pages/__tests__/smoke-tests.test.tsx
node scripts/desktop-shots/shot-trades-home.mjs
node scripts/desktop-shots/shot-trades-clients.mjs
node scripts/desktop-shots/shot-property-clients.mjs
node scripts/desktop-shots/shot-trades-terminal.mjs
node scripts/desktop-shots/shot-retail-analytics.mjs
node scripts/desktop-shots/shot-trades-analytics.mjs
node scripts/desktop-shots/shot-property-analytics.mjs
```

- §4 touches all three verticals — **all three analytics screens** re-shot at both
  device classes, not just trades.
- §2, if shared (§6), re-shoots **both** directories.
- §2 needs a shot per selected client to prove the cascade re-triggers, plus one
  with a long timeline to prove panel scrolling.
- §3 needs at least two rail positions and ideally a mid-transition frame.
- Shot scripts share `scripts/desktop-shots/trades-fixtures.mjs`; register extra
  `page.route` handlers **after** the shared ones — Playwright matches the most
  recently registered first.

---

## 6. Codex review decisions — use these unless Oliver overrides them

1. **Jobs quoted:** show both period-scoped value and count, for example `$28,400 quoted · 14 jobs`; it follows the active revenue range and site scope.
2. **Status pill:** keep it. It is semantic status, not container chrome.
3. **Profile actions:** ship the inline panel read-only first. Edit/archive remain on the mobile/deep-link profile until an unboxed desktop editing design is approved.
4. **Selection URL:** use `?client=<uuid>` on the directory route. Validate it against the scoped visible list before querying; never mount the mobile profile route inside desktop.
5. **Vertical scope:** build one shared unboxed profile panel for Property and Trades, with thin adapters and separate domain/API types.
6. **Initial panel:** leave it empty; do not invent placeholder copy.
7. **Rail buttons:** use uniform geometry; only the active action receives the travelling blob.
8. **Analytics gap:** target 20 logical pixels. Accept 16–24 only for optical alignment and record the final constant per vertical.
9. **Animation:** use one travelling CSS/SVG-filter blob. No continuous filter or JavaScript frame loop, and no morphing under `prefers-reduced-motion`.

---

## 7. Suggested order

1. **§0 Quick Invoice** — restore desktop/mobile payment-flow parity first.
2. **§1 trades home** — smallest, isolated, proves the scoped-quote read.
3. **§4 analytics rest position** — mechanical; three files, one constant each.
4. **§3 terminal** — default mode (one line) as its own commit, then the morph.
5. **§2 profile panel** — largest and most design-sensitive; last, so nothing is
   blocked behind it. Using the shared panel decision (§6), build the component against trades first,
   then wire property in a second commit.

One commit per item with verification results stated. Never `git add -A`; exclude
`.claude-home/**` and `.claude/settings.local.json`.
