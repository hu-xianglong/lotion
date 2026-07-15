# Calendar Overflow Inline Expand

Status: done

## Why

Calendar cells currently show `+N` for hidden same-day rows, but users cannot
inspect those rows without changing views. A lightweight inline expansion keeps
the interaction local and avoids a heavier popover surface.

## Scope

- Turn the overflow marker into a button.
- Expand a day cell to show all rows, then allow collapsing it again.
- Extend the database-template UI smoke to verify the expansion.

## Gates

- `npm run smoke:database-template-ui`
- `npm run typecheck`
- `git diff --check`
