# Uploads tenant authorization — `uploaded_files` has no tenant column: options for decision

Date: 2026-09-14. Branch: `remediation/r1-continuation-20260907`.

**Status: OPEN — awaiting an owner decision. Nothing in this memo has been
implemented beyond the narrow `nosniff` mitigation already landed (see the
domain-5 evidence file). No schema or authorization change was made.**

Decision owner: Oliver. This memo exists to make the decision possible, not
to make it — mirroring how gap 12's addressing-scheme question was handled.

## 1. The gap

`shared/schema.ts:1476` — the `uploaded_files` table has no merchant/tenant
column:

```ts
export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

`GET /uploads/:folder/:name` (`server/routes.ts:7003`) serves any row by
path with **no authentication at all**. Today this table stores two kinds of
file under one policy:

- **Merchant logos** (`logos/merchant-<id>.png`) — shown publicly on
  customer-facing checkout pages. Being fetchable without login is plausibly
  the *intended* behaviour, not a gap — a customer paying at a stand needs
  to see the merchant's logo before they've authenticated with anyone.
- **Property invoice documents** (`invoices/invoice-<timestamp>-<hex>.<ext>`)
  — attached by a property manager to a tenant invoice, can carry real
  financial information (whatever the manager attaches — commonly the
  invoice PDF itself, or supporting documents). Protection today is
  filename secrecy only: a 8-random-byte suffix functions as a bearer
  capability, with no expiry, no revocation, and no record of who fetched a
  given URL.

## 2. Why this wasn't fixed same-day, unlike UPL-1/2/5

UPL-1/2/5 were narrow, schema-free, no-product-decision fixes — exactly this
branch's established bar for a same-day change. This gap fails that bar on
every count: fixing it requires **deciding**, not just implementing:

- Whether logos and invoice documents should have *different* access
  policies at all (plausible: public branding vs. private financial
  documents), which the current single unauthenticated route and single
  untenanted table cannot express.
- If invoice documents get real authorization, what shape: a short-lived
  signed URL (no schema change, but needs a signing secret, expiry window,
  and every caller — the property invoicing UI, PDF export, WhatsApp/email
  delivery — reissuing links instead of storing the raw `/uploads/...` URL);
  or a tenant column plus a session-gated download route (schema migration,
  and a decision about whether `admin` role should bypass it the way it
  does elsewhere in this codebase).
- Whether this is worth doing before or after R2 (the plan's provider-
  boundary/verification phase) and R1-T4 (the OAuth/session rebuild this
  branch has separately gated) — a signed-URL or session-gated scheme built
  now might need rework once R1-T4 lands new session primitives.

## 3. What is already true, independent of the decision

- **Landed now, no decision needed**: `X-Content-Type-Options: nosniff` on
  both response paths of `GET /uploads/:folder/:name` — see the domain-5
  evidence file. This closes the content-type-confusion angle (a browser
  sniffing an uploaded file as `text/html` and executing embedded script)
  regardless of how the authorization question is resolved.
- **Not new**: logo paths were already deterministic/enumerable
  (`merchant-<id>.<ext>`) before this session; UPL-5 only fixed the
  extension, it did not change enumerability. If logos are meant to be
  public, this is moot; if they're not, it predates this session and this
  memo either way.
- **Scope check performed**: no other route saves through
  `saveUploadedFile`/serves through this table besides the logo and
  invoice-document routes covered in the domain-5 evidence file — this is
  not a wider problem than the two upload types named above.

## 4. Options (not a recommendation — Oliver's call)

**A. Do nothing further; declare logos-public/documents-secret-by-obscurity
an accepted risk.** Zero engineering cost. Leaves invoice documents
protected only by URL secrecy — acceptable if the property vertical's
current user base and document sensitivity don't warrant more, not
acceptable if these are ever real tenant financial records at any scale.

**B. Signed, short-lived URLs for invoice documents only; logos stay as-is.**
No schema migration — sign `path` + an expiry into the URL itself (HMAC with
an existing or new server secret), verify at serve time, keep the disk/DB
serve logic otherwise unchanged. Every place that currently stores or emails
a raw `documentUrl` (property invoicing UI, PDF export, any
WhatsApp/email delivery) needs to either re-sign on each access or accept
that links expire and must be re-fetched — a real but bounded client-side
change. Does not touch logos or their route at all.

**C. Add a tenant column and require an authenticated, ownership-checked
download route for invoice documents; logos stay public via the existing
route or a separate, explicitly-public one.** Schema migration
(`uploaded_files.merchantId`, nullable during backfill or split into two
tables), a new/guarded route, and a decision on whether uploads created
before the migration need backfilling (they can be inferred for invoice
documents via the existing `invoicesRentRequests` records that reference
them, if any do) or are simply declared out of scope. Closest to what the
plan's uploads security section actually asks for; the largest option.

## 5. What this memo is not

Not a request to also revisit whether logos should be public — that looks
like intended product behavior, not a gap, and is called out only so the
decision maker isn't asked to solve a problem that may not exist. Not a
statement that invoice documents have already leaked — no evidence of
that was found or looked for; this is a design gap, not an incident.
