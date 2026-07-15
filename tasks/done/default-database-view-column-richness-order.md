# Default Database View Column Richness Order

## Problem

Default database views should put columns with more useful content earlier.
The Notion importer already sorted imported views by average cell length, but
database-service generated fallback/default views still used schema order.

## Scope

- Share the content-richness column ordering helper.
- Apply it to database-service generated default/fallback views without
  overriding explicit user view order.
- Keep source audit URL fields such as original Notion HTML/CSV at the end.
- Add a focused UI regression that verifies rendered default columns follow the
  richness order when no view file exists.

## Gates

- `npm run typecheck`
- `node --test test/package-core.test.mjs`
- `node scripts/test-notion-import-service.mjs`
- `npm run smoke:embedded-view-ui -- --counts=1 --rows-per-database=120`
- `git diff --check`

## Result

- Added a shared content-richness field ordering helper.
- New database default views and missing-view fallback views now order visible
  user fields by average trimmed cell length.
- Existing explicit view order is preserved; only missing fields are appended
  using the same richness rule.
- Original Notion HTML/CSV source URL fields remain pinned after normal content
  fields so audit links do not dominate the default view.
- Embedded-view UI smoke now verifies fallback default column order in the
  rendered table.
