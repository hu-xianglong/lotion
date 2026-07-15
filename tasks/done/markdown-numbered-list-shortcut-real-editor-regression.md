# Markdown numbered list shortcut real editor regression

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md` and
`tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

Bullet list direct input now has coverage, but ordered lists are a separate
daily writing path. Typing `1. item` should continue as a numbered list,
autosave the Markdown source, keep the editor focused, and avoid layout
overflow across desktop and compact windows.

## Implementation

- Extended the shared editor regression smoke with a direct Markdown numbered
  list shortcut path.
- The smoke types `1. item`, presses Enter, verifies the first list line remains
  visible, then types the continuation item.
- The smoke verifies autosaved Markdown contains `1. item` followed by
  `2. continuation`, exits the list without losing editor focus, and checks no
  horizontal overflow in desktop and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run smoke:editor-regression-ui`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `git diff --check`

## Backend tests

Not applicable: this item only adds UI regression coverage for existing
CodeMirror ordered-list continuation, autosave, and layout behavior; no backend,
service, or persistence code changed.
