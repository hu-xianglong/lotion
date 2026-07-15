# Shell Open Dry-run Smoke Hook

## Goal

Let Electron UI smoke tests verify URL/file open click paths without launching
the system browser or Finder.

## Scope

- Add a debug-only IPC surface that can enable/disable shell open dry-run mode.
- When dry-run is enabled, `shell:openLink` should record the requested URL/path
  and return success without calling Electron `shell.openExternal/openPath`.
- Expose the debug helpers through the preload API for smoke scripts.
- Update `smoke:url-field-ui` to enable dry-run, click the URL open button, and
  assert the normalized URL was recorded.

## Gates

- [x] `npm run smoke:url-field-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
