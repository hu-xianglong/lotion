# Normalize Existing Default View Column Richness Order

## Problem

Default database columns should be ordered by content richness, but item 270
only covered newly created views and missing-view fallbacks. Existing default
view files that still store schema order continued to render in that old order,
which made the feature look absent in real workspaces.

## Scope

- Treat an existing default table view as auto-generated when its field order
  is empty or matches schema/default visible order.
- Recompute that auto-generated order by content richness when reading the
  database bundle.
- Preserve explicit user-customized field order.
- Add regression coverage for the existing-view-file path.

## Gates

- `npm run typecheck`
- `node --test test/package-core.test.mjs`
- `npm run smoke:embedded-view-ui -- --counts=1 --rows-per-database=120`
- `git diff --check`

## Result

- Existing default table views whose stored order is still schema/default order
  now normalize to the same content-richness order as newly created and fallback
  default views.
- User-customized field order is preserved when it differs from the automatic
  default order.
- Package-core coverage now simulates an old stored default view file and a
  custom view order.
- Embedded view UI smoke verified the rendered default order as `Name`,
  `Notes`, `Score`.
