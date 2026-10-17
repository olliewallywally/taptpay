## Verification of Prior Fixes

Additional review of group B before implementation. Inspected the actual published
compression1.8.2, multer2.4.0 and ws8.22.0 package source against current installs.
Compression releases zlib resources on premature response close; its only new
dependency is destroy1.2.0. Ws bounds buffered chunks/fragments for both client
and server by default. Neither changes the application constructor contract. The prepared lock candidate
changes only these three versions. Multer drops concat-stream/typedarray and uses
its own memory accumulator; buffer-from becomes development-only. Compression
adds an edge to the already present destroy1.2.0. No unrelated version changes;
existing buffer-content/size/size-limit-abort checks cover the memory-storage change.

## Blocking Issues

The proposed version-only multer fix is insufficient for this application's
unneeded text-field parsing. Published multer2.4.0 leaves fieldNestingDepth and
fieldArrayIndexLimit at Infinity unless configured. Remove this implementation
blocker with the precise file-only limits and negative HTTP evidence below.
Group A and its unchanged-version verification remain unaffected.

## High-Risk Concerns

Both multer instances in server/routes.ts currently bound fileSize only. Source
review proves their handlers consume req.file, not multipart req.body. Existing
mobile settings, mobile property terminal and desktop property terminal each
append exactly one file under logo/document. Add fields:0, files:1, parts:1 to
both parsers while retaining20MiB file size, MIME/signature checks and authorization
ordering. Reject text before append-field can construct nested/sparse arrays.
Do not increase any file limit or change a valid caller's request shape.

## Missing Steps

Add actual HTTP regression cases using small safe nested/indexed field names
before and after the file for both routes; require400 and no saved blob. Confirm
they fail against the old parser, then pass with bounds on the updated multer.
Retain valid single-file and multiple-file rejection controls. Include these
cases in the targeted server regression after A's full suite finishes. Run types,
lint-zero-new, build/production/dev proof, WebSocket compatibility smoke and audit.

## Unsafe Assumptions

An advisory disappearing from npm audit does not prove a configurable mitigation
is active. Use small bounded payloads, never crash/OOM exploits. File-only limits
are justified by actual route and caller evidence, not an invented UX change.
This is not a general upload-policy redesign or content-scanner certification.

## Required Ordering Changes

The group-B approval now includes the two parser configurations and their real
HTTP regression tests. Finish A's checks first. Then record fail-first, apply the
reviewed package/configuration repair, review the exact lock delta and run B's
affected checks. Stop for review on unexpected API or caller changes.

## Open Product / Provider / Legal Questions

No new decision: each approved caller already sends one file and no text fields.
Existing owner/security/provider/legal/release questions remain open. Do not
change auth roles, tenant rules, retention, payment flags, D10 or D13.

## Compliance and Data-Handling Notes

Tests use synthetic principals, tiny local fixtures and newly owned loopback
listeners only. No provider, external message or shared database activity. Keep
raw logs outside Git; evidence records only counts, package metadata and paths.

## Test and Rollback Adequacy

Exercise both parser paths, both field ordering cases and normal file success.
Check storage was not called for rejected payloads, not just HTTP status. Keep
existing size/type/tenant/SSE regressions. Revert parser/package/lock/tests as one
scope if required; restoring vulnerable versions does not authorize release.

## Final Recommendation (Approve / Do not approve)

Approve this bounded group-B amendment with the stated fail-first and runtime
checks. Together with the original preflight, it resolves the version-only
assumption before implementation. This is local engineering review, not an
external reviewer or phase/release approval. Independent reread recorded below.
