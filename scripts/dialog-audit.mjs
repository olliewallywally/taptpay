import { auditAccessibility } from './accessibility-audit.mjs';
import { focusEvaluation, settleNativeFocusScroll } from './keyboard-audit.mjs';

// Only presentation actions: open an empty form/report picker, Tab, Escape.
// No save, delete, resend, generation, purchase or other business action.
export function dialogCase(path, mobile) {
  if (mobile && path === '/dashboard') return { trigger: 'button[aria-label="Export reports"]', layer: '[data-testid="report-modal-layer"]' };
  if (path === '/stock') return { trigger: mobile ? '[data-testid="button-add-product"]' : '.rs-add', layer: mobile ? '[data-testid="button-cancel-edit"]' : '.rs-modal', expand: mobile ? ['button:has-text("Add variations")', 'button:has-text("Add group")'] : [] };
  if (path === '/property/tenants') return { trigger: mobile ? '.tdir-add' : '.pc-add', layer: mobile ? 'div[style*="z-index: 100;"]' : '.pc-modal' };
  if (path === '/trades/clients') return { trigger: mobile ? '.cdir-add' : '.tc-add', layer: mobile ? 'div[style*="z-index: 100;"]' : '.tc-modal' };
  if (mobile && ['/property/analytics', '/trades/analytics'].includes(path)) return { trigger: `[data-tutorial-id="${path.startsWith('/property') ? 'pa' : 'ta'}-reports"] button`, layer: '[data-testid="report-modal-layer"]' };
  return null;
}

export async function auditDialog(page, spec) {
  const faults = [], samples = [];
  const origin = page.locator(spec.trigger);
  await origin.focus();
  await page.evaluate(() => { window.__dialogOrigin = document.activeElement; });
  await page.keyboard.press('Enter');
  await page.locator(spec.layer).first().waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__keyboardAudit = { ids: new WeakMap(), styles: new WeakMap(), next: 0 }; });
  const sample = async () => {
    await settleNativeFocusScroll(page);
    const facts = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(el => el.getBoundingClientRect().height > 0);
    const dialog = dialogs.at(-1), active = document.activeElement;
    return { dialog: !!dialog, named: !!dialog && !!(dialog.getAttribute('aria-label')?.trim() || document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent?.trim()), focusInside: !!dialog && dialog.contains(active) };
    });
    return { ...facts, focus: await page.evaluate(`(${focusEvaluation.toString()})()`) };
  };
  samples.push(await sample());
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); samples.push(await sample()); }
  await page.keyboard.press('Shift+Tab'); samples.push(await sample());
  const audit = await auditAccessibility(page, { diagnostics: true });
  const expandedAudits = [];
  const custom = page.locator('[data-testid="report-modal-layer"] button').filter({ hasText: /^Custom$/ });
  const actions = [...(spec.expand ?? []), ...(await custom.count() ? ['[data-testid="report-modal-layer"] button:text-is("Custom")'] : [])];
  for (const selector of actions) {
    await page.locator(selector).first().focus(); await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    expandedAudits.push(await auditAccessibility(page, { diagnostics: true }));
  }
  if (actions.length) for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); samples.push(await sample()); }
  await page.keyboard.press('Escape');
  let closed = false;
  try { await page.locator(spec.layer).first().waitFor({ state: 'hidden', timeout: 2000 }); closed = true; } catch { /* retained failure */ }
  let returned = false;
  try { await page.waitForFunction(() => document.activeElement === window.__dialogOrigin, undefined, { timeout: 2000 }); returned = true; } catch { /* retain failed return, including delayed Radix cleanup */ }
  await page.evaluate(() => { delete window.__dialogOrigin; delete window.__keyboardAudit; });
  for (const key of ['dialog', 'named', 'focusInside']) if (samples.some(s => !s[key])) faults.push(key);
  for (const key of ['visible', 'hit', 'focusVisible', 'indicator']) if (samples.some(s => !s.focus[key])) faults.push(`focused dialog control: ${key}`);
  if (!closed) faults.push('Escape did not close');
  if (!returned) faults.push('focus did not return');
  return { samples, closed, returned, audit, expandedAudits, faults };
}
