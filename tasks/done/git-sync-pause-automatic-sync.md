# Git Sync Pause Automatic Sync

Status: done

## Why

The Git Sync product task calls for a pause automatic sync action. This should
stop automatic backup and automatic push without disabling manual Git actions.

## Scope

- Add a machine-local `automationPaused` Git Sync setting.
- Persist and normalize the setting.
- Skip scheduler timers while automation is paused.
- Add a UI control and status display for the setting.
- Cover normalization in package-core tests.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke verifies the pause control renders.
