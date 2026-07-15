# Renderer Component Database Alternate Views Regression

Status: done

## Goal

Add focused renderer component coverage for database non-table body views so
list, gallery, and calendar view regressions are caught before they reach
manual UI testing.

## Scope

- Cover `ListBody` title fallback, row icon rendering, visible property
  rendering, date formatting, checkbox formatting, and hidden/title field
  exclusion.
- Cover `GalleryBody` cards, row covers, placeholder covers, captions, row
  icons, and empty-state rendering.
- Cover `CalendarBody` toolbar, weekday grid, current-month row chips, date
  field selection, row icons, and navigation controls.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

Extended `scripts/test-renderer-components.mjs` with static renderer coverage
for `ListBody`, `GalleryBody`, and `CalendarBody`.

The list coverage asserts title fallback, row icons, visible property rendering,
date display formatting, boolean display text, and hidden/title field exclusion.
The gallery coverage asserts cards, row covers, cover offsets, placeholder
covers, captions, row icons, and empty-state rendering. The calendar coverage
asserts toolbar controls, weekday headings, current-month row chips, row icons,
and omission of rows outside the current month.

Backend tests are not applicable for this slice because it only adds renderer
component coverage and does not change view query, persistence, or service
behavior.

Verification:

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
