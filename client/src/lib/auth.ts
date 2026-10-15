// Utility functions for authentication
import { heldSession } from "./session";

/**
 * The signed-in business login, as the start-up check read it (R1-T4 phase E: the sign-in is an HttpOnly
 * cookie the page cannot read, so nothing is decoded from storage). Null before the check has answered
 * and when no one is signed in. `userId` is kept for the callers written against the old token's claims.
 */
export function getCurrentUser(): { id: number; userId: number; email: string; merchantId: number | null; role: string } | null {
  const session = heldSession("business");
  if (!session) return null;
  const { user } = session;
  return { id: user.id, userId: user.id, email: user.email, merchantId: user.merchantId, role: user.role };
}

export function getCurrentMerchantId(): number | null {
  const user = getCurrentUser();
  return user?.merchantId || null;
}
