# UI suite artifact index screenshot path links

Status: done

## Why

The UI regression suite writes per-smoke manifests and screenshots, but the
aggregate Markdown index only links the child manifest. Reviewing visual
regressions still requires manually opening each timestamped artifact folder to
find representative screenshots.

## Acceptance

- Add aggregate JSON fields for child artifact roots and representative
  screenshot paths.
- Add a Markdown column or detail text that points directly at the child
  artifact root and first screenshots.
- Keep existing artifact-contract enforcement intact.
- Add coded harness artifact tests for the new fields and Markdown output.
- Run a focused filtered UI suite smoke to verify the real aggregate index still
  writes correctly.

## Result

- Preserved `imagePath` and `metadataPath` in harness result artifact-contract
  summaries.
- Added `representativeSnapshotPaths` to aggregate UI suite artifact JSON.
- Added an `Artifacts` column to aggregate Markdown with the child artifact root
  and representative screenshot paths.
- Documented the aggregate index screenshot path behavior in testing docs.

## Verification

- [x] `node --check scripts/ui-harness.mjs && node --check scripts/lib/ui-suite-artifacts.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `LOTION_UI_SUITE_FILTER=smoke-row-page-property-visual-ui.mjs npm run smoke:ui`
- [x] `rg -n "Artifacts|root=|screenshots=" artifacts/ui-smoke/ui-suite-2026-06-17T12-00-47-472Z/ui-suite-artifacts.md`
- [x] `npm run typecheck`
- [x] `git diff --check`
