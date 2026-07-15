# Git Sync Remote Access Test

Status: done

## Why

Before adding push/pull automation, the Git Sync plugin needs a cheap,
actionable way to verify that the saved remote can be reached from the current
machine and, when configured, with the selected SSH key.

## Scope

- Add a main-process `testRemoteAccess` action.
- Configure the remote first when saved settings include `remoteUrl`.
- Run `git ls-remote --heads origin` with a scoped SSH environment when an SSH
  key path is configured.
- Expose the action through IPC/preload.
- Add a `Test remote` button to the Git Sync settings UI.
- Cover success with a local bare repo and failure with an invalid remote.
- Use `execFile`, never shell string interpolation.
- Run Git with a scoped environment when an SSH key is configured:

```text
GIT_SSH_COMMAND=ssh -i <key-path> -o IdentitiesOnly=yes
```

## Gates

- `npm run typecheck` passes.
- `npm run build` passes.
- `node --test test/package-core.test.mjs` passes.
- UI smoke verifies the button renders without invoking a real remote.
