# Renderer Component Database Chrome Regression

Status: done

## Goal

Add focused renderer component coverage for database chrome surfaces that users
interact with before reaching table rows: standalone database headers, embedded
database headers, view tabs, and database tag properties.

## Scope

- Cover `StandaloneDatabaseHeader` with icon, cover affordance, title, subtitle,
  and open-in-new-window affordance.
- Cover `EmbeddedDatabaseHeader` with title/subtitle, open action, refresh
  state, settings affordance, and view actions slot.
- Cover `DatabaseViewTabsBar` with active tab state, provider icon rendering,
  add-view affordance, and embedded/non-embedded action visibility.
- Cover `DatabaseProperties` tag input rendering.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

Extended `scripts/test-renderer-components.mjs` with `DatabaseChrome` SSR
coverage for standalone headers, embedded headers, view tabs, and database tag
properties. The regression assertions cover visible titles/path/counts, icon and
cover affordances, open/refresh/settings controls, active tab state, plugin view
icons, new-view affordance, action slots, and tag input rendering.

Backend tests are not applicable for this slice because it only adds renderer
component coverage and does not change persistence, data loading, or service
behavior.

Verification:

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
