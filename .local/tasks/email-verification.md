# Merchant Email Verification

## What & Why
When a merchant signs up, they should be required to confirm their email address before they can continue to the business details step. This ensures every merchant is providing a real, accessible email address they control. Currently a verification email is sent but the merchant can proceed to business details without ever clicking the link.

## Done looks like
- After completing the first signup step (name/email/password), the merchant sees a "Check your email" screen — not immediately redirected to business details
- The email contains a simple "Confirm your email" button that links to a confirm-email route
- Clicking that link marks the email as verified in the DB and redirects the merchant to the business details page (`/business-details?id=xxx`)
- If a merchant tries to access `/business-details` without having verified their email, they see a prompt to check their inbox (not an error wall — just a soft gate with a resend option)
- Admin can see an "Email Verified" indicator on each merchant's detail page
- Existing verified/active merchants are automatically treated as email-verified (no disruption to anyone already onboarded)
- A "Resend verification email" button is available on the check-your-email screen

## Out of scope
- Blocking login after email verification (merchants can log in regardless — this gate is specifically for the signup-to-business-details journey)
- Expiring verification tokens (tokens stay valid until used)
- Changing the admin-invite flow (that flow is separate and unaffected)

## Tasks
1. **Add emailVerified column** — Add `emailVerified boolean default false` to the merchants DB schema and push the migration. Automatically set `emailVerified: true` for all merchants whose status is already `active` or `verified` so existing onboarded merchants aren't disrupted.

2. **New confirm-email endpoint** — Add `GET /api/auth/confirm-email?token=xxx` that looks up the merchant by `verificationToken`, sets `emailVerified: true`, and returns the merchant ID so the frontend can redirect to `/business-details?id=xxx`. No password required (unlike the old admin-invite verify endpoint).

3. **Update verification email template** — Change `sendMerchantVerificationEmail` to send a clean "Confirm your email address" email in TaptPay branding (matching the existing dark/cyan style). The link should point to the frontend route `/confirm-email?token=xxx`. Update the subject line.

4. **Check-your-email screen and confirm-email page** — After successful signup, redirect to `/check-email?email=xxx` instead of `/business-details`. This page shows the merchant's masked email address, a "Resend" button, and tells them to check their inbox. Add a `/confirm-email` frontend page that calls the confirm-email API on load and then redirects to `/business-details?id=xxx` on success (or shows an error on invalid token).

5. **Soft gate on business-details page** — On the `/business-details` page, fetch the merchant record and check `emailVerified`. If not verified, show a banner ("Please verify your email to continue") with a Resend button rather than the form. Once verified the form appears normally.

6. **Admin visibility** — Show an "Email Verified" / "Email Unverified" badge on the admin merchant detail page alongside account info.

## Relevant files
- `shared/schema.ts:20-35`
- `server/routes.ts:3750-3800`
- `server/email-service-multi.ts:183-260`
- `client/src/pages/merchant-signup.tsx`
- `client/src/pages/business-details.tsx`
- `client/src/pages/admin/MerchantDetail.tsx`
- `client/src/App.tsx`
