import { auditAccessibility } from './accessibility-audit.mjs';
import { auditKeyboard } from './keyboard-audit.mjs';
import { dialogCase } from './dialog-audit.mjs';

// Local draft operations only. Never Save/Add product/Generate/send a request.
export async function auditExpandedDraft(page, path, mobile) {
  if (!mobile || !['/stock', '/property/tenants', '/dashboard', '/property/analytics', '/trades/analytics'].includes(path)) return null;
  const faults = [], states = [];
  const trigger = page.locator(dialogCase(path, mobile).trigger);
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog').last(); await dialog.waitFor();
  const activate = async locator => { await locator.focus(); await page.keyboard.press('Enter'); };
  const inspect = async state => {
    const audit = await auditAccessibility(page);
    const keyboard = await auditKeyboard(page);
    states.push({ state, audit, keyboard });
    for (const r of audit.violations) faults.push(`${state}: ${r.id}`);
    for (const f of keyboard.faults) faults.push(`${state}: keyboard ${f}`);
  };
  if (path === '/stock') {
    await activate(dialog.getByRole('button', { name: /Add icon/ }));
    await inspect('emoji choices');
    await activate(dialog.getByRole('button', { name: '☕', exact: true }));
    await activate(dialog.getByRole('button', { name: /Add variations/ }));
    await activate(dialog.getByRole('button', { name: 'Add group', exact: true }));
    await activate(dialog.getByRole('button', { name: 'Add option', exact: true }).first());
    await activate(dialog.getByRole('button', { name: 'Add group', exact: true }));
    await inspect('two groups and added option');
    await activate(dialog.getByRole('button', { name: 'Remove group 1 option 2', exact: true }));
    await activate(dialog.getByRole('button', { name: 'Remove variation group 2', exact: true }));
    await inspect('removed draft entries');
  } else if (path === '/property/tenants') {
    await activate(dialog.getByRole('button', { name: 'add subtenant', exact: true }));
    // Labels are the real form's accessible names; content is synthetic.
    const form = dialog.locator('[aria-hidden="false"]').last();
    await form.getByLabel(/^name/).fill('Draft person');
    await activate(form.getByRole('button', { name: 'confirm subtenant', exact: true }));
    await inspect('added subtenant');
    const remove = dialog.getByRole('button', { name: 'Remove subtenant 1', exact: true });
    if (await remove.count()) {
      await activate(remove);
      if (!await dialog.getByRole('button', { name: 'add subtenant', exact: true }).evaluate(el => document.activeElement === el)) faults.push('removed subtenant focus return');
      await inspect('removed subtenant');
    } else faults.push('added subtenant remove control has no expected name');
  } else {
    const options = dialog.locator('button[aria-pressed][style*="display: block"]');
    const count = await options.count();
    if (!count) faults.push('no report options inspected');
    for (let i = 0; i < count; i++) {
      await activate(options.nth(i));
      if (await options.nth(i).getAttribute('aria-pressed') !== 'true') faults.push(`report option ${i}: missing selected state`);
      const custom = dialog.getByRole('button', { name: 'Custom', exact: true });
      if (await custom.count()) {
        const presets = dialog.locator('button[aria-pressed]').filter({ hasNot: page.locator('div') });
        for (let j = 0; j < await presets.count(); j++) {
          await activate(presets.nth(j));
          if (await presets.nth(j).getAttribute('aria-pressed') !== 'true') faults.push(`period ${j}: missing selected state`);
        }
        await activate(custom);
        await dialog.getByLabel('Start date', { exact: true }).fill('2026-10-01');
        await dialog.getByLabel('End date', { exact: true }).fill('2026-10-11');
      }
      const client = dialog.getByRole('combobox', { name: 'Client', exact: true });
      if (await client.count()) { await client.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
      await inspect(`report option ${i + 1}, periods and available fields`);
    }
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  const returned = await trigger.evaluate(el => document.activeElement === el);
  if (!returned) faults.push('Escape focus return');
  return { states, returned, faults };
}
