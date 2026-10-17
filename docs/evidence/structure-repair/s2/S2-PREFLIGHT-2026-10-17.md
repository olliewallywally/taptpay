## Verification of Prior Fixes

S2 starts from pushed `d4803d62f9acb2338afb1a04566b2903fe518ba2` on
`remediation/r8-ci-20261016`, with a clean working tree and matching remote tip.
Main remains `17932265899dfdc9b1bd9bd341b5364bc1718e45`; no merge is implied.
The owner explicitly requested S2. Fresh baseline capture records all 196 route
facts/order and the four original stock registration token digests. Existing
stock HTTP/storage, caller matrix, policy and API checks are being rerun before
the move. The S1 source manifest and recorded limits remain authoritative.

## Blocking Issues

No blocker to this four-route move. Claude retains R4. No R4, storage
implementation, schema, dependency, frontend/native or feature change is in
scope. A failed unchanged baseline must be diagnosed before extraction.

## High-Risk Concerns

Move only GET/POST `/api/merchants/:merchantId/stock-items` and PUT/DELETE
`/api/merchants/:merchantId/stock-items/:itemId`. Keep their exact GET, POST, PUT,
DELETE order between merchant refunds and ecommerce routes. Register on the
existing guarded app; no Router or replacement app. Inject the actual existing
`authenticateToken`, `checkMerchantOwnership` and storage instance.

The narrow stock port is a type-only Pick of the five existing IStorage methods:
getStockItemsByMerchant, createStockItemForMerchant, getStockItemForMerchant,
updateStockItemForMerchant and deleteStockItemForMerchant. It allocates no new
state and changes no atomic command. The registrar imports the existing strict
parser, Zod schemas and central structured logger. Preserve the parser-before-
ownership and scoped-read-before-validation/write order, including both 404
checks when an update/delete loses ownership after its initial read.

## Missing Steps

Create `server/domains/stock/contracts.ts` and `routes.ts`; replace only the
contiguous inline block with the call. Remove only its now-unused schema imports.
Add the exact export/file to the composition manifest and registration inventory,
plus an explicit empty middleware policy. Preserve all original route facts,
review/matrix and ordered registration contract. If physical file grouping
reorders generator output, make generation use the reviewed composition order;
never regenerate weaker security facts to accept the move.

Implementation finding: private generator replay exposed a pre-existing false
API-key heuristic on stock DELETE, caused by the following ecommerce helper
declarations. Moving stock would transfer that false label to merchant refunds.
Stop marker windows at reviewed domain calls and correct only stock DELETE's
generated label/markers; its actual facts, reviewed caller matrix and handlers
stay identical. A new boundary fixture must fail before that tooling repair.
The stock-edited schema import line also contains an already-unused
insertRefundSchema; remove that unused binding rather than rebaseline its changed
lint fingerprint. No refund handler or schema implementation changes.

Add only useful missing characterization: the real app must use its injected
storage instance for all four stock routes; existing safe error/validation and
lost-write responses must survive. Existing role, tenant/race and source guards
remain. Write the extraction recipe and rollback before choosing S3.

## Unsafe Assumptions

Source file order is not runtime call order. Named dependencies alone are not
proof their implementations or shared instances survived. Compare all 196 facts
by route key, actual runtime/source/frozen order, original stock registration
tokens and unchanged ownership helper. No arbitrary asynchronous/domain assembly,
new limiter, eager storage singleton import or generic service container.

## Required Ordering Changes

No application order change. Record this concrete preflight and separate reread,
finish the existing baseline and added characterization before moving handlers.
Then run affected checks immediately. Use the existing R8 owned PostgreSQL
coordinator for the stock verifier; its only supported full run also exercises
the other fixed stages. Do not retarget historical SQL or loosen its guards.

## Open Product / Provider / Legal Questions

No new product choice is needed: this preserves existing behaviour. Owner
decisions, D10/D13 and Claude's R4 boundary remain. Actual provider/device/restore,
email/assets/history/advisory and operations/professional release gates remain
open independently; S2 cannot close them.

## Compliance and Data-Handling Notes

Synthetic loopback HTTP and owned disposable PostgreSQL only. Preserve existing
owner processes and dependencies. Read private environment bindings without
printing values; never use an application database fallback. Raw reports stay
under the private S2 directory; commit source hashes and allowlisted results.
No external messages, real payment/email, live migration or deployment.

## Test and Rollback Adequacy

Retain existing all-route policy/security, stock HTTP/storage/race, caller matrix,
strict-parser/source, contract and async-error checks. Run server regression for
the first real domain composition change, static types/tooling, zero-new lint,
guarded build/install/serving and native/web parity. Verify the actual private
generator output without overwriting historical/generated policy unnecessarily.
Revert this registrar, call, manifests/policy, tests and evidence as one slice;
storage/schema have no rollback action because they are unchanged.

## Final Recommendation (Approve / Do not approve)

Approve the concrete S2 scope after the baseline and separate reread pass.
This authorises no business/security contract change, S3 work, phase exit,
deployment or payment activation.
