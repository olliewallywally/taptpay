# R1-T2 route inventory — generated 2026-09-26 @ `a3e04c8f0dd6257211cd4596a2421060c91b3e10`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **216** (89 GET, 89 POST, 3 PATCH, 5 ALL, 21 PUT, 9 DELETE).

By principal: **public**: 56, **admin**: 30, **merchant-user**: 119, **provider-webhook**: 6, **api-key**: 3, **cron**: 2.

Unclassified (no known gate marker, no known public-design marker, and no
curated allowlist entry found near the handler — needs a human read, not
necessarily a bug): **0**.

## Review

70 of 216 routes reviewed (server/route-review.ts); 146 pending.
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
- **GET /api/transactions/:id:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it. With no rate limit, counting through the numbers lists every such sale of every business: item, price, time, business and board, and, since the by-number business read was retired (2026-09-26), each selling business's receipt details, which moved here.
- **POST /api/transactions/:id/receipt-pdf:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **GET /api/transactions/:id/receipt-qr:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **GET /api/windcave/callback:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it.
- **GET /api/windcave/callback:** Settles by a read then a write, not a claim, racing the notification (plan 22.7 / R3, C20).
- **POST /api/checkout/:token/split:** What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment, and is never checked again: the count can change until a share is paid, so a share opened at 1/12 then counts as 1/2 and the invoice shows paid with less money; shares opened at once are all charged the equal share, so the remainder's cents go uncharged. Same root as the session finding (R3).
- **POST /api/checkout/:token/session:** Every call opens another provider session and re-pins a single-payment invoice to it: a payment completed on an earlier session is then refused at completion (403) and missed by the notification, which finds invoices by their pinned session. The payer is charged and the invoice stays unpaid (R3: payment attempts).
- **POST /api/checkout/:token/session:** payerEmail, checked only against /.+@.+\..+/, is added to splitPayerEmails without limit (10 calls a minute per link), and every address gets the rent invoice's GST invoice once it is paid: a link holder can have the business email its tenant's name, address and rent to any number of addresses. Trades store the list but email only the client.
- **POST /api/checkout/:token/session:** What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment, and is never checked again: the count can change until a share is paid, so a share opened at 1/12 then counts as 1/2 and the invoice shows paid with less money; shares opened at once are all charged the equal share, so the remainder's cents go uncharged. Same root as the session finding (R3).
- **POST /api/checkout/:token/hosted-fields-complete:** A split invoice records none of the sessions opened for it, so its completion checks only that the provider approved the session the page sends: any approved session on the platform's provider account (another invoice's share, a $1 purchase anywhere) marks one share paid, one such session per share marks the invoice paid, and each is emailed a GST invoice once rent is paid. The single-payment branch was fixed 2026-09-26 (R1-T7's rule). Needs each opened session recorded (the payment attempts engine, R3, or an interim column): put to the owner 2026-09-26.
- **POST /api/checkout/:token/googlepay-complete:** A split invoice records none of the sessions opened for it, so its completion checks only that the provider approved the session the page sends: any approved session on the platform's provider account (another invoice's share, a $1 purchase anywhere) marks one share paid, one such session per share marks the invoice paid, and each is emailed a GST invoice once rent is paid. The single-payment branch was fixed 2026-09-26 (R1-T7's rule). Needs each opened session recorded (the payment attempts engine, R3, or an interim column): put to the owner 2026-09-26.
- **POST /api/checkout/:token/googlepay-complete:** The submit URLs are cached per link, not per session: when two payers of one split invoice open sessions, the first one's Google Pay payment goes to the second one's session, and both sessions are then counted as shares.
- **GET /api/checkout/callback:** Settles by a read then a write, not a claim, racing the notification (R3 / C20).
- **GET /api/trades/quotes/token/:token:** Returns the whole quote row, where the code's own comment asks for a narrow reply: with it the business's numeric id, the client profile id, the token, internal timestamps and documentUrl, a storage path (served to nobody since gap 13).
- **POST /api/trades/quotes/token/:token/respond:** Two acceptances at once can both pass the status check, and each issues and sends an invoice (a read then a write; R3 / C20).
- **POST /api/trades/quotes/token/:token/respond:** Returns the whole quote row, where the code's own comment asks for a narrow reply: with it the business's numeric id, the client profile id, the token, internal timestamps and documentUrl, a storage path (served to nobody since gap 13).
- **GET /api/auth/google/callback:** Until TRUST_PROXY_HOPS is set there is no limit: every request carrying a self-made cookie and state makes the server call Google's token endpoint, which refuses the made-up code. Phase B's live check switches the limit on.
- **POST /api/admin/auth/login:** While ADMIN_PASSWORD_HASH is unset (today, everywhere), the admin's email is answered 500 'Admin login unavailable' at once and every other email 401 after a full password check: the answer and its timing show which address is the admin's, against the owner's 2026-09-23 rule for sign-in. It ends when the owner sets the hash (npm run admin:password).
- **POST /api/auth/forgot-password:** A storage or email fault is answered as a success: requestPasswordReset returns false and the route ignores it, so the visitor is told a link was sent when none was. Partly deliberate: only a login's request writes and sends, so an error answered there would show which addresses have logins. A failed lookup, which fails alike for every address, could be answered 500 without that.
- **GET /api/auth/validate-reset-token/:token:** The reset page (client/src/pages/reset-password.tsx) shows 'Expired Reset Link' for a failed check as well as for an expired link, and offers only a new link: now that the server answers a fault with 500, the page still has to tell the two apart. R1-T9's rule, but this public page was not on its screen list: put to the owner 2026-09-26.
- **POST /api/auth/confirm-email:** The sign-up confirmation token is stored as it was sent, not hashed (reset and invite tokens keep only a SHA-256), and never expires: anyone who can read the merchants table holds every waiting application's link. Here the link alone confirms nothing (the password chosen at sign-up is asked for).
- **POST /api/merchants/signup:** The only limit on new applications is checkRateLimit, 100 a minute per visitor address in this process only. Until TRUST_PROXY_HOPS is set, visitors may all count as the proxy's address, and the same count serves GET /api/merchants/:id/active-transaction (which each open board page asks every 3 seconds) and POST /api/transactions/:id/pay: five open board pages can use it up, refusing sign-ups and board payments, and a run of sign-ups can refuse board customers. Each new address costs a bcrypt hash, a merchant row and an email.
- **GET /.well-known/apple-developer-merchantid-domain-association:** Were the file ever missing, sendFile's error would reach the global handler, which passes a 4xx error's own message on: a 404 naming the server's absolute path (shown with express's sendFile and the same pass-through, 2026-09-26). The file is in the repository, so only a broken deploy shows it; the pass-through itself belongs to the logs and redaction phase.
- **GET /api/merchants/:id/active-transaction:** A board's page gets 403 for a board that is not the business's or does not exist, and still gets a removed (inactive) board's open sale; the same board's stream answers 404 for all three. P2.2 asks for the tenant-safe 404 (R1-T3).
- **GET /api/merchants/:id/active-transaction:** Each poll from a board's page logs the visitor's address: every 3 seconds for every open board page (the logs and redaction phase).
- **GET /api/merchants/:id/events:** Nothing limits how many streams anyone holds open: each keeps a connection and a subscriber in this process's memory, so one script can hold thousands on any board's public stream (R1-T4 phase B's address limits, once TRUST_PROXY_HOPS is set).
- **GET /api/nfc/capabilities:** Only pages mounted nowhere ask for it (merchant-terminal.tsx, merchant-terminal-mobile.tsx; the stale bundles under client/public/app too). Retire it with them (dead code, R8).
- **POST /api/info-pack-leads:** Answers with the lead's sequential number, which the page never reads: it tells anyone how many leads there have been. A 201 with no number would do.

## Routes

| Method | Path | Line | Principal | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 433 | public | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 452 | public | generatePaymentUrl( |
| GET | `/nfc/:merchantId` | 466 | public | — |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 473 | public | — |
| GET | `/sitemap.xml` | 488 | public | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 571 | public | — |
| GET | `/api/auth/google/callback` | 592 | public | — |
| POST | `/api/auth/google/session` | 741 | public-bearer | — |
| POST | `/api/auth/sign-out-everywhere` | 764 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/auth/login` | 809 | public | — |
| POST | `/api/auth/forgot-password` | 866 | public | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 906 | public-bearer | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 946 | public-bearer | validateResetToken( |
| GET | `/api/admin/request-origin` | 965 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/auth/login` | 985 | public | — |
| GET | `/api/auth/me` | 1073 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/tutorial/state` | 1114 | merchant-user (heuristic) | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1144 | merchant-user (heuristic) | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1181 | merchant-user (heuristic) | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1202 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1283 | admin (heuristic) | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1296 | public | — |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1303 | public | — |
| GET | `/api/merchants/:id/stone/:stoneId/brand` | 1356 | public | publicBoardBrandDto( |
| GET | `/api/merchants/:id/profile` | 1378 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1400 | public-bearer | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1427 | public-bearer | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1455 | public-bearer | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1552 | public-bearer | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1565 | public-bearer | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1595 | public-bearer | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1671 | public-bearer | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 1971 | public-bearer | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 2023 | public-bearer | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2154 | public-bearer | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2188 | provider | — |
| GET | `/api/merchants/:id/active-transaction` | 2205 | merchant / public | authenticateToken, checkMerchantOwnership, publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2322 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2403 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2463 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2605 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| PATCH | `/api/transactions/:id/split-enabled` | 2656 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/split-payments/:id` | 2701 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2720 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/nfc-pay` | 2773 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2863 | public | — |
| POST | `/api/transactions/:id/pay` | 2877 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3129 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3143 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3181 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3254 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3277 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3338 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/analytics` | 3380 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/revenue-over-time` | 3395 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/analytics/export` | 3421 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/csv` | 3442 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/export/pdf` | 3508 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3548 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3593 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3611 | admin (heuristic) | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3624 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3640 | admin (heuristic) | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/rates` | 3691 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/merchants/:id/details` | 3698 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3724 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:id/bank-account` | 3806 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/merchants/:id/theme` | 3810 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3838 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3871 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3945 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 4000 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 4043 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 4060 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 4076 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4127 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 4162 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/admin/subscription-revenue` | 4198 | admin (heuristic) | authenticateAdmin |
| ALL | `/api/windcave/notification` | 4209 | provider | — |
| GET | `/api/windcave/callback` | 4331 | public | isTokenAddressedTransaction( |
| GET | `/api/admin/analytics` | 4529 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4602 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4638 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4675 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4740 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/merchants` | 4817 | admin (heuristic) | authenticateAdmin |
| PUT | `/api/admin/merchants/:id` | 4828 | admin (heuristic) | authenticateAdmin |
| POST | `/api/merchants/:id/test-payment-link` | 4856 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/merchants` | 4863 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4873 | admin (heuristic) | authenticateAdmin |
| DELETE | `/api/admin/merchants/:id` | 4889 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/clear-merchants` | 4913 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 4944 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/test-email` | 5002 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/email-status` | 5025 | admin (heuristic) | authenticateAdmin |
| POST | `/api/auth/confirm-email` | 5062 | public-bearer | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 5189 | public | — |
| POST | `/api/info-pack-leads` | 5219 | public | — |
| POST | `/api/merchants/signup` | 5272 | public | — |
| POST | `/api/admin/merchants/signup` | 5377 | admin (heuristic) | authenticateAdmin |
| GET | `/api/merchants/:id/events` | 5440 | merchant / public | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5516 | public | — |
| GET | `/api/push/vapid-key` | 5540 | public | — |
| POST | `/api/push/subscribe` | 5550 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/push/unsubscribe` | 5587 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/push/native-subscribe` | 5614 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5648 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/push/status` | 5682 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/push/preferences` | 5706 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/push/preferences` | 5720 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/merchants/:id/clear-transactions` | 5746 | merchant-user (heuristic) | authenticateToken, checkAccountOwnership, req.user?.role === "admin" |
| POST | `/api/transactions/:transactionId/refunds` | 5766 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 5904 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 5934 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/refunds/:refundId` | 5955 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/admin/api-keys` | 5989 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/api-keys` | 5993 | admin (heuristic) | authenticateAdmin |
| POST | `/api/admin/api-keys/:keyId/revoke` | 5997 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/api-metrics` | 6003 | admin (heuristic) | authenticateAdmin |
| GET | `/api/admin/api-usage` | 6007 | admin (heuristic) | authenticateAdmin |
| GET | `/api/merchants/:merchantId/stock-items` | 6016 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/merchants/:merchantId/stock-items` | 6035 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 6063 | merchant-user (heuristic) | authenticateToken |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 6100 | api-key (heuristic) | authenticateToken, authenticateApiKey, requireEcommerceApi |
| POST | `/api/v1/transactions` | 6168 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 6280 | api-key | authenticateApiKey, requireEcommerceApi |
| POST | `/api/payments/apple-pay/validate` | 6353 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/payments/apple-pay/process` | 6358 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/payments/google-pay/process` | 6363 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/subscription` | 6376 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6399 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/subscription/cancel` | 6462 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/subscription/resume` | 6505 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/team` | 6536 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6557 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6618 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6700 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6720 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6768 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6800 | public-bearer | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 6836 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 6866 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 6895 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 6941 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 7032 | provider | billingCardCallback |
| GET | `/api/billing/card/callback` | 7042 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 7043 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 7046 | merchant-user (heuristic) | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 7071 | merchant | authenticateToken |
| GET | `/uploads/:folder/:name` | 7136 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7352 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/property/tenants` | 7363 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/property/tenants/:id` | 7377 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/tenants/:id` | 7388 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/archive` | 7404 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:id/unarchive` | 7417 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/tenants/:id/events` | 7430 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/schedules` | 7446 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/property/tenants/:tenantId/schedules` | 7454 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/tenants/:tenantId/schedules` | 7465 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| PUT | `/api/property/schedules/:id` | 7483 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/property/schedules/:id` | 7502 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices` | 7517 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/property/invoices/document` | 7547 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7593 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/property/invoices` | 7622 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/resend` | 7664 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/invoices/:id` | 7679 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/void` | 7690 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7704 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/checkout/resolve/:token` | 7724 | public-bearer | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 7810 | public-bearer | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 7834 | public-bearer | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 7861 | public-bearer | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 7934 | public-bearer | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 7968 | public-bearer | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 8024 | public-bearer | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 8051 | provider | — |
| ALL | `/api/windcave/trades-notification` | 8068 | provider | — |
| POST | `/api/webhooks/whatsapp` | 8088 | provider | req.headers["apikey"] |
| PUT | `/api/merchants/:merchantId/sector` | 8124 | merchant-user (heuristic) | authenticateToken, checkMerchantOwnership |
| GET | `/api/property/reminder-settings` | 8149 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/property/reminder-settings` | 8159 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/reminder-settings` | 8176 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 8186 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/gst-settings` | 8199 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/trades/gst-settings` | 8215 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/clients` | 8232 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/clients` | 8240 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/clients/:id` | 8250 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/trades/clients/:id` | 8259 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 8270 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 8279 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8289 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8299 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes` | 8309 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/quotes` | 8316 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes/:id` | 8393 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8420 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8433 | public-bearer | getQuoteByToken( |
| POST | `/api/trades/quotes/:id/resend` | 8444 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/quotes/token/:token` | 8460 | public-bearer | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8505 | public-bearer | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8554 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices` | 8564 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/resend` | 8616 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8629 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8666 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8683 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8700 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/trades/schedules` | 8710 | merchant-user (heuristic) | authenticateToken |
| POST | `/api/trades/schedules` | 8717 | merchant-user (heuristic) | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8735 | merchant-user (heuristic) | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8748 | merchant-user (heuristic) | authenticateToken |
| GET | `/api/internal/cron/status` | 8762 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8772 | cron | authorizeCronRequest |

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

Reviewed policy:

- **Who:** public. **Tenant (none):** none: one fixed text for every caller
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** text/plain crawler rules: the signed-in screens, /nfc, /admin and /api/ disallowed, and the sitemap's address
- **Error disclosure:** fixed
- **Authenticity:** none needed: the same fixed content for every caller
- **Replay:** read-only
- **Rate:** none — no limit; nothing is looked up

### GET `/nfc/:merchantId/stone/:stoneId`

- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- statuses: `200`, `400`
- helpers: `nfcRedirectHtml`

Reviewed policy:

- **Who:** public. **Tenant (none):** none: nothing is read; the page only points to the board's customer page for the two numbers given (generatePaymentUrl), whether or not that board exists, and that page holds the board to its business
- **Input:** merchantId, stoneId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** a small HTML page, not stored by caches, that opens the board's page /pay/<business>/stone/<board>: Android in-app browsers through an intent:// address into Chrome, every other browser directly; the address starts with the configured public origin (the request's Host only in development)
- **Error disclosure:** fixed
- **Authenticity:** none needed: the page carries only the board page's address, built from the numbers in its own
- **Replay:** read-only
- **Rate:** none — no limit; nothing is read

### GET `/nfc/:merchantId`

- params: `merchantId: strictPositiveIntegerParam`
- statuses: `400`, `410`

Reviewed policy:

- **Who:** public. **Tenant (none):** none: the business-wide no-board address was retired on 2026-09-25 (server/no-board-address.ts); every well-formed number gets the same 410 notice, and nothing is read
- **Input:** merchantId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** none: 410 with the 'Ask for your payment link' page (noBoardAddressRetiredHtml), not stored by caches
- **Error disclosure:** fixed
- **Authenticity:** none needed: the same notice for every number
- **Replay:** read-only
- **Rate:** none — no limit; nothing is read

### GET `/.well-known/apple-developer-merchantid-domain-association`

- statuses: `200`

Reviewed policy:

- **Who:** public. **Tenant (none):** none: Apple Pay's domain verification file, the same for every caller
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** the file client/public/.well-known/apple-developer-merchantid-domain-association, labelled application/json
- **Error disclosure:** fixed
- **Authenticity:** none needed: a verification file Apple fetches, the same for every caller
- **Replay:** read-only
- **Rate:** none — no limit; one file from disk
- **Finding:** Were the file ever missing, sendFile's error would reach the global handler, which passes a 4xx error's own message on: a 404 naming the server's absolute path (shown with express's sendFile and the same pass-through, 2026-09-26). The file is in the repository, so only a broken deploy shows it; the pass-through itself belongs to the logs and redaction phase.

### GET `/sitemap.xml`

- statuses: `200`

Reviewed policy:

- **Who:** public. **Tenant (none):** none: a fixed list of the five public pages (the old line-slice classifier called it admin, from its neighbour's text)
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** application/xml sitemap of /, /signup, /login, /terms and /privacy on taptpay.com, dated today
- **Error disclosure:** fixed
- **Authenticity:** none needed: the same fixed content for every caller
- **Replay:** read-only
- **Rate:** none — no limit; nothing is looked up

### GET `/api/auth/google`

- statuses: `302`
- helpers: `googleSignInError`

Reviewed policy:

- **Who:** public. **Tenant (none):** no merchant data: starts a Google sign-in for whoever asks; Google then says who they are
- **Input:** nothing is read from the request; redirect_uri comes from getBaseUrl(req): the configured public origin, or in development the request's own Host
- **Capability gate:** Google sign-in configured (config.oauth.googleClientId, server/config.ts): without it the browser goes back to /login with an error
- **Idempotency:** each call starts a new sign-in: a fresh state and PKCE verifier replace this browser's cookie; nothing is stored
- **Success:** 302 to Google's consent page with the client id, redirect_uri, state and the PKCE challenge (S256); sets the HttpOnly state cookie (SameSite=Lax, 10 minutes, __Host- on https); Cache-Control no-store
- **Error disclosure:** fixed
- **Authenticity:** anyone: this only starts a sign-in, which Google authenticates and the callback checks
- **Replay:** harmless: a new call replaces this browser's pending sign-in
- **Rate:** none — it stores nothing and calls no one

### GET `/api/auth/google/callback`

- query: `code: raw`, `error: raw`, `state: raw`
- authChecks: `compares existingLogin.merchantId !== existingMerchant.id`, `compares existingLogin.role !== "owner"`, `verifyGoogleSignInState`
- storageMethods: `createAuthHandoffCode`, `createMerchantWithPassword`, `getMerchantByEmail`, `getUserByEmail`, `settleAuthThrottle`, `takeAuthThrottleSlot`, `updateMerchant`
- sideEffects: `outbound http: fetch`
- statuses: `302`
- rateLimits: `tooManyAttempts`
- helpers: `googleSignInError`

Reviewed policy:

- **Who:** public. **Tenant (credentials):** the login Google's verified email names: the owner of an existing verified or active merchant (linked to one Google id, never re-linked), or a new verified merchant when the address has neither a merchant nor a login. Refused: an email Google has not verified, an address whose login belongs to another merchant or is not its owner (the existingLogin comparisons), a pending or suspended merchant, a merchant linked to another Google id
- **Input:** query read raw: code (sent to Google with this browser's PKCE verifier), state (must equal the state cookie's, compared in constant time by verifyGoogleSignInState; both halves must be 43 base64url characters) and error (only its presence is used)
- **Capability gate:** Google sign-in configured (config.oauth.googleClientId and googleClientSecret, server/config.ts): without them the browser goes back to /login with an error
- **Idempotency:** the state cookie is cleared on every call; a new Google user gets one merchant (two first sign-ins at once: the second fails on the unique email and is asked to try again); an existing merchant is linked to the Google id once; each success stores a new one-time handoff code
- **Side effects:** asks Google to exchange the code (oauth2.googleapis.com/token, with the client secret and the PKCE verifier) and for the profile (googleapis.com/oauth2/v2/userinfo); for a new Google user, creates a verified merchant (createMerchantWithPassword) and its owner login (createUser, server/auth.ts, which keeps an existing password)
- **Success:** 302 to /login?google=complete, with the one-time handoff code in a second HttpOnly cookie (SameSite=Strict, 60 seconds): never a token in an address. Every refusal is a 302 to /login?error=<a fixed message>
- **Error disclosure:** fixed
- **Authenticity:** Google's authorization code, exchanged with the PKCE verifier from this browser's state cookie, and Google's word that the email is verified. The returned state must equal the cookie's, which stops login CSRF and makes a stolen code useless. The server keeps no record of the pair, so a script can present one of its own making; that gets it only Google's refusal of a made-up code
- **Replay:** Google accepts a code once; a replayed cookie and state make the server ask Google again, which refuses the spent code
- **Rate:** tooManyAttempts after takeAuthThrottleSlot per visitor address (20 free, then waits from 30 s), counted before Google is asked, only once TRUST_PROXY_HOPS is set (R1-T4 phase B, off by default): until then no limit. A success gives its count back
- **Finding:** Until TRUST_PROXY_HOPS is set there is no limit: every request carrying a self-made cookie and state makes the server call Google's token endpoint, which refuses the made-up code. Phase B's live check switches the limit on.

### POST `/api/auth/google/session`

- authChecks: `storage.consumeAuthHandoffCode`
- storageMethods: `consumeAuthHandoffCode`
- statuses: `200`, `401`, `403`, `500`
- helpers: `expired`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the one-time handoff code in this browser's cookie selects the one login the callback signed in: only its SHA-256 is looked up, and storage.consumeAuthHandoffCode spends it in one statement (unknown, spent, or older than 60 seconds: 401 GOOGLE_SIGN_IN_EXPIRED)
- **Input:** only the handoff cookie, refused unless it is 43 base64url characters (handoffCodeHash); the body is not read
- **Idempotency:** one-time: the first redemption spends the code (of two at once, exactly one succeeds); the cookie is cleared on every call
- **Success:** { token, merchantId, newUser }: the account token in the body only, Cache-Control no-store. 403 ACCOUNT_UNAVAILABLE when the login is no longer active, its merchant neither verified nor active, or a member over the seat limit (issueTokenForUserId, server/auth.ts)
- **Error disclosure:** fixed
- **Authenticity:** the one-time code the callback set in this browser's cookie. SameSite=Strict, so another site cannot make the browser redeem it
- **Replay:** refused: the code is spent on first use
- **Rate:** none — a 32-byte code that lives 60 seconds cannot be guessed

### POST `/api/auth/sign-out-everywhere`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === 'admin'`
- storageMethods: `advanceUserSessionVersion`, `deactivatePushSubscriptionsForLogin`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `204`, `401`, `403`, `404`, `500`, `503`

Review pending.

### POST `/api/auth/login`

- body: `schema: loginSchema`
- authChecks: `authenticateUser`
- storageMethods: `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`, `signInAddressBuckets`

Reviewed policy:

- **Who:** public. **Tenant (credentials):** the login the email names, when its password matches (authenticateUser: the password is checked at full cost for every email, one with no login included; then the login must be active, its merchant verified or active, and a member within the seat limit). Every refusal is the same 401
- **Input:** body: loginSchema (400 with its issues)
- **Idempotency:** each success issues another one-hour token and records the login time; each failure counts against the email (or this device) and, once addresses are told apart, the visitor's address
- **Side effects:** security audit log entries (logSecurityEvent: LOGIN_SUCCESS, FAILED_LOGIN, LOGIN_SLOWED, LOGIN_ERROR), with the email and address
- **Success:** { token, user: { id, email, merchantId, role } }; sets the known-device cookie
- **Error disclosure:** input-issues
- **Authenticity:** the email and its password
- **Replay:** a replayed success issues another token; a replayed failure counts again
- **Rate:** takeAuthThrottleSlot before the password is checked: per email (a device that has signed in with it is counted on its own), 5 free, then waits from 30 s doubling to 15 minutes, never a lockout; per visitor address (50 free) once TRUST_PROXY_HOPS is set (R1-T4 phase B). Counted in the database, so across server instances

### POST `/api/auth/forgot-password`

- body: `schema: forgotPasswordSchema`
- storageMethods: `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

Reviewed policy:

- **Who:** public. **Tenant (mailbox):** the login the email names, reached only by email to that address: only an active owner or member login is sent a link (requestPasswordReset, server/auth.ts); the answer is the same for every address
- **Input:** body: forgotPasswordSchema (400 with its issues)
- **Idempotency:** each request for a login replaces its live link (a new token, valid one hour); counted before any link is made, so a refused request leaves the link already sent working
- **Side effects:** for an active login, stores the hash of a new reset token and emails the link (requestPasswordReset → sendPasswordResetEmail, server/auth.ts); security audit log (logSecurityEvent: PASSWORD_RESET_SLOWED)
- **Success:** one fixed message for every address, never sooner than ACCOUNT_EMAIL_REPLY_FLOOR_MS after the request began (owner decision 2026-09-23), so neither the answer nor its timing tells which addresses have accounts
- **Error disclosure:** input-issues
- **Authenticity:** none needed: the link goes only to the address's own mailbox
- **Replay:** each replay replaces the live link and sends another email, within the limit
- **Rate:** takeAuthThrottleSlot per email asked, whether or not it has a login (3 free, then waits from 5 minutes doubling to an hour), and per visitor address (10 free) once TRUST_PROXY_HOPS is set; in the database
- **Finding:** A storage or email fault is answered as a success: requestPasswordReset returns false and the route ignores it, so the visitor is told a link was sent when none was. Partly deliberate: only a login's request writes and sends, so an error answered there would show which addresses have logins. A failed lookup, which fails alike for every address, could be answered 500 without that.

### POST `/api/auth/reset-password`

- body: `schema: resetPasswordSchema`
- authChecks: `resetPassword`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `forgetAuthThrottle`, `getUserById`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `500`
- errorTextInResponse: `validation.error.errors`, `validation.error.issues`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the reset token (32 random bytes, hex) selects the one login it was sent to: only its SHA-256 is looked up; it must be live (one hour), the login active and an owner or member (resetPassword, server/auth.ts); storage.resetUserPasswordByToken spends it in the statement that sets the password
- **Input:** body: resetPasswordSchema: the token and a new password meeting the one password rule, with its confirmation (400 with the first issue and the issues)
- **Idempotency:** one-time: the token is spent with the new password in one statement, and a second use is 400. A storage fault is 500 and changes nothing, so the same link can be tried again (until 2026-09-26 a fault was answered 400 'Invalid or expired reset token')
- **Side effects:** ends every session of the login (its session version, advanced in the same statement), closes its live streams (sseBroker.disconnectUser) and stops its devices' notifications; forgives its sign-in slow-downs
- **Success:** { message }; marks this browser as a known device for the login
- **Error disclosure:** input-issues
- **Authenticity:** holding the emailed reset link: its token is the credential for that one login's reset
- **Replay:** refused: the token is spent in the statement that sets the password
- **Rate:** none — the token is 32 random bytes and only its hash is looked up, so it cannot be guessed; a password is hashed only once a live token is found

### GET `/api/auth/validate-reset-token/:token`

- params: `token: raw`
- authChecks: `validateResetToken`
- statuses: `200`, `500`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the reset token selects the one login it was sent to: only its SHA-256 is looked up (validateResetToken, server/auth.ts); valid while live, for an active owner or member login
- **Input:** token: read raw, then only its SHA-256 is looked up
- **Idempotency:** read-only
- **Success:** { valid }. A storage fault is 500, not { valid: false } (until 2026-09-26 the helper answered a fault as an expired link, against this route's own comment)
- **Error disclosure:** fixed
- **Authenticity:** holding the emailed reset link
- **Replay:** read-only
- **Rate:** none — the token cannot be guessed, and each call is one read by its hash
- **Finding:** The reset page (client/src/pages/reset-password.tsx) shows 'Expired Reset Link' for a failed check as well as for an expired link, and offers only a new link: now that the server answers a fault with 500, the page still has to tell the two apart. R1-T9's rule, but this public page was not on its screen list: put to the owner 2026-09-26.

### GET `/api/admin/request-origin`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `503`
- helpers: `authenticateAdmin`

Review pending.

### POST `/api/admin/auth/login`

- body: `schema: loginSchema`
- authChecks: `checkPasswordEvenly`
- storageMethods: `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `429`, `500`
- errorTextInResponse: `validation.error.errors`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`, `signInAddressBuckets`

Reviewed policy:

- **Who:** public. **Tenant (credentials):** the platform admin: the configured admin email (compared without regard to case) and ADMIN_PASSWORD_HASH; any other email is refused after the same work (checkPasswordEvenly with the admin hash's budget)
- **Input:** body: loginSchema (400 with its issues)
- **Idempotency:** each success issues another one-hour admin token; each failure counts against the email (or this device) and the visitor's address
- **Side effects:** security audit log entries (logSecurityEvent: ADMIN_LOGIN_SUCCESS, ADMIN_FAILED_LOGIN, ADMIN_LOGIN_SLOWED, ADMIN_LOGIN_ERROR)
- **Success:** { token, user: { id: 1, email, merchantId: 0, role: 'admin' } }: a one-hour token under the dedicated admin principal; sets the admin known-device cookie
- **Error disclosure:** input-issues
- **Authenticity:** the admin email and its password
- **Replay:** a replayed success issues another token; a replayed failure counts again
- **Rate:** takeAuthThrottleSlot before the password is checked: per email (a device that has signed in with it is counted on its own), 5 free, then waits from 30 s doubling to 15 minutes, never a lockout; per visitor address (50 free) once TRUST_PROXY_HOPS is set (R1-T4 phase B). Counted in the database, so across server instances; the admin's buckets are its own
- **Finding:** While ADMIN_PASSWORD_HASH is unset (today, everywhere), the admin's email is answered 500 'Admin login unavailable' at once and every other email 401 after a full password check: the answer and its timing show which address is the admin's, against the owner's 2026-09-23 rule for sign-in. It ends when the owner sets the hash (npm run admin:password).

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

Reviewed policy:

- **Who:** public. **Tenant (none):** none: the business-wide no-board address was retired on 2026-09-25 (server/no-board-address.ts); every well-formed number gets the same 410 notice, and nothing is read
- **Input:** id: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** none: 410 NO_BOARD_ADDRESS_RETIRED; a board's QR is GET /api/merchants/:id/stone/:stoneId/qr, a sale's comes with its own link
- **Error disclosure:** fixed
- **Authenticity:** none needed: the same notice for every number
- **Replay:** read-only
- **Rate:** none — no limit; nothing is read

### GET `/api/merchants/:id/stone/:stoneId/qr`

- params: `id: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- query: `download: raw`, `size: strictBoundedIntegerQueryParam`
- authChecks: `compares stone.merchantId !== merchantId`
- storageMethods: `getTaptStone`
- statuses: `200`, `400`, `404`, `500`

Reviewed policy:

- **Who:** public. **Tenant (board):** the board must exist and belong to the business in the path (getTaptStone; 404 otherwise, the same for both); a board's printed QR is public by design
- **Input:** id, stoneId: strictPositiveIntegerParam; size: strictBoundedIntegerQueryParam (400 pixels when absent, at most 1000; a malformed size is refused with 400); download: only the exact text 'true' asks for an attachment
- **Idempotency:** read-only
- **Success:** a PNG QR code of the board's page address (/pay/<business>/stone/<board>), cached publicly for 30 days
- **Error disclosure:** fixed
- **Authenticity:** none: a board's printed QR is public by design; both numbers are sequential, so anyone can make any board's QR by counting
- **Replay:** read-only
- **Rate:** none — no limit

### GET `/api/merchants/:id/stone/:stoneId/brand`

- params: `id: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- authChecks: `compares stone.merchantId !== merchantId`
- storageMethods: `getMerchant`, `getTaptStone`
- statuses: `200`, `400`, `404`, `500`
- dtos: `publicBoardBrandDto`

Reviewed policy:

- **Who:** public. **Tenant (board):** the board must be one of the business's active boards (getTaptStone; 404 otherwise, the same for a missing one, a removed one and another business's); a board's page is public by design and shows the name and logo the printed board does
- **Input:** id, stoneId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** publicBoardBrandDto: the business's name and logo address only; it replaced the retired by-number business read for a board's page (owner decision 2026-09-26)
- **Error disclosure:** fixed
- **Authenticity:** none: a board's printed name and logo are public by design; both numbers are sequential, so anyone can read any board's business name and logo by counting, but only for a real, active board
- **Replay:** read-only
- **Rate:** none — no limit

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

Reviewed policy:

- **Who:** merchant (owner, member, platform admin) — an Authorization header is sent. **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; its newest open sale on any board, or on the board asked for, including a sale with its own link
- **Who:** public — no Authorization header, with a stoneId (without one: 410 NO_BOARD_ADDRESS_RETIRED). **Tenant (board):** a board's customer page: the board (stoneId) must belong to the business in the path, and only that board's open sale is shown, never a sale with its own link; a board that is not the business's, or does not exist, is 403
- **Input:** id: strictPositiveIntegerParam; stoneId: strictPositiveIntegerQueryParam when present (400 otherwise)
- **Idempotency:** read-only
- **Success:** the open sale or null, not cached: to the business, ownerTransactionDto; to the board's page, publicTransactionDto; each with the board's page and QR addresses for a board sale
- **Error disclosure:** fixed
- **Authenticity:** none: a board's page is public by design (owner 2026-09-25: with a board, its own page and stream are unchanged); the business and board numbers are both sequential, so anyone can follow any board's open sale, its item and price, by counting
- **Replay:** read-only
- **Rate:** the board's page: checkRateLimit (100 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B), which each open board page spends every 3 seconds and sign-up and numbered pay share; the signed-in branch: none
- **Finding:** A board's page gets 403 for a board that is not the business's or does not exist, and still gets a removed (inactive) board's open sale; the same board's stream answers 404 for all three. P2.2 asks for the tenant-safe 404 (R1-T3).
- **Finding:** Each poll from a board's page logs the visitor's address: every 3 seconds for every open board page (the logs and redaction phase).

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

Reviewed policy:

- **Who:** public. **Tenant (none):** none: the platform's own settings
- **Input:** nothing (the User-Agent is no longer read: R0-T5)
- **Capability gate:** reports config.features.tapToPay (Tap to Pay's switch) and nothing else; the wallets always report false, their routes being retired
- **Idempotency:** read-only
- **Success:** { nfcSupported, applePay, googlePay, samsungPay, contactlessCard, webNFC, recommendations }
- **Error disclosure:** fixed
- **Authenticity:** none needed: the platform's own settings, none of them secret
- **Replay:** read-only
- **Rate:** none — no limit; nothing is looked up
- **Finding:** Only pages mounted nowhere ask for it (merchant-terminal.tsx, merchant-terminal-mobile.tsx; the stale bundles under client/public/app too). Retire it with them (dead code, R8).

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

Reviewed policy:

- **Who:** public. **Tenant (none):** none: the platform's own payment settings
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { env, applePayMerchantId, googlePayMerchantId, googlePayEnv }: what the checkout page's card fields and wallet buttons need, all of which reaches the browser anyway
- **Error disclosure:** fixed
- **Authenticity:** none needed: the platform's own settings, none of them secret
- **Replay:** read-only
- **Rate:** none — no limit; nothing is looked up

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
- storageMethods: `getMerchant`, `getTransaction`
- statuses: `200`, `400`, `404`, `500`
- dtos: `publicBusinessDto`, `publicTransactionDto`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's sequential number selects it, for any business; only a sale with its own link (isTokenAddressedTransaction) is hidden (404)
- **Input:** id: strictPositiveIntegerParam
- **Idempotency:** read-only
- **Success:** publicTransactionDto: id, business id, board id, item, price, status, method, split counts and date, and the board's page address; with merchant: publicBusinessDto, the business's name, address, phone, GST number, NZBN, logo and theme (since 2026-09-26, when the by-number business read was retired; never the contact email or the holder's name)
- **Error disclosure:** fixed
- **Authenticity:** anyone with the sale's number: numbers are sequential, so every board, cash and tap-to-pay sale can be found by counting
- **Replay:** read-only
- **Rate:** none — no limit
- **Finding:** Addressed by a guessable sequential number and held to nobody: the gap-12 memo's 'adjacent surface'. Board sales still use numbers (boards are kept, owner 2026-09-25); plan §10.3 (numbered pay converges on the token attempt service or is retired, R3) closes it. With no rate limit, counting through the numbers lists every such sale of every business: item, price, time, business and board, and, since the by-number business read was retired (2026-09-26), each selling business's receipt details, which moved here.

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
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`, `storage.verifyMerchant`
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
- sideEffects: `audit log: logSecurityEvent`, `email: sendMerchantVerificationEmail`
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

### POST `/api/auth/confirm-email`

- body: `fields: password, token`
- authChecks: `storage.getMerchantByToken`
- storageMethods: `confirmMerchantEmail`, `getMerchantByToken`, `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `email: sendEmail`
- statuses: `200`, `400`, `429`, `500`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `escHtml`, `refuseTooManyAttempts`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the confirmation token selects the one application it was sent for (storage.getMerchantByToken), and the password chosen at sign-up must match it (owner decision 2026-09-23); an application without a chosen password cannot be confirmed online
- **Input:** body read without a schema: token and password, each used only when it is a string (400 when the token is missing)
- **Idempotency:** one-time: confirmMerchantEmail clears the token as it confirms the application and activates its pending subscription, in one transaction; a second use is 400
- **Side effects:** for a complete application, emails it to the owner's inbox (sendEmail to oliver@taptpay.co.nz, the text escaped); refreshes the login store (syncVerifiedMerchants, server/auth.ts)
- **Success:** { message, merchantId }
- **Error disclosure:** fixed
- **Authenticity:** holding the emailed link and the password chosen at sign-up
- **Replay:** refused once confirmed: the token is cleared
- **Rate:** takeAuthThrottleSlot per link before the password is checked: 5 wrong passwords, then waits from 30 s doubling to 15 minutes, as sign-in; in the database
- **Finding:** The sign-up confirmation token is stored as it was sent, not hashed (reset and invite tokens keep only a SHA-256), and never expires: anyone who can read the merchants table holds every waiting application's link. Here the link alone confirms nothing (the password chosen at sign-up is asked for).

### POST `/api/auth/resend-confirmation`

- body: `fields: email`
- storageMethods: `getMerchantByEmail`, `takeAuthThrottleSlot`
- sideEffects: `email: sendMerchantVerificationEmail`
- statuses: `200`, `400`, `429`, `500`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

Reviewed policy:

- **Who:** public. **Tenant (mailbox):** the application the email names, reached only by email to its own address: only one still waiting to be confirmed is sent its link again; the answer is the same for every address (owner decision 2026-09-23). Asking by account number was removed on 2026-09-26 (owner decision)
- **Input:** body read without a schema: email, checked with forgotPasswordSchema (400 otherwise; an account number alone is 400 too)
- **Idempotency:** each request sends the same link again; the token is not replaced
- **Side effects:** for a waiting application, emails its confirmation link again (sendMerchantVerificationEmail)
- **Success:** one fixed message for every address, never sooner than ACCOUNT_EMAIL_REPLY_FLOOR_MS after the request began (owner decision 2026-09-23), so neither the answer nor its timing tells which addresses have accounts
- **Error disclosure:** fixed
- **Authenticity:** none needed: the link goes only to the application's own address
- **Replay:** each replay sends the link again, within the limit
- **Rate:** takeAuthThrottleSlot per address asked, whether or not one is waiting: 3 free, then waits from 5 minutes doubling to an hour; in the database

### POST `/api/info-pack-leads`

- body: `schema: createInfoPackLeadSchema`
- storageMethods: `createInfoPackLead`
- sideEffects: `email: sendEmail`
- statuses: `201`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.issues`
- rateLimits: `checkResendRateLimit`, `resendRateLimitMap.get`, `resendRateLimitMap.set`
- helpers: `checkResendRateLimit`

Reviewed policy:

- **Who:** public. **Tenant (none):** none: a new sales lead for the platform itself (a name and an address), tied to no business
- **Input:** body: createInfoPackLeadSchema (a name of 1 to 100 characters and an email address; 400 with the first issue and the issues)
- **Idempotency:** none: every request stores another lead and notifies again
- **Side effects:** emails the lead's name and address to the platform admin's address (sendEmail, not waited for)
- **Success:** 201 { id }: the new lead's sequential number
- **Error disclosure:** input-issues
- **Authenticity:** none needed: a lead is only what someone typed, and only the platform's own inbox is emailed
- **Replay:** each replay stores another lead and emails the admin again, within the limit
- **Rate:** checkResendRateLimit: 5 per 10 minutes per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor may share one address, so a sixth request in ten minutes from anyone refuses everyone (R1-T4 phase B)
- **Finding:** Answers with the lead's sequential number, which the page never reads: it tells anyone how many leads there have been. A 201 with no number would do.

### POST `/api/merchants/signup`

- body: `schema: publicSignupSchema`
- storageMethods: `createMerchantWithSignup`, `getMerchantByEmail`, `getUserByEmail`, `takeAuthThrottleSlot`
- sideEffects: `audit log: logSecurityEvent`, `email: sendExistingAccountNoticeEmail`, `email: sendMerchantVerificationEmail`
- statuses: `200`, `400`, `429`, `500`
- errorTextInResponse: `validation.error.issues`
- rateLimits: `checkRateLimit`
- helpers: `checkRateLimit`, `replyToSignup`

Reviewed policy:

- **Who:** public. **Tenant (mailbox):** a new pending application for the address named, usable only once its emailed link is used with the password chosen here; for an address that already has a merchant or a login, a note to that address instead. The answer is the same either way (owner decision 2026-09-23)
- **Input:** body: publicSignupSchema (400 with the first issue and the issues)
- **Idempotency:** a new address creates one pending application; asking again for the same address (now in use) sends that address a note instead, three, then slowed down (signupNoticeBucket)
- **Side effects:** creates a pending merchant with its application (createMerchantWithSignup); emails the confirmation link (sendMerchantVerificationEmail) or, for an address in use, a note (sendExistingAccountNoticeEmail); security audit log (logSecurityEvent: SIGNUP_RATE_LIMITED)
- **Success:** one fixed message ('Check your email to continue.'), never sooner than SIGN_UP_REPLY_FLOOR_MS after the request began; no account number
- **Error disclosure:** input-issues
- **Authenticity:** none needed: nothing made here can be used until the link sent to the address is used with the password chosen here
- **Replay:** for an address in use, a replay sends a note, within its limit; it creates nothing
- **Rate:** checkRateLimit (100 a minute per visitor address, counted in this server process only; until TRUST_PROXY_HOPS is set every visitor shares one address — R1-T4 phase B); that count is shared with the board page's feed and the numbered pay route
- **Finding:** The only limit on new applications is checkRateLimit, 100 a minute per visitor address in this process only. Until TRUST_PROXY_HOPS is set, visitors may all count as the proxy's address, and the same count serves GET /api/merchants/:id/active-transaction (which each open board page asks every 3 seconds) and POST /api/transactions/:id/pay: five open board pages can use it up, refusing sign-ups and board payments, and a run of sign-ups can refuse board customers. Each new address costs a bcrypt hash, a merchant row and an email.

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

Reviewed policy:

- **Who:** merchant (owner, member, platform admin) — an Authorization header is sent. **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business, labelled admin on its stream; every live event of the business
- **Who:** public — no Authorization header, with a stoneId (without one: 410 NO_BOARD_ADDRESS_RETIRED). **Tenant (board):** a board's customer page: the board (stoneId) must belong to the business in the path, and only that board's open sale is shown, never a sale with its own link; the board must also be active, and anything else is 404 (sse-broker.ts sends a board's stream only its own board's events)
- **Input:** id: strictPositiveIntegerParam; stoneId: strictPositiveIntegerQueryParam (400 otherwise); a token in the query is refused (400: credentials go in the Authorization header)
- **Idempotency:** each request opens another stream; closing it unsubscribes
- **Side effects:** subscribes the connection to the business's live updates (sseBroker.subscribe): the business's own view (its sales and refunds) or the board's (publicTransactionDto of that board's sales)
- **Success:** text/event-stream, not cached: a 'connected' event, then the audience's events
- **Error disclosure:** fixed
- **Authenticity:** none: a board's page is public by design (owner 2026-09-25: with a board, its own page and stream are unchanged); the business and board numbers are both sequential, so anyone can follow any board's open sale, its item and price, by counting
- **Replay:** each replay opens another stream
- **Rate:** none — no limit on requests, nor on the streams one visitor holds open
- **Finding:** Nothing limits how many streams anyone holds open: each keeps a connection and a subscriber in this process's memory, so one script can hold thousands on any board's public stream (R1-T4 phase B's address limits, once TRUST_PROXY_HOPS is set).

### GET `/api/push/capabilities`

- statuses: `200`

Reviewed policy:

- **Who:** public. **Tenant (none):** none: the platform's own settings
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { webPush: { available, reason }, nativePush: { available, reason, bundleId } }: whether each way of sending notifications is set up, and the iOS app's bundle id (public in the App Store)
- **Error disclosure:** fixed
- **Authenticity:** none needed: the platform's own settings, none of them secret
- **Replay:** read-only
- **Rate:** none — no limit; nothing is looked up

### GET `/api/push/vapid-key`

- statuses: `200`, `503`

Reviewed policy:

- **Who:** public. **Tenant (none):** none: the platform's own settings
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { publicKey }: the web-push public key a browser needs to subscribe, public by design; 503 while web push is not set up
- **Error disclosure:** fixed
- **Authenticity:** none needed: the platform's own settings, none of them secret
- **Replay:** read-only
- **Rate:** none — no limit; nothing is looked up

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invite token (32 random bytes, hex) selects the one invited login it was sent for (storage.getUserByInviteToken, by its SHA-256): the login must still be invited and the invite unexpired; activateInvitedUser spends the token in the statement that activates the login
- **Input:** body: acceptInviteSchema: the token, an optional name of up to 100 characters, and a password meeting the one password rule with its confirmation (400 with the first issue and the issues)
- **Idempotency:** one-time: the token is burned as the login is activated; a second use is 400
- **Side effects:** security audit log (logSecurityEvent: TEAM_INVITE_ACCEPTED)
- **Success:** { message } only; no token: the new teammate signs in
- **Error disclosure:** input-issues
- **Authenticity:** holding the emailed invite link
- **Replay:** refused: the token is burned
- **Rate:** none — the token is 32 random bytes and only its hash is looked up, so it cannot be guessed; a password is hashed only once a live token is found

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

- middleware: `authenticateToken`, `express.json(…)`
- body: `schema: boardPrintRequestSchema`
- authChecks: `compares stone.merchantId !== merchantId`
- storageMethods: `getMerchant`, `getTaptStone`, `settleAuthThrottle`, `takeAuthThrottleSlot`
- sideEffects: `email: sendBoardBuilderEmail`
- statuses: `200`, `400`, `401`, `403`, `404`, `429`, `500`, `502`, `503`
- errorTextInResponse: `validation.error.issues`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business, from its record (owner decision 2026-09-26): the body names no business, and its board (stoneId) must be one of that business's active boards (404 otherwise, the same for a missing one); the platform admin, with no business, is refused (403)
- **Input:** body: boardPrintRequestSchema, strict (400 with the first issue and the issues): a base64 PDF of at most 2 MB that must start %PDF- (decodeBoardPrintPdf), the board's number, one of the two layouts, the sender's name and email. Parsed only after authenticateToken, up to 3 MB (BOARD_PRINT_JSON_LIMIT; 413 above it); the pipeline's 100 KB parser skips this route (server/app.ts)
- **Idempotency:** none: every accepted request sends another email, within the limit
- **Side effects:** emails the PDF as an attachment, with the business's and board's names from their records, to the fixed print inbox (sendBoardBuilderEmail, built by server/board-print.ts); a failed send gives its count back
- **Success:** { message: 'Board submitted successfully' }; 502 when the email could not be sent
- **Error disclosure:** input-issues

### GET `/uploads/:folder/:name`

- params: `folder: raw`, `name: raw`
- storageMethods: `getUploadedFile`
- sideEffects: `file system: fs.existsSync`
- statuses: `200`, `400`, `404`, `500`

Reviewed policy:

- **Who:** public. **Tenant (none):** none by design: only the logos folder is public (PUBLIC_UPLOAD_FOLDERS, server/upload-policy.ts), checked before the database or the disk; any other folder, invoice documents in particular, is 404 like a missing file (gap 13, Option C, owner 2026-09-14)
- **Input:** folder: must be in PUBLIC_UPLOAD_FOLDERS (404 otherwise); name: refused if it contains '..' (400), then looked up as <folder>/<name>; both are read raw, as an allowlist key and a lookup key
- **Idempotency:** read-only
- **Side effects:** a legacy logo the database lacks is read from the uploads folder on disk (fs.existsSync, then sendFile)
- **Success:** the logo's bytes with its stored type and nosniff (a database copy is cached publicly for 5 minutes)
- **Error disclosure:** fixed
- **Authenticity:** none: logos are shown to customers on the payment pages, so anyone with a logo's address may fetch it
- **Replay:** read-only
- **Rate:** none — no limit

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404
- **Input:** token: read raw, then looked up (only a real token finds an invoice)
- **Idempotency:** read-only
- **Success:** for a payable invoice: vertical, invoice id, amount, due date, status, the business's id, name and logo, the payer's name, address and co-tenants, kind and charge type, rent frequency or the quote's total and deposit terms, the description, a token-scoped document link (gap 13) and the split state; for a paid one only { alreadyPaid, amountCents }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else
- **Replay:** read-only
- **Rate:** tokenRateLimit (10 a minute per token, counted in this server process only; an unknown token gets a count of its own, so it limits one link's use, not guessing, which a 160-bit token makes futile)

### GET `/api/checkout/document/:token`

- params: `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `consumeInvoiceDocumentReadLimit`, `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `getUploadedFileForMerchant`
- statuses: `200`, `404`, `410`, `429`, `500`, `503`
- rateLimits: `storage.consumeInvoiceDocumentReadLimit`
- helpers: `sendPrivateDocument`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404; the file must be the invoice's own attachment and belong to the invoice's business (getUploadedFileForMerchant)
- **Input:** token: must match /^[A-Za-z0-9_-]{1,200}$/ (404 otherwise), then looked up
- **Idempotency:** read-only (each read spends the link's read budget)
- **Success:** the attached document's bytes, with its stored type, Cache-Control private, no-store and nosniff (sendPrivateDocument)
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else
- **Replay:** read-only
- **Rate:** storage.consumeInvoiceDocumentReadLimit: 10 a minute per real link, shared through the database; an unknown link is 404 before it, and a limiter outage is 503 (fails closed)

### POST `/api/checkout/:token/split`

- params: `token: raw`
- body: `schema: z.object({ count: z.number().int().min(2).max(12) }).strict()`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `updateInvoiceRentRequest`, `updateJobInvoice`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- rateLimits: `tokenRateLimit`
- helpers: `tokenRateLimit`, `updateCheckoutInvoice`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404
- **Input:** token: read raw, then looked up; body: count, a whole number from 2 to 12, strict (400 otherwise; parseInt until 2026-09-26)
- **Idempotency:** sets the invoice's share count; refused once a share is paid (409) and when the business has not allowed splitting (400)
- **Success:** { splitCount, splitPaidCount: 0, shareCents }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else
- **Replay:** the same count again changes nothing; another count is taken until a share is paid (finding)
- **Rate:** tokenRateLimit (10 a minute per token, counted in this server process only; an unknown token gets a count of its own, so it limits one link's use, not guessing, which a 160-bit token makes futile)
- **Finding:** What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment, and is never checked again: the count can change until a share is paid, so a share opened at 1/12 then counts as 1/2 and the invoice shows paid with less money; shares opened at once are all charged the equal share, so the remainder's cents go uncharged. Same root as the session finding (R3).

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404
- **Input:** token: read raw, then looked up; body read without a schema: payerEmail (checked only against /.+@.+\..+/)
- **Capability gate:** isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE)
- **Idempotency:** none: every call opens another provider session (finding)
- **Side effects:** creates a payment session with the provider (createWindcaveSession); when the provider reports it already complete, settles the invoice: events, and once paid the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)
- **Success:** the provider session id, the amount and the hosted-fields submit URLs (also cached here against the token, invoiceAjaxUrlCache); or { alreadyComplete, approved }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else
- **Replay:** each call opens another provider session for the same invoice
- **Rate:** tokenRateLimit (10 a minute per token, counted in this server process only; an unknown token gets a count of its own, so it limits one link's use, not guessing, which a 160-bit token makes futile)
- **Finding:** Every call opens another provider session and re-pins a single-payment invoice to it: a payment completed on an earlier session is then refused at completion (403) and missed by the notification, which finds invoices by their pinned session. The payer is charged and the invoice stays unpaid (R3: payment attempts).
- **Finding:** payerEmail, checked only against /.+@.+\..+/, is added to splitPayerEmails without limit (10 calls a minute per link), and every address gets the rent invoice's GST invoice once it is paid: a link holder can have the business email its tenant's name, address and rent to any number of addresses. Trades store the list but email only the client.
- **Finding:** What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment, and is never checked again: the count can change until a share is paid, so a share opened at 1/12 then counts as 1/2 and the invoice shows paid with less money; shares opened at once are all charged the equal share, so the remainder's cents go uncharged. Same root as the session finding (R3).

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404; a single payment must send the session pinned to it (403 otherwise, and when none is pinned, since 2026-09-26); a split invoice's session is not checked (finding)
- **Input:** token: read raw, then looked up; body read without a schema: sessionId (required; sent to the provider as one encoded path segment)
- **Capability gate:** isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE: the outcome waits)
- **Idempotency:** finalizeCheckoutInvoice: a settled invoice is left alone; a split share counts once per session (atomicClaimSplitShare / atomicClaimJobSplitShare); a single payment settles by a read then a write
- **Side effects:** queries the provider for the session (queryWindcaveSession); once paid, the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)
- **Success:** { approved, status, splitCount, splitPaidCount }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else, with the invoice's pinned session for a single payment
- **Replay:** a settled invoice is left alone and a split session counts once; two calls at once for a single payment can both settle it (R3 / C20)
- **Rate:** none — every call asks the provider about the session sent, with the platform's credentials
- **Finding:** A split invoice records none of the sessions opened for it, so its completion checks only that the provider approved the session the page sends: any approved session on the platform's provider account (another invoice's share, a $1 purchase anywhere) marks one share paid, one such session per share marks the invoice paid, and each is emailed a GST invoice once rent is paid. The single-payment branch was fixed 2026-09-26 (R1-T7's rule). Needs each opened session recorded (the payment attempts engine, R3, or an interim column): put to the owner 2026-09-26.

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404; a single payment must send the session pinned to it (403 otherwise, and when none is pinned, since 2026-09-26); a split invoice's session is not checked (finding)
- **Input:** token: read raw, then looked up; body read without a schema: sessionId (required), googlePayToken (any object, passed to the provider as it came)
- **Capability gate:** isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE: the outcome waits)
- **Idempotency:** finalizeCheckoutInvoice: a settled invoice is left alone; a split share counts once per session; a single payment settles by a read then a write
- **Side effects:** submits the Google Pay token to the cached submit URL (submitGooglePayToken, checked by assertWindcaveUrl) or queries the provider (queryWindcaveSession); once paid, the GST invoice email (rent) or the payment invoice (trades)
- **Success:** { approved, status, splitCount, splitPaidCount }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else, with the invoice's pinned session for a single payment
- **Replay:** a settled invoice is left alone and a split session counts once; two calls at once for a single payment can both settle it (R3 / C20)
- **Rate:** none — every call reaches the provider, with the platform's credentials
- **Finding:** A split invoice records none of the sessions opened for it, so its completion checks only that the provider approved the session the page sends: any approved session on the platform's provider account (another invoice's share, a $1 purchase anywhere) marks one share paid, one such session per share marks the invoice paid, and each is emailed a GST invoice once rent is paid. The single-payment branch was fixed 2026-09-26 (R1-T7's rule). Needs each opened session recorded (the payment attempts engine, R3, or an interim column): put to the owner 2026-09-26.
- **Finding:** The submit URLs are cached per link, not per session: when two payers of one split invoice open sessions, the first one's Google Pay payment goes to the second one's session, and both sessions are then counted as shares.

### GET `/api/checkout/callback`

- query: `result: raw`, `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `302`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `sendRentGstInvoices`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404; here the token comes in the query
- **Input:** query read raw: token (looked up; unknown goes to /) and result (only "cancelled" is acted on: no query)
- **Capability gate:** isWindcaveConfigured() (while unconfigured it only redirects)
- **Idempotency:** a settled invoice only redirects; otherwise the invoice's pinned session is queried and settled (a split invoice pins none, so nothing is)
- **Side effects:** queries the provider for the pinned session (queryWindcaveSession); once paid, the GST invoice email (rent) or the payment invoice (trades)
- **Success:** a 302 to the invoice's checkout page (/r/<token>), or to / for an unknown token
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else; the outcome always comes from querying the provider about the pinned session
- **Replay:** a settled invoice only redirects; two calls at once can both settle it (R3 / C20)
- **Rate:** none — each call with a real link to an unpaid single-payment invoice asks the provider
- **Finding:** Settles by a read then a write, not a claim, racing the notification (R3 / C20).

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the quote's token (20 random bytes, base64url) selects its one quote (getQuoteByToken); an unknown token is 404
- **Input:** token: read raw, then looked up
- **Idempotency:** read-only
- **Success:** the quote as a PDF attachment (generateQuotePdf), named from the business and the token's first 8 characters
- **Error disclosure:** fixed
- **Authenticity:** holding the quote's link: its token is the credential for that one quote
- **Replay:** read-only
- **Rate:** none — every call renders a PDF

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the quote's token (20 random bytes, base64url) selects its one quote (getQuoteByToken); an unknown token is 404
- **Input:** token: read raw, then looked up
- **Idempotency:** the first read marks a sent quote viewed (and records the event); a quote past its date is marked expired; otherwise read-only
- **Success:** the quote (the whole row), the client's name and site address, the business's name, trading name and GST settings, previouslyViewed, and once accepted the live invoice's token, kind, amount and status
- **Error disclosure:** fixed
- **Authenticity:** holding the quote's link: its token is the credential for that one quote
- **Replay:** reading again changes nothing after the first view
- **Rate:** none — no limit
- **Finding:** Returns the whole quote row, where the code's own comment asks for a narrow reply: with it the business's numeric id, the client profile id, the token, internal timestamps and documentUrl, a storage path (served to nobody since gap 13).

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

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the quote's token (20 random bytes, base64url) selects its one quote (getQuoteByToken); an unknown token is 404
- **Input:** token: read raw, then looked up; body: acceptQuoteSchema (400 with its first issue's message)
- **Entitlement gate:** billingCardIsReady on the quote's business: while its subscription lapses an acceptance is 402 QUOTE_ACCEPTANCE_UNAVAILABLE for the customer, and the business is emailed, at most once per quote per interval (quote-acceptance-notice.ts)
- **Idempotency:** an accepted or declined quote is 409 and an expired one 410; the status check is a read then a write, so two acceptances at once can each issue an invoice (finding)
- **Side effects:** on acceptance, issues the deposit or full invoice and sends it (resendTradeInvoice: email or SMS); when billing blocks acceptance, emails the business (tellBusinessQuoteAcceptanceBlocked)
- **Success:** { quote, depositInvoice, paymentUrl, delivered }: the quote (the whole row), the new invoice and its checkout link
- **Error disclosure:** input-issues
- **Authenticity:** holding the quote's link: its token is the credential for that one quote
- **Replay:** a second response is 409
- **Rate:** none — no limit
- **Finding:** Two acceptances at once can both pass the status check, and each issues and sends an invoice (a read then a write; R3 / C20).
- **Finding:** Returns the whole quote row, where the code's own comment asks for a narrow reply: with it the business's numeric id, the client profile id, the token, internal timestamps and documentUrl, a storage path (served to nobody since gap 13).

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
