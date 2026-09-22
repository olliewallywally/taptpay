/**
 * A synthetic web-push key pair for the push tests, generated per run. Import after
 * "./test-env" (which clears any real credentials) and before "./http-harness"
 * (which loads config.ts). No notification is ever delivered by these tests.
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
