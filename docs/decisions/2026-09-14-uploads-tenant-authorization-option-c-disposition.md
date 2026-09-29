# Uploads tenant authorization — Oliver chose Option C (full tenant-scoped auth)

Date: 2026-09-14 UTC
Owner: Oliver
Execution lineage: `remediation/r1-continuation-20260907`.

Shown the three options in
[uploads-tenant-authorization-escalation](2026-09-14-uploads-tenant-authorization-escalation.md)
§4 for `uploaded_files` having no tenant column and `GET
/uploads/:folder/:name` having no authorization at all, Oliver answered:
**"Full tenant-scoped auth"** — Option C.

**Effect:** add a tenant column to `uploaded_files` and require an
authenticated, ownership-checked download route for invoice documents; logos
stay public via the existing route or a separate, explicitly-public one. This
is the largest of the three options — a schema migration, a new/guarded route,
and a decision on backfill for uploads created before the migration (inferable
for invoice documents via `invoicesRentRequests` records that reference them,
where any do; otherwise declared out of scope).

**Not started yet**, deliberately: the escalation memo's own recommendation
was to sequence this behind the two workflows already touching
`server/routes.ts`/`shared/schema.ts` this session (gap 12's SSE fail-closed
fix and gap 11's C0/C1 indexes), to avoid concurrent-edit conflicts on those
files. Start once both are landed and committed — gap 11's C0/C1 is now
committed (`5318496b`); gap 12's SSE fail-closed fix is not yet.
