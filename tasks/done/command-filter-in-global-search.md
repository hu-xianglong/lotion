# Command Filter In Global Search

Status: done

## Why

Plugin commands are now searchable, but they only appear inside the `全部`
result stream. Since global search already supports type filters for title,
content, references, and databases, commands should have an explicit filter.

## Scope

- Add a `命令` filter to the global search popup.
- Show command result counts in `全部` and `命令`.
- Hide page/database hits when the command filter is active.
- Extend the plugin-manager smoke to verify command filtering.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
