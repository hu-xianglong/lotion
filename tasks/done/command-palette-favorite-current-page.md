# Command Palette Favorite Current Page

Status: done

Split from `tasks/todo/notion-core-parity-sequence.md` command palette
workflows.

## Goal

Make the global search / command palette useful for a common Notion-like page
action: toggling the current page or row page in Favorites without moving to the
page chrome.

## Acceptance

- Global search includes a built-in command for toggling the current page or row
  page favorite state.
- The command is discoverable by an English query such as `favorite` and keeps
  the existing command result badge/source/id preview.
- Running the command closes search and updates the sidebar Favorites section
  immediately.
- The focused UI smoke covers desktop and compact viewports with no dialog
  overflow.

## Tests

- Extend the search title shared-harness UI smoke to execute the command and
  assert Favorites updates.
- Extend renderer command-search coverage so the built-in command remains
  visible in command result rendering.
- No backend/service test should be needed unless the favorite persistence API
  changes; this task uses the existing favorite toggle API.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Added a built-in command palette action `lotion.toggle-favorite` labelled
  `收藏/取消收藏当前页面`.
- Exposed the existing current-page/row-page favorite toggle through
  `LotionActions` so command execution reuses the existing persistence path.
- Extended search title UI smoke coverage so desktop and compact viewports
  discover the command with `favorite`, execute it, and assert the sidebar
  Favorites section updates immediately.
- Extended renderer command result coverage for the new built-in command row.
- No backend/service test was added because this task only wires an existing
  favorite API into the renderer command palette.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs` - passed.
- `npm run test:renderer-components` - passed.
- `npm run typecheck` - passed.
- `npm run smoke:search-title-ui` - passed for desktop and compact viewports.
- `git diff --check` - passed.
