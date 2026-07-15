# Command Palette Opens Advanced Search Plugin

Status: done

## Why

Advanced Search is available as a built-in plugin and has its own sidebar UI
smoke, but the command palette path is another important integration boundary:
global search should discover plugin commands and open the plugin modal cleanly.

## Result

- Added renderer/component search coverage for the Advanced Search plugin
  command title, source name, category, and command id.
- Extended the multi-resolution search title UI smoke to open the command
  palette, find `Open Advanced Search`, activate it, verify search closes, and
  assert the Advanced Search modal exposes status, rebuild action, query input,
  and results container.
- Checked modal viewport fit and horizontal overflow for desktop and compact
  viewports.
- No backend/service tests were needed because this task only added UI
  regression coverage for an existing plugin command path.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`
