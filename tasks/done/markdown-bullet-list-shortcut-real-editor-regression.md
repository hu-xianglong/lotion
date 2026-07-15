# Markdown bullet list shortcut real editor regression

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md` and
`tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

Slash-menu list insertion is covered, but ordinary Notion-like writing also
depends on direct Markdown list input. Typing `- item` should render a bullet on
inactive lines, continue cleanly, autosave the Markdown source, keep the editor
focused, and avoid layout overflow across desktop and compact windows.

## Implementation

- Extended the shared editor regression smoke with a direct Markdown bullet
  list shortcut path.
- The smoke types `- item`, presses Enter to leave the active list line, asserts
  the inactive line shows the rendered bullet widget, then types the next list
  item.
- The smoke verifies autosaved Markdown contains the expected two bullet lines,
  exits the list without losing editor focus, and checks no horizontal overflow
  in desktop and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run smoke:editor-regression-ui`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `git diff --check`

## Backend tests

Not applicable: this item only adds UI regression coverage for existing
CodeMirror list continuation, live-preview decoration, and autosave behavior;
no backend, service, or persistence code changed.
