# Full UI Smoke After Command And List Polish

Status: done

## Why

Recent queue items touched global search command behavior and added deeper list
view smoke paths. Run the full UI smoke suite once to catch cross-surface
regressions before continuing.

## Scope

- Run `npm run smoke:ui`.
- Keep this as a verification-only task unless the suite exposes a scoped bug.

## Gates

- `npm run smoke:ui`
- `git diff --check`
