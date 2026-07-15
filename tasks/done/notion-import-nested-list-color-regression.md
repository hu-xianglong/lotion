# Notion Import Nested List Color Regression

Status: done

## Why

The list item color importer wraps only the colored item's body content. Nested
child lists must remain outside that span so Markdown keeps the right hierarchy
and child items can carry their own formatting.

## Changes

- Added a Notion HTML converter regression for a colored parent bullet with a
  nested child bullet.
- Locked the expected Markdown shape:
  `- <span data-lotion-bg="...">Parent</span>` followed by an indented child
  list, rather than a span that wraps the whole nested list.

## Gates

- `npm run test:notion-html`
- `git diff --check`
