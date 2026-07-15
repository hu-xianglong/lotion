# Notion Import Paragraph Block Colors

Status: done

## Problem

Notion paragraph-level `block-color-*` classes currently lose their color during
HTML import unless Notion also wraps the exact text in an inline span.

## Scope

- Preserve paragraph-level foreground/background colors by wrapping paragraph
  content in the existing safe Lotion color span representation.
- Add focused converter coverage.
- Refresh compatibility docs to describe the narrower remaining limitation.

## Gates

- `npm run typecheck`
- `npm run test:notion-html`
- `git diff --check`
