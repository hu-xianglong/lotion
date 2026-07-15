# Sidebar Settings Shared Harness Migration

Status: done

## Scope

Move the sidebar section settings smoke onto the shared Electron UI harness so
the Pages/Databases section-order workflow uses deterministic setup/cleanup,
failure artifacts, and desktop plus compact viewport coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the coded workflow that verifies default Pages/Databases choices,
  moves Databases above Pages, asserts the rendered sidebar order changes,
  then resets and verifies Pages above Databases.
- Run the workflow across desktop and compact viewports.
- Assert the settings panel and sidebar layout do not horizontally overflow.
- This should remain UI smoke coverage only; no settings persistence or
  backend behavior changes are expected.

## Gates

- `node --check scripts/smoke-sidebar-settings-ui.mjs`
- `npm run typecheck`
- `npm run smoke:sidebar-settings-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-sidebar-settings-ui.mjs` to the shared
  `withLotionUIHarness` lifecycle.
- Preserved the Pages/Databases default choices, reorder, rendered section
  order, and reset workflow assertions.
- Added desktop and compact viewport execution plus no-horizontal-overflow and
  viewport checks for the sidebar settings panel and order rows.
- This change only updates UI smoke harness coverage; settings persistence and
  backend behavior were not changed, so no backend tests were applicable.
