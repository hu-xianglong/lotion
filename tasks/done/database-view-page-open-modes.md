# Database View Page Open Modes

Status: done

Verification status: verified

Priority: P1

Depends on: Database settings menu shell; Database row context menu and restore

## Goal

Let each view choose whether row pages open in side peek, center peek, or full
page while preserving navigation and editing state.

## Frontend

- Add `open pages in` to Layout settings.
- Implement side peek and center peek using the existing row-page surface.
- Preserve table scroll, selection, active view, filter/sort menu state, and
  browser-style back/forward semantics.
- Provide explicit Open as full page and Open in new window actions.

## Backend

- Persist `pageOpenMode` per view with type-appropriate defaults.
- Ensure deep links target the row, not the transient peek container.

## Acceptance

- Closing a peek returns focus and scroll to the originating row.
- Editing in a peek updates every surface through the shared cache.
- Reload uses the saved mode without reopening an old transient peek.

## Gates

- Page-open preference normalization tests.
- Side/center/full page navigation UI smoke.
- `npm run typecheck`, `npm run build`.

## Delivered

- Added persisted per-view `pageOpenMode` with type-aware side/center defaults and a scoped settings submenu.
- Added side and center peek shells that reuse the row page editor, keep the originating database mounted, synchronize edits through the shared cache, and restore focus on close.
- Kept canonical/deep-link navigation full-page while exposing explicit full-page and new-window actions from peeks and row menus.

## Verification

Independently verified on 2026-07-22 after reviewing the implementation against
the goal, acceptance criteria, and persisted schema.

Defects found and fixed during verification:

- Kanban cards did not delegate row opening to the host, so their saved
  `pageOpenMode` was never honored. Cards now support pointer and keyboard
  activation through the shared row-opening path.
- Back navigation attempted to leave the underlying database while a transient
  peek was open. Back now closes the peek first and exposes the correct history
  availability and label.
- Restoring focus could reset horizontal table scroll, and plugin rerenders could
  detach the original Kanban card node. Focus restoration now prevents scrolling
  and resolves a replacement row/card when necessary.
- The peek action bar was fixed to the viewport instead of contained by the peek.
  It is now positioned within the side/center surface.
- The original smoke covered only the default table at one effective viewport.
  Coverage now exercises table, list, gallery, calendar, and Kanban views at real
  desktop and compact viewport sizes, including side/center/full modes, shared
  edits, focus/scroll/selection preservation, Back behavior, reload behavior,
  explicit full-page opening, deep-link behavior, and exact persistence.
- Added an artifact contract test and registered the page-open smoke in the UI
  regression suite so missing phases, viewport evidence, or undersized captures
  fail CI rather than silently passing.

Verification results:

- `node --test test/package-core.test.mjs` (43/43 passed; all view defaults,
  explicit overrides, custom plugin fallback, and invalid-value normalization)
- `node --test test/database-page-open-artifacts.test.mjs` (1/1 passed)
- `npm run test:renderer-components` (passed, including Kanban host delegation)
- `LOTION_UI_SUITE_FILTER=database-page-open npm run smoke:ui` (passed on
  1440x1000 desktop and 1040x820 compact; all 14 assertions per viewport, zero
  console errors, two validated snapshots)
- `npm run smoke:database-settings-menu-ui` (desktop/compact passed, including
  keyboard navigation, dismissal levels, scope labels, and overflow checks)
- `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`, and
  `npm run build` (all passed; build retains the existing chunk-size warning)
- `git diff --check` (passed)

Evidence:

- Page-open UI artifact:
  `artifacts/ui-smoke/database-page-open-ui-2026-07-22T18-59-09-706Z/`
- Filtered suite artifact:
  `artifacts/ui-smoke/ui-suite-2026-07-22T18-59-02-345Z/`
- Settings regression artifact:
  `artifacts/ui-smoke/database-settings-menu-ui-2026-07-22T19-00-09-107Z/`
- Manually inspected the generated desktop and compact center-peek screenshots;
  the modal, editor, and action bar remain contained and usable at both sizes.
