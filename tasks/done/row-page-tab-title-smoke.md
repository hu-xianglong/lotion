# Row Page Tab Title Smoke

## Goal

Guard against row pages opening tabs labelled with raw row ids instead of the
row/page title.

## Scope

- Extend the row-page navigation smoke.
- After opening a row page from a database table, assert the active tab includes
  the row title and does not include the row id.

## Gates

- [x] `npm run smoke:row-page-navigation-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
