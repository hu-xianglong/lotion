# Command Palette Toggle Current Page Small Text

Status: done

## Why

Notion exposes common page presentation settings through fast command surfaces.
Lotion supports the small-text page setting, but it is only reachable through
the page menu. The command palette should also offer this keyboard-first
workflow.

## Scope

- Add a built-in command palette command to toggle small text for the currently
  active page or row page.
- Reuse existing page/row-page small-text persistence paths.
- Cover the command in renderer component tests and the shared multi-resolution
  search-title UI smoke.

## Acceptance

- Searching command palette for "small text" shows a Lotion built-in command.
- Activating the command on a normal page toggles the page to small-text and
  persists via the existing page settings model.
- The command remains visible and usable at desktop and compact widths with no
  horizontal overflow.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Added a built-in `lotion.toggle-small-text` command surfaced as
  `切换当前页面小字号`.
- Reused the existing page and row-page small-text persistence paths.
- Extended renderer component coverage for the new command row/counts.
- Extended the multi-resolution search-title UI smoke to search for the command,
  activate it on a newly-created page, assert the small-text class, verify
  persisted page metadata, and check no horizontal overflow at desktop and
  compact widths.
