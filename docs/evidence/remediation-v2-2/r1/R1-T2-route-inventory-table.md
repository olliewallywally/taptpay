# R1-T2 route inventory — generated 2026-09-11 @ `c658cac4e61a27b44da890925a333a1de14fcf04`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **218** (91 GET, 88 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

Unclassified (no known gate marker detected near the handler — needs a human
read, not necessarily a bug): **97**.

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
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1098 | unclassified | — |
| GET | `/api/merchants/:id` | 1145 | unclassified | — |
| GET | `/api/merchants/:id/profile` | 1174 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1201 | unclassified | — |
| GET | `/api/pay/t/:token/qr` | 1228 | unclassified | — |
| POST | `/api/pay/t/:token/split` | 1255 | unclassified | — |
| GET | `/api/pay/t/:token/receipt` | 1352 | unclassified | — |
| POST | `/api/pay/t/:token/receipt-pdf` | 1365 | unclassified | — |
| GET | `/api/pay/t/:token/receipt-qr` | 1395 | unclassified | — |
| POST | `/api/pay/t/:token/session` | 1470 | unclassified | — |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1770 | unclassified | — |
| POST | `/api/pay/t/:token/googlepay-complete` | 1822 | unclassified | — |
| GET | `/api/pay/return/:state` | 1953 | unclassified | — |
| ALL | `/api/pay/notification/:state` | 1987 | unclassified | — |
| GET | `/api/merchants/:id/active-transaction` | 2004 | unclassified | — |
| POST | `/api/transactions` | 2088 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2164 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2224 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2366 | unclassified | — |
| PATCH | `/api/transactions/:id/split-enabled` | 2414 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2459 | unclassified | — |
| POST | `/api/transactions/:id/cancel` | 2478 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2535 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2625 | unclassified | — |
| POST | `/api/transactions/:id/pay` | 2639 | unclassified | — |
| GET | `/api/windcave/env` | 2894 | unclassified | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 2908 | unclassified | — |
| POST | `/api/transactions/:id/googlepay-complete` | 2943 | unclassified | — |
| GET | `/api/transactions/:id` | 3013 | unclassified | — |
| POST | `/api/transactions/:id/receipt-pdf` | 3034 | unclassified | — |
| GET | `/api/transactions/:id/receipt-qr` | 3095 | unclassified | — |
| GET | `/api/merchants/:id/analytics` | 3136 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3151 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3176 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3197 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3263 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3303 | unclassified | — |
| POST | `/api/admin/merchants/:id/set-active` | 3348 | unclassified | — |
| GET | `/api/admin/merchants/:id/transactions` | 3366 | unclassified | — |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3379 | unclassified | — |
| POST | `/api/admin/merchants/:id/activate` | 3395 | unclassified | — |
| PUT | `/api/merchants/:id/rates` | 3441 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3448 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3474 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3527 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3531 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3559 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3592 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3648 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3693 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 3734 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 3751 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 3767 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3818 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3853 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 3887 | unclassified | — |
| GET | `/api/admin/subscription-revenue` | 3905 | unclassified | — |
| ALL | `/api/windcave/notification` | 3916 | unclassified | — |
| GET | `/api/windcave/callback` | 4038 | unclassified | — |
| GET | `/api/windcave/status` | 4231 | unclassified | — |
| GET | `/api/admin/analytics` | 4244 | unclassified | — |
| GET | `/api/admin/revenue-over-time` | 4317 | unclassified | — |
| GET | `/api/admin/payment-method-breakdown` | 4353 | unclassified | — |
| GET | `/api/admin/ga4-detailed` | 4390 | unclassified | — |
| GET | `/api/admin/ga4-metrics` | 4455 | unclassified | — |
| POST | `/api/admin/merchants` | 4532 | unclassified | — |
| PUT | `/api/admin/merchants/:id` | 4543 | unclassified | — |
| POST | `/api/merchants/:id/test-payment-link` | 4569 | unclassified | — |
| GET | `/api/admin/merchants` | 4610 | unclassified | — |
| GET | `/api/admin/merchants/:id` | 4620 | unclassified | — |
| DELETE | `/api/admin/merchants/:id` | 4636 | unclassified | — |
| POST | `/api/admin/clear-merchants` | 4660 | unclassified | — |
| POST | `/api/admin/resend-verification` | 4691 | unclassified | — |
| POST | `/api/admin/test-email` | 4749 | unclassified | — |
| GET | `/api/admin/email-status` | 4772 | unclassified | — |
| POST | `/api/merchants/verify` | 4799 | unclassified | — |
| GET | `/api/merchants/:id/email-status` | 4845 | unclassified | — |
| GET | `/api/auth/confirm-email` | 4864 | unclassified | — |
| POST | `/api/auth/resend-confirmation` | 4961 | unclassified | — |
| POST | `/api/info-pack-leads` | 4995 | unclassified | — |
| POST | `/api/merchants/signup` | 5037 | unclassified | — |
| PUT | `/api/merchants/:id/business-details` | 5139 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5205 | unclassified | — |
| GET | `/api/merchants/:id/events` | 5277 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5351 | unclassified | — |
| GET | `/api/push/vapid-key` | 5375 | unclassified | — |
| POST | `/api/push/subscribe` | 5385 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5421 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5448 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5481 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5502 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5526 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5540 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5566 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5586 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 5724 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 5754 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 5775 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 5809 | unclassified | — |
| POST | `/api/admin/api-keys` | 5813 | unclassified | — |
| POST | `/api/admin/api-keys/:keyId/revoke` | 5817 | unclassified | — |
| GET | `/api/admin/api-metrics` | 5823 | unclassified | — |
| GET | `/api/admin/api-usage` | 5827 | unclassified | — |
| GET | `/api/merchants/:merchantId/stock-items` | 5836 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 5855 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 5883 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 5920 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 5988 | api-key | authenticateApiKey, requireEcommerceApi |
| GET | `/api/v1/transactions/:id` | 6100 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6174 | unclassified | — |
| POST | `/api/payments/apple-pay/process` | 6217 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6284 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6351 | unclassified | — |
| GET | `/api/subscription` | 6386 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6409 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6472 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6515 | merchant-user | authenticateToken |
| GET | `/api/team` | 6546 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6567 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6628 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6710 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6730 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6771 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6803 | unclassified | — |
| GET | `/api/subscription/billing-history` | 6836 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 6866 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 6895 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 6941 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7032 | unclassified | — |
| GET | `/api/billing/card/callback` | 7042 | unclassified | — |
| POST | `/api/billing/card/callback` | 7043 | unclassified | — |
| DELETE | `/api/billing/card` | 7046 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7066 | unclassified | — |
| GET | `/uploads/:folder/:name` | 7094 | unclassified | — |
| GET | `/api/property/tenants` | 7287 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7298 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7312 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7323 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7339 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7352 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7365 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7380 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7388 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7399 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7417 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7436 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7451 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7481 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7498 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7538 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7553 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7564 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7578 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7598 | unclassified | — |
| POST | `/api/checkout/:token/split` | 7666 | unclassified | — |
| POST | `/api/checkout/pay` | 7682 | unclassified | — |
| POST | `/api/checkout/:token/session` | 7744 | unclassified | — |
| POST | `/api/checkout/:token/hosted-fields-complete` | 7817 | unclassified | — |
| POST | `/api/checkout/:token/googlepay-complete` | 7848 | unclassified | — |
| GET | `/api/checkout/callback` | 7901 | unclassified | — |
| ALL | `/api/windcave/rent-notification` | 7928 | unclassified | — |
| ALL | `/api/windcave/trades-notification` | 7945 | unclassified | — |
| POST | `/api/webhooks/whatsapp` | 7965 | unclassified | — |
| PUT | `/api/merchants/:merchantId/sector` | 8002 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8027 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8037 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8054 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8064 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8077 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8093 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8110 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8118 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8128 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8137 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8148 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8157 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8167 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8177 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8187 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8194 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8250 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8277 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8290 | unclassified | — |
| POST | `/api/trades/quotes/:id/resend` | 8301 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8317 | unclassified | — |
| POST | `/api/trades/quotes/token/:token/respond` | 8362 | unclassified | — |
| GET | `/api/trades/invoices` | 8405 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8415 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8464 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8477 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8514 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8531 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8548 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8558 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8565 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8583 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8596 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 8610 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8620 | cron | authorizeCronRequest |
