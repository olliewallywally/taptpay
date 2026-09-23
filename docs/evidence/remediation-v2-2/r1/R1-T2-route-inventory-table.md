# R1-T2 route inventory — generated 2026-09-23 @ `ff16abfeaa870671248257ee5f98623ac1f88fd3`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **223** (93 GET, 91 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

By principal: **public**: 64, **admin**: 30, **merchant-user**: 117, **provider-webhook**: 6, **unauthenticated-suspect**: 1, **api-key**: 3, **cron**: 2.

Unclassified (no known gate marker, no known public-design marker, and no
curated allowlist entry found near the handler — needs a human read, not
necessarily a bug): **0**.

## Suspected access-control gaps — not a fix, a loud flag

These routes are classified `unauthenticated-suspect` instead of whatever
their markers would otherwise earn, specifically so a real gap cannot hide
behind a reassuring label. See SUSPECTED_GAP_ROUTES in
server/route-inventory.ts for the justification; this generator does not and
must not silently resolve these.

- **GET /api/merchants/:id/events** (line 5702)

| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 468 | public | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 487 | public | generatePaymentUrl( |
| GET | `/nfc/:merchantId` | 499 | public | generatePaymentUrl( |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 509 | public | — |
| GET | `/sitemap.xml` | 524 | admin | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 607 | public | — |
| GET | `/api/auth/google/callback` | 628 | public | — |
| POST | `/api/auth/google/session` | 777 | public | — |
| POST | `/api/auth/sign-out-everywhere` | 800 | merchant-user | authenticateToken |
| POST | `/api/auth/login` | 845 | public | — |
| POST | `/api/auth/forgot-password` | 902 | public | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 942 | public | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 982 | public | validateResetToken( |
| GET | `/api/admin/request-origin` | 1001 | admin | authenticateAdmin |
| POST | `/api/admin/auth/login` | 1021 | public | — |
| GET | `/api/auth/me` | 1109 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 1150 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1180 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1217 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1238 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1319 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1331 | public | generatePaymentUrl( |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1376 | public | — |
| GET | `/api/merchants/:id` | 1424 | public | publicMerchantBrandDto(, generatePaymentUrl( |
| GET | `/api/merchants/:id/profile` | 1453 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner, generatePaymentUrl( |
| GET | `/api/pay/t/:token` | 1480 | public | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1507 | public | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1535 | public | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1632 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1645 | public | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1675 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1751 | public | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 2051 | public | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 2103 | public | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2234 | public | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2268 | provider-webhook | — |
| GET | `/api/merchants/:id/active-transaction` | 2285 | public | publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2388 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/transactions/cash-sale` | 2464 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2524 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2666 | public | isTokenAddressedTransaction(, publicTransactionDto(, generatePaymentUrl( |
| PATCH | `/api/transactions/:id/split-enabled` | 2714 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2759 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2778 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2835 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2925 | public | — |
| POST | `/api/transactions/:id/pay` | 2939 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3194 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3208 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3246 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3319 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3340 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3401 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3443 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3458 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3484 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3505 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3571 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3611 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3656 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3674 | admin | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3687 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3703 | admin | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3754 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3761 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3787 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3869 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3873 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3901 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3934 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 4008 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 4063 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 4106 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 4123 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 4139 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4190 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4225 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 4259 | public | — |
| GET | `/api/admin/subscription-revenue` | 4277 | admin | authenticateAdmin |
| ALL | `/api/windcave/notification` | 4288 | provider-webhook | — |
| GET | `/api/windcave/callback` | 4410 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/status` | 4603 | public | — |
| GET | `/api/admin/analytics` | 4616 | admin | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4689 | admin | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4725 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4762 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4827 | admin | authenticateAdmin |
| POST | `/api/admin/merchants` | 4904 | admin | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4915 | admin | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4941 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/admin/merchants` | 4982 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4992 | admin | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 5008 | admin | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 5032 | admin | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 5063 | admin | authenticateAdmin |
| POST | `/api/admin/test-email` | 5121 | admin | authenticateAdmin |
| GET | `/api/admin/email-status` | 5144 | admin | authenticateAdmin |
| POST | `/api/merchants/verify` | 5171 | public | storage.verifyMerchant( |
| GET | `/api/merchants/:id/email-status` | 5222 | public | — |
| POST | `/api/auth/confirm-email` | 5245 | public | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 5372 | public | — |
| POST | `/api/info-pack-leads` | 5409 | public | — |
| POST | `/api/merchants/signup` | 5462 | public | — |
| PUT | `/api/merchants/:id/business-details` | 5564 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5630 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/merchants/:id/events` | 5702 | unauthenticated-suspect | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5785 | public | — |
| GET | `/api/push/vapid-key` | 5809 | public | — |
| POST | `/api/push/subscribe` | 5819 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5856 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5883 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5917 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5951 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5975 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5989 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 6015 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 6035 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 6173 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 6203 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 6224 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 6258 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys` | 6262 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 6266 | admin | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 6272 | admin | authenticateAdmin |
| GET | `/api/admin/api-usage` | 6276 | admin | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 6285 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 6304 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 6332 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 6369 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6437 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6549 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6625 | merchant-user | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6630 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6635 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6640 | public | — |
| GET | `/api/subscription` | 6675 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6698 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6761 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6804 | merchant-user | authenticateToken |
| GET | `/api/team` | 6835 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6856 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6917 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6999 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 7019 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 7067 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 7099 | public | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 7135 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 7165 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 7194 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 7240 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7331 | provider-webhook | billingCardCallback |
| GET | `/api/billing/card/callback` | 7341 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 7342 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 7345 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7365 | public | — |
| GET | `/uploads/:folder/:name` | 7405 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7621 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7632 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7646 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7657 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7673 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7686 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7699 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7715 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7723 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7734 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7752 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7771 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7786 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7816 | merchant-user | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7862 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7891 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7933 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7948 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7959 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7973 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7993 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 8079 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 8103 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/pay` | 8119 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 8181 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 8254 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 8285 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 8338 | public | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 8365 | provider-webhook | — |
| ALL | `/api/windcave/trades-notification` | 8382 | provider-webhook | — |
| POST | `/api/webhooks/whatsapp` | 8402 | provider-webhook | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 8439 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8464 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8474 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8491 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8501 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8514 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8530 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8547 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8555 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8565 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8574 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8585 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8594 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8604 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8614 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8624 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8631 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8708 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8735 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8748 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8759 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8775 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8820 | public | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8863 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8873 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8925 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8938 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8975 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8992 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 9009 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 9019 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 9026 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 9044 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 9057 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 9071 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 9081 | cron | authorizeCronRequest |
