# Sign in with Apple: setting it up, running it, and its keys

Owner decision 2026-09-29 (answer 2): Sign in with Apple is built and tested with
stand-ins; **it goes live once the owner has set up Apple and tried it on an iPhone**.
App Store guideline 4.8 asks for it wherever Google sign-in is offered. Plan and
preflights: `docs/PLAN-2026-10-04-r1-t5-sign-in-with-apple.md` (R1-T5).

Nothing in this file has been done against a real Apple account. Every check so far
used a stand-in for Apple.

## What the owner sets up at Apple (once)

In the Apple Developer account, under Certificates, Identifiers & Profiles:

1. **An App ID** with the "Sign in with Apple" capability switched on (the iPhone app's
   own identifier). Apple groups the website's identifier under it.
2. **A Services ID** (Identifiers, Services IDs). Its identifier is what Apple calls the
   client id for the website. Switch on "Sign in with Apple" and configure it:
   - primary App ID: the one above;
   - **Domains and Subdomains**: the site's host name only, for example
     `taptpay.co.nz` (no `https://`, no path);
   - **Return URLs**: exactly `https://<the public origin>/api/auth/apple/callback`.
     Apple accepts only https and a real domain here, never `localhost` or an address.
     One return URL serves both signing in and connecting from Settings.
3. **A key** (Keys, add) with "Sign in with Apple" switched on for that App ID. Apple
   lets the `.p8` file be downloaded **once**; note its Key ID.
4. **The Team ID** (Membership details).
5. **Sender addresses for Hide My Email** (Services, Sign in with Apple for Email
   Communication): register the domain and the exact "from" addresses TaptPay's emails
   use. Until this is done, a business that signed up with a relay address
   (`…@privaterelay.appleid.com`) gets **no email** from TaptPay.

## What the app needs

Four settings, all or none, plus the public origin:

| Setting | Meaning |
|---|---|
| `APPLE_SERVICES_ID` | The Services ID's identifier (the client id) |
| `APPLE_TEAM_ID` | The Team ID |
| `APPLE_KEY_ID` | The key's ID |
| `APPLE_PRIVATE_KEY` | The contents of the `.p8` file (a P-256 key in PEM form; `\n` may stand for line breaks) |
| `PUBLIC_ORIGIN` | The site's one https origin; required whenever the four are set |

With all four set and an https origin, `GET /api/auth/apple/available` answers
`{ "available": true }`, the login page shows "Continue with Apple", and an owner's
Settings (Account) offers "Sign in with Apple". With none set, neither appears and every
Apple route says so. Some but not all of the four, or a key that is not Apple's P-256
key, is a configuration error and the app does not start. `PUBLIC_ORIGIN` must be the
origin of the return URL registered at Apple, exactly: the app builds the return address
from it.

The app keeps no Apple token. It keeps one row per Apple identity
(`apple_identities`, migration `0033`): Apple's issuer, the Services ID, Apple's stable
subject for the person, the login it signs in (or none, when pending), the address
Apple gave the first time and whether that is a relay address.

## The checks to make on a real iPhone before it is called live

In Safari on the iPhone, and again inside the TaptPay app:

1. The login page shows Google's and Apple's buttons at the same size.
2. Sign in with Apple with an Apple account TaptPay has never seen, sharing the real
   email: a new business is made and its set-up (onboarding) opens.
3. Sign out, sign in with Apple again: the same business opens. (Apple sends no name or
   email this time; that is expected.)
4. The same with another Apple account choosing **Hide My Email**: a new business whose
   address ends `@privaterelay.appleid.com`; a TaptPay email (password reset) reaches
   the real inbox once the sender addresses are registered.
5. Cancel at Apple's screen: back on the login page with "Apple sign in was cancelled".
6. With an Apple account whose email already has a TaptPay login: **no sign-in**, and
   the message "That email already has a TaptPay login. Sign in, then connect Apple in
   Settings."
7. Sign in to that login the usual way, open Settings, connect Apple with the current
   password: back on Settings with "Apple connected". Sign out; Sign in with Apple now
   opens that business.
8. In Settings, disconnect Apple with the password; Sign in with Apple no longer opens
   that business.

Record the device, iOS version, date and the outcome of each line in
`docs/evidence/remediation-v2-2/r1/`. That record, not this file, is the evidence.

## What people are told, and what it means

On the login page (sign-in), or in Settings (connecting):

| Message | Meaning |
|---|---|
| Apple sign in is not configured; Sign in with Apple is not available. | The four settings are not set |
| Apple sign in needs a secure (https) address | The public origin is not https (development only) |
| Apple sign in was cancelled | The person cancelled at Apple |
| Apple sign in expired. Please try again. | More than ten minutes at Apple, a second use of the same start, or another browser |
| Apple sign in was not completed. Please try again. | Apple refused the code (often: the person removed TaptPay under their Apple ID) |
| Apple sign in is unavailable right now. Please try again. | Apple could not be reached, or answered with an error |
| Apple hasn't verified that email address. | Apple's token says the email is unverified |
| Apple did not share an email address. … | A first sign-in whose token has no email: the person must remove TaptPay under "Sign in with Apple" in their Apple ID settings, then try again, so Apple shares it again |
| That email already has a TaptPay login. Sign in, then connect Apple in Settings. | Never joined by email: connect it from Settings instead |
| Apple sign in failed. Please try again. | Apple's answer did not check out (signature, issuer, audience, time or nonce), or something failed here |
| Too many attempts. Please try again in … | More than 20 returns that asked Apple from one address (only once `TRUST_PROXY_HOPS` is set); or, in Settings, more than five wrong passwords |
| Current password is incorrect | Connecting or disconnecting in Settings: the owner's own password, counted with change-password's |
| Apple is already connected to this login. | A login has one Apple identity: disconnect first |
| Apple was not connected: That Apple account is already connected to another TaptPay login. | The identity signs in another login; it is never moved |
| Apple was not connected: That took too long, or you were signed out. | More than ten minutes at Apple, or the session that asked ended meanwhile (sign-out, password change) |

The server log carries a reason word only (`bad-token`, `grant-refused`,
`unreachable`), never a code, a token or Apple's subject. Connecting and disconnecting
are in the security log by login id: `APPLE_CONNECTED`, `APPLE_DISCONNECTED`.

## Rotating the key

The app signs a fresh five-minute "client secret" with the key for every exchange, so
there is no long-lived secret to reissue: rotating is a swap of two settings.

1. At Apple, create a second key with "Sign in with Apple" for the same App ID; download
   its `.p8`; note its Key ID. (Apple limits how many such keys an account holds. If
   the limit is reached, the old key has to be revoked first, and Sign in with Apple is
   off between steps 1 and 3.)
2. Set `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` to the new key, **together**.
3. Restart or redeploy. Check `GET /api/auth/apple/available` is `true`, then sign in
   with Apple once.
4. Revoke the old key at Apple. Delete every copy of the old `.p8`.

If the key may have leaked: revoke it at Apple **first**. Until the new one is in
place, signing in with Apple answers "unavailable right now"; sessions that are
already open carry on, and passwords and Google sign-in are unaffected. Nobody's
Apple identity changes: the rows are keyed by the Services ID and Apple's subject, not
by the key.

Apple's own signing keys (the ones its identity tokens are checked against) rotate by
themselves. The app fetches them from Apple, keeps them, and fetches again when a token
names a key it does not have, at most once a minute. Nothing to do.

**Never change the Services ID** once people have signed in with it: Apple's subject
for a person is per team, and the stored rows name the Services ID. A new Services ID
makes every stored identity unknown. If it must change, that is a migration with its
own plan.

## When an account is deleted (not built here)

Apple asks an app that deletes an account to also revoke that person's Sign in with
Apple grant (guideline 5.1.1(v)). Revoking needs one of Apple's tokens for the person,
and this app deliberately keeps none. The design recorded for account deletion (A-T6):

1. The person asking to delete an account that has an Apple identity is sent through
   Apple once more (the same start, for this purpose).
2. Apple's answer is exchanged as usual; the token endpoint's answer also carries a
   refresh token, which is used once, in memory, for
   `POST https://appleid.apple.com/auth/revoke` (`client_id`, the five-minute client
   secret, `token`, `token_type_hint=refresh_token`).
3. Then the account is deleted, and its identity row goes with its login (the table's
   own rule).

If the person will not or cannot go through Apple (they removed TaptPay under their
Apple ID already, which is itself a revocation), the account is deleted anyway and the
record says the grant could not be revoked from this side.

Closing an account from inside the app is A-T6 and is not built. Disconnecting Apple in
Settings removes the identity row but does **not** revoke Apple's grant (the person can
remove TaptPay under "Sign in with Apple" in their Apple ID settings).

## Not done, recorded

- **Apple's server-to-server notifications** (email forwarding switched off, consent
  withdrawn, Apple account deleted) are not received. A withdrawn grant is met at the
  next sign-in, when Apple refuses the code. Receiving them is a later addition: an
  endpoint registered on the Services ID, its signed payloads verified with the same
  Apple keys.
- **The native sign-in sheet** in the iPhone app (`AuthenticationServices`) is A-T2's:
  it needs the app's entitlement, and its tokens carry the app's bundle id as audience,
  which this server does not accept yet. The app shows the website, so the web flow
  above is what it uses.
- **No email is sent** when Apple is connected or disconnected (none is sent when a
  password changes either).
