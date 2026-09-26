# R1-T2 route inventory — generated 2026-09-26 @ `2ec9d78fc56054428baf23d9a5544161ecefd557`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **223** (93 GET, 91 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

By principal: **public**: 63, **admin**: 30, **merchant-user**: 119, **provider-webhook**: 6, **api-key**: 3, **cron**: 2.

Unclassified (no known gate marker, no known public-design marker, and no
curated allowlist entry found near the handler — needs a human read, not
necessarily a bug): **0**.

| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 422 | public | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 441 | public | generatePaymentUrl( |
| GET | `/nfc/:merchantId` | 455 | public | — |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 462 | public | — |
| GET | `/sitemap.xml` | 477 | admin | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 560 | public | — |
| GET | `/api/auth/google/callback` | 581 | public | — |
| POST | `/api/auth/google/session` | 730 | public | — |
| POST | `/api/auth/sign-out-everywhere` | 753 | merchant-user | authenticateToken |
| POST | `/api/auth/login` | 798 | public | — |
| POST | `/api/auth/forgot-password` | 855 | public | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 895 | public | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 935 | public | validateResetToken( |
| GET | `/api/admin/request-origin` | 954 | admin | authenticateAdmin |
| POST | `/api/admin/auth/login` | 974 | public | — |
| GET | `/api/auth/me` | 1062 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 1103 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1133 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1170 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1191 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1272 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1285 | public | — |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1292 | public | — |
| GET | `/api/merchants/:id` | 1340 | public | publicMerchantBrandDto( |
| GET | `/api/merchants/:id/profile` | 1358 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1380 | public | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1407 | public | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1435 | public | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1532 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1545 | public | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1575 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1651 | public | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1951 | public | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 2003 | public | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2134 | public | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2168 | provider-webhook | — |
| GET | `/api/merchants/:id/active-transaction` | 2185 | merchant-user | authenticateToken, checkMerchantOwnership, publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2302 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2383 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2443 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2585 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| PATCH | `/api/transactions/:id/split-enabled` | 2629 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2674 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2693 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2746 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2836 | public | — |
| POST | `/api/transactions/:id/pay` | 2850 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3105 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3119 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3157 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3230 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3251 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3312 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3354 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3369 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3395 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3416 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3482 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3522 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3567 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3585 | admin | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3598 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3614 | admin | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3665 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3672 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3698 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3780 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3784 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3812 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3845 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3919 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3974 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 4017 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 4034 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 4050 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4101 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4136 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 4170 | public | — |
| GET | `/api/admin/subscription-revenue` | 4188 | admin | authenticateAdmin |
| ALL | `/api/windcave/notification` | 4199 | provider-webhook | — |
| GET | `/api/windcave/callback` | 4321 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/status` | 4514 | public | — |
| GET | `/api/admin/analytics` | 4527 | admin | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4600 | admin | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4636 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4673 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4738 | admin | authenticateAdmin |
| POST | `/api/admin/merchants` | 4815 | admin | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4826 | admin | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4854 | admin | authenticateAdmin |
| GET | `/api/admin/merchants` | 4861 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4871 | admin | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 4887 | admin | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 4911 | admin | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 4942 | admin | authenticateAdmin |
| POST | `/api/admin/test-email` | 5000 | admin | authenticateAdmin |
| GET | `/api/admin/email-status` | 5023 | admin | authenticateAdmin |
| POST | `/api/merchants/verify` | 5050 | public | storage.verifyMerchant( |
| GET | `/api/merchants/:id/email-status` | 5101 | public | — |
| POST | `/api/auth/confirm-email` | 5124 | public | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 5251 | public | — |
| POST | `/api/info-pack-leads` | 5288 | public | — |
| POST | `/api/merchants/signup` | 5341 | public | — |
| PUT | `/api/merchants/:id/business-details` | 5443 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5509 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/events` | 5572 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5648 | public | — |
| GET | `/api/push/vapid-key` | 5672 | public | — |
| POST | `/api/push/subscribe` | 5682 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5719 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5746 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5780 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5814 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5838 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5852 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5878 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5898 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 6036 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 6066 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 6087 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 6121 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys` | 6125 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 6129 | admin | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 6135 | admin | authenticateAdmin |
| GET | `/api/admin/api-usage` | 6139 | admin | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 6148 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 6167 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 6195 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 6232 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6300 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6412 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6488 | merchant-user | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6493 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6498 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6503 | public | — |
| GET | `/api/subscription` | 6538 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6561 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6624 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6667 | merchant-user | authenticateToken |
| GET | `/api/team` | 6698 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6719 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6780 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6862 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6882 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6930 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6962 | public | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 6998 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 7028 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 7057 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 7103 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7194 | provider-webhook | billingCardCallback |
| GET | `/api/billing/card/callback` | 7204 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 7205 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 7208 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7228 | public | — |
| GET | `/uploads/:folder/:name` | 7268 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7484 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7495 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7509 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7520 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7536 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7549 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7562 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7578 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7586 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7597 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7615 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7634 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7649 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7679 | merchant-user | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7725 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7754 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7796 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7811 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7822 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7836 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7856 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 7942 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 7966 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/pay` | 7982 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 8044 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 8117 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 8148 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 8201 | public | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 8228 | provider-webhook | — |
| ALL | `/api/windcave/trades-notification` | 8245 | provider-webhook | — |
| POST | `/api/webhooks/whatsapp` | 8265 | provider-webhook | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 8302 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8327 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8337 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8354 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8364 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8377 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8393 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8410 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8418 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8428 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8437 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8448 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8457 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8467 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8477 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8487 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8494 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8571 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8598 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8611 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8622 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8638 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8683 | public | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8732 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8742 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8794 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8807 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8844 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8861 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8878 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8888 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8895 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8913 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8926 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 8940 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8950 | cron | authorizeCronRequest |
