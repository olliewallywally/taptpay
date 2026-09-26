# R1-T2 route inventory — generated 2026-09-26 @ `cee1276a2a7323a9b9ecd73566b7762678820206`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **223** (93 GET, 91 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE).

By principal: **public**: 63, **admin**: 30, **merchant-user**: 119, **provider-webhook**: 6, **api-key**: 3, **cron**: 2.

Unclassified (no known gate marker, no known public-design marker, and no
curated allowlist entry found near the handler — needs a human read, not
necessarily a bug): **0**.

## Review

31 of 223 routes reviewed (server/route-review.ts); 192 pending.
A reviewed route's principal below is the review's; a pending one's is the heuristic, marked "(heuristic)".

### Open findings

- **ALL /api/windcave/notification:** pending → processing is a read then a write, not an atomic claim: two simultaneous notifications for one session can both query the provider and both settle it (a second count increment, a second push). Plan 22.7 / R3 (C20) owns the single atomic finaliser.
- **ALL /api/windcave/notification:** Logs the raw query (with the session id), and the query and body when no session id is found, to the server log.
- **POST /api/v1/transactions:** webhook_url from the caller is stored as a webhook delivery row. Nothing delivers those rows today; any future delivery worker must restrict destinations (server-side request forgery).
- **POST /api/v1/transactions:** No rate limit and no idempotency key on an API that creates payment links (behind FEATURE_ECOMMERCE_API, off by default; plan 15.5 decides the API's future).
- **ALL /api/windcave/rent-notification:** finalizeRentInvoice marks a single (unsplit) payment paid after a plain read: this notification and the browser's return arriving together can both record it, logging Payment_Received twice and sending the GST invoice twice. Plan 22.7 / R3 (C20).
- **ALL /api/windcave/trades-notification:** finalizeTradeInvoice marks a single payment paid after a plain read: a notification and the browser's return arriving together can both record it and send the payment invoice twice. Plan 22.7 / R3 (C20).
- **POST /api/internal/cron:** Overlapping runs are refused only within one server process (the in-memory cronRunning flag): two instances can run the passes at once. Plan 13.3 (durable cron leases).
- **GET /api/pay/t/:token/receipt:** share is parsed with Number(), which accepts forms such as 1e0, 0x1 and ' 1' that the plan's strict parser (§8.4) refuses; the same on the receipt, its PDF and its QR.
- **POST /api/transactions/:id/split:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **GET /api/split-payments/:id:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **POST /api/transactions/:id/pay:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **POST /api/transactions/:id/hosted-fields-complete:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **POST /api/transactions/:id/hosted-fields-complete:** Gap 11 (known, escalated 2026-09-13): the finaliser re-settles on every call with the bound session, and after a share it resets the session to pending, so one approved session can complete the next share too. Closed by moving onto the payment_attempts engine (C3).
- **POST /api/transactions/:id/hosted-fields-complete:** A split share is marked paid without comparing what the provider charged with the share. Until 2026-09-26 the pay route let the customer choose the amount, so every share of a $100 sale could be paid with $0.01 and the sale showed fully paid (shown in the harness); the owner chose exact shares only, and the pay route now opens every session for exactly what is owed. What remains is one session settling twice (gap 11's replay; the read-then-write settlement, R3/C20); the amount check itself is R2/R3 (plan lines 870, 1511).
- **POST /api/transactions/:id/googlepay-complete:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **POST /api/transactions/:id/googlepay-complete:** Gap 11 (known, escalated 2026-09-13): the finaliser re-settles on every call with the bound session, and after a share it resets the session to pending, so one approved session can complete the next share too. Closed by moving onto the payment_attempts engine (C3).
- **POST /api/transactions/:id/googlepay-complete:** A split share is marked paid without comparing what the provider charged with the share. Until 2026-09-26 the pay route let the customer choose the amount, so every share of a $100 sale could be paid with $0.01 and the sale showed fully paid (shown in the harness); the owner chose exact shares only, and the pay route now opens every session for exactly what is owed. What remains is one session settling twice (gap 11's replay; the read-then-write settlement, R3/C20); the amount check itself is R2/R3 (plan lines 870, 1511).
- **GET /api/transactions/:id:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it. With no rate limit, counting through the numbers lists every such sale of every business: item, price, time, business and board.
- **POST /api/transactions/:id/receipt-pdf:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **GET /api/transactions/:id/receipt-qr:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **GET /api/windcave/callback:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **GET /api/windcave/callback:** Settles by a read then a write, not a claim, racing the notification (plan 22.7 / R3, C20).

## Routes

| Method | Path | Line | Principal | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 431 | public (heuristic) | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 450 | public (heuristic) | generatePaymentUrl( |
| GET | `/nfc/:merchantId` | 464 | public (heuristic) | — |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 471 | public (heuristic) | — |
| GET | `/sitemap.xml` | 486 | admin (heuristic) | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 569 | public (heuristic) | — |
| GET | `/api/auth/google/callback` | 590 | public (heuristic) | — |
| POST | `/api/auth/google/session` | 739 | public (heuristic) | — |
| POST | `/api/auth/sign-out-everywhere` | 762 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/auth/login` | 807 | public (heuristic) | — |
| POST | `/api/auth/forgot-password` | 864 | public (heuristic) | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 904 | public (heuristic) | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 944 | public (heuristic) | validateResetToken( |
| GET | `/api/admin/request-origin` | 963 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/auth/login` | 983 | public (heuristic) | — |
| GET | `/api/auth/me` | 1071 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/tutorial/state` | 1112 | merchant-user (heuristic) | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1142 | merchant-user (heuristic) | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1179 | merchant-user (heuristic) | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1200 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1281 | admin (heuristic) | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1294 | public (heuristic) | — |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1301 | public (heuristic) | — |
| GET | `/api/merchants/:id` | 1349 | public (heuristic) | publicMerchantBrandDto( |
| GET | `/api/merchants/:id/profile` | 1367 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1389 | public-bearer | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1416 | public-bearer | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1444 | public-bearer | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1541 | public-bearer | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1554 | public-bearer | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1584 | public-bearer | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1660 | public-bearer | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1960 | public-bearer | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 2012 | public-bearer | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2143 | public-bearer | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2177 | provider | — |
| GET | `/api/merchants/:id/active-transaction` | 2194 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership, publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2311 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2392 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2452 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2594 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| PATCH | `/api/transactions/:id/split-enabled` | 2645 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/split-payments/:id` | 2690 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2709 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2762 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2852 | public (heuristic) | — |
| POST | `/api/transactions/:id/pay` | 2866 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3118 | public (heuristic) | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3132 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3170 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3243 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3264 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3325 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3367 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3382 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3408 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3429 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3495 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3535 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3580 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3598 | admin (heuristic) | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3611 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3627 | admin (heuristic) | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3678 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3685 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3711 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3793 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3797 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3825 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3858 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3932 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3987 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 4030 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 4047 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 4063 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4114 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4149 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/tapt-stones/:id` | 4183 | public (heuristic) | — |
| GET | `/api/admin/subscription-revenue` | 4201 | admin (heuristic) | authenticateAdmin |
| ALL | `/api/windcave/notification` | 4212 | provider | — |
| GET | `/api/windcave/callback` | 4334 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/status` | 4529 | public (heuristic) | — |
| GET | `/api/admin/analytics` | 4542 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4615 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4651 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4688 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4753 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/merchants` | 4830 | admin (heuristic) | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4841 | admin (heuristic) | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4869 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/merchants` | 4876 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4886 | admin (heuristic) | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 4902 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 4926 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 4957 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/test-email` | 5015 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/email-status` | 5038 | admin (heuristic) | authenticateAdmin |
| POST | `/api/merchants/verify` | 5065 | public (heuristic) | storage.verifyMerchant( |
| GET | `/api/merchants/:id/email-status` | 5116 | public (heuristic) | — |
| POST | `/api/auth/confirm-email` | 5139 | public (heuristic) | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 5266 | public (heuristic) | — |
| POST | `/api/info-pack-leads` | 5303 | public (heuristic) | — |
| POST | `/api/merchants/signup` | 5356 | public (heuristic) | — |
| PUT | `/api/merchants/:id/business-details` | 5458 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| POST | `/api/admin/merchants/signup` | 5524 | admin (heuristic) | authenticateAdmin |
| GET | `/api/merchants/:id/events` | 5587 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5663 | public (heuristic) | — |
| GET | `/api/push/vapid-key` | 5687 | public (heuristic) | — |
| POST | `/api/push/subscribe` | 5697 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/push/unsubscribe` | 5734 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/push/native-subscribe` | 5761 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5795 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/push/status` | 5829 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/push/preferences` | 5853 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/push/preferences` | 5867 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5893 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5913 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 6051 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 6081 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/refunds/:refundId` | 6102 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/admin/api-keys` | 6136 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/api-keys` | 6140 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 6144 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 6150 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/api-usage` | 6154 | admin (heuristic) | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 6163 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 6182 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 6210 | merchant-user (heuristic) | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 6247 | api-key (heuristic) | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6315 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6427 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6500 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6505 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6510 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/payments/digital-wallet/config` | 6515 | public (heuristic) | — |
| GET | `/api/subscription` | 6550 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6573 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/subscription/cancel` | 6636 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/subscription/resume` | 6679 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/team` | 6710 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6731 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6792 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6874 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6894 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6942 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6974 | public (heuristic) | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 7010 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 7040 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 7069 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 7115 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7206 | provider | billingCardCallback |
| GET | `/api/billing/card/callback` | 7216 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 7217 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 7220 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7240 | public (heuristic) | — |
| GET | `/uploads/:folder/:name` | 7280 | public (heuristic) | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7496 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/property/tenants` | 7507 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/property/tenants/:id` | 7521 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7532 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7548 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7561 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7574 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7590 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7598 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7609 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7627 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7646 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7661 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/property/invoices/document` | 7691 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7737 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/property/invoices` | 7766 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7808 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7823 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7834 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7848 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7868 | public (heuristic) | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 7954 | public (heuristic) | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 7978 | public (heuristic) | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/pay` | 7994 | public (heuristic) | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 8056 | public (heuristic) | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 8129 | public (heuristic) | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 8160 | public (heuristic) | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 8213 | public (heuristic) | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 8240 | provider | — |
| ALL | `/api/windcave/trades-notification` | 8257 | provider | — |
| POST | `/api/webhooks/whatsapp` | 8277 | provider | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 8313 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8338 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8348 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8365 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8375 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/gst-settings` | 8388 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8404 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/clients` | 8421 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/clients` | 8429 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/clients/:id` | 8439 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8448 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8459 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8468 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8478 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8488 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes` | 8498 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/quotes` | 8505 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8582 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8609 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8622 | public (heuristic) | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8633 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8649 | public (heuristic) | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8694 | public (heuristic) | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8743 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices` | 8753 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8805 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8818 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8855 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8872 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8889 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/schedules` | 8899 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/schedules` | 8906 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8924 | merchant-user (heuristic) | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8937 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/internal/cron/status` | 8951 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8961 | cron | authorizeCronRequest |

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

Review pending.

### GET `/nfc/:merchantId/stone/:stoneId`

- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- statuses: `200`, `400`
- helpers: `nfcRedirectHtml`

Review pending.

### GET `/nfc/:merchantId`

- params: `merchantId: strictPositiveIntegerParam`
- statuses: `400`, `410`

Review pending.

### GET `/.well-known/apple-developer-merchantid-domain-association`

- statuses: `200`

Review pending.

### GET `/sitemap.xml`

- statuses: `200`

Review pending.

### GET `/api/auth/google`

- statuses: `302`
- helpers: `googleSignInError`

Review pending.

### GET `/api/auth/google/callback`

- query: `code: raw`, `error: raw`, `state: raw`
- authChecks: `compares existingLogin.merchantId !== existingMerchant.id`, `compares existingLogin.role !== "owner"`, `verifyGoogleSignInState`
- storageMethods: `createAuthHandoffCode`, `createMerchantWithPassword`, `getMerchantByEmail`, `getUserByEmail`, `settleAuthThrottle`, `takeAuthThrottleSlot`, `updateMerchant`
- sideEffects: `outbound http: fetch`
- statuses: `302`
- rateLimits: `tooManyAttempts`
- helpers: `googleSignInError`

Review pending.

### POST `/api/auth/google/session`

- storageMethods: `consumeAuthHandoffCode`
- statuses: `200`, `401`, `403`, `500`
- helpers: `expired`

Review pending.

### POST `/api/auth/sign-out-everywhere`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === 'admin'`
- storageMethods: `advanceUserSessionVersion`, `deactivatePushSubscriptionsForLogin`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `204`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/auth/login`

- body: `schema: loginSchema`
- storageMethods: `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`, `signInAddressBuckets`

Review pending.

### POST `/api/auth/forgot-password`

- body: `schema: forgotPasswordSchema`
- storageMethods: `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

Review pending.

### POST `/api/auth/reset-password`

- body: `schema: resetPasswordSchema`
- authChecks: `resetPassword`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `forgetAuthThrottle`, `getUserById`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `500`
- errorTextInResponse: `validation.error.errors`, `validation.error.issues`

Review pending.

### GET `/api/auth/validate-reset-token/:token`

- params: `token: raw`
- authChecks: `validateResetToken`
- statuses: `200`, `500`

Review pending.

### GET `/api/admin/request-origin`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/auth/login`

- body: `schema: loginSchema`
- storageMethods: `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`, `signInAddressBuckets`

Review pending.

### GET `/api/auth/me`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`, `getOrCreateSubscription`
- statuses: `200`, `401`, `403`, `500`, `503`
- entitlementGates: `billingCardIsReady`

Review pending.

### GET `/api/tutorial/state`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `getMerchant`, `getMerchantTutorialProgress`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### PATCH `/api/tutorial/pages/:pageKey`

- middleware: `authenticateToken`
- params: `pageKey: isTutorialPageKey | raw`
- body: `schema: tutorialProgressSchema`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `getMerchant`, `upsertMerchantTutorialProgress`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Review pending.

### POST `/api/tutorial/restart`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `restartMerchantTutorial`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/merchants/:id/onboarding`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `fields: businessDescription, director, estimatedAnnualTurnover, gstNumber, nzbn, websiteUrl`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `getMerchant`, `updateMerchant`
- sideEffects: `email: sendEmail`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `escHtml`

Review pending.

### GET `/api/admin/auth/me`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/merchants/:id/qr`

- params: `id: strictPositiveIntegerParam`
- statuses: `400`, `410`

Review pending.

### GET `/api/merchants/:id/stone/:stoneId/qr`

- params: `id: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- query: `download: raw`, `size: strictBoundedIntegerQueryParam`
- authChecks: `compares stone.merchantId !== merchantId`
- storageMethods: `getTaptStone`
- statuses: `200`, `400`, `404`, `500`

Review pending.

### GET `/api/merchants/:id`

- params: `id: strictPositiveIntegerParam`
- storageMethods: `getMerchant`
- statuses: `200`, `400`, `404`, `500`
- dtos: `publicMerchantBrandDto`

Review pending.

### GET `/api/merchants/:id/profile`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `getMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `memberMerchantSettingsDto`, `ownerMerchantDto`

Review pending.

### GET `/api/pay/t/:token`

- params: `token: raw`
- authChecks: `resolvePaymentToken`
- storageMethods: `getMerchant`
- statuses: `200`, `404`, `410`, `429`, `500`
- dtos: `tokenPaymentDto`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; nothing else is read
- **Idempotency:** read-only
- **Success:** tokenPaymentDto: the sale's item, price, status and split state, and the business's public details (name, contact, address, GST number, NZBN, logo, theme); a failed or cancelled sale answers 410 with the same
- **Error disclosure:** fixed
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else
- **Replay:** read-only
- **Rate:** requirePaymentTokenRateLimit (the resolve family: 120 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

### GET `/api/pay/t/:token/qr`

- params: `token: raw`
- query: `size: strictBoundedIntegerQueryParam`
- authChecks: `resolvePaymentToken`
- statuses: `200`, `400`, `404`, `429`, `500`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `setPaymentTokenHeaders`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; size: strictBoundedIntegerQueryParam (100 to 800, default 300)
- **Idempotency:** read-only
- **Success:** a PNG QR code of this link's own address (/pay/t/<token>), never cached
- **Error disclosure:** fixed
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else
- **Replay:** read-only
- **Rate:** requirePaymentTokenRateLimit (the qr family: 30 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; body: { totalSplits: a whole number from 2 to 10 }, nothing else (strict)
- **Idempotency:** only while the sale is pending and the business allowed splitting; storage.createBillSplit sets it up atomically and a sale already split is refused (BillSplitConflictError, 409)
- **Side effects:** a live update to the business's screens (broadcastToStone)
- **Success:** tokenPaymentDto of the split sale; no split-payment id is returned
- **Error disclosure:** domain-errors
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else
- **Replay:** a second split is refused (409)
- **Rate:** requirePaymentTokenRateLimit (the session family: 20 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

### GET `/api/pay/t/:token/receipt`

- params: `token: raw`
- query: `share: raw`
- authChecks: `loadTokenReceipt`, `resolvePaymentToken`
- storageMethods: `getMerchant`, `getSplitPaymentsByTransaction`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- dtos: `tokenReceiptDto`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `sendTokenReceiptError`, `setPaymentTokenHeaders`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404; for a split sale, share picks one of its completed shares (loadTokenReceipt)
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; share: read with Number() and required to be a whole number of at least 1 (not the strict parser: finding)
- **Idempotency:** read-only
- **Success:** tokenReceiptDto: the sale's item, price, status, method, split counts and date, the business's public details, and the share's index, amount, method and paid time; no internal ids
- **Error disclosure:** fixed
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else
- **Replay:** read-only
- **Rate:** requirePaymentTokenRateLimit (the resolve family: 120 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)
- **Finding:** share is parsed with Number(), which accepts forms such as 1e0, 0x1 and ' 1' that the plan's strict parser (§8.4) refuses; the same on the receipt, its PDF and its QR.

### POST `/api/pay/t/:token/receipt-pdf`

- params: `token: raw`
- query: `share: raw`
- authChecks: `loadTokenReceipt`, `resolvePaymentToken`
- storageMethods: `getMerchant`, `getSplitPaymentsByTransaction`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `sendTokenReceiptError`, `setPaymentTokenHeaders`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404; for a split sale, share picks one of its completed shares (loadTokenReceipt)
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; share: read with Number() and required to be a whole number of at least 1 (not the strict parser: finding)
- **Idempotency:** read-only (a POST so the download is not a link)
- **Success:** a PDF receipt of the sale or share (generateReceiptPdf), as an attachment
- **Error disclosure:** fixed
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else
- **Replay:** read-only
- **Rate:** requirePaymentTokenRateLimit (the completion family: 40 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

### GET `/api/pay/t/:token/receipt-qr`

- params: `token: raw`
- query: `share: raw`, `size: strictBoundedIntegerQueryParam`
- authChecks: `loadTokenReceipt`, `resolvePaymentToken`
- storageMethods: `getMerchant`, `getSplitPaymentsByTransaction`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- rateLimits: `paymentTokenRateLimiter.allow`, `requirePaymentTokenRateLimit`
- helpers: `requirePaymentTokenRateLimit`, `sendTokenReceiptError`, `setPaymentTokenHeaders`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404; for a split sale, share picks one of its completed shares (loadTokenReceipt)
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; share: read with Number() and required to be a whole number of at least 1 (not the strict parser: finding); size: strictBoundedIntegerQueryParam (100 to 800)
- **Idempotency:** read-only
- **Success:** a PNG QR code of the receipt page's address (/receipt/t/<token>, with ?share=n for a share)
- **Error disclosure:** fixed
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else
- **Replay:** read-only
- **Rate:** requirePaymentTokenRateLimit (the qr family: 30 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; body: tokenSessionRequestSchema, strict (idempotencyKey: a UUID; amount: optional, and must equal what is owed)
- **Capability gate:** isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE) and PAYMENT_RETURN_STATE_SECRET (503 PAYMENT_RETURN_STATE_UNAVAILABLE)
- **Idempotency:** per sale share and idempotency key: paymentAttempts.claim keeps one active attempt; the same key resumes its attempt and session, another key while one is active is 409, and concurrent creation of one attempt's session is coalesced in this process
- **Side effects:** creates a payment session with the provider (createWindcaveSession); an expired attempt is first reconciled by querying the provider, which can settle it (live update and push to the business)
- **Success:** the provider session id, its hosted-page and submit URLs, attemptState and shareIndex; or, for a settled attempt, its outcome
- **Error disclosure:** fixed
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else
- **Replay:** the same idempotency key returns the same attempt and session; a new key while one is active is refused
- **Rate:** requirePaymentTokenRateLimit (the session family: 20 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404; the attempt must be this sale's, for this share and idempotency key, with this provider session (prepareTokenCompletion)
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; body: idempotencyKey (a UUID), sessionId (1 to 512 characters), shareIndex (0 to 10), paymentMethod card or apple_pay; strict
- **Capability gate:** isWindcaveConfigured() (503 while unconfigured: the outcome waits)
- **Idempotency:** paymentAttempts.claimFinalization: one finaliser per attempt; a settled attempt returns its outcome
- **Side effects:** queries the provider for the session's outcome; on settlement a live update and a push to the business
- **Success:** { approved, outcome, receiptShare } (tokenAttemptOutcome)
- **Error disclosure:** fixed
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else, together with the attempt's idempotency key and provider session id
- **Replay:** returns the settled outcome; the outcome always comes from the provider, never from the request
- **Rate:** requirePaymentTokenRateLimit (the completion family: 40 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the link's token (43 base64url characters) selects the one sale it was made for: only its hash is looked up (resolvePaymentToken); an unknown or malformed token is 404; the attempt must be this sale's, for this share and idempotency key, with this provider session (prepareTokenCompletion)
- **Input:** token: matched against PAYMENT_TOKEN_PATTERN, then only its hash is looked up; body: idempotencyKey (a UUID), sessionId (1 to 512 characters), shareIndex (0 to 10), and googlePayToken, an object passed to the provider as it is; strict
- **Capability gate:** isWindcaveConfigured() (503 while unconfigured: the outcome waits)
- **Idempotency:** paymentAttempts.claimFinalization: only the first finaliser submits the wallet token; a replay only queries the session, so it cannot charge twice
- **Side effects:** the first finaliser submits the Google Pay token to the provider's submit URL cached for this attempt (assertWindcaveUrl checks it is the provider's); otherwise queries the session; on settlement a live update and a push to the business
- **Success:** { approved, outcome, receiptShare } (tokenAttemptOutcome)
- **Error disclosure:** fixed
- **Authenticity:** holding the sale's link: its token is the credential for that one sale and for nothing else, together with the attempt's idempotency key and provider session id
- **Replay:** never resubmits the wallet token; returns the settled outcome
- **Rate:** requirePaymentTokenRateLimit (the completion family: 40 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the return state (HMAC-derived from one payment attempt) selects that attempt (paymentAttempts.resolveReturnState); an unknown state is 404
- **Input:** state: an opaque return state, resolved by its hash; source: only 'hpp' is acted on; result: only 'cancelled' changes anything (a provider-declined outcome is labelled cancelled)
- **Capability gate:** isWindcaveConfigured() (unconfigured, the attempt stays pending)
- **Idempotency:** the provider's browser return reconciles through paymentAttempts.claimFinalization, once per attempt; a plain read is read-only
- **Side effects:** on the provider's browser return: queries the provider and settles the attempt (live update and push to the business)
- **Success:** a browser return is always 303 to /pay/return/<state>; a plain read returns only { outcome, receiptShare }
- **Error disclosure:** fixed
- **Authenticity:** holding the attempt's return state, the credential for that one attempt
- **Replay:** harmless: settlement is claimed once, and reads are read-only
- **Rate:** requirePaymentTokenRateLimit (the resolve family: 120 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)

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

Reviewed policy:

- **Who:** provider. **Tenant (token):** the return state (HMAC-derived, one per payment attempt) selects one attempt through paymentAttempts.resolveReturnState; an unknown state does nothing
- **Input:** state: an opaque return state, only resolved by its hash; result (query or body): read only to label a provider-declined outcome as cancelled rather than declined
- **Capability gate:** isWindcaveConfigured(): with no provider configured the attempt stays pending
- **Idempotency:** paymentAttempts.claimFinalization claims the attempt before the provider is queried; a terminal or conflicting attempt is left alone, so repeated or concurrent notifications settle it once
- **Side effects:** queries the provider for the attempt's session; on settlement, a live update and a push to the business (persistTokenOutcome, broadcastToStone)
- **Success:** 200 "OK" at once, before any work; nothing else is returned
- **Error disclosure:** fixed
- **Authenticity:** none needed: the call only prompts a re-read, and the outcome comes from querying the provider, never from the request
- **Replay:** harmless: a settled attempt is terminal and the claim is atomic
- **Rate:** requirePaymentTokenRateLimit (the completion family, per visitor address)

### GET `/api/merchants/:id/active-transaction`

- params: `id: strictPositiveIntegerParam`
- query: `stoneId: strictPositiveIntegerQueryParam`
- authChecks: `authenticateToken`, `checkMerchantOwnership`, `compares stone.merchantId !== merchantId`, `compares transaction.merchantId !== merchantId`
- storageMethods: `getActiveTransactionByMerchant`, `getTaptStone`
- statuses: `200`, `400`, `401`, `403`, `410`, `429`, `500`, `503`
- dtos: `ownerTransactionDto`, `publicTransactionDto`
- rateLimits: `checkRateLimit`
- helpers: `checkRateLimit`

Review pending.

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

Review pending.

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

Review pending.

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

Review pending.

### POST `/api/transactions/:id/split`

- params: `id: strictPositiveIntegerParam`
- body: `schema: z.object({ totalSplits: z.number().int().min(2).max(10), }).strict()`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `createBillSplit`, `getTransaction`
- sideEffects: `live update: sseBroker.broadcast`
- statuses: `200`, `400`, `404`, `409`, `500`
- dtos: `publicTransactionDto`
- errorTextInResponse: `error.message`
- helpers: `broadcastToStone`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404)
- **Input:** id: strictPositiveIntegerParam; body: { totalSplits: a whole number from 2 to 10 }, nothing else (strict, since 2026-09-26)
- **Idempotency:** only a pending sale the business allowed to split (409 otherwise, since 2026-09-26); storage.createBillSplit sets it up atomically, returns an exact retry unchanged, and refuses a different split (BillSplitConflictError, 409)
- **Side effects:** a live update to the business's screens (broadcastToStone)
- **Success:** publicTransactionDto of the split sale, with its board's page and QR addresses
- **Error disclosure:** domain-errors
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting
- **Replay:** an exact retry returns the same split; a different one is refused
- **Rate:** none — no limit
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.

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

Review pending.

### GET `/api/split-payments/:id`

- params: `id: strictPositiveIntegerParam`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getSplitPaymentById`, `getTransaction`
- statuses: `200`, `400`, `404`, `500`
- dtos: `publicSplitPaymentDto`

Reviewed policy:

- **Who:** public. **Tenant (number):** the share's sequential number selects it; a share of a sale with its own link is hidden (404)
- **Input:** id: strictPositiveIntegerParam (checked twice)
- **Idempotency:** read-only
- **Success:** publicSplitPaymentDto: the share's id, sale number, index, amount, status, method and times
- **Error disclosure:** fixed
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting
- **Replay:** read-only
- **Rate:** none — no limit
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.

### POST `/api/transactions/:id/cancel`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTransaction`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerTransactionDto`
- helpers: `broadcastToStone`

Review pending.

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

Review pending.

### GET `/api/nfc/capabilities`

- statuses: `200`
- capabilityGates: `config.features.tapToPay`

Review pending.

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

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404)
- **Input:** id: strictPositiveIntegerParam; body: paymentRequestSchema (merchantId, stoneId, paymentMethod, cardLast4, amount — all optional; a merchantId or stoneId given must match the sale); amount: never charged — what is owed (the next share, or the whole price) is; an amount given must equal it to the cent, or 400 before any provider session (owner decision 2026-09-26)
- **Capability gate:** isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE while unconfigured)
- **Idempotency:** a completed or processing sale is refused (409); otherwise every call creates a new provider session and binds it to the sale, replacing the last one
- **Side effects:** creates a payment session with the provider (createWindcaveSession); when the provider reports the session already complete, settles the sale (live update and push)
- **Success:** the provider session id and its hosted-page and submit URLs (kept server-side too, and never taken back from a client)
- **Error disclosure:** input-issues
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting
- **Replay:** each call opens another provider session for the same sale
- **Rate:** checkRateLimit (100 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B)
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.

### GET `/api/windcave/env`

- statuses: `200`

Review pending.

### POST `/api/transactions/:id/hosted-fields-complete`

- params: `id: strictPositiveIntegerParam`
- body: `fields: paymentMethod, sessionId`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getNextPendingSplit`, `getTransaction`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionPaymentMethod`, `updateTransactionSessionState`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `403`, `404`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- helpers: `broadcastToStone`, `finaliseHostedPayment`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404); the session id sent must be the one bound to the sale (403 otherwise)
- **Input:** id: strictPositiveIntegerParam; body read without a schema: sessionId (required, compared with the bound session) and paymentMethod (only apple_pay is kept, anything else is card)
- **Capability gate:** isWindcaveConfigured() (503 while unconfigured)
- **Idempotency:** none: every call queries the provider and settles again (gap 11, finding)
- **Side effects:** queries the provider for the bound session; settles the sale or its next share, counts it on the business, and sends a live update and a push
- **Success:** { approved, redirectPath } to the receipt or the declined page
- **Error disclosure:** fixed
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting, with the provider session id bound to it
- **Replay:** settles again; after a share, the same session can complete the next one (gap 11)
- **Rate:** none — no limit
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **Finding:** Gap 11 (known, escalated 2026-09-13): the finaliser re-settles on every call with the bound session, and after a share it resets the session to pending, so one approved session can complete the next share too. Closed by moving onto the payment_attempts engine (C3).
- **Finding:** A split share is marked paid without comparing what the provider charged with the share. Until 2026-09-26 the pay route let the customer choose the amount, so every share of a $100 sale could be paid with $0.01 and the sale showed fully paid (shown in the harness); the owner chose exact shares only, and the pay route now opens every session for exactly what is owed. What remains is one session settling twice (gap 11's replay; the read-then-write settlement, R3/C20); the amount check itself is R2/R3 (plan lines 870, 1511).

### POST `/api/transactions/:id/googlepay-complete`

- params: `id: strictPositiveIntegerParam`
- body: `fields: googlePayToken, sessionId`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getNextPendingSplit`, `getTransaction`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionPaymentMethod`, `updateTransactionSessionState`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `provider: submitGooglePayToken`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `403`, `404`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- helpers: `assertWindcaveUrl`, `broadcastToStone`, `finaliseHostedPayment`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404); the session id sent must be the one bound to the sale (403 otherwise)
- **Input:** id: strictPositiveIntegerParam; body read without a schema: sessionId (required, compared with the bound session) and googlePayToken (an object passed to the provider)
- **Capability gate:** isWindcaveConfigured() (503 while unconfigured)
- **Idempotency:** none: the wallet token is submitted to the provider's submit URL cached for the sale when there is one, otherwise the session is queried, and the result is settled again on every call (gap 11)
- **Side effects:** submits the Google Pay token to the provider's cached submit URL (assertWindcaveUrl checks it) or queries the session; settles the sale or its next share, counts it, and sends a live update and a push
- **Success:** { approved, redirectPath } to the receipt or the declined page
- **Error disclosure:** fixed
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting, with the provider session id bound to it
- **Replay:** settles again; after a share, the same session can complete the next one (gap 11)
- **Rate:** none — no limit
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **Finding:** Gap 11 (known, escalated 2026-09-13): the finaliser re-settles on every call with the bound session, and after a share it resets the session to pending, so one approved session can complete the next share too. Closed by moving onto the payment_attempts engine (C3).
- **Finding:** A split share is marked paid without comparing what the provider charged with the share. Until 2026-09-26 the pay route let the customer choose the amount, so every share of a $100 sale could be paid with $0.01 and the sale showed fully paid (shown in the harness); the owner chose exact shares only, and the pay route now opens every session for exactly what is owed. What remains is one session settling twice (gap 11's replay; the read-then-write settlement, R3/C20); the amount check itself is R2/R3 (plan lines 870, 1511).

### GET `/api/transactions/:id`

- params: `id: strictPositiveIntegerParam`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getTransaction`
- statuses: `200`, `400`, `404`, `500`
- dtos: `publicTransactionDto`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404)
- **Input:** id: strictPositiveIntegerParam
- **Idempotency:** read-only
- **Success:** publicTransactionDto: id, business id, board id, item, price, status, method, split counts and date, and the board's page address
- **Error disclosure:** fixed
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting
- **Replay:** read-only
- **Rate:** none — no limit
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it. With no rate limit, counting through the numbers lists every such sale of every business: item, price, time, business and board.

### POST `/api/transactions/:id/receipt-pdf`

- params: `id: strictPositiveIntegerParam`
- query: `splitId: raw | strictPositiveIntegerQueryParam`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getMerchant`, `getSplitPaymentById`, `getSplitPaymentsByTransaction`, `getTransaction`
- statuses: `200`, `400`, `404`, `500`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404)
- **Input:** id: strictPositiveIntegerParam; splitId: present, it must pass strictPositiveIntegerQueryParam (400 otherwise), belong to the sale and be completed
- **Idempotency:** read-only
- **Success:** a PDF receipt of a completed sale or share (generateReceiptPdf), as an attachment
- **Error disclosure:** fixed
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting
- **Replay:** read-only
- **Rate:** none — no limit
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.

### GET `/api/transactions/:id/receipt-qr`

- params: `id: strictPositiveIntegerParam`
- query: `size: strictBoundedIntegerQueryParam`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getTransaction`
- statuses: `200`, `400`, `404`, `500`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404)
- **Input:** id: strictPositiveIntegerParam (checked twice); size: strictBoundedIntegerQueryParam (up to 800)
- **Idempotency:** read-only
- **Success:** a PNG QR code of the receipt page's address (/receipt/<number>), cached publicly for 7 days
- **Error disclosure:** fixed
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting
- **Replay:** read-only
- **Rate:** none — no limit
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.

### GET `/api/merchants/:id/analytics`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getMerchantAnalytics`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/merchants/:id/revenue-over-time`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `days: strictBoundedIntegerQueryParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getRevenueOverTime`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/merchants/:id/analytics/export`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `endDate: raw`, `startDate: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getMerchantAnalyticsWithDateRange`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/merchants/:id/export/csv`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `endDate: raw`, `startDate: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTransactionsByMerchantWithDateRange`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/merchants/:id/export/pdf`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `endDate: raw`, `startDate: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getMerchant`, `getMerchantAnalyticsWithDateRange`, `getTransactionsByMerchantWithDateRange`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/admin/merchants/:id/verify`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchantStatus`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/merchants/:id/set-active`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchantStatus`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/merchants/:id/transactions`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### PATCH `/api/admin/merchants/:id/windcave-merchant-id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- body: `fields: windcaveMerchantId`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

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

Review pending.

### PUT `/api/merchants/:id/rates`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `410`, `503`

Review pending.

### PUT `/api/merchants/:id/details`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateMerchantDetailsSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchantDetails`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

Review pending.

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

Review pending.

### PUT `/api/merchants/:id/bank-account`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `410`, `503`

Review pending.

### PUT `/api/merchants/:id/theme`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateThemeSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchantTheme`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

Review pending.

### PUT `/api/merchants/:id/daily-goal`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateDailyGoalSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

Review pending.

### PUT `/api/merchants/:id`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `parseResult.error.errors`

Review pending.

### POST `/api/merchants/:id/logo`

- middleware: `authenticateToken`, `requireLogoOwnership`, `logoUpload.single(…)`
- params: `id: strictPositiveIntegerParam`
- body: `file`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `deleteUploadedFile`, `saveUploadedFile`, `updateMerchantLogoUrl`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `requireLogoOwnership`, `saveUploadedFile`

Review pending.

### DELETE `/api/merchants/:id/logo`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `deleteUploadedFile`, `getMerchant`, `updateMerchantLogoUrl`
- sideEffects: `file system: fs.existsSync`, `file system: fs.unlinkSync`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/merchants/:id/transactions`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTransactionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/merchants/:id/tapt-stones`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTaptStonesByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### POST `/api/merchants/:id/tapt-stones`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createNextTaptStone`, `getMerchant`, `updateTaptStoneUrls`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `error.message`

Review pending.

### PUT `/api/merchants/:merchantId/tapt-stones/:stoneId`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- body: `fields: name`
- authChecks: `checkMerchantOwnership`, `compares existingStone.merchantId !== merchantId`
- storageMethods: `getTaptStone`, `updateTaptStone`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### DELETE `/api/merchants/:merchantId/tapt-stones/:stoneId`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`, `compares existingStone.merchantId !== merchantId`
- storageMethods: `deleteTaptStone`, `getTaptStone`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/tapt-stones/:id`

- params: `id: strictPositiveIntegerParam`
- storageMethods: `getTaptStone`
- statuses: `200`, `400`, `404`, `500`

Review pending.

### GET `/api/admin/subscription-revenue`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getSubscriptionRevenue`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### ALL `/api/windcave/notification`

- middleware: `express.urlencoded(…)`, `express.json(…)`
- query: `sessionId: raw`, `sessionid: raw`
- body: `fields: sessionId, sessionid`, `whole body: console.warn`
- storageMethods: `getNextPendingSplit`, `getTransaction`, `getTransactionByWindcaveSessionId`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionSessionState`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `200`
- capabilityGates: `isWindcaveConfigured`
- helpers: `broadcastToStone`

Reviewed policy:

- **Who:** provider. **Tenant (provider-session):** the provider's session id selects the one sale created with it (storage.getTransactionByWindcaveSessionId); an unknown id does nothing
- **Input:** sessionId / sessionid (query or body): an opaque provider session id, used only to find the sale and to query the provider; the rest of the body is ignored
- **Capability gate:** isWindcaveConfigured(): unconfigured, the notification is ignored before any write
- **Idempotency:** only a sale whose session is still pending is processed, but pending → processing is a read then a write, not a claim (finding)
- **Side effects:** queries the provider; settles the sale or its next split share, counts the sale on the business, and sends the business a live update and a push
- **Success:** 200 "OK" at once, before any work; nothing else is returned
- **Error disclosure:** fixed
- **Authenticity:** none needed from the caller: the outcome comes from querying the provider with the stored session id
- **Replay:** a settled session is skipped (no longer pending); two simultaneous duplicates can both pass the read
- **Rate:** none — anyone can make the server query the provider about a pending session whose id they hold; the ids are unguessable provider session ids
- **Finding:** pending → processing is a read then a write, not an atomic claim: two simultaneous notifications for one session can both query the provider and both settle it (a second count increment, a second push). Plan 22.7 / R3 (C20) owns the single atomic finaliser.
- **Finding:** Logs the raw query (with the session id), and the query and body when no session id is found, to the server log.

### GET `/api/windcave/callback`

- query: `result: raw`, `sessionId: raw`, `sessionid: raw`, `transactionId: raw`
- authChecks: `isTokenAddressedTransaction`
- storageMethods: `getNextPendingSplit`, `getTransaction`, `getTransactionByWindcaveSessionId`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionSessionState`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: queryWindcaveSession`, `push: sendPushToMerchant`
- statuses: `302`, `400`, `404`
- capabilityGates: `isWindcaveConfigured`
- helpers: `broadcastToStone`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's number (transactionId), or else the provider session id, selects the sale; a sale with its own link is 404; a cancel is believed only with the bound session id
- **Input:** transactionId: read into a variable, then strictPositiveIntegerQueryParam (a malformed one finds nothing, since 2026-09-26); sessionId / sessionid: compared with the bound session before a cancel is believed; result: only 'cancelled' is acted on; any 'sim' key rejects the request (400)
- **Capability gate:** isWindcaveConfigured(): unconfigured, nothing is settled and the customer sees pending
- **Idempotency:** an already approved or declined sale only redirects; otherwise pending → processing is a read then a write, like the notification's (R3 / C20)
- **Side effects:** queries the provider for the bound session and settles the sale or its next share (count, live update, push); a matching cancel fails the sale (live update, push)
- **Success:** 302 to the receipt, or to the result page (declined, cancelled or pending), or home
- **Error disclosure:** fixed
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting; the outcome always comes from querying the provider, and a cancel needs the bound session id
- **Replay:** a settled sale only redirects; simultaneous calls can both settle (R3 / C20)
- **Rate:** none — anyone can prompt a provider query for a pending numbered sale
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **Finding:** Settles by a read then a write, not a claim, racing the notification (plan 22.7 / R3, C20).

### GET `/api/windcave/status`

- statuses: `200`
- capabilityGates: `isWindcaveConfigured`

Review pending.

### GET `/api/admin/analytics`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`, `getMerchantAnalytics`, `getSubscriptionRevenue`, `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/revenue-over-time`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`, `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/payment-method-breakdown`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`, `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/ga4-detailed`

- middleware: `authenticateAdmin`
- query: `range: raw`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error?.message`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/ga4-metrics`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error?.message`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/merchants`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `410`, `503`
- helpers: `authenticateAdmin`

Review pending.

### PUT `/api/admin/merchants/:id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchantDetails`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `adminMerchantDto`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/merchants/:id/test-payment-link`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `400`, `401`, `403`, `410`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/merchants`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/merchants/:id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `adminMerchantDto`
- helpers: `authenticateAdmin`

Review pending.

### DELETE `/api/admin/merchants/:id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `deleteMerchant`, `getMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/clear-merchants`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchantByEmail`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/resend-verification`

- middleware: `authenticateAdmin`
- body: `fields: email`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchantByEmail`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/test-email`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`, `email: sendEmail`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/email-status`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/merchants/verify`

- body: `fields: password, token`
- storageMethods: `verifyMerchant`
- statuses: `200`, `400`, `500`
- errorTextInResponse: `checked.error.issues`

Review pending.

### GET `/api/merchants/:id/email-status`

- params: `id: strictPositiveIntegerParam`
- storageMethods: `getMerchant`
- statuses: `200`, `400`, `404`, `500`

Review pending.

### POST `/api/auth/confirm-email`

- body: `fields: password, token`
- authChecks: `storage.getMerchantByToken`
- storageMethods: `confirmMerchantEmail`, `getMerchantByToken`, `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `email: sendEmail`
- statuses: `200`, `400`, `429`, `500`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `escHtml`, `refuseTooManyAttempts`

Review pending.

### POST `/api/auth/resend-confirmation`

- body: `fields: email, merchantId`
- storageMethods: `getMerchant`, `getMerchantByEmail`, `takeAuthThrottleSlot`
- statuses: `200`, `400`, `429`, `500`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

Review pending.

### POST `/api/info-pack-leads`

- body: `schema: createInfoPackLeadSchema`
- storageMethods: `createInfoPackLead`
- sideEffects: `email: sendEmail`
- statuses: `201`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.issues`
- rateLimits: `checkResendRateLimit`, `resendRateLimitMap.get`, `resendRateLimitMap.set`
- helpers: `checkResendRateLimit`

Review pending.

### POST `/api/merchants/signup`

- body: `schema: publicSignupSchema`
- storageMethods: `createMerchantWithSignup`, `getMerchantByEmail`, `getUserByEmail`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.issues`
- rateLimits: `checkRateLimit`
- helpers: `checkRateLimit`, `replyToSignup`

Review pending.

### PUT `/api/merchants/:id/business-details`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: businessDetailsSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `getMerchant`, `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `validation.error.issues`

Review pending.

### POST `/api/admin/merchants/signup`

- middleware: `authenticateAdmin`
- body: `schema: createMerchantSchema`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `createMerchantWithPassword`, `getMerchantByEmail`, `getUserByEmail`, `updateMerchantDetails`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `409`, `500`, `503`
- errorTextInResponse: `validation.error.issues`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/merchants/:id/events`

- params: `id: strictPositiveIntegerParam`
- query: `stoneId: strictPositiveIntegerQueryParam`, `token: checked`
- authChecks: `authenticateToken`, `checkMerchantOwnership`, `compares authenticatedRequest.user?.role === "admin"`, `compares stone.merchantId !== merchantId`
- storageMethods: `getTaptStone`
- sideEffects: `live update: sseBroker.subscribe`
- statuses: `200`, `400`, `401`, `403`, `404`, `410`, `500`, `503`

Review pending.

### GET `/api/push/capabilities`

- statuses: `200`

Review pending.

### GET `/api/push/vapid-key`

- statuses: `200`, `503`

Review pending.

### POST `/api/push/subscribe`

- middleware: `authenticateToken`
- body: `fields: subscription`
- storageMethods: `createPushSubscription`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

Review pending.

### POST `/api/push/unsubscribe`

- middleware: `authenticateToken`
- body: `fields: endpoint`
- storageMethods: `deactivatePushSubscriptionByEndpoint`, `getPushSubscriptionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### POST `/api/push/native-subscribe`

- middleware: `authenticateToken`
- body: `fields: deviceToken`
- storageMethods: `createPushSubscription`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

Review pending.

### POST `/api/push/native-unsubscribe`

- middleware: `authenticateToken`
- storageMethods: `deactivateNativePushSubscriptionsForLogin`, `deactivatePushSubscriptionByEndpoint`, `getPushSubscriptionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/push/status`

- middleware: `authenticateToken`
- storageMethods: `getPushNotificationPreferences`, `getPushSubscriptionsByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

Review pending.

### GET `/api/push/preferences`

- middleware: `authenticateToken`
- storageMethods: `getPushNotificationPreferences`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

Review pending.

### PUT `/api/push/preferences`

- middleware: `authenticateToken`
- body: `schema: pushNotificationPreferencesSchema`
- storageMethods: `updatePushNotificationPreferences`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`
- errorTextInResponse: `parsed.error.errors`

Review pending.

### POST `/api/merchants/:id/clear-transactions`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `compares req.user?.role === "admin"`, `isAccountOwner`
- statuses: `400`, `401`, `403`, `410`, `503`

Review pending.

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

Review pending.

### GET `/api/transactions/:transactionId/refunds`

- middleware: `authenticateToken`
- params: `transactionId: strictPositiveIntegerParam`
- authChecks: `compares transaction.merchantId !== merchantId`
- storageMethods: `getRefundsByTransaction`, `getTransaction`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/merchants/:merchantId/refunds`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- authChecks: `compares req.user?.role !== 'admin'`, `compares userMerchantId !== merchantId`
- storageMethods: `getRefundsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/refunds/:refundId`

- middleware: `authenticateToken`
- params: `refundId: strictPositiveIntegerParam`
- authChecks: `compares refund.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `getRefund`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/admin/api-keys`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/api-keys`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/api-keys/:keyId/revoke`

- middleware: `authenticateAdmin`
- params: `keyId: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `400`, `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/api-metrics`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/admin/api-usage`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `401`, `403`, `404`, `503`
- helpers: `authenticateAdmin`

Review pending.

### GET `/api/merchants/:merchantId/stock-items`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- authChecks: `compares req.user?.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `getStockItemsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### POST `/api/merchants/:merchantId/stock-items`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- body: `schema: createStockItemSchema`
- authChecks: `compares req.user?.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `createStockItem`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error.errors`

Review pending.

### PUT `/api/merchants/:merchantId/stock-items/:itemId`

- middleware: `authenticateToken`
- params: `itemId: strictPositiveIntegerParam`, `merchantId: strictPositiveIntegerParam`
- body: `schema: updateStockItemSchema`
- authChecks: `compares existingItem.merchantId !== merchantId`, `compares req.user?.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `getStockItem`, `updateStockItem`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `error.errors`

Review pending.

### DELETE `/api/merchants/:merchantId/stock-items/:itemId`

- middleware: `authenticateToken`
- params: `itemId: strictPositiveIntegerParam`, `merchantId: strictPositiveIntegerParam`
- authChecks: `compares existingItem.merchantId !== merchantId`, `compares req.user?.merchantId !== merchantId`, `compares req.user?.role !== 'admin'`
- storageMethods: `deleteStockItem`, `getStockItem`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/v1/transactions`

- middleware: `requireEcommerceApi`, `authenticateApiKey`
- body: `schema: apiV1CreateTransactionSchema`
- storageMethods: `createWebhookDelivery`, `getApiKeyByKey`, `getOrCreateSubscription`, `logApiRequest`, `updateApiKeyLastUsed`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- dtos: `publicTransactionDto`
- errorTextInResponse: `validation.error.errors`
- capabilityGates: `config.features.ecommerceApi`, `config.features.newRetailPayments`, `requireEcommerceApi`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `authenticateApiKey`, `requireBillingCard`, `requireEcommerceApi`

Reviewed policy:

- **Who:** api-key. **Tenant (key):** the sale is created for the API key's own merchant (req.apiKey.merchantId); no merchant id is read from the request
- **Input:** the key's create_transactions permission is checked first (403), then the body: apiV1CreateTransactionSchema (amount, currency, item_name, and webhook_url as a URL of at most 2048 characters)
- **Capability gate:** requireEcommerceApi (FEATURE_ECOMMERCE_API, off by default: 404) and config.features.newRetailPayments (503 while per-payment links are off)
- **Entitlement gate:** requireBillingCard: 402 BILLING_CARD_REQUIRED without a paid plan
- **Idempotency:** none: every call creates another sale and another payment link (no idempotency key)
- **Side effects:** creates a per-payment sale (createRetailTransaction, server/retail-transaction-service.ts), writes an API log row, and records a webhook delivery row that nothing sends
- **Success:** fields listed one by one: id, amount, currency, item_name, status, payment_url, qr_code_url (the payment link's raw token, given once), created_at; publicTransactionDto is only the stored webhook payload
- **Error disclosure:** input-issues
- **Authenticity:** a Bearer API key found with storage.getApiKeyByKey and active; create_transactions permission
- **Replay:** a replayed request creates another sale
- **Rate:** none — no per-key or per-address limit
- **Finding:** webhook_url from the caller is stored as a webhook delivery row. Nothing delivers those rows today; any future delivery worker must restrict destinations (server-side request forgery).
- **Finding:** No rate limit and no idempotency key on an API that creates payment links (behind FEATURE_ECOMMERCE_API, off by default; plan 15.5 decides the API's future).

### GET `/api/v1/transactions/:id`

- middleware: `requireEcommerceApi`, `authenticateApiKey`
- params: `id: raw | strictPositiveIntegerParam`
- authChecks: `compares transaction.merchantId !== req.apiKey.merchantId`
- storageMethods: `getApiKeyByKey`, `getTransaction`, `logApiRequest`, `updateApiKeyLastUsed`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`
- capabilityGates: `config.features.ecommerceApi`, `requireEcommerceApi`
- helpers: `authenticateApiKey`, `requireEcommerceApi`

Reviewed policy:

- **Who:** api-key. **Tenant (resource):** storage.getTransaction(id), then the sale's merchant must equal the key's merchant; another merchant's sale answers the same 404 as a missing one
- **Input:** id: strictPositiveIntegerParam (400 otherwise); the raw id is only echoed into the error log row
- **Capability gate:** requireEcommerceApi (FEATURE_ECOMMERCE_API, off by default: 404)
- **Idempotency:** read-only (it writes an API log row)
- **Success:** fields listed one by one: id, amount, currency, item_name, status, created_at, windcave_transaction_id
- **Error disclosure:** fixed
- **Authenticity:** a Bearer API key found with storage.getApiKeyByKey and active; read_transactions permission
- **Replay:** read-only
- **Rate:** none — no per-key or per-address limit

### POST `/api/payments/apple-pay/validate`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `404`, `503`

Review pending.

### POST `/api/payments/apple-pay/process`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `503`

Review pending.

### POST `/api/payments/google-pay/process`

- middleware: `authenticateToken`
- statuses: `401`, `403`, `503`

Review pending.

### GET `/api/payments/digital-wallet/config`

- sideEffects: `provider: windcaveService.isConfigured`
- statuses: `200`, `500`

Review pending.

### GET `/api/subscription`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `countSeatsInUse`, `getOrCreateSubscription`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `subscriptionDto`

Review pending.

### PUT `/api/subscription/plan`

- middleware: `authenticateToken`
- body: `fields: planId`
- authChecks: `compares req.user?.role === "member"`
- storageMethods: `changeSubscriptionPlan`, `countSeatsInUse`, `getOrCreateSubscription`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `409`, `422`, `500`, `502`, `503`
- dtos: `subscriptionDto`

Review pending.

### POST `/api/subscription/cancel`

- middleware: `authenticateToken`
- body: `fields: reason`
- authChecks: `compares req.user?.role === "member"`
- storageMethods: `cancelSubscription`, `countSeatsInUse`, `getOrCreateSubscription`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- dtos: `subscriptionDto`

Review pending.

### POST `/api/subscription/resume`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === "member"`
- storageMethods: `countSeatsInUse`, `resumeSubscription`
- statuses: `200`, `400`, `401`, `403`, `409`, `500`, `503`
- dtos: `subscriptionDto`

Review pending.

### GET `/api/team`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `countSeatsInUse`, `getOrCreateSubscription`, `getTeamMembers`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### POST `/api/team/invite`

- middleware: `authenticateToken`
- body: `schema: inviteTeamMemberSchema`
- authChecks: `isAccountOwner`
- storageMethods: `getMerchant`, `getOrCreateSubscription`, `inviteTeamMember`, `revokeTeamInvite`
- sideEffects: `email: sendTeamInviteEmail`
- statuses: `201`, `400`, `401`, `403`, `409`, `500`, `502`, `503`
- dtos: `teamMemberDto`
- errorTextInResponse: `parsed.error.errors`

Review pending.

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

Review pending.

### DELETE `/api/team/:userId/invite`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- authChecks: `isAccountOwner`
- storageMethods: `revokeTeamInvite`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### PUT `/api/team/:userId/status`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- body: `fields: status`
- authChecks: `isAccountOwner`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `setTeamMemberStatus`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- dtos: `teamMemberDto`

Review pending.

### DELETE `/api/team/:userId`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- authChecks: `compares member.merchantId !== merchantId`, `compares member.role === "owner"`, `isAccountOwner`
- storageMethods: `getUserById`, `removeTeamMember`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`

Review pending.

### POST `/api/team/accept-invite`

- body: `schema: acceptInviteSchema`
- authChecks: `storage.getUserByInviteToken`
- storageMethods: `activateInvitedUser`, `getUserByInviteToken`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `500`
- errorTextInResponse: `parsed.error.errors`, `parsed.error.issues`
- helpers: `invalid`

Review pending.

### GET `/api/subscription/billing-history`

- middleware: `authenticateToken`
- query: `limit: strictBoundedIntegerQueryParam`
- authChecks: `isAccountOwner`
- storageMethods: `getBillingHistory`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/billing/card`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `getMerchant`, `getOrCreateSubscription`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/billing/card/session`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `bindSubscriptionCardSession`, `getMerchant`, `getOrCreateSubscription`
- sideEffects: `provider: createCardStorageSession`
- statuses: `200`, `401`, `403`, `404`, `500`, `502`, `503`
- capabilityGates: `isWindcaveConfigured`

Review pending.

### POST `/api/billing/card/confirm`

- middleware: `authenticateToken`
- body: `fields: sessionId`
- authChecks: `isAccountOwner`
- storageMethods: `completeSubscriptionCardSetup`, `countSeatsInUse`, `getSubscription`
- sideEffects: `provider: queryStoredCardSession`
- statuses: `200`, `202`, `400`, `401`, `403`, `404`, `409`, `422`, `500`, `502`, `503`
- dtos: `subscriptionDto`

Review pending.

### ALL `/api/billing/card/notification`

- statuses: `200`

Reviewed policy:

- **Who:** provider. **Tenant (none):** reads nothing and writes nothing
- **Input:** nothing is read
- **Idempotency:** does nothing
- **Success:** 200 "OK"
- **Error disclosure:** fixed
- **Authenticity:** none needed: the call does nothing. A stored card is saved only when the signed-in owner's browser confirms it (POST /api/billing/card/confirm), which re-reads the session from the provider
- **Replay:** harmless
- **Rate:** none — there is nothing to limit

### GET `/api/billing/card/callback`

- query: `result: raw`
- body: `fields: result`
- statuses: `302`
- helpers: `billingCardCallback`, `safeBillingCardCallbackResult`

Reviewed policy:

- **Who:** public. **Tenant (none):** reads nothing; sends the browser back to billing settings
- **Input:** result (query or body): reduced by safeBillingCardCallbackResult to approved, declined, cancelled or unknown before it enters the redirect
- **Idempotency:** does nothing
- **Success:** 302 to /settings?section=billing&card=<one of the four results>
- **Error disclosure:** fixed
- **Authenticity:** anyone: the redirect carries only one of four fixed words, and the settings page then asks the server, signed in, to confirm the card
- **Replay:** harmless
- **Rate:** none — there is nothing to limit

### POST `/api/billing/card/callback`

- query: `result: raw`
- body: `fields: result`
- statuses: `302`
- helpers: `billingCardCallback`, `safeBillingCardCallbackResult`

Reviewed policy:

- **Who:** public. **Tenant (none):** reads nothing; sends the browser back to billing settings
- **Input:** result (query or body): reduced by safeBillingCardCallbackResult to approved, declined, cancelled or unknown before it enters the redirect
- **Idempotency:** does nothing
- **Success:** 302 to /settings?section=billing&card=<one of the four results>
- **Error disclosure:** fixed
- **Authenticity:** anyone: the redirect carries only one of four fixed words, and the settings page then asks the server, signed in, to confirm the card
- **Replay:** harmless
- **Rate:** none — there is nothing to limit

### DELETE `/api/billing/card`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `removeSubscriptionCard`
- statuses: `200`, `401`, `403`, `409`, `500`, `503`

Review pending.

### POST `/api/board-builder/submit`

- body: `fields: businessName, layout, pdf, stoneId, submitterEmail, submitterName`
- statuses: `200`, `400`, `500`

Review pending.

### GET `/uploads/:folder/:name`

- params: `folder: raw`, `name: raw`
- storageMethods: `getUploadedFile`
- sideEffects: `file system: fs.existsSync`
- statuses: `200`, `400`, `404`, `500`

Review pending.

### GET `/api/property/tenants`

- middleware: `authenticateToken`
- query: `includeArchived: raw`, `search: raw`
- storageMethods: `getTenantProfilesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Review pending.

### POST `/api/property/tenants`

- middleware: `authenticateToken`
- body: `schema: createTenantProfileSchema`
- storageMethods: `createTenantProfile`, `logTransactionEvent`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/property/tenants/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTenantProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### PUT `/api/property/tenants/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: updateTenantProfileSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTenantProfile`, `updateTenantProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/property/tenants/:id/archive`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `archiveTenantProfile`, `getTenantProfile`, `logTransactionEvent`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/property/tenants/:id/unarchive`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTenantProfile`, `logTransactionEvent`, `unarchiveTenantProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/property/tenants/:id/events`

- middleware: `authenticateToken`
- params: `id: raw`
- query: `limit: strictBoundedIntegerQueryParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTenantProfile`, `getTransactionEventsByTenant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/property/schedules`

- middleware: `authenticateToken`
- storageMethods: `getActiveSchedulesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/property/tenants/:tenantId/schedules`

- middleware: `authenticateToken`
- params: `tenantId: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getActiveSchedulesByTenant`, `getTenantProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/property/tenants/:tenantId/schedules`

- middleware: `authenticateToken`
- params: `tenantId: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createActiveSchedule`, `getOrCreateSubscription`, `getTenantProfile`, `logTransactionEvent`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

Review pending.

### PUT `/api/property/schedules/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: updateActiveScheduleSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getActiveSchedule`, `logTransactionEvent`, `updateActiveSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### DELETE `/api/property/schedules/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getActiveSchedule`, `logTransactionEvent`, `terminateActiveSchedule`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/property/invoices`

- middleware: `authenticateToken`
- query: `status: raw`, `tenantProfileId: raw`
- storageMethods: `getInvoiceRentRequestsByMerchant`, `getTenantProfile`
- statuses: `200`, `401`, `403`, `500`, `503`

Review pending.

### POST `/api/property/invoices/document`

- middleware: `authenticateToken`, `invoiceDocUpload.single(…)`
- body: `file`
- storageMethods: `saveUploadedFile`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- helpers: `saveUploadedFile`

Review pending.

### GET `/api/invoice-documents/:name`

- middleware: `authenticateToken`
- params: `name: raw`
- authChecks: `isValidatedPlatformAdmin`
- storageMethods: `getUploadedFile`, `getUploadedFileForMerchant`, `recordInvoiceDocumentAdminRead`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`
- helpers: `sendPrivateDocument`

Review pending.

### POST `/api/property/invoices`

- middleware: `authenticateToken`
- body: `fields: tenantProfileId`, `schema: createAdHocInvoiceSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createInvoiceRentRequest`, `getInvoiceRentRequest`, `getLiveInvoiceByTenant`, `getOrCreateSubscription`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `uploadedFileOwnedByMerchant`
- sideEffects: `email: resendInvoiceEmail`
- statuses: `200`, `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `generateInvoiceToken`, `requireBillingCard`, `requireOwnedInvoiceDocument`

Review pending.

### POST `/api/property/invoices/:id/resend`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getInvoiceRentRequest`, `getOrCreateSubscription`
- sideEffects: `email: resendInvoiceEmail`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `500`, `502`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

Review pending.

### GET `/api/property/invoices/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getInvoiceRentRequest`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/property/invoices/:id/void`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getInvoiceRentRequest`, `logTransactionEvent`, `updateInvoiceRentRequest`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/property/invoices/:id/mark-paid-external`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: markInvoicePaidExternalSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getInvoiceRentRequest`, `logTransactionEvent`, `updateInvoiceRentRequest`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/checkout/resolve/:token`

- params: `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `getActiveSchedule`, `getClientProfile`, `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `getMerchant`, `getQuote`, `getTenantProfile`, `uploadedFileOwnedByMerchant`
- statuses: `200`, `404`, `410`, `429`, `500`
- rateLimits: `tokenRateLimit`
- helpers: `getCheckoutParty`, `invoiceHasCheckoutDocument`, `tokenRateLimit`

Review pending.

### GET `/api/checkout/document/:token`

- params: `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `consumeInvoiceDocumentReadLimit`, `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `getUploadedFileForMerchant`
- statuses: `200`, `404`, `410`, `429`, `500`, `503`
- helpers: `sendPrivateDocument`

Review pending.

### POST `/api/checkout/:token/split`

- params: `token: raw`
- body: `fields: count`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `updateInvoiceRentRequest`, `updateJobInvoice`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- rateLimits: `tokenRateLimit`
- helpers: `tokenRateLimit`, `updateCheckoutInvoice`

Review pending.

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

Review pending.

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

Review pending.

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

Review pending.

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

Review pending.

### GET `/api/checkout/callback`

- query: `result: raw`, `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `302`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `sendRentGstInvoices`

Review pending.

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

Reviewed policy:

- **Who:** provider. **Tenant (provider-session):** the provider's session id selects the one rent invoice created with it (storage.getInvoiceRentRequestByWindcaveSessionId); an unknown id does nothing
- **Input:** sessionId / sessionid (query or body): an opaque provider session id; nothing else is read
- **Capability gate:** isWindcaveConfigured(): unconfigured, the notification is ignored
- **Idempotency:** a settled invoice (paid, paid externally, voided) is skipped; a split share is claimed atomically per session (storage.atomicClaimSplitShare), but a single payment is marked paid by a read then a write (finding)
- **Side effects:** queries the provider; when paid, emails the GST invoice (sendRentGstInvoices → sendGstInvoices)
- **Success:** 200 "OK" at once, before any work; nothing else is returned
- **Error disclosure:** fixed
- **Authenticity:** none needed from the caller: the outcome comes from querying the provider with the stored session id
- **Replay:** a settled invoice is skipped; two simultaneous duplicates of a single payment can both pass the read
- **Rate:** none — any caller can prompt a provider query for a pending session whose id they hold
- **Finding:** finalizeRentInvoice marks a single (unsplit) payment paid after a plain read: this notification and the browser's return arriving together can both record it, logging Payment_Received twice and sending the GST invoice twice. Plan 22.7 / R3 (C20).

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

Reviewed policy:

- **Who:** provider. **Tenant (provider-session):** the provider's session id selects the one job invoice created with it (storage.getJobInvoiceByWindcaveSessionId); an unknown id does nothing
- **Input:** sessionId / sessionid (query or body): an opaque provider session id; nothing else is read
- **Capability gate:** isWindcaveConfigured(): unconfigured, the notification is ignored
- **Idempotency:** a settled invoice is skipped; a split share is claimed atomically per session (storage.atomicClaimJobSplitShare), but a single payment is marked paid by a read then a write (finding)
- **Side effects:** queries the provider; when paid, sends the payment invoice (sendTradePaymentInvoice: email or SMS). The facts also list the rent path's GST email, which finalizeCheckoutInvoice can call, but this route always passes a trades invoice
- **Success:** 200 "OK" at once, before any work; nothing else is returned
- **Error disclosure:** fixed
- **Authenticity:** none needed from the caller: the outcome comes from querying the provider with the stored session id
- **Replay:** a settled invoice is skipped; two simultaneous duplicates of a single payment can both pass the read
- **Rate:** none — any caller can prompt a provider query for a pending session whose id they hold
- **Finding:** finalizeTradeInvoice marks a single payment paid after a plain read: a notification and the browser's return arriving together can both record it and send the payment invoice twice. Plan 22.7 / R3 (C20).

### POST `/api/webhooks/whatsapp`

- middleware: `express.json(…)`
- authChecks: `constant-time comparison: crypto.timingSafeEqual`
- storageMethods: `createJobEvent`, `getInvoiceRentRequestByWhatsappMessageId`, `getJobInvoiceByWhatsappMessageId`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- statuses: `200`
- helpers: `presentedSecretMatches`

Reviewed policy:

- **Who:** provider. **Tenant (provider-session):** the WhatsApp message id selects the property or trades invoice that sent it (getInvoiceRentRequestByWhatsappMessageId / getJobInvoiceByWhatsappMessageId); an unknown id does nothing
- **Input:** body: event and data read without a schema; only event 'messages.update' is used, and from each update only key.id and update.status
- **Idempotency:** the delivered time is stamped once (only while unset); every status is appended as an event, so a replay adds duplicate events
- **Success:** 200 "OK" at once, before any work; nothing else is returned
- **Error disclosure:** fixed
- **Authenticity:** the apikey header must equal EVOLUTION_API_KEY, compared in constant time (presentedSecretMatches); with no key configured nobody is believed (it failed open until 2026-09-26)
- **Replay:** a caller with the key can replay a status: it adds a duplicate event; the delivered time is set once
- **Rate:** none — no limit

### PUT `/api/merchants/:merchantId/sector`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- body: `schema: z.object({ sector: z.enum(["retail", "propertyManagement"]) })`
- authChecks: `checkMerchantOwnership`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/property/reminder-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`
- helpers: `reminderSettingsOf`

Review pending.

### PUT `/api/property/reminder-settings`

- middleware: `authenticateToken`
- body: `schema: updateRentReminderSettingsSchema`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- helpers: `reminderSettingsOf`

Review pending.

### GET `/api/trades/reminder-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### PUT `/api/trades/reminder-settings`

- middleware: `authenticateToken`
- body: `schema: updateTradeReminderSettingsSchema`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/trades/gst-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### PUT `/api/trades/gst-settings`

- middleware: `authenticateToken`
- body: `schema: updateTradeGstSettingsSchema`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Review pending.

### GET `/api/trades/clients`

- middleware: `authenticateToken`
- storageMethods: `getClientProfilesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Review pending.

### POST `/api/trades/clients`

- middleware: `authenticateToken`
- body: `schema: createClientProfileSchema`
- storageMethods: `createClientProfile`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Review pending.

### GET `/api/trades/clients/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares row.merchantId !== merchantId`
- storageMethods: `getClientProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### PUT `/api/trades/clients/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: updateClientProfileSchema`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `updateClientProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Review pending.

### POST `/api/trades/clients/:id/archive`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `archiveClientProfile`, `getClientProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/trades/clients/:id/unarchive`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `unarchiveClientProfile`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/trades/clients/:id/promote`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `updateClientProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/trades/clients/:id/events`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `getJobEventsByClient`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/trades/quotes`

- middleware: `authenticateToken`
- query: `status: raw`
- storageMethods: `getQuotesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Review pending.

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

Review pending.

### GET `/api/trades/quotes/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares row.merchantId !== merchantId`
- storageMethods: `getQuote`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/trades/quotes/:id/pdf`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares quote.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `getMerchant`, `getQuote`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`
- helpers: `streamQuotePdf`

Review pending.

### GET `/api/trades/quotes/token/:token/pdf`

- params: `token: raw`
- authChecks: `storage.getQuoteByToken`
- storageMethods: `getClientProfile`, `getMerchant`, `getQuoteByToken`
- statuses: `200`, `404`, `500`
- helpers: `streamQuotePdf`

Review pending.

### POST `/api/trades/quotes/:id/resend`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares quote.merchantId !== merchantId`
- storageMethods: `getOrCreateSubscription`, `getQuote`
- sideEffects: `email/SMS: sendTradeQuote`
- statuses: `200`, `401`, `402`, `403`, `404`, `409`, `500`, `502`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

Review pending.

### GET `/api/trades/quotes/token/:token`

- params: `token: raw`
- authChecks: `storage.getQuoteByToken`
- storageMethods: `createJobEvent`, `getClientProfile`, `getJobInvoicesByQuote`, `getMerchant`, `getQuoteByToken`, `updateQuote`
- statuses: `200`, `404`, `500`

Review pending.

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

Review pending.

### GET `/api/trades/invoices`

- middleware: `authenticateToken`
- query: `clientProfileId: raw`, `status: raw`
- storageMethods: `getJobInvoicesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Review pending.

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

Review pending.

### POST `/api/trades/invoices/:id/resend`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares invoice.merchantId !== merchantId`
- storageMethods: `getJobInvoice`, `getOrCreateSubscription`
- sideEffects: `email/SMS: resendTradeInvoice`
- statuses: `200`, `401`, `402`, `403`, `404`, `500`, `502`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

Review pending.

### POST `/api/trades/invoices/:id/send-balance`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares dep.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `createJobInvoice`, `getJobInvoice`, `getJobInvoicesByMerchant`, `getOrCreateSubscription`, `getQuote`
- sideEffects: `email/SMS: resendTradeInvoice`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `409`, `500`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `generateInvoiceToken`, `requireBillingCard`

Review pending.

### POST `/api/trades/invoices/:id/mark-paid-external`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: markJobPaidExternalSchema`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobInvoice`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Review pending.

### POST `/api/trades/invoices/:id/complete`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobInvoice`, `updateJobInvoice`
- statuses: `200`, `401`, `403`, `404`, `409`, `500`, `503`

Review pending.

### POST `/api/trades/invoices/:id/void`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `getJobInvoice`, `updateJobInvoice`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/trades/schedules`

- middleware: `authenticateToken`
- storageMethods: `getJobSchedulesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Review pending.

### POST `/api/trades/schedules`

- middleware: `authenticateToken`
- body: `schema: createJobScheduleSchema`
- authChecks: `compares client.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `createJobSchedule`, `getClientProfile`, `getOrCreateSubscription`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

Review pending.

### PUT `/api/trades/schedules/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- body: `schema: updateJobScheduleSchema`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobSchedule`, `updateJobSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Review pending.

### DELETE `/api/trades/schedules/:id`

- middleware: `authenticateToken`
- params: `id: raw`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobSchedule`, `terminateJobSchedule`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Review pending.

### GET `/api/internal/cron/status`

- authChecks: `authorizeCronRequest`, `constant-time comparison: crypto.timingSafeEqual`
- statuses: `200`, `401`, `503`

Reviewed policy:

- **Who:** cron. **Tenant (none):** no merchant data: whether a run is in progress, and the last run's summary
- **Input:** nothing is read but the x-cron-secret header
- **Idempotency:** read-only
- **Success:** { configured, running, startedAt, lastRun }
- **Error disclosure:** fixed
- **Authenticity:** x-cron-secret must equal CRON_SECRET, compared in constant time (authorizeCronRequest); 503 when CRON_SECRET is unset
- **Replay:** read-only
- **Rate:** none — the secret is the only gate

### POST `/api/internal/cron`

- authChecks: `authorizeCronRequest`, `constant-time comparison: crypto.timingSafeEqual`
- statuses: `200`, `207`, `401`, `409`, `500`, `503`
- helpers: `runPass`

Reviewed policy:

- **Who:** cron. **Tenant (system):** a scheduled run over every merchant's billing, invoices and reminders
- **Input:** nothing is read but the x-cron-secret header (link URLs come from getBaseUrl(req))
- **Idempotency:** one run at a time in this server process (409 while one runs); each pass is meant to act once per period. Another server instance can run at the same time (finding)
- **Side effects:** charges stored cards for due subscriptions (server/subscription-cron.ts); generates and sends property and trades invoices and reminders by email or SMS (server/property-cron.ts, server/trades-cron.ts, server/trades-delivery.ts); daily payout notifications (server/daily-payout-notifications.ts)
- **Success:** 200, or 207 when a pass failed: { ok, ranAt, failedPasses, and each pass's counts }
- **Error disclosure:** fixed
- **Authenticity:** x-cron-secret must equal CRON_SECRET, compared in constant time (authorizeCronRequest); 503 when CRON_SECRET is unset
- **Replay:** starts another run once the last has finished; each pass is meant to be idempotent per period
- **Rate:** none — the secret is the only gate
- **Finding:** Overlapping runs are refused only within one server process (the in-memory cronRunning flag): two instances can run the passes at once. Plan 13.3 (durable cron leases).
