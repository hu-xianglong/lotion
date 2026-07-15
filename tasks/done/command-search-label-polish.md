# Command Search Label Polish

Status: done

## Why

The plugin command search smoke shows command results rendering two adjacent
`命令` badges. That is redundant and makes the result label noisy.

## Scope

- Keep a single command kind badge for command search results.
- Preserve the command icon, title, category, source plugin, and id preview.
- Re-run the plugin-manager smoke path that exercises command search.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
