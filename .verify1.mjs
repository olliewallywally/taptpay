import { chromium } from 'playwright';
const TOKEN = (await import('fs')).readFileSync('/tmp/verify-token.txt','utf8').trim();
const EXE = (await import('fs')).readFileSync('/tmp/chrome-path.txt','utf8').trim();
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 880 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
// Seed auth + property mode before app boots
await page.addInitScript(t => { localStorage.setItem('authToken', t); localStorage.setItem('taptMode','property'); }, TOKEN);
await page.goto('http://localhost:5000/property/tenants', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('URL after load:', page.url());
await page.screenshot({ path: '/tmp/verify-shots/01-directory.png' });

// Open Add Tenant via the + FAB (plus-path SVG)
const fab = page.locator('button:has(svg path[d="M12 5v14M5 12h14"])').first();
await fab.click();
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/verify-shots/02-addsheet.png' });

// Check the three channel options exist
const hasEmail = await page.getByRole('button', { name: 'email', exact: true }).count();
const hasWa   = await page.getByRole('button', { name: 'whatsapp', exact: true }).count();
const hasSms  = await page.getByRole('button', { name: 'sms', exact: true }).count();
console.log('channel buttons -> email:', hasEmail, 'whatsapp:', hasWa, 'sms:', hasSms);

// Fill required fields; leave email/phone empty; pick SMS -> expect contact guard
await page.getByPlaceholder('', { exact: true }); // noop
const inputs = page.locator('.tp-screen, input'); // not used
// Fields are by label order; use first/last name + address placeholders are empty, so target by surrounding. Use nth inputs.
const allInputs = page.locator('input');
const n = await allInputs.count();
console.log('input count in sheet:', n);
await allInputs.nth(0).fill('Ada');      // first name
await allInputs.nth(1).fill('Verify');   // last name
await allInputs.nth(2).fill('12 Test St');// property address
await page.getByRole('button', { name: 'sms', exact: true }).click();
await page.waitForTimeout(300);
const guardVisible = await page.getByText(/add a phone number above to send via sms/i).count();
console.log('SMS contact guard shown (no phone):', guardVisible);
await page.screenshot({ path: '/tmp/verify-shots/03-sms-guard.png' });

// Is the Add button disabled while guard active?
const addBtn = page.getByRole('button', { name: /add tenant/i }).last();
const disabledNoPhone = await addBtn.isDisabled();
console.log('Add button disabled w/ SMS + no phone:', disabledNoPhone);

// Add a phone -> guard should clear
await allInputs.nth(4).fill('0211234567'); // phone is 5th input (0:first,1:last,2:addr,3:email,4:phone)
await page.waitForTimeout(300);
const guardAfter = await page.getByText(/add a phone number above to send via sms/i).count();
const disabledAfter = await addBtn.isDisabled();
console.log('guard after phone added:', guardAfter, '| Add disabled after phone:', disabledAfter);
await page.screenshot({ path: '/tmp/verify-shots/04-sms-ok.png' });

console.log('CONSOLE ERRORS:', errs.length ? errs.slice(0,5) : 'none');
await browser.close();
