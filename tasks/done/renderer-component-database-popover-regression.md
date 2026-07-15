# Renderer Component Database Popover Regression

Status: done

## Why

Database filter and sort popovers are high-risk configuration UI. They render
through React portals, so the static renderer component harness has not covered
their visible dialog content yet.

## Scope

- Split filter/sort popover content into testable renderer components while
  keeping portal wrapper behavior unchanged.
- Add renderer component coverage for filter rows, operator/value controls,
  empty states, remove buttons, add affordances, disabled add-sort state, and
  anchored positioning styles.
- Keep this as renderer component coverage only; no query, persistence, or
  database-service behavior should change.

## Gates

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

Split the portal-backed filter and sort popovers into reusable content
components while leaving the public portal wrappers unchanged.

Extended `scripts/test-renderer-components.mjs` with static renderer coverage
for:

- Filter dialog semantics, anchored/clamped positioning, header, field choices,
  text/number/checkbox filter value rendering, remove actions, add action, and
  empty state.
- Sort dialog semantics, anchored/clamped positioning, header, field choices,
  direction choices, remove actions, add action, empty state, and disabled
  add-sort state when all fields are already sorted.

Backend tests are not applicable: this is renderer component coverage and a
presentation-layer refactor of existing popover content. Query evaluation,
view persistence, and database services are unchanged.

## Verification

- `node --check scripts/test-renderer-components.mjs` passed.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
