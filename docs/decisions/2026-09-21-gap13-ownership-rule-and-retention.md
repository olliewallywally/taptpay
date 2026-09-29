# Gap 13 — the automatic ownership rule, and retention periods

Date: 2026-09-21 UTC. Owner instruction, verbatim: **"please go ahead with all of your
recommendations"** — given in reply to the recommendations recorded in
[2026-09-21-gap13-owner-directions](2026-09-21-gap13-owner-directions.md) (Q3 and Q4 there), after
the owner had set the criterion *"what is easier for the user, needs to be UX first but also
secure"*.

## 1. Ownership of existing invoice documents — **decided**

This **amends** [2026-09-19 — trusted ownership inventory](2026-09-19-gap13-trusted-ownership-inventory.md)
in two places and keeps the rest.

**Changed**

1. **TaptPay's own records count as evidence** for one narrow case: exactly one merchant attached
   the document, and first did so no earlier than 5 minutes before its recorded upload time (clock
   skew) and no later than 24 hours after. The upload time is read from the server-generated file
   name; the attach time is the referencing invoice/quote/job-invoice row's `created_at`. This is
   the normal upload-then-invoice flow, and only the uploader's browser ever received a
   document's address before it was attached. A reference by itself is still not evidence.
2. **A document without evidence is locked, not blocking.** It is kept (never deleted), served to
   no merchant and no customer, and readable only by the validated platform admin, whose every
   read is durably audited (0024). Reasons: never attached; attached by more than one merchant;
   attached outside the window; attach time unknown; a name the upload route never generates;
   the merchant no longer exists; or an operator's decision.

**Unchanged**

- The migrations that set ownership (0023–0025) still run only with an operator-approved list,
  pinned by SHA-256, bound to the exact target, matching every invoice document by id, path hash
  and content hash, and re-checked under a lock inside 0025.
- Other evidence (an authenticated upload log, a merchant's attestation with the original file)
  can still give a document an owner; software cannot check its truth, so a person approves it.
- Logos keep their path-derived owner.

**Safeguard added in implementation:** the migration runner re-derives every "TaptPay's records"
claim from the database itself, inside 0025's locked transaction, and refuses the whole release
if any claim is not true of the records — an edited or stale list cannot move a document to a
merchant the records do not support.

**Consequences.** Merchants and customers do nothing. On an older, still-unpaid invoice whose
document is locked, the customer can still pay but sees no "View invoice" link; the admin can open
the document and pass it on. No tool yet re-assigns a locked document to a merchant; one would be
a separate, reviewed change.

**What this authorizes:** the code, tests and tooling, and a **read-only, count-only** run of the
drafting tool against the development database and the live (production) database. It does
**not** authorize applying any migration to any database, deploying, or pushing.

## 2. Retention — **decided, with professional confirmation outstanding**

Recommended 2026-09-21 and approved by the same instruction (research and sources:
[owner directions, Q4](2026-09-21-gap13-owner-directions.md)):

| Record | Keep | Then |
|---|---|---|
| Invoice documents (attachments) | 7 years after the end of the tax year of the invoice they belong to; for a document never attached to an invoice, 7 years after its upload | delete |
| `uploaded_file_ownership_evidence` (who owns each legacy document, and why) | as long as the document it describes | delete with the document |
| `invoice_document_access_audit` (the admin opened a document) | 7 years | delete |

Basis (not legal advice): Tax Administration Act 1994 s 22 (business records 7 years, extendable
by 3 under audit); Residential Tenancies Act (rent and bond records 7 years; other tenancy
documents for the tenancy plus 12 months); Privacy Act 2020 principle 9 (no longer than
necessary); PCI DSS 10.5.1 (security logs at least 12 months, as a floor); TaptPay's published
privacy policy (transaction records at least seven years).

**Still open under plan gate A-H3** (which covers all data, not only these records):
confirmation by the owner's accountant or lawyer, including whether TaptPay is a reporting entity
under the AML/CFT Act 2009 (if so, some customer records carry their own 5-year rules); legal
holds; and the deletion job itself. **Nothing deletes automatically yet.** The earliest document
could fall due around 2033, so the job is scheduled work, not urgent — it must be built with a
dry run, counts only, a legal-hold switch, and its own review.
