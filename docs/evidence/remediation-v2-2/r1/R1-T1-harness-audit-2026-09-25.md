# R1-T1 — the server test harness, audited (2026-09-25)

Date: 2026-09-25 UTC. Branch: `remediation/r1-continuation-20260907`, local only. Commit:
`05195728`. Plan: R1-T1 / C09 (source plan R1.A, "No-live-system HTTP test harness";
v2.2 §8.2). The harness was built on 2026-09-06 (`b5251fdd`,
[evidence](R1-H1-and-T1-2026-09-06.md)). Its audit ("all transport, clock, SSE and push
injection, and a no-network proof") was never done. No owner decision was needed.

## In plain words

The server's automated tests are meant to run the real app with nothing real behind it: no
internet, no database, no payment provider. That was assumed, not checked. The app the tests ran
was also a hand-made copy of the real one, missing its security settings.

- **A server test that reaches off this computer now fails**, even if the code it runs swallowed
  the error. Switching this on caught two existing tests that imitated "the database does not
  answer" by dialling a reserved internet address. They now use a silent server on this machine.
- **The tests now run the app production runs**, built by the same code. That means the same
  security headers, compression, no-caching for payment pages, and the request log. A test can now
  check what production sends and logs.
- **Found on the way: live updates never reach a browser.** They are compressed and held back,
  and have been since 2026-04-07. Screens poll instead, so nothing looked broken. See
  [the live-updates evidence](R1-live-updates-compression-2026-09-25.md).

## The requirement, item by item

| Plan asks (source plan R1-T1, v2.2 §8.2) | Before | Now | Proof |
|---|---|---|---|
| Build the app without listening | true, never checked | checked: `httpServer.listening` is false | `r1-t1-harness.test.ts` |
| … without Vite, migrations or seeding | true, never checked | checked: each module is replaced by one that throws if loaded, then the app is built | same test |
| … without cron startup or backups | no scheduler dependency; no backup code in `server/` | checked: building the app leaves no timer that keeps the process alive (`process.getActiveResourcesInfo()`) | same test |
| … without real provider clients | credentials cleared (`clear-ambient-credentials.ts`) | also: every connection off the machine is refused, and the test fails | `no-network-guard.test.ts` |
| No network | claimed in a test's title only | enforced for every server test file | the whole server suite with the guard: 81 files / 1,456 tests pass |
| No database | `DATABASE_URL` deleted by `test-env.ts` | checked: MemStorage, no database client | `r1-t1-harness.test.ts` |
| Mock storage | MemStorage | unchanged | — |
| Mock Windcave transport | global `fetch` (`server/windcave.ts:43`) spied per file, or `jest.mock("../windcave")` | unchanged; an unstubbed call now fails its test | guard |
| Mock the clock | Jest fake timers faking `Date` only, set up inline (`auth-throttle.test.ts`) | `useFakeClock()`: a token stops working after an hour | `r1-t1-harness.test.ts` |
| Mock push | `jest.mock("web-push")`; APNs (`http2`) has no seam, its credentials are cleared | unchanged; an APNs connection now fails its test (it is TCP) | guard |
| Mock SSE | two files each carried their own raw-socket reader | `openEventStream()` reads a stream one event at a time, as EventSource does | `r1-t1-harness.test.ts` |
| Mock outbound HTTP | per-file `jest.spyOn(global, "fetch")` (Google, Windcave, SMS, WhatsApp) | unchanged; anything unstubbed fails its test | guard |
| Mock configuration | environment set before `config.ts` loads (`test-env.ts`, per-file env modules) | unchanged | — |
| Principals: merchant A owner and member, merchant B owner, disabled user, validated admin, cron caller | exercised since 2026-09-06 | unchanged | `http-harness.test.ts` |
| Public payment bearer | minted, never used by a test | a link resolves by its token and only by it | `r1-t1-harness.test.ts` |
| Provider notification | no fixture (driven by hand in `r0-t5-callback-containment.test.ts`) | `providerNotification()`; with payments off it acknowledges and changes nothing | `r1-t1-harness.test.ts` |
| Ecommerce API key, off by default | 404 before the key is looked at | unchanged | `http-harness.test.ts` |
| Under 5 seconds | about 2.8 s (2026-09-06) | the harness file (9 tests) runs in 3.5 s from a cold Jest start, twice; building the app plus one authenticated request as merchant A takes 316–334 ms | — |

## What was wrong, and what changed

1. **"No network" was a title, not a check.** The harness's first test is called "no network, no
   database, no cron, no Vite" and asserted only a 200. Worse, the usual symptom of an outside call
   is invisible: with the connection refused, `fetch` rejects with a plain "fetch failed", and a
   route turns that into a 502 that a test may accept.
   - `support/no-network.ts` (a `setupFiles` entry) refuses and records every TCP connection,
     name lookup and UDP send that is not for this machine. TCP covers `fetch`, `http`, `https`,
     `http2`, TLS, SMTP and WebSocket clients. Socket files are refused too, so a local database
     is refused as well.
   - `support/no-network-after-env.ts` fails the test after it runs, naming the target and the
     call site.
   - It is installed once per Jest worker: `node:net` is shared by every test file in a worker (a
     mark set in one file is seen by the next), so the record lives there.
   - It caught two existing tests. `migrate.test.ts` ("never throws when the database is
     unreachable") and `migration-runner-hardening.test.ts` ("production-style startup checks fail
     closed…") dialled `192.0.2.1:5432`, a reserved address that never answers, but still a
     connection off the machine. They now use `support/silent-database.ts`, a server on this
     machine that accepts and never answers: the same connect-timeout path.
2. **The harness app was not production's app.** `createTestApp` copied one piece of
   `server/index.ts` by hand, the JSON exception for the Windcave notification, and left out:
   - helmet (so tests saw `X-Powered-By: Express`);
   - compression;
   - `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer` on the pages addressed
     by a payment token;
   - the request log, whose redaction keeps tokens out of log lines.

   **`server/app.ts` now builds that pipeline and both use it.** The block moved out of
   `index.ts` unchanged: diffed, it is identical except that the log writer is passed in, so
   `app.ts` never loads Vite. The harness keeps each log line in `requestLog`.
3. **Principals and seams**: `providerNotification()`, `useFakeClock()` and `openEventStream()`
   were added, and the public payment bearer fixture is now exercised (table above).

What the harness still leaves out, on purpose, is what `server/index.ts` adds at startup: the
database check, the migration gate, schema push, seeding, `syncVerifiedMerchants`, the crawler
page, Vite or static files, listening and the database keep-alive.

## Proof

**Tests first**, on `03c4663b` (the commit before this work), in a separate worktree:

- `no-network-guard.test.ts` (9 tests) cannot load: the guard did not exist.
- `r1-t1-harness.test.ts` (15): 12 fail, each for its reason:
  - the harness answered with `X-Powered-By: Express`;
  - it sent no `Content-Encoding` for a large response;
  - it sent no `Cache-Control` on any of the six bearer pages;
  - it kept no request log;
  - it had no `providerNotification`, `useFakeClock` or `openEventStream`.

  The other 3 pass on both sides. They pin what was already true: nothing is loaded or left
  running, the store is MemStorage, and a payment link resolves by its bearer.
- The two dialling tests, old code with the guard armed: both fail, naming `192.0.2.1:5432`.

**End to end.** A child Jest run with the server config runs
`fixtures/network-call-swallowed.fixture.ts`, a test that reaches off the machine and swallows
the error. That test is reported **failed**, naming `example.com:443`.

**Mutations**: 30 of 30 caught. Each piece was undone in turn, a test had to fail, and every
file was restored byte-identical.

- Guard, 10 of 10:
  - connect left unguarded;
  - every host counted as this machine;
  - `localhost` not recognised;
  - refusals not recorded;
  - socket files allowed;
  - http's `path: null` read as a socket file;
  - name lookups unguarded;
  - UDP unguarded;
  - a swallowed refusal passing;
  - the record never cleared.
- Wiring, 3 of 3: the guard missing from `setupFiles`; no `setupFilesAfterEnv`; the after-each
  hook not checking.
- `server/app.ts`, 9 of 9:
  - `X-Powered-By` shown;
  - no `nosniff`;
  - another referrer policy;
  - no compression;
  - small responses compressed;
  - each of the three bearer-page rules removed;
  - no request log.
- Harness, 7 of 7:
  - it builds its own app again;
  - the request log is never emptied;
  - the notification without `sessionid`;
  - a clock that never moves;
  - events split wrongly;
  - it loads the seeding module;
  - it loads the migration runner.
- Routes, 1 of 1: the rate-limit cleanup timer keeping the process alive.

Loading Vite from the harness is caught too, but earlier: `server/vite.ts` cannot load in the test
runtime, so the whole file fails before the isolation test runs. The first "socket files allowed"
mutant left a dangling `else`; it was rewritten as a valid one.

**Suites at `05195728`:**

- `tsc`: clean.
- Server: 81 files / 1,456 tests, with the guard armed. Before: 79 / 1,432, so +2 files and
  +24 tests.
- Client: 86 / 760, unchanged.

**Production unchanged.**

- The moved block, diffed against `index.ts` at `03c4663b`, is identical except for the log
  writer.
- The server bundles for production (`esbuild`, as `npm run build` runs it).
- The running dev server still had the old code loaded. It was compared with the new
  `createApp()` plus the real routes (clean environment), on the same requests:
  - the requests: `/api/auth/me` with and without `Accept-Encoding`, `/api/pay/t/…`,
    `/api/push/capabilities`, and the 9 KB Apple Pay file;
  - the result: all 17 pipeline headers identical (helmet's, `Cache-Control`, `Pragma`, `Vary`,
    `Content-Encoding`);
  - the two page paths differed only after the pipeline: Vite serves those pages on the dev
    server (adding `Vary: Origin`), and Express's 404 answers them in the probe (adding
    `default-src 'none'`).

The harness's first test is titled "no network, no database, no cron, no Vite". That is now true,
and enforced.

## Limits

- Child processes and worker threads are outside the guard. Two server tests start child
  processes, neither needing the network: the admin password tool
  (`admin-password-tool.test.ts`) and `git ls-files` (`r0-t6.test.ts`). The guard's own
  end-to-end check runs Jest in a child, which loads the guard itself.
- The guard covers Node's `net`, `dns` and `dgram`. A native addon opening its own sockets would
  bypass it; the server has none.
- The route inventory reads `server/routes.ts` only, so the `app.use` pipeline (now in
  `server/app.ts`, before that in `index.ts`) is in no inventory. That is R1-T2's "every
  `app.use`", not this task.

## Warnings seen in today's runs (v2.2 §8.1: "record all warnings")

- `ts-jest`: the `isolatedModules` option is deprecated (both projects' configs).
- `baseline-browser-mapping`: its data is over two months old (client runs).
- MemStorage prints "All merchants and transactions cleared from memory" on every reset, and each
  server file prints its storage and simulated-email notices.

None is a test failure, open handle or React warning.

## Handoff (plan §21.2)

```text
Phase / release:         R1-T1 (C09) harness audit; not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ 05195728 (local)
Scope completed:         a no-network guard for every server test; one app pipeline
                         (server/app.ts) for the server and its tests; the harness's missing
                         principal and seams
Files changed:           server/app.ts (new), server/index.ts, jest.server.config.cjs; under
                         server/__tests__/: support/no-network.ts, no-network-after-env.ts,
                         silent-database.ts, http-harness.ts; no-network-guard.test.ts,
                         r1-t1-harness.test.ts, migrate.test.ts,
                         migration-runner-hardening.test.ts; fixtures/ (one file)
Migrations:              none
Preflight queries:       none
Commands run and results: tsc clean; server 81 / 1,456 with the guard armed; client 86 / 760;
                         red first 21 of 24, plus the two dialling tests; mutations 30/30;
                         server bundle builds; 0 pipeline-header differences from the running
                         dev server
Negative/no-side-effect: the guard fails any test that reaches off the machine; with payments
                         off, a provider notification changes nothing
Provider/UAT activity:   none
Device/browser evidence: none needed (no client change); see the live-updates evidence
Security/privacy review: tests now see production's headers and request log; the guard also
                         refuses local socket files, so no test reaches a database
External actions:        none
Feature flags and payment mode after deploy: unchanged
In-flight operations:    none
Known warnings or deferred items: "Limits" and "Warnings" above
Rollback commit and constraints: revert 05195728; nothing stored changes
Approvals:               no owner decision needed; plan §21.1 review owed
Stop conditions checked: no money initiation enabled; no migration; nothing pushed
Next phase prerequisites: this review
```

## Independent review — brief

**Range:** `03c4663b..05195728` (one commit), local only.

> You are the independent correctness reviewer for TaptPay, a payment-terminal SaaS. Review
> commit `05195728` (range `03c4663b..05195728`) on branch
> `remediation/r1-continuation-20260907`: the audit of plan task R1-T1, the no-live-system HTTP
> test harness (source plan R1-T1; v2.2 §8.2 in
> `docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`). Start from
> `docs/evidence/remediation-v2-2/r1/R1-T1-harness-audit-2026-09-25.md`; treat it as claims and
> re-derive everything from the code. Attack especially:
> - Can a server test still reach off the machine without failing? Consider a path that avoids
>   `net.Socket.prototype.connect` (a native addon, `worker_threads`, `child_process`, an undici
>   `Agent` with its own connector, `http2`); a name-resolution path the guard misses; IPv6 or
>   IPv4-mapped forms in `isLoopback`; a refusal that happens after the test's own check.
> - Can the guard break a legitimate loopback path (supertest, the event-stream readers,
>   `127.0.0.1`, `::1`, `localhost`), or record a refusal that is not one?
> - Is `server/app.ts` exactly the pipeline `server/index.ts` had, in the same order and with the
>   same options (diff it against `03c4663b`)? Does anything `index.ts` still adds at startup
>   differ from the harness in a way a test would need?
> - Do the two rewritten tests (`migrate.test.ts`, `migration-runner-hardening.test.ts`) still
>   prove "database unreachable" through a connect timeout, or do they now pass for another
>   reason?
> - Can any new test pass vacuously: the isolation test's module mocks, the active-timer count,
>   the child Jest run?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1 and end with Approve / Do not
> approve naming the commit range.

Reproduce: `npm run check`; `npx jest --selectProjects server --runInBand`;
`npx jest --selectProjects client`.
