# List Row Icon And Open Smoke

Status: done

## Why

Gallery and calendar views have smoke coverage for row icons and row-page
navigation. List view renders the same row-page affordance but currently only
has view-switch coverage.

## Scope

- Verify a list row with an imported/custom row icon shows that icon.
- Verify a list row without a custom icon shows the default row-page icon.
- Verify clicking a list row opens the row page and then returns to the list
  view for the rest of the smoke.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
