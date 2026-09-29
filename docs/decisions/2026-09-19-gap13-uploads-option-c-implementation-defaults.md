# Gap 13, Option C — sub-decisions S1–S5: the defaults, and Oliver's confirmations

Date: 2026-09-19 UTC.
Status: **All five confirmed by Oliver on 2026-09-19 — and S1 was overridden.** These began as *not* owner
decisions: engineering choices Option C left open, first implemented at the setting that exposes least, so each
could be confirmed or flipped deliberately. Oliver's replies (see [Confirmation status](#confirmation-status))
confirmed S2–S5 as implemented and **reversed S1: the platform admin may open merchants' invoice documents.**
Execution lineage: `remediation/r1-continuation-20260907`.
Implements: [Oliver's Option C decision](2026-09-14-uploads-tenant-authorization-option-c-disposition.md) of
2026-09-14, from the [options memo](2026-09-14-uploads-tenant-authorization-escalation.md).
Evidence: [R1-T7-gap13-uploads-tenant-authorization-2026-09-19](../evidence/remediation-v2-2/r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md).

## Context

Oliver chose "Full tenant-scoped auth": a tenant column on `uploaded_files` plus an authenticated,
ownership-checked download route for invoice documents, logos staying public. Reading the code to build it
showed the decision left five things open, and one fact the options memo had wrong:

- **The only reader of an invoice document is the unauthenticated tenant.** The memo (and the R1-T3
  evidence it drew on) said documents are linked "from the property invoicing UI and PDF exports". They are
  not: the merchant UIs show only the document's *name*, no server code embeds the URL, and the single place
  a `documentUrl` is dereferenced is the public checkout page (`client/src/pages/checkout.tsx`,
  `window.open(invoiceData.documentUrl)`), by a customer who holds only the invoice's checkout token and no
  merchant session. A session-gated route alone would therefore have silently broken the tenant's
  "View invoice" link.
- The three create routes accept `documentUrl` as any string up to 500 characters, so a tenant column alone
  would not have stopped one merchant attaching another's document, an external URL or a `javascript:` URI.

## Decisions as first implemented (each at its most restrictive setting)

| # | Question left open | Default implemented | Alternative | To flip it |
|---|---|---|---|---|
| **S1** | May the platform **admin** read any merchant's invoice documents (as `checkMerchantOwnership` allows elsewhere)? | **First implemented: No.** **Owner decision, 2026-09-19 — Yes** ("i want to see merchant documents"). Now: the *validated* platform admin (dedicated admin principal + configured email + `merchantId 0`; a bare `role: "admin"` claim is not enough) may open **any** invoice document by name — **including ones no merchant could be attributed to** — and every such read writes an `ADMIN_INVOICE_DOCUMENT_READ` audit event (who and which document, never the contents). Merchants stay scoped to their own. | Keep the admin out. | Remove the `isAdmin` branch of `GET /api/invoice-documents/:name`. |
| **S2** | Legacy documents that cannot be attributed to exactly one merchant (referenced by rows of two merchants, or by none) | Stay **NULL**; served by no route; **retained, never deleted**. | Guess an owner; delete orphans. | Owner decision after the production preflight shows the counts. |
| **S3** | How the tenant keeps their "View invoice" link | The **checkout token** authorizes exactly the one document attached to its own invoice (`GET /api/checkout/document/:token`), and only if the file's tenant equals the invoice's merchant. `resolve` hands the page that URL; **no client change**. | Drop the link; keep the old public URL for tenants. | — (the alternatives regress a shipped feature or defeat Option C). |
| **S4** | What a create route does with a `documentUrl` that is not the caller's own upload | **`400 "Invalid document attachment"`, nothing written** — including for the trades routes, before their hidden prospect is created. | Continue accepting arbitrary strings. | Remove `requireOwnedInvoiceDocument` from a route. |
| **S5** | What a cross-tenant / missing / malformed request returns | **`404`**, identical for all three (no existence oracle). | `403` for a known-but-foreign document. | Change the status in the route. |

## Consequences

- Invoice documents are no longer fetchable at `/uploads/invoices/...` (the public route serves the `logos`
  folder only, before consulting the database or the disk fallback). The stored `document_url` value is now
  an opaque reference validated against the row's owner, not a fetchable URL; no data migration was needed
  and legacy rows keep working.
- A tenant's existing checkout links keep working unchanged, for every invoice whose document is
  attributed. Invoices whose document is ambiguous/orphaned/malformed simply show no document link rather
  than a broken one; the count-only preflight reports how many that is before anything is applied.
- Creating an invoice or quote that references a document the caller did not upload now fails with 400.
  Previously any string was stored.
- **The admin can read documents through the API only.** No admin screen and no admin API lists documents
  today, so the admin needs a document's name (it sits in an invoice record's `document_url`) to fetch one, and
  a browser cannot attach the login header to a plain link. A browsable admin view would be new feature work
  (the branch is under a feature freeze) and needs its own decision.
- **Admin reads are audited, with a limit.** The event goes through the existing `logSecurityEvent`, which
  appends to `logs/security-audit.log` on the server's own filesystem; on an ephemeral deployment filesystem
  that file does not survive a restart or redeploy. It is an audit *trail* until the observability work (plan
  R6) gives it durable storage — not durable evidence yet.
- **Deploy order is load-bearing:** apply migration `0023` *before* the code. Code without the column fails on
  the first `uploaded_files` query (logo/document routes error). The checkout page is protected against that:
  a document-lookup failure hides the link and never blocks payment (tested).

## Rollback

Code rollback after `0023` is safe (older code ignores the extra nullable column) but older code writes
NULL-tenant rows; re-running `0023`'s NULL-only, idempotent backfill re-attributes them. Reverting `0023`
itself (drop the FK, index and column) discards attribution only — never a document.

## Not decided here

Retention/deletion of unreferenced documents (plan A-H3 remains an open owner gate); whether the upload's
client-derived filename extension should be replaced by one derived from the validated MIME type (harmless
today — the served type is the stored one, with `nosniff`, and references are bounded by a strict name
pattern — but worth folding into a later upload-hardening pass); a per-merchant upload count/quota (plan
§22.8).

## Confirmation status

**First reply, 2026-09-19, verbatim:** *"s1. yes, s2 yes but confirm if this will effect storage. s3 explain
further in a simple way. s4 yes but explain more. s5 - explain"*

**Second reply, 2026-09-19, verbatim:** *"s1, i want to see merchant documents/ yes to the rest and confirm s2."*

| # | Outcome | Notes |
|---|---|---|
| S1 | **Reversed — the admin may read merchant documents.** Implemented. | I misread the first reply: "s1. yes" was taken as accepting the default (admin cannot read). The second reply corrects it. The change is a small, separately-committed follow-up. Consequences are listed above (unattributed documents included; API only; audit-log limit). |
| S2 | **Confirmed.** | Storage question answered with measurements (nothing deleted, copied or moved; dev database 2 files / 62,735 bytes, the one unattributed file 9,076 bytes; `0023` added a 4-byte integer per row and a 16,384-byte index) and acknowledged. Production sizes are unknown from here. |
| S3 | **Confirmed** ("yes to the rest"). | After a plain-language explanation. |
| S4 | **Confirmed** ("yes to the rest"; "yes" in the first reply). | After a fuller explanation. |
| S5 | **Confirmed** ("yes to the rest"). | After a plain-language explanation. |

## What each means, in plain words

- **S1 — admin.** *(Owner's decision: yes.)* The platform admin login can open any merchant's invoice
  document, by its name, through the API — including the few old files nobody could be matched to. Each time it
  does, a line is written to the security audit log saying who opened which document (never what was in it).
  A token that merely *says* it is admin is still refused; only the real admin login counts. What does **not**
  exist yet is a screen for browsing documents.
- **S2 — legacy documents nobody can be matched to.** A few old uploaded files can't be tied to exactly one
  merchant (uploaded but never attached to anything, or attached by two different merchants). They stay in the
  database exactly as they are, but no one can open them through the app. Nothing is deleted, so **storage use
  does not change**; the only long-term storage question is whether to ever clean such files up, which is the
  open retention decision (plan item A-H3) — not made here because they might be financial records.
- **S3 — how the tenant keeps their "View invoice" button.** Tenants have no login. The link they are sent
  to pay is private to their one invoice — a key that opens only that invoice. Before, the attached PDF also
  had its own public web address that anyone could open if they had or guessed it. Now that address is
  switched off, and the button instead says to the server "I hold the key to invoice X — show me its
  attachment." The server checks the key is real and that the file belongs to the same merchant as the
  invoice, then shows it. The tenant sees the button work as before; nobody else can reach the file.
- **S4 — refusing an attachment that is not the merchant's own upload.** Before, when an invoice or quote
  was created, the "attached document" field accepted any text. The app itself only ever put in the address
  it got back from that merchant's own upload, so normal use is unaffected. But anyone calling the API
  directly could put in another merchant's document, a link to some other website, or a hostile `javascript:`
  link — and the customer's payment page would then offer it as "View invoice". Now the server asks "did *you*
  upload this?"; if not it refuses (`400 Invalid document attachment`) and creates nothing — no invoice, no
  client record, no message. Existing invoices are not changed; if one already holds an external link, that link
  simply stops appearing on the payment page (the dev database has none; production's count comes from the
  preflight).
- **S5 — "not found" instead of "forbidden".** Asking for someone else's document returns the same "not found"
  as asking for one that doesn't exist. A "forbidden" answer would tell a snooper "that document exists, it just
  isn't yours", which is useful for guessing; "not found" reveals nothing. The cost is that a merchant who
  mistypes a name sees "not found" — which is also simply true from where they stand.
