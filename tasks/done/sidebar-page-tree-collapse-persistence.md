# Sidebar page tree collapse persistence

Status: done

## Goal

Make the Notion-like Pages sidebar tree remember expanded/collapsed page nodes
across reloads and workspace reopen within the app session, so users do not
lose navigation context after opening pages or refreshing the app.

## Acceptance

- Collapsing a parent page in the built-in Pages sidebar section persists the
  collapsed page id to local storage.
- Reloading or reopening the same workspace keeps the parent collapsed and
  hides child pages until the user expands it again.
- Expanding the parent clears the persisted collapsed state.
- Keyboard focusability and existing child-page navigation/creation behavior
  remain unchanged.
- Multi-resolution sidebar UI smoke verifies persistence, restored expansion,
  and no horizontal overflow.

## Result

- Added persisted collapsed-node state for the built-in Pages tree.
- Kept the current page-tree keyboard and click behavior unchanged.
- Extended the multi-resolution sidebar navigation smoke to collapse a parent
  page, reload, verify children stay hidden, expand with the keyboard, reload
  again, and verify children are visible.

## Verification

- [x] `node --check scripts/smoke-sidebar-navigation-ui.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:sidebar-navigation-ui`
  - Artifact: `artifacts/ui-smoke/sidebar-navigation-2026-06-16T06-57-29-972Z`
  - Verified desktop and compact viewports.
- [x] `git diff --check`
