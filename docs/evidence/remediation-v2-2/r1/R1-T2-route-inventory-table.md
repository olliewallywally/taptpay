# R1-T2 route inventory — generated 2026-09-06 @ `318fa4afad2c3c9bbcae50df752fe10ef50084c7`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **218** (91 GET, 88 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

Unclassified (no known gate marker detected near the handler — needs a human
read, not necessarily a bug): **97**.

| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 361 | unclassified | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 380 | unclassified | — |
| GET | `/nfc/:merchantId` | 390 | unclassified | — |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 399 | unclassified | — |
| GET | `/sitemap.xml` | 414 | merchant-user | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin' |
| GET | `/api/auth/google` | 468 | unclassified | — |
| GET | `/api/auth/google/callback` | 485 | unclassified | — |
| POST | `/api/auth/login` | 600 | unclassified | — |
| POST | `/api/auth/forgot-password` | 676 | unclassified | — |
| POST | `/api/auth/reset-password` | 696 | unclassified | — |
| GET | `/api/auth/validate-reset-token/:token` | 717 | unclassified | — |
| POST | `/api/admin/auth/login` | 733 | unclassified | — |
| GET | `/api/auth/me` | 837 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 878 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 908 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 945 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 966 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1046 | unclassified | — |
| GET | `/api/merchants/:id/qr` | 1058 | unclassified | — |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1101 | unclassified | — |
| GET | `/api/merchants/:id` | 1146 | unclassified | — |
| GET | `/api/merchants/:id/profile` | 1174 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1200 | unclassified | — |
| GET | `/api/pay/t/:token/qr` | 1227 | unclassified | — |
| POST | `/api/pay/t/:token/split` | 1254 | unclassified | — |
| GET | `/api/pay/t/:token/receipt` | 1351 | unclassified | — |
| POST | `/api/pay/t/:token/receipt-pdf` | 1364 | unclassified | — |
| GET | `/api/pay/t/:token/receipt-qr` | 1394 | unclassified | — |
| POST | `/api/pay/t/:token/session` | 1469 | unclassified | — |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1769 | unclassified | — |
| POST | `/api/pay/t/:token/googlepay-complete` | 1821 | unclassified | — |
| GET | `/api/pay/return/:state` | 1952 | unclassified | — |
| ALL | `/api/pay/notification/:state` | 1986 | unclassified | — |
| GET | `/api/merchants/:id/active-transaction` | 2003 | unclassified | — |
| POST | `/api/transactions` | 2077 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2153 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2213 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2355 | unclassified | — |
| PATCH | `/api/transactions/:id/split-enabled` | 2402 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2446 | unclassified | — |
| POST | `/api/transactions/:id/cancel` | 2464 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2520 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2603 | unclassified | — |
| POST | `/api/transactions/:id/pay` | 2631 | unclassified | — |
| GET | `/api/windcave/env` | 2885 | unclassified | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 2899 | unclassified | — |
| POST | `/api/transactions/:id/googlepay-complete` | 2933 | unclassified | — |
| GET | `/api/transactions/:id` | 3002 | unclassified | — |
| POST | `/api/transactions/:id/receipt-pdf` | 3022 | unclassified | — |
| GET | `/api/transactions/:id/receipt-qr` | 3077 | unclassified | — |
| GET | `/api/merchants/:id/analytics` | 3117 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3131 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3147 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3167 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3232 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3271 | unclassified | — |
| POST | `/api/admin/merchants/:id/set-active` | 3315 | unclassified | — |
| GET | `/api/admin/merchants/:id/transactions` | 3332 | unclassified | — |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3345 | unclassified | — |
| POST | `/api/admin/merchants/:id/activate` | 3361 | unclassified | — |
| PUT | `/api/merchants/:id/rates` | 3406 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3413 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3438 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/bank-account` | 3484 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3488 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3513 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id` | 3544 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3599 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:id/logo` | 3642 | merchant-user | authenticateToken |
| GET | `/api/merchants/:id/transactions` | 3675 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 3691 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 3706 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3756 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3789 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 3821 | unclassified | — |
| GET | `/api/admin/subscription-revenue` | 3838 | unclassified | — |
| ALL | `/api/windcave/notification` | 3849 | unclassified | — |
| GET | `/api/windcave/callback` | 3957 | unclassified | — |
| GET | `/api/windcave/status` | 4119 | unclassified | — |
| GET | `/api/admin/analytics` | 4132 | unclassified | — |
| GET | `/api/admin/revenue-over-time` | 4205 | unclassified | — |
| GET | `/api/admin/payment-method-breakdown` | 4241 | unclassified | — |
| GET | `/api/admin/ga4-detailed` | 4278 | unclassified | — |
| GET | `/api/admin/ga4-metrics` | 4343 | unclassified | — |
| POST | `/api/admin/merchants` | 4420 | unclassified | — |
| PUT | `/api/admin/merchants/:id` | 4431 | unclassified | — |
| POST | `/api/merchants/:id/test-payment-link` | 4456 | unclassified | — |
| GET | `/api/admin/merchants` | 4496 | unclassified | — |
| GET | `/api/admin/merchants/:id` | 4506 | unclassified | — |
| DELETE | `/api/admin/merchants/:id` | 4521 | unclassified | — |
| POST | `/api/admin/clear-merchants` | 4544 | unclassified | — |
| POST | `/api/admin/resend-verification` | 4575 | unclassified | — |
| POST | `/api/admin/test-email` | 4633 | unclassified | — |
| GET | `/api/admin/email-status` | 4656 | unclassified | — |
| POST | `/api/merchants/verify` | 4683 | unclassified | — |
| GET | `/api/merchants/:id/email-status` | 4729 | unclassified | — |
| GET | `/api/auth/confirm-email` | 4747 | unclassified | — |
| POST | `/api/auth/resend-confirmation` | 4844 | unclassified | — |
| POST | `/api/info-pack-leads` | 4878 | unclassified | — |
| POST | `/api/merchants/signup` | 4920 | unclassified | — |
| PUT | `/api/merchants/:id/business-details` | 5022 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5087 | unclassified | — |
| GET | `/api/merchants/:id/events` | 5159 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5232 | unclassified | — |
| GET | `/api/push/vapid-key` | 5256 | unclassified | — |
| POST | `/api/push/subscribe` | 5266 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5302 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5329 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5362 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5383 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5407 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5421 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5447 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5467 | merchant-user | authenticateToken |
| GET | `/api/transactions/:transactionId/refunds` | 5597 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 5626 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 5646 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 5678 | unclassified | — |
| POST | `/api/admin/api-keys` | 5716 | unclassified | — |
| POST | `/api/admin/api-keys/:keyId/revoke` | 5738 | unclassified | — |
| GET | `/api/admin/api-metrics` | 5750 | unclassified | — |
| GET | `/api/admin/api-usage` | 5761 | unclassified | — |
| GET | `/api/merchants/:merchantId/stock-items` | 5776 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 5794 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 5821 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 5856 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 5922 | api-key | authenticateApiKey, requireEcommerceApi |
| GET | `/api/v1/transactions/:id` | 6034 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6107 | unclassified | — |
| POST | `/api/payments/apple-pay/process` | 6150 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6217 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6284 | unclassified | — |
| GET | `/api/subscription` | 6319 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6342 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6405 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6448 | merchant-user | authenticateToken |
| GET | `/api/team` | 6479 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6500 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6561 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6642 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6661 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6701 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6732 | unclassified | — |
| GET | `/api/subscription/billing-history` | 6765 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 6795 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 6824 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 6870 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 6961 | unclassified | — |
| GET | `/api/billing/card/callback` | 6971 | unclassified | — |
| POST | `/api/billing/card/callback` | 6972 | unclassified | — |
| DELETE | `/api/billing/card` | 6975 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 6995 | unclassified | — |
| GET | `/uploads/:folder/:name` | 7023 | unclassified | — |
| GET | `/api/property/tenants` | 7216 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7227 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7241 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7252 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7268 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7281 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7294 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7309 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7317 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7328 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7346 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7365 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7380 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7410 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7427 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7467 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7482 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7493 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7507 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7527 | unclassified | — |
| POST | `/api/checkout/:token/split` | 7595 | unclassified | — |
| POST | `/api/checkout/pay` | 7611 | unclassified | — |
| POST | `/api/checkout/:token/session` | 7673 | unclassified | — |
| POST | `/api/checkout/:token/hosted-fields-complete` | 7746 | unclassified | — |
| POST | `/api/checkout/:token/googlepay-complete` | 7777 | unclassified | — |
| GET | `/api/checkout/callback` | 7830 | unclassified | — |
| ALL | `/api/windcave/rent-notification` | 7857 | unclassified | — |
| ALL | `/api/windcave/trades-notification` | 7874 | unclassified | — |
| POST | `/api/webhooks/whatsapp` | 7894 | unclassified | — |
| PUT | `/api/merchants/:merchantId/sector` | 7931 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 7955 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 7965 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 7982 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 7992 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8005 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8021 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8038 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8046 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8056 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8065 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8076 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8085 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8095 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8105 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8115 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8122 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8178 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8205 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8218 | unclassified | — |
| POST | `/api/trades/quotes/:id/resend` | 8229 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8245 | unclassified | — |
| POST | `/api/trades/quotes/token/:token/respond` | 8290 | unclassified | — |
| GET | `/api/trades/invoices` | 8333 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8343 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8392 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8405 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8442 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8459 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8476 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8486 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8493 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8511 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8524 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 8538 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8548 | cron | authorizeCronRequest |
