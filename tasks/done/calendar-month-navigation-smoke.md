# Calendar Month Navigation Smoke

Status: done

## Why

Calendar rows now render from the selected date field, but the month navigation
controls should also be covered. A row in the current month should disappear
when moving to the next month and reappear after navigating back.

## Scope

- Reuse the database-template fixture's current-month `Due Date`.
- Click the calendar next-month button and verify the row is no longer visible.
- Click previous month and verify the row returns.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
