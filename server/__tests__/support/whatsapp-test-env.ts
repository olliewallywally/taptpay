/**
 * A synthetic Evolution (WhatsApp) API credential pair for the webhook tests.
 * Import after "./test-env" (which clears any real credentials) and before
 * "./http-harness" (which loads config.ts). No request reaches Evolution: the
 * webhook only receives.
 */
process.env.EVOLUTION_API_URL = "https://evolution.harness.invalid";
process.env.EVOLUTION_API_KEY = "harness-evolution-key-not-a-real-credential";

export const HARNESS_EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
