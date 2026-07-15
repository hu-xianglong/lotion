# Sidebar Pages Section Hierarchy Tree

Status: done

Started: 2026-06-16T00:00:00Z

Split from `tasks/todo/notion-core-parity-sequence.md` page hierarchy and
sidebar tree parity.

## Why

The sidebar file tree exposes workspace files, but the user-facing Pages
section is still a flat list. Notion's primary navigation preserves parent /
child page hierarchy, so imported and locally nested pages should be scannable
without opening the file tree.

## Acceptance

- The built-in Pages sidebar section renders pages with `parentId` /
  `parentKind: "page"` as a nested tree.
- Parent pages with children expose a keyboard-focusable expand/collapse
  control.
- Child pages are indented, remain clickable, and still support existing page
  context menu behavior.
- Custom tag sections and database sections keep their current flat behavior.
- Multi-resolution sidebar UI smoke verifies hierarchy rendering, collapse /
  expand, navigation to a child page, and no horizontal overflow.

## Gates

- [x] `node --check scripts/smoke-sidebar-navigation-ui.mjs`
- [x] `node scripts/test-renderer-components.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:sidebar-navigation-ui`
  - Artifact: `artifacts/ui-smoke/sidebar-navigation-2026-06-16T06-07-51-580Z`
  - Verified desktop and compact viewports.
- [x] `git diff --check`

## Result

- The built-in Pages section now renders page records as a parent/child tree
  when `parentKind` is `page` and `parentId` points at another visible page.
- Parent rows expose a focusable expand/collapse chevron with accessible labels.
- Child pages remain directly clickable, keep existing context-menu behavior on
  the main row, and are visibly indented without horizontal overflow.
- Tag sections continue to render their matching pages as a flat list, so custom
  sidebar tag behavior did not change.
