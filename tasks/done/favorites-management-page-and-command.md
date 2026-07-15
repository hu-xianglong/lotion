# Favorites management page and command

Status: done

## Goal

Close a small navigation gap: favorited pages and row pages should have a
Notion-like management surface that users can open from the command palette,
not only a passive sidebar section.

## Acceptance

- Add a built-in Favorites management page.
- The page lists favorite pages and row pages with resolved title, icon, kind,
  and useful path/context instead of raw ids when metadata is available.
- Rows are clickable and navigate to the underlying page or row page.
- Global search / command palette exposes an `Open favorites` command.
- Existing favorite star and sidebar favorite behavior remains unchanged.
- Renderer coverage verifies the management page output.
- Multi-resolution search-title UI smoke opens Favorites through command
  palette, verifies layout/no overflow, and navigates a favorite row.

## Verification

- [x] `node scripts/test-renderer-components.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T07-18-31-010Z`
  - Covered desktop and compact viewports.
- [x] `git diff --check`
