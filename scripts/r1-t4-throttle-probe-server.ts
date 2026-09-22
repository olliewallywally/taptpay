// R1-T4 phase C browser probe — the server half. The real routes and the real login
// page (Vite, as `npm run dev` serves it) on in-memory storage with one synthetic
// merchant. Started by scripts/verify-r1-t4-throttle-browser.mjs with a clean
// environment, so no ambient credential or database reaches it; not for other use.
import express from "express";
import { registerRoutes } from "../server/routes";
import { createGlobalErrorHandler } from "../server/http-error-handler";
import { setupVite } from "../server/vite";
import { storage } from "../server/storage";
import { createUser } from "../server/auth";

if (process.env.DATABASE_URL || process.env.APP_ENV !== "development") {
  throw new Error("the probe server runs only in development, on in-memory storage");
}
const port = Number(process.env.R1T4_PROBE_PORT ?? 5055);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const server = await registerRoutes(app);
app.use(createGlobalErrorHandler());
await setupVite(app, server);

const merchant = await storage.createMerchant({
  name: "Probe Cafe", businessName: "Probe Cafe Ltd", businessType: "retail",
  email: "owner@probe.test", phone: "021 555 0100", address: "1 Probe Street, Auckland",
} as any);
await storage.updateMerchantStatus(merchant.id, "active");
await createUser("owner@probe.test", "Probe-password-1", merchant.id, "merchant");
server.listen(port, "127.0.0.1", () => console.log("PROBE SERVER READY"));
