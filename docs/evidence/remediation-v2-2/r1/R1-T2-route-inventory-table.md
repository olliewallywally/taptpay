# R1-T2 route inventory — generated 2026-09-25 @ `da90d1a11d48858ee7a37997a7b316134875d2f6`

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
| GET | `/nfc/:merchantId` | 453 | public | generatePaymentUrl( |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 463 | public | — |
| GET | `/sitemap.xml` | 478 | admin | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 561 | public | — |
| GET | `/api/auth/google/callback` | 582 | public | — |
| POST | `/api/auth/google/session` | 731 | public | — |
| POST | `/api/auth/sign-out-everywhere` | 754 | merchant-user | authenticateToken |
| POST | `/api/auth/login` | 799 | public | — |
| POST | `/api/auth/forgot-password` | 856 | public | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 896 | public | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 936 | public | validateResetToken( |
| GET | `/api/admin/request-origin` | 955 | admin | authenticateAdmin |
| POST | `/api/admin/auth/login` | 975 | public | — |
| GET | `/api/auth/me` | 1063 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 1104 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1134 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1171 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1192 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1273 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1285 | public | generatePaymentUrl( |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1330 | public | — |
| GET | `/api/merchants/:id` | 1378 | public | publicMerchantBrandDto(, generatePaymentUrl( |
| GET | `/api/merchants/:id/profile` | 1407 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner, generatePaymentUrl( |
| GET | `/api/pay/t/:token` | 1434 | public | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1461 | public | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1489 | public | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1586 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1599 | public | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1629 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1705 | public | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 2005 | public | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 2057 | public | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2188 | public | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2222 | provider-webhook | — |
| GET | `/api/merchants/:id/active-transaction` | 2239 | merchant-user | authenticateToken, checkMerchantOwnership, publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2356 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/transactions/cash-sale` | 2438 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2498 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2640 | public | isTokenAddressedTransaction(, publicTransactionDto(, generatePaymentUrl( |
| PATCH | `/api/transactions/:id/split-enabled` | 2688 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2733 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2752 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2809 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2899 | public | — |
| POST | `/api/transactions/:id/pay` | 2913 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3168 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3182 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3220 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3293 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3314 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3375 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3417 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3432 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3458 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3479 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3545 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3585 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3630 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3648 | admin | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3661 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3677 | admin | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3728 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3735 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3761 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3843 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3847 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3875 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3908 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3982 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 4037 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 4080 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 4097 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 4113 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4164 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4199 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 4233 | public | — |
| GET | `/api/admin/subscription-revenue` | 4251 | admin | authenticateAdmin |
| ALL | `/api/windcave/notification` | 4262 | provider-webhook | — |
| GET | `/api/windcave/callback` | 4384 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/status` | 4577 | public | — |
| GET | `/api/admin/analytics` | 4590 | admin | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4663 | admin | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4699 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4736 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4801 | admin | authenticateAdmin |
| POST | `/api/admin/merchants` | 4878 | admin | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4889 | admin | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4915 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/admin/merchants` | 4956 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4966 | admin | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 4982 | admin | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 5006 | admin | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 5037 | admin | authenticateAdmin |
| POST | `/api/admin/test-email` | 5095 | admin | authenticateAdmin |
| GET | `/api/admin/email-status` | 5118 | admin | authenticateAdmin |
| POST | `/api/merchants/verify` | 5145 | public | storage.verifyMerchant( |
| GET | `/api/merchants/:id/email-status` | 5196 | public | — |
| POST | `/api/auth/confirm-email` | 5219 | public | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 5346 | public | — |
| POST | `/api/info-pack-leads` | 5383 | public | — |
| POST | `/api/merchants/signup` | 5436 | public | — |
| PUT | `/api/merchants/:id/business-details` | 5538 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5604 | admin | authenticateAdmin, generatePaymentUrl( |
| GET | `/api/merchants/:id/events` | 5676 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5752 | public | — |
| GET | `/api/push/vapid-key` | 5776 | public | — |
| POST | `/api/push/subscribe` | 5786 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5823 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5850 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5884 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5918 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5942 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5956 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5982 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 6002 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 6140 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 6170 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 6191 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 6225 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys` | 6229 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 6233 | admin | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 6239 | admin | authenticateAdmin |
| GET | `/api/admin/api-usage` | 6243 | admin | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 6252 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 6271 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 6299 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 6336 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6404 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6516 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6592 | merchant-user | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6597 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6602 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6607 | public | — |
| GET | `/api/subscription` | 6642 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6665 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6728 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6771 | merchant-user | authenticateToken |
| GET | `/api/team` | 6802 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6823 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6884 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6966 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6986 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 7034 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 7066 | public | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 7102 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 7132 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 7161 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 7207 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7298 | provider-webhook | billingCardCallback |
| GET | `/api/billing/card/callback` | 7308 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 7309 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 7312 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7332 | public | — |
| GET | `/uploads/:folder/:name` | 7372 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7588 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7599 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7613 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7624 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7640 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7653 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7666 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7682 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7690 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7701 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7719 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7738 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7753 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7783 | merchant-user | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7829 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7858 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7900 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7915 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7926 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7940 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7960 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 8046 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 8070 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/pay` | 8086 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 8148 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 8221 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 8252 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 8305 | public | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 8332 | provider-webhook | — |
| ALL | `/api/windcave/trades-notification` | 8349 | provider-webhook | — |
| POST | `/api/webhooks/whatsapp` | 8369 | provider-webhook | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 8406 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8431 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8441 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8458 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8468 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8481 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8497 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8514 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8522 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8532 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8541 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8552 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8561 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8571 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8581 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8591 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8598 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8675 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8702 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8715 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8726 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8742 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8787 | public | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8836 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8846 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8898 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8911 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8948 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8965 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8982 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8992 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8999 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 9017 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 9030 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 9044 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 9054 | cron | authorizeCronRequest |
