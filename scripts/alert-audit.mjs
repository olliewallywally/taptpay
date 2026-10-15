import { auditAccessibility } from './accessibility-audit.mjs';

/** Empty login validation is local: validateForm returns before the mutation. */
export async function auditLoginAlerts(page) {
  await page.locator('[data-testid="input-email"]').fill('');
  await page.locator('[data-testid="input-password"]').fill('');
  await page.locator('[data-testid="button-login"]').click();
  const fields = await page.evaluate(() => ['email', 'password'].map(id => {
    const el = document.getElementById(id), error = document.getElementById(el?.getAttribute('aria-describedby'));
    return { invalid: el?.getAttribute('aria-invalid') === 'true', described: !!error, announced: error?.getAttribute('role') === 'alert' || !!error?.closest('[role="alert"],[aria-live="assertive"],[aria-live="polite"]') };
  }));
  const faults = [];
  for (const [i, field] of fields.entries()) for (const key of ['invalid', 'described', 'announced']) if (!field[key]) faults.push(`login field ${i + 1} ${key}`);
  return { fields, faults, audit: await auditAccessibility(page, { diagnostics: true }) };
}
