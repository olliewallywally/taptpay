# R1-T2 route inventory — generated 2026-09-06 @ `f24dbfacab00dde067fe45be36988d67523ebf65`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **218** (91 GET, 88 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

Unclassified (no known gate marker detected near the handler — needs a human
read, not necessarily a bug): **97**.

| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 362 | unclassified | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 381 | unclassified | — |
| GET | `/nfc/:merchantId` | 391 | unclassified | — |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 400 | unclassified | — |
| GET | `/sitemap.xml` | 415 | merchant-user | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin' |
| GET | `/api/auth/google` | 469 | unclassified | — |
| GET | `/api/auth/google/callback` | 486 | unclassified | — |
| POST | `/api/auth/login` | 601 | unclassified | — |
| POST | `/api/auth/forgot-password` | 677 | unclassified | — |
| POST | `/api/auth/reset-password` | 697 | unclassified | — |
| GET | `/api/auth/validate-reset-token/:token` | 718 | unclassified | — |
| POST | `/api/admin/auth/login` | 734 | unclassified | — |
| GET | `/api/auth/me` | 838 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 879 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 909 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 946 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 967 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1048 | unclassified | — |
| GET | `/api/merchants/:id/qr` | 1060 | unclassified | — |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1104 | unclassified | — |
| GET | `/api/merchants/:id` | 1151 | unclassified | — |
| GET | `/api/merchants/:id/profile` | 1180 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1207 | unclassified | — |
| GET | `/api/pay/t/:token/qr` | 1234 | unclassified | — |
| POST | `/api/pay/t/:token/split` | 1261 | unclassified | — |
| GET | `/api/pay/t/:token/receipt` | 1358 | unclassified | — |
| POST | `/api/pay/t/:token/receipt-pdf` | 1371 | unclassified | — |
| GET | `/api/pay/t/:token/receipt-qr` | 1401 | unclassified | — |
| POST | `/api/pay/t/:token/session` | 1476 | unclassified | — |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1776 | unclassified | — |
| POST | `/api/pay/t/:token/googlepay-complete` | 1828 | unclassified | — |
| GET | `/api/pay/return/:state` | 1959 | unclassified | — |
| ALL | `/api/pay/notification/:state` | 1993 | unclassified | — |
| GET | `/api/merchants/:id/active-transaction` | 2010 | unclassified | — |
| POST | `/api/transactions` | 2085 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2161 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2221 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2363 | unclassified | — |
| PATCH | `/api/transactions/:id/split-enabled` | 2410 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2454 | unclassified | — |
| POST | `/api/transactions/:id/cancel` | 2472 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2528 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2612 | unclassified | — |
| POST | `/api/transactions/:id/pay` | 2640 | unclassified | — |
| GET | `/api/windcave/env` | 2894 | unclassified | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 2908 | unclassified | — |
| POST | `/api/transactions/:id/googlepay-complete` | 2942 | unclassified | — |
| GET | `/api/transactions/:id` | 3011 | unclassified | — |
| POST | `/api/transactions/:id/receipt-pdf` | 3031 | unclassified | — |
| GET | `/api/transactions/:id/receipt-qr` | 3086 | unclassified | — |
| GET | `/api/merchants/:id/analytics` | 3126 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3141 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3158 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3179 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3245 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3285 | unclassified | — |
| POST | `/api/admin/merchants/:id/set-active` | 3329 | unclassified | — |
| GET | `/api/admin/merchants/:id/transactions` | 3346 | unclassified | — |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3359 | unclassified | — |
| POST | `/api/admin/merchants/:id/activate` | 3375 | unclassified | — |
| PUT | `/api/merchants/:id/rates` | 3420 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3427 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3453 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/bank-account` | 3500 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3504 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3532 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3565 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3621 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3666 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 3700 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 3717 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 3733 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3784 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3819 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 3853 | unclassified | — |
| GET | `/api/admin/subscription-revenue` | 3870 | unclassified | — |
| ALL | `/api/windcave/notification` | 3881 | unclassified | — |
| GET | `/api/windcave/callback` | 3989 | unclassified | — |
| GET | `/api/windcave/status` | 4151 | unclassified | — |
| GET | `/api/admin/analytics` | 4164 | unclassified | — |
| GET | `/api/admin/revenue-over-time` | 4237 | unclassified | — |
| GET | `/api/admin/payment-method-breakdown` | 4273 | unclassified | — |
| GET | `/api/admin/ga4-detailed` | 4310 | unclassified | — |
| GET | `/api/admin/ga4-metrics` | 4375 | unclassified | — |
| POST | `/api/admin/merchants` | 4452 | unclassified | — |
| PUT | `/api/admin/merchants/:id` | 4463 | unclassified | — |
| POST | `/api/merchants/:id/test-payment-link` | 4488 | unclassified | — |
| GET | `/api/admin/merchants` | 4529 | unclassified | — |
| GET | `/api/admin/merchants/:id` | 4539 | unclassified | — |
| DELETE | `/api/admin/merchants/:id` | 4554 | unclassified | — |
| POST | `/api/admin/clear-merchants` | 4577 | unclassified | — |
| POST | `/api/admin/resend-verification` | 4608 | unclassified | — |
| POST | `/api/admin/test-email` | 4666 | unclassified | — |
| GET | `/api/admin/email-status` | 4689 | unclassified | — |
| POST | `/api/merchants/verify` | 4716 | unclassified | — |
| GET | `/api/merchants/:id/email-status` | 4762 | unclassified | — |
| GET | `/api/auth/confirm-email` | 4781 | unclassified | — |
| POST | `/api/auth/resend-confirmation` | 4878 | unclassified | — |
| POST | `/api/info-pack-leads` | 4912 | unclassified | — |
| POST | `/api/merchants/signup` | 4954 | unclassified | — |
| PUT | `/api/merchants/:id/business-details` | 5056 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5122 | unclassified | — |
| GET | `/api/merchants/:id/events` | 5194 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5268 | unclassified | — |
| GET | `/api/push/vapid-key` | 5292 | unclassified | — |
| POST | `/api/push/subscribe` | 5302 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5338 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5365 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5398 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5419 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5443 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5457 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5483 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5503 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 5640 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 5669 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 5690 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 5722 | unclassified | — |
| POST | `/api/admin/api-keys` | 5760 | unclassified | — |
| POST | `/api/admin/api-keys/:keyId/revoke` | 5782 | unclassified | — |
| GET | `/api/admin/api-metrics` | 5794 | unclassified | — |
| GET | `/api/admin/api-usage` | 5805 | unclassified | — |
| GET | `/api/merchants/:merchantId/stock-items` | 5820 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 5839 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 5867 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 5904 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 5972 | api-key | authenticateApiKey, requireEcommerceApi |
| GET | `/api/v1/transactions/:id` | 6084 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6157 | unclassified | — |
| POST | `/api/payments/apple-pay/process` | 6200 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6267 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6334 | unclassified | — |
| GET | `/api/subscription` | 6369 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6392 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6455 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6498 | merchant-user | authenticateToken |
| GET | `/api/team` | 6529 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6550 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6611 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6692 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6711 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6751 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6782 | unclassified | — |
| GET | `/api/subscription/billing-history` | 6815 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 6845 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 6874 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 6920 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7011 | unclassified | — |
| GET | `/api/billing/card/callback` | 7021 | unclassified | — |
| POST | `/api/billing/card/callback` | 7022 | unclassified | — |
| DELETE | `/api/billing/card` | 7025 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7045 | unclassified | — |
| GET | `/uploads/:folder/:name` | 7073 | unclassified | — |
| GET | `/api/property/tenants` | 7266 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7277 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7291 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7302 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7318 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7331 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7344 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7359 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7367 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7378 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7396 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7415 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7430 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7460 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7477 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7517 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7532 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7543 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7557 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7577 | unclassified | — |
| POST | `/api/checkout/:token/split` | 7645 | unclassified | — |
| POST | `/api/checkout/pay` | 7661 | unclassified | — |
| POST | `/api/checkout/:token/session` | 7723 | unclassified | — |
| POST | `/api/checkout/:token/hosted-fields-complete` | 7796 | unclassified | — |
| POST | `/api/checkout/:token/googlepay-complete` | 7827 | unclassified | — |
| GET | `/api/checkout/callback` | 7880 | unclassified | — |
| ALL | `/api/windcave/rent-notification` | 7907 | unclassified | — |
| ALL | `/api/windcave/trades-notification` | 7924 | unclassified | — |
| POST | `/api/webhooks/whatsapp` | 7944 | unclassified | — |
| PUT | `/api/merchants/:merchantId/sector` | 7981 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8006 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8016 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8033 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8043 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8056 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8072 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8089 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8097 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8107 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8116 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8127 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8136 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8146 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8156 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8166 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8173 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8229 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8256 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8269 | unclassified | — |
| POST | `/api/trades/quotes/:id/resend` | 8280 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8296 | unclassified | — |
| POST | `/api/trades/quotes/token/:token/respond` | 8341 | unclassified | — |
| GET | `/api/trades/invoices` | 8384 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8394 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8443 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8456 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8493 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8510 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8527 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8537 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8544 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8562 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8575 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 8589 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8599 | cron | authorizeCronRequest |
