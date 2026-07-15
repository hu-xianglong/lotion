# Notion Import Quote Block Colors

Status: done

## Why

The importer already preserved Notion `block-color-*` classes for inline text,
paragraphs, and headings, but quote blocks still dropped that class during
Turndown conversion. Imported pages with colored Notion quotes therefore lost a
visible styling cue.

## Changes

- Wrapped colored `<blockquote class="block-color-*">` content in the same safe
  `data-lotion-color` / `data-lotion-bg` spans used for paragraphs and headings.
- Added a Notion HTML converter regression for foreground and background quote
  colors.
- Updated the Notion import compatibility checklist.

## Gates

- `npm run typecheck`
- `npm run test:notion-html`
- `git diff --check`
