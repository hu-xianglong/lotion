# Git Sync Auto Backup Scheduler

Status: done

## Why

The Git Sync UI has auto backup cadence settings. These should start and stop a
main-process scheduler for the active workspace instead of remaining inert.

## Scope

- Add a main-process Git sync scheduler.
- Start/stop it when workspaces open/create and when Git Sync settings change.
- Run `backupNow()` at most once per configured interval.
- Do not auto-push in this task.
- Keep the scheduler from blocking app exit.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
