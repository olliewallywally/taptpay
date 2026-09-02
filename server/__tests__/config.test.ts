import {
  BOOLEAN_ENV_KEYS,
  ConfigValidationError,
  loadConfig,
  parseStrictBoolean,
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

  test.each([
    ["test", "uat"],
    ["test", "production"],
    ["development", "production"],
    ["staging", "simulation"],
    ["staging", "production"],
    ["production", "simulation"],
    ["production", "uat"],
  ])("rejects APP_ENV=%s with PAYMENT_MODE=%s", (appEnv, paymentMode) => {
    expect(() => loadConfig({
      ...BASE_ENV,
      APP_ENV: appEnv,
      DATABASE_TARGET: appEnv,
      PAYMENT_MODE: paymentMode,
    })).toThrow(ConfigValidationError);
  });

  test("rejects FEATURE_CRYPTO=true in every environment", () => {
    expect(() => loadConfig({ ...BASE_ENV, FEATURE_CRYPTO: "true" })).toThrow("FEATURE_CRYPTO");
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
