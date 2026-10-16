# TaptPay WooCommerce integration — unsupported

This integration is unavailable. Do not install it for checkout, refunds or
payment confirmation. The retained plugin gateway always reports unavailable,
refuses payment/refund initiation and returns503 for its historical webhook route.
It makes no provider/API requests and changes no orders, stock, carts or saved
settings. Historical options and order metadata are retained.

FEATURE_ECOMMERCE_API must remain false. API-key issuing, webhooks, merchant scope,
idempotency and provider reconciliation need a separately approved API design and
end-to-end WordPress/WooCommerce UAT. Existing keys/screens/historical installation
instructions do not establish a functioning integration. No PCI, NFC/wallet,
settlement, availability or pricing certification is made here.

See repository remediation plan15.5 and docs/operations/r8-truthfulness-and-release-gates.md.
