# Renderer Component Git Sync Panel Regression

Status: done

## Why

Git Sync has many workflow-level smokes, but the settings/status plugin panel
was not covered by the fast static renderer component regression suite. A small
fixture now pins the visible sync settings, manual actions, status cards, and
raw status output without invoking local Git or network operations.

## Scope

- Export the Git Sync panel for renderer regression testing.
- Add static renderer coverage for the panel's configured state.
- Assert refresh/init/backup actions, remote URL/branch/SSH key/pause/prefix
  controls, auto backup and push cadence options, remote/push/pull actions,
  status metrics, success message output, and raw Git status details.

## Backend Coverage

Backend/service tests were not applicable for this item. It only exposes an
existing plugin panel for static renderer coverage and does not change Git
service settings, backup/push/pull/fetch scheduler behavior, remote handling,
or status parsing.

## Result

- Exported `GitSyncSettingsPanel` with optional initial status/settings/message
  props for static renderer fixtures; production plugin rendering still uses the
  existing `window.lotion.git` refresh path.
- Added a configured Git Sync panel fixture to
  `scripts/test-renderer-components.mjs`.
- Covered the panel's action buttons, remote settings, SSH key picker,
  automation pause checkbox, backup/push cadence selects, status cards, success
  message, and raw status output in the fast renderer component gate.

## Verification

- Passed: `node --check scripts/test-renderer-components.mjs`
- Passed: `npm run test:renderer-components`
- Passed: `npm run typecheck`
- Passed: `git diff --check`
