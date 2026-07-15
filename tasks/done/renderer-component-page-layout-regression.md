# Renderer Component Page Layout Regression

Status: done

## Why

`PageLayout` owns the shared shell order for cover, page header, properties,
overlay, and body content. Most page alignment and spacing fixes eventually
flow through this boundary, so it should have a small static renderer
regression instead of being covered only indirectly through full page fixtures.

## Changes

- Added a static renderer fixture for `PageLayout`.
- Asserted default and full-width class behavior.
- Asserted cover, header, properties, overlay, and body render in the expected
  order.

## Tests

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

Backend tests are not applicable for this item because the change only adds
static renderer coverage for a layout component and does not touch data,
service, persistence, or IPC behavior.
