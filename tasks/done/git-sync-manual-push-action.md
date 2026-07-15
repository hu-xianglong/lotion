# Git Sync Manual Push Action

Status: done

## Why

After remote configuration and remote access testing, users need a manual push
button before any automatic sync policy exists.

## Scope

- Add a main-process `push()` action.
- Apply saved remote settings before pushing if a remote URL is configured.
- Push the configured branch to `origin` with upstream tracking.
- Use the same scoped SSH environment as remote access tests.
- Expose the action through IPC/preload.
- Add a `Push` button to the Git Sync settings UI.
- Cover success against a local bare repo and failure with a missing remote.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke verifies the button renders without pushing a real remote.
