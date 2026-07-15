# Row-page Property Visual Overflow Artifact Coverage

Status: done

Queue item: 591

## Why

The row-page property visual smoke asserts that the page has no horizontal
overflow while it is running, but the persisted artifact contract did not record
or validate that evidence. A future regression could weaken the smoke or drop
the viewport metrics while still leaving screenshots and row metadata in place.

## Scope

- Required row-property visual artifacts to include document viewport metrics
  for every tested viewport.
- Failed the artifact contract when `scrollWidth` exceeds the viewport width
  beyond the same small tolerance used by the live UI smoke.
- Preserved overflow evidence in the harness manifest and aggregate UI suite
  artifact details so reviewers can see `horizontalOverflowPx`, `scrollWidth`,
  and `viewportWidth` without opening the raw child smoke output.

## Verification

- [x] `node --check scripts/lib/row-page-property-visual-artifacts.mjs && node --check scripts/smoke-row-page-property-visual-ui.mjs && node --check scripts/ui-harness.mjs && node --check scripts/lib/ui-suite-artifacts.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `LOTION_UI_SUITE_FILTER=smoke-row-page-property-visual-ui.mjs npm run smoke:ui`
  - Child artifact: `artifacts/ui-smoke/row-page-property-visual-2026-06-17T13-22-03-775Z/harness-result.json`
  - Suite artifact: `artifacts/ui-smoke/ui-suite-2026-06-17T13-21-42-106Z/ui-suite-artifacts.json`
  - Suite report: `artifacts/ui-smoke/ui-suite-2026-06-17T13-21-42-106Z/ui-suite-artifacts.md`
- [x] `npm run typecheck`
- [x] `git diff --check`
