# Command Palette Toggle Embed Source Visibility

Status: done

## Why

Embed/source visibility is a user-facing reading and debugging mode, but it was
only reachable from the sidebar settings panel. The command palette now exposes
this setting the same way it exposes raw Markdown mode, so users can quickly
switch between clean rendered embeds and source inspection.

## Result

- Added the built-in `lotion.toggle-embed-source` command with the title
  `切换嵌入源码显示`.
- Wired the command through app actions to the existing `showEmbedSource`
  setting.
- Updated renderer/component search coverage for the command title, source, and
  command id.
- Extended the multi-resolution search title UI smoke to execute the command,
  verify the search closes, assert the visible sidebar toggle and localStorage
  state change, and check desktop/compact layout overflow.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`
