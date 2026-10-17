# Extracting the next route group

The stock pilot is the first example: `server/domains/stock/routes.ts` receives
the app's existing dependencies through `contracts.ts`, and `server/routes.ts`
calls its registrar at the original registration position. Storage commands stay
in their existing implementation until their separate S4 review.

1. Choose one cohesive, contiguous group and record its exact registrations,
   guards, callers, inputs, responses, side effects, shared instances and tests.
   Agree shared-file ownership; Claude retains R4. Interleaved groups can use
   separate small registrars so their precedence does not change.
2. Record the ten-heading preflight and a separate reread. Capture the current
   route facts, runtime/source order, original handler tokens and relevant
   HTTP/storage results. Add characterization only for a real uncovered boundary.
3. Create a named synchronous registrar on the same Express app. Pass a literal
   dependency object containing the existing storage and security functions.
   Keep storage as an object so methods retain their receiver. Use a narrow
   type-only Pick of existing commands; do not import the storage singleton into
   the domain, create new limiters or invent a second service layer for a read.
4. Move handlers without changing their bodies or HTTP contracts. Keep parser,
   auth/ownership, validation and scoped read/write order. Replace the original
   block with the registrar call; preserve the first async guard and shared state.
5. Add the exact source/export to `route-composition-manifest.ts` and the source
   to `REGISTRATION_FILES` in `route-inventory.ts`. Add its explicit middleware
   policy, including an empty entry when it only registers routes. Keep the
   ordered contract and existing reviewed security policy; do not silence drift
   by recording weaker facts or refreshing visual goldens.
6. Compare all route facts by method/path, and compare actual runtime, composed
   source and frozen registration arrays in order and multiplicity. The generator
   reads every file but emits at reviewed composition positions. Its legacy text
   marker windows also stop at domain calls, so the preceding route cannot absorb
   a later group's helper declarations. Inspect any heuristic-label difference
   against actual handlers and the reviewed matrix; a label is not a security rule.
7. Run existing affected HTTP/security/storage/strict-parameter and generator/API
   checks, then owned PostgreSQL proof, types, zero-new lint and build/serving proof.
   The first stock pilot also runs the complete server project. Preserve scanner,
   deadline, no-network, ownership/race and source-completeness assertions.
8. Record fresh source hashes, exact counts and any unrun checks. Keep raw logs
   and connection material private. Review the final diff and rollback as one
   slice, then commit explicit paths and update README/CLAUDE/EXECUTION for the
   next owner. A push is not a deployment or phase exit.

For PostgreSQL, use the documented R8 owned loopback coordinator and helper.
It creates and drops only its successfully created random databases. Do not
retarget historical fixed-source verifiers, use application DATABASE_URL as a
fallback, or apply a live migration to get a green local result.

For the stock slice, rollback means reverting its registrar/contracts, original
composition call and schema-import cleanup, explicit manifests/middleware policy,
generator boundary support and reviewed metadata, tests and evidence together.
The storage implementation and frozen migrations have no rollback action because
they did not change. Preserve the public URLs and original four-route order.

The next recommended S3 slice is property profiles and schedules. Prepare its own
concrete preflight and separate contiguous blocks; keep invoice financial commands
out of that first move. Broader legacy marker-window cleanup, storage extraction,
frontend work and existing R8 release gates remain separate work.
