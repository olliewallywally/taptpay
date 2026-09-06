/**
 * R1-T2 — regenerates server/route-policy.ts and the documentation table from
 * the current server/routes.ts source. Run this whenever routes.ts's
 * registrations change; server/__tests__/route-policy-inventory.test.ts fails
 * loudly if the two drift apart.
 *
 *   npx tsx scripts/generate-route-policy.ts
 */
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";
import {
  detectGateMarkers,
  extractSourceInventoryFromFile,
  sliceHandlerBodies,
  type RouteRegistration,
} from "../server/route-inventory";

const ROUTES_FILE = path.join(process.cwd(), "server", "routes.ts");
const POLICY_FILE = path.join(process.cwd(), "server", "route-policy.ts");
const TABLE_FILE = path.join(
  process.cwd(),
  "docs",
  "evidence",
  "remediation-v2-2",
  "r1",
  "R1-T2-route-inventory-table.md",
);

function classifyPrincipal(markers: string[]): string {
  if (markers.includes("authorizeCronRequest")) return "cron";
  if (markers.includes("authenticateApiKey") || markers.includes("requireEcommerceApi")) return "api-key";
  if (markers.includes("authenticateToken")) return "merchant-user";
  return "unclassified"; // public, or gated by something this marker list does not yet know
}

function main() {
  const sha = execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  const generatedAt = new Date().toISOString().slice(0, 10);

  const inventory = extractSourceInventoryFromFile(ROUTES_FILE);
  const sourceText = fs.readFileSync(ROUTES_FILE, "utf8");
  const bodies = sliceHandlerBodies(sourceText, inventory.registrations);

  const rows = inventory.registrations.map((reg: RouteRegistration, i: number) => {
    const markers = detectGateMarkers(bodies[i]);
    return { ...reg, markers, principal: classifyPrincipal(markers) };
  });

  const byMethod: Record<string, number> = {};
  for (const r of rows) byMethod[r.method] = (byMethod[r.method] ?? 0) + 1;

  const policySource = `/**
 * R1-T2 — route policy inventory. GENERATED (bootstrap) by
 * scripts/generate-route-policy.ts from server/routes.ts @ ${sha} on ${generatedAt}.
 *
 * ${rows.length} registrations (${Object.entries(byMethod)
    .map(([m, c]) => `${c} ${m}`)
    .join(", ")}) on this SHA — evidence for THIS commit, not a timeless
 * constant; server/__tests__/route-policy-inventory.test.ts re-derives the
 * live count on every run rather than trusting this comment.
 *
 * What this file asserts: every registration in server/routes.ts has an
 * entry here (the completeness gate route-policy-inventory.test.ts enforces).
 * \`principal\` is a best-effort heuristic from KNOWN_GATE_MARKERS text
 * matches, not a security review — "merchant-user" does not yet distinguish
 * owner/member/admin, and "unclassified" is not the same as "public": it
 * means no known gate marker was found near this handler and the route
 * needs the R1-T3 role/tenant matrix's actual read before it means anything.
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
  principal: "merchant-user" | "cron" | "api-key" | "unclassified";
  /** literal marker strings found near this handler — see KNOWN_GATE_MARKERS in server/route-inventory.ts */
  markers: string[];
}

export const ROUTE_POLICY: Record<string, RoutePolicyEntry> = {
${rows
  .map(
    (r) =>
      `  ${JSON.stringify(`${r.method} ${r.path}`)}: ${JSON.stringify({
        method: r.method,
        path: r.path,
        principal: r.principal,
        markers: r.markers,
      })},`,
  )
  .join("\n")}
};
`;

  fs.writeFileSync(POLICY_FILE, policySource);

  const unclassified = rows.filter((r) => r.principal === "unclassified");
  const table = `# R1-T2 route inventory — generated ${generatedAt} @ \`${sha}\`

Regenerate with \`npx tsx scripts/generate-route-policy.ts\`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **${rows.length}** (${Object.entries(byMethod)
    .map(([m, c]) => `${c} ${m}`)
    .join(", ")}).

Unclassified (no known gate marker detected near the handler — needs a human
read, not necessarily a bug): **${unclassified.length}**.

| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
${rows
  .map(
    (r) =>
      `| ${r.method} | \`${r.path}\` | ${r.line} | ${r.principal} | ${r.markers.join(", ") || "—"} |`,
  )
  .join("\n")}
`;

  fs.writeFileSync(TABLE_FILE, table);

  console.log(`Wrote ${POLICY_FILE} and ${TABLE_FILE}`);
  console.log(`${rows.length} registrations, ${unclassified.length} unclassified.`);
}

main();
