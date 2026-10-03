# R1-T7 tenant/storage execution inventory

Generated from working-tree sources on base `c0fb5bc3981cbedd8a46f864f0e224092c417369`; the phase evidence names the final commit.

Registrations: **187**; registrations with session/admin authentication: **119**;
registrations calling checkMerchantOwnership: **25**.
IStorage: **238** declared methods;
PaymentAttemptRepository: **8** inherited methods.

Classifications come from the reviewed per-route branches, including mixed public/signed-in routes.
Authentication counts include middleware and handler checks. Storage calls follow same-file helpers,
with the route-facts extractor's documented boundaries. Counts are not a subtraction-based gap estimate.
The method table records
whether a signature requires an explicit merchantId argument. Structured-input, account, admin,
provider and public-token methods need their separate policy; absence of that argument alone is not a defect.
A required argument alone does not prove SQL scoping. Each implemented batch needs direct storage
tests, two-tenant HTTP tests and a reviewed SQL predicate. This inventory does not close R1-T7.

## Route classifications

| Registration | Reviewed scope(s) | Storage calls in handler/helpers |
|---|---|---|
| ALL /api/billing/card/notification | provider (provider/none) | — |
| ALL /api/pay/notification/:state | provider (provider/token) | — |
| ALL /api/windcave/notification | provider (provider/provider-session) | `getNextPendingSplit`, `getTransaction`, `getTransactionByWindcaveSessionId`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionSessionState`, `updateTransactionStatus` |
| ALL /api/windcave/rent-notification | provider (provider/provider-session) | `atomicClaimSplitShare`, `getInvoiceRentRequest`, `getInvoiceRentRequestByWindcaveSessionId`, `getInvoiceSplitSession`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest` |
| ALL /api/windcave/trades-notification | provider (provider/provider-session) | `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceSplitSession`, `getJobInvoice`, `getJobInvoiceByWindcaveSessionId`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`, `updateJobInvoice` |
| DELETE /api/billing/card | tenant (merchant/session) | `removeSubscriptionCard` |
| DELETE /api/merchants/:id/logo | tenant (merchant/path-merchant) | `deleteUploadedFile`, `getMerchant`, `updateMerchantLogoUrl` |
| DELETE /api/merchants/:merchantId/stock-items/:itemId | tenant (merchant/path-merchant) | `deleteStockItemForMerchant`, `getStockItemForMerchant` |
| DELETE /api/merchants/:merchantId/tapt-stones/:stoneId | tenant (merchant/path-merchant) | `deleteTaptStoneForMerchant`, `getTaptStoneForMerchant` |
| DELETE /api/property/schedules/:id | tenant (merchant/resource) | `getActiveScheduleForMerchant`, `terminateActiveScheduleForMerchant` |
| DELETE /api/team/:userId | tenant (merchant/resource) | `deactivatePushSubscriptionsForLogin`, `getUserById`, `removeTeamMember` |
| DELETE /api/team/:userId/invite | tenant (merchant/resource) | `revokeTeamInvite` |
| DELETE /api/trades/schedules/:id | tenant (merchant/resource) | `createJobEvent`, `getJobSchedule`, `terminateJobSchedule` |
| GET /.well-known/apple-developer-merchantid-domain-association | public (public/none) | — |
| GET /api/admin/analytics | validated admin (platform-admin/any-merchant) | `getAllMerchants`, `getMerchantAnalytics`, `getSubscriptionRevenue`, `getTransactionsByMerchant` |
| GET /api/admin/auth/me | validated admin (platform-admin/none) | — |
| GET /api/admin/email-status | validated admin (platform-admin/none) | — |
| GET /api/admin/ga4-detailed | validated admin (platform-admin/none) | — |
| GET /api/admin/ga4-metrics | validated admin (platform-admin/none) | — |
| GET /api/admin/merchants | validated admin (platform-admin/any-merchant) | `getAllMerchants` |
| GET /api/admin/merchants/:id | validated admin (platform-admin/any-merchant) | `getMerchant` |
| GET /api/admin/merchants/:id/transactions | validated admin (platform-admin/any-merchant) | `getTransactionsByMerchant` |
| GET /api/admin/payment-method-breakdown | validated admin (platform-admin/any-merchant) | `getAllMerchants`, `getTransactionsByMerchant` |
| GET /api/admin/request-origin | validated admin (platform-admin/none) | — |
| GET /api/admin/revenue-over-time | validated admin (platform-admin/any-merchant) | `getAllMerchants`, `getTransactionsByMerchant` |
| GET /api/auth/google | public (public/none) | — |
| GET /api/auth/google/callback | account entry/recovery (public/credentials) | `createAuthHandoffCode`, `createMerchantWithPassword`, `getMerchantByEmail`, `getUserByEmail`, `settleAuthThrottle`, `takeAuthThrottleSlot`, `updateMerchant` |
| GET /api/auth/me | account (merchant/session) | `getMerchant`, `getOrCreateSubscription` |
| GET /api/auth/session | public (public/session) | `getMerchant`, `getOrCreateSubscription` |
| GET /api/auth/validate-reset-token/:token | single-resource bearer (public-bearer/token) | — |
| GET /api/billing/card | tenant (merchant/session) | `getMerchant`, `getOrCreateSubscription` |
| GET /api/billing/card/callback | public (public/none) | — |
| GET /api/checkout/callback | single-resource bearer (public-bearer/token) | `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`, `updateJobInvoice` |
| GET /api/checkout/document/:token | single-resource bearer (public-bearer/token) | `consumeInvoiceDocumentReadLimit`, `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `getUploadedFileForMerchant` |
| GET /api/checkout/resolve/:token | single-resource bearer (public-bearer/token) | `getActiveSchedule`, `getClientProfile`, `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `getMerchant`, `getQuote`, `getTenantProfile`, `uploadedFileOwnedByMerchant` |
| GET /api/internal/cron/status | scheduler (cron/none) | — |
| GET /api/invoice-documents/:name | tenant (merchant/resource); validated admin (platform-admin/any-merchant) | `getUploadedFile`, `getUploadedFileForMerchant`, `recordInvoiceDocumentAdminRead` |
| GET /api/merchants/:id/active-transaction | tenant (merchant/path-merchant); public (public/board) | `getActiveTransactionByMerchant`, `getTaptStone` |
| GET /api/merchants/:id/events | tenant (merchant/path-merchant); public (public/board) | `getTaptStone` |
| GET /api/merchants/:id/export/pdf | tenant (merchant/path-merchant) | `getMerchant`, `getMerchantAnalyticsWithDateRange`, `getTransactionsByMerchantWithDateRange` |
| GET /api/merchants/:id/profile | tenant (merchant/path-merchant) | `getMerchant` |
| GET /api/merchants/:id/qr | public (public/none) | — |
| GET /api/merchants/:id/stone/:stoneId/brand | public (public/board) | `getMerchant`, `getTaptStone` |
| GET /api/merchants/:id/stone/:stoneId/qr | public (public/board) | `getTaptStone` |
| GET /api/merchants/:id/tapt-stones | tenant (merchant/path-merchant) | `getTaptStonesByMerchant` |
| GET /api/merchants/:id/transactions | tenant (merchant/path-merchant) | `getTransactionsByMerchant` |
| GET /api/merchants/:merchantId/refunds | tenant (merchant/resource) | `getRefundsByMerchant` |
| GET /api/merchants/:merchantId/stock-items | tenant (merchant/path-merchant) | `getStockItemsByMerchant` |
| GET /api/nfc/capabilities | public (public/none) | — |
| GET /api/pay/return/:state | single-resource bearer (public-bearer/token) | — |
| GET /api/pay/t/:token | single-resource bearer (public-bearer/token) | `getMerchant` |
| GET /api/pay/t/:token/qr | single-resource bearer (public-bearer/token) | — |
| GET /api/pay/t/:token/receipt | single-resource bearer (public-bearer/token) | `getMerchant`, `getSplitPaymentsByTransaction` |
| GET /api/pay/t/:token/receipt-qr | single-resource bearer (public-bearer/token) | `getMerchant`, `getSplitPaymentsByTransaction` |
| GET /api/property/invoices | tenant (merchant/session) | `getInvoiceRentRequestsByMerchant`, `getTenantProfileForMerchant` |
| GET /api/property/reminder-settings | tenant (merchant/session) | `getMerchant` |
| GET /api/property/schedules | tenant (merchant/session) | `getActiveSchedulesByMerchant` |
| GET /api/property/tenants | tenant (merchant/session) | `getTenantProfilesByMerchant` |
| GET /api/property/tenants/:id | tenant (merchant/resource) | `getTenantProfileForMerchant` |
| GET /api/property/tenants/:id/events | tenant (merchant/resource) | `getTenantProfileForMerchant`, `getTransactionEventsByTenantForMerchant` |
| GET /api/push/capabilities | public (public/none) | — |
| GET /api/push/preferences | tenant (merchant/session) | `getPushNotificationPreferences` |
| GET /api/push/status | tenant (merchant/session) | `getPushNotificationPreferences`, `getPushSubscriptionsForLogin` |
| GET /api/push/vapid-key | public (public/none) | — |
| GET /api/split-payments/:id | public (public/number) | `getSplitPaymentById`, `getTransaction` |
| GET /api/subscription | tenant (merchant/session) | `countSeatsInUse`, `getOrCreateSubscription` |
| GET /api/subscription/billing-history | tenant (merchant/session) | `getBillingHistory` |
| GET /api/team | tenant (merchant/session) | `countSeatsInUse`, `getOrCreateSubscription`, `getTeamMembers` |
| GET /api/trades/clients | tenant (merchant/session) | `getClientProfilesByMerchant` |
| GET /api/trades/clients/:id | tenant (merchant/resource) | `getClientProfileForMerchant` |
| GET /api/trades/clients/:id/events | tenant (merchant/resource) | `getClientProfileForMerchant`, `getJobEventsByClientForMerchant` |
| GET /api/trades/gst-settings | tenant (merchant/session) | `getMerchant` |
| GET /api/trades/invoices | tenant (merchant/session) | `getJobInvoicesByMerchant` |
| GET /api/trades/quotes | tenant (merchant/session) | `getQuotesByMerchant` |
| GET /api/trades/quotes/:id/pdf | tenant (merchant/resource) | `getMerchant`, `getQuoteDeliveryForMerchant` |
| GET /api/trades/quotes/token/:token | single-resource bearer (public-bearer/token) | `createJobEvent`, `getClientProfile`, `getJobInvoicesByQuote`, `getMerchant`, `getQuoteByToken`, `updateQuote` |
| GET /api/trades/quotes/token/:token/pdf | single-resource bearer (public-bearer/token) | `getClientProfile`, `getMerchant`, `getQuoteByToken` |
| GET /api/trades/reminder-settings | tenant (merchant/session) | `getMerchant` |
| GET /api/trades/schedules | tenant (merchant/session) | `getJobSchedulesByMerchant` |
| GET /api/transactions/:id | public (public/number) | `getMerchant`, `getTransaction` |
| GET /api/transactions/:id/receipt-qr | public (public/number) | `getTransaction` |
| GET /api/transactions/:transactionId/refunds | tenant (merchant/resource) | `getRefundsForTransactionForMerchant`, `getTransactionForMerchant` |
| GET /api/tutorial/state | tenant (merchant/session) | `getMerchant`, `getMerchantTutorialProgress` |
| GET /api/v1/transactions/:id | API-key tenant (api-key/resource) | `getApiKeyByKey`, `getTransactionForMerchant`, `logApiRequest`, `updateApiKeyLastUsed` |
| GET /api/windcave/callback | public (public/number) | `getNextPendingSplit`, `getTransaction`, `getTransactionByWindcaveSessionId`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionSessionState`, `updateTransactionStatus` |
| GET /api/windcave/env | public (public/none) | — |
| GET /nfc/:merchantId | public (public/none) | — |
| GET /nfc/:merchantId/stone/:stoneId | public (public/none) | — |
| GET /robots.txt | public (public/none) | — |
| GET /sitemap.xml | public (public/none) | — |
| GET /uploads/:folder/:name | public (public/none) | `getUploadedFile` |
| PATCH /api/admin/merchants/:id/windcave-merchant-id | validated admin (platform-admin/any-merchant) | `getMerchant`, `updateMerchant` |
| PATCH /api/tutorial/pages/:pageKey | tenant (merchant/session) | `getMerchant`, `upsertMerchantTutorialProgress` |
| POST /api/admin/auth/login | account entry/recovery (public/credentials) | `settleAuthThrottle`, `takeAuthThrottleSlot` |
| POST /api/admin/auth/logout | validated admin (platform-admin/none) | — |
| POST /api/admin/merchants/:id/activate | validated admin (platform-admin/any-merchant) | `getMerchant`, `verifyMerchant` |
| POST /api/admin/merchants/:id/set-active | validated admin (platform-admin/any-merchant) | `getMerchant`, `updateMerchantStatus` |
| POST /api/admin/merchants/:id/verify | validated admin (platform-admin/any-merchant) | `getMerchant`, `updateMerchantStatus` |
| POST /api/admin/resend-verification | validated admin (platform-admin/any-merchant) | `getMerchantByEmail` |
| POST /api/auth/confirm-email | single-resource bearer (public-bearer/token) | `confirmMerchantEmail`, `getMerchantByToken`, `settleAuthThrottle`, `takeAuthThrottleSlot` |
| POST /api/auth/forgot-password | account entry/recovery (public/mailbox) | `takeAuthThrottleSlot` |
| POST /api/auth/google/session | single-resource bearer (public-bearer/token) | `consumeAuthHandoffCode` |
| POST /api/auth/login | account entry/recovery (public/credentials) | `settleAuthThrottle`, `takeAuthThrottleSlot` |
| POST /api/auth/logout | account (merchant/session) | — |
| POST /api/auth/resend-confirmation | account entry/recovery (public/mailbox) | `getMerchantByEmail`, `takeAuthThrottleSlot` |
| POST /api/auth/reset-password | single-resource bearer (public-bearer/token) | `deactivatePushSubscriptionsForLogin`, `forgetAuthThrottle`, `getUserById` |
| POST /api/auth/sign-out-everywhere | account (merchant/session) | `advanceUserSessionVersion`, `deactivatePushSubscriptionsForLogin` |
| POST /api/billing/card/callback | public (public/none) | — |
| POST /api/billing/card/confirm | tenant (merchant/session) | `completeSubscriptionCardSetup`, `countSeatsInUse`, `getSubscription` |
| POST /api/billing/card/session | tenant (merchant/session) | `bindSubscriptionCardSession`, `getMerchant`, `getOrCreateSubscription` |
| POST /api/board-builder/submit | tenant (merchant/session) | `getMerchant`, `getTaptStone`, `settleAuthThrottle`, `takeAuthThrottleSlot` |
| POST /api/checkout/:token/googlepay-complete | single-resource bearer (public-bearer/token) | `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getInvoiceSplitSession`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`, `updateJobInvoice` |
| POST /api/checkout/:token/hosted-fields-complete | single-resource bearer (public-bearer/token) | `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getInvoiceSplitSession`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `updateInvoiceRentRequest`, `updateJobInvoice` |
| POST /api/checkout/:token/session | single-resource bearer (public-bearer/token) | `atomicClaimJobSplitShare`, `atomicClaimSplitShare`, `createJobEvent`, `getClientProfile`, `getInvoiceRentRequest`, `getInvoiceRentRequestByToken`, `getJobInvoice`, `getJobInvoiceByToken`, `getMerchant`, `getPaidInvoiceSplitPayerEmails`, `getTenantProfile`, `logTransactionEvent`, `markInvoiceSplitSessionPaid`, `recordInvoiceSplitSession`, `updateInvoiceRentRequest`, `updateJobInvoice` |
| POST /api/checkout/:token/split | single-resource bearer (public-bearer/token) | `getInvoiceRentRequestByToken`, `getJobInvoiceByToken`, `invoiceHasSplitSessions`, `updateInvoiceRentRequest`, `updateJobInvoice` |
| POST /api/info-pack-leads | public (public/none) | `createInfoPackLead` |
| POST /api/internal/cron | scheduler (cron/system) | — |
| POST /api/merchants/:id/logo | tenant (merchant/path-merchant) | `deleteUploadedFile`, `saveUploadedFile`, `updateMerchantLogoUrl` |
| POST /api/merchants/:id/onboarding | tenant (merchant/path-merchant) | `getMerchant`, `updateMerchant` |
| POST /api/merchants/:id/tapt-stones | tenant (merchant/path-merchant) | `createNextTaptStone`, `getMerchant`, `updateTaptStoneUrlsForMerchant` |
| POST /api/merchants/:merchantId/stock-items | tenant (merchant/path-merchant) | `createStockItem` |
| POST /api/merchants/signup | account entry/recovery (public/mailbox) | `createMerchantWithSignup`, `getMerchantByEmail`, `getUserByEmail`, `takeAuthThrottleSlot` |
| POST /api/pay/t/:token/googlepay-complete | single-resource bearer (public-bearer/token) | — |
| POST /api/pay/t/:token/hosted-fields-complete | single-resource bearer (public-bearer/token) | — |
| POST /api/pay/t/:token/receipt-pdf | single-resource bearer (public-bearer/token) | `getMerchant`, `getSplitPaymentsByTransaction` |
| POST /api/pay/t/:token/session | single-resource bearer (public-bearer/token) | `getMerchant`, `getNextPendingSplit`, `updateTransactionStatus` |
| POST /api/pay/t/:token/split | single-resource bearer (public-bearer/token) | `createBillSplit`, `getMerchant` |
| POST /api/property/invoices | tenant (merchant/resource) | `createOrReuseInvoiceRentRequestForMerchant`, `getInvoiceRentRequestForMerchant`, `getOrCreateSubscription`, `getTenantProfileForMerchant`, `uploadedFileOwnedByMerchant` |
| POST /api/property/invoices/:id/mark-paid-external | tenant (merchant/resource) | `getInvoiceRentRequestForMerchant`, `markInvoiceRentRequestPaidExternalForMerchant` |
| POST /api/property/invoices/:id/resend | tenant (merchant/resource) | `getInvoiceRentRequestForMerchant`, `getOrCreateSubscription` |
| POST /api/property/invoices/:id/void | tenant (merchant/resource) | `getInvoiceRentRequestForMerchant`, `voidInvoiceRentRequestForMerchant` |
| POST /api/property/invoices/document | tenant (merchant/session) | `saveUploadedFile` |
| POST /api/property/tenants | tenant (merchant/session) | `createTenantProfileForMerchant`, `logTransactionEvent` |
| POST /api/property/tenants/:id/archive | tenant (merchant/resource) | `archiveTenantProfileForMerchant`, `getTenantProfileForMerchant`, `logTransactionEvent` |
| POST /api/property/tenants/:id/unarchive | tenant (merchant/resource) | `getTenantProfileForMerchant`, `logTransactionEvent`, `unarchiveTenantProfileForMerchant` |
| POST /api/property/tenants/:tenantId/schedules | tenant (merchant/resource) | `createActiveScheduleForMerchant`, `getOrCreateSubscription`, `getTenantProfileForMerchant` |
| POST /api/push/native-subscribe | tenant (merchant/session) | `createPushSubscription` |
| POST /api/push/native-unsubscribe | tenant (merchant/session) | `deactivateNativePushSubscriptionsForLogin`, `deactivatePushSubscriptionByEndpoint`, `getPushSubscriptionsByMerchant` |
| POST /api/push/subscribe | tenant (merchant/session) | `createPushSubscription` |
| POST /api/push/unsubscribe | tenant (merchant/session) | `deactivatePushSubscriptionByEndpoint`, `getPushSubscriptionsByMerchant` |
| POST /api/subscription/cancel | tenant (merchant/session) | `cancelSubscription`, `countSeatsInUse`, `getOrCreateSubscription` |
| POST /api/subscription/resume | tenant (merchant/session) | `countSeatsInUse`, `resumeSubscription` |
| POST /api/team/:userId/resend | tenant (merchant/resource) | `getMerchant`, `getUserById`, `revokeTeamInvite`, `rotateTeamInvite` |
| POST /api/team/accept-invite | single-resource bearer (public-bearer/token) | `activateInvitedUser`, `getUserByInviteToken` |
| POST /api/team/invite | tenant (merchant/session) | `getMerchant`, `getOrCreateSubscription`, `inviteTeamMember`, `revokeTeamInvite` |
| POST /api/trades/clients | tenant (merchant/session) | `createClientProfileForMerchant` |
| POST /api/trades/clients/:id/archive | tenant (merchant/resource) | `archiveClientProfileForMerchant`, `getClientProfileForMerchant` |
| POST /api/trades/clients/:id/promote | tenant (merchant/resource) | `getClientProfileForMerchant`, `promoteClientProfileForMerchant` |
| POST /api/trades/clients/:id/unarchive | tenant (merchant/resource) | `getClientProfileForMerchant`, `unarchiveClientProfileForMerchant` |
| POST /api/trades/invoices | tenant (merchant/resource) | `createClientProfileForMerchant`, `createJobEvent`, `createJobInvoice`, `getClientProfile`, `getOrCreateSubscription`, `getQuote`, `uploadedFileOwnedByMerchant` |
| POST /api/trades/invoices/:id/complete | tenant (merchant/resource) | `completeJobInvoiceForMerchant`, `getJobInvoiceForMerchant` |
| POST /api/trades/invoices/:id/mark-paid-external | tenant (merchant/resource) | `getJobInvoiceForMerchant`, `markJobInvoicePaidExternalForMerchant` |
| POST /api/trades/invoices/:id/send-balance | tenant (merchant/resource) | `createJobEvent`, `createJobInvoice`, `getJobInvoice`, `getJobInvoicesByMerchant`, `getOrCreateSubscription`, `getQuote` |
| POST /api/trades/invoices/:id/void | tenant (merchant/resource) | `getJobInvoiceForMerchant`, `voidJobInvoiceForMerchant` |
| POST /api/trades/quotes | tenant (merchant/resource) | `createClientProfileForMerchant`, `createJobEvent`, `createQuote`, `getClientProfile`, `getMerchant`, `getOrCreateSubscription`, `uploadedFileOwnedByMerchant` |
| POST /api/trades/quotes/token/:token/respond | single-resource bearer (public-bearer/token) | `createJobEvent`, `createJobInvoice`, `getOrCreateSubscription`, `getQuoteByToken`, `updateQuote` |
| POST /api/trades/schedules | tenant (merchant/resource) | `createJobEvent`, `createJobSchedule`, `getClientProfile`, `getOrCreateSubscription` |
| POST /api/transactions | tenant (merchant/path-merchant) | `createTransactionForMerchant`, `getOrCreateSubscription`, `getTaptStoneForMerchant` |
| POST /api/transactions/:id/cancel | tenant (merchant/resource) | `cancelTransactionForMerchant`, `getTransaction`, `getTransactionForMerchant` |
| POST /api/transactions/:id/googlepay-complete | public (public/number) | `getNextPendingSplit`, `getTransaction`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionPaymentMethod`, `updateTransactionSessionState`, `updateTransactionStatus` |
| POST /api/transactions/:id/hosted-fields-complete | public (public/number) | `getNextPendingSplit`, `getTransaction`, `incrementTransactionCount`, `updateSplitPaymentStatus`, `updateTransactionPaymentMethod`, `updateTransactionSessionState`, `updateTransactionStatus` |
| POST /api/transactions/:id/pay | public (public/number) | `getMerchant`, `getNextPendingSplit`, `getTaptStone`, `getTransaction`, `updateTransactionStatus`, `updateTransactionWindcaveSession` |
| POST /api/transactions/:id/receipt-pdf | public (public/number) | `getMerchant`, `getSplitPaymentById`, `getSplitPaymentsByTransaction`, `getTransaction` |
| POST /api/transactions/:id/split | public (public/number) | `createBillSplit`, `getTransaction` |
| POST /api/transactions/:transactionId/refunds | tenant (merchant/resource) | `createRefundForMerchant`, `getTransactionForMerchant`, `releaseRefundAmountForMerchant`, `reserveRefundAmountForMerchant`, `updateRefundStatusForMerchant` |
| POST /api/transactions/cash-sale | tenant (merchant/path-merchant) | `createTransactionForMerchant`, `getOrCreateSubscription`, `getTaptStoneForMerchant` |
| POST /api/transactions/tap-to-pay | tenant (merchant/path-merchant) | `createTransactionForMerchant`, `getActiveTransactionByMerchant`, `getOrCreateSubscription`, `getTransactionForMerchant`, `updateTransactionPaymentMethodForMerchant`, `updateTransactionStatusForMerchant` |
| POST /api/tutorial/restart | tenant (merchant/session) | `restartMerchantTutorial` |
| POST /api/v1/transactions | API-key tenant (api-key/key) | `createTransactionForMerchant`, `createWebhookDelivery`, `getApiKeyByKey`, `getOrCreateSubscription`, `logApiRequest`, `updateApiKeyLastUsed` |
| POST /api/webhooks/whatsapp | provider (provider/provider-session) | `createJobEvent`, `getInvoiceRentRequestByWhatsappMessageId`, `getJobInvoiceByWhatsappMessageId`, `logTransactionEvent`, `updateInvoiceRentRequest`, `updateJobInvoice` |
| PUT /api/merchants/:id | tenant (merchant/path-merchant) | `updateMerchant` |
| PUT /api/merchants/:id/change-password | account (merchant/path-merchant) | `deactivatePushSubscriptionsForLogin`, `getUserById`, `settleAuthThrottle`, `takeAuthThrottleSlot`, `updateUserPassword` |
| PUT /api/merchants/:id/daily-goal | tenant (merchant/path-merchant) | `updateMerchant` |
| PUT /api/merchants/:id/details | tenant (merchant/path-merchant) | `updateMerchantDetails` |
| PUT /api/merchants/:id/theme | tenant (merchant/path-merchant) | `updateMerchantTheme` |
| PUT /api/merchants/:merchantId/stock-items/:itemId | tenant (merchant/path-merchant) | `getStockItemForMerchant`, `updateStockItemForMerchant` |
| PUT /api/merchants/:merchantId/tapt-stones/:stoneId | tenant (merchant/path-merchant) | `getTaptStoneForMerchant`, `updateTaptStoneForMerchant` |
| PUT /api/property/reminder-settings | tenant (merchant/session) | `updateMerchant` |
| PUT /api/property/schedules/:id | tenant (merchant/resource) | `getActiveScheduleForMerchant`, `updateActiveScheduleForMerchant` |
| PUT /api/property/tenants/:id | tenant (merchant/resource) | `getTenantProfileForMerchant`, `updateTenantProfileForMerchant` |
| PUT /api/push/preferences | tenant (merchant/session) | `updatePushNotificationPreferences` |
| PUT /api/subscription/plan | tenant (merchant/session) | `changeSubscriptionPlan`, `countSeatsInUse`, `getOrCreateSubscription` |
| PUT /api/team/:userId/status | tenant (merchant/resource) | `deactivatePushSubscriptionsForLogin`, `setTeamMemberStatus` |
| PUT /api/trades/clients/:id | tenant (merchant/resource) | `getClientProfileForMerchant`, `updateClientProfileForMerchant` |
| PUT /api/trades/gst-settings | tenant (merchant/session) | `updateMerchant` |
| PUT /api/trades/reminder-settings | tenant (merchant/session) | `updateMerchant` |
| PUT /api/trades/schedules/:id | tenant (merchant/resource) | `createJobEvent`, `getJobSchedule`, `updateJobSchedule` |

## Storage interface

| Interface | Method | Required merchantId argument | Signature |
|---|---|---|---|
| IStorage | getMerchant | no | `getMerchant(id: number): Promise<Merchant \| undefined>` |
| IStorage | getMerchantByName | no | `getMerchantByName(name: string): Promise<Merchant \| undefined>` |
| IStorage | getMerchantByEmail | no | `getMerchantByEmail(email: string): Promise<Merchant \| undefined>` |
| IStorage | getMerchantByToken | no | `getMerchantByToken(token: string): Promise<Merchant \| undefined>` |
| IStorage | getMerchantByResetToken | no | `getMerchantByResetToken(resetToken: string): Promise<Merchant \| undefined>` |
| IStorage | createMerchant | no | `createMerchant(merchant: InsertMerchant): Promise<Merchant>` |
| IStorage | createMerchantWithPassword | no | `createMerchantWithPassword(merchantData: any, passwordHash: string): Promise<Merchant>` |
| IStorage | createMerchantWithSignup | no | `createMerchantWithSignup(data: MerchantSignupStorageInput): Promise<Merchant>` |
| IStorage | verifyMerchant | no | `verifyMerchant(token: string, passwordHash: string): Promise<Merchant \| undefined>` |
| IStorage | confirmMerchantEmail | no | `confirmMerchantEmail(token: string, onboardingCompleted: boolean): Promise<Merchant \| undefined>` |
| IStorage | updateMerchantStatus | no | `updateMerchantStatus(id: number, status: string): Promise<Merchant \| undefined>` |
| IStorage | updateMerchantPasswordHash | no | `updateMerchantPasswordHash(id: number, passwordHash: string): Promise<Merchant \| undefined>` |
| IStorage | updateMerchant | no | `updateMerchant(id: number, updates: Partial<Merchant>): Promise<Merchant \| undefined>` |
| IStorage | updateMerchantDetails | no | `updateMerchantDetails(id: number, details: { businessName: string; contactEmail: string; contactPhone: string; businessAddress: string }): Promise<Merchant \| undefined>` |
| IStorage | updateMerchantBankAccount | no | `updateMerchantBankAccount(id: number, bankDetails: { bankName: string; bankAccountNumber: string; bankBranch: string; accountHolderName: string }): Promise<Merchant \| undefined>` |
| IStorage | updateMerchantTheme | no | `updateMerchantTheme(id: number, themeId: string): Promise<Merchant \| undefined>` |
| IStorage | updateMerchantLogoUrl | no | `updateMerchantLogoUrl(id: number, logoUrl: string \| null): Promise<Merchant \| undefined>` |
| IStorage | updateMerchantBillingCard | no | `updateMerchantBillingCard(id: number, card: { last4: string; brand: string; expiry: string } \| null): Promise<Merchant \| undefined>` |
| IStorage | getMerchantTutorialProgress | yes | `getMerchantTutorialProgress(merchantId: number, generation: number): Promise<MerchantTutorialProgress[]>` |
| IStorage | upsertMerchantTutorialProgress | yes | `upsertMerchantTutorialProgress(merchantId: number, generation: number, pageKey: string, status: string, lastStep: number): Promise<MerchantTutorialProgress>` |
| IStorage | restartMerchantTutorial | yes | `restartMerchantTutorial(merchantId: number): Promise<Merchant \| undefined>` |
| IStorage | getAllMerchants | no | `getAllMerchants(): Promise<Merchant[]>` |
| IStorage | deleteMerchant | no | `deleteMerchant(id: number): Promise<boolean>` |
| IStorage | getTransaction | no | `getTransaction(id: number): Promise<Transaction \| undefined>` |
| IStorage | getTransactionForMerchant | yes | `getTransactionForMerchant(id: number, merchantId: number): Promise<Transaction \| undefined>` |
| IStorage | cancelTransactionForMerchant | yes | `cancelTransactionForMerchant(id: number, merchantId: number): Promise<TransactionCancellationResult>` |
| IStorage | getTransactionByPaymentTokenHash | no | `getTransactionByPaymentTokenHash(paymentTokenHash: string): Promise<Transaction \| undefined>` |
| IStorage | getActiveTransactionByMerchant | yes | `getActiveTransactionByMerchant(merchantId: number, scope: ActiveTransactionScope): Promise<Transaction \| undefined>` |
| IStorage | getTransactionByNfcSession | no | `getTransactionByNfcSession(nfcSessionId: string): Promise<Transaction \| undefined>` |
| IStorage | createTransaction | no | `createTransaction(transaction: TransactionStorageInput): Promise<Transaction>` |
| IStorage | createTransactionForMerchant | yes | `createTransactionForMerchant(merchantId: number, transaction: TransactionStorageInput): Promise<Transaction>` |
| IStorage | updateTransactionStatusForMerchant | yes | `updateTransactionStatusForMerchant(id: number, merchantId: number, status: string, windcaveTransactionId?: string): Promise<Transaction \| undefined>` |
| IStorage | updateTransactionPaymentMethodForMerchant | yes | `updateTransactionPaymentMethodForMerchant(id: number, merchantId: number, paymentMethod: string): Promise<Transaction \| undefined>` |
| IStorage | updateTransactionStatus | no | `updateTransactionStatus(id: number, status: string, windcaveTransactionId?: string): Promise<Transaction \| undefined>` |
| IStorage | updateTransactionPaymentMethod | no | `updateTransactionPaymentMethod(id: number, paymentMethod: string): Promise<Transaction \| undefined>` |
| IStorage | updateTransactionSplitEnabled | no | `updateTransactionSplitEnabled(id: number, splitEnabled: boolean): Promise<Transaction \| undefined>` |
| IStorage | updateTransactionNfcSession | no | `updateTransactionNfcSession(id: number, nfcSessionId: string): Promise<Transaction \| undefined>` |
| IStorage | getTransactionsByMerchant | yes | `getTransactionsByMerchant(merchantId: number): Promise<Transaction[]>` |
| IStorage | createBillSplit | no | `createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction \| undefined>` |
| IStorage | createSplitPayment | no | `createSplitPayment(data: any): Promise<any>` |
| IStorage | getSplitPaymentsByTransaction | no | `getSplitPaymentsByTransaction(transactionId: number): Promise<any[]>` |
| IStorage | getSplitPaymentById | no | `getSplitPaymentById(id: number): Promise<any \| undefined>` |
| IStorage | updateSplitPaymentStatus | no | `updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any>` |
| IStorage | getNextPendingSplit | no | `getNextPendingSplit(transactionId: number): Promise<any \| undefined>` |
| IStorage | getSubscriptionRevenue | no | `getSubscriptionRevenue(): Promise<SubscriptionRevenue>` |
| IStorage | createRefund | no | `createRefund(data: InsertRefund): Promise<Refund>` |
| IStorage | getRefund | no | `getRefund(id: number): Promise<Refund \| undefined>` |
| IStorage | getRefundsForTransactionForMerchant | yes | `getRefundsForTransactionForMerchant(transactionId: number, merchantId: number): Promise<Refund[]>` |
| IStorage | getRefundsByMerchant | yes | `getRefundsByMerchant(merchantId: number): Promise<Refund[]>` |
| IStorage | createRefundForMerchant | yes | `createRefundForMerchant(transactionId: number, merchantId: number, data: MerchantRefundInput): Promise<Refund \| undefined>` |
| IStorage | updateRefundStatusForMerchant | yes | `updateRefundStatusForMerchant(id: number, merchantId: number, status: "failed" \| "completed", windcaveRefundId?: string): Promise<Refund \| undefined>` |
| IStorage | reserveRefundAmountForMerchant | yes | `reserveRefundAmountForMerchant(id: number, merchantId: number, refundAmount: number): Promise<Transaction \| null>` |
| IStorage | releaseRefundAmountForMerchant | yes | `releaseRefundAmountForMerchant(id: number, merchantId: number, refundAmount: number): Promise<boolean>` |
| IStorage | createTaptStone | no | `createTaptStone(data: InsertTaptStone): Promise<TaptStone>` |
| IStorage | createNextTaptStone | yes | `createNextTaptStone(merchantId: number, name?: string): Promise<TaptStone>` |
| IStorage | getTaptStone | no | `getTaptStone(id: number): Promise<TaptStone \| undefined>` |
| IStorage | getTaptStoneForMerchant | yes | `getTaptStoneForMerchant(id: number, merchantId: number): Promise<TaptStone \| undefined>` |
| IStorage | getTaptStonesByMerchant | yes | `getTaptStonesByMerchant(merchantId: number): Promise<TaptStone[]>` |
| IStorage | updateTaptStoneForMerchant | yes | `updateTaptStoneForMerchant(id: number, merchantId: number, data: Partial<{ name: string }>): Promise<TaptStone \| undefined>` |
| IStorage | updateTaptStoneUrlsForMerchant | yes | `updateTaptStoneUrlsForMerchant(id: number, merchantId: number, qrCodeUrl: string, paymentUrl: string): Promise<TaptStone \| undefined>` |
| IStorage | deleteTaptStoneForMerchant | yes | `deleteTaptStoneForMerchant(id: number, merchantId: number): Promise<boolean>` |
| IStorage | createStockItem | no | `createStockItem(data: InsertStockItem): Promise<StockItem>` |
| IStorage | getStockItemForMerchant | yes | `getStockItemForMerchant(id: number, merchantId: number): Promise<StockItem \| undefined>` |
| IStorage | getStockItemsByMerchant | yes | `getStockItemsByMerchant(merchantId: number): Promise<StockItem[]>` |
| IStorage | updateStockItemForMerchant | yes | `updateStockItemForMerchant(id: number, merchantId: number, data: StockItemChanges): Promise<StockItem \| undefined>` |
| IStorage | deleteStockItemForMerchant | yes | `deleteStockItemForMerchant(id: number, merchantId: number): Promise<boolean>` |
| IStorage | getMerchantAnalytics | yes | `getMerchantAnalytics(merchantId: number): Promise<{ totalTransactions: number; completedTransactions: number; totalRevenue: number; weeklyTransactions: number; weeklyRevenue: number; averageTransaction: number; }>` |
| IStorage | getTransactionsByMerchantWithDateRange | yes | `getTransactionsByMerchantWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<Transaction[]>` |
| IStorage | getMerchantAnalyticsWithDateRange | yes | `getMerchantAnalyticsWithDateRange(merchantId: number, startDate?: Date, endDate?: Date): Promise<{ totalTransactions: number; completedTransactions: number; totalRevenue: number; dateRange: { start: Date \| null; end: Date \| null }; averageTransactionValue: number; transactionsByStatus: { [key: string]: number }; }>` |
| IStorage | createApiKey | no | `createApiKey(data: any): Promise<any>` |
| IStorage | getApiKey | no | `getApiKey(id: number): Promise<any>` |
| IStorage | getApiKeyByKey | no | `getApiKeyByKey(apiKey: string): Promise<any>` |
| IStorage | getApiKeysByMerchant | yes | `getApiKeysByMerchant(merchantId: number): Promise<any[]>` |
| IStorage | updateApiKeyStatus | no | `updateApiKeyStatus(id: number, status: string): Promise<any>` |
| IStorage | revokeApiKey | no | `revokeApiKey(id: number): Promise<boolean>` |
| IStorage | updateApiKeyLastUsed | no | `updateApiKeyLastUsed(id: number): Promise<any>` |
| IStorage | logApiRequest | no | `logApiRequest(data: any): Promise<any>` |
| IStorage | getApiMetrics | no | `getApiMetrics(merchantId?: number): Promise<any>` |
| IStorage | getApiUsageData | no | `getApiUsageData(merchantId?: number): Promise<any[]>` |
| IStorage | getOrCreateSubscription | yes | `getOrCreateSubscription(merchantId: number): Promise<any>` |
| IStorage | getSubscription | yes | `getSubscription(merchantId: number): Promise<any \| undefined>` |
| IStorage | incrementTransactionCount | yes | `incrementTransactionCount(merchantId: number): Promise<void>` |
| IStorage | cancelSubscription | yes | `cancelSubscription(merchantId: number, reason: string): Promise<CancelSubscriptionResult>` |
| IStorage | resumeSubscription | yes | `resumeSubscription(merchantId: number): Promise<any>` |
| IStorage | getBillingHistory | yes | `getBillingHistory(merchantId: number, limit?: number): Promise<any[]>` |
| IStorage | changeSubscriptionPlan | yes | `changeSubscriptionPlan(merchantId: number, planId: PlanId, chargeUpgrade?: PlanUpgradeChargeExecutor): Promise<PlanChangeResult>` |
| IStorage | saveSubscriptionCard | yes | `saveSubscriptionCard(merchantId: number, card: SubscriptionCardInput): Promise<any>` |
| IStorage | bindSubscriptionCardSession | yes | `bindSubscriptionCardSession(merchantId: number, sessionId: string): Promise<boolean>` |
| IStorage | completeSubscriptionCardSetup | yes | `completeSubscriptionCardSetup( merchantId: number, sessionId: string, card: SubscriptionCardInput, charge: SubscriptionCardChargeExecutor, ): Promise<SubscriptionCardSetupResult>` |
| IStorage | removeSubscriptionCard | yes | `removeSubscriptionCard(merchantId: number): Promise<any>` |
| IStorage | claimSubscriptionsDueForBilling | no | `claimSubscriptionsDueForBilling( now: Date, limit?: number, excludeSubscriptionIds?: readonly number[], claimedAt?: Date, ): Promise<MerchantSubscription[]>` |
| IStorage | finalizeSubscriptionBillingClaim | no | `finalizeSubscriptionBillingClaim( subscriptionId: number, claimToken: string, updates: Record<string, unknown>, history: Record<string, unknown>, ): Promise<boolean>` |
| IStorage | releaseSubscriptionBillingClaim | no | `releaseSubscriptionBillingClaim(subscriptionId: number, claimToken: string): Promise<void>` |
| IStorage | expireCancelledSubscriptions | no | `expireCancelledSubscriptions(now: Date): Promise<number>` |
| IStorage | getTeamMembers | yes | `getTeamMembers(merchantId: number): Promise<User[]>` |
| IStorage | countSeatsInUse | yes | `countSeatsInUse(merchantId: number): Promise<number>` |
| IStorage | inviteTeamMember | yes | `inviteTeamMember(merchantId: number, input: InviteTeamMemberInput): Promise<InviteTeamMemberResult>` |
| IStorage | setTeamMemberStatus | yes | `setTeamMemberStatus(merchantId: number, userId: number, status: UserStatus): Promise<TeamMemberStatusResult>` |
| IStorage | rotateTeamInvite | yes | `rotateTeamInvite( merchantId: number, userId: number, input: Pick<InviteTeamMemberInput, "inviteTokenHash" \| "inviteExpiresAt" \| "name"> & { expectedTokenHash: string }, ): Promise<RotateTeamInviteResult>` |
| IStorage | revokeTeamInvite | yes | `revokeTeamInvite(merchantId: number, userId: number, expectedTokenHash?: string): Promise<boolean>` |
| IStorage | removeTeamMember | yes | `removeTeamMember(merchantId: number, userId: number): Promise<boolean>` |
| IStorage | getUserByEmail | no | `getUserByEmail(email: string): Promise<User \| undefined>` |
| IStorage | getUserById | no | `getUserById(id: number): Promise<User \| undefined>` |
| IStorage | getUserByInviteToken | no | `getUserByInviteToken(tokenHash: string): Promise<User \| undefined>` |
| IStorage | activateInvitedUser | no | `activateInvitedUser(userId: number, tokenHash: string, passwordHash: string, name?: string \| null, now?: Date): Promise<User \| null>` |
| IStorage | recordUserLogin | no | `recordUserLogin(userId: number, at: Date): Promise<void>` |
| IStorage | updateUserPassword | no | `updateUserPassword(userId: number, passwordHash: string): Promise<User \| null>` |
| IStorage | setUserResetToken | no | `setUserResetToken( userId: number, tokenHash: string \| null, expiry: Date \| null, ): Promise<void>` |
| IStorage | getUserByResetToken | no | `getUserByResetToken(tokenHash: string): Promise<User \| undefined>` |
| IStorage | resetUserPasswordByToken | no | `resetUserPasswordByToken(tokenHash: string, passwordHash: string, now: Date): Promise<User \| null>` |
| IStorage | createPushSubscription | no | `createPushSubscription(data: PushSubscriptionInput): Promise<PushSubscription \| null>` |
| IStorage | getPushSubscriptionsByMerchant | yes | `getPushSubscriptionsByMerchant(merchantId: number): Promise<PushSubscription[]>` |
| IStorage | getPushSubscriptionsForLogin | yes | `getPushSubscriptionsForLogin(merchantId: number, userId: number): Promise<PushSubscription[]>` |
| IStorage | getPushNotificationPreferences | yes | `getPushNotificationPreferences(merchantId: number, userId: number \| null): Promise<PushNotificationPreferences>` |
| IStorage | updatePushNotificationPreferences | yes | `updatePushNotificationPreferences( merchantId: number, userId: number \| null, preferences: PushNotificationPreferences, ): Promise<PushNotificationPreferences>` |
| IStorage | deactivatePushSubscription | no | `deactivatePushSubscription(id: number): Promise<void>` |
| IStorage | deactivatePushSubscriptionByEndpoint | no | `deactivatePushSubscriptionByEndpoint(endpoint: string): Promise<void>` |
| IStorage | deactivatePushSubscriptionsForLogin | yes | `deactivatePushSubscriptionsForLogin(merchantId: number, userId: number): Promise<void>` |
| IStorage | deactivateNativePushSubscriptionsForLogin | yes | `deactivateNativePushSubscriptionsForLogin(merchantId: number, userId: number): Promise<void>` |
| IStorage | getDailyPushPaymentSummaries | no | `getDailyPushPaymentSummaries(start: Date, end: Date): Promise<DailyPushPaymentSummary[]>` |
| IStorage | claimPushNotificationDelivery | yes | `claimPushNotificationDelivery( merchantId: number, eventType: PushNotificationEventType, eventKey: string, now?: Date, ): Promise<string \| null>` |
| IStorage | completePushNotificationDelivery | yes | `completePushNotificationDelivery( merchantId: number, eventType: PushNotificationEventType, eventKey: string, claimToken: string, status: PushNotificationDeliveryStatus, ): Promise<void>` |
| IStorage | createInfoPackLead | no | `createInfoPackLead(data: { name: string; email: string }): Promise<any>` |
| IStorage | createWebhookDelivery | no | `createWebhookDelivery(data: any): Promise<any>` |
| IStorage | updateWebhookDelivery | no | `updateWebhookDelivery(id: number, data: any): Promise<any>` |
| IStorage | getWebhookDeliveries | no | `getWebhookDeliveries(apiKeyId: number): Promise<any[]>` |
| IStorage | getRevenueOverTime | yes | `getRevenueOverTime(merchantId: number, days?: number): Promise<Array<{ date: string; revenue: number; transactions: number; }>>` |
| IStorage | updateTransactionWindcaveSession | no | `updateTransactionWindcaveSession(id: number, sessionId: string, sessionState: string, xId: string): Promise<Transaction \| undefined>` |
| IStorage | updateTransactionSessionState | no | `updateTransactionSessionState(id: number, sessionState: string): Promise<Transaction \| undefined>` |
| IStorage | getTransactionByWindcaveSessionId | no | `getTransactionByWindcaveSessionId(sessionId: string): Promise<Transaction \| undefined>` |
| IStorage | createBillSplit | no | `createBillSplit(transactionId: number, totalSplits: number): Promise<Transaction \| undefined>` |
| IStorage | createSplitPayment | no | `createSplitPayment(data: any): Promise<any>` |
| IStorage | getSplitPaymentsByTransaction | no | `getSplitPaymentsByTransaction(transactionId: number): Promise<any[]>` |
| IStorage | getSplitPaymentById | no | `getSplitPaymentById(id: number): Promise<any \| undefined>` |
| IStorage | updateSplitPaymentStatus | no | `updateSplitPaymentStatus(id: number, status: string, windcaveTransactionId?: string): Promise<any>` |
| IStorage | getNextPendingSplit | no | `getNextPendingSplit(transactionId: number): Promise<any \| undefined>` |
| IStorage | createTenantProfileForMerchant | yes | `createTenantProfileForMerchant(merchantId: number, data: TenantProfileChanges): Promise<any>` |
| IStorage | getTenantProfileForMerchant | yes | `getTenantProfileForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | updateTenantProfileForMerchant | yes | `updateTenantProfileForMerchant(id: string, merchantId: number, updates: TenantProfileChanges): Promise<any \| undefined>` |
| IStorage | archiveTenantProfileForMerchant | yes | `archiveTenantProfileForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | unarchiveTenantProfileForMerchant | yes | `unarchiveTenantProfileForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | getTransactionEventsByTenantForMerchant | yes | `getTransactionEventsByTenantForMerchant(tenantProfileId: string, merchantId: number, limit?: number): Promise<any[]>` |
| IStorage | getTenantProfile | no | `getTenantProfile(id: string): Promise<any \| undefined>` |
| IStorage | getTenantProfilesByMerchant | yes | `getTenantProfilesByMerchant(merchantId: number, opts?: { search?: string; includeArchived?: boolean }): Promise<any[]>` |
| IStorage | createActiveScheduleForMerchant | yes | `createActiveScheduleForMerchant(tenantProfileId: string, merchantId: number, data: ActiveScheduleInput): Promise<PropertyScheduleMutationResult>` |
| IStorage | getActiveScheduleForMerchant | yes | `getActiveScheduleForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | updateActiveScheduleForMerchant | yes | `updateActiveScheduleForMerchant(id: string, merchantId: number, updates: ActiveScheduleChanges): Promise<PropertyScheduleMutationResult>` |
| IStorage | terminateActiveScheduleForMerchant | yes | `terminateActiveScheduleForMerchant(id: string, merchantId: number): Promise<PropertyScheduleMutationResult>` |
| IStorage | getActiveSchedule | no | `getActiveSchedule(id: string): Promise<any \| undefined>` |
| IStorage | getActiveSchedulesByMerchant | yes | `getActiveSchedulesByMerchant(merchantId: number): Promise<any[]>` |
| IStorage | updateActiveSchedule | no | `updateActiveSchedule(id: string, updates: any): Promise<any \| undefined>` |
| IStorage | getDueActiveSchedules | no | `getDueActiveSchedules(now: Date): Promise<any[]>` |
| IStorage | getInvoiceRentRequestForMerchant | yes | `getInvoiceRentRequestForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | voidInvoiceRentRequestForMerchant | yes | `voidInvoiceRentRequestForMerchant(id: string, merchantId: number): Promise<PropertyInvoiceMutationResult>` |
| IStorage | markInvoiceRentRequestPaidExternalForMerchant | yes | `markInvoiceRentRequestPaidExternalForMerchant(id: string, merchantId: number, externalPaymentReference?: string): Promise<PropertyInvoiceMutationResult>` |
| IStorage | createOrReuseInvoiceRentRequestForMerchant | yes | `createOrReuseInvoiceRentRequestForMerchant(tenantProfileId: string, merchantId: number, data: PropertyInvoiceInput): Promise<PropertyInvoiceCreationResult>` |
| IStorage | getInvoiceRentRequestDeliveryForMerchant | yes | `getInvoiceRentRequestDeliveryForMerchant(id: string, merchantId: number): Promise<PropertyInvoiceDeliverySnapshot \| undefined>` |
| IStorage | recordInvoiceRentRequestDeliveryForMerchant | yes | `recordInvoiceRentRequestDeliveryForMerchant(id: string, merchantId: number, tenantProfileId: string, data: PropertyInvoiceDeliveryInput): Promise<PropertyInvoiceMutationResult>` |
| IStorage | createInvoiceRentRequest | no | `createInvoiceRentRequest(data: any): Promise<any>` |
| IStorage | getInvoiceRentRequest | no | `getInvoiceRentRequest(id: string): Promise<any \| undefined>` |
| IStorage | getInvoiceRentRequestByToken | no | `getInvoiceRentRequestByToken(token: string): Promise<any \| undefined>` |
| IStorage | getInvoiceRentRequestByWindcaveSessionId | no | `getInvoiceRentRequestByWindcaveSessionId(sessionId: string): Promise<any \| undefined>` |
| IStorage | getInvoiceRentRequestsByMerchant | yes | `getInvoiceRentRequestsByMerchant(merchantId: number, opts?: { status?: string; tenantProfileId?: string }): Promise<any[]>` |
| IStorage | updateInvoiceRentRequest | no | `updateInvoiceRentRequest(id: string, updates: any): Promise<any \| undefined>` |
| IStorage | atomicClaimSplitShare | no | `atomicClaimSplitShare(invoiceId: string, sessionId: string): Promise<any \| null>` |
| IStorage | recordInvoiceSplitSession | no | `recordInvoiceSplitSession(input: InvoiceSplitSessionInput): Promise<void>` |
| IStorage | getInvoiceSplitSession | no | `getInvoiceSplitSession(sessionId: string): Promise<InvoiceSplitSession \| undefined>` |
| IStorage | invoiceHasSplitSessions | no | `invoiceHasSplitSessions(invoice: InvoiceSplitRef): Promise<boolean>` |
| IStorage | markInvoiceSplitSessionPaid | no | `markInvoiceSplitSessionPaid(sessionId: string, paidAt: Date): Promise<void>` |
| IStorage | getPaidInvoiceSplitPayerEmails | no | `getPaidInvoiceSplitPayerEmails(invoice: InvoiceSplitRef): Promise<string[]>` |
| IStorage | getInvoiceRentRequestByWhatsappMessageId | no | `getInvoiceRentRequestByWhatsappMessageId(messageId: string): Promise<any \| undefined>` |
| IStorage | getPendingDispatchInvoices | no | `getPendingDispatchInvoices(): Promise<any[]>` |
| IStorage | getOverdueEligibleInvoices | no | `getOverdueEligibleInvoices(now: Date): Promise<any[]>` |
| IStorage | getReminderEligibleInvoices | no | `getReminderEligibleInvoices(): Promise<any[]>` |
| IStorage | logTransactionEvent | no | `logTransactionEvent(data: any): Promise<any>` |
| IStorage | getTransactionEventsByTenant | no | `getTransactionEventsByTenant(tenantProfileId: string, limit?: number): Promise<any[]>` |
| IStorage | getTransactionEventsByInvoice | no | `getTransactionEventsByInvoice(invoiceId: string): Promise<any[]>` |
| IStorage | createClientProfileForMerchant | yes | `createClientProfileForMerchant(merchantId: number, data: ClientProfileInput): Promise<any>` |
| IStorage | getClientProfileForMerchant | yes | `getClientProfileForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | updateClientProfileForMerchant | yes | `updateClientProfileForMerchant(id: string, merchantId: number, updates: ClientProfileChanges): Promise<any \| undefined>` |
| IStorage | archiveClientProfileForMerchant | yes | `archiveClientProfileForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | unarchiveClientProfileForMerchant | yes | `unarchiveClientProfileForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | promoteClientProfileForMerchant | yes | `promoteClientProfileForMerchant(id: string, merchantId: number): Promise<ClientProfilePromotionResult>` |
| IStorage | getJobEventsByClientForMerchant | yes | `getJobEventsByClientForMerchant(clientProfileId: string, merchantId: number, limit?: number): Promise<any[]>` |
| IStorage | getClientProfile | no | `getClientProfile(id: string): Promise<any \| undefined>` |
| IStorage | getClientProfilesByMerchant | yes | `getClientProfilesByMerchant(merchantId: number): Promise<any[]>` |
| IStorage | createQuote | no | `createQuote(data: any): Promise<any>` |
| IStorage | getQuote | no | `getQuote(id: string): Promise<any \| undefined>` |
| IStorage | getQuoteByToken | no | `getQuoteByToken(token: string): Promise<any \| undefined>` |
| IStorage | getQuotesByMerchant | yes | `getQuotesByMerchant(merchantId: number, opts?: { status?: string }): Promise<any[]>` |
| IStorage | getQuoteDeliveryForMerchant | yes | `getQuoteDeliveryForMerchant(id: string, merchantId: number): Promise<TradesQuoteDeliverySnapshot \| undefined>` |
| IStorage | updateQuote | no | `updateQuote(id: string, updates: any): Promise<any \| undefined>` |
| IStorage | getJobInvoiceForMerchant | yes | `getJobInvoiceForMerchant(id: string, merchantId: number): Promise<any \| undefined>` |
| IStorage | getJobInvoiceDeliveryForMerchant | yes | `getJobInvoiceDeliveryForMerchant(id: string, merchantId: number): Promise<TradesInvoiceDeliverySnapshot \| undefined>` |
| IStorage | voidJobInvoiceForMerchant | yes | `voidJobInvoiceForMerchant(id: string, merchantId: number): Promise<JobInvoiceMutationResult>` |
| IStorage | markJobInvoicePaidExternalForMerchant | yes | `markJobInvoicePaidExternalForMerchant(id: string, merchantId: number, externalPaymentReference?: string): Promise<JobInvoiceMutationResult>` |
| IStorage | completeJobInvoiceForMerchant | yes | `completeJobInvoiceForMerchant(id: string, merchantId: number): Promise<JobInvoiceMutationResult>` |
| IStorage | recordJobInvoiceReceiptForMerchant | yes | `recordJobInvoiceReceiptForMerchant(id: string, merchantId: number, clientProfileId: string, receipt: TradesReceiptRecord): Promise<boolean>` |
| IStorage | createJobInvoice | no | `createJobInvoice(data: any): Promise<any>` |
| IStorage | getJobInvoice | no | `getJobInvoice(id: string): Promise<any \| undefined>` |
| IStorage | getJobInvoiceByToken | no | `getJobInvoiceByToken(token: string): Promise<any \| undefined>` |
| IStorage | getJobInvoiceByWindcaveSessionId | no | `getJobInvoiceByWindcaveSessionId(sessionId: string): Promise<any \| undefined>` |
| IStorage | getJobInvoiceByWhatsappMessageId | no | `getJobInvoiceByWhatsappMessageId(messageId: string): Promise<any \| undefined>` |
| IStorage | getJobInvoicesByMerchant | yes | `getJobInvoicesByMerchant(merchantId: number, opts?: { status?: string; clientProfileId?: string }): Promise<any[]>` |
| IStorage | getJobInvoicesByQuote | no | `getJobInvoicesByQuote(quoteId: string): Promise<any[]>` |
| IStorage | updateJobInvoice | no | `updateJobInvoice(id: string, updates: any): Promise<any \| undefined>` |
| IStorage | getJobInvoiceByScheduleAndDue | no | `getJobInvoiceByScheduleAndDue(scheduleId: string, dueAt: Date): Promise<any \| undefined>` |
| IStorage | atomicClaimJobSplitShare | no | `atomicClaimJobSplitShare(invoiceId: string, sessionId: string): Promise<any \| null>` |
| IStorage | getPendingDispatchJobInvoices | no | `getPendingDispatchJobInvoices(): Promise<any[]>` |
| IStorage | getOverdueEligibleJobInvoices | no | `getOverdueEligibleJobInvoices(now: Date): Promise<any[]>` |
| IStorage | getReminderEligibleJobInvoices | no | `getReminderEligibleJobInvoices(): Promise<any[]>` |
| IStorage | createJobSchedule | no | `createJobSchedule(data: any): Promise<any>` |
| IStorage | getJobSchedule | no | `getJobSchedule(id: string): Promise<any \| undefined>` |
| IStorage | getJobSchedulesByMerchant | yes | `getJobSchedulesByMerchant(merchantId: number): Promise<any[]>` |
| IStorage | getDueJobSchedules | no | `getDueJobSchedules(now: Date): Promise<any[]>` |
| IStorage | updateJobSchedule | no | `updateJobSchedule(id: string, updates: any): Promise<any \| undefined>` |
| IStorage | terminateJobSchedule | no | `terminateJobSchedule(id: string): Promise<any \| undefined>` |
| IStorage | createJobEvent | no | `createJobEvent(data: any): Promise<any>` |
| IStorage | saveUploadedFile | yes | `saveUploadedFile(relPath: string, mimeType: string, data: Buffer, merchantId: number): Promise<void>` |
| IStorage | getUploadedFile | no | `getUploadedFile(relPath: string): Promise<{ mimeType: string; data: Buffer } \| undefined>` |
| IStorage | getUploadedFileForMerchant | yes | `getUploadedFileForMerchant(relPath: string, merchantId: number): Promise<{ mimeType: string; data: Buffer } \| undefined>` |
| IStorage | uploadedFileOwnedByMerchant | yes | `uploadedFileOwnedByMerchant(relPath: string, merchantId: number): Promise<boolean>` |
| IStorage | deleteUploadedFile | yes | `deleteUploadedFile(relPath: string, merchantId: number): Promise<void>` |
| IStorage | recordInvoiceDocumentAdminRead | no | `recordInvoiceDocumentAdminRead(adminUserId: number, documentName: string): Promise<void>` |
| IStorage | consumeInvoiceDocumentReadLimit | no | `consumeInvoiceDocumentReadLimit(token: string): Promise<boolean>` |
| IStorage | createAuthHandoffCode | no | `createAuthHandoffCode(input: { codeHash: string; userId: number; newUser: boolean; expiresAt: Date }): Promise<void>` |
| IStorage | consumeAuthHandoffCode | no | `consumeAuthHandoffCode(codeHash: string, now: Date): Promise<{ userId: number; newUser: boolean } \| undefined>` |
| IStorage | advanceUserSessionVersion | no | `advanceUserSessionVersion(userId: number): Promise<boolean>` |
| IStorage | takeAuthThrottleSlot | no | `takeAuthThrottleSlot(buckets: readonly AuthThrottleBucket[], now: Date): Promise<AuthThrottleTake>` |
| IStorage | settleAuthThrottle | no | `settleAuthThrottle(buckets: readonly AuthThrottleBucket[], outcome: AuthThrottleOutcome, now: Date): Promise<void>` |
| IStorage | forgetAuthThrottle | no | `forgetAuthThrottle(keys: readonly string[], keyPrefixes: readonly string[]): Promise<void>` |
| IStorage | createAuthSession | no | `createAuthSession(session: NewAuthSession, now: Date): Promise<void>` |
| IStorage | getAuthSession | no | `getAuthSession(id: string): Promise<AuthSession \| undefined>` |
| IStorage | offerAuthSessionSecret | no | `offerAuthSessionSecret( id: string, offer: { secretHash: string; now: Date; rotateBefore: Date; reofferBefore: Date }, ): Promise<boolean>` |
| IStorage | promoteAuthSessionSecret | no | `promoteAuthSessionSecret( id: string, promotion: { offeredSecretHash: string; now: Date; previousValidUntil: Date }, ): Promise<boolean>` |
| IStorage | touchAuthSession | no | `touchAuthSession(id: string, now: Date, idleExpiresAt: Date): Promise<void>` |
| IStorage | revokeAuthSession | no | `revokeAuthSession(id: string, reason: string, now: Date): Promise<boolean>` |
| IStorage | revokeAuthSessionsForLogin | no | `revokeAuthSessionsForLogin(userId: number, reason: string, now: Date, keepId?: string): Promise<number>` |
| PaymentAttemptRepository | getPaymentAttempt | no | `getPaymentAttempt(id: string): Promise<PaymentAttempt \| undefined>` |
| PaymentAttemptRepository | getPaymentAttemptByProcessorSessionId | no | `getPaymentAttemptByProcessorSessionId( processorSessionId: string, ): Promise<PaymentAttempt \| undefined>` |
| PaymentAttemptRepository | getPaymentAttemptByTransactionShareKey | no | `getPaymentAttemptByTransactionShareKey( transactionId: number, shareIndex: number, idempotencyKey: string, ): Promise<PaymentAttempt \| undefined>` |
| PaymentAttemptRepository | claimPaymentAttemptRecord | no | `claimPaymentAttemptRecord( input: ClaimPaymentAttemptRecordInput, ): Promise<ClaimPaymentAttemptResult>` |
| PaymentAttemptRepository | attachPaymentAttemptSessionRecord | no | `attachPaymentAttemptSessionRecord( input: AttachPaymentAttemptSessionRecordInput, ): Promise<AttachPaymentAttemptSessionResult>` |
| PaymentAttemptRepository | getPaymentAttemptByReturnStateHash | no | `getPaymentAttemptByReturnStateHash( returnStateHash: string, ): Promise<PaymentAttempt \| undefined>` |
| PaymentAttemptRepository | claimPaymentAttemptFinalizationRecord | no | `claimPaymentAttemptFinalizationRecord( input: ClaimPaymentAttemptFinalizationRecordInput, ): Promise<ClaimPaymentAttemptFinalizationResult>` |
| PaymentAttemptRepository | finalizePaymentAttemptRecord | no | `finalizePaymentAttemptRecord( input: FinalizePaymentAttemptRecordInput, ): Promise<FinalizePaymentAttemptResult>` |
