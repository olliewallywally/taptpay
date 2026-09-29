/* Retail stock (4b): catalogue, filtering/sorting, add and edit sheets. */
import { mkdir } from "node:fs/promises";
import {
  BASE_URL,
  newRetailPage,
  runRetailShots,
} from "./retail-fixtures.mjs";

const OUT = "/tmp/taptpay-desktop-4b";

async function shoot(browser, label, contextOptions) {
  const { context, page, errors } = await newRetailPage(browser, label, contextOptions);
  try {
    await page.goto(`${BASE_URL}/stock`, { waitUntil: "networkidle" });
    await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
    await page.waitForTimeout(700);

    const shot = async (name) => {
      await page.waitForTimeout(420);
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    };

    await shot("1-stock");
    await page.getByLabel("search inventory").fill("coffee");
    await shot("2-search-empty");
    await page.getByLabel("search inventory").fill("");
    await page.getByRole("button", { name: "price ↓", exact: true }).click();
    await shot("3-price-sort");

    await page.getByRole("button", { name: "add product", exact: true }).click();
    await shot("4-add-empty");
    await page.getByLabel("name").fill("long black");
    await page.getByLabel("price").fill("4.50");
    await page.getByLabel("description optional").fill("double shot");
    await shot("5-add-valid");
    await page.getByRole("button", { name: "cancel", exact: true }).click();

    await page.getByRole("button", { name: /flat white/i }).click();
    await shot("6-edit-product");
  } finally {
    await context.close();
  }
  return errors;
}

await mkdir(OUT, { recursive: true });
await runRetailShots(shoot);
console.log(`shots → ${OUT}`);
