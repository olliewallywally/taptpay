# R0-T3 — VAPID rotation recovery evidence

Date: 2026-09-02 UTC

## Implemented behavior

- On authenticated app load, an existing browser push subscription is compared
  byte-for-byte with the server's current VAPID public key.
- A mismatched subscription is removed locally and replaced automatically. The
  stale endpoint is deactivated on the server on a best-effort basis, and the new
  subscription is persisted before the UI considers notifications enabled.
- A browser with no existing subscription remains opted out; rotation recovery
  never silently grants or requests notification permission.
- Web-push delivery responses with status 404 or 410 deactivate the stale stored
  subscription.
- Recovery errors are not surfaced as merchant toasts or copied into evidence.

## Automated verification

The focused client test covers mismatched-key replacement, preservation of a
matching subscription, and no opt-in when a subscription is absent. The focused
server test covers stale-row pruning for both 404 and 410 responses.

Results:

- Client: 1 suite, 3 tests passed.
- Server: 1 suite, 4 tests passed.
- Full client: 52 suites, 486 tests passed.
- `npm run check`: passed.
- `npm run build`: passed.

## Remaining human acceptance check

Code and automated verification are complete. R0-T3 is not operationally closed
until H2 uses a deliberately changed VAPID pair in a private development/staging
environment and an already-opted-in browser automatically re-subscribes on load,
receives a real test push, and shows no error. Secret generation and rotation must
follow the owner-only H2 procedure; no key value belongs in commands, logs,
screenshots, commits, or this evidence file.
