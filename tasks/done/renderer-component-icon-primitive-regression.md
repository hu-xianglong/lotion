# Renderer Component Icon Primitive Regression

Status: done

## Why

Field, view, and entity icons are small primitives but they sit everywhere:
sidebar, search results, database headers, property rows, and table cells. They
have regressed before, especially title-vs-text glyphs and imported page icons.

## Scope

- Add static renderer coverage for `FieldTypeIcon` title/text distinctions and
  common field kinds.
- Add static renderer coverage for `ViewTypeIcon` built-in views and custom
  provider icons.
- Add static renderer coverage for `EntityIcon` default, emoji, and workspace
  image icons.
- Keep this as renderer primitive coverage only; no data or persistence behavior
  should change.

## Gates

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

Extended `scripts/test-renderer-components.mjs` with static renderer coverage
for shared icon primitives:

- `FieldTypeIcon` title-vs-text distinction plus number, formula, id, select,
  multi-select, date, URL, checkbox, created time, and unknown fallback glyphs.
- `ViewTypeIcon` table, list, calendar, gallery, kanban, and custom provider
  icon rendering.
- `EntityIcon` default page/database/row/workspace fallbacks, emoji icons, and
  workspace-relative image icons through the `lotion-file:///` protocol.

Backend tests are not applicable: this is renderer primitive coverage only and
does not change data loading, persistence, or service behavior.

## Verification

- `node --check scripts/test-renderer-components.mjs` passed.
- `npm run test:renderer-components` passed after aligning assertions with the
  actual lucide class names.
- `npm run typecheck` passed.
