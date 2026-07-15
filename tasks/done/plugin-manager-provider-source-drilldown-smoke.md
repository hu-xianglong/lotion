# Plugin Manager Provider Source Drilldown Smoke

Status: done

## Why

Queue item 157 made both provider and extension-point source labels clickable,
but the smoke test only exercised extension-point source drilldown. Provider
source drilldown should also be covered.

## What Changed

- Extended the plugin manager smoke test to click a provider source label.
- Verified it opens the owning plugin detail page and returns to the plugin
  manager.

## Gates

- `npm run smoke:plugin-manager-ui`
- `git diff --check`
