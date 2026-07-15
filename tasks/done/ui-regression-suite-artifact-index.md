# UI Regression Suite Artifact Index

Status: done

## Why

The focused UI regression lane now runs several multi-resolution child smokes
with artifact contracts, but the aggregate suite output was still hard to
review when a CI or local run failed. Each child writes its own
`harness-result.json`, screenshots, DOM/console metadata, and contract summary;
the suite now also writes a stable index that points reviewers to the relevant
child manifests and summarizes viewport/console/contract health.

## Implemented

- Added `scripts/lib/ui-suite-artifacts.mjs` for building, writing, formatting,
  and validating an aggregate UI regression artifact index.
- Updated `scripts/smoke-ui-suite.mjs` so every aggregate run writes
  `ui-suite-artifacts.json` and `ui-suite-artifacts.md` next to the suite
  `harness-result.json`.
- Added the aggregate index pointer to the harness result summary so release
  artifacts and CI logs can link directly to the JSON/Markdown index.
- Added unit coverage for successful index generation, Markdown/JSON writes,
  missing viewport failures, and console-error failures.
- Updated testing docs to describe the aggregate UI suite artifact index.

## Verification

- `node --check scripts/lib/ui-suite-artifacts.mjs && node --check scripts/smoke-ui-suite.mjs && node --check scripts/ui-harness.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `LOTION_UI_SUITE_FILTER=row-page-property-visual node scripts/smoke-ui-suite.mjs`
  - Aggregate artifact: `artifacts/ui-smoke/ui-suite-2026-06-16T21-22-17-102Z/harness-result.json`
  - Index JSON: `artifacts/ui-smoke/ui-suite-2026-06-16T21-22-17-102Z/ui-suite-artifacts.json`
  - Index Markdown: `artifacts/ui-smoke/ui-suite-2026-06-16T21-22-17-102Z/ui-suite-artifacts.md`
  - Child artifact: `artifacts/ui-smoke/row-page-property-visual-2026-06-16T21-22-44-636Z/harness-result.json`
- `npm run typecheck`
- `git diff --check`

## Notes

The unrelated local Git Sync todo-to-done move was left uncommitted and is not
part of this task.
