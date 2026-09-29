/* Screenshot and exercise the desktop Trades analytics screen (3d): the range
   segments, the site scope, the draggable payment-history sheet, and all four
   reports through tiles → filters → in-page report — desktop + touch tablet. */
import { mkdir } from "node:fs/promises";
import {
  BASE_URL,
  SITE,
  assertVisible,
  newTradesPage,
  runTradesShots,
} from "./trades-fixtures.mjs";

const OUT = "/tmp/taptpay-desktop-3d";

const REPORTS = [
  ["Invoice Summary", "invoice-summary"],
  ["Quote Conversion", "quote-conversion"],
  ["Aged Receivables", "aged-receivables"],
  ["Client Statement", "client-statement"],
];

async function shoot(browser, label, contextOptions) {
  const { context, page, errors } = await newTradesPage(browser, label, contextOptions);

  try {
    await page.goto(`${BASE_URL}/trades/analytics`, { waitUntil: "networkidle" });
    await page.getByTestId("desktop-frame").waitFor({ state: "visible" });

    const screenshot = async (name) => {
      /* Sheet transition is 500ms; wait past it before capturing. */
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    };

    await assertVisible(page.getByText("total revenue"), "revenue hero");
    await assertVisible(page.getByText("outstanding invoices"), "outstanding hero");
    await assertVisible(page.getByText("Payment History"), "sheet title");
    await screenshot("1-overview-year");

    await page.getByRole("tab", { name: "Month", exact: true }).click();
    await screenshot("2-overview-month");
    await page.getByRole("tab", { name: "Week", exact: true }).click();
    await screenshot("3-overview-week");
    await page.getByRole("tab", { name: "Year", exact: true }).click();

    /* site scope */
    await page.getByRole("button", { name: /all sites scope/i }).click();
    await screenshot("4-scope-open");
    await page.getByRole("option", { name: SITE.queen, exact: true }).click();
    await screenshot("5-scoped");
    await page.getByRole("button", { name: /scope/i }).click();
    await page.getByRole("option", { name: "all sites", exact: true }).click();

    /* the sheet opens from its grab handle */
    await page.getByRole("button", { name: /expand payment history/i }).click();
    await assertVisible(
      page.getByRole("button", { name: "Reports", exact: true }),
      "reports button on the open sheet",
    );
    await screenshot("6-history-open");

    /* every report: tile → filters → generated report.
       Generating closes the sheet and leaves it on the tile grid, so each pass
       reopens it and only clicks "Reports" when the head still offers it. */
    /* The header nav also exposes an "analytics" button, so the report's back
       button is addressed through the page body. */
    const back = page.locator(".ta-back");

    const openTiles = async () => {
      const expand = page.getByRole("button", { name: /expand payment history/i });
      if (await expand.count()) {
        await expand.click();
        await page.waitForTimeout(600);
      }
      const reports = page.getByRole("button", { name: "Reports", exact: true });
      if (await reports.count()) {
        await reports.click();
        await page.waitForTimeout(400);
      }
    };

    await openTiles();
    await screenshot("7-report-tiles");

    for (const [title, id] of REPORTS) {
      await openTiles();
      await page.getByRole("button", { name: new RegExp(title) }).click();
      await screenshot(`8-${id}-filters`);
      await page.getByRole("button", { name: "Generate Report", exact: true }).click();
      await assertVisible(back, `back button on ${title}`);
      await screenshot(`9-${id}`);
      await back.click();
      await page.waitForTimeout(300);
    }

    /* export modal — the shared ReportModal, offering the four real trades PDFs */
    await openTiles();
    await page.getByRole("button", { name: /Payment History/ }).click();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await assertVisible(page.getByText("Trades Reports"), "export modal");
    await screenshot("10-export-modal");

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
