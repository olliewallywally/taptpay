/**
 * No configured public address, as in a local run: `getBaseUrl` then falls back to the
 * request itself. Import after "./test-env" (which sets PUBLIC_ORIGIN) and before anything
 * that loads config.ts; call `restoreOriginEnv` in `afterAll`, so the worker's next test
 * file sees the environment it would have seen.
 */
const ORIGIN_KEYS = ["PUBLIC_ORIGIN", "PRODUCTION_DOMAIN", "REPLIT_DOMAINS"] as const;
const saved = Object.fromEntries(ORIGIN_KEYS.map((key) => [key, process.env[key]]));
for (const key of ORIGIN_KEYS) delete process.env[key];

export function restoreOriginEnv(): void {
  for (const key of ORIGIN_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}
