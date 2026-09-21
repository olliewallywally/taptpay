# Gap 13 — trusted ownership inventory before migration

Date: 2026-09-19 UTC.
Owner decision, verbatim: **“Require a trusted ownership inventory before migration”**.

This rejects blanket quarantine of existing invoice uploads as the default repair.
Before applying the gap-13 repair migration, every existing invoice upload must
have an independently verified owner. Legacy invoice/quote references and the
merchant_id written by migration 0023 are not evidence of upload ownership.

Acceptable evidence must bind the exact file to its merchant, for example an
authenticated upload audit record or a reviewed merchant attestation supported
by the original file. An operator reviews the evidence and approves the inventory
artifact's SHA-256. Software can validate hashes, completeness and target identity;
it cannot establish that an attestation is true or an evidence source authentic.

Missing/ambiguous evidence blocks migration. Files are not deleted, blanket
quarantined or assigned an owner by inference. Correctly evidenced legacy files
remain accessible to their verified owner after the repair. Logos remain public,
and new authenticated uploads continue normally. The validated platform admin
retains audited document access under S1.

No source of trusted legacy evidence has yet been supplied in this conversation.
The source has been requested. This decision authorizes preparing and testing
the inventory-gated repair, not applying it to development or production without
the completed inventory and target-specific migration approval.
