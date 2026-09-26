# R1-T2 route inventory — generated 2026-09-26 @ `a394cae3f252b34a4884cdbb951cd0ed0a76ead6`

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
| GET | `/robots.txt` | 431 | public | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 450 | public | generatePaymentUrl( |
| GET | `/nfc/:merchantId` | 464 | public | — |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 471 | public | — |
| GET | `/sitemap.xml` | 486 | admin | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 569 | public | — |
| GET | `/api/auth/google/callback` | 590 | public | — |
| POST | `/api/auth/google/session` | 739 | public | — |
| POST | `/api/auth/sign-out-everywhere` | 762 | merchant-user | authenticateToken |
| POST | `/api/auth/login` | 807 | public | — |
| POST | `/api/auth/forgot-password` | 864 | public | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 904 | public | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 944 | public | validateResetToken( |
| GET | `/api/admin/request-origin` | 963 | admin | authenticateAdmin |
| POST | `/api/admin/auth/login` | 983 | public | — |
| GET | `/api/auth/me` | 1071 | merchant-user | authenticateToken |
| GET | `/api/tutorial/state` | 1112 | merchant-user | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1142 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1179 | merchant-user | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1200 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1281 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1294 | public | — |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1301 | public | — |
| GET | `/api/merchants/:id` | 1349 | public | publicMerchantBrandDto( |
| GET | `/api/merchants/:id/profile` | 1367 | merchant-user | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1389 | public | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1416 | public | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1444 | public | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1541 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1554 | public | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1584 | public | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1660 | public | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1960 | public | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 2012 | public | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2143 | public | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2177 | provider-webhook | — |
| GET | `/api/merchants/:id/active-transaction` | 2194 | merchant-user | authenticateToken, checkMerchantOwnership, publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2311 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2392 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2452 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2594 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| PATCH | `/api/transactions/:id/split-enabled` | 2638 | merchant-user | authenticateToken |
| GET | `/api/split-payments/:id` | 2683 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2702 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2755 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2845 | public | — |
| POST | `/api/transactions/:id/pay` | 2859 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3114 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3128 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3166 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3239 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3260 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3321 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3363 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3378 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3404 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3425 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3491 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3531 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3576 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3594 | admin | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3607 | admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3623 | admin | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3674 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3681 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3707 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3789 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3793 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3821 | merchant-user | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3854 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3928 | merchant-user | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3983 | merchant-user | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 4026 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 4043 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 4059 | merchant-user | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4110 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4145 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 4179 | public | — |
| GET | `/api/admin/subscription-revenue` | 4197 | admin | authenticateAdmin |
| ALL | `/api/windcave/notification` | 4208 | provider-webhook | — |
| GET | `/api/windcave/callback` | 4330 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/status` | 4523 | public | — |
| GET | `/api/admin/analytics` | 4536 | admin | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4609 | admin | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4645 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4682 | admin | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4747 | admin | authenticateAdmin |
| POST | `/api/admin/merchants` | 4824 | admin | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4835 | admin | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4863 | admin | authenticateAdmin |
| GET | `/api/admin/merchants` | 4870 | admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4880 | admin | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 4896 | admin | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 4920 | admin | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 4951 | admin | authenticateAdmin |
| POST | `/api/admin/test-email` | 5009 | admin | authenticateAdmin |
| GET | `/api/admin/email-status` | 5032 | admin | authenticateAdmin |
| POST | `/api/merchants/verify` | 5059 | public | storage.verifyMerchant( |
| GET | `/api/merchants/:id/email-status` | 5110 | public | — |
| POST | `/api/auth/confirm-email` | 5133 | public | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 5260 | public | — |
| POST | `/api/info-pack-leads` | 5297 | public | — |
| POST | `/api/merchants/signup` | 5350 | public | — |
| PUT | `/api/merchants/:id/business-details` | 5452 | merchant-user | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5518 | admin | authenticateAdmin |
| GET | `/api/merchants/:id/events` | 5581 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5657 | public | — |
| GET | `/api/push/vapid-key` | 5681 | public | — |
| POST | `/api/push/subscribe` | 5691 | merchant-user | authenticateToken |
| POST | `/api/push/unsubscribe` | 5728 | merchant-user | authenticateToken |
| POST | `/api/push/native-subscribe` | 5755 | merchant-user | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5789 | merchant-user | authenticateToken |
| GET | `/api/push/status` | 5823 | merchant-user | authenticateToken |
| GET | `/api/push/preferences` | 5847 | merchant-user | authenticateToken |
| PUT | `/api/push/preferences` | 5861 | merchant-user | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5887 | merchant-user | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5907 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 6045 | merchant-user | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 6075 | merchant-user | authenticateToken |
| GET | `/api/refunds/:refundId` | 6096 | merchant-user | authenticateToken |
| GET | `/api/admin/api-keys` | 6130 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys` | 6134 | admin | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 6138 | admin | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 6144 | admin | authenticateAdmin |
| GET | `/api/admin/api-usage` | 6148 | admin | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 6157 | merchant-user | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 6176 | merchant-user | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 6204 | merchant-user | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 6241 | api-key | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6309 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6421 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6494 | merchant-user | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6499 | merchant-user | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6504 | merchant-user | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6509 | public | — |
| GET | `/api/subscription` | 6544 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6567 | merchant-user | authenticateToken |
| POST | `/api/subscription/cancel` | 6630 | merchant-user | authenticateToken |
| POST | `/api/subscription/resume` | 6673 | merchant-user | authenticateToken |
| GET | `/api/team` | 6704 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6725 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6786 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6868 | merchant-user | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6888 | merchant-user | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6936 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6968 | public | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 7004 | merchant-user | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 7034 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 7063 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 7109 | merchant-user | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7200 | provider-webhook | billingCardCallback |
| GET | `/api/billing/card/callback` | 7210 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 7211 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 7214 | merchant-user | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7234 | public | — |
| GET | `/uploads/:folder/:name` | 7274 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7490 | merchant-user | authenticateToken |
| POST | `/api/property/tenants` | 7501 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:id` | 7515 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7526 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7542 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7555 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7568 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7584 | merchant-user | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7592 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7603 | merchant-user | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7621 | merchant-user | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7640 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7655 | merchant-user | authenticateToken |
| POST | `/api/property/invoices/document` | 7685 | merchant-user | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7731 | merchant-user | authenticateToken |
| POST | `/api/property/invoices` | 7760 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7802 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7817 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7828 | merchant-user | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7842 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7862 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 7948 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 7972 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/pay` | 7988 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 8050 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 8123 | public | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 8154 | public | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 8207 | public | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 8234 | provider-webhook | — |
| ALL | `/api/windcave/trades-notification` | 8251 | provider-webhook | — |
| POST | `/api/webhooks/whatsapp` | 8271 | provider-webhook | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 8307 | merchant-user | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8332 | merchant-user | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8342 | merchant-user | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8359 | merchant-user | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8369 | merchant-user | authenticateToken |
| GET | `/api/trades/gst-settings` | 8382 | merchant-user | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8398 | merchant-user | authenticateToken |
| GET | `/api/trades/clients` | 8415 | merchant-user | authenticateToken |
| POST | `/api/trades/clients` | 8423 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id` | 8433 | merchant-user | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8442 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8453 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8462 | merchant-user | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8472 | merchant-user | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8482 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes` | 8492 | merchant-user | authenticateToken |
| POST | `/api/trades/quotes` | 8499 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8576 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8603 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8616 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8627 | merchant-user | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8643 | public | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8688 | public | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8737 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices` | 8747 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8799 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8812 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8849 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8866 | merchant-user | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8883 | merchant-user | authenticateToken |
| GET | `/api/trades/schedules` | 8893 | merchant-user | authenticateToken |
| POST | `/api/trades/schedules` | 8900 | merchant-user | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8918 | merchant-user | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8931 | merchant-user | authenticateToken |
| GET | `/api/internal/cron/status` | 8945 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8955 | cron | authorizeCronRequest |

## Per-route facts

What each handler does, read from its syntax tree (server/route-facts.ts): its
middleware, how each path and query value is parsed ("raw": no parser), body
validation, authorization checks and tenant/role comparisons, storage methods,
calls that leave the process, statuses, response projections (DTOs), error text
put into responses, and capability, entitlement, rate-limit and idempotency
calls. Helpers in the same file are followed; imported functions are not (they
are classified by name). Facts, not judgments.

### GET `/robots.txt`

- statuses: `200`

### GET `/nfc/:merchantId/stone/:stoneId`

- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- statuses: `200`, `400`
- helpers: `nfcRedirectHtml`

### GET `/nfc/:merchantId`

- params: `merchantId: strictPositiveIntegerParam`
- statuses: `400`, `410`

### GET `/.well-known/apple-developer-merchantid-domain-association`

- statuses: `200`

### GET `/sitemap.xml`

- statuses: `200`

### GET `/api/auth/google`

- statuses: `302`
- helpers: `googleSignInError`

### GET `/api/auth/google/callback`

- query: `code: raw`, `error: raw`, `state: raw`
- authChecks: `compares existingLogin.merchantId !== existingMerchant.id`, `compares existingLogin.role !== "owner"`, `verifyGoogleSignInState`
- storageMethods: `createAuthHandoffCode`, `createMerchantWithPassword`, `getMerchantByEmail`, `getUserByEmail`, `settleAuthThrottle`, `takeAuthThrottleSlot`, `updateMerchant`
- sideEffects: `outbound http: fetch`
- statuses: `302`
- rateLimits: `tooManyAttempts`
- helpers: `googleSignInError`

### POST `/api/auth/google/session`

- storageMethods: `consumeAuthHandoffCode`
- statuses: `200`, `401`, `403`, `500`
- helpers: `expired`

### POST `/api/auth/sign-out-everywhere`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === 'admin'`
- storageMethods: `advanceUserSessionVersion`, `deactivatePushSubscriptionsForLogin`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `204`, `401`, `403`, `404`, `500`, `503`

### POST `/api/auth/login`

- body: `schema: loginSchema`
- storageMethods: `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`, `signInAddressBuckets`

### POST `/api/auth/forgot-password`

- body: `schema: forgotPasswordSchema`
- storageMethods: `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

### POST `/api/auth/reset-password`

- body: `schema: resetPasswordSchema`
- authChecks: `resetPassword`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `forgetAuthThrottle`, `getUserById`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `500`
- errorTextInResponse: `validation.error.errors`, `validation.error.issues`

### GET `/api/auth/validate-reset-token/:token`

- params: `token: raw`
- authChecks: `validateResetToken`
- statuses: `200`, `500`

### GET `/api/admin/request-origin`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `503`
- helpers: `authenticateAdmin`

### POST `/api/admin/auth/login`

- body: `schema: loginSchema`
- storageMethods: `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`, `signInAddressBuckets`

### GET `/api/auth/me`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`, `getOrCreateSubscription`
- statuses: `200`, `401`, `403`, `500`, `503`
- entitlementGates: `billingCardIsReady`

### GET `/api/tutorial/state`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `getMerchant`, `getMerchantTutorialProgress`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### PATCH `/api/tutorial/pages/:pageKey`

- middleware: `authenticateToken`
- params: `pageKey: isTutorialPageKey | raw`
- body: `schema: tutorialProgressSchema`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `getMerchant`, `upsertMerchantTutorialProgress`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

### POST `/api/tutorial/restart`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `restartMerchantTutorial`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### POST `/api/merchants/:id/onboarding`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `fields: businessDescription, director, estimatedAnnualTurnover, gstNumber, nzbn, websiteUrl`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `getMerchant`, `updateMerchant`
- sideEffects: `email: sendEmail`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `escHtml`

### GET `/api/admin/auth/me`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `503`
- helpers: `authenticateAdmin`

### GET `/api/merchants/:id/qr`

- params: `id: strictPositiveIntegerParam`
- statuses: `400`, `410`

### GET `/api/merchants/:id/stone/:stoneId/qr`

- params: `id: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- query: `download: raw`, `size: strictBoundedIntegerQueryParam`
- authChecks: `compares stone.merchantId !== merchantId`
- storageMethods: `getTaptStone`
- statuses: `200`, `400`, `404`, `500`

### GET `/api/merchants/:id`

- params: `id: strictPositiveIntegerParam`
- storageMethods: `getMerchant`
- statuses: `200`, `400`, `404`, `500`
- dtos: `publicMerchantBrandDto`

### GET `/api/merchants/:id/profile`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `getMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `memberMerchantSettingsDto`, `ownerMerchantDto`

### GET `/api/pay/t/:token`

- params: `token: raw`
- authChecks: `resolvePaymentToken`
- storageMethods: `getMerchant`
- statuses: `200`, `404`, `410`, `429`, `500`
- dtos: `tokenPaymentDto`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`

### GET `/api/pay/t/:token/qr`

- params: `token: raw`
- query: `size: strictBoundedIntegerQueryParam`
- authChecks: `resolvePaymentToken`
- statuses: `200`, `400`, `404`, `429`, `500`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`

### POST `/api/pay/t/:token/split`

- params: `token: raw`
- body: `schema: z.object({ totalSplits: z.number().int().min(2).max(10), }).strict()`
- authChecks: `resolvePaymentToken`
- storageMethods: `createBillSplit`, `getMerchant`
- sideEffects: `live update: sseBroker.broadcast`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- dtos: `tokenPaymentDto`
- errorTextInResponse: `error.message`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `broadcastToStone`, `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`

### GET `/api/pay/t/:token/receipt`

- params: `token: raw`
- query: `share: raw`
- authChecks: `loadTokenReceipt`, `resolvePaymentToken`
- storageMethods: `getMerchant`, `getSplitPaymentsByTransaction`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- dtos: `tokenReceiptDto`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `sendTokenReceiptError`, `setPaymentTokenHeaders`

### POST `/api/pay/t/:token/receipt-pdf`

- params: `token: raw`
- query: `share: raw`
- authChecks: `loadTokenReceipt`, `resolvePaymentToken`
- storageMethods: `getMerchant`, `getSplitPaymentsByTransaction`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `sendTokenReceiptError`, `setPaymentTokenHeaders`

### GET `/api/pay/t/:token/receipt-qr`

- params: `token: raw`
- query: `share: raw`, `size: strictBoundedIntegerQueryParam`
- authChecks: `loadTokenReceipt`, `resolvePaymentToken`
- storageMethods: `getMerchant`, `getSplitPaymentsByTransaction`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `sendTokenReceiptError`, `setPaymentTokenHeaders`

### POST `/api/pay/t/:token/session`

- params: `token: raw`
- body: `schema: tokenSessionRequestSchema`
- authChecks: `resolvePaymentToken`
- storageMethods: `getMerchant`, `getNextPendingSplit`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: createWindcaveSession`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `404`, `409`, `410`, `429`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- idempotency: `claim`, `claimFinalization`
- helpers: `broadcastToStone`, `cacheTokenAttemptSession`, `persistTokenOutcome`, `reconcileExpiredTokenAttempt`, `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`, `tokenAttemptOutcome`

### POST `/api/pay/t/:token/hosted-fields-complete`

- params: `token: raw`
- body: `schema: tokenCompletionBaseSchema.extend({ paymentMethod: z.enum(["card", "apple_pay"]).optional().default("card"), }).strict()`
- authChecks: `prepareTokenCompletion`, `resolvePaymentToken`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- idempotency: `claimFinalization`
- helpers: `broadcastToStone`, `persistTokenOutcome`, `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`, `tokenAttemptOutcome`

### POST `/api/pay/t/:token/googlepay-complete`

- params: `token: raw`
- body: `schema: tokenCompletionBaseSchema.extend({ googlePayToken: z.record(z.unknown()).optional(), }).strict()`
- authChecks: `prepareTokenCompletion`, `resolvePaymentToken`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `provider: submitGooglePayToken`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- idempotency: `claimFinalization`
- helpers: `assertWindcaveUrl`, `broadcastToStone`, `persistTokenOutcome`, `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`, `tokenAttemptOutcome`

### GET `/api/pay/return/:state`

- params: `state: raw`
- query: `result: raw`, `source: raw`
- authChecks: `paymentAttempts.resolveReturnState`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`, `303`, `404`, `410`, `429`, `500`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- idempotency: `claimFinalization`
- helpers: `broadcastToStone`, `persistTokenOutcome`, `reconcileTokenReturnState`, `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`, `tokenAttemptOutcome`

### ALL `/api/pay/notification/:state`

- params: `state: raw`
- query: `result: raw`
- body: `fields: result`
- authChecks: `paymentAttempts.resolveReturnState`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`, `429`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- idempotency: `claimFinalization`
- helpers: `broadcastToStone`, `persistTokenOutcome`, `reconcileTokenReturnState`, `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`

### GET `/api/merchants/:id/active-transaction`

- params: `id: strictPositiveIntegerParam`
- query: `stoneId: strictPositiveIntegerQueryParam`
- authChecks: `authenticateToken`, `checkMerchantOwnership`, `compares stone.merchantId !== merchantId`, `compares transaction.merchantId !== merchantId`
- storageMethods: `getActiveTransactionByMerchant`, `getTaptStone`
- statuses: `200`, `400`, `401`, `403`, `410`, `429`, `500`, `503`
- dtos: `ownerTransactionDto`, `publicTransactionDto`
- rateLimits: `checkRateLimit`
- helpers: `checkRateLimit`

### POST `/api/transactions`

- middleware: `authenticateToken`
- body: `schema: retailTransactionCreateRequestSchema`
- authChecks: `checkMerchantOwnership`, `compares stone.merchantId !== validation.data.merchantId`
- storageMethods: `getOrCreateSubscription`, `getTaptStone`
- sideEffects: `live update: sseBroker.broadcast`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `401`, `402`, `403`, `500`, `503`
- dtos: `ownerTransactionDto`
- errorTextInResponse: `validation.error.errors`
- capabilityGates: `config.features.newRetailPayments`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `broadcastToStone`, `requireBillingCard`

### POST `/api/transactions/cash-sale`

- middleware: `authenticateToken`
- body: `fields: itemName, merchantId, price, stoneId`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createTransaction`, `getOrCreateSubscription`
- sideEffects: `live update: sseBroker.broadcast`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `401`, `402`, `403`, `500`, `503`
- dtos: `ownerTransactionDto`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `broadcastToStone`, `requireBillingCard`

### POST `/api/transactions/tap-to-pay`

- middleware: `authenticateToken`
- body: `fields: amount, merchantId, transactionId, windcaveToken`
- authChecks: `checkMerchantOwnership`, `compares pendingTransaction.merchantId !== mid`
- storageMethods: `createTransaction`, `getActiveTransactionByMerchant`, `getOrCreateSubscription`, `getTransaction`, `updateTransactionPaymentMethod`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: createAttendedSession`, `provider: submitTapToPayToken`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `409`, `500`, `502`, `503`
- capabilityGates: `config.features.tapToPay`, `isWindcaveConfigured`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `broadcastToStone`, `requireBillingCard`

### POST `/api/transactions/:id/split`

- params: `id: strictPositiveIntegerParam`
- body: `fields: totalSplits`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `createBillSplit`, `getTransaction`
- sideEffects: `live update: sseBroker.broadcast`
- statuses: `200`, `400`, `404`, `409`, `500`
- dtos: `publicTransactionDto`
- errorTextInResponse: `error.message`
- helpers: `broadcastToStone`

### PATCH `/api/transactions/:id/split-enabled`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `fields: splitEnabled`
- authChecks: `compares transaction.merchantId !== user?.merchantId`, `compares user?.role !== 'admin'`
- storageMethods: `getTransaction`, `updateTransactionSplitEnabled`
- sideEffects: `live update: sseBroker.broadcast`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- dtos: `ownerTransactionDto`
- helpers: `broadcastToStone`

### GET `/api/split-payments/:id`

- params: `id: strictPositiveIntegerParam`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getSplitPaymentById`, `getTransaction`
- statuses: `200`, `400`, `404`, `500`
- dtos: `publicSplitPaymentDto`

### POST `/api/transactions/:id/cancel`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTransaction`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerTransactionDto`
- helpers: `broadcastToStone`

### POST `/api/merchants/:merchantId/nfc-pay`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- body: `fields: amount, deviceId, itemName, nfcCapabilities`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createTransaction`, `getMerchant`, `getOrCreateSubscription`, `updateTransactionNfcSession`
- sideEffects: `live update: sseBroker.broadcast`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- dtos: `ownerTransactionDto`
- capabilityGates: `config.features.tapToPay`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `broadcastToStone`, `requireBillingCard`

### GET `/api/nfc/capabilities`

- statuses: `200`
- capabilityGates: `config.features.tapToPay`

### POST `/api/transactions/:id/pay`

- params: `id: strictPositiveIntegerParam`
- body: `schema: paymentRequestSchema`
- authChecks: `compares stone.merchantId !== transaction.merchantId`, `compares transaction.merchantId !== requestMerchantId`, `isTokenAddressedTransaction`
- storageMethods: `getMerchant`, `getNextPendingSplit`, `getTaptStone`, `getTransaction`, `updateTransactionStatus`, `updateTransactionWindcaveSession`
- sideEffects: `live update: sseBroker.broadcast`, `provider: createWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `403`, `404`, `409`, `429`, `500`, `503`
- errorTextInResponse: `validation.error.errors`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `checkRateLimit`
- helpers: `broadcastToStone`, `checkRateLimit`

### GET `/api/windcave/env`

- statuses: `200`

### POST `/api/transactions/:id/hosted-fields-complete`

- params: `id: strictPositiveIntegerParam`
- body: `fields: paymentMethod, sessionId`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getNextPendingSplit`, `getTransaction`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionPaymentMethod`, `updateTransactionSessionState`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `403`, `404`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- helpers: `broadcastToStone`, `finaliseHostedPayment`

### POST `/api/transactions/:id/googlepay-complete`

- params: `id: strictPositiveIntegerParam`
- body: `fields: googlePayToken, sessionId`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getNextPendingSplit`, `getTransaction`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionPaymentMethod`, `updateTransactionSessionState`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `provider: submitGooglePayToken`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `403`, `404`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- helpers: `assertWindcaveUrl`, `broadcastToStone`, `finaliseHostedPayment`

### GET `/api/transactions/:id`

- params: `id: strictPositiveIntegerParam`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getTransaction`
- statuses: `200`, `400`, `404`, `500`
- dtos: `publicTransactionDto`

### POST `/api/transactions/:id/receipt-pdf`

- params: `id: strictPositiveIntegerParam`
- query: `splitId: raw | strictPositiveIntegerQueryParam`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getMerchant`, `getSplitPaymentById`, `getSplitPaymentsByTransaction`, `getTransaction`
- statuses: `200`, `400`, `404`, `500`

### GET `/api/transactions/:id/receipt-qr`

- params: `id: strictPositiveIntegerParam`
- query: `size: strictBoundedIntegerQueryParam`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getTransaction`
- statuses: `200`, `400`, `404`, `500`

### GET `/api/merchants/:id/analytics`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getMerchantAnalytics`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/merchants/:id/revenue-over-time`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `days: strictBoundedIntegerQueryParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getRevenueOverTime`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/merchants/:id/analytics/export`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `endDate: raw`, `startDate: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getMerchantAnalyticsWithDateRange`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/merchants/:id/export/csv`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `endDate: raw`, `startDate: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTransactionsByMerchantWithDateRange`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/merchants/:id/export/pdf`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `endDate: raw`, `startDate: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getMerchant`, `getMerchantAnalyticsWithDateRange`, `getTransactionsByMerchantWithDateRange`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### POST `/api/admin/merchants/:id/verify`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchantStatus`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

### POST `/api/admin/merchants/:id/set-active`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchantStatus`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/merchants/:id/transactions`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### PATCH `/api/admin/merchants/:id/windcave-merchant-id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- body: `fields: windcaveMerchantId`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

### POST `/api/admin/merchants/:id/activate`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- body: `fields: password`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `verifyMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `checked.error.issues`
- helpers: `authenticateAdmin`

### PUT `/api/merchants/:id/rates`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `410`, `503`

### PUT `/api/merchants/:id/details`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateMerchantDetailsSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchantDetails`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

### PUT `/api/merchants/:id/change-password`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: changePasswordSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `getUserById`, `settleAuthThrottle`, `takeAuthThrottleSlot`, `updateUserPassword`
- sideEffects: `audit log: logSecurityEvent`, `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `401`, `403`, `404`, `429`, `500`, `503`
- errorTextInResponse: `validation.error.errors`, `validation.error.issues`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

### PUT `/api/merchants/:id/bank-account`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `410`, `503`

### PUT `/api/merchants/:id/theme`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateThemeSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchantTheme`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

### PUT `/api/merchants/:id/daily-goal`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateDailyGoalSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

### PUT `/api/merchants/:id`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `parseResult.error.errors`

### POST `/api/merchants/:id/logo`

- middleware: `authenticateToken`, `requireLogoOwnership`, `logoUpload.single(…)`
- params: `id: strictPositiveIntegerParam`
- body: `file`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `deleteUploadedFile`, `saveUploadedFile`, `updateMerchantLogoUrl`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `requireLogoOwnership`, `saveUploadedFile`

### DELETE `/api/merchants/:id/logo`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `deleteUploadedFile`, `getMerchant`, `updateMerchantLogoUrl`
- sideEffects: `file system: fs.existsSync`, `file system: fs.unlinkSync`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### GET `/api/merchants/:id/transactions`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTransactionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/merchants/:id/tapt-stones`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTaptStonesByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### POST `/api/merchants/:id/tapt-stones`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createNextTaptStone`, `getMerchant`, `updateTaptStoneUrls`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `error.message`

### PUT `/api/merchants/:merchantId/tapt-stones/:stoneId`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- body: `fields: name`
- authChecks: `checkMerchantOwnership`, `compares existingStone.merchantId !== merchantId`
- storageMethods: `getTaptStone`, `updateTaptStone`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### DELETE `/api/merchants/:merchantId/tapt-stones/:stoneId`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`, `compares existingStone.merchantId !== merchantId`
- storageMethods: `deleteTaptStone`, `getTaptStone`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### GET `/api/tapt-stones/:id`

- params: `id: strictPositiveIntegerParam`
- storageMethods: `getTaptStone`
- statuses: `200`, `400`, `404`, `500`

### GET `/api/admin/subscription-revenue`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getSubscriptionRevenue`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### ALL `/api/windcave/notification`

- middleware: `express.urlencoded(…)`, `express.json(…)`
- query: `sessionId: raw`, `sessionid: raw`
- body: `fields: sessionId, sessionid`, `whole body: console.warn`
- storageMethods: `getNextPendingSplit`, `getTransaction`, `getTransactionByWindcaveSessionId`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionSessionState`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`
- capabilityGates: `isWindcaveConfigured`
- helpers: `broadcastToStone`

### GET `/api/windcave/callback`

- query: `result: raw`, `sessionId: raw`, `sessionid: raw`, `transactionId: raw`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getNextPendingSplit`, `getTransaction`, `getTransactionByWindcaveSessionId`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionSessionState`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `302`, `400`, `404`
- capabilityGates: `isWindcaveConfigured`
- helpers: `broadcastToStone`

### GET `/api/windcave/status`

- statuses: `200`
- capabilityGates: `isWindcaveConfigured`

### GET `/api/admin/analytics`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`, `getMerchantAnalytics`, `getSubscriptionRevenue`, `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/revenue-over-time`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`, `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/payment-method-breakdown`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`, `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/ga4-detailed`

- middleware: `authenticateAdmin`
- query: `range: raw`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error?.message`
- helpers: `authenticateAdmin`

### GET `/api/admin/ga4-metrics`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error?.message`
- helpers: `authenticateAdmin`

### POST `/api/admin/merchants`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `410`, `503`
- helpers: `authenticateAdmin`

### PUT `/api/admin/merchants/:id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchantDetails`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `adminMerchantDto`
- helpers: `authenticateAdmin`

### POST `/api/merchants/:id/test-payment-link`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `400`, `401`, `403`, `410`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/merchants`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/merchants/:id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `adminMerchantDto`
- helpers: `authenticateAdmin`

### DELETE `/api/admin/merchants/:id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `deleteMerchant`, `getMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

### POST `/api/admin/clear-merchants`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchantByEmail`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### POST `/api/admin/resend-verification`

- middleware: `authenticateAdmin`
- body: `fields: email`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchantByEmail`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

### POST `/api/admin/test-email`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`, `email: sendEmail`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/email-status`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

### POST `/api/merchants/verify`

- body: `fields: password, token`
- storageMethods: `verifyMerchant`
- statuses: `200`, `400`, `500`
- errorTextInResponse: `checked.error.issues`

### GET `/api/merchants/:id/email-status`

- params: `id: strictPositiveIntegerParam`
- storageMethods: `getMerchant`
- statuses: `200`, `400`, `404`, `500`

### POST `/api/auth/confirm-email`

- body: `fields: password, token`
- authChecks: `storage.getMerchantByToken`
- storageMethods: `confirmMerchantEmail`, `getMerchantByToken`, `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `email: sendEmail`
- statuses: `200`, `400`, `429`, `500`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `escHtml`, `refuseTooManyAttempts`

### POST `/api/auth/resend-confirmation`

- body: `fields: email, merchantId`
- storageMethods: `getMerchant`, `getMerchantByEmail`, `takeAuthThrottleSlot`
- statuses: `200`, `400`, `429`, `500`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

### POST `/api/info-pack-leads`

- body: `schema: createInfoPackLeadSchema`
- storageMethods: `createInfoPackLead`
- sideEffects: `email: sendEmail`
- statuses: `201`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.issues`
- rateLimits: `checkResendRateLimit`, `resendRateLimitMap.get`, `resendRateLimitMap.set`
- helpers: `checkResendRateLimit`

### POST `/api/merchants/signup`

- body: `schema: publicSignupSchema`
- storageMethods: `createMerchantWithSignup`, `getMerchantByEmail`, `getUserByEmail`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.issues`
- rateLimits: `checkRateLimit`
- helpers: `checkRateLimit`, `replyToSignup`

### PUT `/api/merchants/:id/business-details`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: businessDetailsSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `getMerchant`, `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `validation.error.issues`

### POST `/api/admin/merchants/signup`

- middleware: `authenticateAdmin`
- body: `schema: createMerchantSchema`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `createMerchantWithPassword`, `getMerchantByEmail`, `getUserByEmail`, `updateMerchantDetails`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `409`, `500`, `503`
- errorTextInResponse: `validation.error.issues`
- helpers: `authenticateAdmin`

### GET `/api/merchants/:id/events`

- params: `id: strictPositiveIntegerParam`
- query: `stoneId: strictPositiveIntegerQueryParam`, `token: checked`
- authChecks: `authenticateToken`, `checkMerchantOwnership`, `compares authenticatedRequest.user?.role === "admin"`, `compares stone.merchantId !== merchantId`
- storageMethods: `getTaptStone`
- sideEffects: `live update: sseBroker.subscribe`
- statuses: `200`, `400`, `401`, `403`, `404`, `410`, `500`, `503`

### GET `/api/push/capabilities`

- statuses: `200`

### GET `/api/push/vapid-key`

- statuses: `200`, `503`

### POST `/api/push/subscribe`

- middleware: `authenticateToken`
- body: `fields: subscription`
- storageMethods: `createPushSubscription`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

### POST `/api/push/unsubscribe`

- middleware: `authenticateToken`
- body: `fields: endpoint`
- storageMethods: `deactivatePushSubscriptionByEndpoint`, `getPushSubscriptionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### POST `/api/push/native-subscribe`

- middleware: `authenticateToken`
- body: `fields: deviceToken`
- storageMethods: `createPushSubscription`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

### POST `/api/push/native-unsubscribe`

- middleware: `authenticateToken`
- storageMethods: `deactivateNativePushSubscriptionsForLogin`, `deactivatePushSubscriptionByEndpoint`, `getPushSubscriptionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/push/status`

- middleware: `authenticateToken`
- storageMethods: `getPushNotificationPreferences`, `getPushSubscriptionsByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

### GET `/api/push/preferences`

- middleware: `authenticateToken`
- storageMethods: `getPushNotificationPreferences`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

### PUT `/api/push/preferences`

- middleware: `authenticateToken`
- body: `schema: pushNotificationPreferencesSchema`
- storageMethods: `updatePushNotificationPreferences`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`
- errorTextInResponse: `parsed.error.errors`

### POST `/api/merchants/:id/clear-transactions`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `compares req.user?.role === "admin"`, `isAccountOwner`
- statuses: `400`, `401`, `403`, `410`, `503`

### POST `/api/transactions/:transactionId/refunds`

- middleware: `authenticateToken`
- params: `transactionId: strictPositiveIntegerParam`
- authChecks: `compares transaction.merchantId !== merchantId`, `isAccountOwner`
- storageMethods: `createRefund`, `getTransaction`, `releaseRefundAmount`, `reserveRefundAmount`, `updateRefundStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: createWindcaveRefund`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `502`, `503`
- errorTextInResponse: `validation.error.errors`
- capabilityGates: `config.features.refundInitiation`, `isWindcaveConfigured`
- helpers: `broadcastToStone`

### GET `/api/transactions/:transactionId/refunds`

- middleware: `authenticateToken`
- params: `transactionId: strictPositiveIntegerParam`
- authChecks: `compares transaction.merchantId !== merchantId`
- storageMethods: `getRefundsByTransaction`, `getTransaction`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### GET `/api/merchants/:merchantId/refunds`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- authChecks: `compares req.user?.role !== 'admin'`, `compares userMerchantId !== merchantId`
- storageMethods: `getRefundsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/refunds/:refundId`

- middleware: `authenticateToken`
- params: `refundId: strictPositiveIntegerParam`
- authChecks: `compares refund.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `getRefund`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### GET `/api/admin/api-keys`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

### POST `/api/admin/api-keys`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

### POST `/api/admin/api-keys/:keyId/revoke`

- middleware: `authenticateAdmin`
- params: `keyId: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `400`, `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/api-metrics`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

### GET `/api/admin/api-usage`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

### GET `/api/merchants/:merchantId/stock-items`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- authChecks: `compares req.user?.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `getStockItemsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### POST `/api/merchants/:merchantId/stock-items`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- body: `schema: createStockItemSchema`
- authChecks: `compares req.user?.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `createStockItem`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error.errors`

### PUT `/api/merchants/:merchantId/stock-items/:itemId`

- middleware: `authenticateToken`
- params: `itemId: strictPositiveIntegerParam`, `merchantId: strictPositiveIntegerParam`
- body: `schema: updateStockItemSchema`
- authChecks: `compares existingItem.merchantId !== merchantId`, `compares req.user?.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `getStockItem`, `updateStockItem`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `error.errors`

### DELETE `/api/merchants/:merchantId/stock-items/:itemId`

- middleware: `authenticateToken`
- params: `itemId: strictPositiveIntegerParam`, `merchantId: strictPositiveIntegerParam`
- authChecks: `compares existingItem.merchantId !== merchantId`, `compares req.user?.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `deleteStockItem`, `getStockItem`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### POST `/api/v1/transactions`

- middleware: `requireEcommerceApi`, `authenticateApiKey`
- body: `schema: apiV1CreateTransactionSchema`
- storageMethods: `createWebhookDelivery`, `getApiKeyByKey`, `getOrCreateSubscription`, `logApiRequest`, `updateApiKeyLastUsed`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `503`
- dtos: `publicTransactionDto`
- errorTextInResponse: `validation.error.errors`
- capabilityGates: `config.features.ecommerceApi`, `config.features.newRetailPayments`, `requireEcommerceApi`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `authenticateApiKey`, `requireBillingCard`, `requireEcommerceApi`

### GET `/api/v1/transactions/:id`

- middleware: `requireEcommerceApi`, `authenticateApiKey`
- params: `id: raw | strictPositiveIntegerParam`
- authChecks: `compares transaction.merchantId !== req.apiKey.merchantId`
- storageMethods: `getApiKeyByKey`, `getTransaction`, `logApiRequest`, `updateApiKeyLastUsed`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`
- capabilityGates: `config.features.ecommerceApi`, `requireEcommerceApi`
- helpers: `authenticateApiKey`, `requireEcommerceApi`

### POST `/api/payments/apple-pay/validate`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `404`, `503`

### POST `/api/payments/apple-pay/process`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `503`

### POST `/api/payments/google-pay/process`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `503`

### GET `/api/payments/digital-wallet/config`

- sideEffects: `provider: windcaveService.isConfigured`
- statuses: `200`, `500`

### GET `/api/subscription`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `countSeatsInUse`, `getOrCreateSubscription`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `subscriptionDto`

### PUT `/api/subscription/plan`

- middleware: `authenticateToken`
- body: `fields: planId`
- authChecks: `compares req.user?.role === "member"`
- storageMethods: `changeSubscriptionPlan`, `countSeatsInUse`, `getOrCreateSubscription`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `409`, `422`, `500`, `502`, `503`
- dtos: `subscriptionDto`

### POST `/api/subscription/cancel`

- middleware: `authenticateToken`
- body: `fields: reason`
- authChecks: `compares req.user?.role === "member"`
- storageMethods: `cancelSubscription`, `countSeatsInUse`, `getOrCreateSubscription`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- dtos: `subscriptionDto`

### POST `/api/subscription/resume`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === "member"`
- storageMethods: `countSeatsInUse`, `resumeSubscription`
- statuses: `200`, `400`, `401`, `403`, `409`, `500`, `503`
- dtos: `subscriptionDto`

### GET `/api/team`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `countSeatsInUse`, `getOrCreateSubscription`, `getTeamMembers`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### POST `/api/team/invite`

- middleware: `authenticateToken`
- body: `schema: inviteTeamMemberSchema`
- authChecks: `isAccountOwner`
- storageMethods: `getMerchant`, `getOrCreateSubscription`, `inviteTeamMember`, `revokeTeamInvite`
- sideEffects: `email: sendTeamInviteEmail`
- statuses: `201`, `400`, `401`, `403`, `409`, `500`, `502`, `503`
- dtos: `teamMemberDto`
- errorTextInResponse: `parsed.error.errors`

### POST `/api/team/:userId/resend`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- authChecks: `compares previous.merchantId !== merchantId`, `isAccountOwner`
- storageMethods: `getMerchant`, `getUserById`, `revokeTeamInvite`, `rotateTeamInvite`
- sideEffects: `email: sendTeamInviteEmail`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `429`, `500`, `502`, `503`
- dtos: `teamMemberDto`
- rateLimits: `checkResendRateLimit`, `resendRateLimitMap.get`, `resendRateLimitMap.set`
- helpers: `checkResendRateLimit`

### DELETE `/api/team/:userId/invite`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- authChecks: `isAccountOwner`
- storageMethods: `revokeTeamInvite`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### PUT `/api/team/:userId/status`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- body: `fields: status`
- authChecks: `isAccountOwner`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `setTeamMemberStatus`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- dtos: `teamMemberDto`

### DELETE `/api/team/:userId`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- authChecks: `compares member.merchantId !== merchantId`, `compares member.role === "owner"`, `isAccountOwner`
- storageMethods: `getUserById`, `removeTeamMember`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`

### POST `/api/team/accept-invite`

- body: `schema: acceptInviteSchema`
- authChecks: `storage.getUserByInviteToken`
- storageMethods: `activateInvitedUser`, `getUserByInviteToken`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `500`
- errorTextInResponse: `parsed.error.errors`, `parsed.error.issues`
- helpers: `invalid`

### GET `/api/subscription/billing-history`

- middleware: `authenticateToken`
- query: `limit: strictBoundedIntegerQueryParam`
- authChecks: `isAccountOwner`
- storageMethods: `getBillingHistory`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/billing/card`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `getMerchant`, `getOrCreateSubscription`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### POST `/api/billing/card/session`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `bindSubscriptionCardSession`, `getMerchant`, `getOrCreateSubscription`
- sideEffects: `provider: createCardStorageSession`
- statuses: `200`, `401`, `403`, `404`, `500`, `502`, `503`
- capabilityGates: `isWindcaveConfigured`

### POST `/api/billing/card/confirm`

- middleware: `authenticateToken`
- body: `fields: sessionId`
- authChecks: `isAccountOwner`
- storageMethods: `completeSubscriptionCardSetup`, `countSeatsInUse`, `getSubscription`
- sideEffects: `provider: queryStoredCardSession`
- statuses: `200`, `202`, `400`, `401`, `403`, `404`, `409`, `422`, `500`, `502`, `503`
- dtos: `subscriptionDto`

### ALL `/api/billing/card/notification`

- statuses: `200`

### GET `/api/billing/card/callback`

- query: `result: raw`
- body: `fields: result`
- statuses: `302`
- helpers: `billingCardCallback`, `safeBillingCardCallbackResult`

### POST `/api/billing/card/callback`

- query: `result: raw`
- body: `fields: result`
- statuses: `302`
- helpers: `billingCardCallback`, `safeBillingCardCallbackResult`

### DELETE `/api/billing/card`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `removeSubscriptionCard`
- statuses: `200`, `401`, `403`, `409`, `500`, `503`

### POST `/api/board-builder/submit`

- body: `fields: businessName, layout, pdf, stoneId, submitterEmail, submitterName`
- statuses: `200`, `400`, `500`

### GET `/uploads/:folder/:name`

- params: `folder: raw`, `name: raw`
- storageMethods: `getUploadedFile`
- sideEffects: `file system: fs.existsSync`
- statuses: `200`, `400`, `404`, `500`

### GET `/api/property/tenants`

- middleware: `authenticateToken`
- query: `includeArchived: raw`, `search: raw`
- storageMethods: `getTenantProfilesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

### POST `/api/property/tenants`

- middleware: `authenticateToken`
- body: `schema: createTenantProfileSchema`
- storageMethods: `createTenantProfile`, `logTransactionEvent`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`

### GET `/api/property/tenants/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTenantProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### PUT `/api/property/tenants/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: updateTenantProfileSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTenantProfile`, `updateTenantProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### POST `/api/property/tenants/:id/archive`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `archiveTenantProfile`, `getTenantProfile`, `logTransactionEvent`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### POST `/api/property/tenants/:id/unarchive`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTenantProfile`, `logTransactionEvent`, `unarchiveTenantProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### GET `/api/property/tenants/:id/events`

- middleware: `authenticateToken`
- params: `id: raw`
- query: `limit: strictBoundedIntegerQueryParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTenantProfile`, `getTransactionEventsByTenant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### GET `/api/property/schedules`

- middleware: `authenticateToken`
- storageMethods: `getActiveSchedulesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

### GET `/api/property/tenants/:tenantId/schedules`

- middleware: `authenticateToken`
- params: `tenantId: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getActiveSchedulesByTenant`, `getTenantProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### POST `/api/property/tenants/:tenantId/schedules`

- middleware: `authenticateToken`
- params: `tenantId: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createActiveSchedule`, `getOrCreateSubscription`, `getTenantProfile`, `logTransactionEvent`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

### PUT `/api/property/schedules/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: updateActiveScheduleSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getActiveSchedule`, `logTransactionEvent`, `updateActiveSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### DELETE `/api/property/schedules/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getActiveSchedule`, `logTransactionEvent`, `terminateActiveSchedule`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### GET `/api/property/invoices`

- middleware: `authenticateToken`
- query: `status: raw`, `tenantProfileId: raw`
- storageMethods: `getInvoiceRentRequestsByMerchant`, `getTenantProfile`
- statuses: `200`, `401`, `403`, `500`, `503`

### POST `/api/property/invoices/document`

- middleware: `authenticateToken`, `invoiceDocUpload.single(…)`
- body: `file`
- storageMethods: `saveUploadedFile`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- helpers: `saveUploadedFile`

### GET `/api/invoice-documents/:name`

- middleware: `authenticateToken`
- params: `name: raw`
- authChecks: `isValidatedPlatformAdmin`
- storageMethods: `getUploadedFile`, `getUploadedFileForMerchant`, `recordInvoiceDocumentAdminRead`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`
- helpers: `sendPrivateDocument`

### POST `/api/property/invoices`

- middleware: `authenticateToken`
- body: `fields: tenantProfileId`, `schema: createAdHocInvoiceSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createInvoiceRentRequest`, `getInvoiceRentRequest`, `getLiveInvoiceByTenant`, `getOrCreateSubscription`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `uploadedFileOwnedByMerchant`
- sideEffects: `email: resendInvoiceEmail`
- statuses: `200`, `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `generateInvoiceToken`, `requireBillingCard`, `requireOwnedInvoiceDocument`

### POST `/api/property/invoices/:id/resend`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getInvoiceRentRequest`, `getOrCreateSubscription`
- sideEffects: `email: resendInvoiceEmail`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `500`, `502`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

### GET `/api/property/invoices/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getInvoiceRentRequest`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### POST `/api/property/invoices/:id/void`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getInvoiceRentRequest`, `logTransactionEvent`, `updateInvoiceRentRequest`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### POST `/api/property/invoices/:id/mark-paid-external`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: markInvoicePaidExternalSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getInvoiceRentRequest`, `logTransactionEvent`, `updateInvoiceRentRequest`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### GET `/api/checkout/resolve/:token`

- params: `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `getActiveSchedule`, `getClientProfile`, `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `getMerchant`, `getQuote`, `getTenantProfile`, `uploadedFileOwnedByMerchant`
- statuses: `200`, `404`, `410`, `429`, `500`
- rateLimits: `tokenRateLimit`
- helpers: `getCheckoutParty`, `invoiceHasCheckoutDocument`, `tokenRateLimit`

### GET `/api/checkout/document/:token`

- params: `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `consumeInvoiceDocumentReadLimit`, `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `getUploadedFileForMerchant`
- statuses: `200`, `404`, `410`, `429`, `500`, `503`
- helpers: `sendPrivateDocument`

### POST `/api/checkout/:token/split`

- params: `token: raw`
- body: `fields: count`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `updateInvoiceRentRequest`, `updateJobInvoice`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- rateLimits: `tokenRateLimit`
- helpers: `tokenRateLimit`, `updateCheckoutInvoice`

### POST `/api/checkout/pay`

- body: `fields: payerEmail, token`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getClientProfile`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: createWindcaveSession`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`, `502`, `503`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `tokenRateLimit`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `getCheckoutParty`, `sendRentGstInvoices`, `tokenRateLimit`, `updateCheckoutInvoice`

### POST `/api/checkout/:token/session`

- params: `token: raw`
- body: `fields: payerEmail`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getClientProfile`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: createWindcaveSession`
- statuses: `200`, `404`, `409`, `429`, `500`, `502`, `503`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `tokenRateLimit`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `getCheckoutParty`, `sendRentGstInvoices`, `tokenRateLimit`, `updateCheckoutInvoice`

### POST `/api/checkout/:token/hosted-fields-complete`

- params: `token: raw`
- body: `fields: sessionId`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `200`, `400`, `403`, `404`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `sendRentGstInvoices`

### POST `/api/checkout/:token/googlepay-complete`

- params: `token: raw`
- body: `fields: googlePayToken, sessionId`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`, `provider: submitGooglePayToken`
- statuses: `200`, `400`, `403`, `404`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `assertWindcaveUrl`, `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `sendRentGstInvoices`

### GET `/api/checkout/callback`

- query: `result: raw`, `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `302`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `sendRentGstInvoices`

### ALL `/api/windcave/rent-notification`

- middleware: `express.urlencoded(…)`, `express.json(…)`
- query: `sessionId: raw`, `sessionid: raw`
- body: `fields: sessionId, sessionid`
- storageMethods: `atomicClaimSplitShare`, `getInvoiceRentRequest`, `getInvoiceRentRequestByWindcaveSessionId`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`
- sideEffects: `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `200`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimSplitShare`
- helpers: `finalizeRentInvoice`, `sendRentGstInvoices`

### ALL `/api/windcave/trades-notification`

- middleware: `express.urlencoded(…)`, `express.json(…)`
- query: `sessionId: raw`, `sessionid: raw`
- body: `fields: sessionId, sessionid`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getJobInvoice`, `getJobInvoiceByWindcaveSessionId`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `200`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `sendRentGstInvoices`

### POST `/api/webhooks/whatsapp`

- middleware: `express.json(…)`
- storageMethods: `createJobEvent`, `getInvoiceRentRequestByWhatsappMessageId`, `getJobInvoiceByWhatsappMessageId`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- statuses: `200`
- helpers: `presentedSecretMatches`

### PUT `/api/merchants/:merchantId/sector`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- body: `schema: z.object({ sector: z.enum(["retail", "propertyManagement"]) })`
- authChecks: `checkMerchantOwnership`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/property/reminder-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`
- helpers: `reminderSettingsOf`

### PUT `/api/property/reminder-settings`

- middleware: `authenticateToken`
- body: `schema: updateRentReminderSettingsSchema`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- helpers: `reminderSettingsOf`

### GET `/api/trades/reminder-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### PUT `/api/trades/reminder-settings`

- middleware: `authenticateToken`
- body: `schema: updateTradeReminderSettingsSchema`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/trades/gst-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### PUT `/api/trades/gst-settings`

- middleware: `authenticateToken`
- body: `schema: updateTradeGstSettingsSchema`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

### GET `/api/trades/clients`

- middleware: `authenticateToken`
- storageMethods: `getClientProfilesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

### POST `/api/trades/clients`

- middleware: `authenticateToken`
- body: `schema: createClientProfileSchema`
- storageMethods: `createClientProfile`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

### GET `/api/trades/clients/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares row.merchantId !== merchantId`
- storageMethods: `getClientProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### PUT `/api/trades/clients/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: updateClientProfileSchema`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `updateClientProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

### POST `/api/trades/clients/:id/archive`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `archiveClientProfile`, `getClientProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### POST `/api/trades/clients/:id/unarchive`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `unarchiveClientProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### POST `/api/trades/clients/:id/promote`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `updateClientProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

### GET `/api/trades/clients/:id/events`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `getJobEventsByClient`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### GET `/api/trades/quotes`

- middleware: `authenticateToken`
- query: `status: raw`
- storageMethods: `getQuotesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

### POST `/api/trades/quotes`

- middleware: `authenticateToken`
- body: `schema: createQuoteSchema`
- authChecks: `compares client.merchantId !== merchantId`
- storageMethods: `createClientProfile`, `createJobEvent`, `createQuote`, `getClientProfile`, `getMerchant`, `getOrCreateSubscription`, `uploadedFileOwnedByMerchant`
- sideEffects: `email/SMS: sendTradeQuote`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `generateInvoiceToken`, `requireBillingCard`, `requireOwnedInvoiceDocument`

### GET `/api/trades/quotes/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares row.merchantId !== merchantId`
- storageMethods: `getQuote`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### GET `/api/trades/quotes/:id/pdf`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares quote.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `getMerchant`, `getQuote`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`
- helpers: `streamQuotePdf`

### GET `/api/trades/quotes/token/:token/pdf`

- params: `token: raw`
- authChecks: `storage.getQuoteByToken`
- storageMethods: `getClientProfile`, `getMerchant`, `getQuoteByToken`
- statuses: `200`, `404`, `500`
- helpers: `streamQuotePdf`

### POST `/api/trades/quotes/:id/resend`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares quote.merchantId !== merchantId`
- storageMethods: `getOrCreateSubscription`, `getQuote`
- sideEffects: `email/SMS: sendTradeQuote`
- statuses: `200`, `401`, `402`, `403`, `404`, `409`, `500`, `502`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

### GET `/api/trades/quotes/token/:token`

- params: `token: raw`
- authChecks: `storage.getQuoteByToken`
- storageMethods: `createJobEvent`, `getClientProfile`, `getJobInvoicesByQuote`, `getMerchant`, `getQuoteByToken`, `updateQuote`
- statuses: `200`, `404`, `500`

### POST `/api/trades/quotes/token/:token/respond`

- params: `token: raw`
- body: `schema: acceptQuoteSchema`
- authChecks: `storage.getQuoteByToken`
- storageMethods: `createJobEvent`, `createJobInvoice`, `getOrCreateSubscription`, `getQuoteByToken`, `updateQuote`
- sideEffects: `email/SMS: resendTradeInvoice`, `email: tellBusinessQuoteAcceptanceBlocked`
- statuses: `200`, `400`, `402`, `404`, `409`, `410`, `500`
- errorTextInResponse: `parsed.error.errors`
- entitlementGates: `billingCardIsReady`
- helpers: `generateInvoiceToken`

### GET `/api/trades/invoices`

- middleware: `authenticateToken`
- query: `clientProfileId: raw`, `status: raw`
- storageMethods: `getJobInvoicesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

### POST `/api/trades/invoices`

- middleware: `authenticateToken`
- body: `schema: createJobInvoiceSchema`
- authChecks: `compares client.merchantId !== merchantId`, `compares linkedQuote.merchantId !== merchantId`
- storageMethods: `createClientProfile`, `createJobEvent`, `createJobInvoice`, `getClientProfile`, `getOrCreateSubscription`, `getQuote`, `uploadedFileOwnedByMerchant`
- sideEffects: `email/SMS: resendTradeInvoice`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `generateInvoiceToken`, `requireBillingCard`, `requireOwnedInvoiceDocument`

### POST `/api/trades/invoices/:id/resend`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares invoice.merchantId !== merchantId`
- storageMethods: `getJobInvoice`, `getOrCreateSubscription`
- sideEffects: `email/SMS: resendTradeInvoice`
- statuses: `200`, `401`, `402`, `403`, `404`, `500`, `502`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

### POST `/api/trades/invoices/:id/send-balance`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares dep.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `createJobInvoice`, `getJobInvoice`, `getJobInvoicesByMerchant`, `getOrCreateSubscription`, `getQuote`
- sideEffects: `email/SMS: resendTradeInvoice`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `409`, `500`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `generateInvoiceToken`, `requireBillingCard`

### POST `/api/trades/invoices/:id/mark-paid-external`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: markJobPaidExternalSchema`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobInvoice`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

### POST `/api/trades/invoices/:id/complete`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobInvoice`, `updateJobInvoice`
- statuses: `200`, `401`, `403`, `404`, `409`, `500`, `503`

### POST `/api/trades/invoices/:id/void`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `getJobInvoice`, `updateJobInvoice`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### GET `/api/trades/schedules`

- middleware: `authenticateToken`
- storageMethods: `getJobSchedulesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

### POST `/api/trades/schedules`

- middleware: `authenticateToken`
- body: `schema: createJobScheduleSchema`
- authChecks: `compares client.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `createJobSchedule`, `getClientProfile`, `getOrCreateSubscription`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

### PUT `/api/trades/schedules/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: updateJobScheduleSchema`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobSchedule`, `updateJobSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

### DELETE `/api/trades/schedules/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobSchedule`, `terminateJobSchedule`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

### GET `/api/internal/cron/status`

- authChecks: `authorizeCronRequest`
- statuses: `200`, `401`, `503`

### POST `/api/internal/cron`

- authChecks: `authorizeCronRequest`
- statuses: `401`, `409`, `500`, `503`
- helpers: `runPass`
