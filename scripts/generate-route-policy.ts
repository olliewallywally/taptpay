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
  detectProviderWebhookMarkers,
  detectPublicMarkers,
  extractRegistrationInventory,
  isNotificationWebhookRegistration,
  PUBLIC_PATH_ALLOWLIST,
  REGISTRATION_FILES,
  registrationKey,
  sliceHandlerBodies,
  SUSPECTED_GAP_ROUTES,
  type RouteRegistration,
} from "../server/route-inventory";
import { compactFacts, currentRouteFacts, type RecordedRouteFacts } from "../server/route-facts";

const POLICY_FILE = path.join(process.cwd(), "server", "route-policy.ts");
const TABLE_FILE = path.join(
  process.cwd(),
  "docs",
  "evidence",
  "remediation-v2-2",
  "r1",
  "R1-T2-route-inventory-table.md",
);

/**
 * R1-T2 2026-09-12 classifier extension (docs/evidence/remediation-v2-2/r1/ —
 * seven analysis passes over server/routes.ts's then-96 "unclassified"
 * routes). Order matters: each branch below returns as soon as it is sure,
 * so a route that carries a real gate marker is never reclassified by a
 * public-marker substring that merely happens to also appear in its slice
 * (several public-flow helpers — generatePaymentUrl(, publicTransactionDto(,
 * isTokenAddressedTransaction( — are reused by authenticated handlers too,
 * purely to build a response field).
 *
 *  1. A route flagged in SUSPECTED_GAP_ROUTES is never allowed to hide
 *     behind ANY other label, including one it would otherwise legitimately
 *     earn (e.g. its authenticateToken marker) — that is the entire point
 *     of the category: make the ambiguity visible, not resolve it here.
 *  2. cron / api-key / admin are real, specific gate markers.
 *  3. A provider-server-to-server webhook is recognized by this codebase's
 *     consistent app.all(...notification...) convention BEFORE the
 *     merchant-user/public checks below, because the Windcave notification
 *     handler's own slice can (via the sliceHandlerBodies boundary
 *     limitation documented in route-inventory.ts) contain text belonging
 *     to a neighboring route's helper — path/method wins over any marker.
 *  4. merchant-user: the standard session gate.
 *  5. public: either a call-site marker this codebase already uses for a
 *     deliberately unauthenticated flow, or a curated path allowlist for
 *     the handful of routes with no reliable marker text at all.
 *  6. Anything left is genuinely unclassified — no known gate, no known
 *     public design signal, no curated allowlist entry. That needs a human
 *     read, not a guess.
 */
function classifyPrincipal(
  method: string,
  routePath: string,
  gateMarkers: string[],
  publicMarkers: string[],
  webhookMarkers: string[],
): string {
  const key = registrationKey(method, routePath);
  if (key in SUSPECTED_GAP_ROUTES) return "unauthenticated-suspect";

  if (gateMarkers.includes("authorizeCronRequest")) return "cron";
  if (gateMarkers.includes("authenticateApiKey") || gateMarkers.includes("requireEcommerceApi")) return "api-key";
  if (gateMarkers.includes("authenticateAdmin")) return "admin";

  if (isNotificationWebhookRegistration(method, routePath)) return "provider-webhook";

  if (gateMarkers.includes("authenticateToken")) return "merchant-user";

  if (webhookMarkers.length > 0) return "provider-webhook";
  if (publicMarkers.length > 0) return "public";
  if (key in PUBLIC_PATH_ALLOWLIST) return "public";

  return "unclassified"; // needs a human read, not necessarily a bug
}

/** One entry per route, one line per recorded fact, so a changed fact is a one-line diff. */
function renderPolicyEntry(r: {
  method: string;
  path: string;
  principal: string;
  markers: string[];
  facts: RecordedRouteFacts;
}): string {
  const factLines = Object.entries(r.facts).map(([field, values]) => `      ${field}: ${JSON.stringify(values)},`);
  return [
    `  ${JSON.stringify(`${r.method} ${r.path}`)}: {`,
    `    method: ${JSON.stringify(r.method)},`,
    `    path: ${JSON.stringify(r.path)},`,
    `    principal: ${JSON.stringify(r.principal)},`,
    `    markers: ${JSON.stringify(r.markers)},`,
    factLines.length > 0 ? `    facts: {\n${factLines.join("\n")}\n    },` : `    facts: {},`,
    `  },`,
  ].join("\n");
}

/** The documentation's per-route facts: one short section per route. */
function renderFactsSection(r: { method: string; path: string; facts: RecordedRouteFacts }): string {
  const lines = Object.entries(r.facts).map(
    ([field, values]) => `- ${field}: ${(values as Array<string | number>).map((v) => `\`${v}\``).join(", ")}`,
  );
  return [`### ${r.method} \`${r.path}\``, "", ...(lines.length > 0 ? lines : ["- (no facts: a static answer)"]), ""].join("\n");
}

function main() {
  const sha = execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  const generatedAt = new Date().toISOString().slice(0, 10);

  // Every file that registers on the app (server/route-inventory.ts,
  // REGISTRATION_FILES); today every route is in server/routes.ts.
  const inventory = extractRegistrationInventory();
  const registrations: Array<RouteRegistration & { file: string; body: string }> = REGISTRATION_FILES.flatMap((file) => {
    const sourceText = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const fileRegistrations = inventory[file].registrations;
    const bodies = sliceHandlerBodies(sourceText, fileRegistrations);
    return fileRegistrations.map((reg, i) => ({ ...reg, file, body: bodies[i] }));
  });

  // What each handler does, read from its syntax tree (server/route-facts.ts).
  const allFacts = currentRouteFacts();

  const rows = registrations.map((reg) => {
    const { body, ...registration } = reg;
    const handlerFacts = allFacts.get(registrationKey(reg.method, reg.path));
    if (!handlerFacts) throw new Error(`no facts for ${reg.method} ${reg.path}`);
    const facts: RecordedRouteFacts = compactFacts(handlerFacts);
    const gateMarkers = detectGateMarkers(body);
    const publicMarkers = detectPublicMarkers(body);
    const webhookMarkers = detectProviderWebhookMarkers(body);
    // All detected literal markers, surfaced together for human review —
    // see route-inventory.ts for which list each one came from and what it
    // means. A "public"/"provider-webhook" row with an empty markers array
    // was classified via PUBLIC_PATH_ALLOWLIST / the notification path-rule
    // instead of a text marker; see the per-route justification there.
    const markers = [...gateMarkers, ...publicMarkers, ...webhookMarkers];
    const principal = classifyPrincipal(reg.method, reg.path, gateMarkers, publicMarkers, webhookMarkers);
    return { ...registration, markers, principal, facts };
  });

  const byMethod: Record<string, number> = {};
  for (const r of rows) byMethod[r.method] = (byMethod[r.method] ?? 0) + 1;

  const policySource = `/**
 * R1-T2 — route policy inventory. GENERATED (bootstrap) by
 * scripts/generate-route-policy.ts from ${REGISTRATION_FILES.join(", ")} @ ${sha} on ${generatedAt}.
 *
 * ${rows.length} registrations (${Object.entries(byMethod)
    .map(([m, c]) => `${c} ${m}`)
    .join(", ")}) on this SHA — evidence for THIS commit, not a timeless
 * constant; server/__tests__/route-policy-inventory.test.ts re-derives the
 * live count on every run rather than trusting this comment.
 *
 * What this file asserts: every route registration in those files has an
 * entry here (the completeness gate route-policy-inventory.test.ts enforces).
 * Middleware registrations (app.use) are policed in server/middleware-policy.ts.
 * \`principal\` is a best-effort heuristic from text-marker matches and two
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
 *
 * \`facts\` (C10, 2026-09-26) is what each handler does, read from its syntax
 * tree by server/route-facts.ts — middleware, parameter parsing, body
 * validation, authorization checks, storage methods, external side effects,
 * statuses, response projections, error text in responses, capability,
 * entitlement, rate-limit and idempotency calls — with empty lists left out.
 * server/__tests__/route-policy-facts.test.ts re-reads every handler and fails
 * when a recorded fact is no longer true, so a change to what a route checks
 * or touches shows up here, in review. Facts are not judgments: who may call
 * a route and on which tenant are reviewed separately.
 *
 * Regenerate: node --import tsx scripts/generate-route-policy.ts
 */

import type { RecordedRouteFacts } from "./route-facts";

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
  /** What the handler does (server/route-facts.ts); empty lists are left out. */
  facts: RecordedRouteFacts;
}

export const ROUTE_POLICY: Record<string, RoutePolicyEntry> = {
${rows.map(renderPolicyEntry).join("\n")}
};
`;

  fs.writeFileSync(POLICY_FILE, policySource);

  const unclassified = rows.filter((r) => r.principal === "unclassified");
  const suspectedGaps = rows.filter((r) => r.principal === "unauthenticated-suspect");
  const byPrincipal: Record<string, number> = {};
  for (const r of rows) byPrincipal[r.principal] = (byPrincipal[r.principal] ?? 0) + 1;

  const gapSection = suspectedGaps.length
    ? `
## Suspected access-control gaps — not a fix, a loud flag

These routes are classified \`unauthenticated-suspect\` instead of whatever
their markers would otherwise earn, specifically so a real gap cannot hide
behind a reassuring label. See SUSPECTED_GAP_ROUTES in
server/route-inventory.ts for the justification; this generator does not and
must not silently resolve these.

${suspectedGaps.map((r) => `- **${r.method} ${r.path}** (line ${r.line})`).join("\n")}
`
    : "";

  const table = `# R1-T2 route inventory — generated ${generatedAt} @ \`${sha}\`

Regenerate with \`npx tsx scripts/generate-route-policy.ts\`. This table is
evidence for the SHA named above, not a timeless constant — see
docs/evidence/remediation-v2-2/r1/ for the task record.

Total registrations: **${rows.length}** (${Object.entries(byMethod)
    .map(([m, c]) => `${c} ${m}`)
    .join(", ")}).

By principal: ${Object.entries(byPrincipal)
    .map(([p, c]) => `**${p}**: ${c}`)
    .join(", ")}.

Unclassified (no known gate marker, no known public-design marker, and no
curated allowlist entry found near the handler — needs a human read, not
necessarily a bug): **${unclassified.length}**.
${gapSection}
| Method | Path | Line | Principal (heuristic) | Markers |
|---|---|---:|---|---|
${rows
  .map(
    (r) =>
      `| ${r.method} | \`${r.path}\` | ${r.file === "server/routes.ts" ? r.line : `${r.file}:${r.line}`} | ${r.principal} | ${r.markers.join(", ") || "—"} |`,
  )
  .join("\n")}

## Per-route facts

What each handler does, read from its syntax tree (server/route-facts.ts): its
middleware, how each path and query value is parsed ("raw": no parser), body
validation, authorization checks and tenant/role comparisons, storage methods,
calls that leave the process, statuses, response projections (DTOs), error text
put into responses, and capability, entitlement, rate-limit and idempotency
calls. Helpers in the same file are followed; imported functions are not (they
are classified by name). Facts, not judgments.

${rows.map(renderFactsSection).join("\n")}`;

  fs.writeFileSync(TABLE_FILE, table);

  console.log(`Wrote ${POLICY_FILE} and ${TABLE_FILE}`);
  console.log(`${rows.length} registrations, ${unclassified.length} unclassified, ${suspectedGaps.length} suspected gap(s).`);
}

main();
