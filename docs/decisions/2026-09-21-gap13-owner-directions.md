# Gap 13 — owner directions, 2026-09-21

Date: 2026-09-21 UTC. Asked after the gate commit `e268d91e`, which listed four open questions
(Q1–Q4, [gate evidence §6](../evidence/remediation-v2-2/r1/R1-T7-gap13-ownership-inventory-gate-2026-09-21.md#open-product--provider--legal-questions)).

## Answers, verbatim

> "1. go ahead, 2. explain more, 3. what is easier for the user, needs to be UX first but also
> secure. 4. hopw long do we legally need to"

and, while that work was under way:

> "also yes goahead and fix the email issue you mentioned"

## Q1 — the shared document budget: **decided — count only real invoices**

Question put: the committed budget counted every `GET /api/checkout/document/:token` request,
made-up links included, against one platform-wide pool of 600 a minute *before* the link was
looked up, so one anonymous client could switch "View invoice" off for every customer. The
recommendation was to look the link up first and count only real invoices.

**Decision: go ahead.** Authorizes the code change only: the route looks the link up first
(unknown → `404` with no budget touched), each real link keeps its own database-shared budget of
10 a minute, and the platform-wide pool is removed. A budget outage still fails closed (`503`)
before any document byte is read. No database migration is involved (the counter table from
`0024` is unchanged) and nothing is deployed.

## Email/SMS in tests: **decided — fix**

The server test harness cleared only credential *pairs*; a real `RESEND_API_KEY` in the workspace
reached the team-invite resend test, which then called the real email provider. **Decision: fix
it.** Authorizes test-harness changes only (no application behaviour): the harness also clears
single-key provider credentials (`RESEND_API_KEY`) and Twilio's SMS credentials, and routes test
email to the built-in `simulation` provider (refused by config in staging and production).

## Q2 — a document nobody can prove an owner for: **explanation requested — no decision**

Explained 2026-09-21 in the conversation; the 2026-09-19 rule
([trusted ownership inventory](2026-09-19-gap13-trusted-ownership-inventory.md)) stands unchanged
until the owner says otherwise.

## Q3 — where proof comes from: **criterion given — decision pending**

The owner's criterion, verbatim: *"what is easier for the user, needs to be UX first but also
secure"*. A recommendation was made in reply (TaptPay's own records as proof where one merchant
attached the document shortly after it was uploaded; everything else kept but locked to the
audited admin, not deleted, not blocking). It changes two parts of the 2026-09-19 decision, so it
is **not implemented** until the owner approves it.

## Q4 — how long records must legally be kept: **answered — retention decision pending**

Researched and answered 2026-09-21 (not legal advice): New Zealand business records 7 years
(Tax Administration Act 1994 s 22, extendable by 3 years under audit); landlords' rent and bond
records 7 years, other tenancy documents for the tenancy plus 12 months (Residential Tenancies
Act); Privacy Act 2020 principle 9 — no longer than needed; PCI DSS 10.5.1 — security audit logs
at least 12 months as a benchmark. TaptPay's published privacy policy already promises transaction
records for at least seven years. A retention period for invoice documents,
`invoice_document_access_audit` and `uploaded_file_ownership_evidence` was recommended; **no
retention or deletion is implemented** (plan gate A-H3) until the owner confirms it.
