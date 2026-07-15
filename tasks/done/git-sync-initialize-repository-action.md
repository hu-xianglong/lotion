# Git Sync Initialize Repository Action

Status: done

## Why

The Git Sync plugin can initialize a repository implicitly through backup or
remote setup, but the product surface calls for an explicit initialize action.

## Scope

- Add a main-process `initRepository` GitService action.
- Expose it through IPC and preload.
- Add an `Initialize repo` button to the Git Sync settings UI.
- Keep remote configuration separate from local repository initialization.
- Add package-core coverage for status before and after init.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke verifies the initialize button renders.
