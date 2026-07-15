# Git Sync command palette opens settings

Status: done

Split from `tasks/todo/git-sync-plugin.md`.

## Goal

Make Git Sync discoverable from the unified command palette, matching the
existing Advanced Search and GitHub Backup plugin command behavior.

## Acceptance

- Register an `Open Git Sync` command from the Git Sync plugin.
- Activating the command from search closes the command palette and opens a
  usable Git Sync settings modal.
- The modal exposes the existing settings and status controls without invoking
  network or Git operations during the smoke.
- Desktop and compact UI coverage verifies command row metadata, modal
  geometry, focus/readability, and no horizontal overflow.
- Renderer component coverage includes the new plugin command in search result
  fixtures.

## Verification

- [x] `node scripts/test-renderer-components.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T08-17-03-824Z`
  - Covered desktop and compact command palette search, `Open Git Sync`
    metadata, modal opening, status/settings controls, and no horizontal
    overflow.
- [x] `git diff --check`
