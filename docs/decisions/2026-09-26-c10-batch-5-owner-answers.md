# Owner answers — the C10 route review's batch 5 questions (2026-09-26)

Date: 2026-09-26 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `e1feb9b1`).
Asked in one question set after batch 5 of the C10 route review (the account's 27 routes,
`fa41de52`, `737018b0`); the answers are the options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "When a phone or browser turns on TaptPay notifications, it gives the server a web address, and the server sends a message to that address on every payment. The server accepts any address at all, so anyone signed in (a teammate too) could make our server contact other computers of their choosing. Browsers only ever use Google's, Mozilla's, Apple's or Microsoft's notification services. Only accept those?" | **"Only the real services (Recommended)"** — "Addresses from Google, Mozilla, Apple and Microsoft's push services are accepted; anything else is refused. iPhones in the app are unaffected (they use Apple directly)." |
| 2 | "The notification switches (payment received, daily summary, failed payments) belong to the whole business. If a teammate turns off payment alerts on their phone, they also turn off on yours. Give each login its own switches?" | **"Each login its own (Recommended)"** — "A teammate's switches change only their own devices; yours stay as you set them." |

## Background

- 1: `POST /api/push/subscribe` stores `subscription.endpoint` as sent, and `server/push.ts` hands it
  to web-push, which opens an HTTPS request to whatever host, port and path it names, on every
  payment event of the business (batch 5 review, `737018b0`). The app's iPhones register an APNs
  device token instead (`POST /api/push/native-subscribe`, stored as `apns://<token>`), which goes
  only to Apple's fixed host.
- 2: the switches are stored on each push subscription row, but `PUT /api/push/preferences` set them
  on every subscription of the business, and the reads took the business's newest row (shown in the
  harness: a teammate's change reached the owner's devices).

## What this authorizes

- Code and tests on this branch, tests first. No deploy or push, no migration.
- 1: the subscribe route accepts only an `https:` endpoint on port 443, without a user or password,
  on a host of those four services' push endpoints; the sender never contacts a stored endpoint that
  fails the same check (a row stored before this change).
- 2: the switches are read and written per login; a device a login registers starts with that
  login's switches. Subscriptions from before 0029 (recorded against no login) keep their switches
  until their device registers again.
