import fs from "node:fs";
import { currentRouteFacts } from "../route-facts";
import { ROUTE_REVIEW } from "../route-review";
import { storageContract, TENANT_INVENTORY_FILE, renderTenantInventory, tenantStorageInventory } from "../../scripts/generate-tenant-storage-inventory";

test("tenant inventory covers every registration, including direct authentication middleware", () => {
  const { routes } = tenantStorageInventory();
  const facts = currentRouteFacts();
  expect(routes.map((r) => r.key).sort()).toEqual([...facts.keys()].sort());
  for (const [key, fact] of facts) {
    if (fact.middleware.includes("authenticateToken") || fact.middleware.includes("authenticateAdmin")) {
      expect(routes.find((row) => row.key === key)?.authenticated).toBe(true);
    }
  }
});

test("the checked-in tenant/storage inventory matches the current source and reviewed scopes", () => {
  const recorded = fs.readFileSync(TENANT_INVENTORY_FILE, "utf8");
  const sha = /base `([0-9a-f]{40})`/.exec(recorded)?.[1];
  expect(sha).toBeDefined();
  expect(recorded).toBe(renderTenantInventory(sha!));
});

test("stock and board management has no unscoped mutation escape hatch", () => {
  const contract = storageContract();
  // The stock create that took its business inside the data went with S5b.
  const retired = ["createStockItem", "getStockItem", "updateStockItem", "deleteStockItem", "updateTaptStone", "updateTaptStoneUrls", "deleteTaptStone"];
  expect(contract.filter((m) => retired.includes(m.name))).toEqual([]);
  for (const name of ["createStockItem", "getStockItem", "updateStockItem", "deleteStockItem", "getTaptStone", "updateTaptStone", "updateTaptStoneUrls", "deleteTaptStone"]) {
    expect(contract.find((m) => m.name === `${name}ForMerchant`)?.requiredTenant).toBe(true);
  }
  for (const [key, facts] of currentRouteFacts()) {
    if (/^\w+ \/api\/merchants\/.*\/(?:stock-items|tapt-stones)/.test(key)) {
      expect(facts.storageMethods.filter((m) => [...retired, "getTaptStone"].includes(m))).toEqual([]);
    }
  }
});

test("S2a merchant transaction/refund reads and cancellation require tenant scope", () => {
  const contract = storageContract();
  expect(contract.find((method) => method.name === "getRefundsByTransaction")).toBeUndefined();
  for (const name of ["getTransactionForMerchant", "getRefundsForTransactionForMerchant", "cancelTransactionForMerchant"]) {
    expect(contract.find((method) => method.name === name)?.requiredTenant).toBe(true);
  }
  const facts = currentRouteFacts();
  for (const key of ["POST /api/transactions/:transactionId/refunds", "GET /api/transactions/:transactionId/refunds", "GET /api/v1/transactions/:id"]) {
    expect(facts.get(key)?.storageMethods).toContain("getTransactionForMerchant");
    expect(facts.get(key)?.storageMethods).not.toContain("getTransaction");
  }
  expect(facts.get("GET /api/transactions/:transactionId/refunds")?.storageMethods).toContain("getRefundsForTransactionForMerchant");
  const cancel = facts.get("POST /api/transactions/:id/cancel")!.storageMethods;
  expect(cancel).toContain("cancelTransactionForMerchant");
  expect(cancel).not.toContain("updateTransactionStatus");
  // Its explicit validated-admin branch may resolve a target by global id; HTTP tests hold
  // merchant callers to the scoped branch and prevent falling back to that admin authority.
});

test("authenticated refunds use scoped writes and no retired global mutator", () => {
  const contract = storageContract();
  for (const name of ["reserveRefundAmount", "releaseRefundAmount", "updateRefundStatus", "updateTransactionAfterRefund"]) {
    expect(contract.find(method => method.name === name)).toBeUndefined();
  }
  const methods = currentRouteFacts().get("POST /api/transactions/:transactionId/refunds")!.storageMethods;
  expect(methods).not.toContain("createRefund");
  for (const name of ["reserveRefundAmountForMerchant", "releaseRefundAmountForMerchant", "createRefundForMerchant", "updateRefundStatusForMerchant"]) {
    expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
    expect(methods).toContain(name);
  }
});

test("authenticated sale creation and disabled native writes have explicit tenant scope", () => {
  expect(storageContract().find(method => method.name === "associateTransactionWithStone")).toBeUndefined();
  const facts = currentRouteFacts();
  for (const key of ["POST /api/transactions", "POST /api/transactions/cash-sale", "POST /api/v1/transactions", "POST /api/transactions/tap-to-pay"]) {
    expect(facts.get(key)?.storageMethods).toContain("createTransactionForMerchant");
    expect(facts.get(key)?.storageMethods).not.toContain("createTransaction");
  }
  const native = facts.get("POST /api/transactions/tap-to-pay")!.storageMethods;
  expect(native).toContain("getTransactionForMerchant");
  expect(native).not.toContain("getTransaction");
  expect(native).toContain("updateTransactionStatusForMerchant");
  expect(native).toContain("updateTransactionPaymentMethodForMerchant");
});

test("property profile operations and history have explicit merchant contracts", () => {
  const contract = storageContract();
  const facts = currentRouteFacts();
  for (const name of ["createTenantProfile", "updateTenantProfile", "archiveTenantProfile", "unarchiveTenantProfile"]) {
    expect(contract.find(method => method.name === name)).toBeUndefined();
  }
  const registrations = [
    ["POST /api/property/tenants", "createTenantProfileForMerchant"],
    ["GET /api/property/tenants/:id", "getTenantProfileForMerchant"],
    ["PUT /api/property/tenants/:id", "updateTenantProfileForMerchant"],
    ["POST /api/property/tenants/:id/archive", "archiveTenantProfileForMerchant"],
    ["POST /api/property/tenants/:id/unarchive", "unarchiveTenantProfileForMerchant"],
    ["GET /api/property/tenants/:id/events", "getTransactionEventsByTenantForMerchant"],
  ];
  for (const [key, name] of registrations) {
    expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
    expect(facts.get(key)?.storageMethods).toContain(name);
    expect(facts.get(key)?.storageMethods).not.toContain("getTenantProfile");
  }
});

test("property schedule management uses explicit scope and retains only separate public and cron lanes", () => {
  const contract = storageContract();
  for (const name of ["createActiveSchedule", "terminateActiveSchedule", "getActiveSchedulesByTenant"]) {
    expect(contract.find(method => method.name === name)).toBeUndefined();
  }
  for (const [key, name] of [
    ["POST /api/property/tenants/:tenantId/schedules", "createActiveScheduleForMerchant"],
    ["PUT /api/property/schedules/:id", "updateActiveScheduleForMerchant"],
    ["DELETE /api/property/schedules/:id", "terminateActiveScheduleForMerchant"],
  ]) {
    expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
    const methods = currentRouteFacts().get(key)!.storageMethods;
    expect(methods).toContain(name);
    expect(methods).not.toContain("getActiveSchedule");
    expect(methods).not.toContain("updateActiveSchedule");
    expect(methods).not.toContain("getTenantProfile");
  }
});

test("property invoice void and external-payment writes require explicit merchant scope", () => {
  const contract = storageContract();
  for (const [key, name] of [
    ["POST /api/property/invoices/:id/void", "voidInvoiceRentRequestForMerchant"],
    ["POST /api/property/invoices/:id/mark-paid-external", "markInvoiceRentRequestPaidExternalForMerchant"],
  ]) {
    expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
    const methods = currentRouteFacts().get(key)!.storageMethods;
    expect(methods).toContain(name);
    expect(methods).toContain("getInvoiceRentRequestForMerchant");
    expect(methods).not.toContain("getInvoiceRentRequest");
    expect(methods).not.toContain("updateInvoiceRentRequest");
    expect(methods).not.toContain("logTransactionEvent");
  }
  const list = currentRouteFacts().get("GET /api/property/invoices")!.storageMethods;
  expect(list).toContain("getTenantProfileForMerchant");
  expect(list).not.toContain("getTenantProfile");
});

test("property creation/resend have no global invoice management escape hatch", () => {
  const contract = storageContract();
  expect(contract.find(method => method.name === "getLiveInvoiceByTenant")).toBeUndefined();
  for (const name of ["createOrReuseInvoiceRentRequestForMerchant", "getInvoiceRentRequestDeliveryForMerchant", "recordInvoiceRentRequestDeliveryForMerchant"]) {
    expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
  }
  const facts = currentRouteFacts();
  for (const key of ["POST /api/property/invoices", "POST /api/property/invoices/:id/resend"]) {
    const methods = facts.get(key)!.storageMethods;
    expect(methods).toContain("getInvoiceRentRequestForMerchant");
    for (const name of ["getInvoiceRentRequest", "createInvoiceRentRequest", "updateInvoiceRentRequest", "getTenantProfile", "logTransactionEvent"]) expect(methods).not.toContain(name);
  }
  expect(facts.get("POST /api/property/invoices")!.storageMethods).toContain("createOrReuseInvoiceRentRequestForMerchant");
});

test("trades client management and hidden-prospect creation require merchant scope", () => {
  const contract = storageContract();
  for (const name of ["createClientProfile", "updateClientProfile", "archiveClientProfile", "unarchiveClientProfile", "getJobEventsByClient"]) {
    expect(contract.find(method => method.name === name)).toBeUndefined();
  }
  const facts = currentRouteFacts();
  for (const [key, name] of [
    ["POST /api/trades/clients", "createClientProfileForMerchant"],
    ["GET /api/trades/clients/:id", "getClientProfileForMerchant"],
    ["PUT /api/trades/clients/:id", "updateClientProfileForMerchant"],
    ["POST /api/trades/clients/:id/archive", "archiveClientProfileForMerchant"],
    ["POST /api/trades/clients/:id/unarchive", "unarchiveClientProfileForMerchant"],
    ["POST /api/trades/clients/:id/promote", "promoteClientProfileForMerchant"],
    ["GET /api/trades/clients/:id/events", "getJobEventsByClientForMerchant"],
  ]) {
    expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
    expect(facts.get(key)?.storageMethods).toContain(name); expect(facts.get(key)?.storageMethods).not.toContain("getClientProfile");
  }
  // Since S4b2 the hidden prospect is made inside the scoped quote/invoice create, not by the route.
  for (const [key, name] of [["POST /api/trades/quotes", "createQuoteForMerchant"], ["POST /api/trades/invoices", "createJobInvoiceForMerchant"]]) {
    expect(facts.get(key)?.storageMethods).toContain(name);
    expect(facts.get(key)?.storageMethods).not.toContain("createClientProfile");
    expect(facts.get(key)?.storageMethods).not.toContain("createClientProfileForMerchant");
  }
});

test("trades invoice state changes, the signed-in quote PDF and the receipt require merchant scope", () => {
  const contract = storageContract();
  const facts = currentRouteFacts();
  for (const [key, names] of [
    ["GET /api/trades/quotes/:id/pdf", ["getQuoteDeliveryForMerchant"]],
    ["POST /api/trades/invoices/:id/void", ["getJobInvoiceForMerchant", "voidJobInvoiceForMerchant"]],
    ["POST /api/trades/invoices/:id/mark-paid-external", ["getJobInvoiceForMerchant", "markJobInvoicePaidExternalForMerchant"]],
    ["POST /api/trades/invoices/:id/complete", ["getJobInvoiceForMerchant", "completeJobInvoiceForMerchant"]],
  ] as const) {
    for (const name of names) {
      expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
      expect(facts.get(key)?.storageMethods).toContain(name);
    }
    for (const name of ["getJobInvoice", "updateJobInvoice", "getQuote", "getClientProfile", "createJobEvent"]) {
      expect(facts.get(key)?.storageMethods).not.toContain(name);
    }
  }
  for (const name of ["getJobInvoiceDeliveryForMerchant", "recordJobInvoiceReceiptForMerchant"]) {
    expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
  }
  expect(facts.get("POST /api/trades/invoices/:id/mark-paid-external")?.sideEffects).toEqual(["email: sendTradePaymentInvoiceForMerchant"]);
});

test("trades quote, invoice and balance creation and their delivery require merchant scope", () => {
  const contract = storageContract();
  expect(contract.find(method => method.name === "createQuote")).toBeUndefined();
  const facts = currentRouteFacts();
  for (const [key, names, effect] of [
    ["POST /api/trades/quotes", ["getClientProfileForMerchant", "createQuoteForMerchant", "recordQuoteDeliveryForMerchant", "getQuoteDeliveryForMerchant"], "email/SMS: sendTradeQuoteForMerchant"],
    ["POST /api/trades/invoices", ["getClientProfileForMerchant", "getQuoteDeliveryForMerchant", "createJobInvoiceForMerchant", "getJobInvoiceForMerchant"], "email/SMS: resendTradeInvoiceForMerchant"],
    ["POST /api/trades/invoices/:id/send-balance", ["getJobInvoiceForMerchant", "createJobBalanceInvoiceForMerchant"], "email/SMS: resendTradeInvoiceForMerchant"],
  ] as const) {
    for (const name of names) {
      expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
      expect(facts.get(key)?.storageMethods).toContain(name);
    }
    for (const name of ["getClientProfile", "getQuote", "getJobInvoice", "createJobInvoice", "updateJobInvoice", "createJobEvent", "getJobInvoicesByMerchant"]) {
      expect(facts.get(key)?.storageMethods).not.toContain(name);
    }
    expect(facts.get(key)?.sideEffects).toEqual([effect]);
  }
  expect(contract.find(method => method.name === "recordJobInvoiceDeliveryForMerchant")?.requiredTenant).toBe(true);
});

test("trades recurring-invoice management requires merchant scope; the cron keeps its own writes", () => {
  const contract = storageContract();
  for (const name of ["createJobSchedule", "getJobSchedule"]) expect(contract.find(method => method.name === name)).toBeUndefined();
  for (const name of ["getDueJobSchedules", "updateJobSchedule", "terminateJobSchedule"]) expect(contract.find(method => method.name === name)).toBeDefined();
  const facts = currentRouteFacts();
  for (const [key, names] of [
    ["GET /api/trades/schedules", ["getJobSchedulesByMerchant"]],
    ["POST /api/trades/schedules", ["getClientProfileForMerchant", "createJobScheduleForMerchant"]],
    ["PUT /api/trades/schedules/:id", ["getJobScheduleForMerchant", "updateJobScheduleForMerchant"]],
    ["DELETE /api/trades/schedules/:id", ["getJobScheduleForMerchant", "terminateJobScheduleForMerchant"]],
  ] as const) {
    for (const name of names) {
      expect(contract.find(method => method.name === name)?.requiredTenant).toBe(true);
      expect(facts.get(key)?.storageMethods).toContain(name);
    }
    for (const name of ["getClientProfile", "updateJobSchedule", "terminateJobSchedule", "createJobEvent"]) expect(facts.get(key)?.storageMethods).not.toContain(name);
  }
});

test("no signed-in trades route reads or writes a trades record through a global key", () => {
  // The public quote, checkout, provider, WhatsApp and cron lanes keep these; a signed-in route must not.
  const GLOBAL = ["getClientProfile", "getQuote", "getQuoteByToken", "updateQuote", "getJobInvoice", "createJobInvoice", "updateJobInvoice",
    "getJobInvoicesByQuote", "updateJobSchedule", "terminateJobSchedule", "getDueJobSchedules", "createJobEvent"];
  const facts = currentRouteFacts();
  const signedIn = [...facts.entries()].filter(([key, fact]) => key.includes(" /api/trades/") && fact.middleware.includes("authenticateToken"));
  expect(signedIn.length).toBe(25);
  for (const [key, fact] of signedIn) for (const name of GLOBAL) expect([key, fact.storageMethods.includes(name)]).toEqual([key, false]);
});

test("a signed-in business's settings are written by purpose; the general update is not theirs", () => {
  const contract = storageContract();
  // The row's own methods are keyed by the business itself, and say so.
  for (const name of ["getMerchant", "updateMerchantSettings", "updateMerchantDetails", "updateMerchantTheme", "updateMerchantLogoUrl"]) {
    expect([name, contract.find(method => method.name === name)?.requiredTenant]).toEqual([name, true]);
  }
  // The general update writes any column it is handed: it stays for the Google link and the admin lane only.
  expect(contract.find(method => method.name === "updateMerchant")?.requiredTenant).toBe(false);
  const facts = currentRouteFacts();
  expect([...facts].filter(([, fact]) => fact.storageMethods.includes("updateMerchant")).map(([key]) => key).sort())
    .toEqual(["GET /api/auth/google/callback", "PATCH /api/admin/merchants/:id/windcave-merchant-id"]);
  for (const key of [
    "POST /api/merchants/:id/onboarding", "PUT /api/merchants/:id/daily-goal", "PUT /api/merchants/:id",
    "PUT /api/property/reminder-settings", "PUT /api/trades/reminder-settings", "PUT /api/trades/gst-settings",
  ]) {
    expect([key, facts.get(key)?.storageMethods.includes("updateMerchantSettings")]).toEqual([key, true]);
  }
});

test("the S5b stragglers name the business to storage in the call itself", () => {
  const contract = storageContract();
  const facts = currentRouteFacts();
  for (const [key, name, gone] of [
    ["POST /api/merchants/:merchantId/stock-items", "createStockItemForMerchant", "createStockItem"],
    ["POST /api/team/:userId/resend", "getTeamMemberForMerchant", "getUserById"],
    ["DELETE /api/team/:userId", "getTeamMemberForMerchant", "getUserById"],
    ["POST /api/push/unsubscribe", "deactivatePushSubscriptionForMerchant", "deactivatePushSubscriptionByEndpoint"],
    ["POST /api/push/native-unsubscribe", "deactivatePushSubscriptionForMerchant", "deactivatePushSubscriptionByEndpoint"],
    ["POST /api/board-builder/submit", "getTaptStoneForMerchant", "getTaptStone"],
  ]) {
    expect([name, contract.find(method => method.name === name)?.requiredTenant]).toEqual([name, true]);
    expect([key, facts.get(key)?.storageMethods.includes(name)]).toEqual([key, true]);
    expect([key, facts.get(key)?.storageMethods.includes(gone)]).toEqual([key, false]);
  }
  // The two stops no longer read the business's devices first: one statement decides.
  for (const key of ["POST /api/push/unsubscribe", "POST /api/push/native-unsubscribe"]) {
    expect(facts.get(key)?.storageMethods).not.toContain("getPushSubscriptionsByMerchant");
  }
  // A property tenant's history is written by its storage write, in its transaction: no route logs it.
  for (const key of ["POST /api/property/tenants", "POST /api/property/tenants/:id/archive", "POST /api/property/tenants/:id/unarchive"]) {
    expect([key, facts.get(key)?.storageMethods.includes("logTransactionEvent")]).toEqual([key, false]);
  }
  // The sender keeps the stop by address alone, for an address its push service reports gone.
  expect(contract.find(method => method.name === "deactivatePushSubscriptionByEndpoint")).toBeDefined();
});

/**
 * R1-T7 S5: what is left when every signed-in business route is asked which storage calls take no
 * business. Each is a reviewed exception with its reason; a new one fails here until it is scoped or
 * reviewed. A required argument proves nothing about a predicate: the batches' own tests do that.
 */
const REVIEWED_UNSCOPED: Record<string, Record<string, string>> = {
  "POST /api/auth/sign-out-everywhere": {
    advanceUserSessionVersion: "account scope: the signed-in login's own sessions, by the session's login id",
  },
  "PUT /api/merchants/:id/change-password": {
    getUserById: "account scope: the signed-in login itself, by the session's login id (the path is only a precondition)",
    takeAuthThrottleSlot: "account scope: the password check's counter, keyed by the signed-in login",
    settleAuthThrottle: "account scope: the same counter",
    updateUserPassword: "account scope: the signed-in login's own password",
  },
  "GET /api/merchants/:id/active-transaction": {
    getTaptStone: "public branch: a board's customer page names its board; the signed-in branch reads by the business",
  },
  "GET /api/merchants/:id/events": {
    getTaptStone: "public branch: a board's live updates; the signed-in branch is held to the session's business",
  },
  "POST /api/transactions/:id/cancel": {
    getTransaction: "validated platform-admin branch only; a business's login reads through getTransactionForMerchant",
  },
  "POST /api/push/subscribe": {
    createPushSubscription: "per login (owner decision 2026-09-22): the business rides in the data and is checked against the login under its row lock",
  },
  "POST /api/push/native-subscribe": {
    createPushSubscription: "per login, as the web registration",
  },
  "POST /api/board-builder/submit": {
    takeAuthThrottleSlot: "the business's own print limit: the counter's key is built from the session's business",
    settleAuthThrottle: "the same counter, given back when the email could not be sent",
  },
  "GET /api/invoice-documents/:name": {
    getCleanUploadedFile: "validated platform-admin branch only, and only a document scanned clean; a business's login reads through getCleanUploadedFileForMerchant",
    recordInvoiceDocumentAdminRead: "validated platform-admin branch only: the audit line of that read",
  },
};

test("every signed-in business route names its business to storage, or is a reviewed exception", () => {
  const contract = new Map(storageContract().map((method) => [method.name, method.requiredTenant]));
  const actual: Record<string, string[]> = {};
  for (const [key, fact] of currentRouteFacts()) {
    if (!ROUTE_REVIEW[key]?.branches.some((branch) => branch.principal === "merchant")) continue;
    const unscoped = fact.storageMethods.filter((name) => contract.get(name) === false).sort();
    if (unscoped.length) actual[key] = unscoped;
  }
  expect(actual).toEqual(Object.fromEntries(
    Object.entries(REVIEWED_UNSCOPED).map(([key, methods]) => [key, Object.keys(methods).sort()]),
  ));
  for (const methods of Object.values(REVIEWED_UNSCOPED)) for (const reason of Object.values(methods)) expect(reason.length).toBeGreaterThan(20);
  // The branch each exception names really is on the route.
  for (const [key, principal] of [
    ["GET /api/merchants/:id/active-transaction", "public"], ["GET /api/merchants/:id/events", "public"],
    ["POST /api/transactions/:id/cancel", "platform-admin"], ["GET /api/invoice-documents/:name", "platform-admin"],
  ]) {
    const review = ROUTE_REVIEW[key];
    const served = review.branches.some((branch) => branch.principal === principal || (principal === "platform-admin" && (branch as any).platformAdmin));
    expect([key, principal, served]).toEqual([key, principal, true]);
  }
});

test("a document is read and attached only through the clean readers; the unscanned reader serves logos alone", () => {
  const contract = storageContract();
  // The readers that asked for no scan are retired (R1-T7 S6a).
  for (const name of ["getUploadedFileForMerchant", "uploadedFileOwnedByMerchant"]) {
    expect([name, contract.find(method => method.name === name)]).toEqual([name, undefined]);
  }
  for (const name of ["getCleanUploadedFileForMerchant", "cleanUploadedFileOwnedByMerchant"]) {
    expect([name, contract.find(method => method.name === name)?.requiredTenant]).toEqual([name, true]);
  }
  const facts = currentRouteFacts();
  const callers = (name: string) => [...facts].filter(([, fact]) => fact.storageMethods.includes(name)).map(([key]) => key).sort();
  expect(callers("getUploadedFile")).toEqual(["GET /uploads/:folder/:name"]);
  expect(callers("saveUploadedFile")).toEqual(["POST /api/merchants/:id/logo"]);
  expect(callers("saveScannedUploadedFile")).toEqual(["POST /api/property/invoices/document"]);
  expect(callers("getCleanUploadedFile")).toEqual(["GET /api/invoice-documents/:name"]);
  expect(callers("getCleanUploadedFileForMerchant")).toEqual(["GET /api/checkout/document/:token", "GET /api/invoice-documents/:name"]);
  // Every create that can attach a document asks the clean check before it writes.
  for (const key of ["POST /api/property/invoices", "POST /api/trades/quotes", "POST /api/trades/invoices"]) {
    expect([key, facts.get(key)?.storageMethods.includes("cleanUploadedFileOwnedByMerchant")]).toEqual([key, true]);
  }
});

test("the upload lifecycle's storage is the scheduler's alone: no route lists, records or deletes", () => {
  const contract = storageContract();
  const facts = currentRouteFacts();
  for (const name of ["listUnscannedInvoiceDocuments", "recordUploadedFileScan", "deleteUnattachedInvoiceDocuments"]) {
    expect([name, contract.some(method => method.name === name)]).toEqual([name, true]);
    expect([name, [...facts].filter(([, fact]) => fact.storageMethods.includes(name)).map(([key]) => key)]).toEqual([name, []]);
  }
});

test("Apple identities are read and written by Apple's callback alone", () => {
  // Account-entry scope (R1-T5b): no business's route, and no other sign-in route, touches an identity.
  const facts = currentRouteFacts();
  const callers = (name: string) => [...facts].filter(([, fact]) => fact.storageMethods.includes(name)).map(([key]) => key).sort();
  for (const name of ["getAppleIdentity", "recordPendingAppleIdentity", "createMerchantWithAppleIdentity"]) {
    expect([name, callers(name)]).toEqual([name, ["POST /api/auth/apple/callback"]]);
  }
  // The handoff code is redeemed by the two session routes and no one else.
  expect(callers("consumeAuthHandoffCode")).toEqual(["POST /api/auth/apple/session", "POST /api/auth/google/session"]);
});
