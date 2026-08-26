/* Screenshot the desktop property analytics screen (2d): overview ranges,
   property scope, payment-history sheet, reports flow and generated donut/bar
   reports, at desktop and touch-tablet sizes. */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const OUT = "/tmp/taptpay-desktop-2d";
const MERCHANT_ID = 999999;

const H = 3_600_000;
const D = 24 * H;
const now = new Date();
const iso = (date) => date.toISOString();
const shifted = (date, milliseconds) => new Date(date.getTime() + milliseconds);
const daysAgo = (days, hour = 10) => {
  const date = new Date(now.getTime() - days * D);
  date.setHours(hour, 15, 0, 0);
  return date;
};
const daysAhead = (days, hour = 10) => {
  const date = new Date(now.getTime() + days * D);
  date.setHours(hour, 15, 0, 0);
  return date;
};
const uuid = (family, id) =>
  `${family.repeat(8)}-${family.repeat(4)}-4${family.repeat(3)}-8${family.repeat(3)}-${String(id).padStart(12, "0")}`;

const TENANTS = [
  {
    id: uuid("1", 1),
    merchantId: MERCHANT_ID,
    firstName: "Josh",
    lastName: "Smith",
    email: "josh@example.invalid",
    phone: "0221111111",
    propertyAddress: "12 Kauri Road",
    preferredChannel: "sms",
    status: "active",
    createdAt: iso(daysAgo(420)),
    updatedAt: iso(daysAgo(2)),
  },
  {
    id: uuid("1", 2),
    merchantId: MERCHANT_ID,
    firstName: "Ruby",
    lastName: "Nolan",
    email: "ruby@example.invalid",
    phone: "0222222222",
    propertyAddress: "12 Kauri Road",
    preferredChannel: "email",
    status: "active",
    createdAt: iso(daysAgo(310)),
    updatedAt: iso(daysAgo(3)),
  },
  {
    id: uuid("1", 3),
    merchantId: MERCHANT_ID,
    firstName: "Mia",
    lastName: "Chen",
    email: "mia@example.invalid",
    phone: "0223333333",
    propertyAddress: "5 Bellbird Rise",
    preferredChannel: "sms",
    status: "active",
    createdAt: iso(daysAgo(270)),
    updatedAt: iso(daysAgo(1)),
  },
  {
    id: uuid("1", 4),
    merchantId: MERCHANT_ID,
    firstName: "Tane",
    lastName: "Walker",
    email: "tane@example.invalid",
    phone: "0224444444",
    propertyAddress: "88 Harbour View",
    preferredChannel: "whatsapp",
    status: "active",
    createdAt: iso(daysAgo(190)),
    updatedAt: iso(daysAgo(4)),
  },
  {
    id: uuid("1", 5),
    merchantId: MERCHANT_ID,
    firstName: "Ana",
    lastName: "Reeves",
    email: "ana@example.invalid",
    phone: "0225555555",
    propertyAddress: "9 Totara Lane",
    preferredChannel: "email",
    status: "active",
    createdAt: iso(daysAgo(125)),
    updatedAt: iso(daysAgo(5)),
  },
  {
    id: uuid("1", 6),
    merchantId: MERCHANT_ID,
    firstName: "Leo",
    lastName: "Martin",
    email: "leo@example.invalid",
    phone: "0226666666",
    propertyAddress: "5 Bellbird Rise",
    preferredChannel: "email",
    status: "archived",
    archivedAt: iso(daysAgo(40)),
    createdAt: iso(daysAgo(500)),
    updatedAt: iso(daysAgo(40)),
  },
];

const TENANT_BY_ID = new Map(TENANTS.map((tenant) => [tenant.id, tenant]));
const tenantIds = TENANTS.map((tenant) => tenant.id);
const scheduleIds = tenantIds.map((_, index) => uuid("3", index + 1));
let invoiceSequence = 0;

function invoice({
  tenantIndex,
  amountCents,
  status,
  createdAt,
  dueAt,
  paidAt = null,
  kind = "rent",
  description = null,
  schedule = true,
}) {
  const tenantProfileId = tenantIds[tenantIndex];
  const tenant = TENANT_BY_ID.get(tenantProfileId);
  const id = uuid("2", ++invoiceSequence);
  const dispatched =
    status === "pending_dispatch" ? null : shifted(createdAt, 15 * 60_000);
  return {
    id,
    merchantId: MERCHANT_ID,
    tenantProfileId,
    scheduleId: schedule ? scheduleIds[tenantIndex] : null,
    amountCents,
    token: `desktop-shot-property-${invoiceSequence}`,
    deliveryChannel: tenant.preferredChannel,
    billingPeriodStart: iso(createdAt),
    kind,
    chargeType: kind === "charge" ? "utilities" : null,
    description,
    status,
    dueAt: iso(dueAt),
    dispatchedAt: dispatched ? iso(dispatched) : null,
    sentAt: dispatched ? iso(dispatched) : null,
    paidAt: paidAt ? iso(paidAt) : null,
    voidedAt: status === "voided" ? iso(shifted(createdAt, 2 * H)) : null,
    reminderCount: status === "overdue" ? 2 : 0,
    splitEnabled: false,
    splitCount: null,
    splitPaidCount: 0,
    createdAt: iso(createdAt),
    updatedAt: iso(paidAt ?? dispatched ?? createdAt),
    /* The live list is enriched with these display fields by the property API. */
    tenantName: `${tenant.firstName} ${tenant.lastName}`,
    propertyAddress: tenant.propertyAddress,
  };
}

const INVOICES = [];

/* Calendar-year collection history: enough points to make the Year chart and
   Annual Income report meaningful, with both paid status variants. */
for (let month = 0; month <= now.getMonth(); month += 1) {
  const paidAt =
    month === now.getMonth()
      ? shifted(now, -5 * H)
      : new Date(now.getFullYear(), month, 8 + (month % 9), 10 + (month % 4), 15);
  INVOICES.push(
    invoice({
      tenantIndex: month % 5,
      amountCents: 52_000 + (month % 4) * 9_500,
      status: month % 3 === 1 ? "paid_external" : "paid",
      createdAt: shifted(paidAt, -6 * D),
      dueAt: shifted(paidAt, -D),
      paidAt,
    }),
  );
}

/* A shaped current week plus a previous-week baseline exercises Week totals,
   growth and the paid/outstanding chart series regardless of today's weekday. */
const weekStart = new Date(now);
weekStart.setHours(0, 0, 0, 0);
weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
const elapsedWeekDays = (now.getDay() + 6) % 7;
for (let day = 0; day <= elapsedWeekDays; day += 1) {
  const candidate = new Date(weekStart);
  candidate.setDate(weekStart.getDate() + day);
  candidate.setHours(8 + ((day * 2) % 9), 20, 0, 0);
  const paidAt =
    candidate.getTime() < now.getTime()
      ? candidate
      : shifted(now, -30 * 60_000);
  INVOICES.push(
    invoice({
      tenantIndex: day % 5,
      amountCents: 48_000 + day * 7_250,
      status: day % 2 ? "paid_external" : "paid",
      createdAt: shifted(paidAt, -2 * H),
      dueAt: shifted(paidAt, -30 * 60_000),
      paidAt,
    }),
  );
}
for (let day = 1; day <= 3; day += 1) {
  const paidAt = shifted(weekStart, -(day * D) - 4 * H);
  INVOICES.push(
    invoice({
      tenantIndex: (day + 1) % 5,
      amountCents: 42_000 + day * 6_000,
      status: "paid",
      createdAt: shifted(paidAt, -3 * D),
      dueAt: shifted(paidAt, -D),
      paidAt,
    }),
  );
}

/* Outstanding items intentionally occupy every real ageing bucket. */
[
  { tenantIndex: 0, days: 3, amountCents: 65_000 },
  { tenantIndex: 2, days: 12, amountCents: 80_000 },
  { tenantIndex: 3, days: 45, amountCents: 52_000 },
  { tenantIndex: 4, days: 75, amountCents: 71_500 },
].forEach(({ tenantIndex, days, amountCents }) => {
  const dueAt = daysAgo(days);
  INVOICES.push(
    invoice({
      tenantIndex,
      amountCents,
      status: "overdue",
      createdAt: shifted(dueAt, -7 * D),
      dueAt,
    }),
  );
});

/* Current sent/queued rows keep the collection donut multi-segment and the
   history representative; the voided invoice must be excluded everywhere. */
INVOICES.push(
  invoice({
    tenantIndex: 1,
    amountCents: 61_000,
    status: "dispatched",
    createdAt: daysAgo(2, 14),
    dueAt: daysAhead(3),
  }),
  invoice({
    tenantIndex: 0,
    amountCents: 19_500,
    status: "dispatched",
    createdAt: daysAgo(4, 11),
    dueAt: daysAhead(1),
    kind: "charge",
    description: "Water usage",
    schedule: false,
  }),
  invoice({
    tenantIndex: 2,
    amountCents: 80_000,
    status: "pending_dispatch",
    createdAt: daysAgo(1, 16),
    dueAt: daysAhead(7),
  }),
  invoice({
    tenantIndex: 4,
    amountCents: 23_000,
    status: "voided",
    createdAt: daysAgo(8),
    dueAt: daysAhead(2),
    kind: "charge",
    description: "Cancelled garden service",
    schedule: false,
  }),
);

const SCHEDULES = TENANTS.slice(0, 5).map((tenant, index) => ({
  id: scheduleIds[index],
  merchantId: MERCHANT_ID,
  tenantProfileId: tenant.id,
  amountCents: [65_000, 61_000, 80_000, 52_000, 71_500][index],
  frequency: ["weekly", "fortnightly", "weekly", "monthly", "fortnightly"][index],
  deliveryChannel: tenant.preferredChannel,
  startDate: iso(daysAgo(180 - index * 12)),
  endDate: null,
  nextRunDate: iso(daysAhead(2 + index)),
  lastRunDate: iso(daysAgo(5 + index)),
  pauseNextCycle: index === 3,
  status: index === 3 ? "paused" : "active",
  terminatedAt: null,
  createdAt: iso(daysAgo(210 - index * 12)),
  updatedAt: iso(daysAgo(index + 1)),
}));

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function installMocks(page) {
  await page.addInitScript(
    ({ merchantId }) => {
      const payload = window.btoa(
        JSON.stringify({
          userId: 1,
          email: "shot@example.invalid",
          merchantId,
          role: "owner",
        }),
      );
      localStorage.setItem("authToken", `shot.${payload}.dummy`);
      localStorage.setItem("merchantId", String(merchantId));
      localStorage.setItem("taptMode", "property");
    },
    { merchantId: MERCHANT_ID },
  );

  await page.route("**/api/auth/me", (route) =>
    json(route, {
      user: {
        id: 1,
        email: "shot@example.invalid",
        merchantId: MERCHANT_ID,
        role: "owner",
        onboardingCompleted: true,
      },
    }),
  );
  await page.route("**/api/tutorial/state", (route) =>
    json(route, {
      generation: 1,
      autoEnabled: false,
      pageCount: 20,
      progress: {},
    }),
  );
  await page.route("**/api/tutorial/**", (route) => json(route, {}));
  await page.route("**/api/property/tenants", (route) => json(route, TENANTS));
  await page.route("**/api/property/invoices", (route) => json(route, INVOICES));
  await page.route("**/api/property/schedules", (route) =>
    json(route, SCHEDULES),
  );
  await page.route(`**/api/merchants/${MERCHANT_ID}/**`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (route) =>
    json(route, {
      id: MERCHANT_ID,
      businessName: "Wallace Property",
      status: "active",
      gstRegistered: true,
      gstNumber: "123-456-789",
      paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}`,
    }),
  );
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (route) =>
    json(route, {
      id: MERCHANT_ID,
      businessName: "Wallace Property",
      status: "active",
      gstRegistered: true,
      gstNumber: "123-456-789",
      paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}`,
    }),
  );
}

async function shoot(browser, label, contextOptions) {
  const context = await browser.newContext({
    ...contextOptions,
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) =>
    errors.push(`${label} page: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`${label} console: ${message.text()}`);
    }
  });
  await installMocks(page);

  await page.goto(`${BASE_URL}/property/analytics`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForTimeout(800);

  const shot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
  };

  await page.getByRole("tab", { name: "Year", exact: true }).click();
  await shot("1-overview-year");
  await page.getByRole("tab", { name: "Week", exact: true }).click();
  await shot("2-overview-week");

  await page
    .getByRole("button", { name: /all properties scope/i })
    .click();
  await shot("3-scope-open");
  await page
    .getByRole("option", { name: "12 Kauri Road", exact: true })
    .click();
  await shot("4-scope-kauri");
  await page.getByRole("button", { name: /scope/i }).click();
  await page
    .getByRole("option", { name: "all properties", exact: true })
    .click();

  /* Drag the handle rather than only toggling it, exercising pointer scaling
     in both the framed desktop canvas and full-bleed touch-tablet canvas. */
  const handle = page
    .getByRole("button", { name: /expand payment history/i })
    .first();
  const box = await handle.boundingBox();
  if (!box) throw new Error(`${label}: payment-history handle has no box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 320, { steps: 18 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: /collapse payment history/i })
    .waitFor({ state: "visible" });
  await shot("5-sheet-open");

  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await shot("6-report-tiles");

  await page
    .getByRole("button", { name: /Collection Statement/ })
    .click();
  await page
    .getByRole("button", { name: "This month", exact: true })
    .click();
  await page
    .getByRole("button", { name: "12 Kauri Road", exact: true })
    .click();
  await shot("7-collection-filters");
  await page
    .getByRole("button", { name: "Generate Report", exact: true })
    .click();
  await shot("8-collection-donut");

  /* Generated reports close the sheet and park its contents back on the tile
     grid, so opening the sheet again goes directly to the next report. */
  await page
    .getByRole("button", { name: /expand payment history/i })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Aged Arrears/ })
    .click();
  await page
    .getByRole("button", { name: "Generate Report", exact: true })
    .click();
  await shot("9-aged-arrears-bars");

  await context.close();
  return errors;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const desktopErrors = await shoot(browser, "desktop", {
    viewport: { width: 1440, height: 900 },
  });
  const tabletErrors = await shoot(browser, "tablet", {
    viewport: { width: 1194, height: 834 },
    hasTouch: true,
  });
  await browser.close();

  const errors = [...desktopErrors, ...tabletErrors];
  if (errors.length > 0) {
    throw new Error(`PAGE ERRORS:\n${errors.join("\n")}`);
  }
  console.log("no page errors");
  console.log(
    `${TENANTS.length} tenants · ${INVOICES.length} invoices · ${SCHEDULES.length} schedules · shots → ${OUT}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
