# R0-T7 — reviewed current-tree cleanup

This supplements the earlier handoff and preserves its pre-removal reports.

## Source findings

The owner-authorized Google attachment key removal is recorded separately in
the [dated disposition](../../../decisions/2026-09-08-google-analytics-key-removal.md).
Its provider deactivation and historical copies are not represented as resolved.

Independent subagent `review_remaining_findings` classified the other eight
current-source matches without printing values:

| File | Classification and change |
|---|---|
| `attached_assets/APIManagement_1763168150568.tsx` | Abbreviated key-shaped labels in mock data, no provider transport. Replaced six demo labels (five matches) with explicit unavailable labels. |
| `client/src/pages/admin-api.tsx` | Curl documentation placeholder, not a runtime credential. Replaced with a shell environment-variable reference. |
| `scripts/smoke-quote-pdf.ts` | Standalone PDF fixture with sequential sample link token, no database/provider call. Replaced with an explicit fixture label. |
| `docs/superpowers/plans/2026-06-23-trades-gst-mode-and-quote-pdf.md` | Matching PDF fixture example, updated consistently. |

No merchant layout, auth/onboarding flow, payment capability or real API behavior
was changed. No obsolete mock integration was enabled or represented as supported.

## Scanner boundary fix

Subagent `scanner_review` identified a parent-directory symlink escape. The
original lstat checked only the final file component. A tracked descendant could
therefore refer outside the checkout when its parent directory became a symlink.
The new test failed before the fix (6 passed / 1 failed). The scanner now requires
the file's real path to equal its lexical path before linking it into the scan.
Scanner and finding-review agents returned these findings before reaching their
usage limit; they did not provide complete final approval reports.

## Reviewed evidence false positives

After source cleanup, the upstream Sourcegraph rule flagged 277 matches in our
own handoff/history evidence. Its
[pinned rule](https://github.com/gitleaks/gitleaks/blob/v8.30.1/cmd/generate/config/rules/sourcegraph.go)
accepts bare 40-hex strings when its keyword appears in the scanned content.
The findings here were Git commit identifiers, not exposed credential values.

All 75 distinct identifiers were independently checked with `git cat-file` and
resolved to commit objects. `.gitleaks.toml` now permits only those whole values
for that one rule at the two reviewed handoff/history-report path suffixes.
Path and value conditions use explicit AND semantics. Suffix matching also
accepts a nested copy of that same path; it is not a repository-root-only match.
It does not ignore a commit's contents, all evidence, a rule or an arbitrary hash.

Subagent `migration_preflight` independently approved this narrow exception
before and after implementation. Actual scanner tests prove an unknown bare
hash, a prefixed token at the same evidence path, and a known hash in ordinary
source still fail. No historical finding was erased or blanket-baselined.

## Verification and remaining status

- Scanner: **8 tests passed**, using actual pinned Gitleaks on synthetic repos.
- Configuration/ignore/CI safeguards: **3 tests passed**.
- Current-tree scan after cleanup: **0 findings**, exit 0. Metadata-only result:
  [clean-tree record](R0-T7-tree-clean-2026-09-08.jsonl).
- Typecheck and production build passed; existing warnings remain.
- Original history report remains a historical exposure/review record, not a
  declaration of thousands of unique or active secrets. History CI remains
  blocking until its remaining findings receive authorized disposition.

R0-T7 still needs actual isolated local app boot acceptance and the human
history/access disposition; full R0 remains gated. All edits are uncommitted.
No production connection, credential rotation, history rewrite or deployment.
