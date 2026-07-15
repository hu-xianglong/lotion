# Calendar Today Cell Highlight

Status: done

## Why

The calendar has a `今天` button, but the current day itself is not marked in
the month grid. Notion users expect the current date to be visually
distinguishable.

## Scope

- Mark the current day cell with a stable class and `aria-current="date"`.
- Add a restrained visual highlight for the day number.
- Extend the database-template UI smoke to assert the current day cell exists.

## Gates

- `npm run smoke:database-template-ui`
- `npm run typecheck`
- `git diff --check`
