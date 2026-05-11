# Set Apple Pay UAT Merchant ID

## What & Why
Windcave has provisioned the Apple Pay Merchant ID for the UAT environment. It must be stored as an environment secret so the checkout page passes it correctly to the Windcave Apple Pay SDK when initialising the Apple Pay session.

## Done looks like
- The `WINDCAVE_APPLE_PAY_MERCHANT_ID` secret is set to the value provided by Windcave.
- The `/api/windcave/env` endpoint returns a non-empty `applePayMerchantId` field.
- The Apple Pay button on the checkout page initialises with the correct merchant ID (visible in the Windcave UAT dashboard when a test Apple Pay payment is attempted).

## Out of scope
- Any code changes — this is a secrets/config-only change.
- Production Apple Pay MID (not yet provided).

## Tasks
1. **Set the secret** — Store the Windcave-provided Apple Pay MID as the `WINDCAVE_APPLE_PAY_MERCHANT_ID` environment secret.
   Value: `mid_d8955aef0c32775c494bc48fe2f218a628a1de71339a3e35c1c0c503776b8082b5c5b7ed0128472bbdc5c2addb6db94a`

## Relevant files
- `server/routes.ts:1716-1722`
