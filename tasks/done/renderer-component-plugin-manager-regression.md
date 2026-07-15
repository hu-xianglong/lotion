# Renderer Component Plugin Manager Regression

Status: done

## Why

The plugin management page is a core plugin-system surface: users need to see
loaded plugins, permissions, providers, and registered extension points. The
shared UI smoke covers the broader flow, but the fast renderer component gate
does not yet pin this static structure.

## Scope

- Add static renderer coverage for `ManagementView` with `kind: "plugins"`.
- Register an isolated fake plugin in the renderer component test.
- Assert the plugin summary, loaded plugin row, permissions, provider section,
  and extension point rows render.
- Dispose the fake plugin registration after rendering so the global plugin host
  stays clean for the rest of the component gate.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added static renderer coverage for `ManagementView` in plugin-management
  mode.
- Registered an isolated fake plugin with one field provider, one view
  provider, and command/sidebar/page-action/settings extension points.
- Asserted the plugin manager shell, summary tiles, loaded plugin row,
  permissions, provider rows, source plugin links, statuses, and extension
  point rows render.
- Backend/service tests are not applicable because this only extends renderer
  presentation coverage; plugin host registration, provider lookup, and data API
  behavior were not changed.
