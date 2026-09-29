import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  BASE_URL,
  CHROMIUM_PATH,
  MERCHANT_ID,
  newRetailPage,
} from "./desktop-shots/retail-fixtures.mjs";

const OUT = "/tmp/taptpay-mobile-retail-regression";
const PHONE_SCREENSHOT = join(OUT, "terminal-390x844.png");
const BOARD_LINK_SCREENSHOT = join(OUT, "board-link-390x844.png");
const BOARD = {
  id: 41,
  merchantId: MERCHANT_ID,
  name: "counter board",
  stoneNumber: 1,
  paymentUrl: `${new URL(BASE_URL).origin}/pay/${MERCHANT_ID}/stone/41`,
  qrCodeUrl: `${new URL(BASE_URL).origin}/api/merchants/${MERCHANT_ID}/stone/41/qr`,
  isActive: true,
};

const fulfillJson = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

const uniqueSourcePaths = (requests) => [
  ...new Set(
    requests
      .filter((request) => request.resourceType() === "script")
      .map((request) => {
        try {
          return decodeURIComponent(new URL(request.url()).pathname);
        } catch {
          return request.url();
        }
      }),
  ),
].sort();

const withTimeout = (promise, label, timeoutMs = 5_000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`${label} did not complete within ${timeoutMs}ms`)),
        timeoutMs,
      );
      timeout.unref?.();
    }),
  ]);

async function hasBottomNavigation(page) {
  return page.evaluate(() => {
    const terminalButtons = Array.from(
      document.querySelectorAll('button[aria-label="terminal"]'),
    );
    return terminalButtons.some((button) => {
      let node = button;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (style.position === "fixed" && Number.parseFloat(style.bottom) === 0) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    });
  });
}

async function main() {
  await access(CHROMIUM_PATH, constants.X_OK);
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  const { context, page, errors } = await newRetailPage(browser, "phone", {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const requests = [];
  page.on("request", (request) => requests.push(request));

  let resolveCreateBody;
  const createBodyPromise = new Promise((resolve) => {
    resolveCreateBody = resolve;
  });

  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__taptpayCopiedPaymentLink = value;
          },
        },
      });
    });

    // These overrides are registered after the shared retail harness, so they
    // specialize its broad merchant mocks for the legacy phone board flow.
    await page.route(`**/api/merchants/${MERCHANT_ID}/tapt-stones`, (route) =>
      fulfillJson(route, [BOARD]),
    );
    await page.route(`**/api/merchants/${MERCHANT_ID}/active-transaction`, (route) =>
      fulfillJson(route, null),
    );
    await page.route(`**/api/merchants/${MERCHANT_ID}/stone/${BOARD.id}/qr**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><path d="M1 1h3v3H1zm5 0h3v3H6zM1 6h3v3H1zm5 0h1v1H6zm2 0h1v3H8zM6 8h1v1H6z" fill="#040D6D"/></svg>',
      }),
    );
    await page.route("**/api/transactions", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = route.request().postDataJSON();
      resolveCreateBody(body);
      return fulfillJson(route, {
        id: 9_101,
        merchantId: MERCHANT_ID,
        itemName: body.itemName,
        price: body.price,
        status: "pending",
        taptStoneId: body.selectedStoneId ?? null,
        splitEnabled: body.splitEnabled ?? false,
        createdAt: new Date().toISOString(),
      });
    });

    await page.goto(`${BASE_URL}/terminal`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-viewport").waitFor({ state: "visible" });
    // Cover the delayed route preloader: a device-gating regression can request
    // desktop modules after the correct phone component initially appears.
    await page.waitForTimeout(1_600);

    assert.equal(
      await page.getByTestId("desktop-frame").count(),
      0,
      "390px phone rendered the desktop frame",
    );
    assert.equal(
      await page.getByTestId("desktop-scaled-canvas").count(),
      0,
      "390px phone rendered the desktop scaled canvas",
    );
    assert.equal(
      await hasBottomNavigation(page),
      true,
      "390px phone did not render the existing BottomNavigation",
    );

    const layout = await page.locator(".tp-viewport").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
      };
    });
    assert.deepEqual(
      layout,
      { width: 390, height: 844, left: 0, right: 390, scrollWidth: 390 },
      "legacy mobile terminal no longer fills the 390x844 viewport cleanly",
    );
    await page.getByRole("button", { name: "paywave", exact: true }).waitFor();
    await page.getByRole("button", { name: "boards", exact: true }).waitFor();
    await page.locator(".tp-stack-title", { hasText: "active stack" }).waitFor();
    await page.getByRole("button", { name: "add item", exact: true }).waitFor();

    await page.screenshot({ path: PHONE_SCREENSHOT, fullPage: true });

    // Select the existing board through the unchanged phone modal. The phone must
    // continue using that board's shared URL and must not opt into per-sale links.
    await page.getByRole("button", { name: "boards", exact: true }).click();
    const boardChoice = page.getByRole("button", {
      name: `${BOARD.name} — Stone ${BOARD.stoneNumber}`,
      exact: true,
    });
    await boardChoice.waitFor();
    await boardChoice.click();

    await page.getByRole("button", { name: "add item", exact: true }).click();
    await page.waitForTimeout(700);
    for (const digit of ["1", "2", "3", "4"]) {
      await page.getByRole("button", { name: digit, exact: true }).click();
    }
    await page.locator('.tp-layer:not(.leaving) button[aria-label="commit"]').click();
    await page.getByPlaceholder("item name").waitFor();
    await page.getByPlaceholder("item name").fill("phone regression sale");
    await page.locator('.tp-layer:not(.leaving) button[aria-label="commit"]').click();
    await page.getByRole("button", { name: "send", exact: true }).waitFor();
    await page.getByRole("button", { name: "send", exact: true }).click();

    const createBody = await withTimeout(createBodyPromise, "legacy transaction POST");
    assert.deepEqual(
      createBody,
      {
        merchantId: MERCHANT_ID,
        itemName: "phone regression sale",
        price: "12.34",
        status: "pending",
        selectedStoneId: BOARD.id,
        splitEnabled: false,
      },
      "phone transaction request body changed from the legacy contract",
    );
    assert.equal("linkMode" in createBody, false, "phone opted into per-payment mode");
    assert.equal("taptStoneId" in createBody, false, "phone sent the internal board field");

    await page.getByRole("button", { name: "share", exact: true }).click();
    await page.getByRole("button", { name: "copy link", exact: true }).waitFor();
    await page.getByRole("button", { name: "copy link", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.__taptpayCopiedPaymentLink),
      BOARD.paymentUrl,
      "phone no longer shares the selected board's legacy link",
    );
    await page.getByRole("button", { name: "expand QR code", exact: true }).click();
    await page.getByText(BOARD.paymentUrl, { exact: true }).waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: BOARD_LINK_SCREENSHOT, fullPage: true });

    const sourcePaths = uniqueSourcePaths(requests);
    assert.ok(
      sourcePaths.includes("/src/pages/merchant-terminal-mobile-v2.tsx"),
      "phone did not request the existing mobile retail terminal module",
    );
    const desktopSources = sourcePaths.filter((path) => path.startsWith("/src/desktop/"));
    assert.deepEqual(
      desktopSources,
      [],
      `phone requested desktop modules:\n${desktopSources.join("\n")}`,
    );

    await page.waitForTimeout(250);
    assert.deepEqual(errors, [], `phone page/console errors:\n${errors.join("\n")}`);

    console.log("Mobile retail regression verification passed.");
    console.log(`Screenshot: ${PHONE_SCREENSHOT}`);
    console.log(`Board-link screenshot: ${BOARD_LINK_SCREENSHOT}`);
    console.log(JSON.stringify({
      viewport: layout,
      component: "/src/pages/merchant-terminal-mobile-v2.tsx",
      desktopSourceModuleCount: desktopSources.length,
      transactionBody: createBody,
      boardLink: BOARD.paymentUrl,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
