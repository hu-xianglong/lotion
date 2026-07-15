# Plugin Manager Permission Summary

Status: done

## Why

The plugin list shows status and version but hides the requested permission
surface until the user opens a plugin detail page. For built-in dogfood plugins,
the aggregate table should make capabilities auditable at a glance.

## Scope

- Add a `Permissions` column to the loaded plugin table.
- Render manifest permissions as compact readable chips, with `None` for empty
  permission lists.
- Extend the plugin-manager UI smoke to verify permission summaries for the
  Notion Import and Git Sync plugins.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
