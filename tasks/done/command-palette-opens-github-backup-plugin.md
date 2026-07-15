# Command Palette Opens GitHub Backup Plugin

Status: done

Backlog item: Git/local-first product surface and richer command palette workflows.

## Why

GitHub Backup is a high-risk plugin surface because it touches backup/history UX.
The panel already had renderer coverage and a focused plugin smoke, but the
global search command palette path also needs to prove users can discover and
open the plugin without navigating through sidebar or plugin management.

## Result

- Added `github-backup.open` to the renderer global-search command fixture.
- Locked down the command row title and preview metadata:
  `Sync · GitHub Backup · github-backup.open`.
- Extended the shared multi-resolution search title UI smoke to:
  - search for `github backup`;
  - activate the `Open GitHub Backup` command;
  - assert the search popup closes;
  - assert the GitHub Backup plugin modal opens;
  - assert repository, branch, backup path, adapter, run-backup, status, and
    history controls are visible;
  - assert the modal stays inside the viewport and does not introduce document
    horizontal overflow at desktop and compact widths.

## Tests

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Backend Tests

Not applicable for this item. The change only adds renderer/UI command-palette
coverage for an existing plugin command and modal; GitHub Backup service,
adapter, persistence, path mapping, history restore, and API behavior are
unchanged and already have separate service/renderer coverage.
