# Mobile quote steps — isolated work

User request: mobile trades terminal quote creation with 35% white / 65% navy,
start screen and thin right chevron in a wire circle, then client, items, and
deposit/notes steps. Deposit choices: 10%, 20%, custom percent/fixed amount.
Success reuses terminal pop-in/pulsing check and offers native share, copy link,
selectable URL, PDF and done.

Worktree: `/tmp/taptpay-mobile-quote`, branch `feat/mobile-quote-steps`.
Base: `1269e644`. Initially implemented in isolation. After the user reported no visible changes,
checked the shared checkout at `7d3681ca`: clean tree and no quote-file changes
since base. Applied only this patch to `/home/runner/workspace` on the existing
branch (no branch switch, commit, push or deployment). Files remain uncommitted.
The existing port-5000 Vite server returned the new component with HTTP 200.
Server-side quote handler changes need an app restart; none performed yet.
User is viewing a Replit window; exact URL requested to distinguish development
preview from published deployment before changing any running deployment.

## Implementation

- New presentation component/CSS in `client/src/features/terminal/trades/`.
- Existing quote controller chooses it only when `useDeviceClass()` is mobile.
  Desktop/tablet routing retains its existing desktop composer; the controller
  also retains `QuoteView` as its non-mobile fallback. Both mobile terminal and standalone
  `/trades/quote` paths use this controller.
- New API input accepts exactly one saved client, inline recipient, or explicit
  skip. Unsaved/omitted details use existing hidden prospect profiles (like quick
  invoices); no schema migration, invented contacts, or visible blank clients.
- Shared edits are limited to the quote POST handler in `server/routes.ts` and
  `createQuoteSchema` in `shared/schema.ts`. Preserve ownership and billing checks.
  These two hunks need careful integration with Claude's ongoing server review.
- Step data survives Back, invalid amounts/deposits cannot advance/create, pending
  creation disables repeat clicks, and sharing/copy failures show a selectable URL.
- Global legacy input !important styles require a quote-scoped contrast override.
- Quote hero keeps the existing `stagger` marker: terminal chrome measurement
  depends on it. Without it the navigation overlaps the form at the old boundary.

## Verification

- `npm run check` passed.
- `npm run build` passed (existing bundle-size/browser-data warnings).
- 10 focused client tests passed; existing original QuoteView coverage retained.
- 4 HTTP tests passed using the real route registration with mocked trade storage
  and delivery: unsaved/skipped clients, ownership rejection, billing rejection,
  invalid mode rejection, server-recomputed totals and generated quote token.
- Isolated browser preview on port 5191; scripts/check-mobile-quote.mjs uses fixture
  API responses, no live quote creation or external email/SMS. Checks 320×568,
  390×844 and 430×932, 35/65 geometry, full skip/create path and success actions.
  Screenshots: `/tmp/quote-{width}-{start,client,deposit,success}.png`.
- Production data, migrations, Claude's dev server and generated public/app snapshot
  were not touched. No claim of live delivery verification.

Before integration compare these files against the latest Claude branch, then
apply only this worktree's quote changes. Do not replace whole shared files.


## Wireframe and motion revision

User clarified they are using the embedded Replit development preview. Subsequent
styling edits are applied directly to the quote component/CSS in the shared
checkout so Vite serves them immediately, with no server restart required for
these frontend-only edits. Claude's new property-scoping probe is left untouched.

- All form fields, custom deposit controls and the share URL use transparent
  wireframe surfaces. The requested 35% white hero / 65% navy panel remains.
- The native client select is replaced by a searchable, inline directory with
  animated grid expansion/collapse. It pushes manual details down, filters real
  clients, and returns focus on selection/Escape. Collapsed content is inert.
- Scrollbars are hidden while touch/keyboard scrolling remains available for
  long directories, line-item lists, notes, and small phone viewports.
- Matching footer Back/Next circles. Back uses a left-facing thin chevron (the
  user's original direction wording was contradictory; this interpretation was
  stated and the user asked to continue).
- Native Web Animations provide outgoing and incoming eased bounce/pop motion,
  including success. Navigation is locked during transitions; reduced-motion
  preference bypasses these animations. No animation dependency was added.
- Focused client tests: 11 passed. Typecheck and production build passed.
- Browser fixtures target BASE_URL (default the existing port-5000 preview), not
  a second app server. Tests do not create real quotes or send messages.
