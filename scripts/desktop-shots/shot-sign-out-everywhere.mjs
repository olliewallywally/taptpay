// Screenshots of "Sign out of all devices" (R1-T4 phase D), fixtures only, against the dev server.
import { chromium } from "playwright";
const BASE_URL = "http://127.0.0.1:5000";
const CHROMIUM_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const OUT = process.argv[2] ?? "/tmp/taptpay-r1-t4-phase-d";
await (await import("node:fs/promises")).mkdir(OUT, { recursive: true });
const MERCHANT_ID = 999999;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const MERCHANT = { id: MERCHANT_ID, businessName: "Ollies Fresh Coffee", status: "active", email: "hello@olliesfresh.co.nz",
  phone: "022 459 0153", address: "14 Vivian St, Wellington", gstNumber: "123-456-789", dailyGoal: "500.00", gstRegistered: true,
  paymentUrl: `${BASE_URL}/pay/${MERCHANT_ID}` };
async function installMocks(page) {
  await page.addInitScript(({ merchantId }) => {
    const payload = window.btoa(JSON.stringify({ userId: 1, email: "shot@example.invalid", merchantId, role: "owner" }));
    localStorage.setItem("authToken", `shot.${payload}.dummy`);
    localStorage.setItem("merchantId", String(merchantId));
    localStorage.setItem("taptMode", "retail");
  }, { merchantId: MERCHANT_ID });
  const external = [];
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== "127.0.0.1") { external.push(u.hostname); return r.abort(); }
    if (!u.pathname.startsWith("/api/")) return r.continue();
    const p = u.pathname;
    if (p === "/api/auth/me") return json(r, { user: { id: 1, email: "shot@example.invalid", merchantId: MERCHANT_ID, role: "owner", onboardingCompleted: true } });
    if (p === "/api/tutorial/state") return json(r, { generation: 1, autoEnabled: false, pageCount: 20, progress: {} });
    if (p === "/api/subscription") return json(r, { subscription: { status: "active", planId: "solo", priceCents: 799, seatLimit: 1, seatsInUse: 1 } });
    if (p === "/api/billing/card") return json(r, { ready: true, card: { brand: "visa", last4: "4021", expiry: "08/29" } });
    if (p === "/api/push/capabilities") return json(r, { webPush: { available: true }, nativePush: { available: false } });
    if (p === "/api/push/status") return json(r, { subscribed: false });
    if (p.startsWith("/api/subscription/billing-history")) return json(r, { history: [] });
    if (p === "/api/team") return json(r, { members: [], seatLimit: 1, seatsInUse: 1 });
    if (p === "/api/push/preferences") return json(r, { preferences: { paymentReceived: true, dailyPayoutSummary: true, failedPaymentAlerts: false } });
    if (p === `/api/merchants/${MERCHANT_ID}` || p === `/api/merchants/${MERCHANT_ID}/profile`) return json(r, MERCHANT);
    if (/\/(transactions|stock-items|tapt-stones)$/.test(p)) return json(r, []);
    return json(r, {});
  });
  return external;
}
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const errors = [];
for (const [label, ctx] of [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["phone", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ["tablet", { viewport: { width: 1194, height: 834 }, hasTouch: true }],
]) {
  const context = await browser.newContext({ deviceScaleFactor: 1, serviceWorkers: "block", ...ctx });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  await installMocks(page);
  await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
  const button = page.getByRole("button", { name: "Sign out of all devices" });
  await button.waitFor({ state: "visible", timeout: 30000 });
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${label}-settings.png` });
  const box = await button.boundingBox();
  const logout = await page.getByTestId("button-logout").boundingBox();
  console.log(label, "logout", JSON.stringify(logout), "sign-out-all", JSON.stringify(box));
  await context.close();
}
await browser.close();
console.log(errors.length ? `PAGE ERRORS:\n${errors.join("\n")}` : "no page errors");
