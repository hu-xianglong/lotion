# Git Sync Command Palette Fetch Status

Status: done

## Why

Git Sync exposes "Fetch status" inside the settings panel, but command palette
users currently need to open the whole Git Sync modal before refreshing remote
ahead/behind state. This should be a direct command, consistent with the
existing backup and squash-safety commands.

## Scope

- Register a `git-sync.fetch-status` command with a clear "Fetch Git remote
  status" title.
- The command calls the existing Git IPC/service path and reports a concise
  notification without opening an unrelated modal.
- The implementation is scoped to command registration and command-palette
  coverage; no Git service behavior changed.

## Acceptance

- Global search finds the command by "fetch git status".
- The command row shows `Sync · Git Sync · git-sync.fetch-status`.
- Activating the command closes search, shows a Git remote status notification,
  and does not open the Git Sync modal.
- Desktop and compact command-palette smoke coverage assert layout bounds and no
  horizontal overflow.
- Renderer command fixture coverage includes the new command.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `node scripts/test-renderer-components.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T09-14-36-326Z`
- `git diff --check`

Backend/service tests were not added because this item reuses the existing
`window.lotion.git.fetchStatus()` IPC and `GitService.fetchStatus()` behavior
without changing Git data/service logic.
