# Renderer Component Management Databases View Regression

Status: done

## Why

`ManagementView` now has static renderer coverage for all-pages and recent
views, but the database-management branch is still uncovered in the lightweight
component gate. That branch is a high-value imported-workspace surface because
it shows database paths, manual cached-stat refresh controls, summary metrics,
last-opened activity, and ids.

## Scope

- Add static renderer coverage for `ManagementView` with `kind="databases"`.
- Assert the database-management title, count, cached-stat hint, refresh action,
  summary metric labels, sortable table headers, database titles, icons, nested
  path label, last-opened activity, open counts, loading stat placeholders, and
  ids.
- Keep this as renderer presentation coverage only; do not change database
  stats loading, activity tracking, or persistence behavior.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added a static management-databases renderer fixture with two databases,
  including a nested path and recent activity.
- Asserted the database-management title, count, cached-stat hint, refresh
  action, summary metric labels, sortable headers, database titles/icons/paths,
  last-opened and never-opened states, open counts, loading stat placeholders,
  and id column.
- Backend/service tests are not applicable because this only extends renderer
  presentation coverage; database stats loading, activity tracking, and
  persistence behavior were not changed.
