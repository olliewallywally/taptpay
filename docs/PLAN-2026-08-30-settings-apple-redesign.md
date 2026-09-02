# Plan — Apple-style settings redesign (desktop/tablet)

Date: 2026-08-30
Branch: `feat/tablet-desktop-app`
Status: **SUPERSEDED — wrong target.** §1–§14 below planned and built this against
`client/src/desktop/DesktopSettingsPage.tsx` (the tablet/desktop settings screen).
Oliver's reference image was a phone mockup and he meant the **mobile** settings
page (`client/src/pages/settings.tsx`) the whole time — confirmed after he flagged
it directly ("this was for mobile only not desktop"). The desktop implementation
was reverted with `git checkout --` before it was committed, so `DesktopSettingsPage.tsx`
is back to its pre-existing accordion design, untouched. **§15 is the actual,
current outcome** — the same redesign, rebuilt against the mobile page. §1–§14 are
kept as-written below for the record (the visual-language and IA reasoning in §4/§6/§7
carried over almost unchanged once retargeted), not because desktop was touched.

Read `docs/HANDOFF-2026-07-28-tablet-desktop-app.md` and
`docs/PLAN-2026-08-10-finish-review-and-fix.md` first if you haven't — this plan
adds new scope on top of that work, it doesn't change their step order or their
Step 0 (apply pending migrations) priority. This redesign touches no schema and no
query that needs the migrations applied, so it isn't blocked by that plan, but the
general repo hygiene rules there (single dev server on :5000, nix Chromium, never
`git add -A`) apply once this gets built and screenshotted.

---

## 0. Reference

Oliver-provided reference: `docs/designs/settings-page-design.png`. It's a generic
personal-finance app's iOS "Profile" screen — grouped, rounded-corner white card
lists of icon + label + chevron rows on a light background, one boolean row with a
native-style toggle, a back-arrow + centered-title header. The screenshot itself is
a *sub-page* (it was reached by tapping something), not the list it was pushed from
— but the pattern is unambiguous: this is the standard iOS Settings.app
list-into-detail idiom.

**Unrelated but worth your attention:** this file is already sitting at
`docs/designs/settings-page-design.png` on the current HEAD (`1707387`), and it's
byte-identical to the image you just attached
(`attached_assets/image_1788131259902.png`, md5 `b148c790…`). That's fine. What's
not fine: commit `1707387` — authored by "Replit Agent", not this session, already
on HEAD before this conversation started — is titled *"Update RXA plan rendering
script and regenerate plan preview assets"* but actually touches 316 files,
including the **entire `.claude-home/` directory**: `.claude-home/.credentials.json`
and every `.claude-home/sessions/*.json`/`*.key` file are committed as real
`100644 blob` objects, not symlinks. Neither `.claude-home/` nor
`.claude/settings.local.json` is in `.gitignore`. The branch is 8 commits ahead of
`origin/feat/tablet-desktop-app` (GitHub hasn't seen it yet), but there are two other
remotes (`gitsafe-backup`, a Replit SSH remote) whose sync behavior I haven't
checked. I'd treat any credential in that file as potentially exposed and rotate it,
independent of whatever you decide to do with the git history. I didn't touch this —
flagging it, not fixing it, since rewriting shared history is exactly the kind of
thing that needs your sign-off first. Happy to help clean it up once you've decided
how.

---

## 1. Scope

This plan covers `client/src/desktop/DesktopSettingsPage.tsx` only — the one shared
settings screen behind design screens 2e/3e/4e (desktop + tablet, all three
verticals). The wrappers (`desktop/pages/{retail,property,trades}-settings.tsx`)
stay two-line pass-throughs; nothing here changes their contract.

**Not in scope: `client/src/pages/settings.tsx` (mobile).** The reference image
happens to be phone-shaped, but the two things you named as untouched — "the tiles"
and "the customer payment page button" — are specifically desktop-settings
vocabulary: `.ds-modes` and `.ds-pay-page` in this file. Mobile has its own,
differently-built mode switcher and payment button. On top of that, this branch's
own plan has a hard rule: *"Mobile pages and their code MUST NOT change"*
(`PLAN-2026-07-24-tablet-desktop-app.md` §3). So I'm reading "our settings page" as
the desktop one, and building this plan entirely inside `desktop/`. **If you
actually meant the mobile page too, say so now** — it's a separate file, a separate
set of constraints (that MUST-NOT-change rule would need to be deliberately waived),
and effectively a separate plan.

---

## 2. What stays exactly as it is

Byte-for-byte, same position, same markup, same behavior:

- **`.ds-pay-page`** — the "Customer Payment Page" button
  (`DesktopSettingsPage.tsx:579-587`).
- **`.ds-modes` / `.ds-mode`** — the three Retail/Property/Trades tiles
  (`DesktopSettingsPage.tsx:589-615`).

Everything else in the file is fair game, including Log Out — you didn't exempt it
(§5).

---

## 3. Current shape → target shape

Today the right column is a single page with an accordion: six sections (the
`SECTIONS` array, `DesktopSettingsPage.tsx:65-72`), only one open at a time, all
inline on `/settings`, Business Details open by default. `openSec` is the state that
drives it.

**Target:** a list → detail pattern. `/settings` lands on a scrollable list of
grouped, rounded rows (icon + label + chevron). Tapping a row swaps the content area
to a dedicated sub-page for that section — back arrow + title header, same fields,
same mutations that section already has. This is a restyle plus an IA change, not a
rebuild: every query, mutation, and validation in the six sections is reused
verbatim.

One thing already in this file works exactly like the target pattern: the **Payment
Board Builder card** (`.ds-board`, line 625-634) is already "a row that goes to its
own page" — it navigates to `/board-builder`. This plan is mostly about extending
that same idea to the six accordion sections, not inventing a new interaction from
scratch.

Row → destination map (the grouping is mine — the reference app's own items,
*Badges*, *Language*, don't mean anything for a payments product; I'm porting the
**pattern**, not its menu):

| Group | Row | Goes to | Logic reused |
|---|---|---|---|
| Identity | Business avatar / name / status | Account sub-page | new — see §6 |
| — | Payment Board Builder | `/board-builder` (unchanged) | unchanged, already this pattern |
| Business | Business Details | own sub-page | `sec.k === "business"` body, verbatim |
| Business | Account | own sub-page | `sec.k === "account"` body, verbatim |
| Money | Subscription & Billing | own sub-page | `sec.k === "billing"` body, verbatim |
| Preferences | Dashboard Preferences | own sub-page | `sec.k === "prefs"` body, verbatim |
| Preferences | Transaction Notifications | own sub-page | `sec.k === "notifs"` body, verbatim |
| Help | Tutorial & Help | own sub-page | `sec.k === "tutorial"` body, verbatim |
| — | Log Out | isolated destructive row, bottom | same `logout()`, restyled (§5) |

Untouched, sitting exactly where they are now, below/around this list: the Customer
Payment Page button and the three mode tiles.

---

## 4. Visual language — adapt the pattern, not the palette

The reference is light: white cards, light-gray page, black text. This app is dark:
every one of the other 14 screens, this page's own Board Builder card, and the two
elements you're keeping (tiles, payment button) are navy/glass. Cloning the
reference's literal colors would make Settings look like a different product bolted
onto the other 14 screens. **I'm porting the structure (grouped rounded cards,
icon-badge + label + chevron rows, hairline dividers, drill-down sub-pages, a
back-arrow header) onto the existing navy/glass system**, not the light theme. This
is the single biggest judgment call in this plan — flagged again in §12 if you want
it done the other way.

Concretely, reusing tokens already defined at the top of the file (`ACCENT`,
`NAV_DIM`, `ACTIVE`, `NAVY`, `RED`, `OPEN_INK`):

- **Group container** — the existing `.ds-board` treatment, generalized:
  `border-radius:20px; background:rgba(255,255,255,0.06); border:1px solid
  rgba(255,255,255,0.1); backdrop-filter:blur(16px); overflow:hidden;`
- **Row** — `.ds-board`'s own anatomy (icon badge, title, optional sub-caption,
  trailing chevron) becomes the shared primitive, used both standalone (Board
  Builder, as today) and stacked inside a group with a hairline
  (`border-bottom:1px solid rgba(255,255,255,0.08)`, omitted on the last row).
- **Icon badge** — `width:34px;height:34px;border-radius:10px;
  background:rgba(94,158,255,0.14)`, same stroke-1.8/round-cap SVG style already
  used for the mode-tile icons. Six new small icons needed (business/building,
  card, sliders, bell, shield-or-user, life-ring) — simple outline glyphs matching
  the existing icon set, not an icon library.
- **Chevron** — static right-facing chevron, `rgba(255,255,255,0.35)`, no rotation
  (rotation was for the accordion's open/close; a forward chevron doesn't animate).
- **Toggles** — `.ds-switch`/`.ds-knob` unchanged; they only move, from the notifs
  accordion body into the Notifications sub-page.
- **Sub-page header** — a back button (reuse the circular hit-target from
  `.ds-sec-chev`, chevron pointed left) + section title, sitting where `.ds-board`
  sits today, replacing the whole right-column content while a section is open.

**Deliberately not porting:** the reference's search icon (top-right of its header)
— eight settings rows don't need search, and adding a search box that filters
nothing real would be exactly the kind of invented affordance the branch's own
conventions (`docs/HANDOFF-2026-07-28…` §4, "no mock data anywhere") warn against.
Also not porting the black "Upgrade to Pro" promo card — see §12.

---

## 5. Log Out

Reference apps don't show a sign-out row in this screenshot (it's cut off below the
fold), but the iOS convention — including Apple's own Settings.app — is an isolated,
single-row card, visually separated from everything above it, red text, no icon
badge or plain danger-colored icon. Proposing: same `logout()` handler
(`DesktopSettingsPage.tsx:519-522`), restyled as that isolated row instead of the
current standalone pill button, kept at the very bottom, below the tiles and payment
button per §2 (it's not one of the two exempted elements, so it moves/restyles
freely).

---

## 6. Identity row

Today `.ds-id-row` + `.ds-name` (avatar, ACTIVE/PENDING status pill, business name)
is a static header — it doesn't navigate anywhere. The reference's equivalent (top
card: avatar, name, email, chevron) is itself a row that pushes a profile sub-page.
Proposing to match that: make the identity block a tappable row into the Account
sub-page (email, phone, account status, change password — the same fields already
in `sec.k === "account"`). Low-risk, matches the reference precisely, and gives
"Account" a natural entry point beyond the grouped list.

---

## 7. Navigation mechanism — the one real architecture decision

Two ways to make "own page" real:

**A — real routes** (`/settings/business`, `/settings/billing`, …). Most literal
reading of "own page": deep-linkable, browser back/forward works, matches this app's
existing convention that every one of the 15 screens is its own route. Cost: new
`<Route>` entries in `App.tsx`, a mobile-fallback decision for each (these routes
shouldn't exist for `deviceClass === "mobile"` — probably redirect to `/settings`),
and new page keys or `desktopTarget` handling in the tutorial registry for anchors
that currently key off the single "settings" page.

**B — internal view-state** (recommended). One new piece of state,
`activeSection: SectionKey | null`, replacing `openSec`. `null` renders the list;
non-null swaps the right column to that section's sub-page. Back button just clears
it. No new routes, no new lazy chunks, no App.tsx changes, no new tutorial page key
— existing `data-tutorial-id` anchors move from the accordion container to the new
row (§8) and keep resolving under the same "settings" page key. Visually and
interaction-wise this reads exactly like "its own page" (full content-area replace,
dedicated header, back arrow) even though the URL doesn't change.

**Recommendation: B.** Two reasons beyond the smaller diff: `PLAN-2026-08-10…` §2d
records that chunk-loading resilience for the *rest* of the app (`lazyWithRetry`,
the global error boundary) is explicitly unfinished — Step 4, still open — so this
isn't the moment to add more lazy-loaded route surface area if it can be avoided.
And B is trivially upgradable later: a `?section=business` query string can be
layered on top of the same state without restructuring anything, if you want
shareable links to a specific section.

---

## 8. Tutorial anchors — migration is mechanical

`tutorial-registry.ts:107-114` ("settings" page) has five steps. Four target
elements that move under this plan; one doesn't:

| Step | Current target | New home |
|---|---|---|
| "Keep your details current" | `data-tutorial-id="settings-business"` on the accordion container | move to the Business Details **row** |
| "Set a daily target" | `data-tutorial-id="settings-goal"` on the accordion container | move to the Dashboard Preferences **row** |
| "Keep payments ready" | `data-tutorial-id="settings-billing"` on the accordion container | move to the Subscription & Billing **row** |
| "Restart whenever you need" | `data-tutorial-id="settings-tutorial-help"` | move to the Tutorial & Help **row** |
| "Share your payment page" | `data-testid="button-customer-page"` | **unchanged** — that button doesn't move (§2) |

All four anchors already sit on a container that's always rendered whether the
section is open or not (that's *why* they currently work regardless of accordion
state) — the row they're moving to has the identical property, always rendered in
list view. Same selector strings, different element. No registry logic changes,
just where the attribute lives in the JSX.

---

## 9. Component plan

New, inside `client/src/desktop/`:

```
components/
  SettingsGroup.tsx     // rounded glass container, renders children with dividers
  SettingsRow.tsx        // icon badge + label + (sub-caption | value | chevron | switch)
  SettingsSubPage.tsx     // back-arrow + title header, wraps a section's body
```

`SettingsRow` should cover both the standalone-card use (Board Builder) and the
grouped-list use (everything else) via a `variant` prop, rather than keeping
`.ds-board` as a one-off — it's the same anatomy today in all but CSS.
`DesktopSettingsPage.tsx` keeps every query/mutation/state hook as-is; only the
render tree in the `return` (currently lines 562-1144) changes shape, plus the new
`activeSection` state replacing `openSec`.

---

## 10. Build order

Matches this branch's own convention — one committable slice at a time, verify
after each:

1. `SettingsGroup` / `SettingsRow` / `SettingsSubPage` primitives + their CSS, no
   wiring yet.
2. List view: identity row, Board Builder card (unchanged behavior, ported to the
   new row primitive), the six section rows in their four groups, Log Out row.
   Tiles and payment button untouched, unmoved.
3. Wire `activeSection` + back navigation; move each section's existing JSX body
   into `SettingsSubPage` one at a time (Business → Account → Billing →
   Preferences → Notifications → Tutorial & Help), reusing every hook verbatim.
4. Tutorial anchor migration per §8; run the tutorial registry test.
5. Rewrite `DesktopSettingsPage.test.tsx` (§11).
6. Screenshot both device classes against the new design, using the existing
   `scripts/desktop-shots/` pattern (copy the closest settings-adjacent script,
   swap fixtures) — this branch's `probe-cascade.mjs` and `probe-transitions.mjs`
   gates should also be re-run against `/settings` since the page's animation
   surface is changing.

---

## 11. Test impact

`DesktopSettingsPage.test.tsx` (498 lines, 11 cases) drives most tests by opening an
accordion section (via `openSec`) and asserting on its body. Every case needs its
"open the section" step swapped for "click the row, land on the sub-page" — the
assertions underneath (fields present, mutation payloads, disclosures, billing
history rendering, card-session confirmation) don't change, since the underlying
JSX/logic doesn't change, only its container. Mechanical rewrite, not new coverage,
except: worth adding one small new test for back-navigation (enter a section, hit
back, confirm the list is showing and state from the sub-page didn't leak).

---

## 12. Decisions for you — raised as one list, per this branch's own convention

Per `docs/HANDOFF-2026-07-28-tablet-desktop-app.md` §6, deviations get raised
together rather than fixed silently. These are the judgment calls this plan makes;
say the word on any of them and I'll build it the other way:

1. **Palette** — navy/glass adaptation, not the reference's literal light theme
   (§4). This is the load-bearing one; it shapes everything else.
2. **Identity row becomes clickable** → Account (§6), instead of staying a static
   header like today.
3. **No "Upgrade to Pro" card.** The reference's promo card sells a real feature
   set (shared budgets, AI insights) that has no TaptPay equivalent. Subscription &
   Billing already surfaces plan/upgrade as its own row; I'm not fabricating a
   second marketing surface for it. If you want a real conditional upsell (e.g. a
   nudge only for Solo-plan merchants), that's a small addition, but it needs real
   copy and a real trigger condition from you, not invented ones.
4. **Log Out becomes an isolated destructive list row**, not the current standalone
   pill (§5).
5. **Navigation is internal view-state, not new routes** (§7) — recommended for the
   smaller diff and because the rest of the app's chunk-resilience work is
   mid-flight, but upgradable later without a rewrite.
6. **No search box** and **no top-level toggle row** ported from the reference —
   neither has a real target in an 8-row settings page (§4).

---

## 13. Verification

Same loop as every other screen on this branch
(`docs/HANDOFF-2026-07-28-tablet-desktop-app.md` §3):

```bash
npx tsc --noEmit
npx vite build
node scripts/verify-desktop-p0.mjs
npx jest client/src/desktop/DesktopSettingsPage.test.tsx client/src/__tests__/tutorial-registry.test.ts
```

Plus a screenshot pass at both device classes compared against the new grouped-list
layout (there's no reference PNG for this one the way the original 15 screens had
`docs/design/desktop-app/screens/*.png` — the comparison target is this plan's §3/§4
description and the reference image itself, not a pixel-exact port).

---

## 14. Outcome — Oliver's rulings and what shipped (2026-08-30)

Oliver ruled on the plan within the same conversation, before any of §12's defaults
were built. Two of the six proposed defaults were overridden; the rest matched:

| # | §12 proposal | Ruling | What shipped |
|---|---|---|---|
| 1 | Navy/glass adaptation | **Overridden.** "we dont need navy blue or glass etc... make it look exactly like that design" | Literal light theme: `#F1F2F5` page background, white (`#FFFFFF`) cards with a `1px #E7E8ED` border and a hairline shadow, near-black text. New tokens `LIGHT`/`CARD`/`CARD_BORDER`/`DIVIDER`/`MUTED`/`CHEV` added alongside the existing navy palette consts in `DesktopSettingsPage.tsx`. The two exempted elements (tiles, payment button) and Log Out keep their original dark styling by request, sitting on the new light page — see #4. |
| 2 | Identity row becomes clickable → Account | Not commented on — built as proposed | `.ds-identity` is a button, `aria-label="Account"`, opens the Account sub-page |
| 3 | No "Upgrade to Pro" card | Confirmed — "just remove that for now and we can add it back in later" | Omitted, with a code comment at the call site marking where it would return and what it needs (real copy, a real trigger condition) |
| 4 | Log Out becomes an isolated destructive list row, separated from the tiles/payment button | **Overridden.** "at the bottom of the page have the log out, customer payment page, and vertical buttons" — grouped together, not separated | Log Out stays in the same fixed bottom cluster as the two exempted elements (`.ds-bottom`), unchanged styling, unchanged position relative to them. That cluster is **persistent across the list view and every sub-page** (not just the list) — closest reading of "at the bottom of the page" combined with the original left-column behavior, where it was always visible regardless of which accordion section was open |
| 5 | Internal view-state, not new routes | Not commented on — built as proposed | `activeSection: SectionKey \| null`, default `null` (lands on the list, not pre-opened into Business Details the way the old `openSec` default did) |
| 6 | No search box, no top-level toggle row | Not commented on — built as proposed | Neither exists |

One structural change beyond §12, driven by the "make it look exactly like the
image" instruction rather than a specific ruling: the two-column layout (left
identity/tiles/logout column, right accordion column) is gone. The page is now a
**single centered column** (`max-width:568px`), matching the reference's actual
shape — a two-column split would not have looked like the image no matter what
colors it used. Within that column: identity card → four grouped-row cards
(Business Details · Subscription & Billing + Payment Board Builder · Dashboard
Preferences + Transaction Notifications · Tutorial & Help) → the fixed bottom
cluster. "Account" was dropped as a separate row in the grouped list since the
identity card already goes there — keeping both would have been two paths to the
same page.

**Built:** `client/src/desktop/DesktopSettingsPage.tsx` (full rewrite of the render
tree and `DS_CSS`; every query/mutation/hook from before is unchanged),
`client/src/desktop/DesktopSettingsPage.test.tsx` (10 tests updated for list→detail
navigation instead of accordion-open, same assertions), `scripts/desktop-shots/shot-retail-settings.mjs`
(shot sequence updated to click into and back out of each sub-page).

**Verified:** `npx tsc --noEmit` silent; `npx vite build` — `DesktopSettingsPage`
still lands in its own chunk, separate from mobile's `settings-*.js`; `node
scripts/verify-desktop-p0.mjs` passed; `DesktopSettingsPage.test.tsx` (10/10),
`tutorial-registry.test.ts` (12/12), `smoke-tests.test.tsx` (24/24) all pass;
screenshots taken at both device classes via the updated shot script and visually
compared against the reference.

**Not done, and not asked for:** the Business Details / Account / Subscription &
Billing / Dashboard Preferences / Transaction Notifications / Tutorial & Help
sub-page **bodies** were ported verbatim, unrestyled beyond the minimal
translucent-white→solid-light-gray background swap noted in §4 (necessary because
several of those backgrounds were designed to sit on the old sky-blue "open
accordion" fill and would have been near-invisible on plain white). They are not a
line-by-line redesign against the reference — the reference doesn't show any
sub-page bodies to redesign against. §7/§8's `data-tutorial-id` migration was
applied exactly as planned: `settings-business`/`settings-goal`/`settings-billing`/`settings-tutorial-help`
moved from the old accordion container onto the corresponding new row;
`settings-payment-page` didn't move, because that button didn't move.

**Then reverted in full** (`git checkout --`) once §1's scope assumption turned
out wrong. `DesktopSettingsPage.tsx`, its test file and the shot script are back
to exactly what they were before this plan — see §15.

---

## 15. The actual outcome — mobile (`client/src/pages/settings.tsx`), 2026-08-30/31

Same reference image, same "look exactly like it, keep the tiles/payment
button/log out at the bottom" instruction, retargeted at the real page. The
IA/visual reasoning in §3, §4, §6 and §7 above carried over almost unchanged —
mobile is the one that's actually phone-shaped, so if anything it fits better
there. Differences from the desktop version worth recording:

- **Grouping matches the reference more literally** than desktop's four groups did,
  because mobile's existing `SettingsSection` accordion already had a page
  background (`#F4F4F4`, now `#F1F2F5` to match the desktop attempt's tokens) and
  white cards (`bg-white`, `borderRadius: 22`) — the light theme was mostly already
  there. The Payment Board Builder card already had the reference's exact row
  anatomy (icon badge + title + sub + arrow, `rgba(4,13,109,0.08)` icon tint,
  `ArrowRight` from lucide) before this change touched anything; the new
  `SettingsItem` row is that same anatomy generalized into a reusable component.
  Icons reused what was already imported (`Building2`, `CreditCard`, `Printer`,
  `Bell`, `BookOpen`) plus two new ones (`SlidersHorizontal` for preferences,
  `UserCircle` for account) and one for the new back button (`ArrowLeft`).
- **Groups:** Business Details (own group) · Subscription & Billing + Payment
  Board Builder · Dashboard Preferences + Transaction Notifications · Tutorial &
  Help. Same as the desktop attempt's final grouping. Account is reached only via
  the identity card (no separate row), same reasoning as desktop §3.
- **Navigation is `activeSection: SectionKey | null` state**, same mechanism as
  the desktop attempt, chosen for the same reason (smaller diff, no App.tsx/route
  changes) plus one mobile-specific one: the Windcave hosted-card return hard-codes
  `res.redirect('/settings?section=billing&card=...')` server-side
  (`server/routes.ts:7014`, not touched). `useBillingCardReturn` reads
  `card`/`session` off `window.location.search`, confirms the card, then strips
  just those two params via `history.replaceState` — it never navigates. Real
  routes would have needed either a server change (out of scope) or careful
  handling to avoid racing that confirmation; state avoids the question entirely.
  `activeSection`'s initial value is computed from `?section=billing` once
  (replacing the old `openSections` seed + a separate `scrollIntoView` effect that
  is no longer needed since billing is now a full page, not a scroll target).
- **Bottom cluster** (Customer Payment Page button, the three mode buttons, Log
  Out — mobile's own colours: retail blue `#0055FF`, property navy `#040D6D`,
  trades ink) is untouched markup, always rendered after the list/subpage content,
  same as desktop's ruling.
- **The two accessible-name bugs caught on desktop reappeared identically here**
  and got the same fix: `SettingsItem` takes `aria-label={title}` so a trailing
  `value` (plan name on the Billing row) doesn't get folded into the row's
  accessible name; the identity button needed an explicit `aria-label="Account"`
  since its computed name from child text would otherwise be
  `"{initials} {businessName} {status}"`.
- **Tutorial anchors** (`tutorial-registry.ts:107-114`, the "settings" page,
  shared by mobile and desktop steps): `set-business` → Business Details row,
  `set-goal` → Dashboard Preferences row, `settings-tutorial-help` → Tutorial &
  Help row, `data-settings-section="billing"` → Billing row (now applied
  regardless of `isNativeApp()`, whereas the original only had it in the web
  branch — the native branch's tutorial step already fell back to
  `button-customer-page` when the primary target was absent, so this is strictly
  more consistent, not a behavior change). `button-customer-page` didn't move.

**Not done:** no new UI for the already-dead `windcaveApi`/`logoFile`/`uploadLogoMutation`/`deleteLogoMutation`
state and handlers — they were defined but wired to no visible JSX before this
change either; carried forward unchanged rather than treated as a cleanup
opportunity outside this task's scope.

**Verified:** `npx tsc --noEmit` silent after every edit; `npx jest client/src/pages/__tests__/smoke-tests.test.tsx client/src/__tests__/tutorial-registry.test.ts` — 36/36 passing; a scratch Playwright script (390×844, reusing `scripts/mobile-fixtures.mjs`) screenshotted the list view and three sub-pages (Business Details, Subscription & Billing, Account) — all matched the reference's structure, bottom cluster unchanged and present on every view, no page errors. The script was deleted after use rather than kept in the repo (unlike the desktop attempt, this doesn't have a corresponding permanent `scripts/desktop-shots/shot-*.mjs` convention to slot into).

**Not committed** — sitting in the working tree, same as everything else this
session, pending Oliver's review.
