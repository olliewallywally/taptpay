# Live updates never reached a browser — found by the R1-T1 audit (2026-09-25)

Date: 2026-09-25 UTC. Branch: `remediation/r1-continuation-20260907`, local only. Fix:
`3fac8ac8`. Found once the test harness ran production's request pipeline
([R1-T1 evidence](R1-T1-harness-audit-2026-09-25.md)).

## In plain words

The app has a live-updates channel: when a payment changes, the server pushes the news straight to
the open screens. The customer's payment page uses it to jump to the receipt, and the phone
terminal uses it to show "paid" at once.

**Since 2026-04-07 none of those updates has reached a browser.** Browsers ask for compressed
responses, and the server has compressed everything since then, the live channel included. A
compressor keeps small pieces until it has enough to squeeze, and an update is small, so every
update waited inside the server.

Nobody noticed because every screen also re-checks on a timer: the customer's page every 3
seconds, the phone terminal every 5 and 30. So "paid" still appeared, just up to a few seconds
late. The "real-time updates" indicator checks only whether the device is online, so it never
showed a problem.

The fix: the live channel is never compressed. Everything else still is.

## How it was shown

1. **A standalone copy** of the server's middleware and the channel's way of writing: with no
   `Accept-Encoding`, both events arrived (95 bytes). With a browser's `Accept-Encoding`, the
   reply was brotli-compressed and **0 bytes arrived in 600 ms**.
2. **The running dev server**, `GET /api/merchants/1/events` (the no-sign-in branch): without
   `Accept-Encoding` the "connected" event arrived at once (57 bytes). With
   `gzip, deflate, br`: `Content-Encoding: br`, **0 bytes in 1.5 s**.
3. **Real Chromium 125 against the dev server.** The page was a JSON endpoint, so no app code or
   analytics ran, and every request off the machine was aborted. `new EventSource(…)`, as the
   customer's page does it, received **no event in 3 s**. A streaming `fetch`, as the merchant's
   screens do it, received **no bytes in 3 s**. The server answered both with
   `content-encoding: br`.
4. **The same probe on both commits, in real Chromium 125** (`scripts/verify-live-updates-browser.ts`). This tree's app (`createApp` and the
   real routes, in-memory storage, clean environment) was served on a loopback port, once at
   `05195728` and once with the fix. Every request off the machine was aborted.
   - Before: `EventSource` received no event in 3 s and streaming `fetch` no bytes; both replies
     were `content-encoding: br`.
   - After: both received `{"type":"connected","audience":"legacy-no-board"}` at once,
     uncompressed.

## The fix

- `server/app.ts`: compression skips any response whose `Content-Type` is `text/event-stream`.
  Everything else is compressed as before: a large ordinary response to the same browser still
  comes back `br`. The live-updates route itself is unchanged.
- The harness's `openEventStream()` no longer decompresses. No event stream is compressed now,
  and a compressed one reads as nothing, as in a browser. Its decompressing code (from
  `05195728`) was exercised by no test.

## Proof

- **Test first**: `server/__tests__/live-updates-compression.test.ts`, with Chrome's
  `Accept-Encoding` (`gzip, deflate, br, zstd`). On `05195728`:
  - the merchant's stream and the customer's board stream both fail: `content-encoding: br`;
  - a throwaway copy without that check waited instead: "no event on /api/merchants/1/events
    within 1000 ms", and the same for the board stream;
  - the third test (a large ordinary response is still compressed) passes on both sides.
- **Mutations**, 3 of 3 caught: the default filter back (streams compressed); the wrong type
  excluded; nothing compressed.
- **Suites**: `tsc` clean; server 82 files / 1,459 tests with the guard armed.

## Why the tests never saw it

The harness built its own copy of the app without compression (see the R1-T1 evidence), and the
two tests that read the stream sent no `Accept-Encoding`. The browser checks answer `/api`
requests from fixtures, so the real server's stream was never in them.

## What starts happening again

The screens that act on live updates, all routed:

- **Customer payment page** (`client/src/pages/customer-payment.tsx`): shows the payment's new
  state, goes to the receipt on "completed", shows the error on "failed". It also receives the
  gap-12 notice that two sales are open at once (`legacy_no_board_ambiguous`), which until now
  only its 3-second poll's header conveyed.
- **Split payment page** (`split-payment.tsx`): updates the sale it shows (how many shares are
  paid) when its event arrives. Per-payment-link pages do not listen.
- **Phone terminal** (`merchant-terminal-mobile-v2.tsx`): writes the updated sale into its
  active-sale and sales lists. The event carries `ownerTransactionDto`
  (`merchantSseTransactionDto` is the same function), the shape its sales list already loads, so
  the lists keep their fields.

The dead-code terminals (`merchant-terminal.tsx`, `merchant-terminal-mobile.tsx`,
`demo-terminal.tsx`) also subscribe, but no route renders them.

## For the owner: gap 12

Gap 12's confidentiality half is still open: the no-sign-in branch of this channel shows a
merchant's live sales to anyone who opens it. There is also a documented residual: a completing
sale's broadcast can reach a different customer at the instant only one sale is pending. You
accepted that residual in September, when everyone assumed live updates worked.

- **For an attacker, nothing changes.** A client that does not ask for compression (curl, a
  script) always received these events at once.
- **What changes is real customers' browsers.** On the no-board page they now receive live events
  again, and with them that accepted residual. Nothing is deployed, so nothing changes for anyone
  until this is reviewed and released.
- **If you would rather keep live updates off** for the no-board page until per-transaction
  addressing closes the residual, say so. Gap 12's evidence places the residual on that page's
  stream. The merchant's own stream carries only their own sales.

## Handoff (plan §21.2)

```text
Phase / release:         R1 found-on-the-way fix: live updates (SSE) not compressed; not merged,
                         not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ 3fac8ac8 (local)
Scope completed:         compression skips text/event-stream responses
Files changed:           server/app.ts; server/__tests__/support/http-harness.ts;
                         server/__tests__/live-updates-compression.test.ts (new)
Migrations:              none
Preflight queries:       none
Commands run and results: tsc clean; server 82 / 1,459 with the guard armed; red first 2 of
                         3; mutations 3/3; real Chromium 125 before and after on the same probe
Negative/no-side-effect: ordinary responses are still compressed (pinned by a test)
Provider/UAT activity:   none
Device/browser evidence: real Chromium 125, before (nothing in 3 s) and after (at once)
Security/privacy review: gap 12 above: nothing new for an attacker; real customers' browsers on
                         the no-board page receive live events again, with the residual accepted
                         in September
External actions:        none
Feature flags and payment mode after deploy: unchanged
In-flight operations:    none
Known warnings or deferred items: the owner's gap-12 question
Rollback commit and constraints: revert 3fac8ac8; live updates stop reaching browsers
                         again and screens fall back to polling
Approvals:               a correctness fix, made without asking; the owner may reverse it for the
                         no-board page (above); plan §21.1 review owed
Stop conditions checked: no money initiation enabled; no migration; nothing pushed
Next phase prerequisites: this review; the owner's gap-12 answer
```

## Independent review — brief

**Range:** `05195728..3fac8ac8` (one commit), local only.

> You are the independent correctness reviewer for TaptPay, a payment-terminal SaaS. Review
> commit `3fac8ac8` (range `05195728..3fac8ac8`) on branch
> `remediation/r1-continuation-20260907`. It stops compression from applying to the live-updates
> event stream (`GET /api/merchants/:id/events`), which since `7f52fe11` (2026-04-07) held every
> event inside the server for any client that accepts compression. Start from
> `docs/evidence/remediation-v2-2/r1/R1-live-updates-compression-2026-09-25.md`; treat it as
> claims and re-derive everything from the code. Attack especially:
> - Is every event stream the app can send now uncompressed, including any other
>   `text/event-stream` responder, or a `Content-Type` written differently?
> - Does any ordinary response stop being compressed?
> - Now that events reach browsers again, is the client code that acts on them right? It has not
>   run in a browser since April: `customer-payment.tsx` (its receipt navigation, the gap-12
>   notice), `split-payment.tsx`, and `merchant-terminal-mobile-v2.tsx` (what it writes into its
>   query caches). Also check the updates alongside the polls.
> - Gap 12: what can a browser on the no-board page now receive that it could not before, and does
>   anything change for a client that never asked for compression?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1 and end with Approve / Do not
> approve naming the commit range.

Reproduce: `npm run check`; `npx jest --selectProjects server --runInBand`; and
`node --import tsx scripts/verify-live-updates-browser.ts` on each commit (it exits 1 on
`05195728`, 0 on the fix).
