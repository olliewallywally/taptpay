# R8 dependency cleanup and compatible server repairs

Phase: R8 repository follow-up, still open. Branch:
`remediation/r8-ci-20261016`. Code/evidence commit:
`85e38c220493c8474f7917ff78a5062cb8e08c8a`, based on pushed4c2f1b2.
The next documentation commit records this handoff; verify the actual branch tip
and remote ref. Claude retains R4. No merge/deployment or phase exit.

Read the final dependency review and separately recorded reread under
`docs/evidence/remediation-v2-2/r8`, then the two verification JSON files and their
separate source manifests. The October16 production-import handoff is historical
context, not the current remaining advisory count.

## Completed scope and files

- `package.json`/lock:38 proven tooling/type/native-build declarations moved to
  devDependencies without changing their ranges/versions/integrities. Only the
  later compression1.8.2, multer2.4.0 and ws8.22.0 patches change installed versions.
  Multer drops concat-stream/typedarray and buffer-from becomes dev-only;
  compression uses already present destroy1.2.0. No unrelated upgrades.
- `server/routes.ts`: both single-file upload parsers now reject text/extra
  files/parts, retaining20MiB, MIME/signature/scanner checks and auth ordering.
  Source mobile/desktop/operator callers already send one file and no text.
  This closes unnecessary nested/sparse text parsing that the package update
  alone did not disable. Added12 actual HTTP cases in r8-multipart-bounds.test.ts.
- Existing native version contract now reads runtime or development declarations.
  Capacitor core stays runtime; core/CLI/iOS and Swift stay8.4.3. React/react-dom
  and both motion packages remain runtime. No generated web/Swift/SQL changes.
- Eleven dated evidence files record preflights/amendment/rereads, conservative
  AST/config consumers, separate A/B manifests/results and sanitized audit data.
  The operations runbook explains full build tooling versus prebuilt runtime.

## Verification and evidence boundaries

Node22.23.3 / npm10.9.9. Fresh root installs preserved the respective committed
lock bytes; full npm trees have no problems. Final lock SHA256:
`79a947d5979672cd85e7491825622e76963c4478e6bcad4b13b712f8239a15ad`.

Group A finished before group B changed runtime packages or application code:
134 client suites /1507 tests and238 server suites /5249 tests passed, no failures,
skips, interruptions or open handles. All10 static stages passed, including four
typechecks and39 tooling tests. Guarded build, fresh production-only install,
expected entry configuration refusal with0 connections, actual static serving,
real development middleware/shutdown, lint zero-new and native sync/parity passed.
Owned PostgreSQL17.11 replay/storage passed, including frozen canonical0049b.
All synthetic databases were created/cleaned by their guarded runner.

Group B's8 negative multipart cases first returned200 instead of400;4 controls
passed. After repair all12 new cases and468 affected tests in16 suites passed,
with0 failures/skips/interruptions/open handles. All10 static stages, guarded
build, fresh production-only entry/static serving, real dev middleware/shutdown,
actual loopback WebSocket text/fragmented/binary/close and final native parity
passed. Full unit/browser suites were not repeated after B; do not relabel A's
full run as a second full run on the patched libraries. All198 generated web files
remain identical to the prior verified snapshot. Web index SHA256 remains
752b816726ceed8973211e93f1d755e6e07a884f45093a4b032949c064412e8d.

Lint remains680 existing errors /0 new, not globally clean. Final current-source
secret scan passed with0 findings. Private raw logs/Jest/npm trees remain outside
Git; no source snippets, secrets, customer data or live provider calls in evidence.
Physical device/UAT and full live SQL daemon behavior are not certified here.

## Audit and release status

Fresh production-only installs:1314 packages before ->629 after relocation ->626
after patches. Relocation alone removes no advisory; full audit stayed80 affected /
61 high. The3 patches remove8 actual advisory IDs (139 ->131).

Current full audit:77 affected /58 high /17 moderate /2 low /0 critical.
Production-filtered:27 affected /18 high /8 moderate /1 low. Full high/critical
security gate remains red with no waiver. Remote CI/branch protection not claimed.

History's last recorded review had124 unresolved candidates; this follow-up did
not rescan all history or mark any credential revoked/rotated. Candidates are not
confirmed live credentials. No files/archives/uploads were removed as hygiene.
No migration was added/changed; no shared/live DB status or restore is inferred.

## Environment and operations

This was a fresh environment: the old PID4196/app/dependencies did not survive.
Recovered the exact pushed R8 branch through the existing Git proxy and verified
the official Node archive checksum. Root dependencies were installed only after
confirming no owner app used them. Preserve actual existing owner processes and
their trees; a handoff PID is not an identity across resets.

The locally tested setup script and helper files are under /workspace/.onboarding.
Source r8-environment.sh for Node22, PHP8.4, pinned gitleaks8.30.1 and Chromium.
The installer preserves an existing node_modules and prepares a separate frozen
candidate; if absent, it performs the tested fresh root install. It neither starts
an application nor migrates an application DB. The owned PostgreSQL startup helper
was tested against its own data directory/random loopback port only. Existing
cloud draft bindings/presets/secret requirements must be preserved. Save the actual
final repository HEAD/mount after full checkout discovery. Review/save and Publish
are required to activate the draft/snapshot; fresh-task restoration remains
unverified. Do not ask for provider credentials for synthetic checks.

External actions: package/tool downloads and the authorized Git branch push only;
no external messages, deployment, payment initiation or provider activity. Feature
flags/owner choices unchanged (D10/feed-under-dock and locked D13 included).
No application/reconciliation workflow was left in flight by this change.

## Approval, rollback and next work

Scoped local engineering review and separate local independent reread approve
85e38c22 and its source manifest; no external/release approval. No stop condition
or test timeout was waived. Rollback is a reviewed revert of this documentation
and85e38c22 together; no SQL rollback. Old package vulnerabilities return on revert.

Continue R8: compatible transitive repairs, separately reviewed major changes
(Drizzle/Nodemailer among them), remaining normative22.5 dependency/portable-script/
package-name/email-provider/artifact/storage-adapter hygiene and history triage.
Keep Claude's R4 integration and all real-target restore/lock/provider UAT/native/
Safari/VoiceOver/visual/legal/professional/operations/final release gates open.
There is no new numbered R9 remediation phase implied by this handoff.
