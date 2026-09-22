/**
 * A synthetic Google OAuth client for the sign-in tests. Import after "./test-env"
 * (which clears any real credentials) and before "./http-harness" (which loads
 * config.ts). No request ever reaches Google: the tests replace fetch.
 */
process.env.GOOGLE_CLIENT_ID = "harness-google-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "harness-google-client-secret-not-a-real-credential";
