/* Screenshot the desktop settings screen in its trades flavour (3e). The page
   itself is the shared DesktopSettingsPage, already exercised by 2e/4e, so this
   checks the one thing 3e owns: trades branding and the switcher state. */
import { mkdir } from "node:fs/promises";
import {
  BASE_URL,
  assertVisible,
  json,
  newTradesPage,
  runTradesShots,
} from "./trades-fixtures.mjs";

const OUT = "/tmp/taptpay-desktop-3e";

const SUBSCRIPTION = {
  subscription: {
    tier: "paid",
    status: "active",
    billingFrequency: "monthly",
    nextBillingDate: new Date(Date.now() + 4 * 24 * 3600_000).toISOString(),
    unbilledTransactionCount: 128,
    unbilledAmount: "12.80",
  },
};

async function shoot(browser, label, contextOptions) {
  const { context, page, errors } = await newTradesPage(browser, label, contextOptions);

  /* Settings-only endpoints the shared trades fixtures do not carry. */
  await page.route("**/api/subscription", (route) => json(route, SUBSCRIPTION));
  await page.route("**/api/billing/card", (route) =>
    json(route, { card: { brand: "visa", last4: "4242", expMonth: 4, expYear: 2029 } }),
  );
  await page.route("**/api/push/capabilities", (route) =>
    json(route, { webPush: { available: true }, nativePush: { available: false } }),
  );
  await page.route("**/api/push/status", (route) => json(route, { subscribed: false }));
  /* Owner-only queries. They are gated behind `isOwner`, so before the fixtures
     were corrected to a real `owner` role they never fired and never needed
     mocking; with the role fixed they run and 403 against the dev server. */
  await page.route("**/api/subscription/billing-history**", (route) => json(route, { history: [] }));
  await page.route("**/api/team", (route) =>
    json(route, { members: [], seatLimit: 1, seatsInUse: 1 }),
  );
  await page.route("**/api/push/preferences", (route) => json(route, {
    preferences: { paymentReceived: true, dailyPayoutSummary: true, failedPaymentAlerts: false },
  }));

  try {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
    await page.getByTestId("desktop-frame").waitFor({ state: "visible" });

    const screenshot = async (name) => {
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    };

    /* Trades is the current vertical, so its switcher tile is the pressed one. */
    const tradesTile = page.getByRole("button", { name: /trades/i }).first();
    await assertVisible(tradesTile, "trades mode tile");
    if ((await tradesTile.getAttribute("aria-pressed")) !== "true") {
      throw new Error("Expected the trades tile to be the active vertical");
    }
    /* The section heading, addressed as the control it is. `getByText` matched
       case-insensitively on a *substring*, so it also hit the non-owner notice
       "Business details are managed by the account owner." and tripped strict
       mode — which is how the invalid `role: "merchant"` fixture was found. */
    await assertVisible(
      page.getByRole("button", { name: "Business Details", exact: true }),
      "business details section",
    );
    await screenshot("1-settings-trades");

    await page.getByRole("button", { name: "Subscription & Billing" }).click();
    await screenshot("2-billing");

    await page.getByRole("button", { name: "Transaction Notifications" }).click();
    await screenshot("3-notifications");

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
  await runTradesShots(shoot);
  console.log(`shots → ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
