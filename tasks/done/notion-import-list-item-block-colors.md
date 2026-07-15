# Notion Import List Item Block Colors

Status: done

## Why

Notion can attach `block-color-*` classes directly to list and to-do items.
Before this change those colors were dropped during HTML-to-Markdown conversion,
so imported colored bullets/tasks lost styling even though paragraphs, headings,
quotes, and inline spans already kept it.

## Changes

- Wrapped colored list item body content in the same safe `data-lotion-color` /
  `data-lotion-bg` spans used elsewhere.
- Kept the GFM checkbox input outside the color span so task list markers still
  render as `- [x]`.
- Added converter regressions for colored bullet and to-do items.
- Extended the markdown preview smoke to assert colored list item rendering does
  not leak raw `data-lotion-*` markup.
- Updated the Notion import compatibility checklist.

## Gates

- `npm run typecheck`
- `npm run test:notion-html`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`
