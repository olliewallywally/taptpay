import fs from "node:fs";
import path from "node:path";
import { clearAmbientCredentialGroups } from "./support/clear-ambient-credentials";

/**
 * The server test harness must reach no live system. Observed 2026-09-21: a real
 * RESEND_API_KEY in the workspace environment sent the team-invite resend test to
 * the real email provider (the sandbox blocked the call, so the route answered
 * 502 and the test failed; with network access it would have sent the email).
 * A key that works on its own never crashed config the way half a credential
 * pair does, so nothing had cleared it — and Twilio's SMS credentials were not
 * cleared either.
 */

it("clears the email and SMS provider credentials", () => {
  const env: NodeJS.ProcessEnv = {
    RESEND_API_KEY: "re_synthetic",
    TWILIO_ACCOUNT_SID: "ACsynthetic",
    TWILIO_AUTH_TOKEN: "synthetic",
    TWILIO_FROM_NUMBER: "+6400000000",
    TWILIO_MESSAGING_SERVICE_SID: "MGsynthetic",
    UNRELATED_SETTING: "kept",
  };
  clearAmbientCredentialGroups(env);
  expect(env).toEqual({ UNRELATED_SETTING: "kept" });
});

// Clearing the real key exposed two suites (ENV_VALIDATION_MODE=enforce, needed
// for money-capability flags) that only loaded because it was present: strict
// mode demands a key for the default provider. CI has no key, so they could never
// have loaded there. Tests use the built-in simulated provider instead.
it("routes every test email to the built-in simulation, so no suite needs or reaches a real account", async () => {
  await import("./support/test-env");
  const { config } = await import("../config");
  expect(config.email.provider).toBe("simulation");
  expect(config.email.resendApiKey).toBeFalsy();
});

it("clears every provider secret server/config.ts reads, so a new provider cannot slip past", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "config.ts"), "utf8");
  const read = new Set([
    ...[...source.matchAll(/nonempty\(env,\s*"([A-Z0-9_]+)"\)/g)].map((m) => m[1]),
    ...[...source.matchAll(/\benv\.([A-Z0-9_]{4,})\b/g)].map((m) => m[1]),
  ]);
  const secrets = [...read]
    .filter((name) => /(?:_API_KEY|_AUTH_TOKEN|_PASS|_PASSWORD|_PRIVATE_KEY|_KEY_P8|_SERVICE_ACCOUNT|_CLIENT_SECRET)$/.test(name))
    .sort();
  expect(secrets.length).toBeGreaterThan(5); // the pattern still finds config.ts's secrets

  const env: NodeJS.ProcessEnv = Object.fromEntries(secrets.map((name) => [name, "synthetic"]));
  clearAmbientCredentialGroups(env);
  expect(Object.keys(env)).toEqual([]);
});
