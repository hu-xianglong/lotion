# Plugin Manager Source Drilldown

Status: done

## Why

The plugin manager listed provider and extension-point source plugins, but those
source labels were inert text. Making them clickable gives users a direct way to
move from an extension registration to the plugin that owns it.

## What Changed

- Rendered source plugin labels as buttons when the source plugin is known.
- Opened the selected plugin detail page from provider and extension-point
  tables.
- Added plugin manager UI smoke coverage for extension-point source drilldown.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
