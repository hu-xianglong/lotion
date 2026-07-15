# Full UI Smoke After Gallery Calendar Polish

Status: done

## Why

The recent queue items touched gallery, calendar, view settings, and the shared
database-template smoke fixture. Run the full UI smoke suite once to catch
cross-script regressions outside the focused database-template path.

## Scope

- Run the full UI smoke suite against the local dev app.
- Keep this as a verification-only task unless the suite exposes an in-scope
  regression.

## Gates

- `npm run smoke:ui`
- `git diff --check`
