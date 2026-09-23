# R1-T2 route inventory — generated 2026-09-23 @ `fa0b0230b51f02bad5cf7114078350d3b697273a`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **223** (94 GET, 90 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

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

- **GET /api/merchants/:id/events** (line 5671)

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
| GET | `/api/auth/me` | 1107 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 1148 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1178 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1215 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1236 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1317 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1329 | public | generatePaymentUrl( |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1374 | public | — |
| GET | `/api/merchants/:id` | 1422 | public | publicMerchantBrandDto(, generatePaymentUrl( |
| GET | `/api/merchants/:id/profile` | 1451 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner, generatePaymentUrl( |
| GET | `/api/pay/t/:token` | 1478 | public | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1505 | public | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1533 | public | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1630 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1643 | public | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1673 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1749 | public | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 2049 | public | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 2101 | public | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2232 | public | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2266 | provider-webhook | — |
| GET | `/api/merchants/:id/active-transaction` | 2283 | public | publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2386 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/transactions/cash-sale` | 2462 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2522 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2664 | public | isTokenAddressedTransaction(, publicTransactionDto(, generatePaymentUrl( |
| PATCH | `/api/transactions/:id/split-enabled` | 2712 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2757 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2776 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2833 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2923 | public | — |
| POST | `/api/transactions/:id/pay` | 2937 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3192 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3206 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3244 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3317 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3338 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3399 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3441 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3456 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3482 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3503 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3569 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3609 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3654 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3672 | admin | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3685 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3701 | admin | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3752 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3759 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3785 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3867 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3871 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3899 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3932 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 4006 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 4061 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 4104 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 4121 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 4137 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4188 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4223 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 4257 | public | — |
| GET | `/api/admin/subscription-revenue` | 4275 | admin | authenticateAdmin |
| ALL | `/api/windcave/notification` | 4286 | provider-webhook | — |
| GET | `/api/windcave/callback` | 4408 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/status` | 4601 | public | — |
| GET | `/api/admin/analytics` | 4614 | admin | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4687 | admin | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4723 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4760 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4825 | admin | authenticateAdmin |
| POST | `/api/admin/merchants` | 4902 | admin | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4913 | admin | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4939 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/admin/merchants` | 4980 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4990 | admin | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 5006 | admin | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 5030 | admin | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 5061 | admin | authenticateAdmin |
| POST | `/api/admin/test-email` | 5119 | admin | authenticateAdmin |
| GET | `/api/admin/email-status` | 5142 | admin | authenticateAdmin |
| POST | `/api/merchants/verify` | 5169 | public | storage.verifyMerchant( |
| GET | `/api/merchants/:id/email-status` | 5220 | public | — |
| GET | `/api/auth/confirm-email` | 5239 | public | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 5341 | public | — |
| POST | `/api/info-pack-leads` | 5378 | public | — |
| POST | `/api/merchants/signup` | 5431 | public | — |
| PUT | `/api/merchants/:id/business-details` | 5533 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5599 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/merchants/:id/events` | 5671 | unauthenticated-suspect | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5754 | public | — |
| GET | `/api/push/vapid-key` | 5778 | public | — |
| POST | `/api/push/subscribe` | 5788 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5825 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5852 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5886 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5920 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5944 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5958 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5984 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 6004 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 6142 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 6172 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 6193 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 6227 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys` | 6231 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 6235 | admin | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 6241 | admin | authenticateAdmin |
| GET | `/api/admin/api-usage` | 6245 | admin | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 6254 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 6273 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 6301 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 6338 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6406 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6518 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6594 | merchant-user | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6599 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6604 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6609 | public | — |
| GET | `/api/subscription` | 6644 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6667 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6730 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6773 | merchant-user | authenticateToken |
| GET | `/api/team` | 6804 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6825 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6886 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6968 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6988 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 7036 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 7068 | public | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 7104 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 7134 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 7163 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 7209 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7300 | provider-webhook | billingCardCallback |
| GET | `/api/billing/card/callback` | 7310 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 7311 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 7314 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7334 | public | — |
| GET | `/uploads/:folder/:name` | 7374 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7590 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7601 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7615 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7626 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7642 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7655 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7668 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7684 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7692 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7703 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7721 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7740 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7755 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7785 | merchant-user | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7831 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7860 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7902 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7917 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7928 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7942 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7962 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 8048 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 8072 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/pay` | 8088 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 8150 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 8223 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 8254 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 8307 | public | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 8334 | provider-webhook | — |
| ALL | `/api/windcave/trades-notification` | 8351 | provider-webhook | — |
| POST | `/api/webhooks/whatsapp` | 8371 | provider-webhook | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 8408 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8433 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8443 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8460 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8470 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8483 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8499 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8516 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8524 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8534 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8543 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8554 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8563 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8573 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8583 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8593 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8600 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8677 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8704 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8717 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8728 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8744 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8789 | public | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8832 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8842 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8894 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8907 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8944 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8961 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8978 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8988 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8995 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 9013 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 9026 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 9040 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 9050 | cron | authorizeCronRequest |
