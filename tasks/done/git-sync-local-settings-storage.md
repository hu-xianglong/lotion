# Git Sync Local Settings Storage

## Goal

Persist machine-local Git sync settings outside the synced workspace, keyed by
absolute workspace path.

## Completed

- Added `GitSyncSettings` shared types.
- Stored per-workspace Git sync settings in `AppConfigService`.
- Normalized settings on load/update.
- Deleted per-workspace settings when a workspace is forgotten.
- Exposed settings through `GitService`, IPC, and preload.
- Covered app-config and GitService behavior in package-core tests.

## Verification

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
