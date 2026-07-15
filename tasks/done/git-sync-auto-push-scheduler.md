# Git Sync Auto Push Scheduler

Status: done

## Why

The Git Sync settings already expose an auto push cadence, but only manual push
is implemented. Automatic push needs the same safety policy as the product task:
fetch first, refuse to run when the remote is ahead, and surface the error in
Git Sync settings.

## Scope

- Add a GitService auto-push entry point.
- Fetch and inspect ahead/behind before automatic push.
- Refuse automatic push with uncommitted local changes.
- Trigger auto push after automatic backup when cadence is `after_backup`.
- Trigger auto push on hourly/daily timers.
- Pause repeated automatic push attempts after a remote-ahead conflict until
  settings refresh.
- Add package-core coverage for delay mapping and remote-ahead refusal.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke verifies the auto push cadence control still renders.
