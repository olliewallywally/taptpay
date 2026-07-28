/* Screenshot and exercise Trades Home (3a) at desktop and touch-tablet sizes.
   Fixtures intentionally use the raw GET /api/trades/* row shapes: the page,
   rather than this harness, owns all joins and dashboard aggregation. */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const OUT = "/tmp/taptpay-desktop-3a";
const MERCHANT_ID = 999999;

/* Freeze the browser at Tuesday 28 July 2026, noon in Auckland. This keeps
   calendar buckets, due labels, expiry checks and screenshots deterministic. */
const FIXED_NOW = "2026-07-28T00:00:00.000Z";
const FIXED_NOW_MS = Date.parse(FIXED_NOW);
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const localIso = (dayOffset, localHour = 10) =>
  new Date(FIXED_NOW_MS + dayOffset * DAY + (localHour - 12) * HOUR).toISOString();
const ago = (days, localHour = 10) => localIso(-days, localHour);
const ahead = (days, localHour = 10) => localIso(days, localHour);

const C = {
  mike: "00000000-0000-4000-8000-000000000001",
  sarah: "00000000-0000-4000-8000-000000000002",
  lisa: "00000000-0000-4000-8000-000000000003",
  dave: "00000000-0000-4000-8000-000000000004",
  archived: "00000000-0000-4000-8000-000000000005",
  prospect: "00000000-0000-4000-8000-000000000006",
};

const SITE = {
  queen: "14 Queen Street, Auckland",
  kauri: "8 Kauri Grove, Auckland",
  rata: "21 Rata Street, Auckland",
  harbour: "90 Harbour Road, Auckland",
  archived: "6 Archive Lane, Auckland",
  prospect: "Hidden Prospect Site, Auckland",
};

const client = (id, firstName, lastName, siteAddress, status, extra = {}) => ({
  id,
  merchantId: MERCHANT_ID,
  firstName,
  lastName,
  email: `${firstName.toLowerCase()}@example.invalid`,
  phone: "0210000000",
  siteAddress,
  notes: null,
  preferredChannel: "email",
  status,
  archivedAt: status === "archived" ? ago(20) : null,
  createdAt: ago(120),
  updatedAt: ago(2),
  ...extra,
});

const CLIENTS = [
  client(C.mike, "Mike", "Thompson", SITE.queen, "active"),
  client(C.sarah, "Sarah", "Chen", SITE.kauri, "active"),
  client(C.lisa, "Lisa", "Nu", SITE.rata, "active"),
  client(C.dave, "Dave", "Kerr", SITE.harbour, "active"),
  client(C.archived, "Alice", "Archived", SITE.archived, "archived"),
  client(C.prospect, "Priya", "Prospect", SITE.prospect, "prospect"),
];

const Q = {
  sent: "10000000-0000-4000-8000-000000000001",
  viewed: "10000000-0000-4000-8000-000000000002",
  accepted: "10000000-0000-4000-8000-000000000003",
  expiredByDate: "10000000-0000-4000-8000-000000000004",
  expiredStatus: "10000000-0000-4000-8000-000000000005",
};

const quote = ({
  id,
  clientProfileId,
  status,
  totalCents,
  validUntil,
  depositEnabled = false,
  depositCents = null,
  createdAt = ago(5),
}) => ({
  id,
  merchantId: MERCHANT_ID,
  clientProfileId,
  token: `quote-${id.slice(-4)}`,
  status,
  lineItems: [
    {
      description: "Electrical work",
      qty: 1,
      unitPriceCents: totalCents,
      lineTotalCents: totalCents,
    },
  ],
  subtotalCents: totalCents,
  gstCents: 0,
  gstMode: null,
  totalCents,
  depositEnabled,
  depositType: depositEnabled ? "percent" : null,
  depositValue: depositEnabled ? 20 : null,
  depositCents,
  deliveryChannel: "email",
  validUntil,
  notes: null,
  documentUrl: null,
  documentName: null,
  sentAt: createdAt,
  viewedAt: status === "viewed" ? ago(1) : null,
  acceptedAt: status === "accepted" ? ago(8) : null,
  declinedAt: null,
  createdAt,
  updatedAt: createdAt,
});

const QUOTES = [
  /* Both of these count as awaiting reply. */
  quote({
    id: Q.sent,
    clientProfileId: C.lisa,
    status: "sent",
    totalCents: 86000,
    validUntil: ahead(10),
  }),
  quote({
    id: Q.viewed,
    clientProfileId: C.sarah,
    status: "viewed",
    totalCents: 216200,
    validUntil: ahead(12),
    depositEnabled: true,
    depositCents: 43240,
  }),
  quote({
    id: Q.accepted,
    clientProfileId: C.mike,
    status: "accepted",
    totalCents: 312000,
    validUntil: ahead(20),
    depositEnabled: true,
    depositCents: 62400,
    createdAt: ago(10),
  }),
  /* Sent/viewed is insufficient when the validity date has passed. */
  quote({
    id: Q.expiredByDate,
    clientProfileId: C.dave,
    status: "sent",
    totalCents: 240000,
    validUntil: ago(1),
    createdAt: ago(12),
  }),
  quote({
    id: Q.expiredStatus,
    clientProfileId: C.lisa,
    status: "expired",
    totalCents: 99000,
    validUntil: ahead(3),
    createdAt: ago(14),
  }),
];

const invoice = ({
  id,
  clientProfileId,
  amountCents,
  kind = "full",
  status,
  dueAt,
  paidAt = null,
  quoteId = null,
  createdAt = ago(6),
}) => ({
  id,
  merchantId: MERCHANT_ID,
  clientProfileId,
  quoteId,
  scheduleId: null,
  kind,
  amountCents,
  token: `invoice-${id}`,
  deliveryChannel: "email",
  jobDetails: "Fixture job",
  status,
  dueAt,
  dispatchedAt: createdAt,
  sentAt: createdAt,
  viewedAt: ["viewed", "balance_due"].includes(status) ? createdAt : null,
  paidAt,
  voidedAt: status === "voided" ? ago(1) : null,
  completedAt: null,
  externalPaymentReference: status === "paid_external" ? "BANK-001" : null,
  lastReminderSentAt: null,
  scheduledSendAt: null,
  reminderCount: 0,
  documentUrl: null,
  documentName: null,
  windcaveSessionId: null,
  windcaveTransactionId: null,
  splitEnabled: false,
  splitCount: null,
  splitPaidCount: 0,
  splitPaidSessions: null,
  createdAt,
  updatedAt: paidAt ?? createdAt,
});

const INVOICES = [
  /* Current-week revenue: both real paid states must aggregate by paidAt. */
  invoice({
    id: "paid-mike",
    clientProfileId: C.mike,
    amountCents: 124000,
    status: "paid",
    dueAt: ago(2),
    paidAt: ago(1),
    quoteId: Q.accepted,
    createdAt: ago(4),
  }),
  invoice({
    id: "paid-external-sarah",
    clientProfileId: C.sarah,
    amountCents: 216200,
    status: "paid_external",
    dueAt: ago(1),
    paidAt: ago(0, 9),
    createdAt: ago(3),
  }),
  /* Prior week/month baselines make every range state visibly meaningful. */
  invoice({
    id: "paid-lisa-prior-week",
    clientProfileId: C.lisa,
    amountCents: 86000,
    status: "paid",
    dueAt: ago(9),
    paidAt: ago(7),
    createdAt: ago(12),
  }),
  invoice({
    id: "paid-dave-earlier-month",
    clientProfileId: C.dave,
    amountCents: 175000,
    status: "paid",
    dueAt: ago(17),
    paidAt: ago(15),
    createdAt: ago(20),
  }),
  invoice({
    id: "paid-mike-prior-month",
    clientProfileId: C.mike,
    amountCents: 150000,
    status: "paid",
    dueAt: "2026-06-18T22:00:00.000Z",
    paidAt: "2026-06-20T22:00:00.000Z",
    createdAt: "2026-06-15T22:00:00.000Z",
  }),

  /* Business health: status balance_due is overdue even before its due date. */
  invoice({
    id: "balance-due-mike",
    clientProfileId: C.mike,
    amountCents: 188000,
    kind: "balance",
    status: "balance_due",
    dueAt: ahead(3),
    quoteId: Q.accepted,
    createdAt: ago(2),
  }),
  /* An otherwise-open invoice is overdue solely because dueAt is in the past. */
  invoice({
    id: "date-overdue-dave",
    clientProfileId: C.dave,
    amountCents: 240000,
    status: "viewed",
    dueAt: ago(4),
    createdAt: ago(9),
  }),
  /* Open deposit, but still within terms: awaiting deposit, not overdue. */
  invoice({
    id: "awaiting-deposit-sarah",
    clientProfileId: C.sarah,
    amountCents: 62400,
    kind: "deposit",
    status: "dispatched",
    dueAt: ahead(6),
    quoteId: Q.accepted,
    createdAt: ago(1),
  }),
  /* Closed rows prove health calculations exclude them. */
  invoice({
    id: "voided-deposit-lisa",
    clientProfileId: C.lisa,
    amountCents: 50000,
    kind: "deposit",
    status: "voided",
    dueAt: ago(2),
    createdAt: ago(8),
  }),
];

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function installMocks(page) {
  await page.addInitScript(
    ({ merchantId, fixedNow }) => {
      const NativeDate = Date;
      const fixedMs = NativeDate.parse(fixedNow);
      class FixedDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedMs]));
        }
        static now() {
          return fixedMs;
        }
      }
      window.Date = FixedDate;

      const payload = window.btoa(
        JSON.stringify({
          userId: 1,
          email: "shot@example.invalid",
          merchantId,
          role: "merchant",
        }),
      );
      localStorage.setItem("authToken", `shot.${payload}.dummy`);
      localStorage.setItem("merchantId", String(merchantId));
      localStorage.setItem("taptMode", "trades");
    },
    { merchantId: MERCHANT_ID, fixedNow: FIXED_NOW },
  );

  await page.route("**/api/auth/me", (route) =>
    json(route, {
      user: {
        id: 1,
        email: "shot@example.invalid",
        merchantId: MERCHANT_ID,
        role: "merchant",
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
  await page.route("**/api/trades/clients", (route) => json(route, CLIENTS));
  await page.route("**/api/trades/invoices", (route) => json(route, INVOICES));
  await page.route("**/api/trades/quotes", (route) => json(route, QUOTES));
  await page.route(`**/api/merchants/${MERCHANT_ID}/**`, (route) => json(route, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (route) =>
    json(route, {
      id: MERCHANT_ID,
      name: "Wallace Electrical",
      businessName: "Wallace Electrical",
      status: "active",
      gstRegistered: true,
      tradeGstMode: "inclusive",
    }),
  );
}

async function assertVisible(locator, description) {
  await locator.waitFor({ state: "visible" });
  if (!(await locator.isVisible())) {
    throw new Error(`Expected ${description} to be visible`);
  }
}

async function assertAbsent(locator, description) {
  if ((await locator.count()) !== 0) {
    throw new Error(`Expected ${description} to be absent`);
  }
}

async function shoot(browser, label, contextOptions) {
  const context = await browser.newContext({
    ...contextOptions,
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    timezoneId: "Pacific/Auckland",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`${label} page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`${label} console: ${message.text()}`);
    }
  });

  try {
    await installMocks(page);
    await page.goto(`${BASE_URL}/trades`, { waitUntil: "networkidle" });
    await page.getByTestId("desktop-frame").waitFor({ state: "visible" });

    const health = page.locator('[data-tutorial-id="trades-home-health"]');
    const notifications = page.locator(
      '[data-tutorial-id="trades-home-notifications"]',
    );
    const actions = page.locator('[data-tutorial-id="trades-home-actions"]');

    await assertVisible(health, "Trades business-health tutorial anchor");
    await assertVisible(notifications, "Trades notifications tutorial anchor");
    await assertVisible(actions, "Trades quick-actions tutorial anchor");
    await assertVisible(
      page.getByRole("button", { name: "new quote", exact: true }),
      "new quote quick action",
    );
    await assertVisible(
      page.getByRole("button", { name: "quick invoice", exact: true }),
      "quick invoice quick action",
    );
    await assertVisible(
      page.getByRole("button", { name: "recurring jobs", exact: true }),
      "recurring jobs quick action",
    );
    await assertAbsent(
      page.getByRole("button", { name: "view Alice Archived", exact: true }),
      "archived client in the home list",
    );
    await assertAbsent(
      page.getByRole("button", { name: "view Priya Prospect", exact: true }),
      "hidden prospect in the home list",
    );

    const screenshot = async (name) => {
      /* Longest page transition is 550ms; wait past it before capturing. */
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    };

    await screenshot("1-default");

    await page.getByRole("button", { name: "Month", exact: true }).click();
    await screenshot("2-range-month");

    const allSites = page.getByRole("button", {
      name: "all sites scope",
      exact: true,
    });
    await allSites.click();
    await assertAbsent(
      page.getByRole("option", { name: SITE.archived, exact: true }),
      "archived-only site in the scope menu",
    );
    await assertAbsent(
      page.getByRole("option", { name: SITE.prospect, exact: true }),
      "prospect-only site in the scope menu",
    );
    await screenshot("3-scope-open");

    await page.getByRole("option", { name: SITE.queen, exact: true }).click();
    await screenshot("4-scope-filtered");

    /* Restore all data, then select a chart bar through its stable accessible
       "<bucket> $<amount>" name rather than implementation-specific CSS. */
    await page
      .getByRole("button", { name: `${SITE.queen} scope`, exact: true })
      .click();
    await page.getByRole("option", { name: "all sites", exact: true }).click();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await page
      .getByRole("button", { name: /^[MTWFS] \$[\d,]+$/ })
      .first()
      .click();
    await screenshot("5-bar-drilldown");

    const healthStates = [
      ["overdue invoices", "6-health-overdue"],
      ["awaiting deposit", "7-health-deposit"],
      ["quotes awaiting reply", "8-health-quotes"],
    ];
    for (const [healthLabel, shotName] of healthStates) {
      await health
        .getByRole("button", {
          name: `view ${healthLabel}`,
          exact: true,
        })
        .click();
      await screenshot(shotName);
      await health
        .getByRole("button", {
          name: "close business health detail",
          exact: true,
        })
        .click();
      await page.waitForTimeout(350);
    }

    await notifications
      .getByRole("button", { name: "open notifications", exact: true })
      .click();
    await screenshot("9-notifications-expanded");
    await notifications
      .getByRole("button", { name: "close notifications", exact: true })
      .click();

    const search = page.getByRole("textbox", {
      name: "search clients or site",
      exact: true,
    });
    await search.fill("Sarah");
    await assertVisible(
      page.getByRole("button", { name: "view Sarah Chen", exact: true }),
      "matching active client after search",
    );
    await assertAbsent(
      page.getByRole("button", { name: "view Mike Thompson", exact: true }),
      "non-matching client after search",
    );
    await screenshot("10-search");

    if (errors.length) {
      throw new Error(`PAGE ERRORS:\n${errors.join("\n")}`);
    }
    return errors;
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  try {
    const desktopErrors = await shoot(browser, "desktop", {
      viewport: { width: 1440, height: 900 },
    });
    const tabletErrors = await shoot(browser, "tablet", {
      viewport: { width: 1194, height: 834 },
      hasTouch: true,
    });
    const errors = [...desktopErrors, ...tabletErrors];
    if (errors.length) {
      throw new Error(`PAGE ERRORS:\n${errors.join("\n")}`);
    }
    console.log("no page errors");
    console.log(`shots → ${OUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
