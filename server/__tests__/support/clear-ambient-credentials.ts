/**
 * Deletes every paired credential group in `server/config.ts` from
 * `process.env`, for its side effect on import.
 *
 * `requireCompleteGroup` (config.ts:195) throws when a group is only HALF
 * present, and `config.ts:588` freezes the config at import time — so one stray
 * variable in the ambient shell makes every suite that reaches
 * `server/routes.ts`, `server/storage.ts` or `server/config.ts` fail to LOAD,
 * before a single test runs. An operator shell with one real credential
 * exported is exactly that shape. Observed 2026-09-10: `WINDCAVE_API_KEY` set
 * without `WINDCAVE_USERNAME` took out 22 of 98 suites, and the failure looked
 * like a code defect rather than an environment one.
 *
 * Whole groups are deleted rather than completed with plausible fakes: this
 * harness is meant to reach no live system, and a half-real credential pair is
 * how it would.
 *
 * Wired as `setupFiles` in jest.server.config.cjs so it runs before any test
 * file's imports, and imported by test-env.ts for files that load it directly.
 */

export const PAIRED_CREDENTIAL_GROUPS: readonly (readonly string[])[] = [
  ["WINDCAVE_USERNAME", "WINDCAVE_API_KEY"],
  ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
  ["APNS_KEY_P8", "APNS_KEY_ID", "APNS_TEAM_ID"],
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["GOOGLE_ANALYTICS_PROPERTY_ID", "GOOGLE_ANALYTICS_SERVICE_ACCOUNT"],
  ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
  ["GMAIL_USER", "GMAIL_APP_PASSWORD"],
  ["OUTLOOK_USER", "OUTLOOK_PASS"],
  ["EVOLUTION_API_URL", "EVOLUTION_API_KEY"],
];

export function clearAmbientCredentialGroups(env: NodeJS.ProcessEnv = process.env): void {
  for (const group of PAIRED_CREDENTIAL_GROUPS) {
    for (const key of group) delete env[key];
  }
}

clearAmbientCredentialGroups();
