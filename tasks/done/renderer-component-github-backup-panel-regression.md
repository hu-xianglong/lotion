# Renderer Component GitHub Backup Panel Regression

Status: done

## Why

GitHub Backup/History is a user-facing plugin with service and Electron smoke
coverage, but its plugin panel was not covered by the fast static renderer
component regression suite. A focused fixture now locks down the initial backup
settings, status, active-page history, and restore preview surfaces without
touching real GitHub APIs.

## Scope

- Export the GitHub Backup panel for renderer regression testing.
- Add static renderer coverage for the panel's initial plugin UI.
- Assert repository/branch/path/token controls, local mock/GitHub API adapter
  options, save/run actions, backed-up status, active-page history list, refresh
  action, diff preview, and restore action.

## Backend Coverage

Backend/service tests were not applicable for this item. It only exposes an
existing plugin panel for static renderer coverage and does not change GitHub
backup path mapping, commit/history/restore, error, rate-limit, or idempotency
behavior.

## Result

- Exported `GitHubBackupPanel` with optional initial-state props for static
  renderer fixtures; production plugin rendering still uses the existing
  refresh path.
- Added a fake GitHub Backup plugin context and SSR fixture to
  `scripts/test-renderer-components.mjs`.
- Covered the panel's connection controls, adapter choices, status metrics,
  local mock safety note, current-page history, selected version, diff preview,
  and restore action in the fast renderer component gate.

## Verification

- Passed: `node --check scripts/test-renderer-components.mjs`
- Passed: `npm run test:renderer-components`
- Passed: `npm run typecheck`
- Passed: `git diff --check`
