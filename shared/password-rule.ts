// Owner decision 2026-09-23: every new password — sign-up, team invites, email
// verification, admin-created accounts, reset and change — needs at least 8
// characters, a capital letter, and a number or symbol (a space is not a symbol).
// Sign-in does not apply it: a password set under an older rule keeps working
// until it is changed.
//
// No imports: the sign-up page loads with the app, and this must not bring the
// database schema with it.
export const PASSWORD_RULE = "Use at least 8 characters, including a capital letter and a number or symbol.";

export function meetsPasswordRule(password: string): boolean {
  return Array.from(password).length >= 8
    && /\p{Lu}/u.test(password)
    && /[\p{N}\p{P}\p{S}]/u.test(password);
}
