# Calendar Today Button Smoke

Status: done

## Why

The calendar view exposes a `今天` button, but only month stepping is currently
covered. The button should return to the current month and show rows whose date
field lands in the current month.

## Scope

- Reuse the database-template fixture's current-month `Due Date`.
- Move one month away from today.
- Click `今天` and verify the month label and current-month row return.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
