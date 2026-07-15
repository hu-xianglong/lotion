# Slash Menu Keyboard Dismissal And Selection Regression

Status: done

Split from `tasks/todo/notion-core-parity-sequence.md` slash/live-preview
editing coverage.

## Why

The slash menu is part of the main Notion-like writing loop. Existing coverage
checks individual slash commands, but not the keyboard affordances that make the
menu usable without the mouse. Escape should dismiss the menu without changing
editable text, and Arrow/Enter should select the intended command across
desktop and compact viewports.

## Acceptance Criteria

- Opening the slash menu from the real editor and pressing Escape closes it,
  keeps editor focus, and leaves the slash query editable.
- Reopening the slash menu, using ArrowDown and Enter selects the next command
  rather than the default command.
- The selected command removes the slash query, inserts the expected markdown,
  remains editable, persists, and does not introduce horizontal overflow.
- The regression is covered by coded multi-resolution UI smoke. Renderer
  component coverage is run because the menu rendering/active state surface is
  relevant, even if no product code changes are needed.

## Changes

- Extended the multi-resolution editor regression smoke with a real keyboard
  slash-menu path.
- The smoke now opens `/h`, verifies Heading 1 is active by default, presses
  Escape, checks the menu closes while `/h` remains editable, then cleans up the
  query.
- The smoke reopens `/h`, presses ArrowDown and Enter, verifies Heading 2 is
  selected, types heading text, checks it persists as `## ...`, and asserts no
  horizontal overflow.

## Backend Tests

No backend/service tests were needed because this item only added UI regression
coverage for existing renderer keyboard behavior. Static renderer component
coverage still runs for the slash menu active-state rendering surface.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
