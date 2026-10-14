import "./support/test-env";
import { loadConfig } from "../config";

const base = {
  APP_ENV: "test", DATABASE_TARGET: "ci", PAYMENT_MODE: "disabled",
  ENV_VALIDATION_MODE: "enforce", DATABASE_URL: "postgresql://config-test.invalid/taptpay",
  JWT_SECRET: "test-only-independent-jwt-secret-0000000000",
  PAYMENT_RETURN_STATE_SECRET: "test-only-payment-state-secret-1111111111",
  CRON_SECRET: "test-only-cron-secret-22222222222222222222",
  PUBLIC_ORIGIN: "https://test.taptpay.invalid", RESEND_API_KEY: "synthetic-resend-key",
};

describe("R5 encryption configuration refuses an unusable reader", () => {
  test.each(["audit", "enforce"])("missing keyring blocks read-compatible in %s mode", mode => {
    expect(() => loadConfig({ ...base, ENV_VALIDATION_MODE: mode, DATA_ENCRYPTION_STAGE: "read-compatible" }))
      .toThrow(expect.objectContaining({ name: "ConfigValidationError", group: "encryption" }));
  });

  test.each(["write", "contract", "TRUE", "", "read-compatible "])("unimplemented/invalid stage %p cannot activate writes", stage => {
    expect(() => loadConfig({ ...base, DATA_ENCRYPTION_STAGE: stage }))
      .toThrow(expect.objectContaining({ name: "ConfigValidationError", key: "DATA_ENCRYPTION_STAGE" }));
  });

  test("default legacy mode has no generated encryption key", () => {
    expect((loadConfig(base) as any).dataEncryption.describe())
      .toEqual({ stage: "legacy", configured: false, readableKeyCount: 0 });
  });
});
