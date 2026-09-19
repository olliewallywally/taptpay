# Gap 13, Option C — the sub-decisions implemented at their most restrictive default

Date: 2026-09-19 UTC.
Status: **Implemented at restrictive defaults; partly confirmed.** These began as *not* owner decisions —
engineering choices Option C left open, taken at the setting that exposes least, so each can be confirmed or
flipped deliberately (every one is a one-line change). On 2026-09-19 Oliver replied to the list; what that
does and does not settle is in [Confirmation status](#confirmation-status) below. **S3 and S5 are still
unconfirmed.**
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

## Decisions taken (each at its most restrictive setting)

| # | Question left open | Default implemented | Alternative | To flip it |
|---|---|---|---|---|
| **S1** | May the platform **admin** read any merchant's invoice documents (as `checkMerchantOwnership` allows elsewhere)? | **No.** `GET /api/invoice-documents/:name` is scoped by the caller's own `merchantId`; the admin principal (`merchantId 0`) matches no tenant. | Admin bypass for support/incident work. | Add one `role === "admin"` branch using the unscoped read. |
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

Oliver's reply of 2026-09-19, verbatim: *"s1. yes, s2 yes but confirm if this will effect storage. s3 explain
further in a simple way. s4 yes but explain more. s5 - explain"*

| # | Reply | Reading | Status |
|---|---|---|---|
| S1 | "yes" | Read as **accepting the default as listed** (admin cannot read merchants' documents). If "yes" was meant as "yes, let admin read them", say so — it is one branch to add. | **Confirmed**, on that reading |
| S2 | "yes but confirm if this will effect storage" | Accepted, conditional on confirming that keeping unattributable files does not affect storage. | **Condition answered, not yet acknowledged.** Measured on the dev database: nothing is deleted, copied or moved; `uploaded_files` is 2 files / 62,735 bytes, the one unattributed file 9,076 bytes; `0023` added a 4-byte integer per row and a 16,384-byte index. Production sizes are unknown from here — the owner-run preflight reports counts only (byte totals can be added to it on request). |
| S3 | "explain further in a simple way" | No decision yet. | **Unconfirmed** — explanation below. |
| S4 | "yes but explain more" | Accepted; a fuller explanation requested. | **Confirmed**, explanation below. |
| S5 | "explain" | No decision yet. | **Unconfirmed** — explanation below. |

## What each means, in plain words

- **S1 — admin.** The platform admin login cannot open merchants' invoice documents through the app. Support
  or an incident that needs one would need a deliberate, separate step. It is the safer default because
  documents can hold tenants' financial details.
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
