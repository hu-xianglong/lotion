# Markdown code fence shortcut real editor regression

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md` and
`tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

Slash code block insertion is covered, but direct Markdown writing is a normal
Notion-like editing path. Typing a fenced code block should style the fence and
code lines, keep the editor usable after the closing fence, autosave the exact
Markdown source, and avoid layout overflow across desktop and compact windows.

## Implementation

- Extended the shared editor regression smoke with a direct Markdown code fence
  path.
- The smoke types a fenced JavaScript block directly in the real editor.
- The smoke asserts fence/code line styling is visible, continued typing lands
  after the closing fence, markdown persists exactly, editor focus remains
  usable, and desktop plus compact layouts do not overflow.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run smoke:editor-regression-ui`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `git diff --check`

## Backend tests

Not applicable: this item only adds UI regression coverage for existing
CodeMirror direct Markdown fence styling, autosave, and layout behavior; no
backend, service, or persistence code changed.
