# Markdown divider shortcut real editor regression

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md` and
`tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

The editor smoke covers slash-menu divider insertion, but users can also type
Markdown directly. Direct `---` input should render a Notion-like divider in the
live editor after the user leaves the active source line, persist the Markdown
source, keep focus usable for the next block, and avoid layout overflow across
desktop and compact windows.

## Implementation

- Extended the shared editor regression smoke with a direct Markdown divider
  shortcut path.
- The smoke types `---`, presses Enter to leave the active source line, asserts
  the rendered divider widget is visible, then types following text.
- The smoke verifies autosaved Markdown contains `---` before the following
  paragraph and asserts editor focus plus no horizontal overflow in both
  desktop and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run smoke:editor-regression-ui`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `git diff --check`

## Backend tests

Not applicable: this item only adds UI regression coverage for existing
CodeMirror live-preview/autosave behavior and does not change backend, service,
or persistence code.
