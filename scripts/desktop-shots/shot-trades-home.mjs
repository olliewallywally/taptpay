/* Screenshot and exercise Trades Home (3a) at desktop and touch-tablet sizes.
   Clients, quotes and invoices come from the shared trades fixtures so every
   trades screen is shot against the same data. */
import { mkdir } from "node:fs/promises";
import {
  BASE_URL,
  SITE,
  assertAbsent,
  assertVisible,
  newTradesPage,
  runTradesShots,
} from "./trades-fixtures.mjs";

const OUT = "/tmp/taptpay-desktop-3a";

async function shoot(browser, label, contextOptions) {
  const { context, page, errors } = await newTradesPage(browser, label, contextOptions);

  try {
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
  await runTradesShots(shoot);
  console.log(`shots → ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
