# Scoped lint and formatting workflow

Use the Node/npm versions pinned by the repository. `eslint.config.js` defines
JavaScript/TypeScript/React/accessibility rules. The supported package scripts are
in `package.json`; package editing is not subject to the old blanket restriction.

## Current gate

```bash
npm run verify:lint
```

This compares actual errors with the reviewed `scripts/lint-baseline.json` and
fails on new entries. The latest accepted baseline contains558 findings; it is
not a claim that full lint is clean. `npm run lint` reports the full current set.
Do not add baseline rows, disable rules or increase warning tolerances to hide a
new finding. Retire only rows whose underlying problem is actually resolved.

## Work on exact files

For a scoped change, inspect its findings before deciding whether any automatic
fix is appropriate. Use repository-installed tools through npm exec:

```bash
npm exec -- eslint server/route-inventory.ts
npm exec -- prettier --check server/route-inventory.ts
```

Replace that path with the exact reviewed file. If you choose a mechanical
fix/format command, apply it only to those paths and review the resulting diff.
Do not run repository-wide --fix or prettier --write . as a pre-commit routine.
Do not hand-format generated application assets, schemas or policy files.

Preserve initialization side effects, hook order, accessibility, business/legal
copy and public response shapes. A removed unused variable is safe only after
checking whether its initializer or surrounding code has effects. Coordinate
with the integration owner before linting a file another code slice is changing.

## Before a code commit

Run the relevant types/tests and `npm run verify:lint`; inspect the exact staged
files. Use the [CI runbook](docs/operations/r8-ci-verification.md) and the current
[execution ledger](docs/architecture/structure-repair-2026-10-17/EXECUTION.md)
for additional scope-specific checks. Follow the [remediation plan's](docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md)
staged baseline burn; full lint with max-warnings=0 becomes the mandatory clean
release gate only once the baseline reaches zero.
