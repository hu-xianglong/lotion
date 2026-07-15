# Renderer Component Database Table Grid Regression

Status: done

## Goal

Add focused renderer component coverage for the low-level database table grid
structure that powers both embedded and standalone table views.

## Scope

- Cover embedded `DatabaseTableGrid` sticky header rendering, scroll container,
  virtual top/bottom spacers, row numbers, rendered cells, row actions, and
  add-row affordance.
- Cover standalone `DatabaseTableGrid` header placement and absence of embedded
  sticky header.
- Assert hidden embedded rows suppress the add-row affordance.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

Extended `scripts/test-renderer-components.mjs` with static renderer coverage
for `DatabaseTableGrid`.

The new assertions cover embedded sticky header rendering, scroll container
structure, sticky-header horizontal offset, virtual top/bottom spacers, row ids,
row numbers with a non-zero start index, rendered cell content, row action cells,
standalone header placement, add-row affordance rendering, and suppression of
add-row when embedded rows are hidden.

Backend tests are not applicable for this slice because it only adds renderer
component coverage and does not change query, pagination, edit, or persistence
behavior.

Verification:

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
