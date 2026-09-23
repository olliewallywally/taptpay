/**
 * R1-T2 — route policy inventory. GENERATED (bootstrap) by
 * scripts/generate-route-policy.ts from server/routes.ts @ fa0b0230b51f02bad5cf7114078350d3b697273a on 2026-09-23.
 *
 * 223 registrations (94 GET, 90 POST, 3 PATCH, 5 ALL, 22 PUT, 9 DELETE) on this SHA — evidence for THIS commit, not a timeless
 * constant; server/__tests__/route-policy-inventory.test.ts re-derives the
 * live count on every run rather than trusting this comment.
 *
 * What this file asserts: every registration in server/routes.ts has an
 * entry here (the completeness gate route-policy-inventory.test.ts enforces).
 * `principal` is a best-effort heuristic from text-marker matches and two
 * small curated allowlists (see server/route-inventory.ts), not a security
 * review — "merchant-user" does not yet distinguish owner/member/admin.
 *
 * 2026-09-12 extension (docs/evidence/remediation-v2-2/r1/ — seven analysis
 * passes read every then-"unclassified" route's handler body against
 * server/routes.ts) added four principals beyond the original four:
 *  - "admin": gated by the authenticateAdmin middleware (role==="admin" +
 *    merchantId===0 + exact config.admin.email match) — distinct from a
 *    merchant's own team-admin role, which stays "merchant-user".
 *  - "public": deliberately reachable with no session — an opaque-token
 *    bearer credential (payment links, checkout links, trades-quote magic
 *    links, password reset, email confirm, team invite), a public-safe DTO
 *    projection, or a handful of static/no-secret config endpoints on a
 *    curated path allowlist (PUBLIC_PATH_ALLOWLIST) where no reliable
 *    marker text exists at all.
 *  - "provider-webhook": a payment provider's server calls this directly
 *    (Windcave's notificationUrl, or a shared-secret header check) and the
 *    handler deliberately never trusts the inbound body.
 *  - "unauthenticated-suspect": a route this generator can positively
 *    identify as *looking* unauthenticated in at least one reachable branch
 *    when it should not be. This is an explicit, curated,
 *    SUSPECTED_GAP_ROUTES-keyed override that wins over every other
 *    signal — it is a deliberate loud flag, not a fix; see
 *    server/route-inventory.ts for the one route currently flagged and why.
 * "unclassified" remains the fallback for a route with no known gate, no
 * known public-design signal, and no allowlist entry — it still means "a
 * human needs to read this one," not "this is a hole."
 * capabilityGate/entitlementGate/idempotencyScope/storageMethods/successDto/
 * errorDisclosure are intentionally not populated yet — the plan's own R1-T2
 * text says do not rewrite 218 handlers' semantics in one commit; T3, T6 and
 * T7 enrich the routes they touch as they go, rather than this file
 * pretending to know things nobody has verified.
 *
 * Regenerate: npx tsx scripts/generate-route-policy.ts
 */

export interface RoutePolicyEntry {
  method: string;
  path: string;
  /** best-effort — see file header */
  principal:
    | "merchant-user"
    | "cron"
    | "api-key"
    | "admin"
    | "public"
    | "provider-webhook"
    | "unauthenticated-suspect"
    | "unclassified";
  /**
   * Literal marker strings found near this handler — see KNOWN_GATE_MARKERS /
   * KNOWN_PUBLIC_MARKERS / KNOWN_PROVIDER_WEBHOOK_MARKERS in
   * server/route-inventory.ts. A "public" or "provider-webhook" row with an
   * EMPTY markers array was classified via a curated path allowlist instead
   * of a text marker — see PUBLIC_PATH_ALLOWLIST / the notification
   * path-rule there for that route's specific justification.
   */
  markers: string[];
}

export const ROUTE_POLICY: Record<string, RoutePolicyEntry> = {
  "GET /robots.txt": {"method":"GET","path":"/robots.txt","principal":"public","markers":[]},
  "GET /nfc/:merchantId/stone/:stoneId": {"method":"GET","path":"/nfc/:merchantId/stone/:stoneId","principal":"public","markers":["generatePaymentUrl("]},
  "GET /nfc/:merchantId": {"method":"GET","path":"/nfc/:merchantId","principal":"public","markers":["generatePaymentUrl("]},
  "GET /.well-known/apple-developer-merchantid-domain-association": {"method":"GET","path":"/.well-known/apple-developer-merchantid-domain-association","principal":"public","markers":[]},
  "GET /sitemap.xml": {"method":"GET","path":"/sitemap.xml","principal":"admin","markers":["authenticateToken","checkMerchantOwnership","checkAccountOwnership","isAccountOwner","req.user?.role !== \"admin\"","req.user.role === 'admin'","authenticateAdmin"]},
  "GET /api/auth/google": {"method":"GET","path":"/api/auth/google","principal":"public","markers":[]},
  "GET /api/auth/google/callback": {"method":"GET","path":"/api/auth/google/callback","principal":"public","markers":[]},
  "POST /api/auth/google/session": {"method":"POST","path":"/api/auth/google/session","principal":"public","markers":[]},
  "POST /api/auth/sign-out-everywhere": {"method":"POST","path":"/api/auth/sign-out-everywhere","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/auth/login": {"method":"POST","path":"/api/auth/login","principal":"public","markers":[]},
  "POST /api/auth/forgot-password": {"method":"POST","path":"/api/auth/forgot-password","principal":"public","markers":["requestPasswordReset("]},
  "POST /api/auth/reset-password": {"method":"POST","path":"/api/auth/reset-password","principal":"public","markers":["resetPassword("]},
  "GET /api/auth/validate-reset-token/:token": {"method":"GET","path":"/api/auth/validate-reset-token/:token","principal":"public","markers":["validateResetToken("]},
  "GET /api/admin/request-origin": {"method":"GET","path":"/api/admin/request-origin","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/auth/login": {"method":"POST","path":"/api/admin/auth/login","principal":"public","markers":[]},
  "GET /api/auth/me": {"method":"GET","path":"/api/auth/me","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/tutorial/state": {"method":"GET","path":"/api/tutorial/state","principal":"merchant-user","markers":["authenticateToken","req.user?.role === \"admin\""]},
  "PATCH /api/tutorial/pages/:pageKey": {"method":"PATCH","path":"/api/tutorial/pages/:pageKey","principal":"merchant-user","markers":["authenticateToken","req.user?.role === \"admin\""]},
  "POST /api/tutorial/restart": {"method":"POST","path":"/api/tutorial/restart","principal":"merchant-user","markers":["authenticateToken","req.user?.role === \"admin\""]},
  "POST /api/merchants/:id/onboarding": {"method":"POST","path":"/api/merchants/:id/onboarding","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership"]},
  "GET /api/admin/auth/me": {"method":"GET","path":"/api/admin/auth/me","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/merchants/:id/qr": {"method":"GET","path":"/api/merchants/:id/qr","principal":"public","markers":["generatePaymentUrl("]},
  "GET /api/merchants/:id/stone/:stoneId/qr": {"method":"GET","path":"/api/merchants/:id/stone/:stoneId/qr","principal":"public","markers":[]},
  "GET /api/merchants/:id": {"method":"GET","path":"/api/merchants/:id","principal":"public","markers":["publicMerchantBrandDto(","generatePaymentUrl("]},
  "GET /api/merchants/:id/profile": {"method":"GET","path":"/api/merchants/:id/profile","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership","isAccountOwner","generatePaymentUrl("]},
  "GET /api/pay/t/:token": {"method":"GET","path":"/api/pay/t/:token","principal":"public","markers":["resolvePaymentToken("]},
  "GET /api/pay/t/:token/qr": {"method":"GET","path":"/api/pay/t/:token/qr","principal":"public","markers":["resolvePaymentToken("]},
  "POST /api/pay/t/:token/split": {"method":"POST","path":"/api/pay/t/:token/split","principal":"public","markers":["resolvePaymentToken(","loadTokenReceipt("]},
  "GET /api/pay/t/:token/receipt": {"method":"GET","path":"/api/pay/t/:token/receipt","principal":"public","markers":["loadTokenReceipt("]},
  "POST /api/pay/t/:token/receipt-pdf": {"method":"POST","path":"/api/pay/t/:token/receipt-pdf","principal":"public","markers":["loadTokenReceipt("]},
  "GET /api/pay/t/:token/receipt-qr": {"method":"GET","path":"/api/pay/t/:token/receipt-qr","principal":"public","markers":["loadTokenReceipt("]},
  "POST /api/pay/t/:token/session": {"method":"POST","path":"/api/pay/t/:token/session","principal":"public","markers":["resolvePaymentToken(","prepareTokenCompletion("]},
  "POST /api/pay/t/:token/hosted-fields-complete": {"method":"POST","path":"/api/pay/t/:token/hosted-fields-complete","principal":"public","markers":["prepareTokenCompletion("]},
  "POST /api/pay/t/:token/googlepay-complete": {"method":"POST","path":"/api/pay/t/:token/googlepay-complete","principal":"public","markers":["prepareTokenCompletion(","paymentAttempts.resolveReturnState("]},
  "GET /api/pay/return/:state": {"method":"GET","path":"/api/pay/return/:state","principal":"public","markers":["paymentAttempts.resolveReturnState("]},
  "ALL /api/pay/notification/:state": {"method":"ALL","path":"/api/pay/notification/:state","principal":"provider-webhook","markers":[]},
  "GET /api/merchants/:id/active-transaction": {"method":"GET","path":"/api/merchants/:id/active-transaction","principal":"public","markers":["publicTransactionDto(","generatePaymentUrl("]},
  "POST /api/transactions": {"method":"POST","path":"/api/transactions","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership","generatePaymentUrl("]},
  "POST /api/transactions/cash-sale": {"method":"POST","path":"/api/transactions/cash-sale","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/transactions/tap-to-pay": {"method":"POST","path":"/api/transactions/tap-to-pay","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/transactions/:id/split": {"method":"POST","path":"/api/transactions/:id/split","principal":"public","markers":["isTokenAddressedTransaction(","publicTransactionDto(","generatePaymentUrl("]},
  "PATCH /api/transactions/:id/split-enabled": {"method":"PATCH","path":"/api/transactions/:id/split-enabled","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/split-payments/:id": {"method":"GET","path":"/api/split-payments/:id","principal":"public","markers":["isTokenAddressedTransaction("]},
  "POST /api/transactions/:id/cancel": {"method":"POST","path":"/api/transactions/:id/cancel","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership","generatePaymentUrl("]},
  "POST /api/merchants/:merchantId/nfc-pay": {"method":"POST","path":"/api/merchants/:merchantId/nfc-pay","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/nfc/capabilities": {"method":"GET","path":"/api/nfc/capabilities","principal":"public","markers":[]},
  "POST /api/transactions/:id/pay": {"method":"POST","path":"/api/transactions/:id/pay","principal":"public","markers":["isTokenAddressedTransaction("]},
  "GET /api/windcave/env": {"method":"GET","path":"/api/windcave/env","principal":"public","markers":[]},
  "POST /api/transactions/:id/hosted-fields-complete": {"method":"POST","path":"/api/transactions/:id/hosted-fields-complete","principal":"public","markers":["isTokenAddressedTransaction("]},
  "POST /api/transactions/:id/googlepay-complete": {"method":"POST","path":"/api/transactions/:id/googlepay-complete","principal":"public","markers":["isTokenAddressedTransaction("]},
  "GET /api/transactions/:id": {"method":"GET","path":"/api/transactions/:id","principal":"public","markers":["isTokenAddressedTransaction(","publicTransactionDto("]},
  "POST /api/transactions/:id/receipt-pdf": {"method":"POST","path":"/api/transactions/:id/receipt-pdf","principal":"public","markers":["isTokenAddressedTransaction("]},
  "GET /api/transactions/:id/receipt-qr": {"method":"GET","path":"/api/transactions/:id/receipt-qr","principal":"public","markers":["isTokenAddressedTransaction("]},
  "GET /api/merchants/:id/analytics": {"method":"GET","path":"/api/merchants/:id/analytics","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/merchants/:id/revenue-over-time": {"method":"GET","path":"/api/merchants/:id/revenue-over-time","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/merchants/:id/analytics/export": {"method":"GET","path":"/api/merchants/:id/analytics/export","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/merchants/:id/export/csv": {"method":"GET","path":"/api/merchants/:id/export/csv","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/merchants/:id/export/pdf": {"method":"GET","path":"/api/merchants/:id/export/pdf","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/admin/merchants/:id/verify": {"method":"POST","path":"/api/admin/merchants/:id/verify","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/merchants/:id/set-active": {"method":"POST","path":"/api/admin/merchants/:id/set-active","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/merchants/:id/transactions": {"method":"GET","path":"/api/admin/merchants/:id/transactions","principal":"admin","markers":["authenticateAdmin"]},
  "PATCH /api/admin/merchants/:id/windcave-merchant-id": {"method":"PATCH","path":"/api/admin/merchants/:id/windcave-merchant-id","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/merchants/:id/activate": {"method":"POST","path":"/api/admin/merchants/:id/activate","principal":"admin","markers":["authenticateAdmin","storage.verifyMerchant("]},
  "PUT /api/merchants/:id/rates": {"method":"PUT","path":"/api/merchants/:id/rates","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/merchants/:id/details": {"method":"PUT","path":"/api/merchants/:id/details","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership"]},
  "PUT /api/merchants/:id/change-password": {"method":"PUT","path":"/api/merchants/:id/change-password","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "PUT /api/merchants/:id/bank-account": {"method":"PUT","path":"/api/merchants/:id/bank-account","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/merchants/:id/theme": {"method":"PUT","path":"/api/merchants/:id/theme","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership"]},
  "PUT /api/merchants/:id/daily-goal": {"method":"PUT","path":"/api/merchants/:id/daily-goal","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership"]},
  "PUT /api/merchants/:id": {"method":"PUT","path":"/api/merchants/:id","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership"]},
  "POST /api/merchants/:id/logo": {"method":"POST","path":"/api/merchants/:id/logo","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership"]},
  "DELETE /api/merchants/:id/logo": {"method":"DELETE","path":"/api/merchants/:id/logo","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership"]},
  "GET /api/merchants/:id/transactions": {"method":"GET","path":"/api/merchants/:id/transactions","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/merchants/:id/tapt-stones": {"method":"GET","path":"/api/merchants/:id/tapt-stones","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/merchants/:id/tapt-stones": {"method":"POST","path":"/api/merchants/:id/tapt-stones","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership","generatePaymentUrl("]},
  "PUT /api/merchants/:merchantId/tapt-stones/:stoneId": {"method":"PUT","path":"/api/merchants/:merchantId/tapt-stones/:stoneId","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "DELETE /api/merchants/:merchantId/tapt-stones/:stoneId": {"method":"DELETE","path":"/api/merchants/:merchantId/tapt-stones/:stoneId","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/tapt-stones/:id": {"method":"GET","path":"/api/tapt-stones/:id","principal":"public","markers":[]},
  "GET /api/admin/subscription-revenue": {"method":"GET","path":"/api/admin/subscription-revenue","principal":"admin","markers":["authenticateAdmin"]},
  "ALL /api/windcave/notification": {"method":"ALL","path":"/api/windcave/notification","principal":"provider-webhook","markers":[]},
  "GET /api/windcave/callback": {"method":"GET","path":"/api/windcave/callback","principal":"public","markers":["isTokenAddressedTransaction("]},
  "GET /api/windcave/status": {"method":"GET","path":"/api/windcave/status","principal":"public","markers":[]},
  "GET /api/admin/analytics": {"method":"GET","path":"/api/admin/analytics","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/revenue-over-time": {"method":"GET","path":"/api/admin/revenue-over-time","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/payment-method-breakdown": {"method":"GET","path":"/api/admin/payment-method-breakdown","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/ga4-detailed": {"method":"GET","path":"/api/admin/ga4-detailed","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/ga4-metrics": {"method":"GET","path":"/api/admin/ga4-metrics","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/merchants": {"method":"POST","path":"/api/admin/merchants","principal":"admin","markers":["authenticateAdmin"]},
  "PUT /api/admin/merchants/:id": {"method":"PUT","path":"/api/admin/merchants/:id","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/merchants/:id/test-payment-link": {"method":"POST","path":"/api/merchants/:id/test-payment-link","principal":"admin","markers":["authenticateAdmin","generatePaymentUrl("]},
  "GET /api/admin/merchants": {"method":"GET","path":"/api/admin/merchants","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/merchants/:id": {"method":"GET","path":"/api/admin/merchants/:id","principal":"admin","markers":["authenticateAdmin"]},
  "DELETE /api/admin/merchants/:id": {"method":"DELETE","path":"/api/admin/merchants/:id","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/clear-merchants": {"method":"POST","path":"/api/admin/clear-merchants","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/resend-verification": {"method":"POST","path":"/api/admin/resend-verification","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/test-email": {"method":"POST","path":"/api/admin/test-email","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/email-status": {"method":"GET","path":"/api/admin/email-status","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/merchants/verify": {"method":"POST","path":"/api/merchants/verify","principal":"public","markers":["storage.verifyMerchant("]},
  "GET /api/merchants/:id/email-status": {"method":"GET","path":"/api/merchants/:id/email-status","principal":"public","markers":[]},
  "GET /api/auth/confirm-email": {"method":"GET","path":"/api/auth/confirm-email","principal":"public","markers":["getMerchantByToken("]},
  "POST /api/auth/resend-confirmation": {"method":"POST","path":"/api/auth/resend-confirmation","principal":"public","markers":[]},
  "POST /api/info-pack-leads": {"method":"POST","path":"/api/info-pack-leads","principal":"public","markers":[]},
  "POST /api/merchants/signup": {"method":"POST","path":"/api/merchants/signup","principal":"public","markers":[]},
  "PUT /api/merchants/:id/business-details": {"method":"PUT","path":"/api/merchants/:id/business-details","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership"]},
  "POST /api/admin/merchants/signup": {"method":"POST","path":"/api/admin/merchants/signup","principal":"admin","markers":["authenticateAdmin","generatePaymentUrl("]},
  "GET /api/merchants/:id/events": {"method":"GET","path":"/api/merchants/:id/events","principal":"unauthenticated-suspect","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/push/capabilities": {"method":"GET","path":"/api/push/capabilities","principal":"public","markers":[]},
  "GET /api/push/vapid-key": {"method":"GET","path":"/api/push/vapid-key","principal":"public","markers":[]},
  "POST /api/push/subscribe": {"method":"POST","path":"/api/push/subscribe","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/push/unsubscribe": {"method":"POST","path":"/api/push/unsubscribe","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/push/native-subscribe": {"method":"POST","path":"/api/push/native-subscribe","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/push/native-unsubscribe": {"method":"POST","path":"/api/push/native-unsubscribe","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/push/status": {"method":"GET","path":"/api/push/status","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/push/preferences": {"method":"GET","path":"/api/push/preferences","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/push/preferences": {"method":"PUT","path":"/api/push/preferences","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/merchants/:id/clear-transactions": {"method":"POST","path":"/api/merchants/:id/clear-transactions","principal":"merchant-user","markers":["authenticateToken","checkAccountOwnership","req.user?.role === \"admin\""]},
  "POST /api/transactions/:transactionId/refunds": {"method":"POST","path":"/api/transactions/:transactionId/refunds","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "GET /api/transactions/:transactionId/refunds": {"method":"GET","path":"/api/transactions/:transactionId/refunds","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/merchants/:merchantId/refunds": {"method":"GET","path":"/api/merchants/:merchantId/refunds","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/refunds/:refundId": {"method":"GET","path":"/api/refunds/:refundId","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/admin/api-keys": {"method":"GET","path":"/api/admin/api-keys","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/api-keys": {"method":"POST","path":"/api/admin/api-keys","principal":"admin","markers":["authenticateAdmin"]},
  "POST /api/admin/api-keys/:keyId/revoke": {"method":"POST","path":"/api/admin/api-keys/:keyId/revoke","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/api-metrics": {"method":"GET","path":"/api/admin/api-metrics","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/admin/api-usage": {"method":"GET","path":"/api/admin/api-usage","principal":"admin","markers":["authenticateAdmin"]},
  "GET /api/merchants/:merchantId/stock-items": {"method":"GET","path":"/api/merchants/:merchantId/stock-items","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/merchants/:merchantId/stock-items": {"method":"POST","path":"/api/merchants/:merchantId/stock-items","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/merchants/:merchantId/stock-items/:itemId": {"method":"PUT","path":"/api/merchants/:merchantId/stock-items/:itemId","principal":"merchant-user","markers":["authenticateToken"]},
  "DELETE /api/merchants/:merchantId/stock-items/:itemId": {"method":"DELETE","path":"/api/merchants/:merchantId/stock-items/:itemId","principal":"api-key","markers":["authenticateToken","authenticateApiKey","requireEcommerceApi"]},
  "POST /api/v1/transactions": {"method":"POST","path":"/api/v1/transactions","principal":"api-key","markers":["authenticateApiKey","requireEcommerceApi","publicTransactionDto("]},
  "GET /api/v1/transactions/:id": {"method":"GET","path":"/api/v1/transactions/:id","principal":"api-key","markers":["authenticateApiKey","requireEcommerceApi"]},
  "POST /api/payments/apple-pay/validate": {"method":"POST","path":"/api/payments/apple-pay/validate","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/payments/apple-pay/process": {"method":"POST","path":"/api/payments/apple-pay/process","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/payments/google-pay/process": {"method":"POST","path":"/api/payments/google-pay/process","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/payments/digital-wallet/config": {"method":"GET","path":"/api/payments/digital-wallet/config","principal":"public","markers":[]},
  "GET /api/subscription": {"method":"GET","path":"/api/subscription","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "PUT /api/subscription/plan": {"method":"PUT","path":"/api/subscription/plan","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/subscription/cancel": {"method":"POST","path":"/api/subscription/cancel","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/subscription/resume": {"method":"POST","path":"/api/subscription/resume","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/team": {"method":"GET","path":"/api/team","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "POST /api/team/invite": {"method":"POST","path":"/api/team/invite","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "POST /api/team/:userId/resend": {"method":"POST","path":"/api/team/:userId/resend","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "DELETE /api/team/:userId/invite": {"method":"DELETE","path":"/api/team/:userId/invite","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "PUT /api/team/:userId/status": {"method":"PUT","path":"/api/team/:userId/status","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "DELETE /api/team/:userId": {"method":"DELETE","path":"/api/team/:userId","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "POST /api/team/accept-invite": {"method":"POST","path":"/api/team/accept-invite","principal":"public","markers":["getUserByInviteToken("]},
  "GET /api/subscription/billing-history": {"method":"GET","path":"/api/subscription/billing-history","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "GET /api/billing/card": {"method":"GET","path":"/api/billing/card","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "POST /api/billing/card/session": {"method":"POST","path":"/api/billing/card/session","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "POST /api/billing/card/confirm": {"method":"POST","path":"/api/billing/card/confirm","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "ALL /api/billing/card/notification": {"method":"ALL","path":"/api/billing/card/notification","principal":"provider-webhook","markers":["billingCardCallback"]},
  "GET /api/billing/card/callback": {"method":"GET","path":"/api/billing/card/callback","principal":"public","markers":["billingCardCallback"]},
  "POST /api/billing/card/callback": {"method":"POST","path":"/api/billing/card/callback","principal":"public","markers":["billingCardCallback"]},
  "DELETE /api/billing/card": {"method":"DELETE","path":"/api/billing/card","principal":"merchant-user","markers":["authenticateToken","isAccountOwner"]},
  "POST /api/board-builder/submit": {"method":"POST","path":"/api/board-builder/submit","principal":"public","markers":[]},
  "GET /uploads/:folder/:name": {"method":"GET","path":"/uploads/:folder/:name","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "GET /api/property/tenants": {"method":"GET","path":"/api/property/tenants","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/property/tenants": {"method":"POST","path":"/api/property/tenants","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/property/tenants/:id": {"method":"GET","path":"/api/property/tenants/:id","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "PUT /api/property/tenants/:id": {"method":"PUT","path":"/api/property/tenants/:id","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/property/tenants/:id/archive": {"method":"POST","path":"/api/property/tenants/:id/archive","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/property/tenants/:id/unarchive": {"method":"POST","path":"/api/property/tenants/:id/unarchive","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/property/tenants/:id/events": {"method":"GET","path":"/api/property/tenants/:id/events","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/property/schedules": {"method":"GET","path":"/api/property/schedules","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/property/tenants/:tenantId/schedules": {"method":"GET","path":"/api/property/tenants/:tenantId/schedules","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/property/tenants/:tenantId/schedules": {"method":"POST","path":"/api/property/tenants/:tenantId/schedules","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "PUT /api/property/schedules/:id": {"method":"PUT","path":"/api/property/schedules/:id","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "DELETE /api/property/schedules/:id": {"method":"DELETE","path":"/api/property/schedules/:id","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/property/invoices": {"method":"GET","path":"/api/property/invoices","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/property/invoices/document": {"method":"POST","path":"/api/property/invoices/document","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/invoice-documents/:name": {"method":"GET","path":"/api/invoice-documents/:name","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/property/invoices": {"method":"POST","path":"/api/property/invoices","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/property/invoices/:id/resend": {"method":"POST","path":"/api/property/invoices/:id/resend","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/property/invoices/:id": {"method":"GET","path":"/api/property/invoices/:id","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/property/invoices/:id/void": {"method":"POST","path":"/api/property/invoices/:id/void","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "POST /api/property/invoices/:id/mark-paid-external": {"method":"POST","path":"/api/property/invoices/:id/mark-paid-external","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/checkout/resolve/:token": {"method":"GET","path":"/api/checkout/resolve/:token","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "GET /api/checkout/document/:token": {"method":"GET","path":"/api/checkout/document/:token","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "POST /api/checkout/:token/split": {"method":"POST","path":"/api/checkout/:token/split","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "POST /api/checkout/pay": {"method":"POST","path":"/api/checkout/pay","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "POST /api/checkout/:token/session": {"method":"POST","path":"/api/checkout/:token/session","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "POST /api/checkout/:token/hosted-fields-complete": {"method":"POST","path":"/api/checkout/:token/hosted-fields-complete","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "POST /api/checkout/:token/googlepay-complete": {"method":"POST","path":"/api/checkout/:token/googlepay-complete","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "GET /api/checkout/callback": {"method":"GET","path":"/api/checkout/callback","principal":"public","markers":["getCheckoutInvoiceByToken("]},
  "ALL /api/windcave/rent-notification": {"method":"ALL","path":"/api/windcave/rent-notification","principal":"provider-webhook","markers":[]},
  "ALL /api/windcave/trades-notification": {"method":"ALL","path":"/api/windcave/trades-notification","principal":"provider-webhook","markers":[]},
  "POST /api/webhooks/whatsapp": {"method":"POST","path":"/api/webhooks/whatsapp","principal":"provider-webhook","markers":["req.headers[\"apikey\"]"]},
  "PUT /api/merchants/:merchantId/sector": {"method":"PUT","path":"/api/merchants/:merchantId/sector","principal":"merchant-user","markers":["authenticateToken","checkMerchantOwnership"]},
  "GET /api/property/reminder-settings": {"method":"GET","path":"/api/property/reminder-settings","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/property/reminder-settings": {"method":"PUT","path":"/api/property/reminder-settings","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/reminder-settings": {"method":"GET","path":"/api/trades/reminder-settings","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/trades/reminder-settings": {"method":"PUT","path":"/api/trades/reminder-settings","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/gst-settings": {"method":"GET","path":"/api/trades/gst-settings","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/trades/gst-settings": {"method":"PUT","path":"/api/trades/gst-settings","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/clients": {"method":"GET","path":"/api/trades/clients","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/clients": {"method":"POST","path":"/api/trades/clients","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/clients/:id": {"method":"GET","path":"/api/trades/clients/:id","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/trades/clients/:id": {"method":"PUT","path":"/api/trades/clients/:id","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/clients/:id/archive": {"method":"POST","path":"/api/trades/clients/:id/archive","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/clients/:id/unarchive": {"method":"POST","path":"/api/trades/clients/:id/unarchive","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/clients/:id/promote": {"method":"POST","path":"/api/trades/clients/:id/promote","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/clients/:id/events": {"method":"GET","path":"/api/trades/clients/:id/events","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/quotes": {"method":"GET","path":"/api/trades/quotes","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/quotes": {"method":"POST","path":"/api/trades/quotes","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/quotes/:id": {"method":"GET","path":"/api/trades/quotes/:id","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/quotes/:id/pdf": {"method":"GET","path":"/api/trades/quotes/:id/pdf","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/quotes/token/:token/pdf": {"method":"GET","path":"/api/trades/quotes/token/:token/pdf","principal":"public","markers":["getQuoteByToken("]},
  "POST /api/trades/quotes/:id/resend": {"method":"POST","path":"/api/trades/quotes/:id/resend","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/quotes/token/:token": {"method":"GET","path":"/api/trades/quotes/token/:token","principal":"public","markers":["getQuoteByToken("]},
  "POST /api/trades/quotes/token/:token/respond": {"method":"POST","path":"/api/trades/quotes/token/:token/respond","principal":"public","markers":["getQuoteByToken("]},
  "GET /api/trades/invoices": {"method":"GET","path":"/api/trades/invoices","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/invoices": {"method":"POST","path":"/api/trades/invoices","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/invoices/:id/resend": {"method":"POST","path":"/api/trades/invoices/:id/resend","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/invoices/:id/send-balance": {"method":"POST","path":"/api/trades/invoices/:id/send-balance","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/invoices/:id/mark-paid-external": {"method":"POST","path":"/api/trades/invoices/:id/mark-paid-external","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/invoices/:id/complete": {"method":"POST","path":"/api/trades/invoices/:id/complete","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/invoices/:id/void": {"method":"POST","path":"/api/trades/invoices/:id/void","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/trades/schedules": {"method":"GET","path":"/api/trades/schedules","principal":"merchant-user","markers":["authenticateToken"]},
  "POST /api/trades/schedules": {"method":"POST","path":"/api/trades/schedules","principal":"merchant-user","markers":["authenticateToken"]},
  "PUT /api/trades/schedules/:id": {"method":"PUT","path":"/api/trades/schedules/:id","principal":"merchant-user","markers":["authenticateToken"]},
  "DELETE /api/trades/schedules/:id": {"method":"DELETE","path":"/api/trades/schedules/:id","principal":"merchant-user","markers":["authenticateToken"]},
  "GET /api/internal/cron/status": {"method":"GET","path":"/api/internal/cron/status","principal":"cron","markers":["authorizeCronRequest"]},
  "POST /api/internal/cron": {"method":"POST","path":"/api/internal/cron","principal":"cron","markers":["authorizeCronRequest"]},
};
