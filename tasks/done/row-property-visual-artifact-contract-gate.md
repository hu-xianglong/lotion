# Row-property Visual Artifact Contract Gate

Status: done

Queue item: 550

## Why

The row-page property visual lab now creates deterministic screenshots and DOM
geometry assertions, but CI should also validate that those artifacts are
machine-readable and complete. Otherwise a future smoke could pass while
dropping the metadata needed to audit source links, dates, empty values, entity
references, and value-column alignment.

## Scope

- Added a reusable artifact contract for the row-property visual lab result.
- Validated desktop and compact viewport artifacts, screenshot metadata,
  source-link rows, date rows, entity rows, row counts, value-column alignment,
  keyboard-focus summaries, and source-open captures.
- Exposed the contract in the row-property visual smoke result and aggregate UI
  child manifest summary so CI logs show a concise reviewable result.
- Added focused unit coverage for the contract and kept the existing focused
  multi-viewport UI smoke as the UI gate.

## Verification

- [x] `node --check scripts/lib/row-page-property-visual-artifacts.mjs`
- [x] `node --check scripts/smoke-row-page-property-visual-ui.mjs`
- [x] `node --check scripts/ui-harness.mjs`
- [x] `node --check scripts/smoke-ui-suite.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run smoke:row-page-property-visual-ui`
  - Artifact: `artifacts/ui-smoke/row-page-property-visual-2026-06-16T16-20-10-253Z/harness-result.json`
- [x] `LOTION_UI_SUITE_FILTER=row-page-property-visual node scripts/smoke-ui-suite.mjs`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-16T16-22-23-144Z/harness-result.json`
- [x] `npm run typecheck`
- [x] `git diff --check`
