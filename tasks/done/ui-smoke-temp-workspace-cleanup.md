# UI smoke temp workspace cleanup

## Goal

Prevent Electron UI smoke scripts from leaving deleted temporary workspaces in
the app-level Recent workspace list.

## Scope

- After each UI smoke restores the previous workspace, call
  `window.lotion.workspace.forget(tempPath)` for temporary workspaces.
- Keep the cleanup best-effort so smoke failures still report the original
  assertion.
- Re-run the UI smoke suite.

## Gates

- `npm run smoke:ui`
- `git diff --check`
