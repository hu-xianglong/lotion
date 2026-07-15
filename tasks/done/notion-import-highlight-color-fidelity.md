# Notion Import Highlight Color Fidelity

Status: done

## Problem

Notion highlighted text imports as a generic `<mark>`, so the page keeps a
highlight affordance but loses the specific color Notion exported.

## Scope

- Convert Notion `highlight-*` classes with known colors into the existing safe
  Lotion `data-lotion-bg` span representation.
- Keep generic `<mark>` as a fallback when no supported color is present.
- Add focused converter coverage and update compatibility docs.

## Gates

- `npm run typecheck`
- `npm run test:notion-html`
- `git diff --check`
