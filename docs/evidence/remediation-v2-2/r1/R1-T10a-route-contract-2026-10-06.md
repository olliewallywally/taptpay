# R1-T10a — one typed spelling for every API address, and the sign-in pages on it

Exact branch `remediation/r1-continuation-20260907`, code `9f9182e5`, base `8d6ba483`.
[Plan, design and preflight](../../../PLAN-2026-10-06-r1-t10-acceptance-matrix.md).
T10a is code-complete; independent review is owed. **R1-T10 is not complete**: the
remaining screens (T10b), the device, tutorial and accessibility matrix (T10c to T10e)
and what only the owner can close (T10f) remain.

## What was built

**The list.** `shared/api-routes.ts` names every API route a browser calls, by its
registration (`"GET /api/merchants/:id/profile"`), with the type of each parameter of
its path. It is generated, by the generator that already writes the route policy
(`scripts/generate-route-policy.ts`), from the server's own registrations and their
review; `server/api-route-list.ts` says which routes are listed and writes the file.

- **178 of the 194 registrations are listed**: those under `/api` whose review serves a
  business login, the platform admin, anyone, or the holder of a link. 73 GET, 78 POST,
  17 PUT, 8 DELETE, 2 PATCH.
- **16 are left out**, none of them a page's to call: six that are not under `/api`
  (robots, the sitemap, the two NFC addresses, Apple Pay's domain file, uploads), five
  provider notifications registered for every method, the messaging provider's webhook,
  the two ecommerce API routes and the two scheduler routes.
- 92 of the listed routes have parameters: 52 parameters are whole numbers (the server
  reads them with its one strict positive-integer parser) and 46 are text (tokens,
  references, names).
- The file is types only. The same registrations give the same file on any machine and
  any day: it carries no date and no commit.

**The builder.** `shared/api-path.ts`, a few lines with no imports at run time:
`apiPath(route, params)` fills the route's path; `apiMethod(route)` is its method;
`apiTo(route, params)` is both, for `apiRequest`. `ADMIN_API_PREFIX` is the admin
area's prefix, for the one rule the client keeps about it.

- A route the server does not have, a missing or extra parameter, or text where the
  server reads a whole number **does not typecheck**.
- At run time it **refuses instead of building a wrong address**: a parameter that is
  missing or that the path does not have; a number that is zero, negative, a fraction,
  not a number, infinite or too large to be exact; empty text; a list, an object, a
  boolean, null. Text is written into one path segment. A refusal names the route and
  the parameter and never repeats the value it was given.

**The contract test and the guard.** `server/__tests__/api-route-contract.test.ts`
(28 tests) holds:

- the checked-in list to what the generator writes now, to the registrations, and to
  the review's principals; each parameter's type to its parser; the file to types only;
- the builder to every listed route, and to each refusal above;
- `ADMIN_API_PREFIX` to the server's own rule (`server/auth.ts`) and to where every
  admin-gated route lives;
- **every route name written in client source to the list, read from the source**, so a
  name pushed past the types with a cast is still caught;
- each method a call spells beside the builder to the route's own method;
- that the builder is always handed a name written out where it is used, never one
  from a variable (so the check above sees every name);
- **the guard**: a list of the files moved onto the builder, none of which may spell an
  API address any more. The list only grows.

**The first surface: sign-in and account entry.** Twelve files moved, with no address,
method or behaviour changed: the pages `login`, `admin-login`, `merchant-signup`,
`forgot-password`, `reset-password`, `confirm-email`, `check-email`, `accept-invite`;
and `lib/session.ts`, `lib/sign-out-everywhere.ts`, `lib/apple-sign-in.ts`,
`hooks/use-apple-connection.ts`.

Tests keep their literal addresses on purpose: a test that spelled its expectation with
the same builder would agree with any mistake in it.

## Verification

- Red first, replayed on an archived copy of `8d6ba483` with the final test file: the
  suite cannot load (what it tests does not exist).
- Focused green: the contract test, **28 pass**.
- **No address changed, shown from the commit itself**
  (`.local/claude-scratch/session-2026-10-06/t10a-literal-proof.py 8d6ba483 9f9182e5`):
  the twelve files spelled **29 addresses** on the base; they now hold **26 uses of 22
  route names**, two uses of the shared admin prefix and one renamed cache key. In ten
  files every address spelled before is the path of a route name used now, one for one.
  The two others, read by hand:
  - `lib/session.ts`: the rule for "is this the admin area" compared against
    `"/api/admin"` and `"/api/admin/"`; it now makes the same two comparisons from
    `ADMIN_API_PREFIX`;
  - `pages/reset-password.tsx`: the query's cache key was an address-like label with
    its own fetch; it is now the route's name. Nothing else reads that key.
- One address has a parameter, the reset link's token. The server issues it as 64
  hexadecimal characters, which the builder writes unchanged. The one difference is for
  a token no server issued: text holding `/`, `?` or `#` now reaches the server as one
  token, which it refuses, instead of as another path.
- **Every existing test passes unchanged**: no test file under `client/` is in the
  commit, and the pages' tests assert the literal addresses.
- The built client holds **exactly the 22 route names its pages use** and none of the
  other 156, and nothing of the list itself.
- Mutation check, on scratch copies only: **37 of 37 planted defects caught**, none
  surviving. 15 in the list (the provider's, the scheduler's or the ecommerce API's
  routes listed; a link holder's or the admin's left out; routes off `/api` listed; a
  whole-number id typed as text, every parameter as a number, a UUID as a number; the
  order; parameters dropped or misshapen; a value carried into the bundle; a route named
  or reviewed by its path alone). 15 in the builder (zero, a fraction, not-a-number or a
  too-large number written as an id; empty text or unescaped text written into the
  path; a missing parameter written as the word "undefined"; an extra one ignored; a
  refused value repeated in the refusal, three ways; the method and the address
  confused, three ways; another admin prefix; only the first parameter filled). 7 in
  the pages and the guard (an address spelled again, plainly or in a template; a route
  the server does not have, past the types; a name from a variable; the admin rule
  spelled by the page again; a route called by another method; a GET route called with
  a method).
- The route suites, the contract test and the two source guards together: **28 suites /
  1,811 tests pass**. Inventories: **194 registrations / 0 unclassified / 0 gaps; 266
  storage contracts; 178 browser routes**.
- Typecheck, production build and whitespace pass.
- **Full client: 117 suites / 1,420 tests pass** (44.326 seconds) and **full server: 180 suites / 4,464 tests
  pass** (838.204 seconds), both exit 0, run on `9f9182e5` with a clean tree apart from
  this untracked file. The server's count is the 179 suites / 4,436 tests of `3e5db51d`
  plus the contract suite's 28.

## Phase handoff record

- Scope/files: `git show --stat 9f9182e5`.
- Migrations/target: none. No database of any kind was contacted.
- Commands/logs: the base replay, the focused and route runs, the address proof, the
  mutation script and its two result files, typecheck/build, both generators, the full
  runs. Under `.local/claude-scratch/session-2026-10-06/` (git-ignored), names starting
  `t10a-` and `full-*-t10a`.
- Negative/effect proof: the builder's refusals are tested for every listed route's
  shape; a wrong name or parameter fails the type check, and past the types, the
  contract test.
- Provider/UAT, devices, external actions, deploy: none.
- Security/privacy: the list names addresses the built app already contained, and only
  the 22 in use reach the bundle. A refusal never repeats a value, so a token or an id
  cannot reach a log or an error screen through it.
- Generated files: running the generator also rewrites the first line of
  `server/route-policy.ts` and of the two inventory tables with the commit and date it
  ran on. Nothing else in them changed (no route did), so those three are left as they
  were.
- In-flight: none.
- Rollback/constraints: no rollback commit; fix forward. A page can always go back to
  its literal; the guard's list would then have to lose that file, which is a reviewed
  change.
- Approvals/stops: the T10a preflight and separate reread approve exactly this scope.
  No application, provider or production gate was crossed.
- Deferred/next: T10b, the remaining screens in reviewed batches, each appended to the
  guard's list.
