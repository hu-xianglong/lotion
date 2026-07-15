# Git Sync Scheduler Automation Regression

Status: done

## Why

The Git Sync plugin UI and service surface are covered, but the scheduler path
that runs automatic backups and pushes had very little direct coverage. This is
the code path that prevents backup spam, pauses when the remote is ahead, and
keeps automated sync from overlapping itself.

## Changes

- Added an injectable timer boundary to `GitSyncScheduler` while preserving the
  production default of real `setInterval` / `clearInterval`.
- Added deterministic package-core coverage for backup and push cadence
  registration.
- Covered `after_backup` auto-push behavior.
- Covered remote-ahead auto-push pause behavior.
- Covered concurrent timer ticks so backup and push work do not overlap.

## Verification

- `npm exec -- tsc -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `npm run typecheck`
- `git diff --check`
