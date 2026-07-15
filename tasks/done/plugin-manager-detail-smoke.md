# Plugin Manager Detail Smoke

## Goal

Add an Electron UI smoke for the plugin manager surface so built-in plugin
detail pages and settings tab hosts stay usable while the plugin platform grows.

## Scope

- Open the plugin manager from the sidebar.
- Verify loaded built-in plugins are listed.
- Open Notion Import, LLM Providers, and Git Sync detail pages.
- Verify each detail page mounts its settings surface.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run smoke:ui`
- `git diff --check`

## Result

- Added `scripts/smoke-plugin-manager-ui.mjs`.
- Added `npm run smoke:plugin-manager-ui`.
- Included the plugin manager smoke in `npm run smoke:ui`.
- Added shared UI smoke workspace recovery helpers so smoke scripts do not
  restore to deleted temp workspaces from earlier suite steps.
- Stabilized source/attachment smoke by checking top-level source properties
  before scrolling to the row body attachments.
