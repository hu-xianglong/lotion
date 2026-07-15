# Git Sync Command Palette Pull And Push Actions

Status: done

## Why

The Git Sync settings panel exposed Pull and Push buttons, but the unified
command palette only exposed settings, backup, fetch status, and squash safety.
Users should be able to run the common sync actions from the keyboard-first
command surface without opening the settings modal.

## Scope

- Added direct Git Sync command-palette actions for pull and push.
- Reused the existing main-process Git service and notification behavior.
- Covered command registration and real Electron command-palette activation for
  both desktop and compact viewports.
- Kept the isolated smoke workspace; this does not touch the user's remote
  repository.

## Acceptance

- Searching `pull git` shows a `Pull Git remote` command row with Git Sync
  metadata.
- Searching `push git` shows a `Push Git remote` command row with Git Sync
  metadata.
- Activating each command closes search, does not open the Git Sync modal, and
  shows a pull/push notification.
- Desktop and compact smoke coverage asserts notification geometry, keyboard
  focus behavior, and no horizontal overflow.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `node scripts/test-renderer-components.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T14-33-16-187Z`
- `git diff --check`
