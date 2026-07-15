# Git Sync Minute Cadence Options

Status: done

## Why

Auto backup currently supports only hourly/daily even though the Git Sync
requirements call for minute-based intervals.

## Scope

- Add `15 minutes` and `30 minutes` auto backup cadence values.
- Persist and normalize the new values.
- Wire scheduler delay calculation.
- Add the options to the Git Sync settings UI.
- Cover the delay mapping in package-core tests.

## Gates

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- UI smoke verifies the options render.
