/**
 * The account token the app held before sessions (R1-T4 phase E3 retired it): a one-hour JWT signed
 * with the server's secret, sent as `Authorization: Bearer`. These mint one exactly as the server did
 * (server/auth.ts `generateToken`, to 2026-10-01), correctly signed and unexpired, so a test can show
 * the server no longer takes it for a sign-in.
 *
 * MUST be imported only from a test file that imported "./test-env" first (it sets JWT_SECRET).
 */
import jwt from "jsonwebtoken";
import type { Principal } from "./http-harness";

const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("fixture: JWT_SECRET is not set — check server/__tests__/support/test-env.ts");
  return value;
};

/** A business login's old token, under the session version the login has now. */
export function oldAccountToken(principal: Pick<Principal, "user" | "merchantId">): string {
  const { user } = principal;
  return jwt.sign(
    {
      principal: "user",
      userId: user.userId ?? user.id,
      email: user.email,
      merchantId: principal.merchantId,
      role: user.role === "merchant" ? "owner" : user.role,
      sv: user.sessionVersion ?? 0,
    },
    secret(),
    { expiresIn: "1h" },
  );
}

/** The platform admin's old token. */
export function oldAdminToken(): string {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("fixture: ADMIN_EMAIL is not set — check server/__tests__/support/test-env.ts");
  return jwt.sign({ principal: "admin", userId: 1, email, merchantId: 0, role: "admin" }, secret(), { expiresIn: "1h" });
}

/** The header the app sent it in. */
export const oldBearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });
