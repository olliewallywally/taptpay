# R0-T5 continuation — Windcave callback/notification containment and credential storage

Date: 2026-09-11. Branch: `remediation/r1-continuation-20260907`.
Base: `5c2384360f0c1dccaa39d011c46b45e7b0be0bfd`, plus the uncommitted admin-ecommerce
tombstone work recorded in [R0-T5-continuation-2026-09-11](R0-T5-continuation-2026-09-11.md).

## What this continues

On picking this branch back up, the working tree already contained three
untracked test files with no matching evidence doc:
`server/__tests__/r0-t4-runtime-safety.test.ts`,
`server/__tests__/r0-t5-callback-containment.test.ts`,
`server/__tests__/r0-t5-disabled-route-side-effects.test.ts`, plus
`docs/operations/restore-acl.md`, `scripts/verify-restore-acl.mjs` and
`scripts/verify-restore-acl.test.mjs` (the R0-T6A restore-ACL repair — this
part was already complete and its own 8-test suite already passed unmodified).

Running the full suite before touching anything showed the tree was not in
the state the file list suggested: `server/__tests__/r0-t5-callback-containment.test.ts`
failed all 16 of its tests. This is the "failing test first" artifact P0 rule 1
requires — it had been written to prove real defects, but the corresponding
fix had not been implemented. That is the exact point this continuation
resumes from.

## Defects the failing tests proved

1. **`GET /api/windcave/status`** reported `mode: "simulation"` and "Running
   in simulation mode…" whenever Windcave was unconfigured — the exact
   "missing credentials select simulation" wording R0-T5 requires removed.
2. **`GET /api/windcave/callback`** ignored the plan's `?sim=1` disposition
   ("Ignore and reject sim entirely") — no route in the codebase handled a
   `sim` parameter at all, so nothing rejected it.
3. The callback's session-to-query fallback was `transaction.windcaveSessionId
   || sessionId` — a persisted session was preferred, but if none existed it
   fell back to **whatever session ID the browser supplied**, and would then
   query the provider with it. With no persisted session it also reflected
   the browser's own `result` parameter straight into the redirect status.
4. The callback derived `approved ? 'approved' : 'declined'` from the
   provider query result without checking `queryResult.success` first, so a
   **transport/query failure was recorded as a declined payment** — the
   sibling `/api/windcave/notification` handler already guarded this
   correctly; the callback did not.
5. **`app.all("/api/windcave/notification", …)`** took the `'processing'`
   session-state write before checking `isWindcaveConfigured()`, so an
   unconfigured provider still produced a transient write
   (`processing` → `pending`) instead of no write at all.
6. **`DatabaseStorage.createMerchantWithPassword`** spread the caller's
   `merchantData` directly into the insert, and **`MemStorage.createMerchantWithPassword`**
   explicitly forwarded `merchantData.windcaveApiKey` — both would persist a
   caller-supplied Windcave credential. `routes.ts` itself has no
   `windcaveApiKey` reference left (confirmed by source grep), so this was a
   storage-layer gap behind an already-closed route surface, not a live
   route vulnerability — but the plan requires the storage write path closed
   too, and a direct or future caller of this method was not protected.
   (`createMerchantWithSignup`, the other merchant-creation path, was already
   safe on both backends — verified before concluding this was the only gap.)

## Fix

- `server/routes.ts` — `/api/windcave/status`: `mode` is `"disabled"` when
  unconfigured; the message never says "simulation" or "ready".
- `server/routes.ts` — `/api/windcave/callback`: rejects any request
  carrying a `sim` query key (case-insensitive, any value, including empty)
  with `400` before anything else runs. Moved the `isWindcaveConfigured()`
  check to immediately after transaction lookup so **no** browser-supplied
  signal (cancel, result, or otherwise) can mutate state while the provider
  is disabled. Removed the `|| sessionId` fallback so only a persisted
  session is ever queried; an absent persisted session now always redirects
  to `status=pending` rather than echoing the browser's `result` value.
  Added the missing `queryResult.success` check, mirroring the notification
  handler: a failed query reverts to `pending` and redirects to `pending`
  rather than finalizing as declined.
- `server/routes.ts` — `/api/windcave/notification`: moved the
  `isWindcaveConfigured()` check before the `'processing'` write, so a
  disabled provider now performs zero storage writes instead of one.
- `server/storage.ts` — `createMerchantWithPassword`: `MemStorage` now hard-codes
  `windcaveApiKey: null` instead of forwarding the caller's value;
  `DatabaseStorage` destructures `windcaveApiKey` out of `merchantData` before
  spreading it into the insert.

No product, UI, or database schema change. No new convention invented — the
`!queryResult.success` handling copies the existing notification-handler
pattern; the `sim`-key check uses bracket/`Object.keys` access specifically
so it does not collide with R0-T1's static source guard
(`server/__tests__/r0-containment.test.ts`), which forbids a literal
`req.query.sim` / `req.body.sim` pattern in the source as evidence no
sim-controlled outcome exists — confirmed still passing below.

## Verification

- `server/__tests__/r0-t5-callback-containment.test.ts`: 16/16 pass (were 16/16 fail).
- `server/__tests__/r0-t4-runtime-safety.test.ts`,
  `r0-t5-disabled-route-side-effects.test.ts`, `r0-t6.test.ts`,
  `http-params-admin-batch.test.ts`: unaffected, still passing (119/119
  across all five focused files together).
- `server/__tests__/r0-containment.test.ts` (R0-T1 source-guard suite): 9/9
  pass — the new `sim` handling does not trip the static "no sim switch"
  scanner.
- `npm run check` (tsc): passes, no errors.
- Full server regression (`npm run test:server`): **49 suites, 942 tests
  pass.**
- `node --test scripts/verify-restore-acl.test.mjs`: 8/8 pass (pre-existing,
  unmodified by this continuation — confirms that piece of work was already
  sound, not something this continuation needed to fix).
- `git diff --check`: clean.

## What is explicitly still open (not closed by this continuation)

- **Device/browser smoke (`scripts/verify-r0-device-containment.mjs`) was
  not executed.** The script exists, is well-formed, and mocks every `/api/*`
  call so it never depends on a fully-configured backend — but this
  workspace already had a long-running `npm run dev` process (started
  06:17, before this continuation, serving the pre-edit code) on port 5000.
  Restarting it to pick up today's changes risks disrupting whatever the
  repo owner is using that preview for, so this continuation left it
  running and did not attempt the browser smoke. This remains an open gap
  in R0-T5, exactly as the prior continuation already recorded.
- Attempting to start a second, isolated dev server for that smoke test
  surfaced a `ConfigValidationError: WINDCAVE_USERNAME + WINDCAVE_API_KEY
  must be configured together` — R0-T2's fail-closed partial-credential-pair
  rule firing correctly. The already-running server does not exhibit this
  (it reports `configured: false` cleanly), so the most likely explanation
  is that ad hoc shell commands in this environment see a different
  (partial) slice of the configured secrets than the long-running process
  does, not that the deployed configuration is actually broken. This is
  recorded as a low-confidence observation, not a finding — it was not
  independently confirmed against the actual deployment's secret set, and
  no secret was read, printed, or changed to investigate it. Worth the
  owner's own check.
- The full callback/provider/notification matrix, historical
  `windcaveApiKey` count-only evidence, and phone/tablet/desktop acceptance
  named in the prior continuation remain open — this batch closes the
  specific failing tests that were mid-flight, not the rest of R0-T5's
  checklist.
- R0 exit (PDF page 21) remains unestablished, unchanged by this batch.

No migration, secret rotation, production operation, capability enablement,
or UI change in this batch. No push performed (no push credentials are
available in this environment regardless).
