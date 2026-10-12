// Synthetic browser regressions for terminal states missed by the home-route matrix.
// Screenshots are evidence only: golden references/tolerances are not changed.
import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { auditAccessibility } from '../scripts/accessibility-audit.mjs';
import { contrastRatio, reviewAccessibilityCandidates } from '../scripts/accessibility-candidate-review.mjs';
import { auditFonts, openGoldenPage, settle } from './support/fixtures';
import { commit, expectScreen, pressKeys, tapSubbar } from './support/screens';
const REFERENCE = { width: 390, height: 844 };
async function assertPinnedFonts(page: Page, unpinnedFonts: string[]) {
  expect(unpinnedFonts).toEqual([]);
  const fonts=await auditFonts(page);
  expect(fonts.gaps).toEqual([]);
  expect(fonts.families).toContain('Outfit');
  expect(fonts.drawn).toBeGreaterThan(0);
}
async function capture(page: Page, _tier: string, name: string) {
  await settle(page);
  const audit=await auditAccessibility(page,{diagnostics:true});
  const candidateReview=await reviewAccessibilityCandidates(page);
  if (name === 'property-external') {
    // Selected invoice rows have a lighter background than the navy panel.
    // Retain unsupported/manual candidates, but reject a measured low bound.
    expect.soft(candidateReview.contrastCandidates.filter(candidate =>
      candidate.minimumRatio != null && candidate.minimumRatio < candidate.minimum),
      'selected property invoice status contrast').toEqual([]);
  }
  const info=test.info();
  const report=info.outputPath(name+'.json');
  writeFileSync(report,JSON.stringify({audit,candidateReview},null,2));
  await info.attach(name+'-audit',{path:report,contentType:'application/json'});
  const screenshot=info.outputPath(name+'.png');
  await page.screenshot({path:screenshot,animations:'disabled',caret:'hide',scale:'device',style:readFileSync('tests/golden/screenshot.css','utf8')});
  await info.attach(name+'-capture',{path:screenshot,contentType:'image/png'});
  expect.soft(audit.violations,name+' selected WCAG violations').toEqual([]);
}
async function verifyKeypad(page: Page, vertical: string) {
  const back=page.locator(`[data-demo-id="${vertical}-key-back"]`);
  await expect.soft(back).toHaveAccessibleName('Delete last digit');
  const amount=page.locator(`[data-demo-id="${vertical}-amount"]`);
  const colors=await page.evaluate((vertical) => {
    const rgb=(s:string)=>s.match(/[\d.]+/g)!.map(Number);
    const hero=document.querySelector('.tp-layer:not(.leaving) .tp-hero')!;
    const amount=document.querySelector(`[data-demo-id="${vertical}-amount"]`)!;
    const keys=[...document.querySelectorAll(`[data-demo-id^="${vertical}-key-"]`)].filter(el=>!el.classList.contains('outline'));
    return {zero:{foreground:rgb(getComputedStyle(amount).color),background:rgb(getComputedStyle(hero).backgroundColor)},keys:keys.map(el=>({foreground:rgb(getComputedStyle(el).color),background:rgb(getComputedStyle(el).backgroundColor)}))};
  },vertical);
  expect(colors.keys).toHaveLength(10);
  expect.soft(contrastRatio(colors.zero.foreground,colors.zero.background),'readable zero amount').toBeGreaterThanOrEqual(3);
  for(const key of colors.keys)expect.soft(contrastRatio(key.foreground,key.background),'rendered keypad digit contrast').toBeGreaterThanOrEqual(3);
  await pressKeys(page,vertical,'12');
  await expect(amount).toHaveText('$0.12');
  await back.focus();await back.press('Enter');
  await expect(amount).toHaveText('$0.01');
  await back.press('Space');await expect(amount).toHaveText('$0.00');
  await back.press('Space');await expect(amount).toHaveText('$0.00');
  const report=test.info().outputPath(vertical+'-keypad-operation.json');
  writeFileSync(report,JSON.stringify({vertical,colors,accessibleName:'Delete last digit',
    verifiedOperations:['type 12 cents','Enter deletes to 1 cent','Space deletes to zero','Space on empty remains zero']},null,2));
  await test.info().attach(vertical+'-keypad-operation',{path:report,contentType:'application/json'});
}
test.describe('terminal sub-state accessibility', () => {
  test("property", async ({ browser }) => {
    const { context, page, errors, unpinnedFonts } = await openGoldenPage(browser, "property", REFERENCE);
    try {
      await assertPinnedFonts(page, unpinnedFonts);

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
      await verifyKeypad(page, "property");

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
      expect.soft(errors,'property runtime/request errors').toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("trades", async ({ browser }) => {
    const { context, page, errors, unpinnedFonts } = await openGoldenPage(browser, "trades", REFERENCE);
    try {
      await assertPinnedFonts(page, unpinnedFonts);

      await tapSubbar(page, "trades", "quote");
      await expectScreen(page, '[data-demo-id="trades-quote"]', "QuoteView");
      await capture(page, "tier3", "trades-quote");

      // MobileQuoteView has its own named Close quote control.
      await page.getByRole("button", { name: "Close quote", exact: true }).click();
      await page.waitForTimeout(700);
      await settle(page);
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
      await verifyKeypad(page, "trades");

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
      expect.soft(errors,'trades runtime/request errors').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
