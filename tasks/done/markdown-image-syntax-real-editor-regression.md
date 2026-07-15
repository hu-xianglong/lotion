# Markdown image syntax real editor regression

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md` and
`tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

Slash image insertion is covered, but direct Markdown image syntax is a common
local-first writing path. Typing `![alt](attachments/images/file.svg)` should
render a picture widget instead of leaving source code in the document, preserve
the exact Markdown, allow continued typing below the image, and avoid layout
overflow in desktop and compact windows.

## Implementation

- Extended the shared editor regression smoke with a direct standalone Markdown
  image path.
- Added a real SVG attachment to the isolated editor smoke fixture so the image
  preview has a stable local source.
- The smoke verifies the rendered image widget alt/src, hidden source state
  after leaving the image line, continued typing below the image, autosaved
  Markdown, editor focus, and no horizontal overflow in desktop plus compact
  viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run smoke:editor-regression-ui`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `git diff --check`

## Backend tests

Not applicable: this item only adds UI regression coverage for existing
CodeMirror Markdown image rendering, source hiding, autosave, and layout
behavior; no backend, service, or persistence code changed.
