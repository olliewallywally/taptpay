import fs from "node:fs";
import { currentRouteFacts } from "../route-facts";
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
  const retired = ["getStockItem", "updateStockItem", "deleteStockItem", "updateTaptStone", "updateTaptStoneUrls", "deleteTaptStone"];
  expect(contract.filter((m) => retired.includes(m.name))).toEqual([]);
  for (const name of ["getStockItem", "updateStockItem", "deleteStockItem", "getTaptStone", "updateTaptStone", "updateTaptStoneUrls", "deleteTaptStone"]) {
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
