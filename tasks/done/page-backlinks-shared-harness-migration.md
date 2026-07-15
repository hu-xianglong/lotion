# Page Backlinks Shared Harness Migration

Status: done

## Scope

Move the page backlinks regression smoke onto the shared Electron UI harness so
page/row reference backlinks use deterministic lifecycle, cleanup, failure
artifacts, and desktop plus compact viewport coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve backlink rendering assertions for markdown page links.
- Preserve backlink rendering assertions for database row/entity-ref property
  links.
- Preserve click-through assertions for both page backlinks and row-page
  backlinks without leaking raw ids in the active tab.
- Run the workflow across desktop and compact viewports with isolated fixture
  workspaces.
- Assert the backlinks panel remains visible/interactable without document
  horizontal overflow.
- This should remain UI smoke coverage only; no backlink service behavior
  changes are expected.

## Gates

- `node --check scripts/smoke-page-backlinks-ui.mjs`
- `npm run typecheck`
- `npm run smoke:page-backlinks-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-page-backlinks-ui.mjs` to
  `withLotionUIHarness`.
- Ran the backlink workflow independently across desktop and compact viewports.
- Preserved markdown page backlink rendering assertions including source type,
  source path, line context, and excerpt.
- Preserved database row/entity-ref property backlink rendering assertions
  including source type, source path, field context, and cell preview.
- Preserved click-through assertions for both row-page and page backlinks and
  verified active tabs do not leak raw source ids.
- Added no-horizontal-overflow checks plus viewport bounds assertions for the
  backlinks panel.
- Updated the smoke fixture to use the current table view shape
  (`visibleFieldIds`, `fieldOrder`, `wrapFieldIds`, `sorts`, `filters`) so row
  backlink navigation exercises the current data model.
- This change only updates UI smoke harness coverage and fixture shape;
  backlink services were not changed, so backend tests were not applicable.
