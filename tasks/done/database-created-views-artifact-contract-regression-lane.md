# Database Created Views Artifact Contract And Regression Lane

Status: done

Queue item: 599

Backlog source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

Created-date default database views are a user-visible Notion parity surface.
The existing smoke verified that the views exist and sort rows, but it was not
part of the aggregate UI suite and did not emit a machine-readable artifact
contract for future regression review.

## Acceptance

- Add a Database Created Views artifact contract with desktop and compact
  viewport evidence.
- The contract verifies generated ascending/descending created-date views,
  visible view tabs, keyboard activation, row ordering, stable table/tabs
  geometry, no horizontal overflow, and screenshot/metadata files.
- Include the smoke in the aggregate UI suite and focused UI regression gate.
- Keep this scoped to UI harness/regression coverage; no product behavior
  changes.

## Verification

- `node --check scripts/lib/database-created-views-artifacts.mjs` - passed
- `node --check scripts/smoke-database-created-views-ui.mjs` - passed
- `node --test test/ui-harness-artifacts.test.mjs` - passed
- `npm run smoke:database-created-views-ui` - passed
  - Artifact: `artifacts/ui-smoke/database-created-views-ui-2026-06-17T15-46-25-578Z/harness-result.json`
- `LOTION_UI_SUITE_FILTER=database-created-views npm run smoke:ui` - passed
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T15-47-22-906Z/ui-suite-artifacts.json`
  - Report: `artifacts/ui-smoke/ui-suite-2026-06-17T15-47-22-906Z/ui-suite-artifacts.md`
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added `assertDatabaseCreatedViewsArtifactContract` for created-date default
  view behavior.
- The database-created-views smoke now records generated view IDs, tab labels,
  keyboard tab activation, ascending/descending first-row evidence, table/tab
  geometry, no-overflow evidence, and per-viewport screenshots.
- Added Database Created Views to the aggregate UI suite and `test:ui-regression`
  filter.
- No backend/service tests are applicable because this item only adds UI harness
  coverage and smoke artifact validation.
