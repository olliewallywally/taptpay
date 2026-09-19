# R1-T2 route inventory — generated 2026-09-19 @ `454f4120756e3ba26c966659f847280b102a452f`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **220** (93 GET, 88 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

By principal: **public**: 63, **admin**: 29, **merchant-user**: 116, **provider-webhook**: 6, **unauthenticated-suspect**: 1, **api-key**: 3, **cron**: 2.

Unclassified (no known gate marker, no known public-design marker, and no
curated allowlist entry found near the handler — needs a human read, not
necessarily a bug): **0**.

## Suspected access-control gaps — not a fix, a loud flag

These routes are classified `unauthenticated-suspect` instead of whatever
their markers would otherwise earn, specifically so a real gap cannot hide
behind a reassuring label. See SUSPECTED_GAP_ROUTES in
server/route-inventory.ts for the justification; this generator does not and
must not silently resolve these.

- **GET /api/merchants/:id/events** (line 5439)

| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 454 | public | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 473 | public | generatePaymentUrl( |
| GET | `/nfc/:merchantId` | 485 | public | generatePaymentUrl( |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 495 | public | — |
| GET | `/sitemap.xml` | 510 | admin | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 564 | public | — |
| GET | `/api/auth/google/callback` | 581 | public | — |
| POST | `/api/auth/login` | 696 | public | — |
| POST | `/api/auth/forgot-password` | 772 | public | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 792 | public | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 813 | public | validateResetToken( |
| POST | `/api/admin/auth/login` | 829 | public | — |
| GET | `/api/auth/me` | 933 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 974 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1004 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1041 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1062 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1143 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1155 | public | generatePaymentUrl( |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1200 | public | — |
| GET | `/api/merchants/:id` | 1248 | public | publicMerchantBrandDto(, generatePaymentUrl( |
| GET | `/api/merchants/:id/profile` | 1277 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner, generatePaymentUrl( |
| GET | `/api/pay/t/:token` | 1304 | public | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1331 | public | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1359 | public | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1456 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1469 | public | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1499 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1575 | public | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1875 | public | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 1927 | public | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2058 | public | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2092 | provider-webhook | — |
| GET | `/api/merchants/:id/active-transaction` | 2109 | public | publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2212 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/transactions/cash-sale` | 2288 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2348 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2490 | public | isTokenAddressedTransaction(, publicTransactionDto(, generatePaymentUrl( |
| PATCH | `/api/transactions/:id/split-enabled` | 2538 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2583 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2602 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2659 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2749 | public | — |
| POST | `/api/transactions/:id/pay` | 2763 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3018 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3032 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3070 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3143 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3164 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3225 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3267 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3282 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3308 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3329 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3395 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3435 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3480 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3498 | admin | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3511 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3527 | admin | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3573 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3580 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3606 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3659 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3663 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3691 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3724 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3798 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3853 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 3896 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 3913 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 3929 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3980 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4015 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 4049 | public | — |
| GET | `/api/admin/subscription-revenue` | 4067 | admin | authenticateAdmin |
| ALL | `/api/windcave/notification` | 4078 | provider-webhook | — |
| GET | `/api/windcave/callback` | 4200 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/status` | 4393 | public | — |
| GET | `/api/admin/analytics` | 4406 | admin | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4479 | admin | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4515 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4552 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4617 | admin | authenticateAdmin |
| POST | `/api/admin/merchants` | 4694 | admin | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4705 | admin | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4731 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/admin/merchants` | 4772 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4782 | admin | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 4798 | admin | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 4822 | admin | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 4853 | admin | authenticateAdmin |
| POST | `/api/admin/test-email` | 4911 | admin | authenticateAdmin |
| GET | `/api/admin/email-status` | 4934 | admin | authenticateAdmin |
| POST | `/api/merchants/verify` | 4961 | public | storage.verifyMerchant( |
| GET | `/api/merchants/:id/email-status` | 5007 | public | — |
| GET | `/api/auth/confirm-email` | 5026 | public | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 5123 | public | — |
| POST | `/api/info-pack-leads` | 5157 | public | — |
| POST | `/api/merchants/signup` | 5199 | public | — |
| PUT | `/api/merchants/:id/business-details` | 5301 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5367 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/merchants/:id/events` | 5439 | unauthenticated-suspect | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5522 | public | — |
| GET | `/api/push/vapid-key` | 5546 | public | — |
| POST | `/api/push/subscribe` | 5556 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5592 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5619 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5652 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5673 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5697 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5711 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5737 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5757 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 5895 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 5925 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 5946 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 5980 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys` | 5984 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 5988 | admin | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 5994 | admin | authenticateAdmin |
| GET | `/api/admin/api-usage` | 5998 | admin | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 6007 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 6026 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 6054 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 6091 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6159 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6271 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6347 | merchant-user | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6352 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6357 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6362 | public | — |
| GET | `/api/subscription` | 6397 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6420 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6483 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6526 | merchant-user | authenticateToken |
| GET | `/api/team` | 6557 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6578 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6639 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6721 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6741 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6782 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6814 | public | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 6847 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 6877 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 6906 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 6952 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7043 | provider-webhook | billingCardCallback |
| GET | `/api/billing/card/callback` | 7053 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 7054 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 7057 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7077 | public | — |
| GET | `/uploads/:folder/:name` | 7117 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7324 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7335 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7349 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7360 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7376 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7389 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7402 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7418 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7426 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7437 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7455 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7474 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7489 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7519 | merchant-user | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7557 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7572 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7614 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7629 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7640 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7654 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7674 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 7757 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 7773 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/pay` | 7789 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 7851 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 7924 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 7955 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 8008 | public | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 8035 | provider-webhook | — |
| ALL | `/api/windcave/trades-notification` | 8052 | provider-webhook | — |
| POST | `/api/webhooks/whatsapp` | 8072 | provider-webhook | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 8109 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8134 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8144 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8161 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8171 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8184 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8200 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8217 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8225 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8235 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8244 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8255 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8264 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8274 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8284 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8294 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8301 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8378 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8405 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8418 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8429 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8445 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8490 | public | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8533 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8543 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8595 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8608 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8645 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8662 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8679 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8689 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8696 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8714 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8727 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 8741 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8751 | cron | authorizeCronRequest |
