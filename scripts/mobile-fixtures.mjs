/* Page factory for the phone merchant app — shared by the §7.2 geometry gate.
 *
 * docs/PLAN-2026-08-17-mobile-responsive-ui.md §7.2 asks the gate to reuse
 * `retail-fixtures.mjs`, and it does — but that module only populates retail.
 * The single most important contract in the plan is `visibleStackRows >= 3`
 * (§6.4), and property and trades both render their empty state under the
 * catch-all `/api/property/**` → [] and `/api/trades/**` → [] routes it
 * installs. An empty stack cannot fail a row-count contract, so measuring one
 * would have silently reported "pass" for the two verticals the contract is
 * hardest on.
 *
 * Order matters: Playwright matches routes most-recently-registered first, so
 * the per-vertical overrides below are installed AFTER the retail catch-alls
 * and therefore win. The property fixtures are the same ones
 * `shot-property-terminal.mjs` uses, kept in step with the enrichment
 * `GET /api/property/invoices` performs (`server/routes.ts:7433-7445`).
 */
import { BASE_URL, CHROMIUM_PATH, MERCHANT_ID, newRetailPage } from "./desktop-shots/retail-fixtures.mjs";

export { BASE_URL, CHROMIUM_PATH, MERCHANT_ID };

const D = 24 * 3600_000;
const now = Date.now();
const at = (daysAgo, hh = 10) => {
  const d = new Date(now - daysAgo * D);
  d.setHours(hh, 0, 0, 0);
  return d.toISOString();
};
const ahead = (days) => new Date(now + days * D).toISOString();

const TENANTS = [
  { id: "t1", firstName: "Josh", lastName: "Smith", propertyAddress: "12 Kauri Road", status: "active", phone: "0221111111", email: "josh@example.com" },
  { id: "t2", firstName: "Mia", lastName: "Chen", propertyAddress: "5 Bellbird Rise", status: "active", phone: "0222222222", email: "mia@example.com" },
  { id: "t3", firstName: "Tane", lastName: "Walker", propertyAddress: "88 Harbour View", status: "active", phone: "0223333333", email: "tane@example.com" },
  { id: "t4", firstName: "Ruby", lastName: "Nolan", propertyAddress: "12 Kauri Road", status: "active", phone: "0224444444", email: "ruby@example.com" },
];

const RAW_INVOICES = [
  { id: "i1", tenantProfileId: "t1", amountCents: 65000, status: "paid", dueAt: at(6), paidAt: at(6), createdAt: at(8), kind: "rent" },
  { id: "i2", tenantProfileId: "t2", amountCents: 80000, status: "paid", dueAt: at(5), paidAt: at(5), createdAt: at(7), kind: "rent" },
  { id: "i3", tenantProfileId: "t3", amountCents: 52000, status: "paid_external", dueAt: at(3), paidAt: at(3), createdAt: at(5), kind: "rent" },
  { id: "i6", tenantProfileId: "t2", amountCents: 80000, status: "overdue", dueAt: at(4), createdAt: at(11), kind: "rent" },
  { id: "i7", tenantProfileId: "t3", amountCents: 52000, status: "overdue", dueAt: at(9), createdAt: at(16), kind: "rent" },
  { id: "i8", tenantProfileId: "t4", amountCents: 24000, status: "dispatch_failed", dueAt: at(2), createdAt: at(4), kind: "charge", chargeType: "utilities", description: "water bill" },
  { id: "i9", tenantProfileId: "t1", amountCents: 65000, status: "dispatched", dueAt: ahead(2), createdAt: at(1), kind: "rent" },
  { id: "i10", tenantProfileId: "t2", amountCents: 80000, status: "dispatched", dueAt: ahead(5), createdAt: at(1), kind: "rent" },
  { id: "i11", tenantProfileId: "t3", amountCents: 60000, status: "dispatched", dueAt: ahead(4), createdAt: at(2), kind: "rent", splitEnabled: true, splitCount: 4, splitPaidCount: 3 },
  { id: "i12", tenantProfileId: "t4", amountCents: 61000, status: "pending_dispatch", dueAt: ahead(6), createdAt: at(0), kind: "rent" },
];

const PROPERTY_INVOICES = RAW_INVOICES.map((inv) => {
  const t = TENANTS.find((x) => x.id === inv.tenantProfileId);
  const isSplit = inv.splitEnabled && inv.splitCount > 1;
  const base = isSplit ? Math.floor(inv.amountCents / inv.splitCount) : 0;
  return {
    ...inv,
    tenantName: t ? `${t.firstName} ${t.lastName}` : "—",
    propertyAddress: t ? t.propertyAddress : "—",
    owingCents: isSplit ? inv.amountCents - (inv.splitPaidCount || 0) * base : inv.amountCents,
    sharesLeft: isSplit ? inv.splitCount - (inv.splitPaidCount || 0) : null,
  };
});

const SCHEDULES = [
  { id: "s1", tenantProfileId: "t1", amountCents: 65000, frequency: "weekly", status: "active", nextRunDate: ahead(2) },
  { id: "s2", tenantProfileId: "t2", amountCents: 80000, frequency: "weekly", status: "active", nextRunDate: ahead(5) },
];

const TRADES_CLIENTS = [
  { id: "c1", name: "Karen Vaile", email: "karen@example.com", phone: "0212223333", address: "18 Rimu Street" },
  { id: "c2", name: "Hemi Ngata", email: "hemi@example.com", phone: "0213334444", address: "402 Beach Road" },
  { id: "c3", name: "Dot Fairweather", email: "dot@example.com", phone: "0214445555", address: "7 Miro Lane" },
];

const TRADES_INVOICES = [
  { id: "ti1", clientId: "c1", clientName: "Karen Vaile", amountCents: 48000, status: "dispatched", dueAt: ahead(3), createdAt: at(1), description: "gutter clean" },
  { id: "ti2", clientId: "c2", clientName: "Hemi Ngata", amountCents: 126500, status: "overdue", dueAt: at(5), createdAt: at(14), description: "bathroom reseal" },
  { id: "ti3", clientId: "c3", clientName: "Dot Fairweather", amountCents: 32000, status: "paid", dueAt: at(8), paidAt: at(8), createdAt: at(10), description: "tap washer" },
  { id: "ti4", clientId: "c1", clientName: "Karen Vaile", amountCents: 91000, status: "dispatched", dueAt: ahead(6), createdAt: at(2), description: "deck stain" },
  { id: "ti5", clientId: "c2", clientName: "Hemi Ngata", amountCents: 21500, status: "pending_dispatch", dueAt: ahead(9), createdAt: at(0), description: "callout" },
];

const TRADES_QUOTES = [
  { id: "q1", clientId: "c1", clientName: "Karen Vaile", amountCents: 145000, status: "sent", createdAt: at(3), lineItems: [] },
  { id: "q2", clientId: "c3", clientName: "Dot Fairweather", amountCents: 61000, status: "accepted", createdAt: at(6), lineItems: [] },
];

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/* The three phone terminal homes. Retail is the only one `retail-fixtures.mjs`
   populates on its own. */
export const VERTICALS = {
  retail: { route: "/terminal", mode: "retail" },
  property: { route: "/property/terminal", mode: "property" },
  trades: { route: "/trades/terminal", mode: "trades" },
};

async function installVerticalMocks(page, vertical) {
  if (vertical === "retail") return;

  /* `taptMode` decides which vertical's shell the app boots into; the retail
     factory has already written "retail". Overwrite before first paint. */
  await page.addInitScript((mode) => localStorage.setItem("taptMode", mode), VERTICALS[vertical].mode);

  if (vertical === "property") {
    await page.route("**/api/property/tenants", (r) => json(r, TENANTS));
    await page.route("**/api/property/invoices", (r) => json(r, PROPERTY_INVOICES));
    await page.route("**/api/property/schedules", (r) => json(r, SCHEDULES));
    await page.route("**/api/property/reminder-settings", (r) =>
      json(r, { enabled: false, daysBefore: 3, daysAfter: 3 }));
  }

  if (vertical === "trades") {
    await page.route("**/api/trades/clients", (r) => json(r, TRADES_CLIENTS));
    await page.route("**/api/trades/invoices", (r) => json(r, TRADES_INVOICES));
    await page.route("**/api/trades/quotes", (r) => json(r, TRADES_QUOTES));
  }
}

/* `hasTouch` is what makes `(pointer: coarse)` match, and `use-device-class.ts`
   needs the mobile branch or the app hands back the desktop shell — every
   measurement would then be of the wrong UI. `isMobile` additionally turns on
   the mobile viewport meta path, which is what makes `svh` behave as it does on
   a phone rather than as it does in a narrow desktop window. */
export async function newMobilePage(browser, vertical, { width, height, safeArea = null }) {
  const { context, page, errors } = await newRetailPage(browser, `${vertical}@${width}x${height}`, {
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await installVerticalMocks(page, vertical);

  if (safeArea) {
    /* `env(safe-area-inset-*)` cannot be set from Playwright — it comes from the
       platform. §7.2 clause 8 wants a run with insets, so the gate injects the
       same values as CSS custom properties and the token layer reads
       `env(..., var(--sa-test-top, 0px))`. Until phase 6 lands that fallback
       chain this run measures nothing extra; it is wired now so clause 8 does
       not have to be retrofitted later. */
    await page.addInitScript((sa) => {
      document.documentElement.style.setProperty("--sa-test-top", `${sa.top}px`);
      document.documentElement.style.setProperty("--sa-test-bottom", `${sa.bottom}px`);
      document.documentElement.style.setProperty("--sa-test-left", `${sa.left}px`);
      document.documentElement.style.setProperty("--sa-test-right", `${sa.right}px`);
    }, safeArea);
  }

  return { context, page, errors };
}
