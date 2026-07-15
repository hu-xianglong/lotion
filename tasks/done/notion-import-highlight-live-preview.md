# Notion Import Highlight Live Preview

## Goal

Preserve Notion highlighted text as visible highlighted text in imported page
bodies instead of degrading it to plain text.

## Scope

- Convert Notion `<mark>` and `highlight-*` inline spans to stable
  `<mark>...</mark>` HTML in markdown output.
- Render inactive CodeMirror live-preview `<mark>...</mark>` spans as a
  highlighted inline background while leaving raw tags editable on the active
  line.
- Add converter and markdown preview smoke coverage.
- Refresh the Notion import compatibility checklist.

## Gates

- [x] `npm run typecheck`
- [x] `npm run test:notion-html`
- [x] `npm run smoke:markdown-preview-ui`
- [x] `git diff --check`
