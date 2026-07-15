# Sidebar navigation shared harness migration

## Goal

Move the high-value sidebar navigation smoke onto the shared UI harness so it
inherits deterministic app lifecycle, multi-viewport coverage, temp workspace
cleanup, and failure artifacts.

## Acceptance

- The sidebar navigation smoke runs across the shared desktop and compact
  viewport presets.
- Each viewport uses an isolated workspace fixture.
- The test still covers:
  - sidebar page/database/row-page icons,
  - sidebar page right-click Open/Delete actions,
  - file-tree navigation to a database and row page,
  - back/forward tooltip labels,
  - quick-create page/database chooser,
  - new-page body editing, persistence, reload/reopen, and first Recent
    placement.
- The test asserts basic layout health across viewports: visible sidebar, quick
  create button, editor, and no document horizontal overflow.

## Backend Coverage

This is a UI smoke infrastructure migration. It does not touch backend,
service, or persistence behavior, so backend tests are not applicable.

## Result

- Migrated `scripts/smoke-sidebar-navigation-ui.mjs` to the shared UI harness.
- The smoke now runs across the shared desktop and compact viewports.
- Each viewport creates an isolated workspace fixture with viewport-scoped page,
  database, and row ids.
- Preserved existing coverage for sidebar icons, page context menu Open/Delete,
  file-tree database and row-page navigation, history tooltips, quick-create
  chooser, new-page editing, persistence, reload/reopen, and Recent placement.
- Added basic layout assertions for the sidebar, quick-create control, and
  document horizontal overflow at each viewport.

## Gates

- `node --check scripts/smoke-sidebar-navigation-ui.mjs`
- `npm run typecheck`
- `npm run smoke:sidebar-navigation-ui`
- `git diff --check`
