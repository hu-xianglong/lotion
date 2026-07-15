# Page Path Slash Shared Harness Migration

Status: done

## Scope

Move the page-title slash regression smoke onto the shared Electron UI harness
so breadcrumb/path behavior uses deterministic lifecycle, cleanup, failure
artifacts, and desktop plus compact viewport coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the regression where a title containing `/` remains one breadcrumb
  segment instead of being split into path hierarchy.
- Preserve parent breadcrumb navigation and active tab title assertions.
- Run the workflow across desktop and compact viewports with isolated fixture
  workspaces.
- Assert the breadcrumb/path label remains visible within the viewport and the
  page has no horizontal overflow.
- This should remain UI smoke coverage only; no page/path service behavior
  changes are expected.

## Gates

- `node --check scripts/smoke-page-path-slash-ui.mjs`
- `npm run typecheck`
- `npm run smoke:page-path-slash-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-page-path-slash-ui.mjs` to
  `withLotionUIHarness`.
- Preserved the regression assertions that a title containing `/` remains one
  breadcrumb segment and the parent breadcrumb remains the only clickable parent
  link.
- Preserved the parent breadcrumb navigation and active-tab title assertions.
- Ran the fixture independently across desktop and compact viewports.
- Added no-horizontal-overflow checks plus viewport bounds assertions for the
  breadcrumb label and parent breadcrumb.
- This change only updates UI smoke harness coverage; page/path services were
  not changed, so backend tests were not applicable.
