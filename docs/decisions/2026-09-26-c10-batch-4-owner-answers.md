# Owner answers — the C10 route review's batch 4 questions (2026-09-26)

Date: 2026-09-26 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `867ef275`).
Asked in one question set after batch 4 of the C10 route review (the platform admin's 29 routes,
`8c40d067`, `4ed2e145`); the answers are the options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "Eleven admin server addresses are used by no admin screen: 2 placeholders that just answer \"gone\", 5 placeholders for an API-key admin that was never built, an old subscription-revenue figure (your overview already shows it), \"edit business details\", \"delete a business\" (which can't actually delete anything today, since every real business is protected by its login and subscription), and a debugging leftover with three email addresses written into it. Retire them?" | **"Retire all 11 (Recommended)"** — "Removes the unused addresses. Nothing on any screen changes." |
| 2 | "Two admin addresses let you choose a business's password, so you would know it. \"Create a business\" has no screen (its page was unplugged). \"Activate an application with a password\" has no screen either, but today it is the only way to let in an old applicant who signed up before sign-up asked for a password (the confirm page tells those people to email support). What should happen to them?" | **"Retire create, keep activate (Recommended)"** — "New businesses sign up themselves. Support keeps a way to let in old applicants until an emailed \"set your password\" link replaces it." |
| 3 | "Two admin email tools have no screen: \"email status\" (shows which email services are set up; harmless) and \"send me a test email\" (when sending fails, it shows the email service's raw error). What should happen to them?" | **"Keep status, retire test (Recommended)"** — "The status stays for checking by hand; the test email goes." |
| 4 | "On a business's admin page, \"Verify\" only shows for a new application and \"Activate Account\" only for a verified business. The server doesn't check this: Verify can knock an active business back to verified, and Activate can let in an application whose email was never confirmed. Make the server match the buttons?" | **"Yes, match the buttons (Recommended)"** — "Verify only a waiting application, Activate only a verified business; anything else is refused and nothing changes." |

## Background

All from batch 4's reviews (`4ed2e145`, `server/route-review.ts`) and the working notes
(`docs/evidence/remediation-v2-2/r1/WORKING-2026-09-26-r1-t2-c10.md`, "Step 3, batch 4").

- 1: the 11 routes are `POST /api/admin/merchants` and `POST /api/merchants/:id/test-payment-link`
  (both answer 410); `GET /api/admin/api-keys`, `POST /api/admin/api-keys`,
  `POST /api/admin/api-keys/:keyId/revoke`, `GET /api/admin/api-metrics` and
  `GET /api/admin/api-usage` (all answer 404 "Ecommerce API is unavailable");
  `GET /api/admin/subscription-revenue` (the overview gets the same figures from
  `GET /api/admin/analytics`); `PUT /api/admin/merchants/:id` (no body schema);
  `DELETE /api/admin/merchants/:id` (the database refuses every business the app makes: shown with
  `scripts/verify-admin-business-delete-postgres.ts`); `POST /api/admin/clear-merchants` (three
  email addresses written in; deletes from the in-memory storage only). Their only callers are
  pages mounted nowhere.
- 2: "create a business" is `POST /api/admin/merchants/signup` (its page, `create-merchant.tsx`, is
  declared in `App.tsx` and routed nowhere). "Activate an application with a password" is
  `POST /api/admin/merchants/:id/activate`: the confirm page answers an application with no chosen
  password with `NO_PASSWORD_CHOSEN` ("email support"), and verify refuses such a business, naming
  this route.
- 3: `GET /api/admin/email-status` stays; `POST /api/admin/test-email` goes.
- 4: "Verify" is `POST /api/admin/merchants/:id/verify` (the page shows it for status `pending`);
  "Activate Account" is `POST /api/admin/merchants/:id/set-active` (the page shows it for status
  `verified`). The routes refused only "already verified" and "already active".

## What this authorizes

- Code and tests on this branch, tests first. No deploy or push.
- Removing a route also removes its review entry and regenerates the route policy. The pages
  mounted nowhere that called the removed routes are dead code already; removing them was not asked.
- Keeping activate records the owner's reason in its review: support's path for old applications
  until an emailed set-password link replaces it (not built; for the account-security work).

## Outcome (same day, local commits, not pushed)

- 1–3, **`8aad300b`**: 13 routes removed (203 remain). The 11 of answer 1; the admin sign-up
  (answer 2; `createMerchantSchema` is no longer imported by the routes); the test email (answer 3).
  The three email addresses written into clear-merchants are gone from the code with it. Activate
  and the email status stay, and their reviews record why. The pages mounted nowhere that called
  the removed routes are left as they were.
- 4, **`51feb200`**: verify accepts only a waiting application, set-active only a verified business;
  any other state is 409 and changes nothing ("already verified" and "already active" stay 400).
  Two older parameter tests had used exactly the refused transitions as fixtures; they now use the
  states the page offers.
- Both tests first, with mutations (5/5 and 4/4). Server 103/1,775; `tsc` clean.
