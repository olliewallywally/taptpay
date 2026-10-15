import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import jwt from "jsonwebtoken";
import {
  BOOLEAN_ENV_KEYS,
  loadConfig,
  parseStrictBoolean,
  PRODUCTION_WINDCAVE_ENDPOINT,
  UAT_WINDCAVE_ENDPOINT,
} from "../config";

const BASE_ENV = {
  ENV_VALIDATION_MODE: "enforce",
  APP_ENV: "test",
  DATABASE_TARGET: "ci",
  DATABASE_URL: "postgresql://config-test.invalid/taptpay",
  JWT_SECRET: "test-only-independent-jwt-secret-0000000000",
  PAYMENT_RETURN_STATE_SECRET: "test-only-payment-state-secret-1111111111",
  CRON_SECRET: "test-only-cron-secret-22222222222222222222",
  PAYMENT_MODE: "disabled",
  PUBLIC_ORIGIN: "https://test.taptpay.invalid",
  RESEND_API_KEY: "test-only-resend-key",
} as const;

describe("fail-closed runtime configuration", () => {
  test.each([
    [undefined, false],
    ["false", false],
    ["FALSE", false],
    ["true", true],
    ["TRUE", true],
  ])("strict boolean parser maps %p to %p", (raw, expected) => {
    expect(parseStrictBoolean("TEST_BOOLEAN", raw, false)).toBe(expected);
  });

  test.each(["", "0", "junk"])("strict boolean parser rejects %p without echoing it", (raw) => {
    expect(() => parseStrictBoolean("TEST_BOOLEAN", raw, false)).toThrow("TEST_BOOLEAN");
  });

  test.each(BOOLEAN_ENV_KEYS)("%s uses the strict boolean grammar", (key) => {
    const falseConfig = loadConfig({ ...BASE_ENV, [key]: "FALSE" });
    expect(falseConfig.rawBooleans[key]).toBe(false);

    const trueAttempt = () => loadConfig({ ...BASE_ENV, [key]: "TRUE" });
    if (key === "FEATURE_CRYPTO") {
      expect(trueAttempt).toThrow("FEATURE_CRYPTO");
    } else {
      expect(trueAttempt).not.toThrow();
      expect(trueAttempt().rawBooleans[key]).toBe(true);
    }

    for (const invalid of ["", "0", "junk"]) {
      expect(() => loadConfig({ ...BASE_ENV, [key]: invalid })).toThrow(key);
    }
    expect(loadConfig({ ...BASE_ENV, [key]: undefined }).rawBooleans[key]).toBe(false);
  });

  const environments = ["test", "development", "staging", "production"] as const;
  const paymentModes = ["disabled", "simulation", "uat", "production"] as const;
  const allowedModes = {
    test: ["disabled", "simulation"],
    development: ["disabled", "simulation", "uat"],
    staging: ["disabled", "uat"],
    production: ["disabled", "production"],
  };

  test.each(environments.flatMap((appEnv) => paymentModes.map((paymentMode) => [appEnv, paymentMode] as const)))(
    "enforces the full APP_ENV=%s / PAYMENT_MODE=%s matrix", (appEnv, paymentMode) => {
    const source = {
      ...BASE_ENV,
      APP_ENV: appEnv,
      DATABASE_TARGET: appEnv === "test" ? "ci" : appEnv === "development" ? "local" : appEnv,
      PAYMENT_MODE: paymentMode,
      WINDCAVE_ENDPOINT: paymentMode === "production" ? PRODUCTION_WINDCAVE_ENDPOINT : UAT_WINDCAVE_ENDPOINT,
      WINDCAVE_USERNAME: "synthetic-user",
      WINDCAVE_API_KEY: "synthetic-key",
      FEATURE_LIVE_WINDCAVE: "true",
      FEATURE_PROVIDER_RECONCILIATION: "true",
    };
    if (allowedModes[appEnv].includes(paymentMode)) {
      expect(loadConfig(source).paymentMode).toBe(paymentMode);
    } else {
      expect(() => loadConfig(source)).toThrow(expect.objectContaining({
        name: "ConfigValidationError", key: "PAYMENT_MODE",
      }));
    }
  });

  test.each(environments.flatMap((appEnv) => ["audit", "enforce"].map((mode) => [appEnv, mode] as const)))(
    "rejects FEATURE_CRYPTO=true in %s with %s validation", (appEnv, envValidationMode) => {
    expect(() => loadConfig({
      ...BASE_ENV,
      APP_ENV: appEnv,
      DATABASE_TARGET: appEnv === "test" ? "ci" : appEnv === "development" ? "local" : appEnv,
      ENV_VALIDATION_MODE: envValidationMode,
      FEATURE_CRYPTO: "true",
    })).toThrow(expect.objectContaining({ key: "FEATURE_CRYPTO" }));
  });

  test("rejects a partial Windcave credential pair even in audit mode", () => {
    expect(() => loadConfig({
      ...BASE_ENV,
      ENV_VALIDATION_MODE: "audit",
      WINDCAVE_USERNAME: "configured-user",
    })).toThrow("Windcave credentials");
  });

  test("requires exact UAT configuration and a complete credential pair", () => {
    const uatBase = {
      ...BASE_ENV,
      APP_ENV: "development",
      DATABASE_TARGET: "local",
      PAYMENT_MODE: "uat",
      PUBLIC_ORIGIN: "https://dev.taptpay.test",
      FEATURE_PROVIDER_RECONCILIATION: "true",
    };
    expect(() => loadConfig(uatBase)).toThrow("WINDCAVE_ENDPOINT");
    expect(() => loadConfig({
      ...uatBase,
      WINDCAVE_ENDPOINT: "https://example.invalid/api/v1",
      WINDCAVE_USERNAME: "configured-user",
      WINDCAVE_API_KEY: "configured-key",
    })).toThrow("WINDCAVE_ENDPOINT");
    expect(() => loadConfig({
      ...uatBase,
      WINDCAVE_ENDPOINT: "https://uat.windcave.com/api/v1",
      WINDCAVE_USERNAME: "configured-user",
      WINDCAVE_API_KEY: "configured-key",
    })).not.toThrow();
  });

  test("requires enforce mode, the live flag and exact production provider settings", () => {
    const production = {
      ...BASE_ENV,
      APP_ENV: "production",
      DATABASE_TARGET: "production",
      PAYMENT_MODE: "production",
      PUBLIC_ORIGIN: "https://taptpay.co.nz",
      ENV_VALIDATION_MODE: "enforce",
      WINDCAVE_ENDPOINT: "https://sec.windcave.com/api/v1",
      WINDCAVE_USERNAME: "configured-user",
      WINDCAVE_API_KEY: "configured-key",
      FEATURE_PROVIDER_RECONCILIATION: "true",
    };
    expect(() => loadConfig(production)).toThrow("FEATURE_LIVE_WINDCAVE");
    expect(() => loadConfig({ ...production, FEATURE_LIVE_WINDCAVE: "true" })).not.toThrow();
    expect(() => loadConfig({
      ...production,
      FEATURE_LIVE_WINDCAVE: "true",
      ENV_VALIDATION_MODE: "audit",
    })).toThrow("ENV_VALIDATION_MODE");
  });

  test("enabled payment initiation requires an independent return-state secret", () => {
    expect(() => loadConfig({
      ...BASE_ENV,
      PAYMENT_MODE: "simulation",
      PAYMENT_RETURN_STATE_SECRET: undefined,
    })).toThrow("PAYMENT_RETURN_STATE_SECRET");
    expect(() => loadConfig({
      ...BASE_ENV,
      PAYMENT_RETURN_STATE_SECRET: BASE_ENV.JWT_SECRET,
    })).toThrow("PAYMENT_RETURN_STATE_SECRET");
  });

  test("scheduled capabilities require a cron secret", () => {
    expect(() => loadConfig({
      ...BASE_ENV,
      FEATURE_SUBSCRIPTION_CHARGING: "true",
      CRON_SECRET: undefined,
    })).toThrow("CRON_SECRET");
  });

  test("allows the development MemStorage path but requires a database in production", () => {
    expect(() => loadConfig({
      ...BASE_ENV,
      APP_ENV: "development",
      DATABASE_TARGET: "local",
      DATABASE_URL: undefined,
    })).not.toThrow();
    expect(() => loadConfig({
      ...BASE_ENV,
      APP_ENV: "production",
      DATABASE_TARGET: "production",
      DATABASE_URL: undefined,
    })).toThrow("DATABASE_URL");
  });

  test("rejects demo seeding in staging and production", () => {
    for (const appEnv of ["staging", "production"] as const) {
      expect(() => loadConfig({
        ...BASE_ENV,
        APP_ENV: appEnv,
        DATABASE_TARGET: appEnv,
        SEED_DEMO_DATA: "true",
      })).toThrow("SEED_DEMO_DATA");
    }
  });

  test("audit may warn for an inventoried optional email group; enforce stops", () => {
    const audit = loadConfig({
      ...BASE_ENV,
      ENV_VALIDATION_MODE: "audit",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: undefined,
    });
    expect(audit.diagnostics).toContainEqual(expect.objectContaining({
      key: "RESEND_API_KEY",
      group: "email",
    }));
    expect(() => loadConfig({
      ...BASE_ENV,
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: undefined,
    })).toThrow("RESEND_API_KEY");
  });

  test("security-critical failures remain fatal in audit mode", () => {
    expect(() => loadConfig({
      ...BASE_ENV,
      ENV_VALIDATION_MODE: "audit",
      APP_ENV: "production",
      DATABASE_TARGET: "production",
      JWT_SECRET: undefined,
    })).toThrow("JWT_SECRET");
  });

  test("requires explicit application and validation modes outside the Jest seam", () => {
    expect(() => loadConfig({
      ...BASE_ENV,
      APP_ENV: undefined,
      ENV_VALIDATION_MODE: undefined,
      JEST_WORKER_ID: undefined,
    })).toThrow("ENV_VALIDATION_MODE");
    expect(() => loadConfig({
      ...BASE_ENV,
      APP_ENV: undefined,
      JEST_WORKER_ID: undefined,
    })).toThrow("APP_ENV");
  });

  test("returns a deeply immutable configuration snapshot", () => {
    const loaded = loadConfig(BASE_ENV);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.features)).toBe(true);
    expect(Object.isFrozen(loaded.email)).toBe(true);
    expect(Object.isFrozen(loaded.diagnostics)).toBe(true);
  });

  test("configuration failures name keys but never include their values", () => {
    const sensitiveValue = "do-not-echo-this-value";
    try {
      loadConfig({ ...BASE_ENV, SMTP_SECURE: sensitiveValue });
      throw new Error("expected loadConfig to fail");
    } catch (error) {
      expect(String(error)).toContain("SMTP_SECURE");
      expect(String(error)).not.toContain(sensitiveValue);
    }
  });
});

describe("local JWT signing secret", () => {
  test.each(["development", "test"])("%s without a configured secret uses a random key", (appEnv) => {
    const loaded = loadConfig({
      ...BASE_ENV,
      APP_ENV: appEnv,
      DATABASE_TARGET: appEnv === "development" ? "local" : "ci",
      JWT_SECRET: undefined,
    });
    expect(loaded.jwtSecret).toMatch(/^[a-f0-9]{64}$/);
    const forged = jwt.sign({ userId: 1 }, "dev-only-jwt-secret-not-for-production");
    expect(() => jwt.verify(forged, loaded.jwtSecret)).toThrow();
  });

  test("reloading local configuration preserves this process's fallback key", () => {
    const local = { ...BASE_ENV, JWT_SECRET: undefined };
    const first = loadConfig(local);
    const second = loadConfig(local);
    const token = jwt.sign({ userId: 1 }, first.jwtSecret);
    expect(jwt.verify(token, second.jwtSecret)).toEqual(expect.objectContaining({ userId: 1 }));
  });

  test("separate processes generate independent fallback keys", () => {
    // Hashes let this check compare keys without exposing any signing key in output.
    const configUrl = pathToFileURL(path.resolve(__dirname, "../config.ts")).href;
    const script = `
      import { createHash } from 'node:crypto';
      import { config } from ${JSON.stringify(configUrl)};
      process.stdout.write(createHash('sha256').update(config.jwtSecret).digest('hex'));
    `;
    const launch = () => {
      const result = spawnSync(process.execPath, ["--import=tsx", "--input-type=module", "-e", script], {
        cwd: path.resolve(__dirname, "../.."),
        env: { APP_ENV: "test", ENV_VALIDATION_MODE: "audit" },
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^[a-f0-9]{64}$/);
      return result.stdout;
    };
    expect(launch()).not.toBe(launch());
  });

  test("an explicitly configured local secret remains unchanged", () => {
    expect(loadConfig(BASE_ENV).jwtSecret).toBe(BASE_ENV.JWT_SECRET);
  });

  test.each(["staging", "production"].flatMap((appEnv) =>
    ["audit", "enforce"].map((mode) => [appEnv, mode] as const),
  ))("%s in %s mode still requires a configured strong key", (appEnv, mode) => {
    const source = { ...BASE_ENV, APP_ENV: appEnv, DATABASE_TARGET: appEnv, ENV_VALIDATION_MODE: mode };
    for (const secret of [undefined, "", "short-local-key"]) {
      expect(() => loadConfig({ ...source, JWT_SECRET: secret })).toThrow("JWT_SECRET");
    }
    expect(loadConfig(source).jwtSecret).toBe(BASE_ENV.JWT_SECRET);
  });
});

// R1-T4 phase B (owner decision 2026-09-21, Q4: off until checked on the live deployment).
describe("TRUST_PROXY_HOPS", () => {
  test("unset means unknown: no proxy is trusted and address limits stay off", () => {
    expect(loadConfig(BASE_ENV).trustProxyHops).toBeNull();
    expect(loadConfig({ ...BASE_ENV, TRUST_PROXY_HOPS: "" }).trustProxyHops).toBeNull();
  });

  test.each([["0", 0], ["1", 1], ["2", 2], ["9", 9]])("%p is %p hops", (raw, hops) => {
    const loaded = loadConfig({ ...BASE_ENV, TRUST_PROXY_HOPS: raw });
    expect(loaded.trustProxyHops).toBe(hops);
    expect(loaded.diagnostics.some(({ key }) => key === "TRUST_PROXY_HOPS")).toBe(false);
  });

  test.each(["development", "test", "staging", "production"].flatMap((appEnv) =>
    ["audit", "enforce"].map((mode) => [appEnv, mode] as const),
  ))("unknown proxy topology warns without blocking %s in %s mode", (appEnv, mode) => {
    const loaded = loadConfig({
      ...BASE_ENV,
      APP_ENV: appEnv,
      DATABASE_TARGET: appEnv === "development" ? "local" : appEnv === "test" ? "ci" : appEnv,
      ENV_VALIDATION_MODE: mode,
    });
    expect(loaded.trustProxyHops).toBeNull();
    const diagnostic = loaded.diagnostics.find(({ key }) => key === "TRUST_PROXY_HOPS");
    expect(diagnostic).toEqual({
      key: "TRUST_PROXY_HOPS",
      group: "network",
      message: "TRUST_PROXY_HOPS is unset: IP-based authentication limits are disabled until the proxy topology is verified. Account and device limits remain active.",
    });
    expect(JSON.stringify(loaded.diagnostics)).not.toContain(BASE_ENV.JWT_SECRET);
  });

  test.each(["-1", "10", "1.5", "01", " 1", "one", "true"])("refuses %p", (raw) => {
    expect(() => loadConfig({ ...BASE_ENV, TRUST_PROXY_HOPS: raw })).toThrow(/TRUST_PROXY_HOPS/);
  });
});

// R1-T7 S6a (owner decision 2026-09-29: "Add ClamAV on the server").
describe("the upload scanner", () => {
  const live = (appEnv: "staging" | "production") => ({
    ...BASE_ENV, APP_ENV: appEnv, DATABASE_TARGET: appEnv, PUBLIC_ORIGIN: "https://taptpay.co.nz",
  });

  test("ClamAV is the default, on its standard port, with no host until one is set", () => {
    expect(loadConfig(BASE_ENV).uploads).toEqual({ scanner: "clamav", clamavHost: undefined, clamavPort: 3310 });
  });

  test("a host and port are read as given", () => {
    expect(loadConfig({ ...BASE_ENV, CLAMAV_HOST: "clamav.internal", CLAMAV_PORT: "3311" }).uploads)
      .toEqual({ scanner: "clamav", clamavHost: "clamav.internal", clamavPort: 3311 });
  });

  test.each(["0", "65536", "33.1", "port", "-1", " 3310"])("port %p is refused", (port) => {
    expect(() => loadConfig({ ...BASE_ENV, CLAMAV_PORT: port })).toThrow(/CLAMAV_PORT/);
  });

  test("an unknown scanner is refused without echoing it", () => {
    try {
      loadConfig({ ...BASE_ENV, UPLOAD_SCANNER: "do-not-echo-this-value" });
      throw new Error("expected loadConfig to fail");
    } catch (error) {
      expect(String(error)).toContain("UPLOAD_SCANNER");
      expect(String(error)).not.toContain("do-not-echo-this-value");
    }
  });

  test("the stand-in is for development and tests", () => {
    expect(loadConfig({ ...BASE_ENV, UPLOAD_SCANNER: "simulation" }).uploads.scanner).toBe("simulation");
    expect(loadConfig({ ...BASE_ENV, APP_ENV: "development", DATABASE_TARGET: "local", UPLOAD_SCANNER: "simulation" }).uploads.scanner).toBe("simulation");
  });

  test.each(["staging", "production"] as const)("the stand-in is refused in %s, even in audit mode", (appEnv) => {
    expect(loadConfig({ ...live(appEnv), UPLOAD_SCANNER: "clamav" }).uploads.scanner).toBe("clamav");
    expect(() => loadConfig({ ...live(appEnv), UPLOAD_SCANNER: "simulation" })).toThrow(/UPLOAD_SCANNER/);
    expect(() => loadConfig({ ...live(appEnv), ENV_VALIDATION_MODE: "audit", UPLOAD_SCANNER: "simulation" })).toThrow(/UPLOAD_SCANNER/);
  });
});
