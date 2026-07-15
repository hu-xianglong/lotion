# Git Sync Manual Pull Action

Status: done

## Why

Users need a manual pull before automatic sync exists, but pull must not run
over uncommitted local workspace changes.

## Scope

- Add a main-process `pull()` action.
- Apply saved remote settings before pulling if a remote URL is configured.
- Refuse to pull when the working tree is dirty.
- Run `git pull --ff-only origin <branch>` with the scoped SSH environment.
- Expose the action through IPC/preload.
- Add a `Pull` button to the Git Sync settings UI.
- Cover success against a local bare repo and dirty-tree refusal.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke verifies the button renders without pulling a real remote.
