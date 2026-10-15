/**
 * A synthetic Sign in with Apple configuration for the sign-in tests (R1-T5). Import after
 * "./test-env" (which clears any real credentials) and before "./http-harness" (which loads
 * config.ts). No request ever reaches Apple: the tests replace fetch. The team key is made here,
 * per test file, and signs nothing but the stand-in exchange's client secret.
 */
import crypto from "node:crypto";

export const APPLE_TEST_SERVICES_ID = "nz.taptpay.signin.harness";
export const appleTeamKey = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });

process.env.APPLE_SERVICES_ID = APPLE_TEST_SERVICES_ID;
process.env.APPLE_TEAM_ID = "TEAMHARNESS";
process.env.APPLE_KEY_ID = "KEYHARNESS";
process.env.APPLE_PRIVATE_KEY = appleTeamKey.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
