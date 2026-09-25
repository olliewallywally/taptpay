# WORKING NOTES — R1-T1 audit (2026-09-25, from ~04:55 UTC)

Scratch progress record kept on disk as work goes (crash-recovery rule). Folded into the evidence
file at the end. Scratch outputs: `.local/claude-scratch/session-2026-09-25/`.

## Where this starts

- Previous session (`596bde91`) ended normally 2026-09-23 20:51 UTC (last line `turn_duration`).
- R1-T9 had no §21.2 handoff or review brief: added, `03c4663b`. Re-run at `b86f0071`: tsc clean,
  server 79/1,432, client 86/760.
- R1-T1 (C09, "blocks all of R1"): harness built 2026-09-06 (`b5251fdd`); its audit never done.
  Source plan R1-T1 + v2.2 §8.2: construct the app without listening, Vite, migrations, seeding,
  cron startup, backups or real provider clients; inject or mock storage, Windcave transport,
  clock, push, SSE, outbound HTTP and configuration; principals merchantAOwner, merchantAMember,
  merchantBOwner, disabledUser, validatedAdmin, publicPaymentBearer, providerNotification,
  cronCaller, ecommerceApiKey (disabled). Check: construct, request as merchant A, assert —
  no network, no database, no cron, no Vite, under 5 s. §8.1: record all warnings.

## Findings (audit)

1. **"No network" is claimed, never checked.** `http-harness.test.ts`'s first test is titled
   "no network, no database, no cron, no Vite" and asserts only a 200. Nothing in the server
   project fails a test that connects off the machine. Probe (throwaway jest config): patching
   `net.Socket.prototype.connect` sees `fetch`'s connection (`example.com:443`), and `fetch` then
   rejects as an ordinary "fetch failed" with the guard's error as `cause` — so code under test
   swallows it (a route answers 502), and a guard must record the attempt and fail the test
   itself. The `net` module is shared by every test file in a worker (a mark set in one file is
   seen in the next), so a guard installs once per worker and keeps its record there.
2. **The harness app is not production's app.** `createTestApp` hand-copies one piece of
   `server/index.ts` (JSON parsing except the Windcave notification) and leaves out helmet,
   compression, the bearer pages' `Cache-Control: private, no-store` / `Referrer-Policy:
   no-referrer`, and the request logger (whose redaction keeps tokens out of log lines). No
   harness test can see those. Plan: "refactor route registration just enough to construct an
   Express app" — one factory both use.
3. Principals: `providerNotification` has no fixture (the notification is exercised by
   `r0-t5-callback-containment.test.ts` through the harness, by hand); `mintPaymentCredential`
   (publicPaymentBearer) is used by no test; ecommerceApiKey only for the disabled path (correct:
   the flag is off by default).
4. Seams as they stand: storage = MemStorage (test-env deletes DATABASE_URL); configuration =
   env set before `config.ts` is imported (frozen at import), per-file env modules; clock = Jest
   fake timers faking only `Date` (auth-throttle.test.ts, inline); Windcave = global `fetch`
   (`server/windcave.ts:43`) or `jest.mock("../windcave")`; Google = global `fetch`
   (`routes.ts:663,684`); SMS/WhatsApp = global `fetch`; email = Resend SDK (`jest.mock("resend")`)
   or the simulation provider (test-env); web push = `jest.mock("web-push")`; APNs = `http2`
   (no seam; credentials cleared); SSE = `sseBroker` singleton, and two files each carry their
   own raw-socket reader (`collectRaw`).
5. Not loaded / not started (to prove at runtime): Vite (`server/vite.ts`), seed, migrations,
   port manager; no scheduler dependency in package.json; no backup code in `server/`;
   `process.getActiveResourcesInfo()` lists only timers that keep the process alive (checked:
   an unref'd interval is not listed), so before/after the build proves nothing runs on its own.
6. The route inventory scans `server/routes.ts` only, so `server/index.ts`'s `app.use`
   middleware are in no inventory (R1-T2's "every app.use" requirement; noted, not this task).
7. §8.1 warnings in today's runs: `ts-jest` "isolatedModules is deprecated" (both projects);
   `baseline-browser-mapping` data over two months old (client); console noise from MemStorage
   (`All merchants and transactions cleared from memory` on every reset).

8. **Found through finding 2: live updates never reach a browser** (since `7f52fe11`,
   2026-04-07, "gzip compression"). `compression()` compresses `text/event-stream` (compressible
   as `text/*`), and nothing flushes the compressor, so every event waits in it. Reproduced three
   ways: a standalone copy of the middleware (no Accept-Encoding: 95 bytes; browser's
   Accept-Encoding: `br`, 0 bytes in 600 ms); the running dev server's `/api/merchants/1/events`
   (57 bytes vs `br`, 0 bytes in 1.5 s); real Chromium 125 on the dev server (page = JSON endpoint,
   off-machine requests aborted): `EventSource` got no event in 3 s, streaming `fetch` no bytes in
   3 s, both answered `content-encoding: br`. Masked because every screen also polls (customer
   payment and split 3 s, phone terminal 5 s / 30 s) and the "SSE connection" monitor only reads
   `navigator.onLine`. Routed consumers that would start receiving events: customer-payment
   (`transaction_updated`, `legacy_no_board_ambiguous`), split-payment, merchant-terminal-mobile-v2
   (writes the event's transaction into its query caches). Plan: fix after the harness work, as its
   own commit, with the harness test red first; check the SSE DTO against what those caches hold.

## Plan (tests first)

- [x] red, on `03c4663b` (`.local/claude-scratch/session-2026-09-25/r1-t1-red.log`):
      `no-network-guard.test.ts` cannot load (no guard module) — 6/6 red; `r1-t1-harness.test.ts`
      11 of 14 red, each for its reason (`X-Powered-By: Express`; no `Cache-Control` on the six
      bearer pages; `requestLog` undefined; `providerNotification` / `useFakeClock` /
      `openEventStream` not functions); 3 guards pass (nothing loaded or running, MemStorage,
      payment-link bearer).
- [x] built (~05:00): `server/app.ts` `createApp({ writeRequestLog })` — the block moved from
      `index.ts` byte-identical except the log writer (diffed); `index.ts` uses it;
      `support/no-network.ts` (setupFiles) + `support/no-network-after-env.ts`
      (setupFilesAfterEnv); harness uses `createApp`, keeps `requestLog`, adds
      `providerNotification`, `useFakeClock`, `openEventStream`. Own bug found on first run: the
      guard read http's `path: null` as a socket file (Node treats only a truthy `path` as one).
- [x] added after planning mutations (they would have gone uncaught): socket-file refusal, UDP
      refusal, the config wiring (importing the guard arms it, so "armed" alone proved nothing),
      compression pinned, and an end-to-end check: a child Jest with the server config runs
      `fixtures/network-call-swallowed.fixture.ts` and that test is reported **failed**.
- [x] **full server suite with the guard armed (05:05): 1,453 / 1,456; the guard caught two
      existing tests** that simulate "the database does not answer" by dialling `192.0.2.1:5432`
      (TEST-NET-1: never answers, but still a connection off the machine):
      `migrate.test.ts` "never throws when the database is unreachable" and
      `migration-runner-hardening.test.ts` "production-style startup checks fail closed…". Now a
      loopback server that accepts and never answers (`support/silent-database.ts`) — the same
      timeout path, nothing leaves the machine. Third failure was my compression test (supertest
      parsed the non-JSON Apple Pay file as JSON). The five files: 111/111.
- [x] **R1-T1 committed `05195728`** (05:17): red first on `03c4663b` in the worktree 21 of 24
      (guard file cannot load, 9; harness 12 of 15) + the two dialling tests; mutations 30/30
      (guard 10, wiring 3, app 9, harness 7, routes timer 1; the Vite mutant fails the file at
      load; the first socket-file mutant was a syntax error, rewritten valid); server 81/1,456
      with the guard; client 86/760; tsc clean; esbuild bundle; header probe vs the running dev
      server: 0 of 17 pipeline headers differ on 5 API requests; timing 3.5 s file, 316–334 ms.
- [x] live updates (SSE): test `live-updates-compression.test.ts` red on `05195728` 2 of 3
      (`content-encoding: br`; a throwaway copy without that check: "no event … within 1000 ms"),
      guard green; fix in `server/app.ts` (compression filter skips `text/event-stream`);
      `openEventStream` no longer decompresses (that code was exercised by nothing); mutations
      3/3; real Chromium 125, the same probe on `05195728` and the fix: before nothing in 3 s
      (`br`), after the connected event at once. Checked for the idle client paths: the event
      DTOs match what each cache holds (owner DTO ⊇ public DTO; `/api/transactions/:id` and the
      active-transaction route return the public DTO the customer stream sends).
- [x] fix committed `3fac8ac8` (05:26): server 82/1,459 with the guard, tsc clean;
      `scripts/verify-live-updates-browser.ts` exits 1 on `05195728`, 0 on the fix.
- [x] evidence: `R1-T1-harness-audit-2026-09-25.md`, `R1-live-updates-compression-2026-09-25.md`;
      ledger (entries, Next, R1-T1 row, owed reviews); committed with these notes.
