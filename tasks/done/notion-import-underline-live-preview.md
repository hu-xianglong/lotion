# Notion Import Underline Live Preview

## Goal

Preserve Notion underline formatting during HTML import and render it naturally
in the CodeMirror live-preview surface.

## Scope

- Convert Notion underline HTML (`<u>`, `<ins>`, and underline text-decoration)
  to stable inline `<u>...</u>` markdown/HTML.
- Render inactive live-preview `<u>...</u>` spans as underlined text while
  keeping the raw tags visible when editing the line.
- Add converter and markdown preview smoke coverage.
- Refresh the Notion import compatibility checklist.

## Gates

- [x] `npm run typecheck`
- [x] `npm run test:notion-html`
- [x] `npm run smoke:markdown-preview-ui`
- [x] `git diff --check`
