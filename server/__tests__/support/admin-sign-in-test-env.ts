/**
 * A real admin password for the sign-in tests. Import after "./test-env" (whose
 * ADMIN_PASSWORD_HASH is a placeholder no password matches) and before
 * "./http-harness" (which loads config.ts).
 */
import bcrypt from "bcrypt";

export const ADMIN_TEST_PASSWORD = "Harness-admin-password-1";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_TEST_PASSWORD, 4);
