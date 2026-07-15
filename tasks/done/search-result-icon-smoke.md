# Search Result Icon Smoke

## Goal

Ensure global search results render the page/database/row icon alongside the
title, so search does not regress back to title/type-only rows.

## Scope

- Extend the existing deterministic search-title fixture with an explicit emoji
  page icon assertion.
- Keep the focused smoke in `smoke:search-title-ui`; no new UI surface.

## Gates

- [x] `npm run smoke:search-title-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
