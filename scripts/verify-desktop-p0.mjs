import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.P0_BASE_URL ?? "http://127.0.0.1:5000";
const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const SCREENSHOT_DIR = "/tmp/taptpay-desktop-p0";
const MERCHANT_ID = 999999;
const PIXEL_TOLERANCE = 1.25;

const MOBILE_MERCHANT_SOURCE_PREFIXES = [
  "/src/pages/dashboard.tsx",
  "/src/pages/stock-management.tsx",
  "/src/pages/merchant-terminal-mobile-v2.tsx",
  "/src/pages/transactions.tsx",
  "/src/pages/settings.tsx",
  "/src/pages/property/",
  "/src/pages/trades/",
];

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function closeTo(actual, expected, tolerance = PIXEL_TOLERANCE) {
  return Math.abs(actual - expected) <= tolerance;
}

function assertClose(actual, expected, label, tolerance = PIXEL_TOLERANCE) {
  assert.ok(
    closeTo(actual, expected, tolerance),
    `${label}: expected ${expected.toFixed(3)} ±${tolerance}, received ${actual.toFixed(3)}`,
  );
}

function uniqueSourcePaths(requests) {
  return [
    ...new Set(
      requests
        .filter(({ resourceType }) => resourceType === "script")
        .map(({ url }) => {
          try {
            return decodeURIComponent(new URL(url).pathname);
          } catch {
            return url;
          }
        }),
    ),
  ].sort();
}

function matchingPaths(paths, prefixes) {
  return paths.filter((path) =>
    prefixes.some((prefix) => path.startsWith(prefix)),
  );
}

function assertDesktopSourceIsolation(paths, expectedPageModule, label) {
  assert.ok(
    paths.includes(expectedPageModule),
    `${label}: did not request ${expectedPageModule}`,
  );
  const mobileRequests = matchingPaths(paths, MOBILE_MERCHANT_SOURCE_PREFIXES);
  assert.deepEqual(
    mobileRequests,
    [],
    `${label}: requested mobile merchant modules:\n${mobileRequests.join("\n")}`,
  );
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installMocks(page, { tutorialGate = null, tutorialEnabled = false } = {}) {
  await page.addInitScript(({ merchantId }) => {
    const payload = window.btoa(
      JSON.stringify({
        userId: 1,
        email: "p0-browser@example.invalid",
        merchantId,
        role: "merchant",
      }),
    );
    localStorage.setItem("authToken", `p0.${payload}.dummy`);
    localStorage.setItem("merchantId", String(merchantId));
    localStorage.setItem("taptMode", "retail");
  }, { merchantId: MERCHANT_ID });

  await page.route("**/api/auth/me", (route) =>
    fulfillJson(route, {
      user: {
        id: 1,
        email: "p0-browser@example.invalid",
        merchantId: MERCHANT_ID,
        role: "merchant",
        onboardingCompleted: true,
        gstRegistered: false,
        tradeGstMode: "inclusive",
      },
    }),
  );

  await page.route("**/api/tutorial/state", async (route) => {
    if (tutorialGate) await tutorialGate.promise;
    await fulfillJson(route, {
      generation: 1,
      autoEnabled: tutorialEnabled,
      pageCount: 20,
      progress: {},
    });
  });

  await page.route("**/api/tutorial/pages/*", async (route) => {
    let payload = {};
    try {
      payload = route.request().postDataJSON();
    } catch {
      // A malformed request should still receive a deterministic mock response;
      // the app's own state assertions will expose the incorrect payload.
    }
    const pageKey = new URL(route.request().url()).pathname.split("/").at(-1);
    await fulfillJson(route, {
      pageKey,
      status: payload.status ?? "started",
      lastStep: payload.lastStep ?? 0,
    });
  });

  await page.route("**/api/tutorial/restart", (route) =>
    fulfillJson(route, {
      generation: 2,
      autoEnabled: true,
      pageCount: 20,
      progress: {},
    }),
  );

  await page.route(`**/api/merchants/${MERCHANT_ID}/transactions`, (route) =>
    fulfillJson(route, []),
  );

  await page.route(`**/api/merchants/${MERCHANT_ID}`, (route) =>
    fulfillJson(route, {
      id: MERCHANT_ID,
      businessName: "P0 Browser Merchant",
      status: "active",
    }),
  );
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (route) =>
    fulfillJson(route, {
      id: MERCHANT_ID,
      businessName: "P0 Browser Merchant",
      status: "active",
    }),
  );
}

async function createScenario(browser, contextOptions, mockOptions) {
  const context = await browser.newContext({
    ...contextOptions,
    serviceWorkers: "block",
  });
  const serviceWorkers = [];
  context.on("serviceworker", (worker) => serviceWorkers.push(worker.url()));

  const page = await context.newPage();
  const requests = [];
  const pageErrors = [];
  page.on("request", (request) => {
    requests.push({
      url: request.url(),
      resourceType: request.resourceType(),
    });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await installMocks(page, mockOptions);
  return { context, page, requests, pageErrors, serviceWorkers };
}

async function waitForDesktopCanvas(page) {
  await page.getByTestId("desktop-frame").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-testid="desktop-scaled-canvas"]');
    return canvas && Number(canvas.getAttribute("data-desktop-scale")) > 0;
  });
  // Let the 220 ms route transition settle before measuring fixed coordinates.
  await page.waitForTimeout(300);
}

async function readFrameMetrics(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="desktop-frame"]');
    const frame = viewport?.querySelector(":scope > .tapt-desktop-frame");
    const canvas = document.querySelector('[data-testid="desktop-scaled-canvas"]');
    if (!(viewport instanceof HTMLElement)) throw new Error("Desktop viewport missing");
    if (!(frame instanceof HTMLElement)) throw new Error("Desktop frame missing");
    if (!(canvas instanceof HTMLElement)) throw new Error("Scaled canvas missing");

    const viewportRect = viewport.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const frameStyle = getComputedStyle(frame);

    return {
      deviceClass: viewport.dataset.deviceClass,
      viewport: {
        left: viewportRect.left,
        top: viewportRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
      },
      frame: {
        left: frameRect.left,
        top: frameRect.top,
        width: frameRect.width,
        height: frameRect.height,
      },
      canvas: {
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
        scale: Number(canvas.dataset.desktopScale),
      },
      borderRadius: Number.parseFloat(frameStyle.borderTopLeftRadius),
      overflow: frameStyle.overflow,
    };
  });
}

async function hasBottomNavigation(page) {
  return page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll('button[aria-label="home"]:not(.tapt-desktop-nav-item)'),
    );
    return buttons.some((button) => {
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

async function verifyDesktop(browser) {
  const tutorialGate = deferred();
  const scenario = await createScenario(
    browser,
    {
      viewport: { width: 1440, height: 900 },
      hasTouch: false,
      isMobile: false,
    },
    { tutorialGate, tutorialEnabled: true },
  );

  const { context, page, requests, pageErrors, serviceWorkers } = scenario;
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await waitForDesktopCanvas(page);

    const metrics = await readFrameMetrics(page);
    assert.equal(metrics.deviceClass, "desktop", "1440×900 must classify as desktop");
    assertClose(metrics.viewport.width, 1440, "desktop viewport width");
    assertClose(metrics.viewport.height, 900, "desktop viewport height");
    assertClose(metrics.frame.width, 1000, "desktop frame width");
    assertClose(metrics.frame.height, 1000 * 44 / 59, "desktop frame height");
    assertClose(
      metrics.frame.left + metrics.frame.width / 2,
      1440 / 2,
      "desktop frame horizontal centre",
    );
    assertClose(
      metrics.frame.top + metrics.frame.height / 2,
      900 / 2,
      "desktop frame vertical centre",
    );
    assert.ok(metrics.borderRadius >= 24, "desktop frame must have rounded corners");
    assert.equal(metrics.overflow, "hidden", "desktop frame must clip its canvas");
    assert.equal(await hasBottomNavigation(page), false, "desktop must not render BottomNavigation");

    // The retail home quick action is the real anchor for the first tutorial
    // step (`[aria-label="new sale"]` in tutorial-registry.ts), so the spotlight
    // is measured against production markup inside the scaled canvas.
    tutorialGate.resolve();
    await page.locator(".tutorial-highlight").waitFor({ state: "visible" });

    const geometry = await page.evaluate(() => {
      const target = document.querySelector('[aria-label="new sale"]');
      const highlight = document.querySelector(".tutorial-highlight");
      const canvasElement = document.querySelector(
        '[data-testid="desktop-scaled-canvas"]',
      );
      if (!(target instanceof HTMLElement)) throw new Error("Tutorial target missing");
      if (!(highlight instanceof HTMLElement)) throw new Error("Tutorial highlight missing");
      if (!(canvasElement instanceof HTMLElement)) throw new Error("Scaled canvas missing");
      if (!canvasElement.contains(target)) throw new Error("Tutorial target is outside the scaled canvas");

      const targetRect = target.getBoundingClientRect();
      const highlightRect = highlight.getBoundingClientRect();
      return {
        scale: Number(canvasElement.dataset.desktopScale),
        target: {
          left: targetRect.left,
          top: targetRect.top,
          right: targetRect.right,
          bottom: targetRect.bottom,
          width: targetRect.width,
          height: targetRect.height,
          layoutWidth: target.offsetWidth,
          layoutHeight: target.offsetHeight,
        },
        highlight: {
          left: highlightRect.left,
          top: highlightRect.top,
          right: highlightRect.right,
          bottom: highlightRect.bottom,
          width: highlightRect.width,
          height: highlightRect.height,
        },
      };
    });

    assert.ok(geometry.scale > 0 && geometry.scale < 1, "desktop canvas must be scaled below 1");
    assert.ok(geometry.target.layoutWidth > 0, "tutorial target must have layout size");
    assertClose(
      geometry.target.width,
      geometry.target.layoutWidth * geometry.scale,
      "post-transform target width",
    );
    assertClose(
      geometry.target.height,
      geometry.target.layoutHeight * geometry.scale,
      "post-transform target height",
    );
    assertClose(geometry.highlight.left, geometry.target.left - 9, "spotlight left padding");
    assertClose(geometry.highlight.top, geometry.target.top - 9, "spotlight top padding");
    assertClose(geometry.highlight.right, geometry.target.right + 9, "spotlight right padding");
    assertClose(geometry.highlight.bottom, geometry.target.bottom + 9, "spotlight bottom padding");

    await page.screenshot({
      path: join(SCREENSHOT_DIR, "desktop-1440x900-tutorial.png"),
      fullPage: true,
    });

    // A DOM click deliberately bypasses the overlay blocker. Route departure
    // dismisses the current tutorial through the production boundary logic.
    await page.locator('.tapt-desktop-nav button[aria-label="stock"]').evaluate(
      (button) => button.click(),
    );
    await page.waitForURL(`${BASE_URL}/stock`);
    await page.locator('[data-desktop-page="directory"]').waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    assert.equal(page.url(), `${BASE_URL}/stock`, "top nav must navigate to /stock");

    const sourcePaths = uniqueSourcePaths(requests);
    assertDesktopSourceIsolation(
      sourcePaths,
      "/src/desktop/pages/retail-home.tsx",
      "desktop",
    );
    assert.ok(
      sourcePaths.includes("/src/desktop/pages/retail-stock.tsx"),
      "desktop navigation did not request the retail stock desktop module",
    );
    assert.deepEqual(serviceWorkers, [], "desktop context started a service worker");
    assert.deepEqual(pageErrors, [], `desktop page errors:\n${pageErrors.join("\n")}`);

    return { metrics, geometry, sourcePaths };
  } finally {
    await context.close();
  }
}

async function verifyTablet(browser) {
  const scenario = await createScenario(
    browser,
    {
      viewport: { width: 1194, height: 834 },
      hasTouch: true,
      isMobile: true,
    },
    { tutorialEnabled: false },
  );

  const { context, page, requests, pageErrors, serviceWorkers } = scenario;
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await waitForDesktopCanvas(page);

    assert.equal(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      true,
      "tablet context must expose a coarse pointer",
    );
    const metrics = await readFrameMetrics(page);
    assert.equal(metrics.deviceClass, "tablet", "1194×834 touch context must classify as tablet");
    assertClose(metrics.viewport.width, 1194, "tablet viewport width");
    assertClose(metrics.viewport.height, 834, "tablet viewport height");
    assertClose(metrics.frame.left, 0, "tablet frame left");
    assertClose(metrics.frame.top, 0, "tablet frame top");
    assertClose(metrics.frame.width, 1194, "tablet full-bleed width");
    assertClose(metrics.frame.height, 834, "tablet full-bleed height");
    assertClose(metrics.borderRadius, 0, "tablet frame border radius");
    assert.equal(await hasBottomNavigation(page), false, "tablet must not render BottomNavigation");

    await page.screenshot({
      path: join(SCREENSHOT_DIR, "tablet-1194x834.png"),
      fullPage: true,
    });

    const sourcePaths = uniqueSourcePaths(requests);
    assertDesktopSourceIsolation(
      sourcePaths,
      "/src/desktop/pages/retail-home.tsx",
      "tablet",
    );
    assert.deepEqual(serviceWorkers, [], "tablet context started a service worker");
    assert.deepEqual(pageErrors, [], `tablet page errors:\n${pageErrors.join("\n")}`);

    return { metrics, sourcePaths };
  } finally {
    await context.close();
  }
}

async function verifyPhone(browser) {
  const scenario = await createScenario(
    browser,
    {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    },
    { tutorialEnabled: false },
  );

  const { context, page, requests, pageErrors, serviceWorkers } = scenario;
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.locator('[aria-label="new sale"]').waitFor({ state: "visible" });
    // Cover the route-preload delay: a wrong device branch would request the
    // first desktop module after one second even if the initial route looked OK.
    await page.waitForTimeout(1600);

    assert.equal(
      await page.getByTestId("desktop-frame").count(),
      0,
      "phone must not render a desktop frame",
    );
    assert.equal(await hasBottomNavigation(page), true, "phone must render BottomNavigation");

    await page.screenshot({
      path: join(SCREENSHOT_DIR, "phone-390x844.png"),
      fullPage: true,
    });

    const sourcePaths = uniqueSourcePaths(requests);
    assert.ok(
      sourcePaths.includes("/src/pages/dashboard.tsx"),
      "phone did not request the mobile dashboard module",
    );
    const desktopRequests = sourcePaths.filter((path) =>
      path.startsWith("/src/desktop/"),
    );
    assert.deepEqual(
      desktopRequests,
      [],
      `phone requested desktop modules:\n${desktopRequests.join("\n")}`,
    );
    assert.deepEqual(serviceWorkers, [], "phone context started a service worker");
    assert.deepEqual(pageErrors, [], `phone page errors:\n${pageErrors.join("\n")}`);

    return { sourcePaths };
  } finally {
    await context.close();
  }
}

async function main() {
  await access(CHROMIUM_PATH, constants.X_OK);
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const desktop = await verifyDesktop(browser);
    const tablet = await verifyTablet(browser);
    const phone = await verifyPhone(browser);

    console.log("P0 desktop/tablet/mobile browser verification passed.");
    console.log(`Screenshots: ${SCREENSHOT_DIR}`);
    console.log(JSON.stringify({
      desktopFrame: desktop.metrics.frame,
      desktopScale: desktop.geometry.scale,
      tabletFrame: tablet.metrics.frame,
      desktopSourceModuleCount: desktop.sourcePaths.filter((path) =>
        path.startsWith("/src/desktop/"),
      ).length,
      tabletSourceModuleCount: tablet.sourcePaths.filter((path) =>
        path.startsWith("/src/desktop/"),
      ).length,
      phoneDesktopSourceModuleCount: phone.sourcePaths.filter((path) =>
        path.startsWith("/src/desktop/"),
      ).length,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("P0 browser verification failed.");
  console.error(error);
  process.exitCode = 1;
});
