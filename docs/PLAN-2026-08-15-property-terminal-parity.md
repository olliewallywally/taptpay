# Plan — Property terminal (2c) parity pass, tablet/desktop

Date: 2026-08-15
Branch: `feat/tablet-desktop-app`
Target file: `client/src/desktop/pages/property-terminal.tsx`
Reference implementation: `client/src/pages/property/property-terminal.tsx` +
`client/src/features/terminal/property/PropertyTerminalView.tsx`

This plan closes the gap found by the 2026-08-15 logic comparison between the
tablet/desktop property terminal and the phone one. It is written to be executed
top-to-bottom, one phase per commit.

**Tablet and desktop are the same code.** `App.tsx:906-909` routes both device
classes to `DesktopPropertyTerminal`; the only difference is that
`DesktopFrame` letterboxes desktop into a 13″ slate and lets tablet bleed full
width (`desktop.css:233`, `:255`). Everything in this plan lands on both. Where a
new control is touch-operated, the touch target rule in §3 applies.

---

## 0. Before writing any code

1. **Apply the three pending migrations first.** `CLAUDE.md` and
   `docs/PLAN-2026-08-10-finish-review-and-fix.md` make this Step 0 for any work
   in this tree. The tree is in a state that looks fine and is not.
2. The working tree currently carries an unrelated motion-token edit in this same
   file (`.pt-mode` animation → `var(--m-dur-ui)`, from
   `docs/PLAN-2026-08-15-motion-toning.md`). Do not revert it and do not fold it
   into these commits.
3. Dev server: **one instance on :5000 only** (memory `dev-server-single-instance`).
4. Never `git add -A`. Exclude `.claude-home/**` and `.claude/settings.local.json`.

---

## 1. Staying as it is — do not "fix" these

These are places the tablet/desktop terminal deliberately differs from the phone
and is either better or design-bound. They are closed.

| Behaviour | Why it stays |
|---|---|
| **Flat mark-paid list across all tenants** (`:684-717`) | Strictly better than the phone's tenant-first flow. It also makes the phone's "which invoice?" radio picker (`View:865-885`) unnecessary — **that item is dropped from the plan entirely**, not deferred. |
| **Contact-on-file check before sending** (`:305-312`) | Desktop is stricter than the phone, which lets the server reject. Keep the stricter path. |
| **Dollars-and-decimal keypad** (`desktop-keypad.tsx`) | Shared with 4c and 3c and already ruled on (handoff §6, `6067bd4`). The phone's cents-accumulator is a small-screen affordance. The live `$5,000.00` readout makes the model self-evident. |
| **Inline "request sent ✓" flash instead of a success screen** | The rail-and-panel model has no room for a full-screen success state, and the desktop user can see the row land in the left column immediately. Phase 2 fixes the *state reset* this leaves behind, not the pattern. |
| **Rail-driven mode switching** | The whole 2c design. Every new surface in this plan attaches to the rail or to the left column — never a modal over the frame. |
| **Whole-dollar hero figures** (`whole()`, `:69`) | Design. The 84px hero has no room for cents. |
| **Full scrollable request list** vs the phone's `slice(0, 12)` | Desktop has the height. Keep. |
| **The design's `+25%` growth pill stays dropped** | No data behind it (handoff §4, "don't trust the prototype's numbers"). |
| **Bill's pre-selected charge type** (`chargeType: "utilities"`) | The phone forces an explicit choice because its chips are a scroll away; on desktop all five chips are visible at once with the selection obvious. Design shows a selected chip. Phase 2 fixes the *description clobber*, not the default. **Flagged for Oliver in §7 — this is the one "keep" I am least certain of.** |

---

## 2. Being built — the queue

| # | Phase | What | Class of change |
|---|---|---|---|
| 1 | Money correctness | `owingCents`, live-status whitelist, archived-tenant names, honest `awaiting` label | bug — no new UI |
| 2 | Send-flow safety | keypad zero-guard, post-send reset, description clobber rule | bug — no new UI |
| 3 | Row actions | resend / edit-amount-&-resend / mark received / cancel, in an anchored popover | new surface |
| 4 | Deep links + remind | `?mode=` `?stack=` `?client=`, remind button on overdue rows | new behaviour |
| 5 | Bill completeness | due-date chips, attach-invoice upload | new controls |
| 6 | Split | toggle on rent + bill, split badges in rows | new controls |
| 7 | Automation mode | 6th rail button: schedules + overdue reminders | new mode |
| 8 | External reference | reference field on mark-paid | new control |
| 9 | Scope chip | wire it or remove it (§7 decision) | cleanup |
| 10 | Phone's dead `batch` screen | wire or delete — **not tablet work** (§8) | separate |

---

## 3. Design rules this pass must not break

The 2c design language is narrow. Every addition below was chosen to reuse
something already on the page rather than invent a new visual idea.

- **Canvas is 1180×880.** Header 66px + 1px divider, then `.tapt-desktop-main` at
  1180×813. A design `y` maps to `y - 66`. The right panel's usable height is
  **787px** (813 − the body's 26px top padding). The right panel's usable width is
  **466px** (1180 − 52 − 420 − 44 − 76 − 40 − 36 − 46). Existing blocks size to
  430–445px inside it; stay in that band.
- **Class prefix stays `pt-`.** One page-scoped CSS template literal at the bottom
  of the file. No new stylesheet, no Tailwind classes.
- **Palette is the file's ten constants** (`:22-33`). New states reuse them:
  pressed = `ACTIVE` background + `NAVY` text; unpressed = `ACCENT_SOFT` text on
  transparent with a `rgba(94,158,255,0.5)` border. Destructive = `RED`.
  Confirmed/positive = `GREEN`.
- **No `position: fixed`, ever.** The canvas is inside `transform: scale(...)`, so
  fixed positioning becomes scale-relative — the exact trap recorded against
  `ReportModal` in handoff §9 item 5. Every overlay in this plan is
  `position: absolute` inside a `position: relative` ancestor on the page.
- **No `window.confirm`.** It paints a browser chrome dialog over the simulated
  13″ frame. Destructive confirmation is two-step and in-surface (Phase 3).
- **Cascade rules.** `.dt-cascade > *` and `.dt-rise` ship `opacity: 0` under an
  `animation: … both` fill. A block that carries either class and never animates
  is *permanently invisible*, not merely un-animated. Any new top-level block in
  `.pt-left` shifts the existing `--dt-i` step numbering — the rail is `6` and the
  panel is `7` (`:759`, `:766`). Re-run `probe-cascade.mjs` after any structural
  change to the left column.
- **Do not animate a rail slot.** A transform on the slot makes it the containing
  block for the `position: absolute` rail and moves the rail (handoff §6, ruled).
- **Touch targets.** Tablet is `hasTouch`. New *primary* actions (popover items,
  toggles, remind buttons, schedule pause/cancel) are ≥ 40px on their short axis.
  New *chips* match the sizes already on the page (`.pt-freq-chip` 44px,
  `.pt-bill-chip` ~37px) — design consistency wins over a blanket 44px there.

---

## 4. The phases

### Phase 1 — money correctness (no visual change)

**Problem.** The hero figures and row amounts use `amountCents`, so a 4-way split
with 3 shares paid reports its full value as outstanding. The phone uses the
server-computed `owingCents` (`server/routes.ts:7443`). Separately, the live-set is
a blacklist rather than the phone's whitelist, and row names resolve from the
archived-filtered tenant list so an archived tenant's live invoice renders as
`"tenant"` / `"?"`.

**Extract the model.** Move the `useMemo` at `:113-154` into a new pure module,
matching the `desktop/data/*` convention used by `retail-reports.ts` and
`trades-data.ts`:

- `client/src/desktop/data/property-terminal-model.ts`
  - `export const PROPERTY_LIVE_STATUSES = ["pending_dispatch", "dispatched", "overdue", "dispatch_failed"] as const;`
  - `export function buildPropertyTerminalModel(invoices, tenants): { outstandingRent, outstandingExpenses, rows }`
- `client/src/desktop/data/__tests__/property-terminal-model.test.ts`

**Changes inside it:**

1. `owing(i) = i.owingCents ?? i.amountCents ?? 0`. Use it for both hero figures
   **and** `row.amt`, so the column and the heroes agree.
2. Live set = `PROPERTY_LIVE_STATUSES.includes(i.status)`, replacing
   `status !== "paid" && status !== "paid_external"` over non-voided rows.
3. Rent vs expense split stays `(i.kind ?? "rent") === "rent"` — equivalent to the
   phone's `kind !== "charge"` given the schema's two-value enum
   (`shared/schema.ts:1189`), and explicit is better here.
4. Names come from the server's enriched `inv.tenantName` (the phone's source),
   falling back to the tenant map. Initials derive from `tenantName` the way the
   phone does (`View:258`): split on whitespace, first letter of the first two words.
5. Keep `bucketOf` returning `sent` for `pending_dispatch` — the five chips are the
   design's and the phone's own filter *hides* those rows, which is worse. But add
   a separate `label` field so the row **reads** `awaiting send` instead of
   claiming `sent`. Dot colour for `awaiting`: `ACCENT` at `opacity: 0.5`, keeping
   the existing `.pt-dot` rule and adding nothing new to the palette.

**Test.** Table-driven over the model: split part-paid rent, split fully-paid,
`voided` excluded, `paid_external` excluded, `pending_dispatch` counted and
labelled `awaiting send`, an invoice whose tenant is archived still showing a name.

**Commit:** `fix(desktop): property terminal counts split owing, live statuses and archived tenants`

---

### Phase 2 — send-flow safety (no new UI)

1. **Keypad zero-guard.** `:587-598`. Compute
   `const kpCents = desktopKeypadCents(kpVal)`. When `kpCents <= 0`, the confirm
   circle renders at `opacity: 0.45; cursor: default` and its handler returns
   early. Mirrors `.pt-send-btn:disabled` (`:792`), which is the file's existing
   disabled language. Add `aria-disabled`.
2. **Post-send reset.** `sendRequest.onSuccess` (`:224-232`) additionally calls
   `setAmountCents(0)`; `sendBill.onSuccess` (`:262-266`) resets `amountCents`,
   `chargeType` and `description` to their initial values (and, after Phases 5–6,
   `dueDays`, the document and `splitEnabled`). Tenant selection **persists** —
   that is the useful desktop state, and zeroing the amount is what actually
   prevents the duplicate send. The 1.6s "sent ✓" flash covers the transition.
3. **Description clobber.** `:651-654` unconditionally overwrites the description
   with the chip's preset, destroying typed text. Port the phone's rule
   (`View:580-584`): add
   `const CHARGE_PRESETS = CHARGE_TYPES.map(c => c.preset).filter(Boolean);` and
   only overwrite when `!description.trim() || CHARGE_PRESETS.includes(description)`.

**Test.** Extend the new desktop test file (created in Phase 3) or add
`client/src/desktop/property-terminal.test.tsx` here, modelled on
`client/src/desktop/retail-terminal.test.tsx`: confirm-at-zero is inert, a second
click after a successful send does not fire a second `POST /api/property/invoices`,
typed description survives a chip change, a preset description does not.

**Commit:** `fix(desktop): property terminal guards zero amounts, resets after send, keeps typed descriptions`

---

### Phase 3 — row actions

**The phone has an action sheet on every request row** (`View:1078-1131`): resend
link, edit-amount-and-resend, mark received, cancel invoice. The desktop rows are
inert `<div>`s, and `POST /invoices/:id/resend` and `POST /invoices/:id/void` have
**no caller anywhere in the desktop app**.

**Surface: an anchored popover in the left column.** Not a mode, not a modal. It
reuses the visual language already shipped in `property-home.tsx:588-591`
(`.ph-scope-menu`): `#0B1436` panel, `1px solid rgba(94,158,255,0.3)`, radius 14,
`box-shadow: 0 18px 40px rgba(0,4,24,0.5)`, 6px padding, options at 9px/12px and
12.5px with a `rgba(94,158,255,0.14)` hover. Ported to `.pt-row-menu` /
`.pt-row-opt`.

**Positioning.** `.pt-rows` scrolls (`max-height: 232px; overflow-y: auto`,
`:746`), so a popover rendered inside it clips. Add `position: relative` to
`.pt-stack` and render the popover as a child of `.pt-stack`, offset by
`row.offsetTop - rowsEl.scrollTop`, clamped so its bottom stays inside the column.
Use `offsetTop`, **not** `getBoundingClientRect()` — offset values are pre-scale
and need no division by the canvas scale, which is the same reason `SubBar` uses
them on the phone (`View:109-114`).

**Markup.** `.pt-row` becomes a `<button>` with `aria-haspopup="menu"` and
`aria-expanded`. Keep its current layout and padding exactly; add only
`cursor: pointer` and the existing hover tint. Popover items are ≥ 40px tall.

**Contents,** mirroring the phone's branching:

- settled (`bucket === "paid"`) → "this invoice is already settled" + *close*
- `kind === "charge"` → **resend link** / mark received / cancel invoice
- rent → **edit amount & resend** / mark received / cancel invoice

"edit amount & resend" sets `tenantId` and `amountCents` from the invoice, closes
the popover and `setMode("request")` — the desktop equivalent of the phone's
`openEditResend` (`controller:422-434`).

**Two-step cancel.** Clicking *cancel invoice* swaps the popover's contents to a
`RED` "this can't be undone" line with *confirm* / *back*. No `window.confirm`.

**Mutations.** Two new ones, both invalidating `PROPERTY_KEYS.invoices` and both
calling `notifyIfBillingCardRequired(res)` on a non-ok response — the phone omits
it here, but the desktop send paths already do it and a silent 402 on a resend is
the kind of thing this branch has been bitten by:

- `resendOne` → `POST /api/property/invoices/:id/resend`, toast "link resent"
- `voidInvoice` → `POST /api/property/invoices/:id/void`, toast "invoice cancelled",
  surfacing the server's `message` on failure like the phone does
  (`controller:257-260`)

**Commit:** `feat(desktop): property terminal row actions — resend, edit & resend, mark received, cancel`

---

### Phase 4 — deep links and the remind affordance

**The desktop property home already links to `?mode=reminder` and `?mode=expense`**
(`property-home.tsx:562`, `:567`) and the terminal reads no query parameters at
all, so both quick actions silently open the default request panel.

**Read them in a `useState` initializer**, following `property-clients.tsx:51`
(`?client=`) and `trades-terminal.tsx:117` (`?quick=1`) — the established desktop
convention. Do **not** port the phone's 800ms `replaceState` strip
(`controller:341-345`); that hack exists because the phone's route transition can
discard the first mount, and 2b/3b have already accepted that a refresh re-applies
the deep link.

| Param | Effect |
|---|---|
| `?mode=expense` | initial mode `bill` |
| `?mode=reminder` | initial mode `request`, `filter = "overdue"`, `remindMode = true` |
| `?mode=rent` / absent | initial mode `request` |
| `?stack=overdue\|sent\|paid\|failed` | initial `filter` |
| `?client=<tenantId>` | preselect `tenantId` (matches 2b's param name) |

**Remind button on overdue rows.** Shown when `remindMode || filter === "overdue"`
— the phone's exact rule (`View:287`). Style: `ACTIVE` background, `NAVY` text,
radius 9999, 11px, ~28px tall so it sits inside the 40px row; disabled with the
label `…` while its own mutation is in flight, keyed on the invoice id like the
phone's `remindBusyId`. It calls Phase 3's `resendOne`, so this phase depends on
Phase 3.

Add `?mode=rent` to the home's first quick action for symmetry.

**Commit:** `feat(desktop): property terminal honours mode/stack/client deep links and inline remind`

---

### Phase 5 — bill completeness: due date and attached invoice

The bill mode currently hard-codes `dueAt: new Date().toISOString()` (`:245`) —
every desktop bill is "due on receipt", with no way to say otherwise — and cannot
attach the supporting document the phone uploads. The attach-invoice omission is
recorded in handoff §1 as deliberate ("worth its own pass rather than a cramped
port"). This is that pass.

**Due chips.** A `DUE` block in the existing label-then-chips rhythm, placed
between the description input and the send button:

```
DUE                          ← .pt-bill-label
[on receipt] [in 7 days] [in 14 days]   ← .pt-bill-due, 3-up grid, 44px
```

Options `0 / 7 / 14`, default `7`, matching `View:70-74`. Grid mirrors
`.pt-freq-chips` (`flex: 1`, 44px, radius 9999) so the two screens' chip rows are
the same object. `dueAt` becomes `now + dueDays`.

**Attach invoice.** A `<label>`-wrapped hidden `<input type="file"
accept="application/pdf,image/*">`, styled as `.pt-bill-attach`: 50px tall, radius
12 (matching `.pt-field-row`, **not** the phone's 16), `1.5px dashed
rgba(94,158,255,0.4)`, centred upload glyph + "attach invoice (PDF/image)" in
`ACCENT_SOFT`. Uploads immediately on pick to
`POST /api/property/invoices/document` with `propHeaders()` and a `FormData`
field named `document`, with the phone's 20MB client-side guard
(`controller:380`). Attached state swaps to a solid-border row: file glyph,
ellipsised filename, "remove". `uploadingDoc` dims to `opacity: 0.6` and the label
reads "uploading…".

`sendBill`'s payload gains `documentUrl` and `documentName`.

**Vertical budget.** The bill mode currently occupies ≈ 468px of the 787px panel
(56 margin + 51 amount + 27 name + 16 sub + 40 label + 96 chips + 40 label + 62
input + 80 send). Due adds ≈ 96px, attach ≈ 102px → ≈ 666px, leaving 121px. Phase
6's split row takes ≈ 62px of that → ≈ 728px, 59px spare. Comfortable, but reclaim
margin while you are in there: `.pt-bill { margin-top: 56px → 40px }` and
`.pt-bill-label { margin-top: 30px → 24px }` (× 4 labels) buys back 40px.
**Screenshot both device classes and confirm nothing crosses 813px** — 3c's compose
block had exactly this failure (handoff §6).

**Commit:** `feat(desktop): property terminal bill gains due-date choice and invoice attachment`

---

### Phase 6 — split

The desktop hard-codes `splitEnabled: false` on both mutations (`:192`, `:246`)
and renders no split state at all. The phone offers split on a rent request (via
the pill on its tenant screen, `View:309-336`) and on a bill (`View:658-666`), and
shows `paid/count split` plus "left of $X" on part-paid rows (`View:276-285`).

> Handoff §1 records the bill's split toggle as a deliberate omission. This phase
> un-defers it — see §7, question 1.

1. **State.** `const [splitEnabled, setSplitEnabled] = useState(false)`, reset on
   send alongside Phase 2's other resets.
2. **Rent request.** One more `.pt-field-row` in `.pt-req-lower`, below the
   send-via row: split glyph + "split this bill" + a toggle switch on the right.
   Reuses the 54px / radius-12 / `1.5px solid rgba(94,158,255,0.55)` row that is
   already used twice above it, so the lower block reads as three consistent rows
   plus the chips. `.pt-req-lower` grows from ≈ 242px to ≈ 310px, ending at
   ≈ 730px of 787px — verify by screenshot.
3. **Bill.** The same row, below the due chips.
4. **Toggle switch.** New `.pt-switch` (42×25 track, 19px knob, `ACTIVE` when on,
   `rgba(94,158,255,0.25)` when off) — the one genuinely new component in this
   plan. Phase 7 reuses it for the reminders toggle, which is why it is worth
   defining rather than substituting a chip.
5. **Payload.** `splitEnabled` on both mutations.
6. **Row display.** In the left column, a `paid/count split` badge in `GREEN` on
   `rgba(53,208,127,0.12)` when `splitEnabled && splitCount > 1`, and a
   `left of $X` caption under `.pt-row-amt` when part-paid — stacking the amount
   the way `.pt-tc-right` already stacks amount over caption (`:806-808`), so no
   new layout idea is introduced.

**Commit:** `feat(desktop): property terminal split-bill on rent and charges, split state in the request list`

---

### Phase 7 — automation mode (schedules + overdue reminders)

**The desktop can create recurring rent and then gives the merchant no way to see,
pause or cancel it.** The desktop *trades* terminal already ships exactly this
surface (`trades-terminal.tsx:1140-1200`), so this is a desktop-internal
inconsistency as much as a phone gap. Note the phone's equivalent screen is
**unreachable** — see §8.

**Rail: a sixth button.** Repeat/refresh glyph, `aria-label="automation"`, added
after *mark as paid*. **Tighten `.pt-rail`'s `gap: 40px → 32px`** at the same time:
six buttons at gap 40 makes the rail 547px tall ending at y=748 and visibly
bottom-heavy; at gap 32 it is 507px ending at y=708, growing the rail by one
button height rather than a button plus a gap. Verify against the design PNG.

**Data.** `usePropertySchedules()` already exists in `client/src/lib/property-data.ts:39`
— use it, do not add a query. Add one query for
`['/api/property/reminder-settings']` (the phone's, `controller:86-90`).

**Mutations,** all invalidating `PROPERTY_KEYS.schedules`:

- `PUT /api/property/reminder-settings` — optimistic with rollback, exactly as
  `controller:182-202`
- `PUT /api/property/schedules/:id` `{ status: "paused" | "active" }`
- `DELETE /api/property/schedules/:id`

**Panel layout,** two blocks in the 466px column:

1. **Overdue reminders.** Header row: title, sub "auto-resend the link until paid",
   `.pt-switch` from Phase 6. When enabled, three chip rows using
   `.pt-bill-label` + a 3-or-4-up chip grid: *remind after* `[1d 3d 7d]`, *repeat
   every* `[1d 3d 7d]`, *max reminders* `[1 3 5 ∞]`, then the phone's summary
   sentence in `rgba(244,246,255,0.45)`. Defaults when unset: `enabled`, 3, 3, 3.
   **Render this in the page's blue language, not the phone's amber card** —
   `AMBER` on this page means "overdue", and an amber panel here would read as an
   alert.
2. **Active schedules.** `recurring rent` label, then a scrollable list reusing
   `.pt-paid-row`'s geometry: avatar, name over `$X · frequency`, an
   `active`/`paused` state pill (GREEN / AMBER tints already in the palette),
   `next <date>`, and pause/resume + cancel buttons. Cancel is the same two-step
   in-surface confirmation as Phase 3 — never `window.confirm`. Empty state:
   "no schedules yet — choose a repeat frequency when sending a rent request".

**Commit:** `feat(desktop): property terminal automation mode — schedules and overdue reminders`

---

### Phase 8 — external payment reference

`markPaid` hard-codes `externalPaymentReference: null` (`:276`) while the column
exists and the phone captures it (`View:886-893`).

Keep the flat list — clicking a row's check **expands that row in place**: a slim
`.pt-paid-ref` input (36px, white, radius 9999, matching `.pt-bill-input`'s
treatment at a smaller size) with *confirm* / *cancel* buttons, and the other rows
untouched. Sends `externalPaymentReference: ref.trim() || null`. Escape or cancel
collapses it. One row expanded at a time.

**Commit:** `feat(desktop): property terminal records an external payment reference`

---

### Phase 9 — the scope chip

The "all properties" chip (`:388-391`) has no `onClick` and no state — a dead
control. `property-home.tsx:246-290` has the identical chip fully wired.

**Recommendation: wire it.** Port `ph-scope` / `ph-scope-menu` /
`ph-scope-opt` to `pt-` names, derive the address list from **active** tenants
only — `Array.from(new Set(activeTenants.map(t => t.propertyAddress).filter(Boolean)))`,
matching `property-home.tsx:184-186` but without reintroducing the
"archived-only properties remain selectable" defect from handoff §6 — and filter
the model's invoices by the selected address via `tenantProfileId`. Both hero
figures, the request list and the mark-paid list follow the scope; the tenant
picker does not (you may need to bill a tenant outside the current scope).

The chip is inside `.pt-left` which is a `.dt-cascade`; its menu must be a child
of a `position: relative` wrapper (`.pt-scope-wrap`), not of a cascade step.

**Alternative if Oliver prefers minimum change:** delete the chip. A dead control
is worse than either outcome. See §7, question 3.

**Commit:** `feat(desktop): property terminal scope chip filters the portfolio`

---

## 5. Verification

Per phase, before committing — the handoff §3 loop:

```bash
npx tsc --noEmit                    # silent
npx vite build                      # property-terminal lands in its own chunk
node scripts/verify-desktop-p0.mjs  # gating, geometry, chunk isolation, spotlight
npx jest client/src/desktop/data/__tests__/property-terminal-model.test.ts \
         client/src/desktop/property-terminal.test.tsx \
         client/src/pages/__tests__/smoke-tests.test.tsx \
         client/src/__tests__/tutorial-registry.test.ts
```

Then the screenshots, **both device classes**:

```bash
node scripts/desktop-shots/shot-property-terminal.mjs   # → /tmp/taptpay-desktop-2c/*.png
```

That script already exists, already mocks `/api/property/schedules`, and already
shoots 8 states at desktop (1440×900) and tablet (1194×834 + `hasTouch`). Extend
its fixtures and shots as the phases land:

- Phase 1: a split part-paid invoice and a `pending_dispatch` one in `INVOICES`
- Phase 3: a shot with the row popover open, and one on the cancel confirmation
- Phase 4: a run with `?mode=reminder` showing the remind buttons
- Phase 5–6: re-shoot `6-bill` with due chips, attach row and split toggle
- Phase 7: a new `9-automation` shot
- Phase 8: a shot of an expanded reference row

Note the script currently collects page errors but **exits zero** — handoff §3
flags this. Make it fail hard on `page errors` while you are in it.

After any structural change to `.pt-left` or the rail:

```bash
node scripts/desktop-shots/probe-cascade.mjs      # 13/13 screens, nothing stuck at opacity 0
node scripts/desktop-shots/probe-transitions.mjs  # 0 chrome remounts, 0 route-loader flashes
```

There is currently **no test at all** for this page; `client/src/desktop/property-terminal.test.tsx`
(modelled on `retail-terminal.test.tsx`) is created in Phase 2 and grown by every
later phase. None of the nine defects behind this plan would have been caught by CI.

---

## 6. Regression boundaries

Untouched by every phase: the phone merchant app, onboarding/auth, public customer
routes, and the other 14 desktop screens. The only shared modules this plan writes
to are **new** (`desktop/data/property-terminal-model.ts`) or additive
(`.pt-switch`). `client/src/lib/property-data.ts` is read from, never modified.

---

## 7. Questions for Oliver — answer before Phase 5

1. **Split (Phase 6).** Handoff §1 recorded the bill's split toggle as deliberately
   deferred. This plan un-defers it and also adds split to the rent request, which
   the phone has and the desktop never did. Confirm.
2. **Bill's default charge type (§1, last row).** The desktop pre-selects
   "water / utilities" so a bill can be sent without the type ever being chosen;
   the phone forces an explicit pick. I recommend keeping the default because all
   five chips are visible at once on desktop and the design shows a selected chip —
   but it is the one "keep" I would happily reverse.
3. **Scope chip (Phase 9).** Wire it, or delete it?
4. **The phone's dead screen (§8).** Wire it up or delete it?

---

## 8. Out of scope — the phone's unreachable `batch` screen

`BatchAndAutoScreen` (`View:911-1051`) implements batch send, schedule management
and reminder settings on the phone in ~140 lines, and **nothing navigates to it.**
`SUBBAR_ROUTE` covers only tenants/send/bill/external (`View:59`), and there is no
`go('batch')` or `setScreen('batch')` anywhere in `client/src` — the only surviving
reference is a `busy.batch` key in a test fixture. `batchMutation`
(`controller:222-251`) is dead with it.

So schedule management and reminder settings are missing from **both** clients, and
Phase 7 is new functionality rather than parity. Two ways to close it, Oliver's
call:

- **Wire it** — a fifth subbar slot or a home affordance, which also gives the
  phone batch send.
- **Delete it** — once Phase 7 lands, keeping an unreachable duplicate of the same
  UI is a liability.

Either way it is a **phone commit**, not tablet work, and does not belong in this
branch's screen-at-a-time queue.
