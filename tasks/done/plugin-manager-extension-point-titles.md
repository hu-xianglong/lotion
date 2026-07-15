# Plugin Manager Extension Point Titles

Status: done

## Why

The plugin manager's aggregate extension-point table shows kind, id, and source
but not the human-readable title. That makes command and settings registrations
harder to scan.

## Scope

- Add a `Title` column to the aggregate extension-point table.
- Extend the plugin-manager UI smoke to verify command titles are visible.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
