// Live updates reach a real browser (the fix found by the R1-T1 audit, 2026-09-25;
// docs/evidence/remediation-v2-2/r1/R1-live-updates-compression-2026-09-25.md).
//
// Builds this tree's app — server/app.ts and the real routes, on in-memory storage — on a
// loopback port. Chromium then opens the no-sign-in event stream both ways the app does:
// EventSource, as the customer's payment page does, and a streaming fetch, as the merchant's
// screens do. Each must receive the "connected" event within 3 s. The page is a JSON endpoint,
// so no app code or analytics runs, and every request off the machine is aborted.
//
//   node --import tsx scripts/verify-live-updates-browser.ts
//
// Exits 1 when an event does not arrive (as on 05195728, before the fix), after printing what
// arrived and how the stream was encoded.
import { chromium } from "playwright";
import type { AddressInfo } from "node:net";
import { CHROMIUM_PATH } from "./desktop-shots/retail-fixtures.mjs";

// A clean environment before the app reads its configuration: no database, no credentials.
for (const key of Object.keys(process.env)) {
  if (!["PATH", "HOME", "TMPDIR", "PLAYWRIGHT_CHROMIUM_PATH"].includes(key)) delete process.env[key];
}
Object.assign(process.env, {
  APP_ENV: "development",
  ENV_VALIDATION_MODE: "audit",
  PAYMENT_MODE: "disabled",
  EMAIL_PROVIDER: "simulation",
  JWT_SECRET: "live-updates-probe-not-a-real-secret-000",
});

const { createApp } = await import("../server/app");
const { registerRoutes } = await import("../server/routes");
const { createGlobalErrorHandler } = await import("../server/http-error-handler");

const app = createApp({ writeRequestLog: () => {} });
const server = await registerRoutes(app);
app.use(createGlobalErrorHandler());
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
const page = await browser.newPage();
await page.route("**/*", (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
const contentEncoding: string[] = [];
page.on("response", async (response) => {
  if (response.url().includes("/events")) {
    contentEncoding.push((await response.allHeaders())["content-encoding"] ?? "(none)");
  }
});

await page.goto(`${base}/api/push/capabilities`);
const received = await page.evaluate(async () => {
  const viaEventSource = await new Promise<unknown>((resolve) => {
    const source = new EventSource("/api/merchants/1/events");
    const timer = setTimeout(() => { source.close(); resolve(null); }, 3000);
    source.onmessage = (event) => { clearTimeout(timer); source.close(); resolve(JSON.parse(event.data)); };
  });
  const controller = new AbortController();
  const response = await fetch("/api/merchants/1/events", {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  const first = await Promise.race([
    reader.read(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  controller.abort();
  return { viaEventSource, viaFetch: first?.value ? new TextDecoder().decode(first.value).trim() : null };
});

const connected = { type: "connected", audience: "legacy-no-board" };
const pass =
  JSON.stringify(received.viaEventSource) === JSON.stringify(connected) &&
  received.viaFetch === `data: ${JSON.stringify(connected)}`;
console.log(JSON.stringify({ chromium: browser.version(), ...received, contentEncoding, pass }));

await browser.close();
server.close();
process.exit(pass ? 0 : 1);
