## Verification of Prior Fixes

Base:4c2f1b203b2da3f8f81ec901635592935dc7fff3 on
remediation/r8-ci-20261016; fetched from origin and restored without discarding
local work. Prior final review and independent reread were read. Fresh Node22.23.3 /
npm10.9.9 npm ci passed; npm ls --all reports no problems. Lock SHA256 remains
e9886957ba7e697192731a20ff478c4745739e4934391f70dda3d244cb8dec36.
Fresh audit independently reproduces80 affected /61 high /17 moderate /2 low /
0 critical. Guarded baseline build and web parity passed; production/dev proof
must finish before editing dependencies.

## Blocking Issues

No blocker to the two bounded groups below, subject to their verification gates.
The high/critical release gate remains enforced and red. This approves no waiver,
phase exit, deployment, provider calls, shared SQL or feature activation.

## High-Risk Concerns

Group A relocates exactly38 direct build/test/lint/type/native-tool packages from
runtime to development dependencies, retaining every declaration range and every
installed package version/integrity. R8-TOOL-CONSUMERS-2026-10-17.json records1160
tracked code files /153 candidate imports /0 application source value imports.
Manual review additionally covers Babel/Jest string configuration, ESLint,
TypeScript ambient types, package scripts, the CI native-sync step, Capacitor
configuration and Swift package metadata. Capacitor core remains runtime; CLI/iOS
remain installed for build/native sync at8.4.3. Adjust the existing cross-manifest
version contract to read the correct dependency sections. Do not uninstall tools.

Group B updates only compression1.8.1 ->1.8.2, multer2.1.1 ->2.4.0 and
ws8.18.0 ->8.22.0 within existing majors. All three are actual server consumers:
server/app.ts, server/routes.ts and server/db.ts. Current audit ranges explicitly
identify the locked versions as vulnerable and the proposed versions as outside
those ranges. Review the precise lock diff and relevant upload/SSE/WebSocket
behavior. Do not introduce blanket overrides or unrelated package upgrades.

## Missing Steps

For A: fresh ci with byte-identical resulting lock, all four typechecks, all R8
contracts, full client/server tests with no open handles, lint zero-new, guarded
build, fresh production-only installation/static serving, real dev middleware,
Capacitor sync and complete native/web parity. Recount actual production-only
packages and audits separately from vulnerability remediation. For B: fresh ci,
server regression, application types, build/prod/dev proof and actual advisories
removed. Keep unknown transitive/major fixes as separate work.

## Unsafe Assumptions

The literal AST inventory alone does not prove arbitrary dynamic consumers or
permit uninstallation. Moving packages does not remediate their vulnerabilities.
Production entry's expected configuration refusal is import proof, not a full
live daemon/SQL/provider test. Node runtime is pinned; no owner app exists in this
fresh environment, so a fresh root install is safe here. An old PID from a handoff
is not proof that the same process survives a reset.

## Required Ordering Changes

Finish baseline build/production/dev proof, then A and its checks; only then B
and its checks. Review lock classifications separately from package upgrades.
Append final results and a separate local independent reread. Stage explicit
paths only and push the existing R8 branch. Preserve frozen migrations, both
motion libraries, React/react-dom runtime, generated assets and all owner choices.

## Open Product / Provider / Legal Questions

No new owner decision is needed for compatible repairs or proven tool relocation.
Email-provider consolidation, approved package rename, real delivery, settlement,
R4 integration (Claude), provider/native/visual and professional sign-off remain
open. No changes to D10/property feed-under-dock or locked D13.

## Compliance and Data-Handling Notes

Use synthetic local tests, inherited package proxy/CA and no live credentials.
Evidence contains package paths/counts/advisory IDs only; private logs and npm ls
stay outside the repository. Preserve all archives/design sources/uploads. The
124 history candidates are not124 confirmed live credentials; no rotation claimed.

## Test and Rollback Adequacy

Audit-before is the negative security evidence. Existing behavioral suites and
production-only install check the real consumers; native sync checks the retained
build tools. Group A must have zero version/resolution/integrity changes. Group B
must have only reviewed compatible repairs. A regression stops the group before
push. No DB change; rollback restores package/lock/tool contract together, but
restores the old advisories and is not release approval.

## Final Recommendation (Approve / Do not approve)

Approve only groups A and B described above on base4c2f1b2, after the baseline
production/dev proof succeeds. This is a local engineering preflight review, not
external review or R8 completion. Record a separate independent reread before
implementation and another after verification. All existing release gates remain.
