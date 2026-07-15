# List Empty State Smoke

Status: done

## Why

Gallery view has explicit empty-state smoke coverage. List view already renders
`No rows`, but it lacks an equivalent regression path, so an empty filtered list
could regress into a blank surface.

## Scope

- Extend the database-template UI smoke with a temporary filtered list view that
  has zero records.
- Verify the list empty state renders `No rows`.
- Remove the temporary view after the assertion.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
