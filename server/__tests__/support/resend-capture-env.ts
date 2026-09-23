/**
 * Sends a test file's email through the `resend` package, which that file mocks, so a
 * test can read exactly what would go out: recipient, subject, HTML. Import after
 * "./test-env" (which chose the simulation and deleted every real provider key) and
 * before anything that loads config.ts. The next file's "./test-env" undoes it.
 */
process.env.EMAIL_PROVIDER = "resend";
process.env.RESEND_API_KEY = "re_test_not_a_real_key";
