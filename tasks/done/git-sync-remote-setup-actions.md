# Git Sync Remote Setup Actions

## Goal

Let the Git Sync plugin apply saved remote settings to the local workspace repo
without running network sync yet.

## Scope

- Add a main-process action that initializes Git when needed.
- Configure `origin` from local Git Sync settings.
- Rename the local branch to the configured branch.
- Expose the action through IPC/preload.
- Add an `Apply remote config` button that saves current form values first.
- Cover local remote configuration in GitService tests.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke for the button.
