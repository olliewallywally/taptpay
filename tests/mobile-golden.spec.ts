/* Phase 3 — the golden set.
 * docs/PLAN-2026-08-17-mobile-responsive-ui.md §7.1.
 *
 * A golden is an *app screenshot*, not a design file: captured at a fixed
 * viewport and DPR, approved once by a human against the design reference in
 * `docs/designs/motion-tablet-desktop/uploads/`, then committed so CI can diff
 * future runs. Nothing in this file approves anything. `--update-snapshots` is
 * not a way to make a red test green — §7.1: "A golden change is a design
 * change; it needs Oliver's approval."
 *
 * Tiers, in §7.1's priority order:
 *
 *   tier 1  fidelity  390×844 @ DPR 2  the three homes with an authoritative design
 *   tier 2  layout    DPR 1 × 5 sizes  the screens with hard numeric contracts
 *   tier 3  fidelity  390×844 @ DPR 1  the rest of the §6.6.1 terminal inventory
 *
 * The non-terminal merchant routes (dashboard, transactions, stock, settings,
 * onboarding, directories) that §7.1's second row also lists are deliberately
 * NOT captured here — phase 10 is actively rewriting them and a baseline taken
 * now would be stale before it was reviewed. `tests/golden/mobile/tier3-routes/`
 * is where they go; see the placeholder note in this file's tail.
 */
import { expect, test, type Page } from "@playwright/test";
import { auditFonts, openGoldenPage, settle, type Vertical } from "./support/fixtures";
import { cancel, commit, expectScreen, pressKeys, tapFab, tapSubbar } from "./support/screens";

const REFERENCE = { width: 390, height: 844 };

/** §4.1's device matrix, minus the 390 reference which tiers 1 and 3 cover. */
const LAYOUT_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
];

/* Every capture goes through here so no screenshot can be taken of a screen
   that is still settling, and so the tier/name shape stays uniform. */
async function capture(page: Page, tier: string, name: string) {
  await settle(page);
  await expect.soft(page).toHaveScreenshot([tier, `${name}.png`]);
}

/** §7.1's fonts row, verified rather than assumed. */
async function assertRealFaces(page: Page, unpinnedFonts: string[]) {
  expect(
    unpinnedFonts,
    "a font request had no pinned copy under tests/golden/fonts/ — the capture " +
      "would have depended on the network",
  ).toEqual([]);

  const fonts = await auditFonts(page);
  expect(
    fonts.gaps,
    "text is drawn at a weight no loaded face covers, so Chromium synthesised it " +
      "(A1 §4.3 / phase K §K5). A golden captured against a synthesised face is not a baseline.",
  ).toEqual([]);
  expect(fonts.families).toContain("Outfit");
  expect(fonts.drawn).toBeGreaterThan(0);
}

/* ─────────────────────────────────────────────────────────────────────────
   Tier 1 — fidelity, 390×844 @ DPR 2

   The only three screens with an authoritative design (§2.1):
   `retail terminal.png`, `PM terminal.png`, `Bills terminal.png`. DPR 2 is what
   makes subpixel drift visible; §7.1 names dropping this tier as the fallback
   if the repo gets too heavy, and that call is Oliver's.
   ───────────────────────────────────────────────────────────────────────── */
test.describe("tier 1 — terminal homes @ 390×844 DPR 2", () => {
  for (const vertical of ["retail", "property", "trades"] as Vertical[]) {
    test(`${vertical} terminal home`, async ({ browser }) => {
      const { context, page, unpinnedFonts } = await openGoldenPage(browser, vertical, {
        ...REFERENCE,
        dpr: 2,
      });
      try {
        await assertRealFaces(page, unpinnedFonts);
        await expectScreen(page, ".tp-screen.tp-home", `${vertical} terminal home`);
        await capture(page, "tier1", `${vertical}-terminal-home-390x844@2x`);
      } finally {
        await context.close();
      }
    });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   Tier 2 — layout, DPR 1, five sizes

   §7.1 names five screens with hard numeric contracts; three of them are the
   terminal's (home, keypad, share) and two — stock and dashboard — are phase-10
   routes and are held back with the rest of them.

   Retail carries all three in one flow, which is also the flow §9.C's keypad
   table and §6.4's `visibleStackRows >= 3` are measured on.
   ───────────────────────────────────────────────────────────────────────── */
test.describe("tier 2 — layout contracts across the device matrix", () => {
  for (const viewport of LAYOUT_VIEWPORTS) {
    const size = `${viewport.width}x${viewport.height}`;
    test(`retail home / keypad / share @ ${size}`, async ({ browser }) => {
      const { context, page } = await openGoldenPage(browser, "retail", viewport);
      try {
        await expectScreen(page, ".tp-screen.tp-home", "retail terminal home");
        await capture(page, "tier2", `retail-terminal-home-${size}`);

        await tapFab(page);
        await expectScreen(page, '[data-demo-id="retail-keypad-confirm"]', "the retail keypad");
        await capture(page, "tier2", `retail-keypad-${size}`);

        await reachRetailShare(page);
        await capture(page, "tier2", `retail-share-${size}`);
      } finally {
        await context.close();
      }
    });
  }
});

/* Keypad → details → home-with-a-pending-sale → share.
 *
 * The last hop is the subbar's `share` slot, NOT the send button. On `/terminal`
 * the view runs in live mode (`isLive`), and there `handleSend` posts the sale
 * to the API and clears the draft — it never opens `SharePayment`; only the demo
 * path does. `scripts/verify-terminal-dock.mjs:815-820` labels the screen it
 * measures after that click "share", but what it actually waits for is the send
 * button appearing on the *home* screen, so its `retail/share` row has never
 * been the share screen. `go('share')` off the subbar is the real route.
 *
 * Assumes the keypad is already showing. */
async function reachRetailShare(page: Page) {
  await pressKeys(page, "retail", "1234");
  await commit(page);
  await expectScreen(page, '[data-demo-id="retail-details-confirm"]', "the retail details screen");
  await page.getByPlaceholder("item name").fill("flat white");
  await commit(page);
  /* The send button lives in `.tp-overlay`, outside the layer, so the pending
     state is asserted on the screen's own cancel affordance instead. */
  await expectScreen(page, 'button[aria-label="cancel transaction"]', "home holding a pending sale");
  await tapSubbar(page, "retail", "share");
  await expectScreen(page, '[data-demo-id="retail-share"]', "the retail share screen");
}

/* ─────────────────────────────────────────────────────────────────────────
   Tier 3 — fidelity, 390×844 @ DPR 1: the rest of §6.6.1's 31 screens
   ───────────────────────────────────────────────────────────────────────── */
test.describe("tier 3 — terminal sub-screens @ 390×844", () => {
  test("retail", async ({ browser }) => {
    const { context, page, unpinnedFonts } = await openGoldenPage(browser, "retail", REFERENCE);
    try {
      await assertRealFaces(page, unpinnedFonts);

      /* MainTerminal first and only here: every commit below leaves a pending
         sale behind, and home then renders PendingTerminal instead. */
      await capture(page, "tier3", "retail-home-main");

      await tapSubbar(page, "retail", "stock");
      await expectScreen(page, '[data-demo-id="retail-stock-confirm"]', "ChooseStock");
      await capture(page, "tier3", "retail-stock");

      await tapSubbar(page, "retail", "split");
      await expectScreen(page, '[data-demo-id="retail-split-confirm"]', "SplitPayment");
      await capture(page, "tier3", "retail-split");

      await tapSubbar(page, "retail", "cash");
      await expectScreen(page, '[data-demo-id="retail-cash-confirm"]', "CashEntry");
      await capture(page, "tier3", "retail-cash");

      await page.locator('[data-demo-id="retail-cash-item-name"]').fill("flat white");
      await page.locator('[data-demo-id="retail-cash-amount"]').fill("12.34");
      await settle(page);
      await page.locator('[data-demo-id="retail-cash-sale"]').click();
      await page.waitForTimeout(700);
      await expectScreen(page, '[data-demo-id="retail-cash-success"]', "CashSuccess");
      await capture(page, "tier3", "retail-cash-success");

      /* CashSuccess' tick clears the stack and returns to an empty home. */
      await commit(page);

      await tapFab(page);
      await expectScreen(page, '[data-demo-id="retail-keypad-confirm"]', "Keypad");
      await capture(page, "tier3", "retail-keypad");

      await pressKeys(page, "retail", "1234");
      await commit(page);
      await expectScreen(page, '[data-demo-id="retail-details-confirm"]', "EnterDetails");
      await capture(page, "tier3", "retail-details");

      await page.getByPlaceholder("item name").fill("flat white");
      await commit(page);
      /* PendingTerminal — §6.6.1 trap 3: a second home screen, not a feature
         screen. It is what home renders once a sale is pending. */
      await expectScreen(page, 'button[aria-label="cancel transaction"]', "PendingTerminal");
      await capture(page, "tier3", "retail-home-pending");

      /* Via the subbar, not the send button — see reachRetailShare(). */
      await tapSubbar(page, "retail", "share");
      await expectScreen(page, '[data-demo-id="retail-share"]', "SharePayment");
      await capture(page, "tier3", "retail-share");
    } finally {
      await context.close();
    }
  });

  test("property", async ({ browser }) => {
    const { context, page, unpinnedFonts } = await openGoldenPage(browser, "property", REFERENCE);
    try {
      await assertRealFaces(page, unpinnedFonts);

      /* The three no-tenant branches first, while nothing is selected.
         §6.6.1 trap 1: these are separate early returns from the same
         components, and classing one branch and missing the other is exactly
         the failure the inventory exists to prevent. */
      await tapSubbar(page, "property", "send");
      await capture(page, "tier3", "property-send-no-tenant");

      await tapSubbar(page, "property", "external");
      await capture(page, "tier3", "property-external-no-tenant");

      await tapSubbar(page, "property", "tenants");
      await expectScreen(page, '[data-demo-id^="property-tenant-"]', "ChooseTenant");
      await capture(page, "tier3", "property-tenants");

      /* Picking a tenant returns to whichever screen asked for one — external,
         because that was the last no-tenant screen visited. */
      await page.locator('[data-demo-id="property-tenant-t2"]').click();
      await page.waitForTimeout(700);
      await settle(page);
      await capture(page, "tier3", "property-external");

      /* Rent: tenants → pick → send (pendingDest), then the amount keypad off
         the amount button. */
      await tapSubbar(page, "property", "send");
      await expectScreen(page, '[data-demo-id="property-rent-send"]', "SendRentLink");
      await capture(page, "tier3", "property-send");

      await page.locator('[data-demo-id="property-rent-amount"]').click();
      await page.waitForTimeout(700);
      await settle(page);
      await expectScreen(page, '[data-demo-id="property-amount"]', "RentAmount");
      await capture(page, "tier3", "property-amount");

      await pressKeys(page, "property", "1234");
      await commit(page);

      /* Bill: with a tenant already selected the subbar starts a fresh charge —
         keypad first, then the configurator. */
      await tapSubbar(page, "property", "bill");
      await pressKeys(page, "property", "5000");
      await commit(page);
      await expectScreen(page, '[data-demo-id="property-bill-send"]', "ChargeBill");
      await capture(page, "tier3", "property-bill");

      /* SentSuccess, off the rent send. */
      await tapSubbar(page, "property", "send");
      await page.locator('[data-demo-id="property-rent-send"]').click();
      await page.waitForTimeout(900);
      await settle(page);
      await expectScreen(page, ".tp-success-check", "SentSuccess");
      await capture(page, "tier3", "property-success");
    } finally {
      await context.close();
    }
  });

  test("trades", async ({ browser }) => {
    const { context, page, unpinnedFonts } = await openGoldenPage(browser, "trades", REFERENCE);
    try {
      await assertRealFaces(page, unpinnedFonts);

      await tapSubbar(page, "trades", "quote");
      await expectScreen(page, '[data-demo-id="trades-quote"]', "QuoteView");
      await capture(page, "tier3", "trades-quote");

      await cancel(page);
      await tapSubbar(page, "trades", "clients");
      await expectScreen(page, '[data-demo-id^="trades-client-"]', "ChooseClient");
      await capture(page, "tier3", "trades-clients");

      /* `allowQuickInvoice` is `pendingDest === 'invoice'`, so the "quick
         invoice · no client" affordance only exists when the picker was opened
         *by* the invoice slot — tapping `clients` directly never shows it.
         Tapping `invoice` with no client redirects here and sets the intent. */
      await tapSubbar(page, "trades", "invoice");
      await expectScreen(page, '[data-demo-id="trades-quick-invoice"]', "ChooseClient (quick-invoice offered)");

      /* Quick invoice — the `quickMode` branch of QuickInvoice, the one with no
         client, reached through the picker rather than the subbar. */
      await page.locator('[data-demo-id="trades-quick-invoice"]').click();
      await page.waitForTimeout(700);
      await settle(page);
      await expectScreen(page, '[data-demo-id="trades-amount"]', "AmountKeypad");
      await capture(page, "tier3", "trades-amount");

      await pressKeys(page, "trades", "1234");
      await commit(page);
      await expectScreen(page, '[data-demo-id="trades-invoice-send"]', "QuickInvoice (quick mode)");
      await capture(page, "tier3", "trades-invoice-quick");

      /* Then the same screen with a client attached. */
      await tapSubbar(page, "trades", "clients");
      await page.locator('[data-demo-id="trades-client-c1"]').click();
      await page.waitForTimeout(700);
      await settle(page);
      await pressKeys(page, "trades", "9950");
      await commit(page);
      await expectScreen(page, '[data-demo-id="trades-invoice-send"]', "QuickInvoice");
      await capture(page, "tier3", "trades-invoice");

      await tapSubbar(page, "trades", "external");
      await capture(page, "tier3", "trades-external");

      await tapSubbar(page, "trades", "invoice");
      await page.locator('[data-demo-id="trades-invoice-send"]').click();
      await page.waitForTimeout(900);
      await settle(page);
      await expectScreen(page, ".tp-success-check", "SentSuccess");
      await capture(page, "tier3", "trades-success");
    } finally {
      await context.close();
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Held back — the non-terminal mobile routes

   §7.1's fidelity row also asks for "~9 non-terminal mobile routes" at 390×844
   DPR 1: dashboard, transactions, stock, settings, onboarding and the two
   directories. They are not captured here. Phase 10 is rewriting those pages
   while this is being written, so a baseline taken today would be stale before
   anyone could approve it — and an unapproved golden is worse than no golden,
   because the next run's diff looks like a regression.

   They belong in `tier3-routes/`, captured with exactly the harness above:
   `openGoldenPage(browser, "retail", REFERENCE)` then `page.goto()` the route,
   `settle()`, `capture(page, "tier3-routes", <name>)`. Tier 2 likewise still
   owes `stock` and `dashboard`, the other two of §7.1's five hard-contract
   screens.
   ───────────────────────────────────────────────────────────────────────── */
