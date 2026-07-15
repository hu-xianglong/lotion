# Renderer Component Slash Menu Regression

Status: done

## Why

The slash command menu is central to Notion-like text editing. It renders
through a portal and uses window-level keyboard handling, so its visible menu
content is not covered by the static renderer component harness.

## Scope

- Split slash menu content from the portal/window shell without changing
  filtering, keyboard handling, or command picking behavior.
- Add renderer component coverage for grouped commands, active item styling,
  labels, hints, icons, and empty state.
- Keep this as renderer component coverage only; slash command filtering and
  editor integration behavior should remain unchanged.

## Gates

- `node --check scripts/test-renderer-components.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Split `SlashMenuContent` from the portal/window event shell so the visible
  slash menu can be rendered in the static component harness.
- Added renderer regression assertions for grouped commands, active command
  styling, command labels, group metadata, hints, icons, and the empty state.
- Backend/service tests are not applicable because this only changes renderer
  presentation factoring and renderer component coverage; filtering and editor
  command integration behavior were left unchanged.
