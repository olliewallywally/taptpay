/* Retail home (4a): range, chart, health, notifications, search and empty state. */
import { mkdir } from "node:fs/promises";
import {
  BASE_URL,
  newRetailPage,
  runRetailShots,
} from "./retail-fixtures.mjs";

const OUT = "/tmp/taptpay-desktop-4a";

async function shoot(browser, label, contextOptions) {
  const { context, page, errors } = await newRetailPage(browser, label, contextOptions);
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
    await page.waitForTimeout(700);

    const shot = async (name) => {
      await page.waitForTimeout(420);
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    };

    await shot("1-home-week");
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await shot("2-home-month");
    await page.locator(".rh-bar-btn").first().click();
    await shot("3-bar-detail");

    await page.locator(".rh-health .rh-stat").first().click();
    await shot("4-health-awaiting");
    await page.getByRole("button", { name: "close", exact: true }).click();

    await page.locator(".rh-notif-prev").click();
    await shot("5-notifications");

    await page.getByLabel("search sales").fill("does not exist");
    await page.getByText("no matching sales", { exact: true }).waitFor();
    await shot("6-search-empty");
  } finally {
    await context.close();
  }
  return errors;
}

await mkdir(OUT, { recursive: true });
await runRetailShots(shoot);
console.log(`shots → ${OUT}`);
