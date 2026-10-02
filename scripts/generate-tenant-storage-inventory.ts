/** R1-T7: regenerate scope classifications and the storage contract; no app/database import. */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { ROUTE_REVIEW, type ReviewedBranch } from "../server/route-review";
import { currentRouteFacts } from "../server/route-facts";

export const TENANT_INVENTORY_FILE = "docs/evidence/remediation-v2-2/r1/R1-T7-tenant-storage-inventory.md";

export function storageContract() {
  return [
    ["server/storage.ts", "IStorage"],
    ["server/payment-attempt-service.ts", "PaymentAttemptRepository"],
  ].flatMap(([file, name]) => {
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find((node): node is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(node) && node.name.text === name);
    if (!declaration) throw new Error(`missing interface ${name}`);
    return declaration.members.filter(ts.isMethodSignature).map((method) => ({
      interface: name,
      name: method.name.getText(source),
      requiredTenant: method.parameters.some((p) => p.name.getText(source) === "merchantId" && !p.questionToken),
      signature: method.getText(source).replace(/\s+/g, " ").replace(/;$/, ""),
    }));
  });
}

function scopeOf(key: string, branch: ReviewedBranch): string {
  switch (branch.principal) {
    case "merchant": return key.includes("/api/auth/") || key.endsWith("/change-password")
      ? "account" : "tenant";
    case "platform-admin": return "validated admin";
    case "public-bearer": return "single-resource bearer";
    case "provider": return "provider";
    case "cron": return "scheduler";
    case "api-key": return "API-key tenant";
    case "public": return branch.tenant === "credentials" || branch.tenant === "mailbox"
      ? "account entry/recovery" : "public";
    default: throw new Error(`unclassified branch for ${key}`);
  }
}

export function tenantStorageInventory() {
  const facts = currentRouteFacts();
  const contract = storageContract();
  const known = new Set(contract.map((method) => method.name));
  const routes = [...facts].sort(([a], [b]) => a.localeCompare(b)).map(([key, fact]) => {
    const review = ROUTE_REVIEW[key];
    if (!review || !review.branches.length) throw new Error(`missing reviewed scope for ${key}`);
    for (const name of fact.storageMethods) if (!known.has(name)) throw new Error(`unknown storage method ${name} on ${key}`);
    return {
      key,
      scopes: review.branches.map((branch) => `${scopeOf(key, branch)} (${branch.principal}/${branch.tenant})`),
      methods: fact.storageMethods,
      authenticated: [...fact.middleware, ...fact.authChecks].some((name) =>
        name === "authenticateToken" || name === "authenticateAdmin"),
      businessCheck: fact.authChecks.includes("checkMerchantOwnership"),
    };
  });
  return { routes, contract };
}

export function renderTenantInventory(sha: string) {
  const { routes, contract } = tenantStorageInventory();
  const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/`/g, "");
  return [
    "# R1-T7 tenant/storage execution inventory", "",
    `Generated from working-tree sources on base \`${sha}\`; the phase evidence names the final commit.`, "",
    `Registrations: **${routes.length}**; registrations with session/admin authentication: **${routes.filter((r) => r.authenticated).length}**;`,
    `registrations calling checkMerchantOwnership: **${routes.filter((r) => r.businessCheck).length}**.`,
    `IStorage: **${contract.filter((m) => m.interface === "IStorage").length}** declared methods;`,
    `PaymentAttemptRepository: **${contract.filter((m) => m.interface === "PaymentAttemptRepository").length}** inherited methods.`, "",
    "Classifications come from the reviewed per-route branches, including mixed public/signed-in routes.",
    "Authentication counts include middleware and handler checks. Storage calls follow same-file helpers,",
    "with the route-facts extractor's documented boundaries. Counts are not a subtraction-based gap estimate.",
    "The method table records",
    "whether a signature requires an explicit merchantId argument. Structured-input, account, admin,",
    "provider and public-token methods need their separate policy; absence of that argument alone is not a defect.",
    "A required argument alone does not prove SQL scoping. Each implemented batch needs direct storage",
    "tests, two-tenant HTTP tests and a reviewed SQL predicate. This inventory does not close R1-T7.", "",
    "## Route classifications", "",
    "| Registration | Reviewed scope(s) | Storage calls in handler/helpers |",
    "|---|---|---|",
    ...routes.map((r) => `| ${cell(r.key)} | ${cell(r.scopes.join("; "))} | ${r.methods.map((m) => `\`${m}\``).join(", ") || "—"} |`), "",
    "## Storage interface", "",
    "| Interface | Method | Required merchantId argument | Signature |",
    "|---|---|---|---|",
    ...contract.map((m) => `| ${m.interface} | ${m.name} | ${m.requiredTenant ? "yes" : "no"} | \`${cell(m.signature)}\` |`), "",
  ].join("\n");
}

if (process.argv[1]?.endsWith("generate-tenant-storage-inventory.ts")) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  fs.writeFileSync(TENANT_INVENTORY_FILE, renderTenantInventory(sha));
  const { routes, contract } = tenantStorageInventory();
  console.log(`Wrote ${TENANT_INVENTORY_FILE}: ${routes.length} registrations, ${contract.length} storage methods, no unclassified branches.`);
}
