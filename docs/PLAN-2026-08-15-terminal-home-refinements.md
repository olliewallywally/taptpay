# Plan — tablet/desktop terminal and home refinements

**Date:** 2026-08-15
**Branch:** feat/tablet-desktop-app
**Implementation baseline:** d325beb, with a pre-existing dirty worktree
**Status:** EXECUTION-READY FOR LOCAL IMPLEMENTATION; NOT APPROVED FOR PRODUCTION DEPLOYMENT
**Supersedes:** the earlier draft of this file
**Authority:** AGENTS.md, CLAUDE.md, docs/PLAN-2026-07-24-tablet-desktop-app.md, and the decisions recorded below
**Decision basis:** the user instructed Codex to update this plan with the review changes and clarified that “tablet” and “desktop” mean the same shared app; D1–D10 are execution choices, not open questions.

This plan turns the measured UI findings into an executable build contract. It does
not authorize changes to the existing mobile presentation. It also does not clear
the separate production-release blockers recorded in
docs/REVIEW-2026-08-15-full-app-review.md and
docs/HANDOFF-2026-07-28-tablet-desktop-app.md.

In this document, “land” means a reviewable, tested change on this branch.
“Deploy” means release to production. A phase may land while production deployment
remains blocked.

---

## 0. Non-negotiable scope and resolved decisions

| ID | Decision |
|---|---|
| D1 | Amount-centric terminal modes use one 340px content spine centred in the right panel. |
| D2 | Held retail sales are server-backed and visible across authenticated tablet/desktop sessions. The existing mobile app remains unchanged. |
| D3 | Prove terminal behavior in Retail, then port only the applicable layout primitives to Property and Trades. |
| D4 | Historical rows open a transaction-detail surface, not a generic Share screen. A just-created private sale may be shared only while its one-time URL remains in memory. A board destination may reopen the durable board, but it must not imply that the selected historical transaction itself is being re-shared. No credential reissue is added. |
| D5 | Named tablet/desktop list entrances use 440ms transform motion, 40ms stagger capped at six steps, and cubic-bezier(0.34, 1.20, 0.64, 1). Opacity uses a separate non-overshooting fade. This is an explicit, limited override of the list-row tier in docs/PLAN-2026-08-15-motion-toning.md; every other landed motion decision remains in force. |
| D6 | Split-count chips remain the existing customer-side preview. They do not become a transmitted merchant setting in this work. |
| D7 | Tap to Pay is capability-gated. Production web/tablet/desktop must hide it or show a truthful unavailable state when the native bridge is absent. No demo success path is allowed. |
| D8 | Property and Trades reuse the shared spine only where their mode semantics fit it. Complex picker, quote, recurring, and mark-paid workflows keep dedicated layouts. Existing accepted Trades rail geometry/animation and the invoice compose block at top:476 remain unchanged. |
| D9 | A hold is created only by an explicit Hold sale action. Typing, changing tabs, or navigating away never autosaves a hold. |
| D10 | Open holds remain until explicit discard or successful conversion. No automatic expiry ships in v1. Consumed holds are retained as hidden audit/idempotency records. |

The earlier open questions about historical sharing, animation duration, split chips,
and mobile wiring are resolved by D2, D4, D5, and D6. D5 is deliberately adopted
by this revised execution plan for the named tablet/desktop lists and must be
recorded in the handoff; it does not reopen any other toned-motion decision. Do
not reopen the already ruled deviation list unless Oliver explicitly changes
scope.

---

## 1. Phase 0 — establish the safe execution baseline

Complete this phase before feature edits.

### 1.1 Preserve the current worktree

- Record git rev-parse HEAD and git status --short in the implementation handoff.
- Treat all existing modified and untracked files as user work. Do not clean,
  reset, or fold unrelated changes into these phases.
- Keep each phase diff limited to the files named by that phase.
- Follow CLAUDE.md commit rules. Never use git add -A, and always exclude
  .claude-home/** and .claude/settings.local.json.

The measurements in this plan were taken from the dirty tree at HEAD d325beb.
If the relevant files have changed before execution, rerun the measurements and
record the new SHA/tree state rather than assuming these coordinates still hold.

### 1.2 Recheck database and code health

The read-only check on 2026-08-15 reported 19 applied migrations and 0 pending;
the migration directory currently ends at 0017_schema_history_catchup.sql. The
next migration filename is therefore 0018, but Claude must re-run status before
creating it.

Run and record:

~~~sh
npm run db:migrate:status
npm run check
npx jest --selectProjects client --runInBand
npx jest --selectProjects server --runInBand
npm run build
~~~

For database phases, also run npm run test:server:postgres against the approved
test database. If an existing failure is unrelated to this plan, record the exact
test and failure before proceeding; do not “fix” or suppress unrelated user work.

The current direct baseline in
client/src/desktop/retail-terminal.test.tsx is 10 tests, not 11.

### 1.3 Keep production release blocked

Local implementation and review may continue, but do not deploy this branch until
the owners separately close all existing release gates, including:

- C1: rotate the exposed credentials, remove tracked secrets, and verify history
  remediation as directed by the security review. Never print secret values.
- C2: repair or deliberately configure the production billing-entitlement state;
  the review found all eight production merchants would be blocked.
- Complete the external Windcave and push-notification gates in the handoff.

This feature plan does not grant authority to rotate production secrets or alter
production merchant billing data.

### 1.4 Preserve device gates and tutorials

Before and after every phase:

- 390px phone renders the existing mobile application unchanged.
- Tablet and desktop render the shared tablet/desktop UI.
- Desktop remains a centred rounded 1180×880 logical canvas, never full-window.
- Onboarding, signup, and login remain unchanged on every device.
- Tutorial anchors and navigation remain valid. Add aliases only when a required
  DOM restructuring would otherwise break an existing tutorial selector.

---

## 2. Measured diagnosis to preserve

All coordinates below are in the 1180×880 logical canvas rendered by
ScaledCanvas. Geometry assertions must divide getBoundingClientRect values by the
current canvas scale before comparing them.

### 2.1 Terminal misalignment

The Retail rail occupies x550–630 and y268–728. Current modes use unrelated
margins and absolute offsets:

| mode | amount | content | CTA |
|---|---|---|---|
| send | y155 | x668, width 445 | y708 |
| keypad | y143 | centred, width 352 | header controls; exempt |
| stock | absent | x668, width 466 | absent |
| split | y263 | x720, width 340 | y613 |
| share | absent | x668, width 440 | y292 |

The target amount/content edge is x713, the target content width is 340, and the
target centre is x883.

### 2.2 Active-stack jump

.rt-stack currently uses margin-top: auto. The stack header is y488 with seven
or five rows and y720 with one row: a 232px jump. The header, search, and filter
chips must remain fixed while only the row viewport changes.

### 2.3 Home controls cannot animate as promised

- Each range button paints its own background; there is no shared indicator to
  travel between buttons.
- Retail chart keys include the timeframe, so every range change remounts bars.
- Property and Trades label-based keys also fail to preserve a useful transition
  identity.
- Bucket counts vary from four or five to twelve. Merely changing keys and
  flex-grow still snaps because five newly inserted zero-grow nodes immediately
  add five 16px gaps.
- Replacing label text cannot produce a real cross-fade, and removed bars need
  retained exit state.

### 2.4 “Mobile parity” is not a live contract

RetailTerminalView declares optional capabilities, but the live mobile controller
does not supply onPickStock or onCashSale. The mobile stock total is not derived
from the current picks, live holds are disabled, compact-row clicks are not wired
for live transactions, and Tap to Pay is real only through the native bridge.

Keep separate mobile and desktop presentations. Extract shared pure domain logic
and verify real controller/API wiring instead of copying optional mobile props or
hard-coded mobile stock data.

---

## 3. Shared architecture and invariants

### 3.1 Presentation versus domain logic

Create client/src/lib/retail-terminal-model.ts as a headless Retail terminal
domain module, with no JSX and no viewport assumptions. Keep wire schemas and
server-authoritative validation in shared/schema.ts. The client module owns:

- integer-cent money parsing, formatting inputs, and total calculation;
- cart state keyed by stock item plus selected-variation signature;
- immutable line-item request construction;
- transaction-status normalization;
- the action-capability matrix in §6.4;
- discriminated stack keys: hold:<uuid> and transaction:<id>.

Desktop consumes this module. Mobile may receive contract tests against compatible
pure functions, but its components, controller wiring, routes, CSS, and behavior
must not change under this plan.

Never move desktop presentation into RetailTerminalViewCore.jsx. The two devices
have deliberately different interaction layouts.

### 3.2 Credential authority

server/retail-transaction-service.ts remains the only code allowed to mint a
per-payment bearer credential. Raw tokens are returned once, never stored, never
placed in logs, DTOs, query caches, stack responses, SSE, or push payloads.

Refactor route policy and transaction persistence around that service; do not add
a second minting path for holds, receipts, retries, or historical sharing.

### 3.3 One application-service policy boundary

POST /api/transactions and hold conversion call one shared transaction
application service. Held-sale create/update reuse its ownership, destination,
and stock-snapshot validation helpers but deliberately skip billing and minting
until conversion. The transaction application service performs:

- strict schema validation;
- authenticated merchant ownership;
- billing-card entitlement;
- ENABLE_PER_PAYMENT_LINKS enforcement;
- live stock ownership/active-state validation for direct sends and hold
  create/edit; hold conversion uses the confirmed immutable snapshots;
- board ownership and active-state validation;
- destination/link-mode compatibility;
- authoritative total calculation;
- transaction and line-item persistence;
- owner DTO projection.

SSE and push happen only after commit. Hold events use a merchant-authenticated
audience only; never broadcast unsent order details to public board or no-board
audiences.

### 3.4 Money and snapshots

Use integer cents in client/domain logic. Convert to the repository’s decimal
string format only at the API/storage boundary. Never add JavaScript decimal
prices.

Stock name, selected variation, unit price, and quantity are snapshotted when a
sale or hold is confirmed. Later stock edits or deletion must not rewrite an
existing order. A stock ID is nullable in snapshots so ON DELETE SET NULL can
preserve history.

---

## 4. Layout contract

### 4.1 Coordinate origins

The positioned terminal body starts at canvas x0, y67. Its 26px top padding makes
the visual content and Retail/Property right panel start at canvas x632, y93; the
right panel is 502px wide. CSS top values on the rail are therefore relative to
the body origin at y67, while the variables below are relative to the right
panel's own x632/y93 origin.

Use variables relative to the right panel:

~~~css
--terminal-spine-left: 81px;   /* canvas x713 */
--terminal-spine-width: 340px;
--terminal-figure-top: 62px;   /* canvas y155 */
--terminal-content-top: 175px; /* canvas y268 */
--terminal-content-max-h: 460px;
--terminal-cta-left: 151px;    /* canvas x783 */
--terminal-cta-top: 655px;     /* canvas y748 */
--terminal-cta-width: 200px;
--terminal-cta-height: 46px;
~~~

The Retail/Property rail is explicitly positioned relative to the terminal body
at left 550px, top 201px, width 80px, height 460px, which lands at canvas
x550/y268. Set box-sizing:border-box, padding-block:30px, gap:0, and
justify-content:space-between; make every rail button flex:none. This preserves
the exact 460px box without the current content sum rounding to 461px. Do not
derive its top from an absolutely positioned child's static position or a slot
margin.

Create neutral .terminal-* layout utilities rather than Retail-only names.
The rail itself owns its entrance animation; never animate both the rail slot and
the rail.

### 4.2 Retail mode mapping

| mode | Zone A at x713/y155 | Zone B at x713/y268, width 340 | Zone C at x783/y748 |
|---|---|---|---|
| send | current amount | item, payment method, online destination/board, split preview | Send payment or Record cash sale |
| stock | live cart total | live stock grid plus quantity controls | Confirm · N |
| split | current amount | existing customer-side split preview | Confirm |
| current-sale result | created amount | current in-memory share URL/QR or durable board result | Start new sale |
| historical detail | transaction amount | status, line items, and only valid actions | Close or New sale |
| keypad | exempt; keep the accepted centred keypad and header controls | exempt | exempt |

Zone B owns overflow with min-height: 0 and internal scrolling. Long item names,
large NZD values, empty/error states, and the largest live stock set must not
push into Zone C.

Send has an explicit payment-method control. Online retains private/board
destination and split controls and uses Send payment. Cash hides destination,
QR, and split controls, sends no stone ID, changes Zone C to Record cash sale,
and opens the completed transaction detail instead of Share. Tap to Pay is not a
third desktop method while its native capability is absent.

### 4.3 Property and Trades mapping

Port the neutral utilities only after Retail passes all gates.

| vertical/mode | mapping |
|---|---|
| Property request | A amount/frequency; B tenant and delivery/frequency details; C Send request |
| Property bill | A amount/tenant; B charge type and description; C Send bill |
| Property tenant | B-only searchable picker; no invented amount or global CTA |
| Property paid | B-only outstanding list with per-row actions |
| Property keypad | exempt |
| Trades invoice | Preserve the accepted dedicated compose layout, including top:476; reuse only low-level tokens/helpers that do not move its geometry |
| Trades client | B-only searchable picker |
| Trades paid | B-only open-invoice list with per-row actions |
| Trades quote | dedicated internally scrolling builder; its total and Create quote remain part of that workflow rather than being forced into the 340px amount spine |
| Trades recurring | dedicated internally scrolling schedule workflow |
| Trades keypad | exempt |

Do not normalize the Trades x539/width86 rail, blob motion, accepted
clipping/top adjustment, or invoice top:476 compose block as an incidental part
of this port. If a new screenshot comparison shows that rail must change, record
it as a separate approved deviation before editing it.

---

## 5. Phase 1 — home motion foundations

The indicator/chart work is limited to the three desktop home pages,
DesktopShell, shared desktop utilities, focused tests, and motion probes. The
list primitive may also touch retail-analytics.tsx, retail-stock.tsx,
property-clients.tsx, and trades-clients.tsx. Active-stack application waits for
its owning Phase 2 restructure. No phone presentation or style selector changes.

### 5.1 Sliding indicator primitive

Extract a useSlidingIndicator measurement hook plus a visual indicator primitive.
Do not force navigation and range selection into one semantic component.

Requirements:

- Desktop navigation remains nav with aria-current=page.
- Each timeframe selector is a labelled group whose buttons expose aria-pressed.
- Measure the container and active child; observe both so font or content changes
  cannot leave a stale indicator.
- Preserve the first-paint data-ready guard.
- Preserve the accepted navigation duration of 260ms.
- Home range indicators use --m-dur-ui, currently 200ms.
- Translate uses the approved restrained travel easing; width uses
  --m-ease-out. Do not add width overshoot.
- Reduced motion snaps to the final rect with no hidden first frame.
- Rapid clicks cancel/rebase from the indicator’s current rendered position.

Apply the hook to DesktopShell and Retail, Property, and Trades range selectors
without changing their semantics.

### 5.2 Morphing chart state machine

Implement one shared low-level useBucketMorph hook plus shared transition types.
Keep the three accepted page-specific chart components and their markup/styles
separate; do not replace them with one cross-vertical presentation component.
A key change alone is not sufficient.

On range change:

1. Capture current bar rectangles and label layer.
2. Retain noninteractive visual exit nodes in an inert, aria-hidden,
   pointer-events:none overlay. Never clone a focusable chart button.
3. Render the target bucket set and measure its final rectangles.
4. Use FLIP transforms to animate persistent bars from their current visual
   x/width/height to the target geometry. This absorbs the immediate gap/count
   reflow instead of exposing a snap.
5. Fade/scale entering bars from the baseline and fade exiting clones out.
6. Cross-fade two label layers; only the target layer participates in the
   accessibility tree.
7. Track every Web Animations API handle for the active generation. Commit and
   remove retained nodes only after Promise.allSettled over all handles, or
   immediately when that generation is cancelled.

Use target index as the within-transition correspondence, but use an explicit
transition generation ID for cleanup. On a rapid second click, cancel every prior
animation handle, sample the currently rendered rectangles as the new first
state, and start one new generation. If a departing bar owns focus, move focus to
the corresponding target bar or, if none exists, the active timeframe button.
Target bar buttons expose a formatted timeframe/value aria-label and the correct
aria-pressed state. Under prefers-reduced-motion, commit the target immediately.

Acceptance is not merely “the final chart looks right”: a probe must observe at
least one intermediate frame, no first-frame width jump, correct final bucket
count, no stuck exit nodes, and stable accessible target labels.

### 5.3 Desktop list entrance

This subsection deliberately supersedes only the opacity-only list-row tier in
docs/PLAN-2026-08-15-motion-toning.md. It does not change page, panel, modal,
navigation, chart-indicator, or phone motion.

Add desktop-scoped tokens:

~~~css
--m-dur-list: 440ms;
--m-stagger-list: 40ms;
--m-ease-list: cubic-bezier(0.34, 1.20, 0.64, 1);
~~~

Implementation contract:

- Transform animates from translateY(8px) to 0 with --m-ease-list.
- Opacity runs as a separate 180ms --m-ease-out fade; opacity never uses an
  overshooting curve.
- Delay is min(index, 5) × 40ms, so the tail is capped at six steps.
- No scale and no keyframe overshoot are added. The easing’s scalar overshoot is
  approximately 1.25 percent and must remain below 1.3 percent.
- Remove parent rise/cascade from a list wrapper when its children use this
  entrance; do not stack two entrances.
- Use a per-surface useSeenEntranceIds registry owned by the persistent list
  parent; stable React keys alone are insufficient when filtering unmounts rows.
- Seed the registry from the full initial query dataset. Search and filter changes
  therefore do not replay existing records.
- On later query updates, animate a genuinely new ID once when it first becomes
  visible, then retain it in the registry for the lifetime of that surface.
- Text/status changes and reorder-only polling updates do not replay rows.
- Reduced motion makes every row immediately visible and removes delay.
- Scope selectors beneath .tapt-desktop-viewport so phone UI cannot change.

Phase 1 applies the primitive to transaction history, live stock tiles, and
Property/Trades directory rows. Phase 2 applies it to active-stack rows after
that DOM is restructured. Panels, modals, navigation, and page entrances retain
the toned motion from docs/PLAN-2026-08-15-motion-toning.md.

### 5.4 Phase 1 gates

Add or update probes rather than claiming the existing scripts cover this work:

- scripts/desktop-shots/probe-home-motion.mjs clicks every range, samples
  indicator/bar geometry during motion, rapid-clicks ranges, and checks final
  state.
- Update probe-cascade.mjs to recognize the new keyframe/classes, numeric
  duration/easing, six-step cap, visibility, and reduced motion.
- Keep probe-motion-filmstrip.mjs for human comparison, but it is not a
  substitute for assertions.

Run the global gates in §10 plus focused component/interaction tests and
screenshots for all three home pages at 1440×900, 1194×834 tablet/desktop with
touch enabled, and 1366×1024.

---

## 6. Phase 2 — Retail terminal layout and stack shell

Do not add holds or new server behavior in this phase.

### 6.1 Restructure the right panel

Apply §4.1 and the currently functional send, split, and current-sale-result rows
of §4.2. Remove per-mode top margins and absolute offsets only after content is
moved into actual Zone A/B/C wrappers. Send currently splits its content across
independently positioned blocks, so class substitution alone is not sufficient.

Preserve the current stock-tile-to-single-item-composer behavior and current
historical-row behavior throughout Phase 2. Do not expose an empty cart CTA,
quantity controls, historical-detail shell, or action controls before their
behavior/endpoints exist. Phase 3 lands the final stock mapping and historical
detail atomically with their real behavior.

### 6.2 Pin the active stack

Replace bottom anchoring with a collapsed fixed shell whose header is canvas
y488, search is y532, and filter chips are y566 in all, awaiting payment, paid,
failed, loading, empty, error, and long-list states. The collapsed rows use
flex:1; min-height:0; overflow:auto below the chips through canvas y856.

Holds will later appear in both All and Awaiting payment with a distinct Held
label; no fifth filter chip is introduced.

### 6.3 Accessible expansion

- Make Active stack a native button with aria-expanded and an explicit accessible
  label.
- Expansion uses a separate geometry: shell/header y93, search y137, chips y171,
  and the row viewport below the chips through y856. It hides/moves the scope
  pill, revenue hero, and transaction count without stacking row and parent
  motion.
- Escape collapses to header y488 and restores focus to the expansion button.
- Preserve scroll position per filter where practical.
- Do not use a div role=button containing nested buttons. The row-open control
  and any action buttons must be separate native controls.
- A row click opens detail; row actions do not also trigger the row.

### 6.4 Status and action matrix

Use domain status, not the broad visual filter bucket:

| record/status | allowed actions |
|---|---|
| open hold | resume, edit, discard, convert |
| pending transaction | detail; private share only when the in-memory capability has this exact transaction ID; otherwise open the durable board where applicable; safe cancel |
| processing transaction | detail/status only; never cancel |
| completed or partially refunded | detail, authenticated receipt, eligible refund |
| refunded | detail and authenticated receipt |
| failed or cancelled | detail and New sale prefill; no historical private share |
| cash completed | detail, authenticated receipt, refund only if the server marks it refundable |

The Awaiting payment filter may contain held, pending, and processing rows, but
that visual grouping never grants the same actions to all three statuses.

Represent the one-time client capability as one object containing transactionId,
paymentUrl, and qrCodeUrl. Set it atomically from a successful owner create
response; never put it in query cache, storage, logs, or SSE. Clear it before a
new create, on failure, logout, or unmount. A stack row may use it only when its
ID exactly equals capability.transactionId; a missing response ID grants no
row-share capability.

### 6.5 Phase 2 gates

Add exact scaled-canvas assertions with a small documented tolerance:

- rail x550, y268, width80, height460;
- amount x713, y155;
- Zone B x713, y268, width340, height at most460;
- CTA x783, y748, width200, height46;
- collapsed stack header/search/chips do not move across filters: header y488,
  search y532, chips y566, and rows ending y856;
- expanded stack header y93, search y137, chips y171, and rows ending y856.

For Phase 2, amount/Zone B/CTA geometry applies to send, split, and the current
sale result; Phase 3 adds the same assertions for stock and historical detail.
Test all data states, long amounts/names, keyboard expansion, Escape/focus
restoration, separate row/actions, reduced motion, and tutorial anchors. Run the
global gates and Retail terminal screenshots at all three target viewports plus a
390px phone regression screenshot.

---

## 7. Phase 3 — Retail data foundation, cart, and real actions

Land stock cart UI plus its final A/B/C mapping in one change, and land
historical-row opening plus the real detail endpoints/actions in one change.
There must be no intermediate nonfunctional shell.

### 7.1 Add migration 0018_terminal_sale_drafts.sql

This is one additive migration landed and applied in local/test before feature
code is enabled there. Update shared/schema.ts,
server/migration-baseline-contract.ts, migration tests, and scratch-schema drift
expectations. Production application remains conditional on §1.3 and §9.5.

Create transaction_line_items with these exact columns and constraints:

- id serial PRIMARY KEY;
- transaction_id integer NOT NULL REFERENCES transactions(id) ON DELETE CASCADE;
- position integer NOT NULL CHECK position >= 0;
- stock_item_id integer NULL REFERENCES stock_items(id) ON DELETE SET NULL;
- name_snapshot text NOT NULL CHECK length(trim(name_snapshot)) > 0;
- variation_snapshot jsonb NULL. Its selectedOptions entries contain groupIndex,
  optionIndex, groupName, optionLabel, and priceModifier as a two-decimal string;
  it snapshots selections, not the whole variations catalog;
- unit_price numeric(10,2) NOT NULL CHECK unit_price >= 0;
- quantity integer NOT NULL CHECK quantity BETWEEN 1 AND 99;
- CONSTRAINT transaction_line_items_transaction_position_uq UNIQUE
  (transaction_id, position);
- INDEX transaction_line_items_stock_transaction_idx on
  (stock_item_id, transaction_id) WHERE stock_item_id IS NOT NULL.

Create held_sales with these exact columns and constraints:

- id uuid PRIMARY KEY DEFAULT gen_random_uuid();
- merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE;
- client_request_id uuid NOT NULL;
- item_name text NOT NULL CHECK length(trim(item_name)) > 0;
- price numeric(10,2) NOT NULL CHECK price > 0;
- sale_kind text NOT NULL CHECK sale_kind IN ('manual','stock');
- split_enabled boolean NOT NULL DEFAULT false;
- destination_kind text NOT NULL CHECK destination_kind IN ('private','board');
- link_mode text NOT NULL CHECK link_mode IN ('legacy','per_payment');
- tapt_stone_id integer NULL REFERENCES tapt_stones(id) ON DELETE SET NULL;
- state text NOT NULL DEFAULT 'open' CHECK state IN ('open','consumed');
- revision integer NOT NULL DEFAULT 1 CHECK revision > 0;
- created_at timestamp NOT NULL DEFAULT now();
- updated_at timestamp NOT NULL DEFAULT now();
- CONSTRAINT held_sales_merchant_request_uq UNIQUE
  (merchant_id, client_request_id);
- CONSTRAINT held_sales_destination_ck CHECK
  ((destination_kind='private' AND link_mode='per_payment' AND
    tapt_stone_id IS NULL) OR
   (destination_kind='board' AND link_mode='legacy'));
- INDEX held_sales_merchant_state_updated_idx on
  (merchant_id, state, updated_at DESC).

The board branch deliberately permits tapt_stone_id NULL after ON DELETE SET
NULL preserves a stale hold. The application requires a live non-null board on
create/update/convert. It also enforces manual holds with no item rows and stock
holds with at least one item row in the same repository transaction.

Create held_sale_items with these exact columns and constraints:

- id serial PRIMARY KEY;
- held_sale_id uuid NOT NULL REFERENCES held_sales(id) ON DELETE CASCADE;
- position integer NOT NULL CHECK position >= 0;
- stock_item_id integer NULL REFERENCES stock_items(id) ON DELETE SET NULL;
- name_snapshot text NOT NULL CHECK length(trim(name_snapshot)) > 0;
- variation_snapshot jsonb NULL with the same selectedOptions shape;
- unit_price numeric(10,2) NOT NULL CHECK unit_price >= 0;
- quantity integer NOT NULL CHECK quantity BETWEEN 1 AND 99;
- CONSTRAINT held_sale_items_hold_position_uq UNIQUE
  (held_sale_id, position).

Add transactions.source_hold_id uuid NULL as an immutable reconciliation key,
with no FK, plus partial unique index transactions_source_hold_id_uq WHERE
source_hold_id IS NOT NULL. Do not store a token or token hash on a hold.
Consumed holds are hidden from normal stack queries but retained so retries and
audits can resolve the resulting transaction. Only open holds may be discarded.

The database cannot express the cross-row line total as a simple CHECK. The
application service must calculate the summary and total from validated lines in
the same unit of work, and Postgres tests must prove that copied line totals equal
transaction.price.

Existing transactions receive no synthetic backfill. Detail and stock analytics
prefer transaction_line_items when present and fall back to the legacy exact
itemName behavior for old rows.

Make retailTransactionCreateRequestSchema a backwards-compatible strict union.
The legacy branch preserves today's existing request fields for unchanged
clients. A new saleKind:stock branch requires non-empty lineItems containing only
stockItemId, ordered selected-option indexes/names, and quantity; it rejects
client itemName, summary, and price. The application service reloads each
merchant stock item, validates one selected option per variation group by index
and name/label, calculates base plus modifiers in cents, and derives itemName and
price. New manual tablet/desktop requests may use an explicit saleKind:manual
branch, but the legacy branch must remain behaviorally unchanged.

Refactor createRetailTransaction's writer in this phase: each credential attempt
calls a repository operation that inserts the transaction and all line items in
one fresh database transaction. A line-item failure rolls back the transaction.
A collision retry recognizes only the exact payment-token-hash constraint and
starts a fresh transaction. Phase 5 later supplies the hold-consuming writer to
the same mint authority.

### 7.2 Live stock cart

Use the live /api/merchants/:merchantId/stock-items response only.

- State is Map<cartLineKey, CartLine>, where cartLineKey is a stable
  serialization of stockItemId plus ordered groupIndex/optionIndex selections.
  This permits two variants of one stock item to remain separate lines.
- Clicking an item without variations increments it. Clicking an item with
  variations opens an accessible chooser that requires exactly one option from
  every group before adding/incrementing that variant.
- Store both group/option indexes and current names/labels in the draft. The
  server rejects reordered/renamed selections as stale instead of silently
  choosing a different option.
- Explicit plus/minus/remove controls are keyboard accessible; zero removes the
  line; Clear is available.
- Calculate totals in cents. Never sum decimal strings.
- Convert each existing numeric priceModifier with finite-value validation and
  Math.round(value × 100), then let the server recompute it authoritatively.
- Show per-line quantity, unit price including modifiers, selected options, and
  line total.
- Confirm is disabled for an empty cart and reads Confirm · N for total quantity.
- Confirm validates against the current client query and preloads the Send
  composer; it does not call the server or create a transaction.
- The final direct Send revalidates stock on the server. If an item was deleted,
  deactivated, repriced, or its variation changed, return 409 STOCK_CHANGED with
  affected stock IDs and sanitized current data. Refresh stock, keep unaffected
  quantities, and require explicit review before retrying.
- Do not flatten away structure. itemName remains a human summary for old
  consumers, while lineItems is authoritative.
- Manual/keypad sales may omit lineItems. Stock sales must include at least one.

Extract the pure model in §3.1 and add unit/contract tests for cents, quantities,
variations, stale items, summary generation, and 100× currency regressions.

### 7.3 Transaction detail and endpoint wiring

Implement endpoint by endpoint; no optional callback counts as complete wiring.

- Refund uses POST /api/transactions/:id/refunds and displays server eligibility,
  validation, pending, success, 409, and failure states. Do not add a billing
  entitlement gate to returning funds. Invalidate detail, list, and dashboard
  totals on success.
- Add authenticated GET /api/merchants/:merchantId/transactions/:id and
  GET /api/merchants/:merchantId/transactions/:id/receipt-pdf for an owning
  merchant. These return sanitized detail/PDF without exposing or recreating a
  payment credential. Keep existing public/token receipt routes unchanged.
- The authenticated merchant PDF is generated from owned transaction data and
  must not contain a reconstructed customer pay URL or payment QR. It is a
  receipt, not a new authorization mechanism.
- A QR modal is available only for the transaction-specific in-memory capability
  defined in §6.4 or for a durable board URL. Historical per-payment QR/link says
  unavailable.
- Add an Online/Cash payment-method control to Send Zone B. Cash hides online
  destination, QR, and split controls; Zone C reads Record cash sale; success
  opens completed detail. Cash is recorded immediately and cannot be held in v1.
- Cash uses POST /api/transactions/cash-sale with no stoneId from this UI.
  Replace the loose body with a backwards-compatible strict union: preserve the
  existing manual request branch and add a saleKind:stock branch containing only
  stock IDs, selections, and quantities. Reject or ownership-check any supplied
  stoneId so other clients cannot attach arbitrary boards. Reuse the application
  service for ownership, authoritative line items, and totals, then invalidate
  the same queries as other creation.
- Tap to Pay renders only when the runtime exposes the real native capability.
  Desktop/web capability is false. Never show a success state from a missing
  optional handler.
- New sale from failed/cancelled may prefill safe non-credential sale fields, but
  creates a fresh sale only after explicit confirmation.

### 7.4 Make cancellation race-safe

Replace the current read-then-blind-update path with a storage/application
operation such as cancelTransactionIfPayable(transactionId, merchantId).

In one database transaction, acquire locks in the same order used by payment
finalization: transaction, then payment attempts. Cancellation succeeds only when
the transaction is exactly pending and no attempt is claiming, ready, or
finalizing. Finish with a status compare-and-set. Otherwise return
409 TRANSACTION_NOT_CANCELLABLE.

Processing is view-only in the UI. Add a real Postgres race test proving an
externally approved/finalizing payment can never end as cancelled.

### 7.5 Phase 3 gates

In addition to §10:

- migration applies from the current baseline and a scratch database;
- migration status returns zero pending and schema drift is clean;
- old transactions without lines still render;
- stock analytics use line items and retain the legacy fallback;
- ownership, inactive/deleted stock, variation, line total, DTO, and secret
  non-leakage server tests pass;
- cart → composer → private/board/cash send exercises real APIs;
- detail/refund/receipt/QR capability cases pass;
- cancel/finalize race passes in Postgres;
- 390px mobile behavior and screenshots are unchanged.

---

## 8. Phase 4 — port the proven layout to Property and Trades

This phase starts only after Retail layout and action tests are green.

- Apply the mode matrix in §4.3 rather than applying A/B/C blindly to every mode.
- Reuse the neutral spine, scroll-shell, CTA, and list-motion utilities.
- Keep each vertical’s real API state and existing workflow semantics.
- Preserve rail-on-rail animation ownership.
- Preserve all existing tutorial IDs.
- Test loading, empty, error, long list, long name/address, and disabled-action
  states for every mode.
- Capture all Property and Trades terminal modes at 1440×900, 1194×834
  tablet/desktop with touch enabled, and 1366×1024, plus the unchanged 390px
  mobile routes.

Do not start held-sales UI in this phase; it is a Retail-specific feature rollout.

---

## 9. Phase 5 — feature-flagged server-backed Retail holds

Gate all new hold endpoints and tablet/desktop UI behind a disabled
ENABLE_RETAIL_HELD_SALES flag parsed strictly as the string true. Enforce it on
the server and expose a sanitized retailHeldSales boolean in the authenticated
merchant-profile capabilities so the same tablet/desktop client hides the UI
when disabled. This is one global environment flag, not a per-merchant flag, and
mobile does not consume it. In each environment, the additive 0018 schema must
already be applied and verified before server code referencing it is enabled.

### 9.1 API contract

Authenticated routes:

~~~text
GET    /api/merchants/:merchantId/terminal-stack
POST   /api/merchants/:merchantId/held-sales
PATCH  /api/merchants/:merchantId/held-sales/:holdId
DELETE /api/merchants/:merchantId/held-sales/:holdId
POST   /api/merchants/:merchantId/held-sales/:holdId/convert
~~~

Rules:

- Verify :merchantId against the authenticated principal on every route. Ignore or
  reject body merchant IDs.
- Use a strict discriminated Zod union. Manual accepts itemName and a decimal
  price string; stock accepts only stockItemId, ordered selected-option
  indices/names, and quantity. Both accept client request/revision, online
  private-or-board destination, and split flag. Client summaries/unit prices for
  stock are rejected rather than trusted.
- POST requires clientRequestId and is idempotent per merchant.
- Repeating POST with the same clientRequestId and the same canonical body
  returns the existing hold. A different body returns 409 IDEMPOTENCY_CONFLICT.
- PATCH requires the current revision, atomically increments it, sets
  updated_at=now(), and returns 409 HOLD_STALE on a conflict.
- CONVERT also requires the expected revision. The locked repository check is
  authoritative: a stale conversion returns 409 HOLD_STALE before persisting or
  returning a credential. A race after preflight may mint an unpersisted
  candidate, which must be discarded as specified in §9.3.
- DELETE requires the current revision, deletes only open holds, and returns 409
  for stale or consumed records.
- GET returns a sanitized discriminated union with kind hold or transaction.
  Use hold:<uuid> and transaction:<id> keys client-side. It never returns a token,
  token hash, or private URL.
- Holds sort with transactions by updated/created time. They appear in All and
  Awaiting payment, carry an explicit Held status, and participate in search.
- Billing entitlement is required when converting/sending, not when saving or
  editing a hold.
- Revalidate board ownership/active state on save and again on convert. Recheck
  ENABLE_PER_PAYMENT_LINKS on private-hold save and conversion. If a board was
  removed/deactivated or private links were disabled, retain the hold, block the
  invalid destination, and require a valid new choice.
- Stock lines are validated and snapshotted when the hold is created or edited.
  Conversion honors that confirmed snapshot even if stock is later repriced,
  deactivated, or deleted; editing/replacing a line revalidates it against live
  stock. This is what makes a resumed order stable.
- Hold create/update/delete SSE goes only to authenticated merchant sessions.
- terminal-stack polls every five seconds as a fallback and authenticated hold
  SSE invalidates the same query, so another tablet/desktop session converges
  even if SSE drops.
- No mobile route/controller/component changes are in scope.

### 9.2 Explicit tablet/desktop lifecycle

- Composition remains local until the user selects Hold sale. For a new online
  private/board sale, place Hold sale as a secondary text button centred below
  the primary Zone C CTA at canvas y806. Cash records immediately and has no hold
  control in v1.
- Hold sale validates the draft, creates the server hold, closes the composer,
  and shows the held row in the stack.
- Opening a held row resumes its exact manual or structured stock snapshot.
  Primary Zone C is Send payment; the y806 secondary action is Save changes when
  the local draft is dirty.
- Editing saves with revision compare-and-set. Send is disabled while local
  changes are dirty, with an instruction to save first; after save returns the
  new revision, conversion is enabled. This prevents an implicit PATCH+CONVERT
  race.
- Discard is explicit in held-row/detail actions and confirms before deletion.
- Send converts the saved hold; it does not call the generic create route
  afterward.
- Disable duplicate buttons while a request is pending, but treat server
  idempotency/locking as authoritative.
- If another tablet/desktop session edited the hold, show HOLD_STALE, refetch,
  and let the user choose whether to reopen the server version. Never silently
  overwrite it.
- There is no autosave and no automatic expiry in v1.

### 9.3 Atomic conversion and collision retry

Keep credential minting in createRetailTransaction, but change its repository
boundary so one writer attempt may execute an entire fresh database transaction.

For each conversion attempt:

1. Preflight the authenticated hold state/revision and policy. Then call
   createRetailTransaction with the hold's link mode.
2. For per_payment only, createRetailTransaction mints a raw credential and gives
   the writer its hash. For legacy board conversion, raw token and hash remain
   null; no credential is minted.
3. The writer opens a fresh transaction, locks the tenant-scoped hold with
   SELECT FOR UPDATE, checks state/revision again, loads the already validated
   line snapshots, recomputes their stored total, and revalidates the board.
4. Insert the transaction with source_hold_id and the nullable credential hash;
   copy transaction_line_items; mark the hold consumed; commit.
5. Return a raw token only for a newly committed per_payment transaction. If the
   writer reports already consumed, discard any unpersisted candidate credential
   and return the sanitized already-converted outcome.
6. Broadcast owner-safe DTO/SSE and push only after a new commit.

For per_payment only, if the exact payment-token-hash unique constraint reports
23505, the whole attempt rolls back and createRetailTransaction retries with a
new credential and fresh database transaction. Tighten collision detection to
that exact constraint; do not treat a missing constraint name or source_hold_id
uniqueness failure as a token collision.

Any unrelated failure leaves the hold open. Concurrent conversions serialize on
the hold. The loser resolves the unique transaction.source_hold_id and returns an
already-converted result; it never creates a second transaction.

### 9.4 Lost one-time response

If a private conversion committed but its HTTP response was lost, a retry returns
409 HOLD_ALREADY_CONVERTED plus a sanitized transaction DTO. It must not mint a
new credential or return the original URL, which is unrecoverable.

The desktop reconciles through terminal-stack and says that the sale exists but
its private link cannot be recovered. A durable board destination may reopen the
board URL. Never fall back to POST /api/transactions.

### 9.5 Phase 5 server and E2E gates

Required real-Postgres cases:

- two concurrent conversions create exactly one transaction;
- a forced first-attempt token collision rolls back fully, retries, and does not
  lose or double-consume the hold;
- an unrelated insert failure preserves the open hold;
- a lost-response retry produces no new transaction or token;
- cross-tenant hold, stock, transaction, and board access is rejected;
- inactive/deleted board conversion is rejected without losing the hold;
- copied line totals equal transaction.price;
- stack/DTO/SSE/push never expose raw credentials or hashes;
- MemStorage and Postgres implement the same observable hold contract;
- migration baseline, scratch-schema drift, and zero-pending status pass.

Required real-API browser flow:

1. Build a multi-item cart from live stock.
2. Hold it.
3. Reload and resume it.
4. Open a second authenticated tablet/desktop session and observe it.
5. Exercise a stale edit conflict.
6. Convert it once to a board sale and once to a private sale.
7. Exercise the private-response-loss reconciliation state.
8. Verify mobile at 390px is unchanged and does not expose holds.

After the production blockers in §1.3 are closed: deploy schema first, deploy
code globally with the flag off, enable the flag in staging and run smoke/E2E,
then enable the global production flag in a monitored window. Watch
conversion/409/error metrics and disable the flag on regression. Do not describe
this environment flag as a per-merchant rollout.

---

## 10. Global verification gate for every phase

Run the smallest focused test while iterating, then all of the following before a
phase is marked complete:

~~~sh
npm run check
npx jest --selectProjects client --runInBand
npx jest --selectProjects server --runInBand
npm run build
npm run db:migrate:status
~~~

For Phases 3 and 5 also run:

~~~sh
npm run test:server:postgres
~~~

Additional acceptance:

- No new console errors, unhandled rejections, stuck loading states, or false
  success states.
- Every control uses a real API or a truthful capability-disabled state. Fixtures
  may support deterministic screenshots, but they do not satisfy functional E2E.
- Keyboard, focus order, visible focus, ARIA state, Escape behavior, and screen
  reader labels are covered for the indicator, cart, stack, detail, and hold
  workflows.
- prefers-reduced-motion produces stable visible final state.
- All geometry/motion probes exit non-zero on failure.
- Screenshots cover the same tablet/desktop UI at 1440×900, 1194×834 with touch
  enabled, and 1366×1024 with touch enabled, plus the separate 390px phone
  regression.
- Tutorial walkthrough still completes on phone, tablet, and desktop.
- Update docs/HANDOFF-2026-07-28-tablet-desktop-app.md after each landed phase with
  files changed, commands/results, screenshots, migration status, unresolved
  external gates, and any newly approved deviation.

---

## 11. Execution order and stop conditions

1. Phase 0: record baseline and release blockers.
2. Phase 1: shared home indicator, chart state machine, and list motion.
3. Phase 2: Retail geometry and the pinned/expanded stack.
4. Phase 3: additive 0018 data foundation, structured cart, transaction detail,
   receipt/cash/refund wiring, and safe cancellation.
5. Phase 4: applicable Property and Trades layout port.
6. Phase 5: feature-flagged server-backed Retail holds.
7. Final integrated screenshots, tutorial walkthroughs, handoff update, and
   reviewable commits.

Stop the affected phase and report rather than guessing if:

- the working tree changed underneath the relevant files;
- migration status no longer matches the recorded baseline;
- a requested behavior would require editing mobile;
- a feature would expose, persist, reconstruct, or silently reissue a bearer
  credential;
- Property/Trades screenshots imply changing a previously accepted exception
  without approval;
- a production-only action requires new authority or access.

A phase is complete only when its named behavior, tests, probes, global gates, and
handoff evidence are all complete. Passing screenshots alone is not completion.
