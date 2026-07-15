# Plugin Commands In Global Search

Status: done

## Why

The global search popup is already the closest surface to a Notion-style command
palette, but plugin commands are only visible in the plugin manager. Built-in
dogfood commands should be discoverable and runnable from the same popup.

## Scope

- Include renderer plugin commands in the global search popup when the query
  matches command title, category, or id.
- Render command results distinctly from page/database hits.
- Run the command from click or Enter and surface command failures through the
  notification toast.
- Extend the plugin-manager smoke to verify `Open Notion Import` can be found
  and run through global search.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
