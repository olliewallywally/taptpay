import type { AppEnvironment } from "./config";

const DEMO_ACCOUNT_EMAIL = "demo@tapt.co.nz";

export function isDemoAccountLoginBlocked(appEnv: AppEnvironment, email: string): boolean {
  return (
    (appEnv === "staging" || appEnv === "production") &&
    email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL
  );
}
