# Git Sync Command Palette Backup Now Smoke

Status: done

## Why

The `Backup Now` Git Sync command is user-facing and appears in global search,
but command-palette coverage had focused on opening settings, fetching remote
status, and squash safety. A regression could leave the direct backup command
unusable even though the settings button still works.

## Scope

- Added a real Electron command-palette smoke path for the existing `Backup Now`
  command.
- Used the isolated search-title smoke workspace; this does not touch the
  user's real workspace or remote Git state.
- Asserted command row metadata, activation feedback, no modal side effects,
  keyboard/focus layout, and desktop/compact viewport bounds.
- No Git service behavior changed.

## Acceptance

- Search for `backup now` shows `Backup Now` as a command row with
  `Sync · Git Sync · git-sync.backup-now`.
- Activating it closes search and shows a backup-related notification.
- The command does not open the Git Sync modal.
- Desktop and compact smoke coverage asserts the toast stays in viewport and no
  horizontal overflow appears.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T09-28-03-288Z`
- `git diff --check`

Backend/service tests are not applicable for this slice because the Git service
behavior did not change; the work only adds coded UI coverage for an existing
command-palette activation path.
