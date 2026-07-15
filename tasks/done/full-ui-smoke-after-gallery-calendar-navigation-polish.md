# Full UI Smoke After Gallery Calendar Navigation Polish

Status: done

## Why

Queue items 130-135 extended gallery/calendar formatting, icons, and navigation
smoke coverage. Run the full UI suite once more to catch any cross-script
regression before moving to a different surface.

## Scope

- Run the full UI smoke suite against the local dev app.
- Keep this as a verification-only task unless the suite exposes an in-scope
  regression.

## Gates

- `npm run smoke:ui`
- `git diff --check`
