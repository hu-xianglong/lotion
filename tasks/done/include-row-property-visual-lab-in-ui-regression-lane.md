# Include Row-Property Visual Lab In UI Regression Lane

Status: done

## Why

Item 548 added a focused row-page property visual lab, but a focused command is
easy to forget. The UI regression backlog asks for layered gates; the row-page
property lab should be part of the default focused UI regression lane so source
link, date, empty, entity, and property-row alignment regressions are caught by
routine queue verification.

## Scope

- Added the row-page property visual smoke to the `test:ui-regression`
  aggregate filter.
- Verified the aggregate suite discovers and runs the row-property child smoke
  through the shared harness child-manifest compliance gate.
- Stabilized the search-title child smoke for aggregate execution:
  - Layout checks wait for visible search hits before reading geometry.
  - The secondary-window command remains fully verified by standalone
    `smoke:search-title-ui`; aggregate child execution records the command row
    in shared-CDP mode instead of trying to observe a secondary BrowserWindow
    through competing CDP clients.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run smoke:search-title-ui`
- `npm run test:ui-regression`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-16T15-57-23-706Z/harness-result.json`
  - Included child manifest: `artifacts/ui-smoke/row-page-property-visual-2026-06-16T15-57-42-595Z/harness-result.json`
  - Observed viewports: `desktop`, `compact`
- `npm run typecheck`
- `git diff --check`
