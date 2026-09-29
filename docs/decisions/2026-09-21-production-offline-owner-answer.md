# Production offline — owner answer

Date: 2026-09-21 UTC. Owner: Oliver. Execution lineage: `remediation/r1-continuation-20260907`.

## Question put

Asked at 06:37 UTC and again at 10:29 UTC, after a second read-only probe: is the live site off
on purpose? Both probes (06:33 and 10:14 UTC) observed the same two things, and nothing in the
repository explained either:

- the workspace's production database address (`NEON_DATABASE_URL`) connects and verifies TLS,
  but Neon answers `28000 The endpoint has been disabled. Enable it using the API and retry.`;
- `https://taptpay.co.nz/` answers `307` to `replit.com/__replshield` — a private Replit
  deployment that sends every visitor to Replit sign-in.

## Answer, verbatim

> "the whole site is private"

## What is recorded

Production being closed to the public is **deliberate**. The question named both observations
and the answer is recorded as covering both; it does not establish *why* the database endpoint
is disabled (for example, a Neon plan setting). It asks for no change, and no agent changed
either setting.

## Consequences

- The read-only production count of invoice documents, authorized on 2026-09-21
  ([decision](2026-09-21-gap13-ownership-rule-and-retention.md)), cannot run while the endpoint
  is disabled. It waits until the owner re-opens production; it is needed only before a
  production release of gap 13.
- Every other production step — the gap-11 preflight re-run, the gap-13 preflight, drafting and
  release, any migration — likewise waits. Production changes remain owner-only.
- This is not an incident finding: the owner states the closure is deliberate.
