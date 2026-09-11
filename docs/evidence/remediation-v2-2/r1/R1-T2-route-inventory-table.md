# R1-T2 route inventory — generated 2026-09-11 @ `5d30caf628c8d316aed012fc007eabf29a67aeb8`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **218** (91 GET, 88 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

Unclassified (no known gate marker detected near the handler — needs a human
read, not necessarily a bug): **96**.

| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 353 | unclassified | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 372 | unclassified | — |
| GET | `/nfc/:merchantId` | 384 | unclassified | — |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 394 | unclassified | — |
| GET | `/sitemap.xml` | 409 | merchant-user | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin' |
| GET | `/api/auth/google` | 463 | unclassified | — |
| GET | `/api/auth/google/callback` | 480 | unclassified | — |
| POST | `/api/auth/login` | 595 | unclassified | — |
| POST | `/api/auth/forgot-password` | 671 | unclassified | — |
| POST | `/api/auth/reset-password` | 691 | unclassified | — |
| GET | `/api/auth/validate-reset-token/:token` | 712 | unclassified | — |
| POST | `/api/admin/auth/login` | 728 | unclassified | — |
| GET | `/api/auth/me` | 832 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 873 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 903 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 940 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 961 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1042 | unclassified | — |
| GET | `/api/merchants/:id/qr` | 1054 | unclassified | — |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1099 | unclassified | — |
| GET | `/api/merchants/:id` | 1147 | unclassified | — |
| GET | `/api/merchants/:id/profile` | 1176 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1203 | unclassified | — |
| GET | `/api/pay/t/:token/qr` | 1230 | unclassified | — |
| POST | `/api/pay/t/:token/split` | 1258 | unclassified | — |
| GET | `/api/pay/t/:token/receipt` | 1355 | unclassified | — |
| POST | `/api/pay/t/:token/receipt-pdf` | 1368 | unclassified | — |
| GET | `/api/pay/t/:token/receipt-qr` | 1398 | unclassified | — |
| POST | `/api/pay/t/:token/session` | 1474 | unclassified | — |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1774 | unclassified | — |
| POST | `/api/pay/t/:token/googlepay-complete` | 1826 | unclassified | — |
| GET | `/api/pay/return/:state` | 1957 | unclassified | — |
| ALL | `/api/pay/notification/:state` | 1991 | unclassified | — |
| GET | `/api/merchants/:id/active-transaction` | 2008 | unclassified | — |
| POST | `/api/transactions` | 2092 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2168 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2228 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2370 | unclassified | — |
| PATCH | `/api/transactions/:id/split-enabled` | 2418 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2463 | unclassified | — |
| POST | `/api/transactions/:id/cancel` | 2482 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2539 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2629 | unclassified | — |
| POST | `/api/transactions/:id/pay` | 2643 | unclassified | — |
| GET | `/api/windcave/env` | 2898 | unclassified | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 2912 | unclassified | — |
| POST | `/api/transactions/:id/googlepay-complete` | 2947 | unclassified | — |
| GET | `/api/transactions/:id` | 3017 | unclassified | — |
| POST | `/api/transactions/:id/receipt-pdf` | 3038 | unclassified | — |
| GET | `/api/transactions/:id/receipt-qr` | 3099 | unclassified | — |
| GET | `/api/merchants/:id/analytics` | 3141 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3156 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3182 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3203 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3269 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3309 | unclassified | — |
| POST | `/api/admin/merchants/:id/set-active` | 3354 | unclassified | — |
| GET | `/api/admin/merchants/:id/transactions` | 3372 | unclassified | — |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3385 | unclassified | — |
| POST | `/api/admin/merchants/:id/activate` | 3401 | unclassified | — |
| PUT | `/api/merchants/:id/rates` | 3447 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3454 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3480 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3533 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3537 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3565 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3598 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3654 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3699 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 3740 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 3757 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 3773 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3824 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3859 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 3893 | unclassified | — |
| GET | `/api/admin/subscription-revenue` | 3911 | unclassified | — |
| ALL | `/api/windcave/notification` | 3922 | unclassified | — |
| GET | `/api/windcave/callback` | 4044 | unclassified | — |
| GET | `/api/windcave/status` | 4237 | unclassified | — |
| GET | `/api/admin/analytics` | 4250 | unclassified | — |
| GET | `/api/admin/revenue-over-time` | 4323 | unclassified | — |
| GET | `/api/admin/payment-method-breakdown` | 4359 | unclassified | — |
| GET | `/api/admin/ga4-detailed` | 4396 | unclassified | — |
| GET | `/api/admin/ga4-metrics` | 4461 | unclassified | — |
| POST | `/api/admin/merchants` | 4538 | unclassified | — |
| PUT | `/api/admin/merchants/:id` | 4549 | unclassified | — |
| POST | `/api/merchants/:id/test-payment-link` | 4575 | unclassified | — |
| GET | `/api/admin/merchants` | 4616 | unclassified | — |
| GET | `/api/admin/merchants/:id` | 4626 | unclassified | — |
| DELETE | `/api/admin/merchants/:id` | 4642 | unclassified | — |
| POST | `/api/admin/clear-merchants` | 4666 | unclassified | — |
| POST | `/api/admin/resend-verification` | 4697 | unclassified | — |
| POST | `/api/admin/test-email` | 4755 | unclassified | — |
| GET | `/api/admin/email-status` | 4778 | unclassified | — |
| POST | `/api/merchants/verify` | 4805 | unclassified | — |
| GET | `/api/merchants/:id/email-status` | 4851 | unclassified | — |
| GET | `/api/auth/confirm-email` | 4870 | unclassified | — |
| POST | `/api/auth/resend-confirmation` | 4967 | unclassified | — |
| POST | `/api/info-pack-leads` | 5001 | unclassified | — |
| POST | `/api/merchants/signup` | 5043 | unclassified | — |
| PUT | `/api/merchants/:id/business-details` | 5145 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5211 | unclassified | — |
| GET | `/api/merchants/:id/events` | 5283 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5357 | unclassified | — |
| GET | `/api/push/vapid-key` | 5381 | unclassified | — |
| POST | `/api/push/subscribe` | 5391 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5427 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5454 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5487 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5508 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5532 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5546 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5572 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5592 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 5730 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 5760 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 5781 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 5815 | unclassified | — |
| POST | `/api/admin/api-keys` | 5819 | unclassified | — |
| POST | `/api/admin/api-keys/:keyId/revoke` | 5823 | unclassified | — |
| GET | `/api/admin/api-metrics` | 5829 | unclassified | — |
| GET | `/api/admin/api-usage` | 5833 | unclassified | — |
| GET | `/api/merchants/:merchantId/stock-items` | 5842 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 5861 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 5889 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 5926 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 5994 | api-key | authenticateApiKey, requireEcommerceApi |
| GET | `/api/v1/transactions/:id` | 6106 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6182 | merchant-user | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6187 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6192 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6197 | unclassified | — |
| GET | `/api/subscription` | 6232 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6255 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6318 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6361 | merchant-user | authenticateToken |
| GET | `/api/team` | 6392 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6413 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6474 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6556 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6576 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6617 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6649 | unclassified | — |
| GET | `/api/subscription/billing-history` | 6682 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 6712 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 6741 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 6787 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 6878 | unclassified | — |
| GET | `/api/billing/card/callback` | 6888 | unclassified | — |
| POST | `/api/billing/card/callback` | 6889 | unclassified | — |
| DELETE | `/api/billing/card` | 6892 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 6912 | unclassified | — |
| GET | `/uploads/:folder/:name` | 6940 | unclassified | — |
| GET | `/api/property/tenants` | 7133 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7144 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7158 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7169 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7185 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7198 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7211 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7227 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7235 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7246 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7264 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7283 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7298 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7328 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7345 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7385 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7400 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7411 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7425 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7445 | unclassified | — |
| POST | `/api/checkout/:token/split` | 7513 | unclassified | — |
| POST | `/api/checkout/pay` | 7529 | unclassified | — |
| POST | `/api/checkout/:token/session` | 7591 | unclassified | — |
| POST | `/api/checkout/:token/hosted-fields-complete` | 7664 | unclassified | — |
| POST | `/api/checkout/:token/googlepay-complete` | 7695 | unclassified | — |
| GET | `/api/checkout/callback` | 7748 | unclassified | — |
| ALL | `/api/windcave/rent-notification` | 7775 | unclassified | — |
| ALL | `/api/windcave/trades-notification` | 7792 | unclassified | — |
| POST | `/api/webhooks/whatsapp` | 7812 | unclassified | — |
| PUT | `/api/merchants/:merchantId/sector` | 7849 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 7874 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 7884 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 7901 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 7911 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 7924 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 7940 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 7957 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 7965 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 7975 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 7984 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 7995 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8004 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8014 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8024 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8034 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8041 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8097 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8124 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8137 | unclassified | — |
| POST | `/api/trades/quotes/:id/resend` | 8148 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8164 | unclassified | — |
| POST | `/api/trades/quotes/token/:token/respond` | 8209 | unclassified | — |
| GET | `/api/trades/invoices` | 8252 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8262 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8311 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8324 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8361 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8378 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8395 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8405 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8412 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8430 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8443 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 8457 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8467 | cron | authorizeCronRequest |
