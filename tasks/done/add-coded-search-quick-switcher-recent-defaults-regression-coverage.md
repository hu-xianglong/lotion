# Add coded search quick-switcher recent defaults regression coverage

Status: done

## Goal

Add coded UI coverage for opening global search with an empty query and using
the Notion-like recent defaults list.

## Scope

- Extend a focused search UI smoke with isolated recent page, database, and row
  page entries.
- Assert empty-query recent rows render with visible badges, titles, subtitles,
  and icons before typing.
- Click recent entries and verify the search popup closes and navigation lands
  on the expected page/database surface.
- This is UI smoke coverage only; backend/search-service tests are not needed
  because the behavior uses manifest recents already passed to the renderer and
  does not call the search service for empty queries.

## Gates

- Passed: `npm run typecheck`
- Passed: `npm run smoke:search-title-ui`
- Passed: `git diff --check`
