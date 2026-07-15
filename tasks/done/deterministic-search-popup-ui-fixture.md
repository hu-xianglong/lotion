# Deterministic Search Popup UI Fixture

## Goal

Make `smoke:search-ui` independent of the user's current large workspace so UI
suite runtime and backend search timing stay predictable.

## Scope

- Create a temporary workspace with enough markdown pages to produce 100+
  search hits.
- Open that workspace before measuring the search popup.
- Restore the previous workspace and forget/remove the temp workspace afterward.

## Gates

- [x] `npm run smoke:search-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
