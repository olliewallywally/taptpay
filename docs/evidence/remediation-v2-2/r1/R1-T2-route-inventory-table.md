# R1-T2 route inventory — generated 2026-09-29 @ `b0500c5de0e32d8cd6f03faa20c6ec53c8eceb63`

Regenerate with `npx tsx scripts/generate-route-policy.ts`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **184** (77 GET, 75 POST, 2 PATCH, 5 ALL, 17 PUT, 8 DELETE).

By principal: **public**: 56, **admin**: 17, **merchant-user**: 100, **provider-webhook**: 6, **api-key**: 3, **cron**: 2.

Unclassified (no known gate marker, no known public-design marker, and no
curated allowlist entry found near the handler — needs a human read, not
necessarily a bug): **0**.

## Review

184 of 184 routes reviewed (server/route-review.ts); 0 pending.
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
- **POST /api/checkout/:token/split:** What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment: sessions opened at once are all charged the equal share, so up to one cent per share of the remainder can go uncharged. Since 2026-09-26 the count locks once any session is opened (0030), so a share opened at 1/12 can no longer count as 1/2. The remainder is R3's (payment attempts).
- **POST /api/checkout/:token/session:** Every call opens another provider session and re-pins a single-payment invoice to it: a payment completed on an earlier session is then refused at completion (403) and missed by the notification, which finds invoices by their pinned session. The payer is charged and the invoice stays unpaid (R3: payment attempts).
- **POST /api/checkout/:token/session:** What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment: sessions opened at once are all charged the equal share, so up to one cent per share of the remainder can go uncharged. Since 2026-09-26 the count locks once any session is opened (0030), so a share opened at 1/12 can no longer count as 1/2. The remainder is R3's (payment attempts).
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
- **POST /api/admin/merchants/:id/verify:** Unlike the emailed confirmation (confirmMerchantEmail), it leaves the email marked unconfirmed (emailVerified false) and the sign-up link usable. Minor; for the account-security work.
- **PATCH /api/admin/merchants/:id/windcave-merchant-id:** The provider merchant id is stored as sent, with no check of its type or form: a number, an object or a stray space is saved as it came, and only the provider notices. A strict schema (a trimmed string of the provider's form, or null) is plan §8.4's rule.
- **POST /api/admin/merchants/:id/activate:** No admin screen calls it: the live admin area (/admin: the overview, the businesses, one business, API, analytics) does not, and admin-merchant.tsx, admin-merchant-broken.tsx, admin-dashboard.tsx, admin-api.tsx, admin-revenue.tsx and create-merchant.tsx are mounted nowhere (checked 2026-09-26). The admin chooses the business's password, so the admin knows it. It is today the only way in for an application made before sign-up took a password: the confirm page sends those to support (NO_PASSWORD_CHOSEN), and Verify refuses them, naming this route. Kept by the owner's decision (2026-09-26) as support's path until an emailed set-password link replaces it (the account-security work).
- **GET /api/admin/analytics:** Reads every business's sales one business at a time (getAllMerchants, then getTransactionsByMerchant for each): the time grows with the platform. Fine today; for the performance phase.
- **GET /api/admin/analytics:** A business whose figures fail to load is listed with zero sales and zero revenue, as if it had none (R1-T9's rule, for the admin's screens too).
- **GET /api/admin/revenue-over-time:** Reads every business's sales one business at a time (getAllMerchants, then getTransactionsByMerchant for each): the time grows with the platform. Fine today; for the performance phase.
- **GET /api/admin/payment-method-breakdown:** Reads every business's sales one business at a time (getAllMerchants, then getTransactionsByMerchant for each): the time grows with the platform. Fine today; for the performance phase.
- **GET /api/admin/ga4-detailed:** Answers a failure with Google Analytics' own error text (error?.message), to the platform admin only. Minor: a fixed message and a server-side log would do.
- **GET /api/admin/ga4-metrics:** Answers a failure with Google Analytics' own error text (error?.message), to the platform admin only. Minor: a fixed message and a server-side log would do.
- **GET /api/admin/email-status:** No admin screen calls it: the live admin area (/admin: the overview, the businesses, one business, API, analytics) does not, and admin-merchant.tsx, admin-merchant-broken.tsx, admin-dashboard.tsx, admin-api.tsx, admin-revenue.tsx and create-merchant.tsx are mounted nowhere (checked 2026-09-26); a diagnostic, useful by hand. Kept by the owner's decision (2026-09-26).
- **POST /api/team/invite:** It tells a signed-in owner whether any address has a TaptPay login (409 'That email address already has a TaptPay login'), where the 2026-09-23 rule made the public doors answer alike. Recorded then as open for the owner (R1-T4-account-discovery-2026-09-23.md §5, item 2); no answer since. Each probe of an address without a login sends it a real invite.
- **POST /api/subscription/cancel:** reason is read raw: a number, an object or an array is a 500 (reason.trim is not a function) where P2.2 says 400 (§8.4).
- **PATCH /api/tutorial/pages/:pageKey:** The tutorial is the business's, not the login's: a teammate's progress, dismissal or restart applies to every login of the business, the owner's included (shown in the harness: a teammate's restart moved the business to generation 2). A product choice, recorded.
- **POST /api/tutorial/restart:** The tutorial is the business's, not the login's: a teammate's progress, dismissal or restart applies to every login of the business, the owner's included (shown in the harness: a teammate's restart moved the business to generation 2). A product choice, recorded.
- **POST /api/push/unsubscribe:** A database fault while listing the business's devices reads as none (getPushSubscriptionsByMerchant answers [] on any error), so the answer is 403 'Not authorized to unsubscribe this endpoint', not 500 (R1-T9's rule).
- **GET /api/push/status:** A database fault reading the switches reads as the defaults (getPushNotificationPreferences answers them on any error), so the page shows the default switches instead of that it could not check (R1-T9's rule).
- **GET /api/push/preferences:** A database fault reading the switches reads as the defaults (getPushNotificationPreferences answers them on any error), so the page shows the default switches instead of that it could not check (R1-T9's rule).
- **POST /api/merchants/:id/onboarding:** Every submission emails the admin again, with no limit (minor).
- **PUT /api/merchants/:id:** Its text fields have no length limit, and the NZBN and GST number are not checked for form (§8.4); only the settings screen bounds them.
- **POST /api/merchants/:id/logo:** The upload is read into memory up to 20 MB per request (logoUpload); a logo needs far less (minor).
- **DELETE /api/merchants/:id/logo:** The legacy disk removal builds its path from the business's stored logo address. Only the upload route writes that address now (a fixed name), so it cannot point elsewhere, but the path is not checked to stay under uploads/ (minor).
- **POST /api/merchants/:id/tapt-stones:** Any login of the business, a teammate included, creates, renames and deletes boards, and the phone terminal offers all three to every login: kept by the owner's decision (2026-09-27).
- **PUT /api/merchants/:merchantId/tapt-stones/:stoneId:** Any login of the business, a teammate included, creates, renames and deletes boards, and the phone terminal offers all three to every login: kept by the owner's decision (2026-09-27).
- **DELETE /api/merchants/:merchantId/tapt-stones/:stoneId:** Any login of the business, a teammate included, creates, renames and deletes boards, and the phone terminal offers all three to every login: kept by the owner's decision (2026-09-27).
- **POST /api/transactions:** The platform admin passes checkMerchantOwnership for any business, so it can create sales, record cash sales and cancel sales for any business; no admin screen does. For R1-T3's matrix: whether money routes should admit the admin at all.
- **POST /api/transactions/cash-sale:** The platform admin passes checkMerchantOwnership for any business, so it can create sales, record cash sales and cancel sales for any business; no admin screen does. For R1-T3's matrix: whether money routes should admit the admin at all.
- **POST /api/transactions/tap-to-pay:** A provider failure answers with the provider's own error text (`Failed to create attended session: …`, `Payment processor error: …`, from sessionResult.error and paymentResult.error), to a signed-in login of the business (R2's provider boundary).
- **POST /api/transactions/tap-to-pay:** merchantId, transactionId and amount are read with parseInt and parseFloat (§8.4). It stays off (TAP_TO_PAY_DISABLED) until the iPhone hardware work (R7).
- **POST /api/transactions/tap-to-pay:** No idempotency: without a transactionId, a repeat finishes whatever is pending next, or charges a new sale for the amount sent (R3's payment attempts).
- **POST /api/transactions/:id/cancel:** The platform admin passes checkMerchantOwnership for any business, so it can create sales, record cash sales and cancel sales for any business; no admin screen does. For R1-T3's matrix: whether money routes should admit the admin at all.
- **POST /api/transactions/:transactionId/refunds:** A provider refusal answers with the provider's own error text (refundResult.error), to the owner (R2's provider boundary).
- **POST /api/transactions/:transactionId/refunds:** Not durable across a crash between the provider's refund and the record's update: the refund stays pending and its amount reserved (R4, durable refunds).
- **GET /api/merchants/:id/export/pdf:** startDate and endDate are read raw: a malformed one reaches the storage query as an invalid date (a 500, not the 400 P2.2 asks for; §8.4). The live page sends neither.
- **GET /api/invoice-documents/:name:** No screen calls it yet: the property terminal shows an attached document by name only. It serves gap 13's option C (owner decision 2026-09-14): a business reading its own documents, and the admin's audited reading.
- **POST /api/property/tenants/:tenantId/schedules:** The end date is stored but the rent cron never reads it (runGeneratePass; trades honours its own), and an end before the start is taken. No screen sends one.
- **POST /api/property/tenants/:tenantId/schedules:** A start date in the past bills every period since, one request per cron run. No screen sends one: they start one interval from now.
- **POST /api/property/invoices/document:** The upload is read into memory up to 20 MB per request (invoiceDocUpload), by any login of the business.
- **POST /api/property/invoices:** Sending rent to a tenant with a live rent invoice changes that invoice's amount, even with split shares paid or a payment session open: the shares paid were worked out on the old amount, and an open session charges the old one (R3: payment attempts).
- **POST /api/property/invoices/:id/resend:** No limit on resending: each call is an email, SMS or WhatsApp message to the tenant, at the platform's cost (operations).
- **POST /api/property/invoices/:id/void:** Voiding while the tenant is paying: the provider's completion then finds the invoice settled (finalizeRentInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (Split_Share_Unrecorded). R3 (payment attempts).
- **POST /api/property/invoices/:id/void:** A split invoice with shares already paid can be voided: those shares stay collected, with nothing but their events to show for them (R3/R4, refunds).
- **POST /api/property/invoices/:id/void:** Every login of the business, a teammate included, has every property action and setting (tenants, rent and bills, voiding, marking paid outside TaptPay, automations, the reminder settings): kept by the owner's decision (2026-09-27).
- **POST /api/property/invoices/:id/mark-paid-external:** Marking an invoice paid outside TaptPay while the tenant is paying: the provider's completion then finds the invoice settled (finalizeRentInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (Split_Share_Unrecorded). R3 (payment attempts).
- **POST /api/property/invoices/:id/mark-paid-external:** Every login of the business, a teammate included, has every property action and setting (tenants, rent and bills, voiding, marking paid outside TaptPay, automations, the reminder settings): kept by the owner's decision (2026-09-27).
- **PUT /api/property/reminder-settings:** Every login of the business, a teammate included, has every property action and setting (tenants, rent and bills, voiding, marking paid outside TaptPay, automations, the reminder settings): kept by the owner's decision (2026-09-27).
- **PUT /api/trades/reminder-settings:** Every login of the business, a teammate included, has every trades action and setting but GST (clients, quotes, invoices, cancelling one, marking one paid outside TaptPay, recurring invoices, the reminder switch), as every trades screen offers them; in property the owner kept the same (2026-09-27, batch 6c answer 2).
- **POST /api/trades/clients/:id/archive:** The archive and the cancellations are separate writes: a failure between them leaves the client archived with recurring invoices still running, until the archive is repeated.
- **POST /api/trades/quotes:** An archived client can still be quoted here; no screen offers it (the pickers list only current clients). Only a recurring invoice is refused for one (owner decision 2026-09-27).
- **POST /api/trades/quotes:** Each quote to someone not saved as a client makes another hidden prospect, and nothing removes them.
- **POST /api/trades/invoices:** An archived client can still be invoiced here; no screen offers it (the pickers list only current clients). Only a recurring invoice is refused for one (owner decision 2026-09-27).
- **POST /api/trades/invoices:** A deposit's amount is the one typed, not checked against the deposit its quote worked out.
- **POST /api/trades/invoices/:id/send-balance:** Two sends at the same moment can each find no balance and each make one, billing the client twice: the one-balance check is a read, then a write (R3).
- **POST /api/trades/invoices/:id/mark-paid-external:** Marking an invoice paid outside TaptPay while the client is paying: the provider's completion then finds the invoice settled (finalizeTradeInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (split_share_unrecorded). R3 (payment attempts).
- **POST /api/trades/invoices/:id/mark-paid-external:** Every login of the business, a teammate included, has every trades action and setting but GST (clients, quotes, invoices, cancelling one, marking one paid outside TaptPay, recurring invoices, the reminder switch), as every trades screen offers them; in property the owner kept the same (2026-09-27, batch 6c answer 2).
- **POST /api/trades/invoices/:id/void:** Voiding while the client is paying: the provider's completion then finds the invoice settled (finalizeTradeInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (split_share_unrecorded). R3 (payment attempts).
- **POST /api/trades/invoices/:id/void:** A split invoice with shares already paid can be voided: those shares stay collected, with nothing but their events to show for them (R3/R4, refunds).
- **POST /api/trades/invoices/:id/void:** Every login of the business, a teammate included, has every trades action and setting but GST (clients, quotes, invoices, cancelling one, marking one paid outside TaptPay, recurring invoices, the reminder switch), as every trades screen offers them; in property the owner kept the same (2026-09-27, batch 6c answer 2).

## Routes

| Method | Path | Line | Principal | Markers |
|---|---|---:|---|---|
| GET | `/robots.txt` | 459 | public | — |
| GET | `/nfc/:merchantId/stone/:stoneId` | 478 | public | generatePaymentUrl( |
| GET | `/nfc/:merchantId` | 492 | public | — |
| GET | `/.well-known/apple-developer-merchantid-domain-association` | 499 | public | — |
| GET | `/sitemap.xml` | 514 | public | authenticateToken, checkMerchantOwnership, checkAccountOwnership, isAccountOwner, req.user?.role !== "admin", req.user.role === 'admin', authenticateAdmin |
| GET | `/api/auth/google` | 602 | public | — |
| GET | `/api/auth/google/callback` | 623 | public | — |
| POST | `/api/auth/google/session` | 774 | public-bearer | — |
| POST | `/api/auth/sign-out-everywhere` | 797 | merchant | authenticateToken |
| POST | `/api/auth/login` | 842 | public | — |
| POST | `/api/auth/forgot-password` | 899 | public | requestPasswordReset( |
| POST | `/api/auth/reset-password` | 939 | public-bearer | resetPassword( |
| GET | `/api/auth/validate-reset-token/:token` | 979 | public-bearer | validateResetToken( |
| GET | `/api/admin/request-origin` | 998 | platform-admin | authenticateAdmin |
| POST | `/api/admin/auth/login` | 1018 | public | — |
| GET | `/api/auth/me` | 1106 | merchant | authenticateToken |
| GET | `/api/tutorial/state` | 1147 | merchant | authenticateToken, req.user?.role === "admin" |
| PATCH | `/api/tutorial/pages/:pageKey` | 1177 | merchant | authenticateToken, req.user?.role === "admin" |
| POST | `/api/tutorial/restart` | 1214 | merchant | authenticateToken, req.user?.role === "admin" |
| POST | `/api/merchants/:id/onboarding` | 1235 | merchant | authenticateToken, checkAccountOwnership |
| GET | `/api/admin/auth/me` | 1327 | platform-admin | authenticateAdmin |
| GET | `/api/merchants/:id/qr` | 1340 | public | — |
| GET | `/api/merchants/:id/stone/:stoneId/qr` | 1347 | public | — |
| GET | `/api/merchants/:id/stone/:stoneId/brand` | 1400 | public | publicBoardBrandDto( |
| GET | `/api/merchants/:id/profile` | 1422 | merchant | authenticateToken, checkMerchantOwnership, isAccountOwner |
| GET | `/api/pay/t/:token` | 1444 | public-bearer | resolvePaymentToken( |
| GET | `/api/pay/t/:token/qr` | 1471 | public-bearer | resolvePaymentToken( |
| POST | `/api/pay/t/:token/split` | 1499 | public-bearer | resolvePaymentToken(, loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt` | 1596 | public-bearer | loadTokenReceipt( |
| POST | `/api/pay/t/:token/receipt-pdf` | 1609 | public-bearer | loadTokenReceipt( |
| GET | `/api/pay/t/:token/receipt-qr` | 1639 | public-bearer | loadTokenReceipt( |
| POST | `/api/pay/t/:token/session` | 1715 | public-bearer | resolvePaymentToken(, prepareTokenCompletion( |
| POST | `/api/pay/t/:token/hosted-fields-complete` | 2015 | public-bearer | prepareTokenCompletion( |
| POST | `/api/pay/t/:token/googlepay-complete` | 2067 | public-bearer | prepareTokenCompletion(, paymentAttempts.resolveReturnState( |
| GET | `/api/pay/return/:state` | 2198 | public-bearer | paymentAttempts.resolveReturnState( |
| ALL | `/api/pay/notification/:state` | 2232 | provider | — |
| GET | `/api/merchants/:id/active-transaction` | 2249 | merchant / public | authenticateToken, checkMerchantOwnership, publicTransactionDto(, generatePaymentUrl( |
| POST | `/api/transactions` | 2366 | merchant | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/cash-sale` | 2447 | merchant | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/tap-to-pay` | 2511 | merchant | authenticateToken, checkMerchantOwnership |
| POST | `/api/transactions/:id/split` | 2653 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| GET | `/api/split-payments/:id` | 2707 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/cancel` | 2726 | merchant | authenticateToken, checkMerchantOwnership |
| GET | `/api/nfc/capabilities` | 2786 | public | — |
| POST | `/api/transactions/:id/pay` | 2800 | public | isTokenAddressedTransaction( |
| GET | `/api/windcave/env` | 3052 | public | — |
| POST | `/api/transactions/:id/hosted-fields-complete` | 3066 | public | isTokenAddressedTransaction( |
| POST | `/api/transactions/:id/googlepay-complete` | 3104 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id` | 3177 | public | isTokenAddressedTransaction(, publicTransactionDto( |
| POST | `/api/transactions/:id/receipt-pdf` | 3200 | public | isTokenAddressedTransaction( |
| GET | `/api/transactions/:id/receipt-qr` | 3261 | public | isTokenAddressedTransaction( |
| GET | `/api/merchants/:id/export/pdf` | 3315 | merchant | authenticateToken, checkMerchantOwnership |
| POST | `/api/admin/merchants/:id/verify` | 3355 | platform-admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/set-active` | 3406 | platform-admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id/transactions` | 3429 | platform-admin | authenticateAdmin |
| PATCH | `/api/admin/merchants/:id/windcave-merchant-id` | 3442 | platform-admin | authenticateAdmin |
| POST | `/api/admin/merchants/:id/activate` | 3458 | platform-admin | authenticateAdmin, storage.verifyMerchant( |
| PUT | `/api/merchants/:id/details` | 3516 | merchant | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/change-password` | 3542 | merchant | authenticateToken, checkMerchantOwnership, req.user?.role === "admin" |
| PUT | `/api/merchants/:id/theme` | 3632 | merchant | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id/daily-goal` | 3660 | merchant | authenticateToken, checkAccountOwnership |
| PUT | `/api/merchants/:id` | 3693 | merchant | authenticateToken, checkAccountOwnership |
| POST | `/api/merchants/:id/logo` | 3767 | merchant | authenticateToken, checkAccountOwnership |
| DELETE | `/api/merchants/:id/logo` | 3822 | merchant | authenticateToken, checkAccountOwnership |
| GET | `/api/merchants/:id/transactions` | 3865 | merchant | authenticateToken, checkMerchantOwnership |
| GET | `/api/merchants/:id/tapt-stones` | 3882 | merchant | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:id/tapt-stones` | 3898 | merchant | authenticateToken, checkMerchantOwnership, generatePaymentUrl( |
| PUT | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3949 | merchant | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/tapt-stones/:stoneId` | 3988 | merchant | authenticateToken, checkMerchantOwnership |
| ALL | `/api/windcave/notification` | 4028 | provider | — |
| GET | `/api/windcave/callback` | 4150 | public | isTokenAddressedTransaction( |
| GET | `/api/admin/analytics` | 4348 | platform-admin | authenticateAdmin |
| GET | `/api/admin/revenue-over-time` | 4421 | platform-admin | authenticateAdmin |
| GET | `/api/admin/payment-method-breakdown` | 4457 | platform-admin | authenticateAdmin |
| GET | `/api/admin/ga4-detailed` | 4494 | platform-admin | authenticateAdmin |
| GET | `/api/admin/ga4-metrics` | 4559 | platform-admin | authenticateAdmin |
| GET | `/api/admin/merchants` | 4646 | platform-admin | authenticateAdmin |
| GET | `/api/admin/merchants/:id` | 4656 | platform-admin | authenticateAdmin |
| POST | `/api/admin/resend-verification` | 4679 | platform-admin | authenticateAdmin |
| GET | `/api/admin/email-status` | 4739 | platform-admin | authenticateAdmin |
| POST | `/api/auth/confirm-email` | 4776 | public-bearer | getMerchantByToken( |
| POST | `/api/auth/resend-confirmation` | 4903 | public | — |
| POST | `/api/info-pack-leads` | 4933 | public | — |
| POST | `/api/merchants/signup` | 4986 | public | — |
| GET | `/api/merchants/:id/events` | 5097 | merchant / public | authenticateToken, checkMerchantOwnership |
| GET | `/api/push/capabilities` | 5174 | public | — |
| GET | `/api/push/vapid-key` | 5198 | public | — |
| POST | `/api/push/subscribe` | 5208 | merchant | authenticateToken |
| POST | `/api/push/unsubscribe` | 5254 | merchant | authenticateToken |
| POST | `/api/push/native-subscribe` | 5281 | merchant | authenticateToken |
| POST | `/api/push/native-unsubscribe` | 5319 | merchant | authenticateToken |
| GET | `/api/push/status` | 5354 | merchant | authenticateToken |
| GET | `/api/push/preferences` | 5379 | merchant | authenticateToken |
| PUT | `/api/push/preferences` | 5394 | merchant | authenticateToken |
| POST | `/api/transactions/:transactionId/refunds` | 5426 | merchant | authenticateToken, isAccountOwner |
| GET | `/api/transactions/:transactionId/refunds` | 5566 | merchant | authenticateToken |
| GET | `/api/merchants/:merchantId/refunds` | 5598 | merchant | authenticateToken |
| GET | `/api/merchants/:merchantId/stock-items` | 5631 | merchant | authenticateToken, checkMerchantOwnership |
| POST | `/api/merchants/:merchantId/stock-items` | 5650 | merchant | authenticateToken, checkMerchantOwnership |
| PUT | `/api/merchants/:merchantId/stock-items/:itemId` | 5678 | merchant | authenticateToken, checkMerchantOwnership |
| DELETE | `/api/merchants/:merchantId/stock-items/:itemId` | 5715 | merchant | authenticateToken, authenticateApiKey, requireEcommerceApi, checkMerchantOwnership |
| POST | `/api/v1/transactions` | 5783 | api-key | authenticateApiKey, requireEcommerceApi, publicTransactionDto( |
| GET | `/api/v1/transactions/:id` | 5895 | api-key | authenticateApiKey, requireEcommerceApi |
| GET | `/api/subscription` | 5983 | merchant | authenticateToken, isAccountOwner |
| PUT | `/api/subscription/plan` | 6006 | merchant | authenticateToken, isAccountOwner |
| POST | `/api/subscription/cancel` | 6069 | merchant | authenticateToken, isAccountOwner |
| POST | `/api/subscription/resume` | 6112 | merchant | authenticateToken, isAccountOwner |
| GET | `/api/team` | 6143 | merchant | authenticateToken, isAccountOwner |
| POST | `/api/team/invite` | 6164 | merchant | authenticateToken, isAccountOwner |
| POST | `/api/team/:userId/resend` | 6225 | merchant | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId/invite` | 6307 | merchant | authenticateToken, isAccountOwner |
| PUT | `/api/team/:userId/status` | 6327 | merchant | authenticateToken, isAccountOwner |
| DELETE | `/api/team/:userId` | 6375 | merchant | authenticateToken, isAccountOwner |
| POST | `/api/team/accept-invite` | 6413 | public-bearer | getUserByInviteToken( |
| GET | `/api/subscription/billing-history` | 6449 | merchant | authenticateToken, isAccountOwner |
| GET | `/api/billing/card` | 6479 | merchant | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/session` | 6508 | merchant | authenticateToken, isAccountOwner |
| POST | `/api/billing/card/confirm` | 6554 | merchant | authenticateToken, isAccountOwner |
| ALL | `/api/billing/card/notification` | 6645 | provider | billingCardCallback |
| GET | `/api/billing/card/callback` | 6655 | public | billingCardCallback |
| POST | `/api/billing/card/callback` | 6656 | public | billingCardCallback |
| DELETE | `/api/billing/card` | 6659 | merchant | authenticateToken, isAccountOwner |
| POST | `/api/board-builder/submit` | 6684 | merchant | authenticateToken |
| GET | `/uploads/:folder/:name` | 6749 | public | getCheckoutInvoiceByToken( |
| GET | `/api/property/tenants` | 7014 | merchant | authenticateToken |
| POST | `/api/property/tenants` | 7025 | merchant | authenticateToken |
| GET | `/api/property/tenants/:id` | 7042 | merchant | authenticateToken |
| PUT | `/api/property/tenants/:id` | 7054 | merchant | authenticateToken |
| POST | `/api/property/tenants/:id/archive` | 7071 | merchant | authenticateToken |
| POST | `/api/property/tenants/:id/unarchive` | 7085 | merchant | authenticateToken |
| GET | `/api/property/tenants/:id/events` | 7099 | merchant | authenticateToken |
| GET | `/api/property/schedules` | 7116 | merchant | authenticateToken |
| POST | `/api/property/tenants/:tenantId/schedules` | 7127 | merchant | authenticateToken |
| PUT | `/api/property/schedules/:id` | 7155 | merchant | authenticateToken |
| DELETE | `/api/property/schedules/:id` | 7183 | merchant | authenticateToken |
| GET | `/api/property/invoices` | 7199 | merchant | authenticateToken |
| POST | `/api/property/invoices/document` | 7230 | merchant | authenticateToken |
| GET | `/api/invoice-documents/:name` | 7276 | merchant / platform-admin | authenticateToken |
| POST | `/api/property/invoices` | 7305 | merchant | authenticateToken |
| POST | `/api/property/invoices/:id/resend` | 7347 | merchant | authenticateToken |
| POST | `/api/property/invoices/:id/void` | 7366 | merchant | authenticateToken |
| POST | `/api/property/invoices/:id/mark-paid-external` | 7381 | merchant | authenticateToken |
| GET | `/api/checkout/resolve/:token` | 7404 | public-bearer | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/document/:token` | 7490 | public-bearer | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/split` | 7514 | public-bearer | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/session` | 7545 | public-bearer | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/hosted-fields-complete` | 7623 | public-bearer | getCheckoutInvoiceByToken( |
| POST | `/api/checkout/:token/googlepay-complete` | 7659 | public-bearer | getCheckoutInvoiceByToken( |
| GET | `/api/checkout/callback` | 7717 | public-bearer | getCheckoutInvoiceByToken( |
| ALL | `/api/windcave/rent-notification` | 7744 | provider | — |
| ALL | `/api/windcave/trades-notification` | 7766 | provider | — |
| POST | `/api/webhooks/whatsapp` | 7791 | provider | req.headers["apikey"] |
| GET | `/api/property/reminder-settings` | 7841 | merchant | authenticateToken |
| PUT | `/api/property/reminder-settings` | 7851 | merchant | authenticateToken |
| GET | `/api/trades/reminder-settings` | 7871 | merchant | authenticateToken |
| PUT | `/api/trades/reminder-settings` | 7881 | merchant | authenticateToken |
| GET | `/api/trades/gst-settings` | 7894 | merchant | authenticateToken |
| PUT | `/api/trades/gst-settings` | 7910 | merchant | authenticateToken, isAccountOwner |
| GET | `/api/trades/clients` | 7930 | merchant | authenticateToken |
| POST | `/api/trades/clients` | 7938 | merchant | authenticateToken |
| GET | `/api/trades/clients/:id` | 7950 | merchant | authenticateToken |
| PUT | `/api/trades/clients/:id` | 7961 | merchant | authenticateToken |
| POST | `/api/trades/clients/:id/archive` | 7974 | merchant | authenticateToken |
| POST | `/api/trades/clients/:id/unarchive` | 7993 | merchant | authenticateToken |
| POST | `/api/trades/clients/:id/promote` | 8006 | merchant | authenticateToken |
| GET | `/api/trades/clients/:id/events` | 8018 | merchant | authenticateToken |
| GET | `/api/trades/quotes` | 8030 | merchant | authenticateToken |
| POST | `/api/trades/quotes` | 8039 | merchant | authenticateToken |
| GET | `/api/trades/quotes/:id/pdf` | 8136 | merchant | authenticateToken |
| GET | `/api/trades/quotes/token/:token/pdf` | 8151 | public-bearer | getQuoteByToken( |
| GET | `/api/trades/quotes/token/:token` | 8166 | public-bearer | getQuoteByToken( |
| POST | `/api/trades/quotes/token/:token/respond` | 8211 | public-bearer | getQuoteByToken( |
| GET | `/api/trades/invoices` | 8260 | merchant | authenticateToken |
| POST | `/api/trades/invoices` | 8272 | merchant | authenticateToken |
| POST | `/api/trades/invoices/:id/send-balance` | 8330 | merchant | authenticateToken |
| POST | `/api/trades/invoices/:id/mark-paid-external` | 8371 | merchant | authenticateToken |
| POST | `/api/trades/invoices/:id/complete` | 8394 | merchant | authenticateToken |
| POST | `/api/trades/invoices/:id/void` | 8413 | merchant | authenticateToken |
| GET | `/api/trades/schedules` | 8430 | merchant | authenticateToken |
| POST | `/api/trades/schedules` | 8437 | merchant | authenticateToken |
| PUT | `/api/trades/schedules/:id` | 8462 | merchant | authenticateToken |
| DELETE | `/api/trades/schedules/:id` | 8485 | merchant | authenticateToken |
| GET | `/api/internal/cron/status` | 8501 | cron | authorizeCronRequest |
| POST | `/api/internal/cron` | 8511 | cron | authorizeCronRequest |

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

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own login: every session of it ends, this one included; the platform admin is refused (403 'Only a TaptPay login can do this.')
- **Input:** nothing
- **Idempotency:** advances the login's session version (advanceUserSessionVersion), spending every token issued before it, this one included: the same token again is 401 SESSION_ENDED
- **Side effects:** ends the login's live streams (sseBroker.disconnectUser) and stops its devices' notifications and the business's unattributed ones (deactivatePushSubscriptionsForLogin; a fault there is logged, never returned, as the sessions have already ended)
- **Success:** 204, no body, not cached
- **Error disclosure:** fixed

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

Reviewed policy:

- **Who:** platform-admin. **Tenant (none):** none: the admin's own session or request; no business's data
- **Input:** nothing but the request itself: its forwarded-for header and connection address, only shown back
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** not cached: TRUST_PROXY_HOPS and whether address limits are on, the address Express takes, the protocol and host, the forwarded-for chain, the connection address, and the address each hops value would take (for the owner's phase B check)
- **Error disclosure:** fixed

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
- statuses: `200`, `401`, `500`, `503`
- entitlementGates: `billingCardIsReady`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own login and business; the platform admin (validated by authenticateToken: its own principal, the configured email, business 0) is answered too, with no business
- **Input:** nothing
- **Entitlement gate:** none enforced: whether the business has paid access (billingCardIsReady) is only reported, for the app's own gate
- **Idempotency:** read-only, apart from getOrCreateSubscription, which makes the business's subscription row if it has none
- **Success:** { user: { id, email, merchantId, role, onboardingCompleted, merchantStatus, gstRegistered, tradeGstMode, billingCardReady } }: every client's start-up check
- **Error disclosure:** fixed

### GET `/api/tutorial/state`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `getMerchant`, `getMerchantTutorialProgress`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business's tutorial; the platform admin is refused (403 'Merchant access required')
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { generation, autoEnabled, pageCount, progress: per page { status, lastStep, when started, completed, dismissed } }
- **Error disclosure:** fixed

### PATCH `/api/tutorial/pages/:pageKey`

- middleware: `authenticateToken`
- params: `pageKey: isTutorialPageKey | raw`
- body: `schema: tutorialProgressSchema`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `getMerchant`, `upsertMerchantTutorialProgress`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business's tutorial; the platform admin is refused (403 'Merchant access required')
- **Input:** pageKey: one of the tutorial's pages (isTutorialPageKey, 400 otherwise); body: tutorialProgressSchema, strict (generation, status, lastStep from 0 to 100; 400 with the issues)
- **Idempotency:** upserts the page's progress in the current generation (a stale generation is 409); the same body again rewrites it, and a completed or dismissed page's time
- **Success:** { pageKey, status, lastStep }
- **Error disclosure:** input-issues
- **Finding:** The tutorial is the business's, not the login's: a teammate's progress, dismissal or restart applies to every login of the business, the owner's included (shown in the harness: a teammate's restart moved the business to generation 2). A product choice, recorded.

### POST `/api/tutorial/restart`

- middleware: `authenticateToken`
- authChecks: `compares req.user?.role === "admin"`
- storageMethods: `restartMerchantTutorial`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business's tutorial; the platform admin is refused (403 'Merchant access required')
- **Input:** nothing is read
- **Idempotency:** starts a new generation (restartMerchantTutorial): every page starts over and the tutorial turns itself on, for every login of the business
- **Success:** { generation, autoEnabled: true, pageCount, progress: {} }
- **Error disclosure:** fixed
- **Finding:** The tutorial is the business's, not the login's: a teammate's progress, dismissal or restart applies to every login of the business, the owner's included (shown in the harness: a teammate's restart moved the business to generation 2). A product choice, recorded.

### POST `/api/merchants/:id/onboarding`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: merchantOnboardingSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `getMerchant`, `updateMerchant`
- sideEffects: `email: sendEmail`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `validation.error.issues`
- helpers: `escHtml`

Reviewed policy:

- **Who:** merchant (owner, platform admin). **Tenant (path-merchant):** checkAccountOwnership: the business in the path is the session's and the caller its owner; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam; body: merchantOnboardingSchema, strict, sign-up's rules (a director of 1 to 100 characters; NZBN and GST at most 20; a description of at most 500; a website address or nothing; one of the turnover ranges or nothing); 400 with the first issue and the issues, before anything is read, kept or sent
- **Idempotency:** stores the six details and marks onboarding complete (updateMerchant; all six since 2026-09-27, when three had only been emailed); again stores them again and emails the admin again
- **Side effects:** emails the details to the platform's admin address (sendEmail; every value HTML-escaped, the subject's line breaks removed)
- **Success:** { message }
- **Error disclosure:** input-issues
- **Finding:** Every submission emails the admin again, with no limit (minor).

### GET `/api/admin/auth/me`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `503`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (none):** none: the admin's own session or request; no business's data
- **Input:** nothing
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** { user: { id, email, merchantId: 0, role: 'admin' } }: the admin app's session check
- **Error disclosure:** fixed

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

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; the owner and the admin get the owner's view, a teammate the restricted one (isAccountOwner)
- **Input:** id: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** ownerMerchantDto to the owner and the platform admin; memberMerchantSettingsDto (the read-only business fields) to a teammate
- **Error disclosure:** fixed

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

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** the business named in the body (merchantId), checked with checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; a board must be one of its active boards (400 otherwise)
- **Input:** body: retailTransactionCreateRequestSchema, strict (the business, an item name of 1 to 200 characters, a price like 5.00, splitting, the board, the link type; 400 with the issues)
- **Capability gate:** a sale without a board has its own link, which needs per-payment links on (config.features.newRetailPayments: 503 otherwise)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** none: each call makes another pending sale, with a new private link (only its hash kept; a token clash is 503) or its board's shared address
- **Side effects:** a live update to the business, and to the board's page for a board sale (sseBroker, via broadcastToStone); a push notification to the business (sendPushToMerchant)
- **Success:** ownerTransactionDto with the sale's page and QR addresses; the private link's token appears only in this answer
- **Error disclosure:** input-issues
- **Finding:** The platform admin passes checkMerchantOwnership for any business, so it can create sales, record cash sales and cancel sales for any business; no admin screen does. For R1-T3's matrix: whether money routes should admit the admin at all.

### POST `/api/transactions/cash-sale`

- middleware: `authenticateToken`
- body: `schema: cashSaleRequestSchema`
- authChecks: `checkMerchantOwnership`, `compares stone.merchantId !== merchantId`
- storageMethods: `createTransaction`, `getOrCreateSubscription`, `getTaptStone`
- sideEffects: `live update: sseBroker.broadcast`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `401`, `402`, `403`, `500`, `503`
- dtos: `ownerTransactionDto`
- errorTextInResponse: `validation.error.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `broadcastToStone`, `requireBillingCard`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** the business named in the body (merchantId), checked with checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; a board must be one of its active boards (getTaptStone: 400 otherwise, since 2026-09-27)
- **Input:** body: cashSaleRequestSchema, strict: the business, item name and price by the rules creating a sale uses, and an optional board (400 with the issues; since 2026-09-27, when parseInt and parseFloat let '1abc' and 'Infinity' through)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** none: each call records another completed cash sale
- **Side effects:** a live update to the business, and to the board's page for a board sale (sseBroker, via broadcastToStone); a push notification (sendPushToMerchant)
- **Success:** { transaction: ownerTransactionDto }
- **Error disclosure:** input-issues
- **Finding:** The platform admin passes checkMerchantOwnership for any business, so it can create sales, record cash sales and cancel sales for any business; no admin screen does. For R1-T3's matrix: whether money routes should admit the admin at all.

### POST `/api/transactions/tap-to-pay`

- middleware: `authenticateToken`
- body: `fields: amount, merchantId, transactionId, windcaveToken`
- authChecks: `checkMerchantOwnership`, `compares pendingTransaction.merchantId !== mid`
- storageMethods: `createTransaction`, `getActiveTransactionByMerchant`, `getOrCreateSubscription`, `getTransaction`, `updateTransactionPaymentMethod`, `updateTransactionStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: createAttendedSession`, `provider: submitTapToPayToken`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `409`, `500`, `502`, `503`
- errorTextInResponse: `paymentResult.error`, `sessionResult.error`
- capabilityGates: `config.features.tapToPay`, `isWindcaveConfigured`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `broadcastToStone`, `requireBillingCard`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** the business named in the body (merchantId), checked with checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; a sale named by transactionId must be the business's (404 otherwise) and pending (409)
- **Input:** body read without a schema: merchantId and transactionId with parseInt, amount with parseFloat (400 if not above zero), windcaveToken required once the provider is configured
- **Capability gate:** Tap to Pay must be on (config.features.tapToPay: 503 TAP_TO_PAY_DISABLED otherwise), and the provider configured (isWindcaveConfigured: 503 otherwise)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** charges the named pending sale's stored price, or the business's newest pending sale, or, with none, a new sale for the amount sent; a sale no longer pending is 409. Nothing stops the same request finishing a different pending sale or making a new one when repeated
- **Side effects:** opens an attended session at the provider and submits the phone's card token to it (createAttendedSession, submitTapToPayToken); a live update on approval (sseBroker, via broadcastToStone); a push notification either way (sendPushToMerchant)
- **Success:** { approved, transactionId }
- **Error disclosure:** provider-text
- **Finding:** A provider failure answers with the provider's own error text (`Failed to create attended session: …`, `Payment processor error: …`, from sessionResult.error and paymentResult.error), to a signed-in login of the business (R2's provider boundary).
- **Finding:** merchantId, transactionId and amount are read with parseInt and parseFloat (§8.4). It stays off (TAP_TO_PAY_DISABLED) until the iPhone hardware work (R7).
- **Finding:** No idempotency: without a transactionId, a repeat finishes whatever is pending next, or charges a new sale for the amount sent (R3's payment attempts).

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
- statuses: `200`, `400`, `401`, `404`, `500`, `503`
- dtos: `ownerTransactionDto`
- helpers: `broadcastToStone`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (resource):** the sale read by id (getTransaction) must be the session's business's, by checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; another business's is answered as a missing one (404, since 2026-09-27: its 403 told which sale numbers exist)
- **Input:** id: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** cancels a pending or processing sale; any other state is 400 (so again is 400)
- **Side effects:** a live update to the business, and to the board's page for a board sale (sseBroker, via broadcastToStone)
- **Success:** ownerTransactionDto with the board's addresses for a board sale
- **Error disclosure:** fixed
- **Finding:** The platform admin passes checkMerchantOwnership for any business, so it can create sales, record cash sales and cancel sales for any business; no admin screen does. For R1-T3's matrix: whether money routes should admit the admin at all.

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

### GET `/api/merchants/:id/export/pdf`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- query: `endDate: raw`, `startDate: raw`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getMerchant`, `getMerchantAnalyticsWithDateRange`, `getTransactionsByMerchantWithDateRange`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam; startDate and endDate read raw with new Date(), optional (the live page sends neither)
- **Idempotency:** read-only
- **Success:** a PDF business report (generateBusinessReportPdf): the business, its figures and its sales in the range
- **Error disclosure:** fixed
- **Finding:** startDate and endDate are read raw: a malformed one reaches the storage query as an invalid date (a 500, not the 400 P2.2 asks for; §8.4). The live page sends neither.

### POST `/api/admin/merchants/:id/verify`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchantStatus`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** any business, by the number in the path: the validated platform admin (authenticateAdmin: the admin role, merchant scope 0 and the configured admin email) acts across businesses
- **Input:** id: strictPositiveIntegerParam (400 otherwise); no body
- **Idempotency:** marks a waiting application verified (updateMerchantStatus) and makes any missing owner login (syncVerifiedMerchants); again is 409 (already verified; 400 until 2026-09-27, P2.2), any other state 409 (only what the business page offers, since 2026-09-26); an application with no password set is 400
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** { message, merchant: { id, name, businessName, email, status } }
- **Error disclosure:** fixed
- **Finding:** Unlike the emailed confirmation (confirmMerchantEmail), it leaves the email marked unconfirmed (emailVerified false) and the sign-up link usable. Minor; for the account-security work.

### POST `/api/admin/merchants/:id/set-active`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchantStatus`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** any business, by the number in the path: the validated platform admin (authenticateAdmin: the admin role, merchant scope 0 and the configured admin email) acts across businesses
- **Input:** id: strictPositiveIntegerParam (400 otherwise); no body
- **Idempotency:** sets a verified business active; again is 409 (400 until 2026-09-27, P2.2), any other state 409 (only what the business page offers, since 2026-09-26)
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** { message, merchant: { id, status } }
- **Error disclosure:** fixed

### GET `/api/admin/merchants/:id/transactions`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `adminTransactionDto`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** any business, by the number in the path: the validated platform admin (authenticateAdmin: the admin role, merchant scope 0 and the configured admin email) acts across businesses
- **Input:** id: strictPositiveIntegerParam (400 otherwise); an unknown business gets an empty list
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** every sale of the business, adminTransactionDto each, all at once (no paging)
- **Error disclosure:** fixed

### PATCH `/api/admin/merchants/:id/windcave-merchant-id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- body: `fields: windcaveMerchantId`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`, `updateMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** any business, by the number in the path: the validated platform admin (authenticateAdmin: the admin role, merchant scope 0 and the configured admin email) acts across businesses
- **Input:** id: strictPositiveIntegerParam (400 otherwise); body read without a schema: windcaveMerchantId, stored as sent (any falsy value clears it)
- **Idempotency:** sets the business's provider merchant id; the same value again changes nothing
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** { message }
- **Error disclosure:** fixed
- **Finding:** The provider merchant id is stored as sent, with no check of its type or form: a number, an object or a stray space is saved as it came, and only the provider notices. A strict schema (a trimmed string of the provider's form, or null) is plan §8.4's rule.

### POST `/api/admin/merchants/:id/activate`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- body: `fields: password`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`, `storage.verifyMerchant`
- storageMethods: `getMerchant`, `verifyMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `checked.error.issues`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** any business, by the number in the path: the validated platform admin (authenticateAdmin: the admin role, merchant scope 0 and the configured admin email) acts across businesses
- **Input:** id: strictPositiveIntegerParam (400 otherwise); body read without a schema: password, held to the one password rule (newPasswordSchema; 400 with its first issue)
- **Idempotency:** one-time: sets the waiting application's password, marks it verified and clears its token (verifyMerchant, by that token); a business with no waiting application is 409 (since 2026-09-26), a verified one 409 (400 until 2026-09-27, P2.2)
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** { message, merchant: { id, name, businessName, email, status } }
- **Error disclosure:** input-issues
- **Finding:** No admin screen calls it: the live admin area (/admin: the overview, the businesses, one business, API, analytics) does not, and admin-merchant.tsx, admin-merchant-broken.tsx, admin-dashboard.tsx, admin-api.tsx, admin-revenue.tsx and create-merchant.tsx are mounted nowhere (checked 2026-09-26). The admin chooses the business's password, so the admin knows it. It is today the only way in for an application made before sign-up took a password: the confirm page sends those to support (NO_PASSWORD_CHOSEN), and Verify refuses them, naming this route. Kept by the owner's decision (2026-09-26) as support's path until an emailed set-password link replaces it (the account-security work).

### PUT `/api/merchants/:id/details`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateMerchantDetailsSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchantDetails`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

Reviewed policy:

- **Who:** merchant (owner, platform admin). **Tenant (path-merchant):** checkAccountOwnership: the business in the path is the session's and the caller its owner; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam; body: updateMerchantDetailsSchema (business name, contact email, phone and address; 400 with the issues)
- **Idempotency:** sets the four contact details (updateMerchantDetails); the same values again change nothing
- **Success:** ownerMerchantDto of the business afterwards
- **Error disclosure:** input-issues

### PUT `/api/merchants/:id/change-password`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: changePasswordSchema`
- authChecks: `checkMerchantOwnership`, `compares req.user?.role === "admin"`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `getUserById`, `settleAuthThrottle`, `takeAuthThrottleSlot`, `updateUserPassword`
- sideEffects: `audit log: logSecurityEvent`, `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `401`, `403`, `404`, `429`, `500`, `503`
- errorTextInResponse: `validation.error.errors`, `validation.error.issues`
- rateLimits: `refuseTooManyAttempts`, `tooManyAttempts`
- helpers: `refuseTooManyAttempts`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path must be the session's, a precondition only: the caller's own login is what changes; the platform admin, which that check lets through, is then refused (403 'Only a TaptPay login can do this.', since 2026-09-27)
- **Input:** id: strictPositiveIntegerParam; body: changePasswordSchema (the current password, and a new one held to the one password rule; 400 with the first issue and the issues)
- **Idempotency:** checks the current password, counted per login and slowed down like sign-in (429), then sets the new one and ends every session of the login (updateUserPassword); again with the old password is 400
- **Side effects:** ends the login's live streams (sseBroker.disconnectUser) and stops its devices' notifications and the business's unattributed ones (deactivatePushSubscriptionsForLogin; a fault is logged, never returned); logs a slowed attempt (logSecurityEvent: PASSWORD_CHANGE_SLOWED)
- **Success:** { message, token }: a fresh token for this device, not cached
- **Error disclosure:** input-issues

### PUT `/api/merchants/:id/theme`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateThemeSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchantTheme`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

Reviewed policy:

- **Who:** merchant (owner, platform admin). **Tenant (path-merchant):** checkAccountOwnership: the business in the path is the session's and the caller its owner; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam; body: updateThemeSchema (one of the themes; 400 with the issues)
- **Idempotency:** sets the theme (updateMerchantTheme); the same again changes nothing
- **Success:** ownerMerchantDto of the business afterwards
- **Error disclosure:** input-issues

### PUT `/api/merchants/:id/daily-goal`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateDailyGoalSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `validation.error.errors`

Reviewed policy:

- **Who:** merchant (owner, platform admin). **Tenant (path-merchant):** checkAccountOwnership: the business in the path is the session's and the caller its owner; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam; body: updateDailyGoalSchema (400 with the issues)
- **Idempotency:** sets the daily goal (updateMerchant); the same again changes nothing
- **Success:** ownerMerchantDto of the business afterwards
- **Error disclosure:** input-issues

### PUT `/api/merchants/:id`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- body: `schema: updateSchema`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `ownerMerchantDto`
- errorTextInResponse: `parseResult.error.errors`

Reviewed policy:

- **Who:** merchant (owner, platform admin). **Tenant (path-merchant):** checkAccountOwnership: the business in the path is the session's and the caller its owner; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam; body: a strict schema of nine optional fields (business name, director, address, NZBN, phone, GST number, contact email as an email, contact phone, business address); 400 with the issues, and when none is given
- **Idempotency:** sets the fields given (updateMerchant); the same values again change nothing
- **Success:** ownerMerchantDto of the business afterwards
- **Error disclosure:** input-issues
- **Finding:** Its text fields have no length limit, and the NZBN and GST number are not checked for form (§8.4); only the settings screen bounds them.

### POST `/api/merchants/:id/logo`

- middleware: `authenticateToken`, `requireLogoOwnership`, `receiveUpload(…)`
- params: `id: strictPositiveIntegerParam`
- body: `file`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `deleteUploadedFile`, `saveUploadedFile`, `updateMerchantLogoUrl`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `requireLogoOwnership`, `saveUploadedFile`

Reviewed policy:

- **Who:** merchant (owner, platform admin). **Tenant (path-merchant):** checkAccountOwnership: the business in the path is the session's and the caller its owner; the platform admin is let through for any business; checked before the upload is read (requireLogoOwnership), and again in the handler
- **Input:** id: strictPositiveIntegerParam; the file 'logo': a PNG by its MIME type (400 with the filter's message otherwise) and its first 8 bytes (400), up to 20 MB (413 above it), read into memory. The type and size refusals were 500s until 2026-09-27 (receiveUpload, server/routes.ts), where this review said 400
- **Idempotency:** replaces the business's logo: one fixed name per business (merchant-<id>.png), saved before the business points at it and removed again if the business is gone
- **Success:** { logoUrl, message }
- **Error disclosure:** fixed
- **Finding:** The upload is read into memory up to 20 MB per request (logoUpload); a logo needs far less (minor).

### DELETE `/api/merchants/:id/logo`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkAccountOwnership`, `checkMerchantOwnership`, `isAccountOwner`
- storageMethods: `deleteUploadedFile`, `getMerchant`, `updateMerchantLogoUrl`
- sideEffects: `file system: fs.existsSync`, `file system: fs.unlinkSync`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, platform admin). **Tenant (path-merchant):** checkAccountOwnership: the business in the path is the session's and the caller its owner; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** removes the business's stored logo (deleteUploadedFile, only if the business owns it) and a legacy copy on disk, then clears the logo address; again changes nothing
- **Side effects:** removes a legacy logo file from the server's disk when one exists (fs.unlinkSync)
- **Success:** { message }
- **Error disclosure:** fixed
- **Finding:** The legacy disk removal builds its path from the business's stored logo address. Only the upload route writes that address now (a fixed name), so it cannot point elsewhere, but the path is not checked to stay under uploads/ (minor).

### GET `/api/merchants/:id/transactions`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTransactionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `ownerTransactionDto`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** every sale of the business, ownerTransactionDto each, all at once (no paging)
- **Error disclosure:** fixed

### GET `/api/merchants/:id/tapt-stones`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getTaptStonesByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** the business's active boards, each a whole board row (number, name, page and QR addresses, whether active, when made and changed)
- **Error disclosure:** fixed

### POST `/api/merchants/:id/tapt-stones`

- middleware: `authenticateToken`
- params: `id: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createNextTaptStone`, `getMerchant`, `updateTaptStoneUrls`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `error.message`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business
- **Input:** id: strictPositiveIntegerParam; body read without a schema: name, optional, a string of at most 60 characters once trimmed (400 otherwise; blank or absent makes 'Stone N')
- **Idempotency:** none: each call makes the business's next board, up to 10 at a time (TaptStoneCapacityError, 400); a numbering clash is 409
- **Success:** the new board, a whole board row (number, name, page and QR addresses, whether active, when made and changed)
- **Error disclosure:** domain-errors
- **Finding:** Any login of the business, a teammate included, creates, renames and deletes boards, and the phone terminal offers all three to every login: kept by the owner's decision (2026-09-27).

### PUT `/api/merchants/:merchantId/tapt-stones/:stoneId`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- body: `fields: name`
- authChecks: `checkMerchantOwnership`, `compares existingStone.merchantId !== merchantId`
- storageMethods: `getTaptStone`, `updateTaptStone`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; the board read by id (getTaptStone) must be the business's (404 otherwise, the same for another business's)
- **Input:** merchantId and stoneId: strictPositiveIntegerParam; body read without a schema: name, a non-blank string of at most 60 characters once trimmed (400 otherwise; the cap since 2026-09-27)
- **Idempotency:** renames the board; the same name again changes nothing. A deleted (inactive) board is still found and renamed
- **Success:** the board, a whole board row (number, name, page and QR addresses, whether active, when made and changed)
- **Error disclosure:** fixed
- **Finding:** Any login of the business, a teammate included, creates, renames and deletes boards, and the phone terminal offers all three to every login: kept by the owner's decision (2026-09-27).

### DELETE `/api/merchants/:merchantId/tapt-stones/:stoneId`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`, `stoneId: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`, `compares existingStone.merchantId !== merchantId`
- storageMethods: `deleteTaptStone`, `getTaptStone`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; the board read by id (getTaptStone) must be the business's (404 otherwise, the same for another business's)
- **Input:** merchantId and stoneId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** marks the board inactive (deleteTaptStone), so its page and printed QR stop working; again answers 200 and changes nothing
- **Success:** { message }
- **Error disclosure:** fixed
- **Finding:** Any login of the business, a teammate included, creates, renames and deletes boards, and the phone terminal offers all three to every login: kept by the owner's decision (2026-09-27).

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
- statuses: `302`, `400`
- capabilityGates: `isWindcaveConfigured`
- helpers: `broadcastToStone`

Reviewed policy:

- **Who:** public. **Tenant (number):** the sale's number (transactionId), or else the provider session id, selects the sale; a sale with its own link is sent home as a missing one is (302, since 2026-09-27: its 404 told a caller counting through the numbers which were link sales); a cancel is believed only with the bound session id
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

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** every business at once: the validated platform admin (authenticateAdmin) sees the whole platform
- **Input:** nothing
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** platform totals (businesses, active ones, sales, revenue, monthly recurring revenue, paying subscriptions) and, per business, its id, name, business name, sales count and revenue, status and last sale
- **Error disclosure:** fixed
- **Finding:** Reads every business's sales one business at a time (getAllMerchants, then getTransactionsByMerchant for each): the time grows with the platform. Fine today; for the performance phase.
- **Finding:** A business whose figures fail to load is listed with zero sales and zero revenue, as if it had none (R1-T9's rule, for the admin's screens too).

### GET `/api/admin/revenue-over-time`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`, `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** every business at once: the validated platform admin (authenticateAdmin) sees the whole platform
- **Input:** nothing
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** for each of the last 7 days (today and the 6 before, by UTC date): the platform's revenue and sales count, from completed sales
- **Error disclosure:** fixed
- **Finding:** Reads every business's sales one business at a time (getAllMerchants, then getTransactionsByMerchant for each): the time grows with the platform. Fine today; for the performance phase.

### GET `/api/admin/payment-method-breakdown`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`, `getTransactionsByMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** every business at once: the validated platform admin (authenticateAdmin) sees the whole platform
- **Input:** nothing
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** per payment method of the platform's completed sales: its name, how many sales used it, and a chart colour; most used first
- **Error disclosure:** fixed
- **Finding:** Reads every business's sales one business at a time (getAllMerchants, then getTransactionsByMerchant for each): the time grows with the platform. Fine today; for the performance phase.

### GET `/api/admin/ga4-detailed`

- middleware: `authenticateAdmin`
- query: `range: raw`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error?.message`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (none):** none: the website's own visitor figures from Google Analytics; no business's data
- **Input:** range: read raw, then mapped to one of four start dates (14d, 30d, all; anything else is the last 7 days)
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** { configured: false } until Google Analytics is set up; otherwise daily users, sessions and page views, users by country, new and returning users
- **Error disclosure:** provider-text
- **Finding:** Answers a failure with Google Analytics' own error text (error?.message), to the platform admin only. Minor: a fixed message and a server-side log would do.

### GET `/api/admin/ga4-metrics`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error?.message`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (none):** none: the website's own visitor figures from Google Analytics; no business's data
- **Input:** nothing
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** { configured: false } until Google Analytics is set up; otherwise the last 7 days' sessions, users, page views, bounce rate and more
- **Error disclosure:** provider-text
- **Finding:** Answers a failure with Google Analytics' own error text (error?.message), to the platform admin only. Minor: a fixed message and a server-side log would do.

### GET `/api/admin/merchants`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getAllMerchants`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `adminMerchantSummaryDto`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** every business at once: the validated platform admin (authenticateAdmin) sees the whole platform
- **Input:** nothing
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** every business, adminMerchantSummaryDto each: id, name, business name, email, director, NZBN, status and when made
- **Error disclosure:** fixed

### GET `/api/admin/merchants/:id`

- middleware: `authenticateAdmin`
- params: `id: strictPositiveIntegerParam`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchant`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- dtos: `adminMerchantDto`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** any business, by the number in the path: the validated platform admin (authenticateAdmin: the admin role, merchant scope 0 and the configured admin email) acts across businesses
- **Input:** id: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** adminMerchantDto: the business's account and settings, never its password hash, tokens or bank details
- **Error disclosure:** fixed

### POST `/api/admin/resend-verification`

- middleware: `authenticateAdmin`
- body: `fields: email`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- storageMethods: `getMerchantByEmail`
- sideEffects: `audit log: logSecurityEvent`, `email: sendMerchantVerificationEmail`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (any-merchant):** the business the email names (getMerchantByEmail): only one still waiting to be confirmed, with its token, is sent its link again (404 for no business; 409 for one no longer waiting, 400 until 2026-09-27, P2.2; 400 for one waiting with no token, which P2.2 would also call a state conflict: R1-T3's admin family)
- **Input:** body read without a schema: email, trimmed and lower-cased by the look-up (getMerchantByEmail); anything but a string is a 500
- **Idempotency:** each call sends the same link again; the token is not replaced
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged); emails the business its confirmation link again (sendMerchantVerificationEmail)
- **Success:** { message, merchant: { id, name, businessName, email, status } }
- **Error disclosure:** fixed

### GET `/api/admin/email-status`

- middleware: `authenticateAdmin`
- authChecks: `authenticateToken`, `compares req.user?.role !== "admin"`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `403`, `500`, `503`
- helpers: `authenticateAdmin`

Reviewed policy:

- **Who:** platform-admin. **Tenant (none):** none: the platform's email set-up
- **Input:** nothing
- **Idempotency:** read-only
- **Side effects:** an audit log line when a signed-in caller other than the platform admin is refused (logSecurityEvent: ADMIN_ACCESS_DENIED, from authenticateAdmin; a missing or bad token is refused by authenticateToken, unlogged)
- **Success:** which email providers are set up, the environment, the from address, whether admin notices are set up and whether mail will be delivered
- **Error disclosure:** fixed
- **Finding:** No admin screen calls it: the live admin area (/admin: the overview, the businesses, one business, API, analytics) does not, and admin-merchant.tsx, admin-merchant-broken.tsx, admin-dashboard.tsx, admin-api.tsx, admin-revenue.tsx and create-merchant.tsx are mounted nowhere (checked 2026-09-26); a diagnostic, useful by hand. Kept by the owner's decision (2026-09-26).

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

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); the subscription is recorded against the business and this login, and a device already registered moves to them and takes this login's switches (createPushSubscription, by its endpoint; each login its own (owner decision 2026-09-26))
- **Input:** body read without a schema: subscription, whose endpoint, keys.p256dh and keys.auth must be present (400 otherwise); the endpoint must be a browser push service's (isPushServiceEndpoint, server/push-endpoint.ts: https on port 443, no user or password, a host of Google's, Mozilla's, Apple's or Microsoft's push service; 400 otherwise, owner decision 2026-09-26); the keys are not checked for form
- **Capability gate:** the server's push keys must be set (config.push in server/config.ts: 503 otherwise)
- **Idempotency:** registers the device, or re-registers it by its endpoint (active again, this login's); the same body again changes nothing
- **Success:** { success: true, preferences: pushNotificationPreferencesDto }
- **Error disclosure:** fixed

### POST `/api/push/unsubscribe`

- middleware: `authenticateToken`
- body: `fields: endpoint`
- storageMethods: `deactivatePushSubscriptionByEndpoint`, `getPushSubscriptionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); the endpoint must be one of its active subscriptions (getPushSubscriptionsByMerchant: 403 otherwise), and any login of the business may stop any of its devices
- **Input:** body read without a schema: endpoint, required, compared as sent
- **Idempotency:** stops the device (deactivatePushSubscriptionByEndpoint; since 2026-09-26 a database fault is a 500, not a success); again is 403, as it is no longer active
- **Success:** { success: true }
- **Error disclosure:** fixed
- **Finding:** A database fault while listing the business's devices reads as none (getPushSubscriptionsByMerchant answers [] on any error), so the answer is 403 'Not authorized to unsubscribe this endpoint', not 500 (R1-T9's rule).

### POST `/api/push/native-subscribe`

- middleware: `authenticateToken`
- body: `fields: deviceToken`
- storageMethods: `createPushSubscription`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); the iPhone is recorded against the business and this login, and takes this login's switches (createPushSubscription, by its endpoint; each login its own (owner decision 2026-09-26))
- **Input:** body read without a schema: deviceToken, a string of at least 8 characters once trimmed (400 otherwise), stored as the endpoint apns://<token>
- **Idempotency:** registers the iPhone, or re-registers it by its endpoint; the same body again changes nothing
- **Success:** { success: true, preferences: pushNotificationPreferencesDto }
- **Error disclosure:** fixed

### POST `/api/push/native-unsubscribe`

- middleware: `authenticateToken`
- body: `fields: deviceToken`
- storageMethods: `deactivateNativePushSubscriptionsForLogin`, `deactivatePushSubscriptionByEndpoint`, `getPushSubscriptionsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); with a deviceToken, that iPhone, which must be one of its active subscriptions (403 otherwise); without one, this login's iPhones and the business's unattributed ones (deactivateNativePushSubscriptionsForLogin)
- **Input:** body read without a schema: deviceToken, optional; when present a string of at least 8 characters once trimmed (400 otherwise)
- **Idempotency:** stops the iPhone or iPhones (since 2026-09-26 a database fault stopping one iPhone is a 500, not a success); again with the token is 403, without it changes nothing
- **Success:** { success: true }
- **Error disclosure:** fixed

### GET `/api/push/status`

- middleware: `authenticateToken`
- storageMethods: `getPushNotificationPreferences`, `getPushSubscriptionsForLogin`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); this login's own devices and switches (getPushSubscriptionsForLogin; each login its own (owner decision 2026-09-26))
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { subscribed, deviceCount, webSubscribed, nativeSubscribed, preferences: pushNotificationPreferencesDto }: this login's active devices and its switches
- **Error disclosure:** fixed
- **Finding:** A database fault reading the switches reads as the defaults (getPushNotificationPreferences answers them on any error), so the page shows the default switches instead of that it could not check (R1-T9's rule).

### GET `/api/push/preferences`

- middleware: `authenticateToken`
- storageMethods: `getPushNotificationPreferences`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); this login's own switches (each login its own (owner decision 2026-09-26))
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { preferences: pushNotificationPreferencesDto }: this login's three switches, read from its newest device (the defaults with none)
- **Error disclosure:** fixed
- **Finding:** A database fault reading the switches reads as the defaults (getPushNotificationPreferences answers them on any error), so the page shows the default switches instead of that it could not check (R1-T9's rule).

### PUT `/api/push/preferences`

- middleware: `authenticateToken`
- body: `schema: pushNotificationPreferencesSchema`
- storageMethods: `updatePushNotificationPreferences`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- dtos: `pushNotificationPreferencesDto`
- errorTextInResponse: `parsed.error.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); this login's own switches, on its own devices only (each login its own (owner decision 2026-09-26))
- **Input:** body: pushNotificationPreferencesSchema, strict: the three switches (400 with the issues)
- **Idempotency:** sets the three switches on each of this login's devices and no other login's (updatePushNotificationPreferences); the same body again changes nothing. The switches live on the devices: a login with none stores nothing, and a device that moves to another login takes that login's
- **Success:** { preferences: pushNotificationPreferencesDto }
- **Error disclosure:** input-issues

### POST `/api/transactions/:transactionId/refunds`

- middleware: `authenticateToken`
- params: `transactionId: strictPositiveIntegerParam`
- authChecks: `compares transaction.merchantId !== merchantId`, `isAccountOwner`
- storageMethods: `createRefund`, `getTransaction`, `releaseRefundAmount`, `reserveRefundAmount`, `updateRefundStatus`
- sideEffects: `live update: sseBroker.broadcast`, `provider: createWindcaveRefund`, `push: sendPushToMerchant`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `502`, `503`
- errorTextInResponse: `refundResult.error`, `validation.error.errors`
- capabilityGates: `config.features.refundInitiation`, `isWindcaveConfigured`
- helpers: `broadcastToStone`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (resource):** the sale read by id (getTransaction) must be the session's business's: another business's is answered as a missing one (404, since 2026-09-27: its 403 told which sale numbers exist); the platform admin, with no business, is refused (403 'Merchant access required', since 2026-09-27; it was 401)
- **Input:** transactionId: strictPositiveIntegerParam; body: createRefundSchema (an amount like 5.00, a reason of 1 to 500 characters, a method; 400 with the issues; the amount's form since 2026-09-27)
- **Capability gate:** refunds must be on (config.features.refundInitiation: 503 otherwise), and the provider configured with the sale's provider transaction (isWindcaveConfigured: 503 otherwise)
- **Idempotency:** reserves the amount against what is left to refund (reserveRefundAmount: 409 when it exceeds it or another refund is in progress), records the refund, asks the provider, and gives the amount back if the provider refuses
- **Side effects:** refunds at the provider (createWindcaveRefund); a live update (sseBroker, via broadcastToStone); a push notification (sendPushToMerchant)
- **Success:** { success, message, refund: the whole refund row, transaction: the whole sale row }
- **Error disclosure:** input-issues, provider-text
- **Finding:** A provider refusal answers with the provider's own error text (refundResult.error), to the owner (R2's provider boundary).
- **Finding:** Not durable across a crash between the provider's refund and the record's update: the refund stays pending and its amount reserved (R4, durable refunds).

### GET `/api/transactions/:transactionId/refunds`

- middleware: `authenticateToken`
- params: `transactionId: strictPositiveIntegerParam`
- authChecks: `compares transaction.merchantId !== merchantId`
- storageMethods: `getRefundsByTransaction`, `getTransaction`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the sale read by id (getTransaction) must be the session's business's: another business's is answered as a missing one (404, since 2026-09-27: its 403 told which sale numbers exist); the platform admin, with no business, is refused (403 'Merchant access required', since 2026-09-27; it was 401)
- **Input:** transactionId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** the sale's whole refund rows (amount, reason, method, status, the provider's refund id, when made and completed)
- **Error disclosure:** fixed

### GET `/api/merchants/:merchantId/refunds`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- authChecks: `compares req.user?.role !== 'admin'`, `compares userMerchantId !== merchantId`
- storageMethods: `getRefundsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (resource):** the business in the path must be the session's (compared directly), or the caller the platform admin
- **Input:** merchantId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** every refund of the business, whole refund rows (amount, reason, method, status, the provider's refund id, when made and completed)
- **Error disclosure:** fixed

### GET `/api/merchants/:merchantId/stock-items`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`
- storageMethods: `getStockItemsByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business
- **Input:** merchantId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** read-only
- **Success:** the business's stock items, each a whole item row (name, description, cost, emoji, variations, whether active, when made and changed)
- **Error disclosure:** fixed

### POST `/api/merchants/:merchantId/stock-items`

- middleware: `authenticateToken`
- params: `merchantId: strictPositiveIntegerParam`
- body: `schema: createStockItemSchema`
- authChecks: `checkMerchantOwnership`
- storageMethods: `createStockItem`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `error.errors`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business
- **Input:** merchantId: strictPositiveIntegerParam; body: createStockItemSchema (a name of 1 to 100 characters, a description of at most 500, a cost like 1.50, an emoji, variations; 400 with the issues)
- **Idempotency:** none: each call adds another item
- **Success:** 201, the new item, a whole item row (name, description, cost, emoji, variations, whether active, when made and changed)
- **Error disclosure:** input-issues

### PUT `/api/merchants/:merchantId/stock-items/:itemId`

- middleware: `authenticateToken`
- params: `itemId: strictPositiveIntegerParam`, `merchantId: strictPositiveIntegerParam`
- body: `schema: updateStockItemSchema`
- authChecks: `checkMerchantOwnership`, `compares existingItem.merchantId !== merchantId`
- storageMethods: `getStockItem`, `updateStockItem`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `error.errors`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; the item read by id (getStockItem) must be the business's (404 otherwise, the same for another business's)
- **Input:** merchantId and itemId: strictPositiveIntegerParam; body: updateStockItemSchema (as for a new item; 400 with the issues)
- **Idempotency:** sets the item's fields (updateStockItem); the same again changes nothing
- **Success:** the item, a whole item row (name, description, cost, emoji, variations, whether active, when made and changed)
- **Error disclosure:** input-issues

### DELETE `/api/merchants/:merchantId/stock-items/:itemId`

- middleware: `authenticateToken`
- params: `itemId: strictPositiveIntegerParam`, `merchantId: strictPositiveIntegerParam`
- authChecks: `checkMerchantOwnership`, `compares existingItem.merchantId !== merchantId`
- storageMethods: `deleteStockItem`, `getStockItem`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member, platform admin). **Tenant (path-merchant):** checkMerchantOwnership: the business in the path is the session's; the platform admin is let through for any business; the item read by id (getStockItem) must be the business's (404 otherwise, the same for another business's)
- **Input:** merchantId and itemId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** deletes the item (deleteStockItem); again is 404
- **Success:** { message }
- **Error disclosure:** fixed

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

### GET `/api/subscription`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `countSeatsInUse`, `getOrCreateSubscription`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `subscriptionDto`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); a teammate gets it without the card (isAccountOwner)
- **Input:** nothing
- **Idempotency:** read-only, apart from getOrCreateSubscription, which makes the business's subscription row if it has none
- **Success:** { subscription: subscriptionDto (plan, price, seats, status, period, cancellation, pending plan, failed payments, the card's brand, last 4 and expiry or null, sale counts), plans: every plan }
- **Error disclosure:** fixed

### PUT `/api/subscription/plan`

- middleware: `authenticateToken`
- body: `fields: planId`
- authChecks: `isAccountOwner`
- storageMethods: `changeSubscriptionPlan`, `countSeatsInUse`, `getOrCreateSubscription`
- sideEffects: `provider: chargeStoredCard`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `409`, `422`, `500`, `502`, `503`
- dtos: `subscriptionDto`
- helpers: `executeStoredCardCharge`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body read without a schema but for planId: planIdSchema, one of the plans (400 'Unknown plan' otherwise); nothing else is read
- **Idempotency:** the current plan again changes nothing; an upgrade applies at once after charging the stored card (no card 402, declined 422, unconfirmed 502); a downgrade waits for the period's end, and one that would strand logins is 409; each runs under the subscription's billing claim (409 while another billing step holds it)
- **Side effects:** an upgrade charges the stored card, with an idempotency key (executeStoredCardCharge, then chargeStoredCard)
- **Success:** { subscription: subscriptionDto, applied: 'immediate' | 'period-end', message }
- **Error disclosure:** fixed

### POST `/api/subscription/cancel`

- middleware: `authenticateToken`
- body: `fields: reason`
- authChecks: `isAccountOwner`
- storageMethods: `cancelSubscription`, `countSeatsInUse`, `getOrCreateSubscription`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- dtos: `subscriptionDto`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body read without a schema: reason, required, cut to 500 characters
- **Idempotency:** cancels at the end of a running paid period (cancelAtPeriodEnd), at once otherwise; under the billing claim (409 while another billing step holds it)
- **Success:** { subscription: subscriptionDto, message }
- **Error disclosure:** fixed
- **Finding:** reason is read raw: a number, an object or an array is a 500 (reason.trim is not a function) where P2.2 says 400 (§8.4).

### POST `/api/subscription/resume`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `countSeatsInUse`, `resumeSubscription`
- statuses: `200`, `401`, `403`, `409`, `500`, `503`
- dtos: `subscriptionDto`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing is read
- **Idempotency:** undoes a pending cancellation (resumeSubscription, only while one is pending); again, or with none pending, is 409
- **Success:** { subscription: subscriptionDto, message }
- **Error disclosure:** fixed

### GET `/api/team`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `countSeatsInUse`, `getOrCreateSubscription`, `getTeamMembers`
- statuses: `200`, `401`, `403`, `500`, `503`
- dtos: `teamMemberDto`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing
- **Idempotency:** read-only, apart from getOrCreateSubscription, which makes the business's subscription row if it has none
- **Success:** { members: teamMemberDto each (id, email, name, role, status, last sign-in, when made), seatLimit, seatsInUse }
- **Error disclosure:** fixed

### POST `/api/team/invite`

- middleware: `authenticateToken`
- body: `schema: inviteTeamMemberSchema`
- authChecks: `isAccountOwner`
- storageMethods: `getMerchant`, `getOrCreateSubscription`, `inviteTeamMember`, `revokeTeamInvite`
- sideEffects: `email: sendTeamInviteEmail`
- statuses: `201`, `400`, `401`, `403`, `409`, `500`, `502`, `503`
- dtos: `teamMemberDto`
- errorTextInResponse: `parsed.error.errors`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: inviteTeamMemberSchema (an email of at most 200 characters, an optional name of at most 100; 400 with the issues)
- **Idempotency:** none: each call invites another login, within the plan's seats (inviteTeamMember counts them under a lock: 409 when all are in use); an address that already has a login anywhere is 409
- **Side effects:** emails the invite link (sendTeamInviteEmail: 32 random bytes, only their SHA-256 kept, live for 7 days); if it cannot be sent the invite is taken back (revokeTeamInvite) and the answer is 502
- **Success:** 201 { member: teamMemberDto }
- **Error disclosure:** input-issues
- **Finding:** It tells a signed-in owner whether any address has a TaptPay login (409 'That email address already has a TaptPay login'), where the 2026-09-23 rule made the public doors answer alike. Recorded then as open for the owner (R1-T4-account-discovery-2026-09-23.md §5, item 2); no answer since. Each probe of an address without a login sends it a real invite.

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

Reviewed policy:

- **Who:** merchant (owner). **Tenant (resource):** the invited login read by id (getUserById) must be the session's business's, still invited, with a live token (404 otherwise, the same for another business's); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** userId: strictPositiveIntegerParam (400 otherwise); no body
- **Idempotency:** each call replaces the invite's token, only if it is unchanged since it was read (rotateTeamInvite: 409 otherwise), and sends the new link; the old link stops working. At most 5 per 10 minutes per business and login (checkResendRateLimit, in this server process only: 429)
- **Side effects:** emails the new invite link (sendTeamInviteEmail); if it cannot be sent, the previous invite is put back, or failing that taken back (502)
- **Success:** { member: teamMemberDto }
- **Error disclosure:** fixed

### DELETE `/api/team/:userId/invite`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- authChecks: `isAccountOwner`
- storageMethods: `revokeTeamInvite`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (resource):** revokeTeamInvite deletes the login only if it is the session's business's, still invited and not the owner (404 otherwise, the same for another business's); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** userId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** deletes the pending invite; again is 404
- **Success:** { message: 'Invite revoked' }
- **Error disclosure:** fixed

### PUT `/api/team/:userId/status`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- body: `fields: status`
- authChecks: `isAccountOwner`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `setTeamMemberStatus`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- dtos: `teamMemberDto`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (resource):** setTeamMemberStatus changes the login only if it is the session's business's (404 otherwise, the same for another business's) and not the owner (403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** userId: strictPositiveIntegerParam; body read without a schema: status, which must be 'active' or 'disabled' (400 otherwise)
- **Idempotency:** sets the login active or disabled; the same state again is 409; turning one back on counts the plan's seats under a lock (409 when all are in use). A disabled login's tokens are refused from its next request (authenticateToken reads the login)
- **Side effects:** on disabling: ends the login's live streams (sseBroker.disconnectUser) and stops its devices' notifications and the business's unattributed ones (deactivatePushSubscriptionsForLogin, owner decision 2026-09-22; a fault is logged, never returned)
- **Success:** { member: teamMemberDto }
- **Error disclosure:** fixed

### DELETE `/api/team/:userId`

- middleware: `authenticateToken`
- params: `userId: strictPositiveIntegerParam`
- authChecks: `compares member.merchantId !== merchantId`, `compares member.role === "owner"`, `isAccountOwner`
- storageMethods: `deactivatePushSubscriptionsForLogin`, `getUserById`, `removeTeamMember`
- sideEffects: `live update: sseBroker.disconnectUser`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (resource):** the login read by id (getUserById) must be the session's business's and not its owner (404 otherwise, the same for another business's); a pending invite is 409 (revoke it instead); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** userId: strictPositiveIntegerParam (400 otherwise)
- **Idempotency:** deletes the login (removeTeamMember); again is 404
- **Side effects:** ends the login's live streams (sseBroker.disconnectUser) and, since 2026-09-26, stops the business's unattributed device subscriptions as disabling does (deactivatePushSubscriptionsForLogin; the ones recorded against the login go with it by 0029's cascade; a fault is logged, never returned)
- **Success:** { message: 'Login removed' }
- **Error disclosure:** fixed

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
- dtos: `billingHistoryDto`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** limit: strictBoundedIntegerQueryParam, 1 to 100, 50 when absent (400 otherwise)
- **Idempotency:** read-only
- **Success:** { history: billingHistoryDto each (type, amount, status, description, failure reason, period, when paid and made) }
- **Error disclosure:** fixed

### GET `/api/billing/card`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `getMerchant`, `getOrCreateSubscription`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing
- **Idempotency:** read-only, apart from getOrCreateSubscription, which makes the business's subscription row if it has none
- **Success:** { ready: whether the stored card can pay the next renewal, card: { last4, brand, expiry } or null }
- **Error disclosure:** fixed

### POST `/api/billing/card/session`

- middleware: `authenticateToken`
- authChecks: `isAccountOwner`
- storageMethods: `bindSubscriptionCardSession`, `getMerchant`, `getOrCreateSubscription`
- sideEffects: `provider: createCardStorageSession`
- statuses: `200`, `401`, `403`, `404`, `500`, `502`, `503`
- capabilityGates: `isWindcaveConfigured`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing is read
- **Capability gate:** the provider must be configured (isWindcaveConfigured: 503 otherwise)
- **Idempotency:** each call opens another hosted card page at the provider and binds its session to the subscription (bindSubscriptionCardSession), replacing any earlier one
- **Side effects:** opens a hosted card-storage session at the provider (createCardStorageSession), with the business's contact email
- **Success:** { sessionId, redirectUrl }: the provider's page; the session id reads back only this one result
- **Error disclosure:** fixed

### POST `/api/billing/card/confirm`

- middleware: `authenticateToken`
- body: `fields: sessionId`
- authChecks: `isAccountOwner`
- storageMethods: `completeSubscriptionCardSetup`, `countSeatsInUse`, `getSubscription`
- sideEffects: `provider: chargeStoredCard`, `provider: queryStoredCardSession`
- statuses: `200`, `202`, `400`, `401`, `403`, `404`, `409`, `422`, `500`, `502`, `503`
- dtos: `subscriptionDto`
- helpers: `executeStoredCardCharge`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3)); the card session must be the one bound to its subscription (subscriptionCardSessionState: 403 otherwise, the same for another business's)
- **Input:** body read without a schema: sessionId, a trimmed string matching /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/ (400 otherwise)
- **Idempotency:** a session already settled answers from the stored result with no provider call; otherwise the provider is asked (202 while pending); an approved card is stored and, when the subscription needs paying, charged under the billing claim with an idempotency key (completeSubscriptionCardSetup: 409 busy, 422 declined, 502 unconfirmed)
- **Side effects:** reads the card session back from the provider (queryStoredCardSession) and may charge the stored card (executeStoredCardCharge, then chargeStoredCard)
- **Success:** { success, ready, charged, card: { last4, brand, expiry }, subscription: subscriptionDto }; 202 { pending: true }
- **Error disclosure:** fixed

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

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing
- **Idempotency:** clears the stored card (removeSubscriptionCard); again changes nothing; refused while a billing step holds the claim (409)
- **Success:** { success: true }
- **Error disclosure:** fixed

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

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** search: raw, a string only: trimmed and matched anywhere in the first name, last name or property address, ignoring case (% and _ act as wildcards, over the business's own tenants); includeArchived: raw, 'true' includes archived tenants, anything else leaves them out
- **Idempotency:** read-only
- **Success:** the business's tenants, a whole tenant row (names, email, phone, the property address, co-tenants, the preferred channel, whether archived and when, when made and changed) each, newest first, all at once (no paging)
- **Error disclosure:** fixed

### POST `/api/property/tenants`

- middleware: `authenticateToken`
- body: `schema: createTenantProfileSchema`
- storageMethods: `createTenantProfile`, `logTransactionEvent`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `err.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: createTenantProfileSchema (a first and last name of 1 to 80 characters, the property address of 1 to 200, an optional email of at most 200 and phone of at most 40, co-tenants of at most 1,000, the preferred channel: email, WhatsApp or SMS; other fields are dropped, so the business is the session's; 400 with the issues)
- **Idempotency:** none: each call adds another tenant (no check for the same person)
- **Success:** 201 with the tenant, a whole tenant row (names, email, phone, the property address, co-tenants, the preferred channel, whether archived and when, when made and changed)
- **Error disclosure:** input-issues

### GET `/api/property/tenants/:id`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares tenant.merchantId !== merchantId`
- storageMethods: `getTenantProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the tenant read by id (getTenantProfile) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** read-only
- **Success:** the tenant, a whole tenant row (names, email, phone, the property address, co-tenants, the preferred channel, whether archived and when, when made and changed)
- **Error disclosure:** fixed

### PUT `/api/property/tenants/:id`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- body: `schema: updateTenantProfileSchema`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getTenantProfile`, `updateTenantProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `err.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the tenant read by id (getTenantProfile) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); body: updateTenantProfileSchema (the create rules, each field optional: one left out stays as it is, and an emptied email, phone or co-tenants is cleared, since 2026-09-27, when the edit screen's emptied field was dropped and the old value kept; other fields are dropped; 400 with the issues)
- **Idempotency:** sets the given fields and clears the emptied ones (updateTenantProfile), an archived tenant's too; the same again changes nothing but the time changed
- **Success:** the tenant afterwards, a whole tenant row (names, email, phone, the property address, co-tenants, the preferred channel, whether archived and when, when made and changed)
- **Error disclosure:** input-issues

### POST `/api/property/tenants/:id/archive`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `archiveTenantProfile`, `getTenantProfile`, `logTransactionEvent`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the tenant read by id (getTenantProfile) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** archives the tenant and cancels every automation of theirs not already cancelled (archiveTenantProfile); invoices already sent stay payable. Again archives again, with a new time, and logs again
- **Success:** the tenant afterwards, a whole tenant row (names, email, phone, the property address, co-tenants, the preferred channel, whether archived and when, when made and changed)
- **Error disclosure:** fixed

### POST `/api/property/tenants/:id/unarchive`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getTenantProfile`, `logTransactionEvent`, `unarchiveTenantProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the tenant read by id (getTenantProfile) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** restores the tenant (unarchiveTenantProfile); automations cancelled by the archive stay cancelled. Again changes nothing but the time, and logs again
- **Success:** the tenant afterwards, a whole tenant row (names, email, phone, the property address, co-tenants, the preferred channel, whether archived and when, when made and changed)
- **Error disclosure:** fixed

### GET `/api/property/tenants/:id/events`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- query: `limit: strictBoundedIntegerQueryParam`
- authChecks: `compares tenant.merchantId !== merchantId`
- storageMethods: `getTenantProfile`, `getTransactionEventsByTenant`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the tenant read by id (getTenantProfile) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); limit: strictBoundedIntegerQueryParam (50 by default, at most 200; 400 otherwise)
- **Idempotency:** read-only
- **Success:** the tenant's history, newest first: whole event rows (what happened, the invoice or automation, and what it carried: amounts, channels, a charge's type and description, an external payment reference, the tenant's names and address when added)
- **Error disclosure:** fixed

### GET `/api/property/schedules`

- middleware: `authenticateToken`
- storageMethods: `getActiveSchedulesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** every automation of the business, cancelled ones included (the screens leave those out), a whole automation row (the tenant, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled) each, all at once (no paging)
- **Error disclosure:** fixed

### POST `/api/property/tenants/:tenantId/schedules`

- middleware: `authenticateToken`
- params: `tenantId: strictUuidParam`
- authChecks: `compares tenant.merchantId !== merchantId`
- storageMethods: `createActiveSchedule`, `getActiveSchedulesByTenant`, `getOrCreateSubscription`, `getTenantProfile`, `logTransactionEvent`, `terminateActiveSchedule`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `err.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the tenant read by id (getTenantProfile) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403), and must not be archived (409, since 2026-09-27); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** tenantId: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); body: createActiveScheduleSchema (an amount of 1 cent to $1,000,000, weekly, fortnightly or monthly, a channel, the start and an optional end as date-times; other fields are dropped; 400 with the issues)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** each call adds an automation, first run on its start date, and cancels the tenant's other automations not already cancelled (owner decision 2026-09-27: the new one replaces the old; each recorded with the time and an event). Two made at the same moment could each cancel the other
- **Success:** 201 with the automation, a whole automation row (the tenant, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled)
- **Error disclosure:** input-issues
- **Finding:** The end date is stored but the rent cron never reads it (runGeneratePass; trades honours its own), and an end before the start is taken. No screen sends one.
- **Finding:** A start date in the past bills every period since, one request per cron run. No screen sends one: they start one interval from now.

### PUT `/api/property/schedules/:id`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- body: `schema: updateActiveScheduleSchema`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getActiveSchedule`, `logTransactionEvent`, `updateActiveSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `err.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the automation read by id (getActiveSchedule) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403), and not cancelled (409, since 2026-09-27: a cancelled one stays cancelled); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); body: updateActiveScheduleSchema (the amount, frequency, channel, and active or paused: 'terminated' is refused since 2026-09-27, DELETE cancels; other fields are dropped; 400 with the issues)
- **Idempotency:** sets the given fields (updateActiveSchedule). Resuming a paused automation moves its next date to the first date on its cycle after now (nextRunDateAfter; owner decision 2026-09-27), so nothing is sent for the paused time; it billed every period it missed. Pausing or resuming logs an event, again too
- **Success:** the automation afterwards, a whole automation row (the tenant, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled)
- **Error disclosure:** input-issues

### DELETE `/api/property/schedules/:id`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getActiveSchedule`, `logTransactionEvent`, `terminateActiveSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the automation read by id (getActiveSchedule) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** cancels the automation and records when (terminateActiveSchedule); a cancelled one is cancelled again, with a new time, and logged again
- **Success:** the automation afterwards, a whole automation row (the tenant, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled)
- **Error disclosure:** fixed

### GET `/api/property/invoices`

- middleware: `authenticateToken`
- query: `status: raw`, `tenantProfileId: strictUuidParam`
- storageMethods: `getInvoiceRentRequestsByMerchant`, `getTenantProfile`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** tenantProfileId: strictUuidParam when given (400 'Invalid tenantProfileId' otherwise; since 2026-09-27, a 500 before); status: raw, a string only, compared as text with each invoice's status (one that no invoice has matches nothing)
- **Idempotency:** read-only
- **Success:** the business's invoices (or one tenant's, or those of one status), a whole invoice row (the tenant and automation, amount, the checkout token, channel, rent or a charge with its type and description, the attached document's reference and name, status and its dates, the external payment reference, reminders sent, the provider's session and transaction ids, the split, the WhatsApp message id) each, with the tenant's name and property address and what is still owed (owingCents, sharesLeft), newest first, all at once (no paging)
- **Error disclosure:** fixed

### POST `/api/property/invoices/document`

- middleware: `authenticateToken`, `receiveUpload(…)`
- body: `file`
- storageMethods: `saveUploadedFile`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- helpers: `saveUploadedFile`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** the file 'document': a PDF, PNG, JPEG, WebP or HEIC by its MIME type (400 with the filter's message otherwise), whose first bytes must match that type for all but HEIC (400), up to 20 MB (413 above it), read into memory; the type and size refusals were 500s until 2026-09-27 (receiveUpload, server/routes.ts). Its own name is returned as sent
- **Idempotency:** none: each upload stores another document under a new random name (invoice-<time>-<16 hex characters>), stamped with the business (saveUploadedFile)
- **Success:** { documentUrl: an opaque reference the invoice create checks against the business, documentName: the file's own name }
- **Error disclosure:** fixed
- **Finding:** The upload is read into memory up to 20 MB per request (invoiceDocUpload), by any login of the business.

### GET `/api/invoice-documents/:name`

- middleware: `authenticateToken`
- params: `name: raw`
- authChecks: `isValidatedPlatformAdmin`
- storageMethods: `getUploadedFile`, `getUploadedFileForMerchant`, `recordInvoiceDocumentAdminRead`
- sideEffects: `audit log: logSecurityEvent`
- statuses: `200`, `401`, `404`, `500`, `503`
- helpers: `sendPrivateDocument`

Reviewed policy:

- **Who:** merchant (owner, member) — a signed-in business. **Tenant (resource):** only the business's own upload (getUploadedFileForMerchant): another business's, one no business could be attributed to, a malformed name and a missing one all give the same 404
- **Who:** platform-admin — the validated platform admin (isValidatedPlatformAdmin). **Tenant (any-merchant):** any invoice document by its generated name (owner decision S1, 2026-09-19), each read recorded before any bytes leave (recordInvoiceDocumentAdminRead: 503 when it cannot be)
- **Input:** name: must be a generated invoice-document name (isInvoiceDocumentName: 404 otherwise), so no other folder or path can be asked for
- **Idempotency:** read-only, apart from the admin's audit record
- **Side effects:** an audit log line for each admin read (logSecurityEvent: ADMIN_INVOICE_DOCUMENT_READ)
- **Success:** the document's bytes as a private download (sendPrivateDocument)
- **Error disclosure:** fixed
- **Finding:** No screen calls it yet: the property terminal shows an attached document by name only. It serves gap 13's option C (owner decision 2026-09-14): a business reading its own documents, and the admin's audited reading.

### POST `/api/property/invoices`

- middleware: `authenticateToken`
- body: `schema: createAdHocInvoiceSchema`
- authChecks: `compares tenant.merchantId !== merchantId`
- storageMethods: `createInvoiceRentRequest`, `getInvoiceRentRequest`, `getLiveInvoiceByTenant`, `getOrCreateSubscription`, `getTenantProfile`, `logTransactionEvent`, `updateInvoiceRentRequest`, `uploadedFileOwnedByMerchant`
- sideEffects: `email: resendInvoiceEmail`
- statuses: `200`, `201`, `400`, `401`, `402`, `403`, `404`, `500`, `503`
- errorTextInResponse: `err.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `generateInvoiceToken`, `requireBillingCard`, `requireOwnedInvoiceDocument`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the tenant named in the body (getTenantProfile) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: createAdHocInvoiceSchema, run before anything is read (since 2026-09-27; the tenant was read from the raw body first): the tenant as a UUID, an amount of 1 cent to $1,000,000, a channel, the due date as a date-time, splitting, rent or a charge with its type and a description of at most 200 characters, an attached document's reference (at most 500) and name (at most 255); other fields are dropped; 400 with the issues. An attached document must be the business's own upload (requireOwnedInvoiceDocument)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** Rent, when the tenant has a live rent invoice (getLiveInvoiceByTenant): that invoice takes the new amount and is sent again (200, resent: true). Otherwise, and for every charge, a new invoice with a fresh checkout token (201)
- **Side effects:** sends the tenant the payment link by the invoice's channel: WhatsApp or SMS when chosen, configured and the tenant has a phone, otherwise email (resendInvoiceEmail, then deliverInvoice, server/property-cron.ts), at once; one that fails to send stays pending and the cron retries it
- **Success:** a whole invoice row (the tenant and automation, amount, the checkout token, channel, rent or a charge with its type and description, the attached document's reference and name, status and its dates, the external payment reference, reminders sent, the provider's session and transaction ids, the split, the WhatsApp message id), with resent, delivered and deliveryReason (a fixed code: not_found, not_payable, billing_card_required, missing_data, send_failed or no_deliverable)
- **Error disclosure:** input-issues
- **Finding:** Sending rent to a tenant with a live rent invoice changes that invoice's amount, even with split shares paid or a payment session open: the shares paid were worked out on the old amount, and an open session charges the old one (R3: payment attempts).

### POST `/api/property/invoices/:id/resend`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares invoice.merchantId !== merchantId`
- storageMethods: `getInvoiceRentRequest`, `getOrCreateSubscription`
- sideEffects: `email: resendInvoiceEmail`
- statuses: `200`, `400`, `401`, `402`, `403`, `404`, `409`, `500`, `502`, `503`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the invoice read by id (getInvoiceRentRequest) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** none: each call sends the link again, and a pending or failed invoice becomes dispatched; a paid, externally paid or voided one is 409 'Invoice is not payable' (400 until 2026-09-27, P2.2), and a send that fails is 502 with its reason, a fixed code
- **Side effects:** sends the tenant the payment link by the invoice's channel: WhatsApp or SMS when chosen, configured and the tenant has a phone, otherwise email (resendInvoiceEmail, then deliverInvoice, server/property-cron.ts)
- **Success:** the invoice afterwards, a whole invoice row (the tenant and automation, amount, the checkout token, channel, rent or a charge with its type and description, the attached document's reference and name, status and its dates, the external payment reference, reminders sent, the provider's session and transaction ids, the split, the WhatsApp message id)
- **Error disclosure:** domain-errors
- **Finding:** No limit on resending: each call is an email, SMS or WhatsApp message to the tenant, at the platform's cost (operations).

### POST `/api/property/invoices/:id/void`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares invoice.merchantId !== merchantId`
- storageMethods: `getInvoiceRentRequest`, `logTransactionEvent`, `updateInvoiceRentRequest`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the invoice read by id (getInvoiceRentRequest) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** voids an invoice that is not paid (a paid or externally paid one is 409 'Cannot void a paid invoice', 400 until 2026-09-27, P2.2); a voided one is voided again, with a new time, and logged again
- **Success:** the invoice afterwards, a whole invoice row (the tenant and automation, amount, the checkout token, channel, rent or a charge with its type and description, the attached document's reference and name, status and its dates, the external payment reference, reminders sent, the provider's session and transaction ids, the split, the WhatsApp message id)
- **Error disclosure:** fixed
- **Finding:** Voiding while the tenant is paying: the provider's completion then finds the invoice settled (finalizeRentInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (Split_Share_Unrecorded). R3 (payment attempts).
- **Finding:** A split invoice with shares already paid can be voided: those shares stay collected, with nothing but their events to show for them (R3/R4, refunds).
- **Finding:** Every login of the business, a teammate included, has every property action and setting (tenants, rent and bills, voiding, marking paid outside TaptPay, automations, the reminder settings): kept by the owner's decision (2026-09-27).

### POST `/api/property/invoices/:id/mark-paid-external`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- body: `schema: markInvoicePaidExternalSchema`
- authChecks: `compares invoice.merchantId !== merchantId`
- storageMethods: `getInvoiceRentRequest`, `logTransactionEvent`, `updateInvoiceRentRequest`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `err.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the invoice read by id (getInvoiceRentRequest) must be the session's business's: another business's is 404, the same as a missing one (since 2026-09-27; it was 403), and not voided (409, since 2026-09-27: a voided one stays voided); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); body: markInvoicePaidExternalSchema (an optional reference of at most 200 characters, null or empty for none: both screens send null when no reference is typed, which was refused until 2026-09-27, batch 6d; 400 with the issues)
- **Idempotency:** marks the invoice paid outside TaptPay with the reference and the time; a paid or externally paid one is 409 'Invoice is already paid' (400 until 2026-09-27, P2.2)
- **Success:** the invoice afterwards, a whole invoice row (the tenant and automation, amount, the checkout token, channel, rent or a charge with its type and description, the attached document's reference and name, status and its dates, the external payment reference, reminders sent, the provider's session and transaction ids, the split, the WhatsApp message id)
- **Error disclosure:** input-issues
- **Finding:** Marking an invoice paid outside TaptPay while the tenant is paying: the provider's completion then finds the invoice settled (finalizeRentInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (Split_Share_Unrecorded). R3 (payment attempts).
- **Finding:** Every login of the business, a teammate included, has every property action and setting (tenants, rent and bills, voiding, marking paid outside TaptPay, automations, the reminder settings): kept by the owner's decision (2026-09-27).

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
- storageMethods: `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `invoiceHasSplitSessions`, `updateInvoiceRentRequest`, `updateJobInvoice`
- statuses: `200`, `400`, `404`, `409`, `429`, `500`
- rateLimits: `tokenRateLimit`
- helpers: `splitInvoiceRef`, `tokenRateLimit`, `updateCheckoutInvoice`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404
- **Input:** token: read raw, then looked up; body: count, a whole number from 2 to 12, strict (400 otherwise; parseInt until 2026-09-26)
- **Idempotency:** sets the invoice's share count; refused once any session has been opened for it or a share is paid (409, since 2026-09-26) and when the business has not allowed splitting (400)
- **Success:** { splitCount, splitPaidCount: 0, shareCents }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else
- **Replay:** the same count again changes nothing; another count is taken only until someone starts paying
- **Rate:** tokenRateLimit (10 a minute per token, counted in this server process only; an unknown token gets a count of its own, so it limits one link's use, not guessing, which a 160-bit token makes futile)
- **Finding:** What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment: sessions opened at once are all charged the equal share, so up to one cent per share of the remainder can go uncharged. Since 2026-09-26 the count locks once any session is opened (0030), so a share opened at 1/12 can no longer count as 1/2. The remainder is R3's (payment attempts).

### POST `/api/checkout/:token/session`

- params: `token: raw`
- body: `fields: payerEmail`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getClientProfile`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `recordInvoiceSplitSession`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: createWindcaveSession`
- statuses: `200`, `404`, `409`, `429`, `500`, `502`, `503`
- capabilityGates: `isWindcaveConfigured`
- rateLimits: `tokenRateLimit`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `getCheckoutParty`, `recordUncountedShare`, `sendRentGstInvoices`, `splitInvoiceRef`, `tokenRateLimit`, `updateCheckoutInvoice`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404
- **Input:** token: read raw, then looked up; body read without a schema: payerEmail (checked as an email address; for a split invoice kept with that session only, never on a list)
- **Capability gate:** isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE)
- **Idempotency:** none: every call opens another provider session (finding)
- **Side effects:** creates a payment session with the provider (createWindcaveSession) and, for a split invoice, records it with its amount and payer's email (recordInvoiceSplitSession, 0030); when the provider reports it already complete, settles the invoice: events, and once paid the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)
- **Success:** the provider session id, the amount and the hosted-fields submit URLs (also cached here against the token, invoiceAjaxUrlCache); or { alreadyComplete, approved }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else
- **Replay:** each call opens another provider session for the same invoice
- **Rate:** tokenRateLimit (10 a minute per token, counted in this server process only; an unknown token gets a count of its own, so it limits one link's use, not guessing, which a 160-bit token makes futile)
- **Finding:** Every call opens another provider session and re-pins a single-payment invoice to it: a payment completed on an earlier session is then refused at completion (403) and missed by the notification, which finds invoices by their pinned session. The payer is charged and the invoice stays unpaid (R3: payment attempts).
- **Finding:** What a split share costs is fixed when its session is opened, from the share count and the shares paid at that moment: sessions opened at once are all charged the equal share, so up to one cent per share of the remainder can go uncharged. Since 2026-09-26 the count locks once any session is opened (0030), so a share opened at 1/12 can no longer count as 1/2. The remainder is R3's (payment attempts).

### POST `/api/checkout/:token/hosted-fields-complete`

- params: `token: raw`
- body: `fields: sessionId`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getInvoiceSplitSession`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `200`, `400`, `403`, `404`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `recordUncountedShare`, `sendRentGstInvoices`, `splitSessionOpenedFor`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404; a single payment must send the session pinned to it, a split share a session recorded for this invoice when it was opened (getInvoiceSplitSession; 403 otherwise, since 2026-09-26)
- **Input:** token: read raw, then looked up; body read without a schema: sessionId (required; sent to the provider as one encoded path segment)
- **Capability gate:** isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE: the outcome waits)
- **Idempotency:** finalizeCheckoutInvoice: a settled invoice is left alone; a split share counts once per recorded session (atomicClaimSplitShare / atomicClaimJobSplitShare, then markInvoiceSplitSessionPaid), and an approved session that finds every share paid is recorded for a refund; a single payment settles by a read then a write
- **Side effects:** queries the provider for the session (queryWindcaveSession); once paid, the GST invoice email (rent, sendGstInvoices) or the payment invoice (trades, sendTradePaymentInvoice)
- **Success:** { approved, status, splitCount, splitPaidCount }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else, with the invoice's pinned session for a single payment or a session recorded for it for a split share
- **Replay:** a settled invoice is left alone and a split session counts once; two calls at once for a single payment can both settle it (R3 / C20)
- **Rate:** none — every call asks the provider about the session sent, with the platform's credentials

### POST `/api/checkout/:token/googlepay-complete`

- params: `token: raw`
- body: `fields: googlePayToken, sessionId`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getInvoiceSplitSession`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`, `provider: submitGooglePayToken`
- statuses: `200`, `400`, `403`, `404`, `500`, `503`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `assertWindcaveUrl`, `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `recordUncountedShare`, `sendRentGstInvoices`, `splitSessionOpenedFor`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url) selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown token is 404; a single payment must send the session pinned to it, a split share a session recorded for this invoice when it was opened (getInvoiceSplitSession; 403 otherwise, since 2026-09-26)
- **Input:** token: read raw, then looked up; body read without a schema: sessionId (required), googlePayToken (any object, passed to the provider as it came)
- **Capability gate:** isWindcaveConfigured() (503 PAYMENT_PROVIDER_UNAVAILABLE: the outcome waits)
- **Idempotency:** finalizeCheckoutInvoice: a settled invoice is left alone; a split share counts once per session; a single payment settles by a read then a write
- **Side effects:** submits the Google Pay token to the cached submit URL (submitGooglePayToken, checked by assertWindcaveUrl) or queries the provider (queryWindcaveSession); once paid, the GST invoice email (rent) or the payment invoice (trades)
- **Success:** { approved, status, splitCount, splitPaidCount }
- **Error disclosure:** fixed
- **Authenticity:** holding the invoice's checkout link: its token is the credential for that one invoice and for nothing else, with the invoice's pinned session for a single payment or a session recorded for it for a split share
- **Replay:** a settled invoice is left alone and a split session counts once; two calls at once for a single payment can both settle it (R3 / C20)
- **Rate:** none — every call reaches the provider, with the platform's credentials
- **Finding:** The submit URLs are cached per link, not per session: when two payers of one split invoice open sessions, the first one's Google Pay payment goes to the second one's session, and both sessions are then counted as shares.

### GET `/api/checkout/callback`

- query: `result: raw`, `token: raw`
- authChecks: `getCheckoutInvoiceByToken`
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `302`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `recordUncountedShare`, `sendRentGstInvoices`

Reviewed policy:

- **Who:** public-bearer. **Tenant (token):** the invoice's checkout token (20 random bytes, base64url), in the query, selects its one invoice, rent or trades (getCheckoutInvoiceByToken); an unknown one is sent home (302), this being a browser's return (the shared rule's 404 does not apply here; corrected 2026-09-27 by R1-T3's matrix)
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
- storageMethods: `atomicClaimSplitShare`, `getInvoiceRentRequest`, `getInvoiceRentRequestByWindcaveSessionId`, `getInvoiceSplitSession`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`
- sideEffects: `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `200`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimSplitShare`
- helpers: `finalizeRentInvoice`, `recordUncountedShare`, `sendRentGstInvoices`

Reviewed policy:

- **Who:** provider. **Tenant (provider-session):** the provider's session id selects the one rent invoice created with it (storage.getInvoiceRentRequestByWindcaveSessionId), or the split invoice it was recorded for (getInvoiceSplitSession, since 2026-09-26); an unknown id does nothing
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
- storageMethods: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceSplitSession`, `getJobInvoice`, `getJobInvoiceByWindcaveSessionId`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`, `email: sendGstInvoices`, `provider: queryWindcaveSession`
- statuses: `200`
- capabilityGates: `isWindcaveConfigured`
- idempotency: `atomicClaimJobSplitShare`, `atomicClaimSplitShare`
- helpers: `finalizeCheckoutInvoice`, `finalizeRentInvoice`, `finalizeTradeInvoice`, `recordUncountedShare`, `sendRentGstInvoices`

Reviewed policy:

- **Who:** provider. **Tenant (provider-session):** the provider's session id selects the one job invoice created with it (storage.getJobInvoiceByWindcaveSessionId), or the split invoice it was recorded for (getInvoiceSplitSession, since 2026-09-26); an unknown id does nothing
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
- body: `fields: data, event`
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

### GET `/api/property/reminder-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`
- helpers: `reminderSettingsOf`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { rentReminderEnabled, rentReminderDelayDays, rentReminderIntervalDays, rentReminderMaxCount }: the business's, or the defaults (on, 3, 3, 3) where unset; 404 when the business is gone
- **Error disclosure:** fixed

### PUT `/api/property/reminder-settings`

- middleware: `authenticateToken`
- body: `schema: updateRentReminderSettingsSchema`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `err.errors`
- helpers: `reminderSettingsOf`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: updateRentReminderSettingsSchema (on or off, the first reminder 0 to 90 days after the due date, then every 1 to 90 days, at most 0 to 20 reminders with 0 for no limit, shown as ∞; each optional; other fields are dropped; 400 with the issues)
- **Idempotency:** sets the given settings on the business (updateMerchant); the same again changes nothing
- **Success:** the four settings afterwards
- **Error disclosure:** input-issues
- **Finding:** Every login of the business, a teammate included, has every property action and setting (tenants, rent and bills, voiding, marking paid outside TaptPay, automations, the reminder settings): kept by the owner's decision (2026-09-27).

### GET `/api/trades/reminder-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { tradeRemindersEnabled }: the business's, or on where unset; 404 when the business is gone
- **Error disclosure:** fixed

### PUT `/api/trades/reminder-settings`

- middleware: `authenticateToken`
- body: `schema: updateTradeReminderSettingsSchema`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `err.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: updateTradeReminderSettingsSchema (tradeRemindersEnabled, true or false, required; other fields are dropped; 400 with the issues)
- **Idempotency:** sets the switch on the business (updateMerchant); the same again changes nothing. Off stops the trades payment reminders (runTradesReminderPass, which follows the rent reminder days and count); overdue invoices are still marked due
- **Success:** { tradeRemindersEnabled } afterwards
- **Error disclosure:** input-issues
- **Finding:** Every login of the business, a teammate included, has every trades action and setting but GST (clients, quotes, invoices, cancelling one, marking one paid outside TaptPay, recurring invoices, the reminder switch), as every trades screen offers them; in property the owner kept the same (2026-09-27, batch 6c answer 2).

### GET `/api/trades/gst-settings`

- middleware: `authenticateToken`
- storageMethods: `getMerchant`
- statuses: `200`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** { gstRegistered, tradeGstMode: inclusive or exclusive }: the business's, or not registered and inclusive where unset; 404 when the business is gone. The settings page reads it for every login
- **Error disclosure:** fixed

### PUT `/api/trades/gst-settings`

- middleware: `authenticateToken`
- body: `schema: updateTradeGstSettingsSchema`
- authChecks: `isAccountOwner`
- storageMethods: `updateMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `err.errors`

Reviewed policy:

- **Who:** merchant (owner). **Tenant (session):** the session's own business, its owner only (isAccountOwner: a teammate is 403 since 2026-09-27, as the settings page shows these to a teammate greyed out with the business's other details); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: updateTradeGstSettingsSchema (gstRegistered, true or false, and tradeGstMode, inclusive or exclusive, each optional; other fields are dropped; 400 with the issues)
- **Idempotency:** sets the given settings on the business (updateMerchant); the same again changes nothing. Quotes made afterwards take them (a quote keeps the GST worked out when it was made); the payment receipts (sendTradePaymentInvoice), the quote PDF's GST number and the public quote page read them when shown
- **Success:** { gstRegistered, tradeGstMode } afterwards
- **Error disclosure:** input-issues

### GET `/api/trades/clients`

- middleware: `authenticateToken`
- storageMethods: `getClientProfilesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing (the includeArchived the client directory sends is not read)
- **Idempotency:** read-only
- **Success:** every client of the business, archived ones and hidden quick-invoice prospects included (the screens leave both out of their lists), a whole client row (names, email, phone, the site address, notes, the preferred channel, the status: active, archived or a hidden quick-invoice prospect, when archived, made and changed) each, newest first, all at once (no paging)
- **Error disclosure:** fixed

### POST `/api/trades/clients`

- middleware: `authenticateToken`
- body: `schema: createClientProfileSchema`
- storageMethods: `createClientProfile`
- statuses: `201`, `400`, `401`, `403`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: createClientProfileSchema (a first and last name of 1 to 80 characters, the site address of 1 to 200, an optional email of at most 200 and phone of at most 40, notes of at most 1,000, the preferred channel: email, WhatsApp or SMS; other fields are dropped, so the business is the session's and the client active; 400 with the first issue)
- **Idempotency:** none: each call adds another client (no check for the same person)
- **Success:** 201 with the client, a whole client row (names, email, phone, the site address, notes, the preferred channel, the status: active, archived or a hidden quick-invoice prospect, when archived, made and changed)
- **Error disclosure:** input-issues

### GET `/api/trades/clients/:id`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares row.merchantId !== merchantId`
- storageMethods: `getClientProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the client read by id (getClientProfile) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** read-only
- **Success:** the client, a whole client row (names, email, phone, the site address, notes, the preferred channel, the status: active, archived or a hidden quick-invoice prospect, when archived, made and changed)
- **Error disclosure:** fixed

### PUT `/api/trades/clients/:id`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- body: `schema: updateClientProfileSchema`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `updateClientProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the client read by id (getClientProfile) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); body: updateClientProfileSchema (the create rules, each field optional: one left out stays as it is, and an emptied email, phone or notes is cleared, since 2026-09-27, when the edit screen's emptied field was dropped and the old value kept; other fields are dropped, so the status cannot be set here; 400 with the first issue)
- **Idempotency:** sets the given fields and clears the emptied ones (updateClientProfile), an archived client's or a prospect's too; the same again changes nothing but the time changed
- **Success:** the client afterwards, a whole client row (names, email, phone, the site address, notes, the preferred channel, the status: active, archived or a hidden quick-invoice prospect, when archived, made and changed)
- **Error disclosure:** input-issues

### POST `/api/trades/clients/:id/archive`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `archiveClientProfile`, `createJobEvent`, `getClientProfile`, `getJobSchedulesByMerchant`, `terminateJobSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the client read by id (getClientProfile) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** archives the client (archiveClientProfile), then cancels each of the client's recurring invoices not already cancelled, recording when (terminateJobSchedule) with a schedule_terminated event (owner decision 2026-09-27: they went on billing the archived client every period); invoices already sent stay payable. Again archives again, with a new time, and has nothing left to cancel
- **Success:** the client afterwards, a whole client row (names, email, phone, the site address, notes, the preferred channel, the status: active, archived or a hidden quick-invoice prospect, when archived, made and changed)
- **Error disclosure:** fixed
- **Finding:** The archive and the cancellations are separate writes: a failure between them leaves the client archived with recurring invoices still running, until the archive is repeated.

### POST `/api/trades/clients/:id/unarchive`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `unarchiveClientProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the client read by id (getClientProfile) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** sets the client active, whatever it was (a hidden prospect too), with no archive time (unarchiveClientProfile); recurring invoices cancelled by the archive stay cancelled. Again changes nothing but the time
- **Success:** the client afterwards, a whole client row (names, email, phone, the site address, notes, the preferred channel, the status: active, archived or a hidden quick-invoice prospect, when archived, made and changed)
- **Error disclosure:** fixed

### POST `/api/trades/clients/:id/promote`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `updateClientProfile`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the client read by id (getClientProfile) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** a hidden quick-invoice prospect becomes a listed client (status active); any other client is 409 'Client is already saved' (400 until 2026-09-27, P2.2)
- **Success:** the client afterwards, a whole client row (names, email, phone, the site address, notes, the preferred channel, the status: active, archived or a hidden quick-invoice prospect, when archived, made and changed)
- **Error disclosure:** fixed

### GET `/api/trades/clients/:id/events`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `getJobEventsByClient`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the client read by id (getClientProfile) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** read-only
- **Success:** the client's history, newest first, at most 50 (getJobEventsByClient): whole event rows (what happened, the quote, invoice or recurring invoice, and what it carried: amounts, channels, a failed send's reason, WhatsApp statuses, split shares, the provider's transaction ids)
- **Error disclosure:** fixed

### GET `/api/trades/quotes`

- middleware: `authenticateToken`
- query: `status: raw`
- storageMethods: `getQuotesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** status: raw, a string only (since 2026-09-27; a repeated one reached the query as a list), compared as text with each quote's status (one that no quote has matches nothing)
- **Idempotency:** read-only
- **Success:** the business's quotes, or those of one status, a whole quote row (the client, the public link's token, status, line items, subtotal, GST and how it was counted, total, the deposit's type, value and amount, channel, valid until, notes, an attached document's reference and name, when sent, viewed, accepted or declined, made and changed) each, newest first, all at once (no paging)
- **Error disclosure:** fixed

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

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** a client named in the body (getClientProfile) must be the session's business's: another business's is 404 'Client not found', the same as a missing one; without one, a hidden prospect is made from the recipient's details, or with none for a link-only quote; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: createQuoteSchema (exactly one of a client's UUID, a recipient (a name of 1 to 160 characters, an optional email and address) or skipClient; 1 or more lines, each a description of 1 to 200 characters, a whole quantity of 1 to 100,000 and a unit price of 0 to $1,000,000, the line total sent being ignored and worked out again; a channel; a deposit, a percentage of at most 100 or a fixed amount, its type and value required when enabled; valid until as a date-time; notes of at most 1,000 characters; an attached document's reference (at most 500) and name (at most 255); other fields are dropped; 400 with the first issue). An attached document must be the business's own upload (requireOwnedInvoiceDocument)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** none: each call makes another quote, sent at once with a new public link, and another hidden prospect when no client is named; its GST is worked out from the business's settings at that moment and kept
- **Side effects:** sends the client the quote's link, with the quote as a PDF by email by its channel: WhatsApp or SMS when chosen, configured and the client has a phone, otherwise email (server/trades-delivery.ts); a send that fails is recorded (quote_dispatch_failed) and the link still works
- **Success:** 201 with the quote, a whole quote row (the client, the public link's token, status, line items, subtotal, GST and how it was counted, total, the deposit's type, value and amount, channel, valid until, notes, an attached document's reference and name, when sent, viewed, accepted or declined, made and changed), with delivered and deliveryReason (a fixed code: not_found, missing_data, billing_card_required, send_failed or no_deliverable)
- **Error disclosure:** input-issues
- **Finding:** An archived client can still be quoted here; no screen offers it (the pickers list only current clients). Only a recurring invoice is refused for one (owner decision 2026-09-27).
- **Finding:** Each quote to someone not saved as a client makes another hidden prospect, and nothing removes them.

### GET `/api/trades/quotes/:id/pdf`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares quote.merchantId !== merchantId`
- storageMethods: `getClientProfile`, `getMerchant`, `getQuote`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`
- helpers: `streamQuotePdf`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the quote read by id (getQuote) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** read-only
- **Success:** the quote as a PDF download (quote-<business>-<reference>.pdf), made from the quote, its client and the business (generateQuotePdf); 404 'Quote details unavailable' when the client or the business is gone
- **Error disclosure:** fixed

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
- query: `clientProfileId: strictUuidParam`, `status: raw`
- storageMethods: `getJobInvoicesByMerchant`
- statuses: `200`, `400`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** clientProfileId: strictUuidParam when given (400 'Invalid clientProfileId' otherwise; since 2026-09-27, a 500 before); status: raw, a string only (since 2026-09-27; a repeated one reached the query as a list), compared as text with each invoice's status (one that no invoice has matches nothing)
- **Idempotency:** read-only
- **Success:** the business's invoices (or one client's, or those of one status), a whole invoice row (the client, quote and recurring invoice, kind, amount, the checkout token, channel, job details, status and its dates, when the job was completed, the external payment reference, reminders sent, when to send, an attached document's reference and name, the provider's session and transaction ids, the split, the WhatsApp message id) each, newest first, all at once (no paging)
- **Error disclosure:** fixed

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

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** a client named in the body (getClientProfile) must be the session's business's, and a quote named (getQuote) the business's and that client's (since 2026-09-27; it had only to be the business's): each otherwise 404, the same as a missing one; for a quick invoice, a hidden prospect is made from the recipient's details; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: createJobInvoiceSchema (a client's UUID or, for a quick invoice, a recipient: a name of 1 to 120 characters, with the email or phone its channel, email or SMS, needs; an amount of 1 cent to $1,000,000; a channel; the due date and an optional send date as date-times; the kind, full or deposit, since 2026-09-27 (a balance is made by send-balance and a recurring invoice by the cron: both were taken here); a quote's UUID, required for a deposit and not allowed for a quick invoice, which must be full; job details of at most 500 characters; splitting; an attached document's reference (at most 500) and name (at most 255); other fields are dropped; 400 with the first issue). An attached document must be the business's own upload (requireOwnedInvoiceDocument)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** none: each call makes another invoice with a fresh checkout token, and a hidden prospect for a quick invoice. Several deposits on one quote are taken; send-balance subtracts them all
- **Side effects:** sends the client the payment link by its channel: WhatsApp or SMS when chosen, configured and the client has a phone, otherwise email (server/trades-delivery.ts), at once unless the send date is later (the cron sends it then); a send that fails stays pending and the cron retries it
- **Success:** 201 with the invoice, a whole invoice row (the client, quote and recurring invoice, kind, amount, the checkout token, channel, job details, status and its dates, when the job was completed, the external payment reference, reminders sent, when to send, an attached document's reference and name, the provider's session and transaction ids, the split, the WhatsApp message id), with delivered and deliveryReason (a fixed code: scheduled, not_found, not_payable, missing_data, send_failed or no_deliverable)
- **Error disclosure:** input-issues
- **Finding:** An archived client can still be invoiced here; no screen offers it (the pickers list only current clients). Only a recurring invoice is refused for one (owner decision 2026-09-27).
- **Finding:** A deposit's amount is the one typed, not checked against the deposit its quote worked out.

### POST `/api/trades/invoices/:id/send-balance`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- body: `schema: sendJobBalanceSchema`
- authChecks: `compares dep.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `createJobInvoice`, `getJobInvoice`, `getJobInvoicesByMerchant`, `getOrCreateSubscription`, `getQuote`
- sideEffects: `email/SMS: resendTradeInvoice`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `body.error.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `generateInvoiceToken`, `requireBillingCard`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the deposit invoice read by id (getJobInvoice) must be the session's business's: another business's is 404, the same as a missing one; its quote is the one the deposit names (getQuote); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); body: sendJobBalanceSchema (splitEnabled, true or false, optional, and nothing else, since 2026-09-27: it was read from the raw body, so "yes" turned splitting on; 400 with the first issue)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** one balance per quote: the invoice must be a deposit (400), paid (409) and on a quote (400); a balance already made and not voided is 409. The balance is the quote's total less every invoice of the client's on that quote not voided (400 when nothing is left), due in 7 days, by the deposit's channel
- **Side effects:** sends the client the balance's payment link by its channel: WhatsApp or SMS when chosen, configured and the client has a phone, otherwise email (server/trades-delivery.ts), at once
- **Success:** 201 with the balance invoice, a whole invoice row (the client, quote and recurring invoice, kind, amount, the checkout token, channel, job details, status and its dates, when the job was completed, the external payment reference, reminders sent, when to send, an attached document's reference and name, the provider's session and transaction ids, the split, the WhatsApp message id), with delivered and deliveryReason (a fixed code: not_found, not_payable, missing_data, send_failed or no_deliverable)
- **Error disclosure:** input-issues
- **Finding:** Two sends at the same moment can each find no balance and each make one, billing the client twice: the one-balance check is a read, then a write (R3).

### POST `/api/trades/invoices/:id/mark-paid-external`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- body: `schema: markJobPaidExternalSchema`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobInvoice`, `updateJobInvoice`
- sideEffects: `email/SMS: sendTradePaymentInvoice`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the invoice read by id (getJobInvoice) must be the session's business's: another business's is 404, the same as a missing one, and neither voided nor already paid (409 each, since 2026-09-27); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); body: markJobPaidExternalSchema (an optional reference of at most 200 characters, null or empty for none: every screen sends null when no reference is typed, and the desktop always does, which was refused until 2026-09-27; 400 with the first issue)
- **Idempotency:** marks the invoice paid outside TaptPay with the reference and the time, and logs it; a voided or paid one is 409 (since 2026-09-27: each call marked it again and emailed the client another receipt)
- **Side effects:** emails the client a receipt for the invoice, with the business's GST number (sendTradePaymentInvoice); nothing when the client has no email
- **Success:** the invoice afterwards, a whole invoice row (the client, quote and recurring invoice, kind, amount, the checkout token, channel, job details, status and its dates, when the job was completed, the external payment reference, reminders sent, when to send, an attached document's reference and name, the provider's session and transaction ids, the split, the WhatsApp message id)
- **Error disclosure:** input-issues
- **Finding:** Marking an invoice paid outside TaptPay while the client is paying: the provider's completion then finds the invoice settled (finalizeTradeInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (split_share_unrecorded). R3 (payment attempts).
- **Finding:** Every login of the business, a teammate included, has every trades action and setting but GST (clients, quotes, invoices, cancelling one, marking one paid outside TaptPay, recurring invoices, the reminder switch), as every trades screen offers them; in property the owner kept the same (2026-09-27, batch 6c answer 2).

### POST `/api/trades/invoices/:id/complete`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobInvoice`, `updateJobInvoice`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the invoice read by id (getJobInvoice) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** records the job complete, with the time and a job_completed event, on a paid invoice that is not a deposit: a deposit is 409 (the balance comes first), an unpaid invoice 409. Again records a new time, and logs again
- **Success:** the invoice afterwards, a whole invoice row (the client, quote and recurring invoice, kind, amount, the checkout token, channel, job details, status and its dates, when the job was completed, the external payment reference, reminders sent, when to send, an attached document's reference and name, the provider's session and transaction ids, the split, the WhatsApp message id)
- **Error disclosure:** fixed

### POST `/api/trades/invoices/:id/void`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares inv.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobInvoice`, `updateJobInvoice`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the invoice read by id (getJobInvoice) must be the session's business's: another business's is 404, the same as a missing one, and not paid (409 since 2026-09-27: the screens offer cancelling only an unpaid one); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** voids the invoice with the time and logs it in the client's history (invoice_voided, since 2026-09-27); a voided one is voided again, with a new time, and logged again
- **Success:** the invoice afterwards, a whole invoice row (the client, quote and recurring invoice, kind, amount, the checkout token, channel, job details, status and its dates, when the job was completed, the external payment reference, reminders sent, when to send, an attached document's reference and name, the provider's session and transaction ids, the split, the WhatsApp message id)
- **Error disclosure:** fixed
- **Finding:** Voiding while the client is paying: the provider's completion then finds the invoice settled (finalizeTradeInvoice), so a single payment's charge is recorded nowhere; a split share's is logged (split_share_unrecorded). R3 (payment attempts).
- **Finding:** A split invoice with shares already paid can be voided: those shares stay collected, with nothing but their events to show for them (R3/R4, refunds).
- **Finding:** Every login of the business, a teammate included, has every trades action and setting but GST (clients, quotes, invoices, cancelling one, marking one paid outside TaptPay, recurring invoices, the reminder switch), as every trades screen offers them; in property the owner kept the same (2026-09-27, batch 6c answer 2).

### GET `/api/trades/schedules`

- middleware: `authenticateToken`
- storageMethods: `getJobSchedulesByMerchant`
- statuses: `200`, `401`, `403`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (session):** the session's own business: nothing in the request names one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** nothing
- **Idempotency:** read-only
- **Success:** every recurring invoice of the business, cancelled ones included (the recurring-invoice page lists them with their status), a whole recurring invoice row (the client, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled) each, newest first, all at once (no paging)
- **Error disclosure:** fixed

### POST `/api/trades/schedules`

- middleware: `authenticateToken`
- body: `schema: createJobScheduleSchema`
- authChecks: `compares client.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `createJobSchedule`, `getClientProfile`, `getOrCreateSubscription`
- statuses: `201`, `400`, `401`, `402`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`
- entitlementGates: `BILLING_CARD_REQUIRED`, `billingCardIsReady`, `requireBillingCard`
- helpers: `requireBillingCard`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the client named in the body (getClientProfile) must be the session's business's: another business's is 404 'Client not found', the same as a missing one; and not archived (409 since 2026-09-27: archiving cancels a client's recurring invoices, owner decision); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** body: createJobScheduleSchema (the client's UUID, an amount of 1 cent to $1,000,000, weekly, fortnightly or monthly, a channel, the start and an optional end as date-times; other fields are dropped; 400 with the first issue). An end before the start is 400, and a start more than a day before now is 400 "The start date can't be in the past" (owner decision 2026-09-27: it billed every period since, one overdue invoice per cron run; the day's grace is because the forms send today's UTC date at 09:00 UTC)
- **Entitlement gate:** paid access (requireBillingCard: 402 BILLING_CARD_REQUIRED otherwise)
- **Idempotency:** none: each call adds another recurring invoice, first run on its start date; a client may have several, one per job
- **Success:** 201 with the recurring invoice, a whole recurring invoice row (the client, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled)
- **Error disclosure:** input-issues

### PUT `/api/trades/schedules/:id`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- body: `schema: updateJobScheduleSchema`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobSchedule`, `updateJobSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`
- errorTextInResponse: `parsed.error.errors`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the recurring invoice read by id (getJobSchedule) must be the session's business's: another business's is 404, the same as a missing one, and not cancelled (409 since 2026-09-27: a cancelled one stays cancelled); the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500); body: updateJobScheduleSchema (the amount, frequency, channel, and active or paused: 'terminated' is refused since 2026-09-27, DELETE cancels; other fields are dropped; 400 with the first issue)
- **Idempotency:** sets the given fields (updateJobSchedule). Resuming a paused one moves its next date to the first date on its cycle after now, a monthly one kept on its start date's day of the month (nextJobRunDateAfter; owner decision 2026-09-27), so nothing is sent for the paused time; it billed every period it missed. Every call logs an event (paused, resumed or updated, with the change), again too
- **Success:** the recurring invoice afterwards, a whole recurring invoice row (the client, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled)
- **Error disclosure:** input-issues

### DELETE `/api/trades/schedules/:id`

- middleware: `authenticateToken`
- params: `id: strictUuidParam`
- authChecks: `compares existing.merchantId !== merchantId`
- storageMethods: `createJobEvent`, `getJobSchedule`, `terminateJobSchedule`
- statuses: `200`, `400`, `401`, `403`, `404`, `500`, `503`

Reviewed policy:

- **Who:** merchant (owner, member). **Tenant (resource):** the recurring invoice read by id (getJobSchedule) must be the session's business's: another business's is 404, the same as a missing one; the platform admin, with no business, is refused (403 "Merchant access required", since 2026-09-27 (R1-T3))
- **Input:** id: strictUuidParam (400 'Invalid id' otherwise; since 2026-09-27, when a malformed one reached PostgreSQL's uuid cast, a 500)
- **Idempotency:** cancels the recurring invoice, recording when (terminateJobSchedule), and logs it; a cancelled one is cancelled again, with a new time, and logged again. Invoices it already made stay payable
- **Success:** the recurring invoice afterwards, a whole recurring invoice row (the client, amount, frequency, channel, start and end, next and last run, status, when made, changed and cancelled)
- **Error disclosure:** fixed

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
