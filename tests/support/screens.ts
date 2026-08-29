/* Navigation for the terminal screens, lifted from
 * `scripts/verify-terminal-dock.mjs` (`walkRetailFeatureScreens`,
 * `walkSubbarScreens`) rather than rewritten — the dock gate already proved
 * these paths against the shipped app, and two probes disagreeing about how to
 * reach a screen is how a suite starts measuring different things.
 *
 * Extended past the dock gate's 11 screens to cover the rest of the §6.6.1
 * inventory. Every selector here is a `data-demo-id` or an `aria-label` that
 * exists in the source; nothing keys off visible copy, which §2.2 makes
 * immutable but which a translation would still move.
 */
import { expect, type Page } from "@playwright/test";
import { settle } from "./fixtures";

const CONVEYOR_MS = 700;

/** Both hero headers use the same two buttons; retail labels the tick
 *  `commit`, property and trades label it `confirm`. */
const commitButton = (page: Page) =>
  page.locator('.tp-layer:not(.leaving) button[aria-label="commit"], .tp-layer:not(.leaving) button[aria-label="confirm"]');

export async function tapSubbar(page: Page, vertical: string, slot: string) {
  const button = page.locator(`[data-demo-id="${vertical}-mode-${slot}"]`);
  await expect(button, `${vertical} subbar slot "${slot}"`).toHaveCount(1);
  await button.click();
  await page.waitForTimeout(CONVEYOR_MS);
  await settle(page);
}

export async function tapFab(page: Page) {
  await page.locator(".tp-pfab button").click();
  await page.waitForTimeout(CONVEYOR_MS);
  await settle(page);
}

export async function commit(page: Page) {
  await commitButton(page).click();
  await page.waitForTimeout(CONVEYOR_MS);
  await settle(page);
}

export async function cancel(page: Page) {
  await page
    .locator('.tp-layer:not(.leaving) button[aria-label="cancel"]')
    .first()
    .click();
  await page.waitForTimeout(CONVEYOR_MS);
  await settle(page);
}

/** Retail's keypad keys carry no demo id; they are plain digit buttons. The
 *  property and trades keypads do (`property-key-4` / `trades-key-4`). */
export async function pressKeys(page: Page, vertical: string, digits: string) {
  for (const digit of digits) {
    const scoped = page.locator(`[data-demo-id="${vertical}-key-${digit}"]`);
    if (await scoped.count()) {
      await scoped.first().click();
    } else {
      await page.getByRole("button", { name: digit, exact: true }).first().click();
    }
  }
  await settle(page);
}

/** The one screen id in the DOM that says which screen is showing. Everything
 *  here asserts on it before capturing, so a golden can never be silently taken
 *  of the previous screen because a click missed. */
export async function expectScreen(page: Page, selector: string, what: string) {
  await expect(
    page.locator(`.tp-layer:not(.leaving) ${selector}`).first(),
    `expected to be on ${what}`,
  ).toBeVisible();
}
