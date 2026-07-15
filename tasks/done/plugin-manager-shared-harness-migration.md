# Plugin Manager Shared Harness Migration

Status: done

## Scope

Move the plugin manager smoke onto the shared Electron UI harness so plugin
surface coverage gets the same deterministic workspace setup, cleanup, failure
artifacts, and multi-resolution checks as the newer search/editor/LLM suites.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Run the plugin manager workflow in both desktop and compact viewports.
- Preserve coverage for plugin listing, permission summaries, extension point
  source drilldown, provider source drilldown, detail/settings pages, command
  search activation, and notification toasts.
- Assert no horizontal overflow and that core plugin manager/detail surfaces
  stay within the viewport where applicable.
- This is UI harness/test coverage only; backend/plugin behavior should remain
  unchanged.

## Gates

- `node --check scripts/smoke-plugin-manager-ui.mjs`
- `npm run typecheck`
- `npm run smoke:plugin-manager-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-plugin-manager-ui.mjs` to `withLotionUIHarness`.
- Preserved the existing plugin manager workflow coverage for loaded plugin
  rows, permission summaries, extension point/source drilldown, provider source
  drilldown, plugin detail/settings pages, command search activation, and
  notification toasts.
- Added desktop and compact viewport execution through the shared harness plus
  no-horizontal-overflow and viewport assertions for the plugin manager,
  plugin detail, and command search surfaces.
- This change only updates UI smoke harness coverage; backend/plugin runtime
  behavior was unchanged, so no additional backend tests were applicable.
