/* Chunk-failure resilience gate.
 *
 * Two things happen to a lazy chunk in the real world, and both were reproduced
 * in a browser on 2026-08-09:
 *
 *   1. it 404s — the normal case once a deploy rolls the asset hash while a tab
 *      is still open on the old index.html. `import()` rejects with "Failed to
 *      fetch dynamically imported module";
 *   2. it hangs — the request is accepted and never answered, so `import()`
 *      never settles at all.
 *
 * Before Step 4 of docs/PLAN-2026-08-10-finish-review-and-fix.md, (1) unmounted
 * the React tree and left a COMPLETELY BLANK SCREEN, and (2) left the route
 * spinner up forever — indistinguishable from the auth outage this branch of
 * work started with. Neither is something a merchant can act on.
 *
 * This script drives a real browser, forces each failure with request
 * interception, and asserts the app lands on something ACTIONABLE: visible text
 * that says what happened, plus a working reload control. It deliberately does
 * not assert which layer produced it — the Suspense fallback escalating or the
 * error boundary catching are both acceptable answers — only that the user is
 * never left with a blank page or an unbounded spinner.
 *
 * Usage: dev server already up on :5000, single instance (memory
 * `dev-server-single-instance` — a second instance causes an HMR token clash).
 *
 *   node scripts/verify-chunk-resilience.mjs
 *   echo $?     # 0 = pass. Check it directly: a pipe reports the pipe's status.
 */
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { chromium } from "playwright";

import { BASE_URL, CHROMIUM_PATH, MERCHANT_ID } from "./desktop-shots/retail-fixtures.mjs";

/* Budgets, not measurements. The app's own bound is CHUNK_LOAD_TIMEOUT_MS
   (8s, client/src/lib/lazy-with-retry.ts); everything here is that plus room
   for a dev-server transform, the one automatic reload the abort case is
   allowed, and React re-rendering the boundary. A scenario that needs longer
   than this has stopped being "actionable" from the merchant's point of view,
   which is the property under test. */
const ABORT_RECOVERY_BUDGET_MS = 20_000;
const HANG_RECOVERY_BUDGET_MS = 25_000;

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false };

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/* A signed-in merchant with empty data everywhere. The subject is the chunk
   loader, so every page-level request answers instantly and boringly; anything
   left unmocked would reach the dev server with a dummy token, answer 403, and
   put noise in the failure diagnosis. */
async function installMocks(page) {
  await page.addInitScript(({ merchantId }) => {
    const payload = window.btoa(JSON.stringify({
      userId: 1,
      email: "chunk-resilience@example.invalid",
      merchantId,
      role: "owner",
    }));
    localStorage.setItem("authToken", `chunk.${payload}.dummy`);
    localStorage.setItem("merchantId", String(merchantId));
    localStorage.setItem("taptMode", "retail");
  }, { merchantId: MERCHANT_ID });

  await page.route("**/api/auth/me", (route) => json(route, {
    user: {
      id: 1,
      email: "chunk-resilience@example.invalid",
      merchantId: MERCHANT_ID,
      role: "owner",
      onboardingCompleted: true,
      gstRegistered: false,
      tradeGstMode: "inclusive",
    },
  }));
  await page.route("**/api/tutorial/state", (route) => json(route, {
    generation: 1,
    autoEnabled: false,
    pageCount: 20,
    progress: {},
  }));
  await page.route("**/api/tutorial/**", (route) => json(route, {}));
  await page.route(`**/api/merchants/${MERCHANT_ID}/**`, (route) => json(route, []));
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (route) => json(route, {
    id: MERCHANT_ID,
    businessName: "Chunk Resilience Merchant",
    status: "active",
  }));
  await page.route(`**/api/merchants/${MERCHANT_ID}/profile`, (route) => json(route, {
    id: MERCHANT_ID,
    businessName: "Chunk Resilience Merchant",
    status: "active",
  }));
  for (const prefix of ["/api/property/", "/api/trades/", "/api/push/", "/api/billing/", "/api/team", "/api/subscription"]) {
    await page.route(`**${prefix}**`, (route) => json(route, []));
  }
}

/**
 * Breaks exactly one lazy module.
 *
 * `mode: "abort"` reproduces the stale-hash 404: the request fails outright, so
 * `import()` rejects. `mode: "hang"` reproduces the accepted-and-never-answered
 * case by holding the route handler open forever — Playwright leaves the request
 * pending, so `import()` never settles and only a client-side bound can end it.
 *
 * Returns a counter of how many times the module was hit, which is how the
 * abort scenario proves the app really did retry and reload rather than giving
 * up on the first failure.
 */
async function breakModule(page, modulePath, mode) {
  const hits = { count: 0 };
  await page.route(`**${modulePath}*`, async (route) => {
    hits.count += 1;
    if (mode === "abort") {
      await route.abort("failed");
      return;
    }
    // Never fulfilled, never aborted, never continued.
    await new Promise(() => {});
  });
  return hits;
}

/* What the page looks like when the wait fails, in the terms the two original
   failure modes were described in. This is the whole value of the script when
   it goes red: "blank" and "spinner only" must be visibly distinguishable from
   each other and from a real assertion failure. */
async function diagnose(page) {
  return page.evaluate(() => {
    const root = document.getElementById("root");
    const text = (document.body.innerText ?? "").trim();
    return {
      rootChildren: root ? root.childElementCount : -1,
      bodyTextLength: text.length,
      bodyTextSample: text.slice(0, 200),
      routeLoaderPresent: !!document.querySelector('[data-testid="page-loader"]'),
      spinnerPresent: !!document.querySelector(".animate-spin"),
      recoveryPresent: !!document.querySelector("[data-chunk-recovery]"),
    };
  });
}

function describe(diagnosis) {
  // Spinner first: a spinner is textless, so testing for empty text before
  // testing for a spinner reports every hang as a blank screen and the two
  // failure modes stop being distinguishable in the output.
  if (diagnosis.routeLoaderPresent || diagnosis.spinnerPresent) {
    return "UNBOUNDED SPINNER — still loading, with nothing the user can do about it.";
  }
  if (diagnosis.rootChildren <= 0 || diagnosis.bodyTextLength === 0) {
    return "BLANK SCREEN — the React tree unmounted and nothing replaced it.";
  }
  return `no recovery affordance; page reads: ${JSON.stringify(diagnosis.bodyTextSample)}`;
}

async function runScenario(browser, {
  name,
  contextOptions,
  path,
  modulePath,
  mode,
  budgetMs,
  expectedReason,
  expectRetry,
}) {
  const context = await browser.newContext({ ...contextOptions, serviceWorkers: "block" });
  const page = await context.newPage();
  try {
    await installMocks(page);
    const hits = await breakModule(page, modulePath, mode);

    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });

    const recovery = page.locator("[data-chunk-recovery]").first();
    try {
      await recovery.waitFor({ state: "visible", timeout: budgetMs });
    } catch (error) {
      const diagnosis = await diagnose(page);
      throw new Error(
        `${name}: no actionable recovery within ${budgetMs}ms — ${describe(diagnosis)}\n` +
        `  module hits: ${hits.count}\n` +
        `  diagnosis: ${JSON.stringify(diagnosis)}`,
      );
    }

    const reason = await recovery.getAttribute("data-chunk-recovery");
    assert.equal(reason, expectedReason, `${name}: recovery reason`);

    // "Actionable" means readable words and a control, not merely a div that
    // happens to carry the marker attribute.
    const message = (await recovery.innerText()).trim();
    assert.ok(message.length > 20, `${name}: recovery panel said almost nothing: ${JSON.stringify(message)}`);

    const reload = recovery.getByTestId("chunk-reload");
    await reload.waitFor({ state: "visible", timeout: 2_000 });
    assert.equal(await reload.isEnabled(), true, `${name}: reload control is disabled`);

    const diagnosis = await diagnose(page);
    assert.ok(diagnosis.bodyTextLength > 0, `${name}: recovery marker present but the page renders no text`);
    assert.equal(diagnosis.routeLoaderPresent, false, `${name}: the route spinner is still up alongside the recovery panel`);

    if (expectRetry) {
      assert.ok(
        hits.count > 1,
        `${name}: the module was requested ${hits.count} time(s) — the retry/reload path never ran`,
      );
    }

    /* The control has to do something. A reload is the actual cure for a
       stale-hash 404, so prove the button really navigates rather than being
       decoration — and that the second pass still ends in the recovery panel
       instead of a blank screen or a reload loop. */
    const reloaded = page.waitForEvent("load", { timeout: 15_000 });
    await reload.click();
    await reloaded;
    await page.locator("[data-chunk-recovery]").first().waitFor({ state: "visible", timeout: budgetMs });

    return { name, reason, message: message.replace(/\s+/g, " "), moduleHits: hits.count };
  } finally {
    await context.close();
  }
}

async function requireDevServer() {
  let response;
  try {
    response = await fetch(BASE_URL, { method: "GET" });
  } catch (error) {
    throw new Error(
      `No dev server answering on ${BASE_URL} (${error.message}).\n` +
      "Start ONE instance yourself and re-run — this script must never start a second " +
      "(memory `dev-server-single-instance`: two servers clash on the HMR token).",
    );
  }
  assert.ok(response.ok, `Dev server on ${BASE_URL} answered HTTP ${response.status}`);
}

const SCENARIOS = [
  /* The main router — the half that Step 4 exists for. `/dashboard` on a phone
     viewport resolves to the mobile page behind the bare Suspense that had no
     boundary above it. */
  {
    name: "route chunk 404s",
    contextOptions: PHONE,
    path: "/dashboard",
    modulePath: "/src/pages/dashboard.tsx",
    mode: "abort",
    budgetMs: ABORT_RECOVERY_BUDGET_MS,
    expectedReason: "error",
    expectRetry: true,
  },
  {
    name: "route chunk hangs",
    contextOptions: PHONE,
    path: "/transactions",
    modulePath: "/src/pages/transactions.tsx",
    mode: "hang",
    budgetMs: HANG_RECOVERY_BUDGET_MS,
    expectedReason: "timeout",
    // A hang is not retried on purpose: the browser's module map hands the same
    // pending promise back, so a second attempt only spends another timeout.
    // See client/src/lib/lazy-with-retry.ts.
    expectRetry: false,
  },
  /* The desktop slot was already covered by ebae323, and Step 4 rebuilt it on
     the shared mechanism. Keep one desktop scenario so that generalisation
     cannot regress silently. */
  {
    name: "desktop page chunk 404s",
    contextOptions: DESKTOP,
    path: "/dashboard",
    modulePath: "/src/desktop/pages/retail-home.tsx",
    mode: "abort",
    budgetMs: ABORT_RECOVERY_BUDGET_MS,
    expectedReason: "error",
    expectRetry: true,
  },
];

async function main() {
  await requireDevServer();
  await access(CHROMIUM_PATH, constants.X_OK);

  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const results = [];
  const failures = [];
  try {
    /* Every scenario runs even after one fails. Each describes a different way
       the app can die, and knowing that both the 404 and the hang are broken is
       worth more than stopping at the first. */
    for (const scenario of SCENARIOS) {
      try {
        results.push(await runScenario(browser, scenario));
        console.log(`  ok   ${scenario.name}`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        console.log(`  FAIL ${scenario.name}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    throw new Error(`${failures.length}/${SCENARIOS.length} scenario(s) failed:\n\n${failures.join("\n\n")}`);
  }

  console.log("Chunk resilience verification passed — no blank screen, no unbounded spinner.");
  console.log(JSON.stringify(results, null, 2));
}

try {
  await main();
} catch (error) {
  console.error("Chunk resilience verification FAILED.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
