# Calendar Overflow Row Count Smoke

Status: done

## Why

Calendar cells intentionally show up to three row chips and collapse the rest
behind a `+N` indicator. That behavior is easy to regress when changing view
rendering or record filtering.

## Scope

- Add deterministic same-day fixture rows that do not affect sort/filter/summary
  assertions.
- Assert that the calendar cell renders exactly three visible row chips plus a
  `+1` overflow marker.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
