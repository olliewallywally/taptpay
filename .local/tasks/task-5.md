---
title: Apple Pay domain verification & Google Pay MID
---
# Apple Pay Domain Verification & Google Pay MID

## What & Why
Windcave requires two things before Apple Pay goes live:
1. The Apple Pay domain association file must be hosted at `/.well-known/apple-developer-merchantid-domain-association` (no redirect allowed — must be served directly at that exact path).
2. The Google Pay MID `c765be1e082b1c5b01ef55608fdd550c0290d779` must be stored and used by the app.

The domain association file has already been provided by Windcave and is in `attached_assets/apple-developer-merchantid-domain-association_1773802227849`. It contains hex-encoded binary content that must be served as-is (do NOT base64-decode or re-encode it — serve the raw file bytes exactly as the file exists on disk).

## Done looks like
- `GET /.well-known/apple-developer-merchantid-domain-association` returns the file with a 200, `Content-Type: application/json`, and no redirects.
- The Google Pay MID environment variable `WINDCAVE_GOOGLE_PAY_MERCHANT_ID` is set to `c765be1e082b1c5b01ef55608fdd550c0290d779`.
- The existing checkout page Google Pay flow reads the updated MID correctly.

## Out of scope
- The Apple Pay MID itself (Windcave will provide it after verifying the domain).
- Any Apple Pay UI changes (those come after the MID is provided).

## Tasks
1. **Copy and serve the domain association file** — Copy `attached_assets/apple-developer-merchantid-domain-association_1773802227849` to `client/public/.well-known/apple-developer-merchantid-domain-association`. Add an explicit Express GET route in `server/routes.ts` (before any catch-all handlers) that serves this file with `Content-Type: application/json` and no redirect, so it works in both dev and production environments.

2. **Set Google Pay MID environment variable** — Use the environment-secrets skill to set `WINDCAVE_GOOGLE_PAY_MERCHANT_ID=c765be1e082b1c5b01ef55608fdd550c0290d779`. Verify the existing code in `server/routes.ts` reads it from `process.env.WINDCAVE_GOOGLE_PAY_MERCHANT_ID` and no hardcoded fallback overrides it.

3. **Verify the endpoint** — After the server restarts, use curl to confirm `GET /.well-known/apple-developer-merchantid-domain-association` returns HTTP 200 with the correct file content and no redirect.

## Relevant files
- `attached_assets/apple-developer-merchantid-domain-association_1773802227849`
- `client/public/.well-known/` (does not exist yet — needs creating)
- `server/routes.ts:1425-1426`
- `server/index.ts`