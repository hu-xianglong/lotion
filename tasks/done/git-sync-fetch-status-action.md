# Git Sync Fetch Status Action

Status: done

## Why

Before pull, push automation, or conflict warnings, users need a manual action
that fetches remote refs and refreshes ahead/behind status.

## Scope

- Add a main-process `fetchStatus()` action.
- Apply saved remote settings before fetching if a remote URL is configured.
- Run `git fetch origin --prune` with the scoped SSH environment.
- Expose the action through IPC/preload.
- Add a `Fetch status` button to the Git Sync settings UI.
- Cover success against a local bare repo and failure with a missing remote.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke verifies the button renders without fetching a real remote.
