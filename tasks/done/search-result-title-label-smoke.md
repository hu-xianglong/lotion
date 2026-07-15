# Search Result Title Label Smoke

## Goal

Guard against search results displaying raw ids/UUIDs instead of page titles.

## Scope

- Create a temporary workspace with a UUID-looking page id.
- Give the page a meaningful title: `[完成] exampleSearchPage`.
- Search for `exampleSearchPage` in the global search popup.
- Assert the visible result title is the page title, not the raw id, and that a
  kind badge is present.

## Gates

- [x] `npm run smoke:search-title-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
