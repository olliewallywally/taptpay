# Landing real-app phone and coin recovery plan

Status: paused checkpoint — Phase 2 committed; retail/property/trades extraction and sandbox/document foundations implemented; production-store gate pending
Date: 2026-08-11
Scope: landing page only, plus shared mobile view extraction and an isolated landing-demo service
Implementation state: safe foundations are implemented and verified; the standalone document still renders its neutral placeholder and is not wired into either landing phone

Execution checkpoint (2026-08-11):

- Completed: landing-only recovery checkpoint, branded coin mounting/position fix, responsive CSS phone depth/front/back shell, stable deferred host sizing, Industries flow spacing, and scroll-select/beat-autoplay behavior.
- Completed in the paused foundation checkpoint: pure retail, property, trades and quote presentation boundaries; production effect adapters; strict shared demo contracts; deterministic in-memory reducer/service; exact demo routes and security tests; second Vite HTML entry; explicit development/production document serving; path-scoped frame/CSP headers; versioned postMessage guards; in-memory browser session client; and an abortable real-control driver foundation.
- Verified at pause: TypeScript check; production build with both HTML documents; 25 focused client tests; 26 focused server tests; static client/server effect-boundary scan; and clean whitespace validation.
- Safety gate: the current deployment is autoscaled without proven route affinity. Demo API routes therefore remain development-only. Do not enable them in production until an approved shared ephemeral store or stateless signed-state design is implemented and tested.
- Not completed: checkout/quote-acceptance/split-customer extraction; dashboard/dock extraction; deterministic fixtures and all eight scenario manifests; mounting shared views in LandingDemoApp; iframe integration into either landing phone; real-app browser/pixel/API-trace approval; demo graph approval/budget fixture; production-safe cross-replica state; final filmstrips; and superseded-code cleanup.

## 1. Product decision

The phone must show the real mobile application UI.

There will not be a second hand-built imitation of the app. The cinematic story and Industries phone will render the same shared mobile view components that the production app renders:

- In cinematic mode, a deterministic driver visibly presses the real controls and loops the selected workflow.
- In live mode, the driver pauses and the visitor controls the same demo session.
- All demo data and mutations stay inside an expiring landing-demo sandbox. The demo must never authenticate as, query, mutate, message, charge, refund, upload for, or stream events from a real merchant.

The user's 2026-08-11 direction approves the real mobile app as the visual/product target. Before code begins, the product owner must also record approval that the shared-view plus isolated in-memory sandbox architecture in this plan supersedes local task 80ce5a45-c1c9-4c22-9831-56eb6197962c/3.json's unsafe routed demo-terminal.tsx, seeded database merchant, and sandboxed production writes.

This decision also supersedes the parts of docs/PLAN-2026-08-07-landing-phone-demo.md that require a hand-authored replica, direct React mounting without an iframe, no sandbox API, a 90 KB total budget for the complete phone, and no per-scene chunk fetch. Its visual fidelity, scene list, lazy-load-before-approach, accessibility, and verification requirements remain applicable.

The revised fetch contract is explicit: after the load threshold, each phone loads the demo entry and current scene; the next vertical may prefetch. LANDING_DEMO_READY means the document and current scene are interactive. A scene change that still needs a chunk holds the last valid frame and branded loading status until a new LANDING_DEMO_SCENE_READY message arrives; it must never show a blank screen or advance the caption early.

The following are explicitly rejected:

- Restoring the old Three.js implementation.
- Keeping the current scene replicas as the final UI.
- Embedding client/src/pages/demo-terminal.tsx.
- Mounting an authenticated production route inside the landing page.
- Reusing client/public/app/embed.html or any frozen build with hashed asset names.
- Using demo@tapt.co.nz, a normal merchant JWT, production merchant rows, or the production database as a public sandbox.
- Monkey-patching production APIs in the parent landing window.

## 2. What is currently wrong

### 2.1 Coins

The coins are not missing assets and they are not failing to load. They were removed.

- client/src/pages/landing-page.tsx currently renders four faint 6–12 px radial-gradient dots at the hero.
- client/src/pages/landingRuntime.ts only changes their opacity.
- coinDensity is still a public prop but no longer controls a count.
- The known-good prototype rendered approximately 18 recognizable branded coins on desktop/tablet and 10 on mobile at the default density of 1.4.

Required correction: implement a deterministic DOM/CSS/inline-SVG coin field with faces, rim, taptpay branding, depth, distribution, and lightweight motion. Do not add bitmap coin assets or WebGL.

### 2.2 Cinematic phone shell

The current phone is malformed by construction.

- The outer #tp3 black slab is stationary.
- Only the inner #tp3-spin front and back planes rotate.
- The front shell texture is not used.
- The rotating body has no edge faces, rim, bevel, or side buttons.
- At an edge-on angle the front/back planes disappear while the stationary black slab remains.

Required correction: the complete phone body must be one rotating CSS 3D prism. The front, back, edges, rim, buttons, shadow, glare, and app viewport all move as one body.

The existing assets are authoritative and must be reused:

- client/public/assets/shell-front.webp
- client/public/assets/shell-back.webp
- attached_assets/landing_page_july_2026/replit_export/
- docs/designs/motion-tablet-desktop/replit_export/

### 2.3 Deferred screen sizing

DeferredLandingPhone currently replaces the node that owns .tp-app-frame. landingRuntime scales the node present at initialization and at four timed retries. A later lazy resolution can replace that scaled node with an unscaled 390×844 node and crop it inside a roughly 174–239 px aperture.

Required correction:

- One permanent viewport host owns the canonical 390×844 size, top-left transform origin, and scale.
- Loading, error, cinematic, and live content swap inside that host.
- A ResizeObserver owns fit calculations.
- There is no timeout-based refit and no second writer of the transform.

### 2.4 Playback

The August scene work authored timing metadata and tap visuals, but current control logic maps scroll progress to every scene step. A visitor who stops scrolling sees a frozen screen.

Required correction:

- Scroll position selects the scene only.
- A monotonic on-screen clock advances that scene's authored actions.
- The sequence loops while visible.
- It pauses offscreen and while document.hidden.
- It resets when the scene changes.
- Live mode cancels playback immediately.
- Reduced motion shows the loaded real view at a stable completed state unless the visitor explicitly presses play. Save-Data shows only a neutral branded placeholder until explicit Load demo, then the loaded real completed state; it never autoplays without explicit Play.

### 2.5 Industries layout

The Industries phone and live button use magic negative/absolute offsets. The current overlap audit reports control collisions and off-viewport controls, especially on mobile.

Required correction: place the phone and its controls in normal grid/flex flow. The live button must sit below the phone, not over its interactive surface.

## 3. Task inventory

### 3.1 GitHub

At the time of investigation:

- There are no open GitHub issues matching landing, home page, phone, or coins.
- Draft PR 12 has no review comments or unresolved threads about this problem.
- Open PR 2 is an obsolete June landing redesign and is not a recovery source.

Therefore this is an untracked regression plus interrupted local work, not an existing GitHub issue that can simply be resumed.

### 3.2 Local task records

The relevant local records are:

- .claude-home/tasks/80ce5a45-c1c9-4c22-9831-56eb6197962c/1.json — real-session/autoplay phone and filmstrips.
- .claude-home/tasks/80ce5a45-c1c9-4c22-9831-56eb6197962c/2.json — phone overlap and Industries geometry.
- .claude-home/tasks/80ce5a45-c1c9-4c22-9831-56eb6197962c/3.json — scoped live sandbox.
- .claude-home/tasks/c91138e1-3508-4c6d-8e3b-6b0c7689d01a/2.json — landing-phone budget gate.
- .claude-home/tasks/c91138e1-3508-4c6d-8e3b-6b0c7689d01a/6.json — browser verification sweep.

These records are investigation evidence only. Never commit .claude-home.

### 3.3 Dirty worktree

The branch is feat/tablet-desktop-app at HEAD 8c22dc9 and is ahead of origin. There are overlapping uncommitted landing changes from two interrupted workstreams.

At investigation time the landing scope included 23 modified files and these five untracked files:

- client/src/pages/DeferredLandingPhone.tsx
- scripts/audit-landing-overlaps.mjs
- scripts/filmstrip-landing-phone.mjs
- scripts/landing-phone-build-graph.mjs
- scripts/verify-landing-phone-autoplay.mjs

Known-good committed phone foundation:

- e78cc78 — phone engine/scenes/budget gate.
- 04f1180 — manifest.
- 28e8b96 — mounted demo and dead iframe removal.

Do not reset, blanket-stash, or revert the landing directory. Preserve the authored August scene timing and tap work as a behavioral reference until the real-view scenarios reproduce it.

Before the first implementation edit, create a recovery checkpoint outside the repository:

1. Make a uniquely named directory under /tmp.
2. Save git status --short --branch and an explicit landing-path manifest.
3. Save a binary patch of every tracked landing-path diff.
4. Archive the five explicit untracked landing files above, preserving paths.
5. Record SHA-256 hashes for the manifest, patch, and archive.
6. Read them back and verify every hash.

This checkpoint is protection only. Do not restore it over later work without inspecting the target diff and obtaining approval.

Never use git add -A. Every commit must explicitly exclude:

- .claude-home/**
- .claude/settings.local.json

FAQ JSON-LD edits in client/index.html and client/public/app/index.html are unrelated and must remain a separate commit.

## 4. Non-negotiable invariants

1. The existing mobile application must look and behave identically outside demo mode.
2. Phone-only production routes remain phone-only.
3. Tablet/desktop device gating and the centered 13-inch desktop frame remain unchanged.
4. Production controllers keep using production APIs.
5. Shared view extraction must not introduce demo flags into normal auth, merchant, payment, or provider code.
6. The demo imports no production auth controller, global query cache, merchant SSE singleton, provider SDK, upload flow, receipt/download flow, or real navigation controller.
7. The demo token has zero authority on every non-demo endpoint.
8. The landing page loads zero real-app demo JavaScript before the story approaches the viewport.
9. The phone remains logically 390×844 at every outer viewport.
10. No Three.js, WebGL, canvas coin renderer, or additional bitmap coin asset is introduced.
11. No database or migration change is part of this plan.

## 5. Target architecture

The security boundary and the visual boundary are separate:

- The iframe is the visual viewport boundary. It guarantees a real 390×844 mobile layout even when the outer window is tablet or desktop.
- The landing-demo service and token are the security boundary. The iframe sandbox is defense in depth, not authorization.

Data flow:

    LandingPage
      -> LandingPhoneShell
          -> permanent 390x844 LandingPhoneViewport
              -> lazy iframe: /landing-demo.html
                  -> LandingDemoApp
                      -> shared production mobile views
                      -> storyboard or live adapter
                      -> /api/landing-demo/*

The parent and iframe communicate only through a versioned postMessage protocol. The iframe never reads or writes authToken, taptMode, production cookies, or the parent's query cache.

### 5.1 Proposed files

New shared contracts:

- shared/landing-demo.ts

New pure mobile views:

- client/src/features/terminal/retail/RetailTerminalView.tsx
- client/src/features/terminal/retail/retail-terminal-view.css
- client/src/features/terminal/property/PropertyTerminalView.tsx
- client/src/features/terminal/property/property-terminal-view.css
- client/src/features/terminal/trades/TradesTerminalView.tsx
- client/src/features/terminal/trades/trades-terminal-view.css
- client/src/features/checkout/CheckoutView.tsx
- client/src/features/checkout/checkout-view.css
- client/src/features/checkout/SplitPaymentView.tsx
- client/src/features/checkout/split-payment-view.css
- client/src/features/dashboard/RetailDashboardView.tsx
- client/src/features/dashboard/PropertyDashboardView.tsx
- client/src/features/dashboard/TradesDashboardView.tsx
- client/src/features/navigation/TerminalDockView.tsx

New demo entry:

- client/landing-demo.html
- client/src/landing-demo/main.tsx
- client/src/landing-demo/LandingDemoApp.tsx
- client/src/landing-demo/landing-demo.css
- client/src/landing-demo/fixtures.ts
- client/src/landing-demo/reducer.ts
- client/src/landing-demo/actions.ts
- client/src/landing-demo/scenarios.ts
- client/src/landing-demo/driver.ts
- client/src/landing-demo/protocol.ts — bridge and small exhaustive runtime guards only; all message types/constants live in shared/landing-demo.ts
- client/src/landing-demo/useLandingDemoSession.ts

New landing shell/coin integration:

- client/src/pages/landing-phone/LandingPhoneShell.tsx
- client/src/pages/landing-phone/LandingPhoneViewport.tsx
- client/src/pages/landing-phone/LandingDemoFrame.tsx
- client/src/pages/landing-phone/LandingCoinField.tsx
- client/src/pages/landing-phone/landing-phone-shell.css
- client/src/pages/landing-phone/landing-coins.css

New sandbox service:

- server/landing-demo/schema.ts
- server/landing-demo/service.ts
- server/landing-demo/middleware.ts
- server/landing-demo/routes.ts

New or revised verification:

- client/src/__tests__/landing-shared-views.test.tsx
- client/src/__tests__/landing-demo-driver.test.ts
- server/__tests__/landing-demo-service.test.ts
- server/__tests__/landing-demo-routes.test.ts
- scripts/verify-landing-phone-browser.mjs
- scripts/verify-landing-phone-autoplay.mjs
- scripts/filmstrip-landing-phone.mjs
- scripts/audit-landing-overlaps.mjs
- scripts/landing-phone-build-graph.mjs

### 5.2 Vite and server entry

vite.config.ts must build two HTML inputs:

- client/index.html
- client/landing-demo.html

Add rollupOptions.input while preserving the existing rollupOptions.output and output.manualChunks:

    input: {
      main: path.resolve(import.meta.dirname, "client/index.html"),
      landingDemo: path.resolve(import.meta.dirname, "client/landing-demo.html"),
    }

Both outputs must use Vite-generated hashed asset references. Never hard-code a generated chunk filename.

server/vite.ts must explicitly transform and serve landing-demo.html in development before its index.html catch-all. For exactly /landing-demo.html, read client/landing-demo.html, apply the same cache-busting transform used for the main document to /src/landing-demo/main.tsx, and pass that HTML through Vite. All other SPA routes continue to use client/index.html.

Production serving must explicitly send dist/public/landing-demo.html for exactly /landing-demo.html and return 404 if that file is absent. Install the normal SPA fallback only after this route. Do not let a missing demo build silently return the main index.html with status 200.

server/index.ts currently emits X-Frame-Options: DENY in production. After Helmet and before static/Vite serving, add middleware scoped to exactly /landing-demo.html that replaces this with X-Frame-Options: SAMEORIGIN and emits the demo-only CSP in section 8.1. Do not weaken headers for the normal app, checkout, split, or payment pages.

Add a unique meta marker and root marker to landing-demo.html. A production smoke test must prove:

- both built HTML files exist;
- landing-demo.html references the landing-demo entry, never the normal main.tsx or App.tsx;
- every referenced hashed asset returns 200;
- the iframe renders the unique demo root and sends LANDING_DEMO_READY from its exact contentWindow;
- it did not load the main landing/login/app route or register /sw.js.

The demo entry mounts only LandingDemoApp. It does not import App.tsx, ProtectedRoute, the normal device gate, tutorial providers, production notifications, or the production service worker.

## 6. Shared-view extraction contract

Actual app means shared source-of-truth pixels and controls, not an unsafe production controller.

### 6.1 Retail

Extract the visual/state-machine layer currently in client/src/components/SmartTransitions.jsx into RetailTerminalView.

All effects become injected capabilities:

- onCreateSale
- onCreateSplit
- onCancel
- onPickStock
- onShare
- onCashSale
- onRefund
- onOpenReceipt
- onNavigate

RetailTerminalView itself must contain no:

- fetch or apiRequest
- TanStack Query
- localStorage or sessionStorage
- auth token access
- merchant SSE access
- PaymentRequest or native tap-to-pay call
- clipboard, mailto, SMS, window.open, file download, or provider SDK

The production mobile controller supplies its current real implementations. The demo supplies sandbox actions or a contained “simulated in demo” response.

Keep SmartTransitions.jsx as a compatibility wrapper until the production controller renders the extracted view and parity tests pass.

### 6.2 Property

Extract the display components and screen switch from client/src/pages/property/property-terminal.tsx into PropertyTerminalView.

The production page remains the query/mutation adapter. PropertyTerminalView receives:

- current screen
- tenants
- invoices
- schedules
- draft values
- validation state
- event callbacks

No query hook or API call is permitted in PropertyTerminalView.

Move shared property chrome into its own module. Remove the current rent-weekly/property-bill circular import while doing this work.

### 6.3 Trades

Extract the display components and screen switch from client/src/pages/trades/trades-terminal.tsx into TradesTerminalView.

Split the current networked QuoteScreen into:

- QuoteView — pure presentation and callbacks.
- Production quote controller — current queries, quote writes, and PDF behavior.

No PDF generation, upload, external share, or query hook is permitted in QuoteView.

### 6.4 Dashboards and dock

Extract presentational dashboard views from:

- client/src/pages/dashboard.tsx
- client/src/pages/property/property-dashboard.tsx
- client/src/pages/trades/trades-dashboard.tsx

Extract TerminalDockView from BottomNavigation. The view receives the active mode and onPick callback. The production wrapper keeps its existing wouter, localStorage, and device behavior. Demo placement is absolute inside the 390×844 viewport, never fixed to the outer landing window.

### 6.5 Customer checkout and split

Extract pure customer-facing views from:

- client/src/pages/checkout.tsx
- client/src/pages/split-payment.tsx

CheckoutView must support the existing transaction checkout, quote-token, accepted-quote/deposit, wallet/card selection, processing, success, and failure states through props and callbacks. SplitPaymentView must support payer count, share selection, progress, payment, and completion through props and callbacks.

The production pages retain token resolution, query/mutation hooks, provider detection, PaymentRequest, Windcave, navigation, and analytics. The pure views receive already-resolved display state and capabilities. The demo adapter injects deterministic wallet availability and sandbox actions; it must not impersonate a production browser/provider capability.

No fetch, query, auth, provider SDK, PaymentRequest, storage, window navigation, receipt, or external effect is permitted in either pure view.

The quote-deposit scenario must render CheckoutView in its real /trades/quote/:token presentation mode. It must not substitute the merchant QuoteView for the customer's quote screen.

### 6.6 Extraction acceptance

Before the landing demo consumes a shared view:

- Production screenshots before and after extraction are pixel-equivalent at 390×844.
- The production controller's requests and route behavior are unchanged.
- Existing mobile tests pass.
- A static import-boundary test proves every shared view is free of auth, query, SSE, provider, storage, navigation, and network modules.
- CSS is scoped under retail-, property-, trades-, or landing-demo-specific roots. Do not leak new global .tp-* rules into the landing page.
- For every scenario start, major action, and final state, the demo view is pixel-compared with the corresponding production 390×844 route/view under the same deterministic fixture.

## 7. Landing-demo sandbox

### 7.1 Session model

Use an opaque random session token, not a normal JWT.

On POST /api/landing-demo/session:

1. Generate 32 random bytes with the platform cryptographic RNG.
2. Return the base64url token once.
3. Store only SHA-256(token) as the map key.
4. Seed a fresh deterministic session state.
5. Set createdAt, lastAccessAt, expiresAt, revision, and request counters.

The iframe keeps the token in memory only. It must not write the token to cookies, localStorage, sessionStorage, the URL, logs, analytics, or error messages.

Token transport is exact:

- Session creation has no token.
- GET state, POST action, and DELETE session send X-Landing-Demo-Token with the 43-character base64url token.
- Never use Authorization, a cookie, a query parameter, a path parameter, or a request body for the token.
- Every demo fetch uses credentials: omit.
- Demo middleware rejects Authorization and validates the exact header syntax before hashing it.

Server limits:

- Session TTL: 20 minutes from last activity.
- Absolute lifetime: 30 minutes.
- Maximum live sessions per process: 1,000.
- Maximum aggregate serialized session state: 32 MiB.
- Session-create limit: 10 per IP per 10 minutes.
- Action limit: 120 per session per minute.
- Request body maximum: 16 KB.
- State maximum: 64 KB serialized.
- Cleanup interval: 60 seconds, with the timer unref'd.
- At either count or byte capacity, evict expired sessions first, then least-recently-used sessions.
- Apply an action to a copy, serialize and validate its size, then atomically commit the state and revision. A rejected action must not partially mutate a stored object.

Before Phase 4 exits, verify that production is single-instance or has sticky routing for /api/landing-demo/*. If it is not, stop and select a shared ephemeral cache or stateless signed-state design that remains completely separate from production merchant data. Do not pretend repeated 410 recovery can sustain a scenario, and do not add production database rows to solve affinity.

For a genuine expiry/eviction, 410 DEMO_SESSION_EXPIRED makes the iframe create a fresh session and reset the scenario.

### 7.2 Endpoints

Only these endpoints exist:

- POST /api/landing-demo/session — create a seeded session.
- GET /api/landing-demo/state — return the caller's current snapshot.
- POST /api/landing-demo/action — apply one allowlisted action and return the new snapshot.
- DELETE /api/landing-demo/session — destroy the caller's session.

Every state/action response includes revision. POST action requires expectedRevision. After a valid demo token, a mismatch returns 409 with the sanitized current demo snapshot and revision; this is the sole exception to the generic-error rule. Invalid, missing, or unauthenticated token errors never include a snapshot.

The action request is a discriminated Zod union whose every object branch is strict. It must never accept:

- merchantId
- userId
- arbitrary record IDs
- arbitrary URL or route
- endpoint name
- email address or phone destination
- file contents
- provider payload
- free-form HTML

Use fixture keys such as tenant-mia, client-dave, water-bill, heat-pump-quote, flat-white-sale, and split-four.

The server snapshot/revision is authoritative for semantic demo records. Route/view selection, draft inputs, pointer animation, focus, and authored holds are local UI state. Keypad and text interactions update local validated drafts; only a semantic commit sends one fixture-key action. Do not send every keystroke or arbitrary live text to the service. Live values outside the allowlisted demo fixtures remain local and resolve to a contained “the public demo uses preset data” state.

### 7.3 Seed state

Use the existing deterministic landing values:

- Frozen display date: fri 7 aug.
- Tenant: Mia, 18 Tui St.
- Weekly rent: $620.00.
- Utility bill: water, $86.40, due in 7 days, inert water-invoice.pdf chip.
- Trades client: Dave Kerr, 12 Rimu Ave.
- Quick invoice: emergency callout, $480.00.
- Quote: Heat pump service, $1,250.00.
- Deposit: 20 percent, $250.00.
- Retail sale: flat white ×2, $12.50.
- Split bill: $120.00, four people, $30.00 each.
- Checkout merchant: Kerr Plumbing.
- Checkout methods shown deterministically: Apple Pay, Google Pay, and card.

Dates and IDs must be literal and deterministic. Do not use Date.now, Math.random, locale formatting, or the host timezone for visible fixture values.

### 7.4 Security rules

server/landing-demo/service.ts must not import:

- database/storage modules
- merchant/user repositories
- production transaction services
- auth token issuance
- Windcave or wallet providers
- email, SMS, WhatsApp, push, webhook, PDF, upload, receipt, or merchant SSE services

Register demo routes before broad production route parameters, but under their exact prefix.

The 16 KB JSON limit must run before the existing global express.json middleware. Install the strict parser at /api/landing-demo and explicitly skip that prefix in the later global JSON parser. A parser installed inside the route after global parsing is ineffective. Test both Content-Length and chunked oversized bodies.

Normal auth middleware must reject a landing-demo token. Demo middleware must reject a normal merchant token as a substitute for the demo token.

Required headers:

- Cache-Control: private, no-store
- X-Content-Type-Options: nosniff
- Referrer-Policy: no-referrer

Validate Content-Type, Origin, and Fetch Metadata on mutating requests. Return generic errors without tokens or state dumps.

Keep Zod in server/landing-demo/schema.ts. The browser entry uses small exhaustive guards generated by hand from shared types/constants; it must not runtime-import Zod. The current manual chunk rules can otherwise pull the production forms bundle into the iframe.

Hard-disable or replace locally:

- real card/wallet/tap-to-pay sessions
- refunds
- real QR links
- email/SMS/WhatsApp/share
- clipboard writes
- external navigation
- file picker/upload
- PDF/download/receipt generation
- push/webhooks
- billing/team/settings/credential operations

The demo can visibly complete those story outcomes only by reducing sandbox state.

### 7.5 Sandbox tests

Tests must prove:

- Creating a session yields the exact seed state.
- Two sessions never see or mutate one another.
- Reset returns the exact seed state.
- Invalid, stale-revision, oversized, and unrecognized actions fail.
- A merchantId, userId, URL, file, or provider-shaped payload fails validation.
- Expired and evicted tokens fail.
- X-Landing-Demo-Token is the only accepted token transport; Authorization, cookie, URL, body, and malformed-header tokens fail.
- Demo fetches omit credentials.
- Rate, session-count, per-state-size, and 32 MiB aggregate byte limits work.
- Content-Length and chunked bodies above 16 KB fail before route handling.
- An oversized/failed reducer result leaves the prior state and revision untouched.
- A demo token fails on a representative normal merchant endpoint.
- A normal auth token does not grant demo access.
- No test imports or mocks a production DB/provider to make the demo pass.

## 8. Demo document and protocol

### 8.1 Fixed mobile viewport

landing-demo.html declares a 390 px viewport and resets html, body, and #root to exactly 390×844 with overflow hidden.

The parent iframe has:

- width: 390px
- height: 844px
- no responsive width inside the iframe
- title describing the current workflow
- referrerPolicy no-referrer
- sandbox allow-scripts allow-same-origin

Do not add allow-forms, allow-popups, allow-downloads, allow-top-navigation, or presentation permissions.

The allow-scripts plus allow-same-origin combination provides the required fixed viewport, not storage, cookie, parent-DOM, or authorization isolation. The demo entry is trusted code but must be statically and dynamically tested never to read/write storage, cookies, or parent DOM. The ephemeral token and endpoint isolation are the security boundary.

Use this CSP only on landing-demo.html:

    default-src 'none';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    connect-src 'self';
    img-src 'self' data:;
    font-src 'self';
    object-src 'none';
    base-uri 'none';
    form-action 'none';
    frame-ancestors 'self';

Also send X-Robots-Tag: noindex, nofollow. The style exception is required because the existing mobile views use React inline styles; do not weaken script-src.

During retail extraction, remove SmartTransitions.jsx's Google Fonts import. landing-demo.css must declare the checked-in Outfit font files under /assets/fonts. The iframe must make no Google Fonts request. Parent landing font requests are outside this work and are recorded as a separate unchanged baseline.

Each phone owns one iframe, one contentWindow, and one sandbox session. Never reparent an iframe or share a session/token between the cinematic and Industries phones. Browser cache may reuse built assets. Unmount/exit best-effort DELETEs that frame's session and always drops its listeners. Two simultaneous sessions are intentional; a third leaked session is a failure.

### 8.2 Message protocol

Define all messages in shared/landing-demo.ts. Include protocolVersion: 1 and a requestId.

Parent to iframe:

- LANDING_DEMO_INIT
- LANDING_DEMO_SELECT_SCENE
- LANDING_DEMO_PLAY
- LANDING_DEMO_PAUSE
- LANDING_DEMO_RESET
- LANDING_DEMO_ENTER_LIVE
- LANDING_DEMO_EXIT_LIVE
- LANDING_DEMO_SET_REDUCED_MOTION
- LANDING_DEMO_SET_SAVE_DATA

Iframe to parent:

- LANDING_DEMO_READY
- LANDING_DEMO_SCENE_READY
- LANDING_DEMO_STATE
- LANDING_DEMO_STEP
- LANDING_DEMO_COMPLETE
- LANDING_DEMO_LIVE_READY
- LANDING_DEMO_ERROR

Both sides must verify:

- event.origin is the configured landing origin.
- event.source is the expected window.
- protocolVersion is supported.
- scene and action payloads pass schema validation.

Unknown or malformed messages are ignored and reported only to development logging. The parent starts a readiness timeout and accepts LANDING_DEMO_READY only from the exact expected contentWindow and unique demo document.

### 8.3 Loading and failure

The permanent viewport initially shows a small branded loading state. The iframe swaps into the same host without changing host dimensions or transforms.

On a chunk, session, or protocol failure:

- Keep the phone shell intact.
- Show a contained retry control.
- Do not navigate or reveal a raw error.
- Retry creates a fresh iframe and fresh sandbox session.
- The parent remains usable.

Save-Data does not fetch the iframe automatically. It displays a neutral branded placeholder and an explicit Load demo button—never another hand-built app frame or bitmap replica. After Load demo, show the real shared view at its stable completed state; autoplay stays off until the visitor explicitly presses Play.

## 9. Scenario driver

### 9.1 General behavior

The driver must operate the real shared controls.

For every action:

1. Wait for an exact data-demo-id target.
2. Assert the target is visible and enabled.
3. Draw a pointer/tap ripple centered on its bounding box.
4. Dispatch pointerdown, pointerup, and click, or set an input through the native value setter and dispatch input/change.
5. Wait for a specific state revision and visible assertion.
6. Hold the completed frame for the authored duration.

Never use blind nth-child selectors, text regex as the sole selector, arbitrary sleep as success, or direct state mutation that bypasses the control handler.

Add data-demo-id attributes to shared views. These attributes must not alter production behavior or styling.

Use AbortController for every run. Scene change, live mode, unmount, and retry abort the old run and clear all timers/listeners.

Visibility loss pauses the active driver and clock at the current milestone without aborting or resetting it. Resume that milestone and clamp the resumed clock delta to 250 ms so a hidden tab never skips through a sequence.

Before every loop and scene change, reset the sandbox to that scene's exact fixture. Loop two must produce the same state and captured frames as loop one; records must never accumulate across autoplay loops.

### 9.2 Scene manifest

The manifest is the single source of truth for scene order, fixture, actions, expected visible state, caption, and timing.

1. overview
   - Start on the real retail dashboard view.
   - Tap the real dock to property, trades, and retail.
   - Assert each real dashboard view and active dock state.
   - Loop to the start.

2. rent-weekly
   - Open the property terminal.
   - Tap tenants.
   - Select Mia at 18 Tui St.
   - Enter 62000 cents through the real keypad.
   - Choose weekly.
   - Send the request.
   - Assert success and an active weekly schedule card.

3. property-bill
   - Open bill.
   - Select Mia.
   - Enter 8640 cents.
   - Select water and due in 7 days.
   - Show the inert pre-seeded water-invoice.pdf chip; never open a picker.
   - Send.
   - Assert sent, then apply the allowlisted demo-settled action and assert paid.

4. trades-invoice
   - Open quick invoice.
   - Select Dave Kerr at 12 Rimu Ave.
   - Enter 48000 cents.
   - Enter emergency callout.
   - Send.
   - Assert invoice sent, then deterministic sandbox payment.

5. quote-deposit
   - Open new quote.
   - Select Dave Kerr.
   - Add Heat pump service, quantity 1, unit $1,250.00.
   - Enable a 20 percent deposit.
   - Send quote.
   - Switch within the demo document to CheckoutView in the real /trades/quote/:token quote-acceptance mode.
   - View, confirm, and accept.
   - Assert a $250.00 deposit checkout is created.

6. retail-sale
   - Open the real retail terminal view.
   - Enter 1250 cents through the real keypad.
   - Use flat white ×2 as the item description.
   - Commit and show the real share/pending surface with inert demo QR.
   - Apply deterministic demo payment.
   - Assert paid banner and active-stack state.

7. retail-split
   - Enter 12000 cents.
   - Enable split bill and choose four people.
   - Commit.
   - Switch within the demo document to the real split-customer view.
   - Complete four $30.00 sandbox payments.
   - Assert all four paid and $120.00 complete.

8. checkout-wallet
   - Open the real checkout view for the $250.00 deposit.
   - Show Apple Pay, Google Pay, and card regardless of host browser capability.
   - Highlight each affordance.
   - Press Apple Pay.
   - Complete locally without ApplePaySession, Google scripts, Windcave, or PaymentRequest.
   - Assert confirmation for $250.00.

Initially retain the authored milestone counts from manifest.ts:

- overview: 7
- rent-weekly: 18
- property-bill: 19
- trades-invoice: 19
- quote-deposit: 13
- retail-sale: 16
- retail-split: 18
- checkout-wallet: 8

Each scenario entry marks its authoritative capture milestones. The verifier derives its expected count from those capture flags. The initial total is 118. If a shared production view has a meaningful additional transition, update the manifest and tests together; never hand-edit a separate expected total. Pointer-down/transient evidence is either one of those marked milestones or is written to a separately counted interaction strip.

### 9.3 Cinematic versus live

Cinematic:

- Pointer events in the iframe are disabled for the visitor.
- The iframe is tabIndex -1 and inert or equivalently removed from sequential/programmatic focus.
- The scripted pointer is visible.
- The selected scene loops.
- Scroll changes scenes, not steps.

Live:

- Abort the script.
- Reset to the selected scene's starting state.
- Enable iframe pointer events.
- Remove inertness and focus the scenario's defined first interactive control.
- Hide the scripted pointer.
- Announce “interactive demo” to assistive technology.
- Escape inside the iframe posts LANDING_DEMO_EXIT_LIVE.
- Exit live destroys that session, creates a fresh one, and resumes cinematic playback.
- Return focus to the parent live button on exit.

Industries tabs select:

- property -> rent-weekly
- trades -> quote-deposit
- retail -> retail-sale

The live button is below the phone in layout flow. It must never overlay the demo controls.

## 10. Phone shell implementation

### 10.1 Stable viewport

LandingPhoneViewport owns:

- logical width 390
- logical height 844
- transform-origin top left
- measured scale
- clipped aperture
- loading/error/demo content

Use ResizeObserver on the aperture element:

    scale = min(apertureWidth / 390, apertureHeight / 844)

Write the scale to one CSS custom property. React owns this property. landingRuntime must not write .tp-app-frame transforms or schedule refit timeouts.

Assertions:

- host dimensions and transform do not change when the iframe loads.
- the fitted iframe rect equals the expected min(apertureWidth / 390, apertureHeight / 844) result within 1 px in both axes.
- the fitted rect is centered on any unused axis and has neither clipping nor an unexplained bezel gap.
- there is exactly one ResizeObserver per mounted phone and it disconnects on unmount.

### 10.2 One rotating prism

LandingPhoneShell contains one transform-style preserve-3d body. Rotate that body, not a child pair of planes.

Required layers inside the rotating body:

- front face using shell-front.webp
- app aperture behind the transparent front opening
- back face using shell-back.webp
- left edge
- right edge
- top edge
- bottom edge
- metallic gradient rim
- side button layers
- glare

Use the checked-in prototype projection and shell assets as the visual reference. Do not guess new branding.

Use these physical constants:

- perspective: 1100 px
- depth: 11 percent of body width
- corner radius: 13.5 percent of body width
- front/back translation: one half of the depth in opposite Z directions
- right/power button: top 26 percent, height 10.5 percent
- left buttons: top/height 15.5/4.5 percent, 22.5/6.2 percent, and 30.5/6.2 percent
- four edge faces close the prism without gaps

The non-rotating rig may own perspective and a ground shadow only. It must not draw a full front-facing phone silhouette.

Required angles:

- -90 degrees: volume edge only; no stationary slab or backface leak.
- -45 degrees: front, volume buttons, rim, and thickness visible.
- 0 degrees: front texture and contained app visible.
- 45 degrees: front, power button, rim, and thickness visible.
- 90 degrees: power edge only; no stationary slab or backface leak.
- 180 degrees: branded back texture visible.

No texture may be mirrored at any angle.

Motion:

- Initial reveal turns from -540 degrees to 0.
- Scene change makes one 360-degree turn over 1150 ms with cubic-bezier(.6,.04,.16,1).
- Backward scene navigation reverses the turn direction.
- Optional idle rotateX is capped at plus/minus 1.1 degrees.
- Reduced motion disables the reveal/scene turn, idle tilt, and glare sweep.

Both cinematic and Industries phones must use LandingPhoneShell. Do not maintain two shell implementations.

### 10.3 Geometry targets

Use the shell asset aspect ratio exactly:

- outer aspect-ratio: 473 / 969
- width at 880 px and above: clamp(190px, 29vh, 306px)
- width below 880 px: clamp(150px, 22.5vh, 240px)
- height: width × 969 / 473
- aperture left: 4.4 percent
- aperture right: 4.2 percent
- aperture top and bottom: 1.75 percent
- aperture radius: 11 percent / 5.2 percent

Examples derived from the formulas, with plus/minus 1 px tolerance:

- 1440×900: body 261×535 px.
- 1180×820: body 238×487 px.
- 390×844: body 190×389 px.
- 880×820: body 238×487 px.
- 879×820: body 185×378 px.

Industries uses the same 473/969 shell without stretching:

- desktop width 255 px, derived height 522 px
- 390 px mobile width 250 px, derived height 512 px

Add explicit assertions at 879 and 880 px. The large size change is intentional and must not be smoothed by changing the breakpoint.

## 11. Coin field implementation

LandingCoinField receives density, reducedMotion, and a deterministic seed.

Count:

- Desktop/tablet base at 768 px and above: 13.
- Mobile base below 768 px: 7.
- count = round(base × clamp(density, 0.4, 2)).
- Default density 1.4 therefore produces 18 desktop/tablet coins and 10 mobile coins.
- The 768 px coin breakpoint is independent of the phone's 880 px geometry breakpoint.

Each coin is an inline SVG or CSS element with:

- circular metallic face
- outer rim and inner ring
- visible t. or taptpay. mark
- highlight and shadow
- front/back treatment
- depth edge

Distribution:

- Use a fixed seeded PRNG.
- Mark the live headline and CTA in landing-page.tsx with stable data-coin-exclusion hooks.
- After fonts are ready, calculate padded exclusion rectangles from getBoundingClientRect and recompute them through ResizeObserver.
- Expand each exclusion by the maximum configured drift/parallax radius so motion extremes cannot cross the protected content.
- Reject placements that overlap another coin beyond the configured tolerance.
- Bound placement attempts and then use deterministic responsive fallback slots; never reduce the requested count on a crowded 360 px viewport.
- Use three depth bands with different size, blur, opacity, and parallax.
- Keep the same seed for screenshots.

Motion:

- Slow drift and rotation only while hero is visible.
- Pointer/parallax influence is clamped.
- Pause on document.hidden.
- Reduced motion renders the deterministic still positions.
- Save-Data uses the same DOM/SVG field; it does not load another asset.
- Screenshot mode freezes a named animation time/phase and sets pointer input to neutral. Seed alone is not a deterministic moving screenshot.

Accessibility:

- Field is aria-hidden.
- No element is focusable.
- pointer-events is none.

Verification must count the rendered coins and structurally assert that every coin contains a t. or taptpay. face. At the frozen review phase, at least 70 percent of near/mid-depth coins must have a visually recognizable brand face; edge-on/far coins may legitimately hide or blur it. Confirm headline/CTA intersection is zero at initial, maximum drift, and maximum parallax states.

## 12. Lazy loading and performance

### 12.1 Load boundaries

- The coin field and CSS phone shell may be part of the landing chunk.
- The iframe document and all shared app views must not load until the story is within 1.5 viewport heights.
- Industries owns its own iframe/document/session and loads only when its phone approaches. It may reuse browser-cached asset responses from the cinematic frame, never the document, contentWindow, or token.
- Route/view chunks inside the demo entry are lazy by vertical.
- Prefetch only the next scene after the current scene is ready.

### 12.2 Budget contract

The prior 90 KB phone budget was written for a hand-built replica and cannot silently be applied to the complete real mobile app graph.

Keep two budgets:

1. Landing shell budget
   - Preserve the existing eager landing baseline.
   - Phone shell/loader JS: 35 KB gzip maximum.
   - Phone shell/coin CSS: 8 KB gzip maximum.
   - Existing shell images: 40 KB raw maximum.
   - No demo entry or shared app view is reachable from the eager graph.

2. Real demo budget
   - Before wiring it into LandingPage, build the extracted demo entry and record its gzip and Brotli graph in a committed budget fixture.
   - Initial stop ceilings are 200 KB gzip for the first interactive scene, 200 KB gzip for any one additional vertical, and 600 KB gzip for the complete eight-scene demo graph.
   - Present the measured graph for explicit human approval before integration; the first implementation may not bless its own size merely by recording it.
   - After approval, set each graph's regression maximum to the approved measured baseline plus 10 percent, while retaining the absolute ceilings above.
   - Updating the fixture is a separate deliberate command. Normal verification never rewrites it.
   - A later increase requires explicit review.
   - Fail if the graph imports a production controller, App.tsx, TanStack Query, auth, SSE, provider SDK, PDF, upload, QR network component, or Three.js.

Repair scripts/landing-phone-build-graph.mjs so dynamic-entry and node.file roots resolve correctly. Include both the parent loader graph and explicit-click demo graph in its report.

### 12.3 Request graph

Before the story approaches:

- No landing-demo HTML, JS, CSS, image, or API request.

After cinematic load:

- Demo build assets.
- POST /api/landing-demo/session.
- GET /api/landing-demo/state only if recovery is needed.
- POST /api/landing-demo/action.
- DELETE /api/landing-demo/session during best-effort cleanup.

Forbidden for every request initiated by landing-demo.html:

- /api/auth/*
- /api/merchants/*
- /api/transactions/*
- /api/property/*
- /api/trades/*
- merchant SSE
- Windcave
- Apple/Google provider scripts
- fonts.googleapis.com
- upload, email, SMS, push, webhook, PDF, or receipt endpoints
- external network requests from the iframe

The parent landing document currently has its own Google Fonts requests. Snapshot that existing parent request graph and fail only on a new parent regression; do not remove or conflate those requests as an incidental demo change.

## 13. Implementation phases

Do not combine phases merely to reduce commit count. A phase is complete only when its exit gate is green.

### Approval gate — record the superseding decision

Before any implementation edit:

1. Product owner confirms that “actual app” means shared production view components with isolated in-memory demo state, not routed demo-terminal.tsx or a seeded production-DB merchant.
2. Mark local task 80ce5a45-c1c9-4c22-9831-56eb6197962c/3.json superseded in the tracked handoff record; do not commit .claude-home.
3. Record approval of the iframe, scoped demo API, revised scene-fetch contract, and split budget.

Exit gate:

- The architecture is approved in a tracked document or review thread.

### Phase 0 — preserve and establish evidence

1. Read AGENTS.md, CLAUDE.md, docs/PLAN-2026-07-24-tablet-desktop-app.md, docs/PLAN-2026-08-10-finish-review-and-fix.md, docs/PLAN-2026-08-07-landing-phone-demo.md, and this plan in full.
2. Record git status and the exact landing-only diff.
3. Create and hash-verify the external /tmp checkpoint specified in section 3.3.
4. Do not alter or stage .claude-home.
5. Compare the claimed completed autoplay controller in task 80ce.../1 and its file-history version with the current scroll-step-driven tree. Recover only reusable logic deliberately, or record that the task status is stale. Do not assume the controller exists.
6. Preserve the August authored scene timing/actions as behavioral reference.
7. Repair and run the existing landing budget graph gate before recording a baseline.
8. Run read-only/current tests that do not require DB mutation.
9. Capture current broken landing at desktop, touch tablet, and mobile.
10. Serve and capture the intended checked-in prototype from attached_assets/landing_page_july_2026/replit_export/ at desktop, touch tablet, and mobile.
11. Explicitly record that docs/designs/motion-tablet-desktop/screenshots/*-mobile.jpg are duplicate blank-shell images and forbid them as visual goldens.
12. Capture the current production mobile routes needed for shared-view extraction at 390×844 in a safe deterministic environment. If the separate migration gate prevents this, Phase 3 is blocked until that gate is resolved; do not guess parity.
13. Record the trustworthy current build graph.
14. Fix audit-landing-overlaps.mjs JSON mode so a failing audit exits nonzero.

Exit gate:

- Broken phone, coins, scale race, and overlaps have reproducible artifacts.
- No user-owned work was reverted.

### Phase 1 — lock tests before visual repair

Add expected-failing checks for:

- 18/10 default coin count and density changes.
- coin count behavior at 767/768 and phone geometry behavior at 879/880.
- shell front/back texture presence.
- no stationary slab, mirrored texture, or backface leak at -90/-45/45/90 degrees.
- stable host identity through delayed load and error.
- screen containment after 0, 2, and more than 5 seconds of lazy delay.
- final scene step rather than merely step greater than zero.
- autoplay advance, loop, pause, reset, and reduced-motion state.
- overlap audit exit code.

Run each new regression test against the broken tree and retain its failure output as an artifact. Do not commit an expected-red state; stage each test with the implementation commit that makes it green, as specified in section 15.

Exit gate:

- Each known regression is caught by at least one failing automated check.

### Phase 2 — fix permanent viewport, shell, coins, and Industries flow

1. Introduce LandingPhoneViewport and move scaling to ResizeObserver.
2. Remove initPhones timeout refits and transform ownership from landingRuntime.
3. Introduce LandingPhoneShell and rotate one complete prism.
4. Apply both shell textures, edge/rim/button/glare layers.
5. Use the same shell for cinematic and Industries.
6. Introduce LandingCoinField and honor coinDensity.
7. Replace Industries magic offsets with normal layout.
8. Place live controls outside the interactive surface.

Exit gate:

- Shell/coin/containment/overlap tests pass.
- Visual contact sheet is approved at -90/-45/0/45/90/180 degrees and all required viewports.
- No Three dependency is reintroduced into source.

### Phase 3 — extract pure real-app views

Work one vertical at a time:

1. Retail view extraction and production parity.
2. Property view extraction and production parity.
3. Trades/Quote view extraction and production parity.
4. Checkout, quote-acceptance, and split-customer view extraction and production parity.
5. Dashboard and dock extraction and production parity.
6. Import-boundary tests.

Exit gate after each substep:

- Existing mobile route is pixel-equivalent and behavior-equivalent.
- Production API trace is unchanged.
- Shared view has no forbidden import/effect.

Do not proceed to the demo entry with a vertical whose production parity is not approved.

### Phase 4 — implement isolated sandbox service

1. Add shared contracts/constants and the server-only strict Zod action union.
2. Add in-memory session service.
3. Add demo-only middleware and routes.
4. Install the prefix-scoped 16 KB parser before global JSON parsing.
5. Add header-only token transport, limits, global byte cap, cleanup, revisions, reset, and deterministic fixtures.
6. Verify single-instance/sticky deployment or stop for an approved ephemeral state design.
7. Add security and isolation tests.
8. Add a normal-endpoint rejection test for demo tokens.

Exit gate:

- All sandbox contract/security tests pass.
- A dependency scan proves the service has no DB/provider/communication imports.

### Phase 5 — build the demo document

1. Add Vite HTML entry.
2. Add exact Rollup inputs and preserve manual chunks.
3. Add explicit development and production HTML serving, unique marker, path-scoped frame/CSP headers, and missing-file 404.
4. Mount shared views without App.tsx or production providers.
5. Add in-memory session client using X-Landing-Demo-Token and credentials omit.
6. Add internal view navigation and deterministic wallet capabilities.
7. Remove iframe Google Fonts and use checked-in local fonts.
8. Measure the real-demo graph, enforce absolute ceilings, obtain approval, then commit the approved baseline.

Exit gate:

- /landing-demo.html works after a clean development and production build.
- Its viewport is exactly 390×844 at outer widths 390, 1180, and 1440.
- Only /api/landing-demo/* appears in its request graph.

### Phase 6 — implement scripted real interactions

1. Add stable data-demo-id targets to shared views.
2. Implement the versioned message protocol.
3. Implement driver targeting, pointer visualization, input, assertions, cancellation, and timers.
4. Port all eight authored sequences.
5. Make scroll select scenes only.
6. Add live takeover/reset/resume.
7. Add reduced-motion, Save-Data, offscreen, and hidden-tab behavior.

Exit gate:

- All eight sequences reach their exact final assertions, loop, and never skip a required press.
- Live mode uses the same controls/state and makes only sandbox actions.

### Phase 7 — integrate into both landing phones

1. Replace the current scene replica content with LandingDemoFrame.
2. Keep one permanent viewport host.
3. Mount one iframe/session per phone; rely on browser asset caching and never reparent or share a document/token.
4. Wire cinematic story scene selection.
5. Wire Industries tabs and live toggle.
6. Keep accessibility labels/captions synchronized with iframe state.
7. Retain error/retry without geometry changes.

Exit gate:

- Both phones show the real shared views.
- Delayed iframe/chunk/session failures never deform the shell.
- No duplicate sessions, observers, listeners, clocks, or drivers survive unmount.

### Phase 8 — remove superseded code

Only after Phase 7 passes:

1. Delete hand-built landing scene replicas that have no remaining consumer.
2. Delete their duplicate fixtures/CSS/primitives.
3. Remove obsolete iframe/embed artifacts only after a whole-repo reference search.
4. Remove the orphan DemoTerminal import/page only if product confirms it has no future route.
5. Remove Three.js from package.json and lockfile only after a whole-repo source/build reference check.
6. Update tracked plan documents to point to this plan. Do not edit or commit .claude-home task/memory records.

Exit gate:

- No dead duplicate demo UI remains.
- Production mobile app and landing build remain green.

### Phase 9 — final verification and isolated commits

Run all gates in section 14. Review artifacts manually. Commit in the order in section 15.

Exit gate:

- Every definition-of-done item is evidenced, not inferred.

## 14. Verification matrix

### 14.1 Static and unit

Run:

- npm run check
- npm run test:client
- npm run test:server
- npm run build
- focused landing scene/shared-view/driver tests
- sandbox route/service tests
- landing-phone build graph verifier

Do not run DB-writing workflows merely to verify this sandbox. Respect the separate migration gate documented in docs/PLAN-2026-08-10-finish-review-and-fix.md.

### 14.2 Browser sizes

Required outer viewports:

- 1440×900 desktop.
- 1180×820 touch tablet.
- 1024×768 tablet.
- 880×820.
- 879×820.
- 390×844 mobile.
- 360×800 small mobile.

In every outer viewport the iframe layout viewport remains 390×844.

Pin the capture environment:

- the repository's locked Playwright/Chromium revision
- device scale factor 1 unless a separate retina pass is named
- locale en-NZ
- timezone Pacific/Auckland
- frozen fixture date fri 7 aug
- fonts.ready before first capture
- deterministic coin seed, frozen animation phase, and neutral pointer
- touch enabled for tablet/mobile contexts

Write durable artifacts under artifacts/landing-phone/<commit-or-run-id>/ with manifest.json, request logs, inner filmstrips, full-page contact sheets, and diffs. /tmp may be scratch space but is never the only retained output.

### 14.3 Filmstrips

Generate:

- An inner-demo filmstrip whose count is derived from manifest capture flags; the initial expected total is 118.
- A separately counted interaction strip if pointer-down/transient frames are not among those capture flags.
- A full-landing contact sheet at desktop, touch tablet, and mobile.
- Both cinematic and Industries phones.
- Start, pointer-down, meaningful intermediate, network/result transition, and final state.

Do not crop all evidence to data-demo-scene. At least one artifact per scene must include the full phone shell and surrounding landing layout.

### 14.4 Phone shell

Capture and assert:

- -90 degrees volume edge.
- -45 degrees front/volume side.
- 0 degrees front.
- 45 degrees front/power side.
- 90 degrees power edge with no slab.
- 180 degrees back.
- loading.
- delayed load at 2 seconds.
- delayed load after 5 seconds.
- chunk error and retry.
- session expiration and recovery.
- reduced motion.
- Save-Data.

For the cinematic phone, capture every required outer viewport at -90/-45/0/45/90/180 plus loading, 2-second delay, greater-than-5-second delay, error, and retry. For Industries, capture desktop/tablet/mobile initial, live reveal, interactive, exit/hide, and restored-copy states.

The transformed iframe rect from getBoundingClientRect must equal the expected fitted rectangle within 1 px, be centered on an unused axis, and have no clipping or unexplained bezel gap. The verifier must calculate clipping intersection; offsetWidth/offsetHeight is insufficient. Remove the obsolete .lp-phone/.lp-face style injection and inspect the real shell, aperture, and full landing layout.

### 14.5 Coins

Assert:

- Default count is 18 desktop/tablet and 10 mobile.
- Counts switch at 767/768; phone size independently switches at 879/880.
- Density 0.4 and 2 change count according to the formula.
- Structurally every coin has a face/rim and t. or taptpay. mark.
- At least 70 percent of near/mid-depth coins are visually recognizable at the frozen review phase.
- No coin intersects the hero headline or primary CTA at initial or maximum-motion extremes.
- Reduced motion is still.
- Normal motion pauses offscreen/hidden.
- Deterministic screenshots repeat exactly with the same seed, frozen phase, and neutral pointer.
- Hero contact sheets cover desktop/tablet/mobile in normal and reduced-motion modes.

### 14.6 Playback and live mode

Assert:

- Parking scroll advances the selected scene.
- Scroll changes scene without scrubbing its milestones.
- Each scene reaches its exact final state and loops.
- Scene/caption/industry never drift.
- Offscreen and hidden pause.
- Re-entry resumes without a large skip.
- Scene change resets.
- Live mode cancels immediately and enables actual controls.
- Exit destroys/reset session and resumes cleanly.
- Reduced motion/Save-Data do not autoplay.

### 14.7 Network and security

Record requests with frame/initiator attribution. For the iframe, fail on:

- Any normal auth, merchant, transaction, property, trades, checkout, or SSE endpoint.
- Any provider, wallet SDK, font, analytics-from-iframe, upload, PDF, email, SMS, push, webhook, or other external request.
- Any request before the load threshold.
- Any token in a URL or log.

Allow only the built demo assets and /api/landing-demo/* after the correct load trigger. Separately compare the parent page to its recorded request baseline so existing parent font traffic does not masquerade as an iframe violation.

### 14.8 Layout and accessibility

Run the overlap audit with a real nonzero exit on failure.

Assert:

- No transparent driver layer covers live controls.
- No live/exit/hide button overlap.
- No control lies outside the phone or outer viewport.
- Industry tabs have at least 8 px separation or a clearly shared segmented-control boundary.
- Keyboard can enter/exit live mode and use the demo controls.
- Focus stays contained logically and returns to the live button on exit.
- The iframe has a descriptive title.
- Dynamic status uses a polite live region without announcing every animation frame.
- Decorative shell/coins/pointer are hidden from assistive technology.
- Color contrast and touch targets remain production-equivalent.

## 15. Commit plan

Never use git add -A.

Commit 0: this plan only

- docs/PLAN-2026-08-11-landing-real-app-phone-and-coins.md
- no implementation or .claude-home file

Before Commit 1, resolve the unrelated FAQ pair by owner decision: either verify and commit only client/index.html plus client/public/app/index.html as its own preflight commit, or explicitly assign/park that work and exclude both paths from every landing commit. Never mix one of the pair into this feature.

Commit 1: test harness correctness

- overlap JSON exit
- browser verifier false positives
- existing landing budget-graph root repair and trustworthy baseline reporting

Expected-red regression tests are proved red locally but are committed with their corresponding green fix:

- delayed-load/shell tests with Commit 2
- coin tests with Commit 3
- autoplay/driver tests with Commit 11

No retained commit may intentionally leave its focused test suite red.

Commit 2: stable viewport and CSS phone shell

- permanent host
- ResizeObserver fit
- one rotating prism
- both textures/rim/buttons
- Industries flow

Commit 3: recognizable coin field

- DOM/SVG coins
- density
- deterministic placement/motion/accessibility

Commit 4: retail shared-view extraction

Commit 5: property shared-view extraction

Commit 6: trades/quote shared-view extraction

Commit 7: checkout/quote-acceptance/split-customer shared-view extraction

Commit 8: dashboard/dock shared-view extraction

Commit 9: sandbox contracts and service

Commit 10: demo HTML entry and production/dev build wiring

Commit 11: scenario driver and eight manifests

Commit 12: landing integration, live mode, lazy/error/reduced-motion behavior

Commit 13: budget and browser/filmstrip gates

Commit 14: verified dead-code/dependency cleanup

Do not include the unrelated FAQ JSON-LD work in any of these commits.

After each commit:

- stage only an explicit path allowlist named in that commit; never use a directory-wide wildcard in this dirty tree
- inspect git diff --cached --name-only and git diff --cached
- confirm no .claude-home or settings.local file is staged
- run the phase's focused tests

## 16. Definition of done

The work is complete only when all statements below are true:

- The hero visibly contains recognizable branded coins, with 18 desktop/tablet and 10 mobile at default density.
- The phone uses both current shell textures and reads as a physical object at front, oblique, edge, and back angles.
- No stationary black slab exists.
- Lazy loading, failure, retry, and remount never crop or enlarge the app screen.
- Both landing phones render shared real mobile app views, not hand-built replicas or frozen bundles.
- The cinematic phone visibly operates real controls and loops all eight workflows.
- Try it live hands the same sandbox session to the visitor and exits cleanly.
- Production mobile pages remain visually and behaviorally unchanged.
- Tablet/desktop gating remains unchanged.
- No demo request can reach a real merchant record, database mutation, SSE stream, payment provider, or communication service.
- A demo token is useless on normal endpoints.
- No demo assets load before the story approaches.
- Browser, build, type, unit, security, budget, overlap, accessibility, reduced-motion, Save-Data, and visual gates pass.
- All screenshots/contact sheets are retained as review artifacts.
- The final staged diff contains no .claude-home/** or .claude/settings.local.json.

## 17. Stop conditions

The implementer must stop and request review instead of guessing if:

- Shared-view extraction changes a production mobile screenshot or API trace.
- The demo requires importing a production controller or provider SDK.
- A proposed action needs the production database.
- A normal merchant token is considered for the demo.
- The measured real-demo graph exceeds an absolute ceiling or has not received explicit initial human approval.
- The production deployment cannot serve a second Vite HTML entry reliably.
- Production is multi-instance without sticky routing and no approved shared ephemeral/stateless demo-state design exists.
- Browser evidence still shows a slab, clipped screen, missing coin branding, or control overlap.
- Existing user-owned dirty changes conflict with a planned edit and cannot be preserved safely.

This plan intentionally makes those conflicts visible before the feature can be called complete.
