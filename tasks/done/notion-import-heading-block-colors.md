# Notion Import Heading Block Colors

Status: done

## Problem

Notion can put `block-color-*` classes directly on heading blocks. After the
paragraph color fix, headings with the same classes still lose their color
during HTML import.

## Scope

- Preserve heading-level foreground/background color classes by wrapping heading
  contents in the existing safe Lotion color span representation.
- Keep the behavior converter-local; do not introduce a block-color schema.
- Add focused converter coverage and refresh compatibility docs if needed.

## Gates

- `npm run typecheck`
- `npm run test:notion-html`
- `git diff --check`
