# Include Embedded Database Table Lab In UI Regression Lane

Status: done

## Why

Item 555 added a machine-readable embedded database table artifact contract, but
the default focused UI regression lane still did not run the embedded-view
child smoke. Embedded database tables are a core imported Notion and page
editing surface, so their load-more affordance, column order, viewport
geometry, and screenshot contract should be checked by routine UI regression.

## Implemented

- Added `embedded-view` to `npm run test:ui-regression`.
- Updated the testing docs to list embedded database table/view coverage in the
  focused UI regression lane.
- Fixed the shared UI harness viewport summarizer so child manifests recognize
  smoke results shaped like `results[].viewport` and artifact-contract observed
  viewport names. This was required because the embedded-view smoke runs its
  own desktop/compact loop and returns those results inside `results`.
- Added unit coverage for result-array and artifact-contract viewport coverage.

## Verification

- `node --check scripts/ui-harness.mjs && node --test test/ui-harness-artifacts.test.mjs`
- `LOTION_EMBEDDED_VIEW_COUNTS=1 LOTION_EMBEDDED_VIEW_ROWS=120 LOTION_UI_SUITE_FILTER=embedded-view node scripts/smoke-ui-suite.mjs`
  - Artifact: `artifacts/ui-smoke/embedded-view-ui-2026-06-16T18-45-45-008Z/harness-result.json`
- `LOTION_EMBEDDED_VIEW_COUNTS=1 LOTION_EMBEDDED_VIEW_ROWS=120 npm run test:ui-regression`
  - Aggregate artifact: `artifacts/ui-smoke/ui-suite-2026-06-16T18-47-13-781Z/harness-result.json`
  - Embedded child artifact: `artifacts/ui-smoke/embedded-view-ui-2026-06-16T18-48-33-641Z/harness-result.json`
- `npm run typecheck`
- `git diff --check`
