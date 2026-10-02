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
