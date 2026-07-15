# Git Sync Operation History

Status: done

## Why

Git Sync needs local status beyond raw Git output so users can tell when backup
or push last succeeded and what the last actionable error was.

## Scope

- Extend machine-local Git sync settings with `lastBackupAt`, `lastPushAt`,
  and `lastError`.
- Record backup and push success timestamps.
- Record last error for failed Git operations.
- Display these values in the Git Sync plugin detail page.
- Keep operation history out of workspace files.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke verifies the new status fields render.
