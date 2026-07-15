# Notion HTML ordered list start paste real editor regression

Status: done

## Why

Notion and browser HTML can copy ordered lists with a non-1 start value via
`<ol start="3">`. Lotion's rich paste path should preserve that visible
numbering context instead of rewriting the list to start at `1.`.

This continues the focused Notion HTML paste regression sequence from the
editor parity backlog.

## Acceptance

- Pasting HTML that contains `<ol start="3">` stores Markdown ordered list
  items starting at `3.` and continuing to `4.`.
- The rendered editor continues to style the pasted ordered list as list items.
- Continued typing after the pasted list lands below it and persists.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.
- Lower-level/backend tests are not required if this only touches renderer
  clipboard conversion and UI smoke coverage; no backend/service behavior
  changes.

## Result

- HTML clipboard conversion now preserves positive `<ol start="N">` values
  when producing Markdown ordered list markers.
- The editor regression smoke now pastes a real HTML ordered list starting at
  `3`, verifies persisted Markdown includes `3.` and `4.`, checks the list
  content renders in the editor, continues typing below the list, and asserts
  focus/no horizontal overflow in desktop and compact viewports.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T20-09-31-720Z`
- [x] `git diff --check`
