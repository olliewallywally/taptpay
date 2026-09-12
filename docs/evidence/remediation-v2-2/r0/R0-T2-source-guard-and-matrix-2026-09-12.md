# R0-T2 continuation — executable environment-read guard and matrix proof

Base: `3d9736cf397d23fa0073f40704302d91a449a835`.
Branch: `remediation/r1-continuation-20260907`.
Scope: configuration tests only; no application behavior change.
Pre-implementation review: [bounded review](R0-T2-source-guard-preflight-2026-09-12.md).

## Defects demonstrated

The prior environment-read guard matched text with regular expressions. It missed
ordinary executable forms including `process["env"]`, optional chaining,
whitespace, aliases/destructuring and process-module imports. It also treated
comments and string literals as executable reads.

Before changing the scanner:

```
npx jest --selectProjects server --runInBand --runTestsByPath server/__tests__/config-source-guard.test.ts
Test Suites: 1 failed, 1 total
Tests:       14 failed, 7 passed, 21 total
```

This proves defects in the regression guard, not newly discovered environment
reads in the application. The existing repository inventory already passed.

The old payment-mode rejection tests supplied `DATABASE_TARGET=test` or
`DATABASE_TARGET=development`, both invalid. Those cases threw before reaching
payment-mode validation. The old test titled "every environment" for crypto ran
only in `test`.

## Changes

- The guard now walks the TypeScript AST, using the existing route-inventory
  compiler API precedent. It distinguishes code from inert comments/strings,
  detects the tested alternate access forms, and rejects indirect process handles
  and process-module imports instead of attempting permissive alias tracking.
- The exact migration file/key exceptions are unchanged. Synthetic route,
  provider, worker and nested-file fixtures pass through the same policy function
  as the repository scan. Dynamic/bare/imported access cannot inherit an
  exception. Allowlist membership checks own properties only.
- All 16 application-environment/payment-mode cells now use valid prerequisite
  configuration. Valid combinations must load; invalid combinations must fail
  specifically on `PAYMENT_MODE`. Crypto rejection is verified in all four
  environments under both audit and enforce validation.

## Verification

- Focused configuration and source-guard run: **2 suites / 94 tests pass**.
- `npm run check`: pass.
- `npm run test:server`: **52 suites / 1,019 tests pass** (exit 0).
- `git diff --check`: pass.

The initial full-suite attempt was blocked by the sandbox's `listen EPERM` on
Supertest's local HTTP listener. It was rerun with approved local socket access.
The existing ts-jest `isolatedModules` deprecation warning remains.
The focused tests use explicit synthetic configuration and source snippets;
they do not query a database or call a provider. No migration, live service,
secret rotation, flag change, deployment or UI change was performed.

## Limits and continuation

This is a bounded static regression guard for checked-in server TypeScript, not
a JavaScript sandbox or a complete reflection/dataflow analyzer. It deliberately
requires review for indirect process access. Test fixtures remain outside the
application scan. Client/build/device checks are not needed for this test-only
diff and were not rerun.

R0 remains incomplete: owner credential/incident checks, operational evidence and
device acceptance are still open in the main ledger. This batch does not approve
R1 feature work, R2/R3 payment redesign or a release. The recorded split-session
replay finding remains unfixed for R3 scoping.

Rollback: revert only these two test files and evidence/index additions; doing
so restores a weaker guard, not a runtime behavior. No schema rollback applies.
Changes are uncommitted on the base above; evidence describes this working diff,
not an approved deployment SHA.
