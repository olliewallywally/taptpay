# R1-T2 gap 12 — rate-limit the unauthenticated legacy-no-board SSE branch

Date: 2026-09-13. Branch: `remediation/r1-continuation-20260907`. Base commit
`e59ac4a9`.

## Scope of this change

This closes only the "immediate, low-risk option" named in
[R1-T2-classifier-extension-2026-09-12.md](R1-T2-classifier-extension-2026-09-12.md)
and item 12 of `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md`:
add the existing `checkRateLimit(clientIp)` call and its existing `429` JSON
response to the `legacy-no-board` branch of `GET /api/merchants/:id/events`
(`server/routes.ts`, was line 5337, now 5334-5344), exactly mirroring how `GET
/api/merchants/:id/active-transaction` (routes.ts ~2008-2027) already
rate-limits its identical no-stoneId access mode.

The **full fix is explicitly out of scope and not attempted here.** The
deeper gap — the anonymous no-board customer flow having no per-transaction
identifier to scope the stream to more narrowly than "this merchant" — needs
a product/design decision (mint a per-transaction token for stoneless sales,
or fold this flow into the existing token-addressed path) that belongs with
R1-T3/R1-T7's tenant-scoping work, per the prior evidence file's own
recommendation. This change does not touch that. It also does not change the
`merchant` (Authorization header) or `board` (`?stoneId=`) branches, and does
not change what data the stream sends once open — `sseBroker`'s `isTarget`/
`projectEvent` scoping is untouched.

No schema migration involved or considered. No `FEATURE_*`/`PAYMENT_MODE`
flag touched. No Windcave transport, session-binding, split-payment
finalization, encryption, or bank-field code touched.

## Failing test first

New file `server/__tests__/r1-t2-gap12-events-ratelimit.test.ts`, built on
the R1-T1 HTTP harness (`server/__tests__/support/http-harness.ts`), driving
the **real** shared per-IP limiter (`routes.ts`'s module-level `rateLimitMap`/
`checkRateLimit`, `MAX_REQUESTS_PER_WINDOW = 100`) rather than mocking it:

1. Create an owner/merchant fixture.
2. Call `GET /api/merchants/:id/active-transaction` (no stoneId) 100 times
   from the loopback test client, then once more — confirms the shared
   limiter is genuinely exhausted for that IP (`429`,
   `{"message":"Too many requests. Please try again later."}`).
3. From the **same IP**, with no `Authorization` header and no `?stoneId=`,
   open a raw socket to `GET /api/merchants/:id/events` and read whatever
   arrives within a bounded window (a normal HTTP client promise never
   resolves against an open SSE stream — this mirrors the existing
   `collectRaw` pattern in `async-route-guard.test.ts` used for the same
   reason).

**Red result (pre-fix):**

```
Expected substring: "HTTP/1.1 429"
Received string:    "HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: text/event-stream
Cache-Control: private, no-cache, no-store
Connection: keep-alive
X-Accel-Buffering: no
...
Transfer-Encoding: chunked
"
```

An IP the app had already rate-limited on `active-transaction` opened the
`events` SSE stream anyway — the exact gap the recommendation named, proven
against the live route rather than by inspecting source text.

## Fix

`server/routes.ts`, the `else` branch that assigns
`audience = { kind: "legacy-no-board" }` (only that branch):

```ts
} else {
  // SECURITY: this branch has no authentication of any kind (same
  // no-stoneId access mode as GET /api/merchants/:id/active-transaction
  // above), so it must not be exempt from the abuse-rate bound that
  // sibling already enforces.
  const clientIp = req.ip || 'unknown';
  if (!checkRateLimit(clientIp)) {
    console.warn(`SECURITY: Rate limit exceeded for IP ${clientIp} on events endpoint`);
    return res.status(429).json({ message: "Too many requests. Please try again later." });
  }
  audience = { kind: "legacy-no-board" };
}
```

Reuses the existing module-level `checkRateLimit` function and the exact
`429` message/body `active-transaction` already returns — no new rate-limit
implementation, no new storage method, no schema change. The `merchant` and
`board` branches above it are untouched (they already carry their own
authorization/existence checks and were never part of this gap).

## Green result (post-fix)

Same test, same assertions:

```
PASS server server/__tests__/r1-t2-gap12-events-ratelimit.test.ts
  R1-T2 gap 12 — legacy-no-board SSE stream must share the active-transaction rate limit
    ✓ an IP already exhausted on active-transaction can still open the unauthenticated events stream (849 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

The same already-limited IP now receives `429`/
`{"message":"Too many requests. Please try again later."}` from `/events`
too, and the raw response contains no `text/event-stream` content type.

## Full verification

- `npm run check` (tsc): clean, no new errors.
- `npm run test:server` (`jest --selectProjects server --runInBand`):
  **53 suites / 1020 tests pass** — before this change: **52 suites / 1019
  tests** (the 2026-09-12/13 classifier-extension baseline, itself unchanged
  from the prior 52/974+dead-code-removal lineage's post-R0-T5 count). The
  delta is exactly the one new suite and one new test added here; every
  pre-existing test still passes, zero regressions, zero new failures.
- No open-handle warnings from Jest (the raw socket in the new test is
  destroyed with a bounded timeout and the test's own `httpServer` is closed
  in a `finally` block); the harness's own module-level `rateLimitMap` is not
  shared across test files (each Jest test file gets its own module
  registry), so this test cannot leak rate-limit state into any other file.

## Remaining risk — deliberately not addressed here

- **The addressing-scheme gap itself is unchanged.** A merchant with two
  concurrent stoneless transactions (two staff terminals, a duplicate scan)
  still has every `legacy-no-board` subscriber receive every other
  concurrent transaction's item/price/status/split data — rate limiting
  bounds *how many* connections an anonymous caller can hold or how fast they
  can reconnect, it does not scope *what* a connection receives. That
  requires the per-transaction-identifier design decision named above and in
  the prior evidence file; this task was explicitly scoped not to make that
  call.
- **Still no open-connection cap.** `checkRateLimit` bounds new requests per
  minute; it does not bound how many *already-open* long-lived SSE
  connections a single IP can hold concurrently once under the limit (the
  same is true of every other rate-limited route in this codebase — this
  mirrors, not exceeds, `active-transaction`'s existing protection level, per
  the "exactly mirroring" instruction).
- **Not currently a live-funds risk**: no Windcave credentials are
  configured in this environment, and the leak this row bounds is metadata
  (item name/price/status), not payment credentials or card data — unchanged
  from the prior evidence file's assessment; this change narrows the
  exposure window, it does not newly introduce or newly discover risk.

No migration, secret rotation, production operation, capability enablement,
or push in this batch. Only `server/routes.ts` (the one guarded branch) and
the new test file were changed; `git status` before staging showed exactly
these two paths.
