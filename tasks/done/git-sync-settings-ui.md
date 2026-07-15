# Git Sync Settings UI

## Goal

Expose the machine-local Git sync settings in the Git Sync plugin page.

## Completed

- Loaded settings from `window.lotion.git.settings()`.
- Added inputs for remote URL, branch, SSH key path, auto backup cadence, auto
  push cadence, and commit message prefix.
- Saved through `window.lotion.git.updateSettings()`.
- Kept Git execution and persistence behind preload/IPC.

## Verification

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke via Electron CDP/Playwright: opened Git Sync detail, filled settings
  fields, saved, confirmed persisted values, then restored original settings.
