# R1-T2 route inventory — generated 2026-09-13 @ `2e75a2784b20b50dd4d6a430a732593c7c2ac170`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **218** (91 GET, 88 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

By principal: **public**: 62, **admin**: 29, **merchant-user**: 115, **provider-webhook**: 6, **unauthenticated-suspect**: 1, **api-key**: 3, **cron**: 2.

Unclassified (no known gate marker, no known public-design marker, and no
curated allowlist entry found near the handler — needs a human read, not
necessarily a bug): **0**.

## Suspected access-control gaps — not a fix, a loud flag

These routes are classified `unauthenticated-suspect` instead of whatever
their markers would otherwise earn, specifically so a real gap cannot hide
behind a reassuring label. See SUSPECTED_GAP_ROUTES in
server/route-inventory.ts for the justification; this generator does not and
must not silently resolve these.

- **GET /api/merchants/:id/events** (line 5289)

| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 353 | public | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 372 | public | generatePaymentUrl( |
| GET | `/nfc/:merchantId` | 384 | public | generatePaymentUrl( |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 394 | public | — |
| GET | `/sitemap.xml` | 409 | admin | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 463 | public | — |
| GET | `/api/auth/google/callback` | 480 | public | — |
| POST | `/api/auth/login` | 595 | public | — |
| POST | `/api/auth/forgot-password` | 671 | public | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 691 | public | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 712 | public | validateResetToken( |
| POST | `/api/admin/auth/login` | 728 | public | — |
| GET | `/api/auth/me` | 832 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 873 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 903 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 940 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 961 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1042 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1054 | public | generatePaymentUrl( |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1099 | public | — |
| GET | `/api/merchants/:id` | 1147 | public | publicMerchantBrandDto(, generatePaymentUrl( |
| GET | `/api/merchants/:id/profile` | 1176 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner, generatePaymentUrl( |
| GET | `/api/pay/t/:token` | 1203 | public | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1230 | public | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1258 | public | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1355 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1368 | public | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1398 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1474 | public | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1774 | public | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 1826 | public | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 1957 | public | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 1991 | provider-webhook | — |
| GET | `/api/merchants/:id/active-transaction` | 2008 | public | publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2092 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/transactions/cash-sale` | 2168 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2228 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2370 | public | isTokenAddressedTransaction(, publicTransactionDto(, generatePaymentUrl( |
| PATCH | `/api/transactions/:id/split-enabled` | 2418 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2463 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2482 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2539 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2629 | public | — |
| POST | `/api/transactions/:id/pay` | 2643 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 2898 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 2912 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 2950 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3023 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3044 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3105 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3147 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3162 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3188 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3209 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3275 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3315 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3360 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3378 | admin | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3391 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3407 | admin | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3453 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3460 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3486 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3539 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3543 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3571 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3604 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3660 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3705 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 3746 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 3763 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 3779 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3830 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3865 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 3899 | public | — |
| GET | `/api/admin/subscription-revenue` | 3917 | admin | authenticateAdmin |
| ALL | `/api/windcave/notification` | 3928 | provider-webhook | — |
| GET | `/api/windcave/callback` | 4050 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/status` | 4243 | public | — |
| GET | `/api/admin/analytics` | 4256 | admin | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4329 | admin | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4365 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4402 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4467 | admin | authenticateAdmin |
| POST | `/api/admin/merchants` | 4544 | admin | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4555 | admin | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4581 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/admin/merchants` | 4622 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4632 | admin | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 4648 | admin | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 4672 | admin | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 4703 | admin | authenticateAdmin |
| POST | `/api/admin/test-email` | 4761 | admin | authenticateAdmin |
| GET | `/api/admin/email-status` | 4784 | admin | authenticateAdmin |
| POST | `/api/merchants/verify` | 4811 | public | storage.verifyMerchant( |
| GET | `/api/merchants/:id/email-status` | 4857 | public | — |
| GET | `/api/auth/confirm-email` | 4876 | public | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 4973 | public | — |
| POST | `/api/info-pack-leads` | 5007 | public | — |
| POST | `/api/merchants/signup` | 5049 | public | — |
| PUT | `/api/merchants/:id/business-details` | 5151 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5217 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/merchants/:id/events` | 5289 | unauthenticated-suspect | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5363 | public | — |
| GET | `/api/push/vapid-key` | 5387 | public | — |
| POST | `/api/push/subscribe` | 5397 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5433 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5460 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5493 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5514 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5538 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5552 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5578 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5598 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 5736 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 5766 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 5787 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 5821 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys` | 5825 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 5829 | admin | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 5835 | admin | authenticateAdmin |
| GET | `/api/admin/api-usage` | 5839 | admin | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 5848 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 5867 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 5895 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 5932 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6000 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6112 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6188 | merchant-user | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6193 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6198 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6203 | public | — |
| GET | `/api/subscription` | 6238 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6261 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6324 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6367 | merchant-user | authenticateToken |
| GET | `/api/team` | 6398 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6419 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6480 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6562 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6582 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6623 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6655 | public | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 6688 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 6718 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 6747 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 6793 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 6884 | provider-webhook | billingCardCallback |
| GET | `/api/billing/card/callback` | 6894 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 6895 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 6898 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 6918 | public | — |
| GET | `/uploads/:folder/:name` | 6946 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7139 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7150 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7164 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7175 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7191 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7204 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7217 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7233 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7241 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7252 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7270 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7289 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7304 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7334 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7351 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7391 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7406 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7417 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7431 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7451 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 7519 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/pay` | 7535 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 7597 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 7670 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 7701 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 7754 | public | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 7781 | provider-webhook | — |
| ALL | `/api/windcave/trades-notification` | 7798 | provider-webhook | — |
| POST | `/api/webhooks/whatsapp` | 7818 | provider-webhook | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 7855 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 7880 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 7890 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 7907 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 7917 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 7930 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 7946 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 7963 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 7971 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 7981 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 7990 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8001 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8010 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8020 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8030 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8040 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8047 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8103 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8130 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8143 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8154 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8170 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8215 | public | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8258 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8268 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8317 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8330 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8367 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8384 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8401 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8411 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8418 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8436 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8449 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 8463 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8473 | cron | authorizeCronRequest |
