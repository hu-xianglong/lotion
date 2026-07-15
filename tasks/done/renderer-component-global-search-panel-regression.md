# Renderer Component Global Search Panel Regression

Status: done

## Why

Global search has coded Electron smokes, but the portal-rendered dialog content
is not covered by the static renderer component harness. Search regressions have
been frequent: missing recents, unclear result types, broken badges, and poor
empty/loading states.

## Scope

- Split global search dialog content from the portal shell without changing
  search query, command, recent, or navigation behavior.
- Add renderer component coverage for recent defaults, typed-result filters,
  type/count badges, command rows, search hits, paths/previews, load-more,
  empty state, and loading state.
- Keep this as renderer component coverage only; backend search service and
  Electron UI smoke behavior should remain unchanged.

## Gates

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

Split `GlobalSearchPanelContent` out of the portal-backed global search shell
without changing search query, command, recent, filter, or navigation behavior.

Extended `scripts/test-renderer-components.mjs` with static renderer coverage
for:

- Empty-query recent defaults with page, database, and row-page entries.
- Typed-query filter chips, counts, active state, truncation meta, command row,
  database hit, row hit, paths, highlighted snippets, and load-more affordance.
- Loading state that keeps filters visible without showing empty-result copy.
- Empty typed-query state with zero counts and explicit empty copy.

Backend tests are not applicable: this is renderer component coverage and a
presentation-layer extraction. The search service, recent persistence, command
registry, and navigation actions are unchanged.

## Verification

- `node --check scripts/test-renderer-components.mjs` passed.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
