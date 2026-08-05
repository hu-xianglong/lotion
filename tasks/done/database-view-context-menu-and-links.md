# Database View Context Menu And Links

Status: done

Verification status: verified

Priority: P0

Depends on: Database settings menu shell; Database view create switch reorder and overflow

## Goal

Give each view tab a consistent click/right-click menu for common view actions.

## Delivered

- Opened the view menu from active-tab click, a tab secondary action, or right-click.
- Added Rename, Edit view, Duplicate, Set as default, Copy link, and Delete.
- Added inline rename with non-empty/unique validation and disabled delete for the last view.
- Added stable deep-link parsing/routing that opens the database and requested view.

- Added a canonical `lotion://database/{databaseId}?view={viewId}` contract.
- Ensured duplicate preserves all layout/filter/sort/group settings but receives
  a unique name/ID and deterministic position.
- Added typed errors for missing views, invalid order, conflicting names, and
  last-view deletion; stale patches retain the typed `VIEW_CONFLICT` result.

## Acceptance

- Copy link reopens the exact view after app restart.
- Right-click does not also switch or open the row beneath it.
- Default/delete behavior remains correct after reorder.

## Verification

- Focused view link/lifecycle service tests.
- `node --test test/database-view-menu-artifacts.test.mjs`
- `npm run smoke:database-view-menu-ui`
- `LOTION_UI_SUITE_FILTER=database-view-menu npm run smoke:ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- The desktop and compact UI smoke verified inactive-tab right-click isolation,
  case-insensitive duplicate-name validation, inline rename, active-tab menu,
  secondary action, duplicate, set-default, clipboard link, renderer reload,
  exact-view deep-link routing, deletion, and valid default recovery.
- Debugging found and fixed an unhandled rename-conflict rejection: duplicate
  names are now blocked before submission and backend errors render inline.
  It also found that Escape left focus on `body` after cancelling inline rename,
  so a second Escape could not close the menu. `MenuSurface` now restores focus
  when its child mode changes, and the two-level Escape sequence is covered.
- The prior smoke recorded a 1440×1000 label while actually capturing a
  1280×788 body. It now drives explicit desktop/compact viewports and enforces
  an artifact contract. Both visually inspected menus remained fully onscreen
  with the danger action separated: 2 screenshots, 218,715 bytes, zero console
  errors, and zero missing artifact contracts. Evidence:
  `artifacts/ui-smoke/database-view-menu-ui-2026-07-22T16-55-09-380Z/`
  and `artifacts/ui-smoke/ui-suite-2026-07-22T16-55-03-767Z/`.
- Canonical link round trips, typed lifecycle errors, artifact/renderer
  coverage, TypeScript, production build, and diff whitespace checks passed.
