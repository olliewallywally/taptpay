/* @playwright/test config for the §7.1 golden suite.
 *
 * docs/PLAN-2026-08-17-mobile-responsive-ui.md §7.1 and §7.5 — `npm run
 * test:golden`. Nothing else in the repo uses @playwright/test; the geometry
 * gates (`verify:mobile`, `verify:mobile-keyboard`, `verify:terminal-dock`) are
 * plain `playwright` scripts and stay that way.
 */
import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

/* Deliberately NOT imported from scripts/desktop-shots/retail-fixtures.mjs,
   even though that module exports the same constant.
   `tests/support/fixtures.ts` freezes `Date.now()` around its first import of
   the fixture modules so their baked-in timestamps are deterministic, and ESM
   caches by specifier — importing them here would evaluate them in the worker
   with a live clock before the test file ever got the chance. The three lines
   are duplicated so the config stays inert. Keep them in step. */
const NIX_CHROMIUM =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const CHROMIUM_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync(NIX_CHROMIUM) ? NIX_CHROMIUM : undefined);

const BASE_URL = process.env.DESKTOP_SHOT_BASE_URL ?? "http://127.0.0.1:5000";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",

  /* One worker, no parallelism. Every spec drives the same dev server through
     the same merchant, and a golden captured while a second worker is hammering
     Vite is a golden captured under a different frame budget. */
  workers: 1,
  fullyParallel: false,

  /* A retry that passes is a flake that got hidden. §7.1's whole point is that
     the suite is deterministic, so a second attempt must never rescue it. */
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 180_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  /* §7.1: "Store under tests/golden/mobile/". The template also drops
     Playwright's default `{platform}` suffix — the baselines are Chromium 125
     on Linux by construction (CHROMIUM_PATH), and a per-platform fan-out would
     invite a second, unapproved set. */
  snapshotPathTemplate: "tests/golden/mobile/{arg}{ext}",

  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      /* device, not css: the tier-1 captures run at DPR 2 precisely to catch
         subpixel drift, and `scale: "css"` would resample that away. */
      scale: "device",
      stylePath: "tests/golden/screenshot.css",
      /* §7.1: do not paper over a flake with a threshold. `threshold` is
         Playwright's per-pixel YIQ tolerance; `maxDiffPixels: 0` means no pixel
         may exceed it. If a screen cannot hold this, it gets excluded and named
         — it does not get a looser bound. */
      threshold: 0.2,
      maxDiffPixels: 0,
    },
  },

  use: {
    baseURL: BASE_URL,
    timezoneId: "Pacific/Auckland",
    locale: "en-NZ",
    /* The bundled Chromium is missing libnspr4 on this host. */
    launchOptions: { executablePath: CHROMIUM_PATH },
    trace: "off",
    video: "off",
    screenshot: "off",
  },

  /* The dev server is external and singular: this repo breaks with two of them
     (HMR token clash). `reuseExistingServer` is therefore always true, and the
     command exists only to fail loudly if :5000 is not already up — it must
     never be the thing that starts a dev server. */
  webServer: {
    command:
      "node -e \"console.error('test:golden needs the dev server already running on 127.0.0.1:5000 (npm run dev). It will not start one: two dev servers clash over the HMR token.'); process.exit(1)\"",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
