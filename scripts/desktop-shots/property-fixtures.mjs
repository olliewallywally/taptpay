/* Synthetic property data for desktop screenshots: a few tenants across two
   properties, a year of rent and a couple of payments still owing. Install it on
   a page made by `newRetailPage` (retail-fixtures.mjs): the property routes and
   the mode registered here run after the retail ones, so they win. */
import { MERCHANT_ID } from "./retail-fixtures.mjs";

const now = Date.now();
const DAY = 86_400_000;
const daysAgo = (days, hour = 10) => {
  const value = new Date(now - days * DAY);
  value.setHours(hour, 15, 0, 0);
  return value.toISOString();
};

export const PROPERTY_TENANTS = [
  { id: "t-1", merchantId: MERCHANT_ID, firstName: "Josh", lastName: "Smith", email: "josh@example.invalid", phone: "0221111111", propertyAddress: "12 Kauri Road", preferredChannel: "sms", status: "active" },
  { id: "t-2", merchantId: MERCHANT_ID, firstName: "Ruby", lastName: "Nolan", email: "ruby@example.invalid", phone: "0222222222", propertyAddress: "12 Kauri Road", preferredChannel: "email", status: "active" },
  { id: "t-3", merchantId: MERCHANT_ID, firstName: "Mia", lastName: "Chen", email: "mia@example.invalid", phone: "0223333333", propertyAddress: "5 Bellbird Rise", preferredChannel: "email", status: "active" },
];

const tenantOf = (id) => PROPERTY_TENANTS.find((tenant) => tenant.id === id);
const invoice = (id, tenantId, amountCents, status, createdDaysAgo, extra = {}) => {
  const tenant = tenantOf(tenantId);
  const createdAt = daysAgo(createdDaysAgo);
  return {
    id,
    merchantId: MERCHANT_ID,
    tenantProfileId: tenantId,
    tenantName: `${tenant.firstName} ${tenant.lastName}`,
    propertyAddress: tenant.propertyAddress,
    amountCents,
    owingCents: status === "paid" ? 0 : amountCents,
    status,
    kind: "rent",
    createdAt,
    paidAt: status === "paid" ? createdAt : null,
    dueAt: createdAt,
    ...extra,
  };
};

export const PROPERTY_INVOICES = [
  // a year of monthly rent, all paid
  ...Array.from({ length: 11 }, (_, month) => invoice(`r-${month}`, "t-1", 52_000 + (month % 4) * 9_500, "paid", 30 * (month + 1))),
  ...Array.from({ length: 11 }, (_, month) => invoice(`s-${month}`, "t-3", 61_000, "paid", 30 * (month + 1) + 3)),
  // this month
  invoice("m-1", "t-1", 58_000, "paid", 2),
  invoice("m-2", "t-2", 44_500, "paid", 1),
  invoice("m-3", "t-3", 61_000, "dispatched", 0),
  invoice("m-4", "t-2", 19_500, "overdue", 9, { kind: "charge", chargeType: "utilities", description: "Water / utilities" }),
];

export const PROPERTY_SCHEDULES = PROPERTY_TENANTS.map((tenant, index) => ({
  id: `sched-${index + 1}`,
  merchantId: MERCHANT_ID,
  tenantProfileId: tenant.id,
  amountCents: [58_000, 44_500, 61_000][index],
  frequency: "monthly",
  status: "active",
  nextRunAt: daysAgo(-20),
}));

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export async function installPropertyData(page) {
  await page.addInitScript(() => localStorage.setItem("taptMode", "property"));
  await page.route("**/api/property/tenants", (route) => json(route, PROPERTY_TENANTS));
  await page.route("**/api/property/invoices", (route) => json(route, PROPERTY_INVOICES));
  await page.route("**/api/property/schedules", (route) => json(route, PROPERTY_SCHEDULES));
}
