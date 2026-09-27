# Owner answers — R1-T3's questions, before code (2026-09-27)

Date: 2026-09-27 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `58ef2e39`,
with R1-T3's plan in `docs/evidence/remediation-v2-2/r1/WORKING-2026-09-27-r1-t3.md`, uncommitted).
Asked before any of R1-T3's code; the answers are the options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "When someone's sign-in stops being valid (the session expired, or their access was removed), the server answers in a way the property and trades pages don't recognise, so those pages show an error instead of sending the person back to sign in. The plan's rule would fix that. Change it?" | **"Follow the plan (Recommended)"** — "The server answers 401 for an expired or invalid sign-in, a removed teammate and a suspended business. Every page then sends the person to the sign-in page." |
| 2 | "The address /smart-terminal shows the retail terminal's screens to anyone, signed in or not. It has no data, but it has no sign-in check either. It's an old compatibility page that nothing links to. What should happen to it?" | **"Retire it (Recommended)"** — "Removed from the app. The address then goes wherever an unknown address goes. The real terminal at /terminal is unchanged." |
| 3 | "Any business can open another business type's pages by typing the address. For example, a retail business could type /property and use the rent pages, on its own data only; nothing links there. Should each business type's pages be limited to that type?" | **"Leave them open (Recommended)"** — "No change. It's the business's own data, and nothing on screen leads there. R1-T3's tests record this as intended." |

The other options were "Keep it as it is" (1), "Guard it like /terminal" (2) and "Limit each type"
(3).

## Background

- 1: `authenticateToken` (`server/auth.ts`) answers 403 for an invalid or expired token, an invalid
  admin session, a login that is disabled or gone, and a business that is absent, unverified or
  suspended; P2.2 says 401 for "authentication missing, invalid, expired or disabled". The start-up
  check signs out on 401, 403 or 404 alike; `propFetch` and `tradesFetch` send the person to sign-in
  only on 401.
- 2: `/smart-terminal` renders `SmartTransitions` (the retail terminal's view with no data handlers)
  and has no `ProtectedRoute`; nothing in the client or `ios/` links to it, and the component is used
  nowhere else. The plan lists it among the guarded routes.
- 3: no client guard and no server route checks the business type; each business's own pages are its
  home, and nothing links across.

Also in the plan, without a question (P2.2, invisible to the screens): the platform admin's 400/401
answers on business routes become 403, and the four state refusals that answer 400 become 409, each
screen checked first for a dependence on 400.

## What this authorizes

- 1: code and tests on this branch, tests first: those `authenticateToken` refusals answer 401; the
  client's handling checked (it already treats 401 as "sign in again"). No deploy.
- 2: code and tests on this branch: the `/smart-terminal` route and its component removed. No deploy.
- 3: nothing to change; R1-T3's client-guard tests record that any business may open any type's
  pages.

## Outcome (same day, local commits, not pushed)

- 1, **`65f5be26`**: `authenticateToken` answers 401 for an invalid or expired token, an invalid admin
  session, a login disabled or gone, and a business absent, unverified or suspended (messages and codes
  unchanged). The runtime matrix test drives all 115 gated routes with each of those callers. With it,
  following P2.2 as the plan said: the platform admin gets 403 "Merchant access required" on the 68
  business routes that answered it 400 or 401, and eight state conflicts answer 409. Server 111/2,586.
- 2, **`f62149ff`**: `/smart-terminal` removed (the route, its lazy import, `SmartTransitions`). Client
  103/825.
- 3: nothing changed; the client-guard tests to come record that any business may open any type's
  pages.
