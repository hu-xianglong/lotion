# Search Result Filter Smoke

## Goal

Guard the search popup's match-type filters: title, content/field, reference,
and database.

## Scope

- Extend `smoke:search-title-ui`.
- Assert the filter buttons are present.
- Click the database filter for a page-only query and verify results become
  empty.
- Click the title filter and verify the page title result returns.

## Gates

- [x] `npm run smoke:search-title-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
