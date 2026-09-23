/**
 * One trusted proxy in front of the app, as the phase B tests need. Import after
 * "./test-env" (which removes any ambient TRUST_PROXY_HOPS) and before "./http-harness"
 * (which loads config.ts). The next file's "./test-env" undoes it.
 *
 * supertest connects from 127.0.0.1, which then plays the proxy: an `X-Forwarded-For`
 * header's last entry is the address that proxy saw.
 */
process.env.TRUST_PROXY_HOPS = "1";
