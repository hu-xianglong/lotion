# Sidebar create child page from page tree

Status: done

## Goal

Complete the first practical child-page operation for the sidebar hierarchy:
users should be able to create a new page directly under an existing page from
the page tree, and the new page should immediately appear nested below its
parent.

## Acceptance

- Sidebar page context menu exposes a clear `New child page` action.
- Creating a child page sets `parentId`, `parentKind: "page"`, and a
  Notion-style path derived from the parent path plus the new title.
- The created child page opens immediately, is added to Recent, and appears
  nested under the parent in the Pages sidebar tree without a manual reload.
- Existing top-level quick-create and command-palette page creation remain
  top-level.
- Desktop and compact sidebar smoke coverage verifies the action, tree
  indentation, focus/click behavior, and no horizontal overflow.
- Renderer component coverage verifies the menu action renders.

## Result

- Extended `pages.create` with optional parent/path metadata and made the page
  service derive a child path from the parent page when needed.
- Added `New child page` to the sidebar page context menu.
- Created child pages open immediately, are recorded in Recent, and render as
  children in the page tree without reload.
- Kept top-level quick-create and command-palette page creation unchanged.

## Verification

- [x] `node --check scripts/smoke-sidebar-navigation-ui.mjs`
- [x] `node scripts/test-renderer-components.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:sidebar-navigation-ui`
  - Artifact: `artifacts/ui-smoke/sidebar-navigation-2026-06-16T06-43-09-135Z`
- [x] `git diff --check`
