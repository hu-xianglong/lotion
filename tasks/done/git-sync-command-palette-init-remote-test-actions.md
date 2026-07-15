# Git Sync Command Palette Init And Remote Test Actions

Status: done

## Why

Git Sync still required users to open the settings modal for two common setup
actions: initialize the workspace repository and test remote access. These are
keyboard-friendly command-palette actions in the Git Sync scope and should be
covered the same way as backup, fetch, pull, push, and squash safety.

## Scope

- Added direct Git Sync command-palette actions for initializing the repository
  and testing remote access.
- Reused the existing main-process Git service; no Git service behavior changed.
- Covered command registration and real Electron command-palette activation for
  both desktop and compact viewports.
- Used the isolated search-title smoke workspace; the smoke does not touch the
  user's real workspace or remote repository.

## Acceptance

- Searching `initialize git` shows an `Initialize Git repo` command row with
  Git Sync metadata.
- Searching `test remote` shows a `Test Git remote access` command row with Git
  Sync metadata.
- Activating each command closes search, does not open the Git Sync modal, and
  shows an actionable notification.
- Desktop and compact smoke coverage asserts notification geometry, keyboard
  focus behavior, and no horizontal overflow.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `node scripts/test-renderer-components.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T14-52-34-086Z`
- `git diff --check`

Backend/service tests were not applicable for this item because the change only
registers new command-palette actions that call existing Git service APIs.
