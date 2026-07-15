# Gallery Empty State Smoke

Status: done

## Why

Gallery views currently render a blank grid when filters produce no rows. List
views already show a clear empty state, and gallery should do the same instead
of leaving an ambiguous blank area.

## Scope

- Render a gallery empty state when `records.length === 0`.
- Add styling consistent with the list empty state.
- Extend the database-template UI smoke with a temporary filtered gallery view.

## Gates

- `npm run smoke:database-template-ui`
- `npm run typecheck`
- `git diff --check`
