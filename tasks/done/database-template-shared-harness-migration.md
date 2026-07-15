# Database Template Shared Harness Migration

Status: done

## Scope

Move the broad database template smoke onto the shared Electron UI harness so
database templates and view-management coverage uses deterministic app
lifecycle, cleanup, failure artifacts, and desktop plus compact viewport
coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the existing database-template smoke coverage for stored templates,
  template creation, default template behavior, row-page empty prompt,
  template deletion, column summaries, view sort/filter settings, toolbar
  sort/filter popovers, field visibility/order, select and multi-select
  option dropdowns, view create/rename/type switch/duplicate/default/delete
  flows, last-view guard behavior, list view empty/date/icon/open behavior,
  gallery empty/date/cover/icon/open behavior, and calendar date/icon/today/
  overflow/open behavior.
- Run the smoke across desktop and compact viewports.
- Assert the database table remains visible and the document does not introduce
  horizontal overflow at key states.
- Keep this as UI smoke coverage only; no renderer, service, or database
  behavior changes are expected.

## Gates

- `node --check scripts/smoke-database-template-ui.mjs`
- `npm run typecheck`
- `npm run smoke:database-template-ui`
- `git diff --check`

## Result

- Migrated the broad database template smoke to `withLotionUIHarness` with
  desktop and compact viewport coverage.
- Preserved stored/user/default template coverage, empty prompt behavior,
  template deletion, summaries, sort/filter popovers, view CRUD/default/delete
  flows, list/gallery/calendar rendering, icon/open behavior, and overflow
  behavior.
- Added stable field-row and move-button semantics so the field visibility/order
  workflow can be asserted without fragile text/DOM assumptions.
- Added document horizontal-overflow checks at initial and final states.
- Backend/service tests are not applicable because this item only changes UI
  smoke harness coverage plus non-behavioral renderer test/accessibility
  selectors.

Verified:

- `node --check scripts/smoke-database-template-ui.mjs`
- `npm run typecheck`
- `npm run smoke:database-template-ui`
- `git diff --check`
