# Git Sync Plugin Status Page

## Goal

Expose the Git status foundation through the plugin management UI before adding
remote configuration and automation.

## Completed

- Registered a built-in `git-sync` plugin.
- Added a settings tab that shows installed/repo/dirty/branch/remote/last commit
  status.
- Added manual refresh and backup-now actions.
- Added a plugin command for manual backup.
- Kept all Git execution behind existing main-process IPC.

## Verification

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke via Electron CDP: opened Plugins, confirmed `Git Sync`, opened detail
  page, confirmed settings and `Backup now` render.
