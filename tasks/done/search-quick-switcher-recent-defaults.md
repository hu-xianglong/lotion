# Search quick switcher recent defaults

Status: done

## Why

The command/search popup is the closest thing Lotion has to Notion's quick
switcher, but opening it with an empty query shows an empty result area. That
makes the surface feel incomplete for navigation-heavy use.

## Scope

- Show recent pages, databases, and row pages when the search query is empty.
- Keep typed searches and existing match-type filters unchanged.
- Route recent entries through the same open actions as sidebar recents.

## Gates

- `npm run typecheck`
- `git diff --check`

## Result

- The global search popup now shows recent pages, databases, and row pages when
  opened with an empty query.
- Recent entries reuse the same navigation actions as typed search results.
- Search filters remain scoped to typed queries, so existing match-type counts
  and ranking behavior are unchanged.
