# Refresh Notion Block Color Pitfalls

Status: done

## Why

The importer now preserves Notion colors across inline spans, paragraphs,
headings, callouts, quotes, bullets, to-do items, and nested-list boundaries.
The pitfalls document still described callouts without their background metadata
and did not mention that `block-color-*` is often a block-level class.

## Changes

- Updated the callout pitfall to show the `background:` metadata line.
- Added a block-color pitfall covering paragraphs, headings, quotes, list items,
  to-do items, and nested list boundaries.

## Gates

- `git diff --check`
