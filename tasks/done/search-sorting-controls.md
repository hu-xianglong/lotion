# Search Sorting Controls By Relevance And Date

Status: done

## Why

Global search needs explicit, deterministic sorting controls. Users should be
able to keep the existing relevance ranking or sort results by updated/created
date without losing filters, keyboard navigation, or reliable result opening.

## Scope

- Add an explicit search sort mode to the search API and service contract.
- Keep relevance as the default sort.
- Support updated and created date sorting in both ascending and descending
  directions when metadata is available.
- Use stable tie-breaking so repeated searches do not reorder equal results.
- Add a keyboard-friendly sort control to the global search UI.
- Preserve type filters, loading/empty/error states, and result navigation.
- Cover desktop and compact/narrow layouts with no overlap or horizontal
  overflow.

## Gates

- `node --check scripts/smoke-search-ui.mjs`
- `npm run smoke:search-ui`
- `node --test test/search-service-sort.test.mjs`
- `npm run typecheck`
- `git diff --check`

## Result

- Added a `SearchQueryOptions.sort` API for relevance, updated date, and
  created date ordering with stable tie-breaking.
- Search results now carry created/updated metadata from entity and CSV
  records when available.
- Global search exposes a keyboard-focusable sort selector while preserving
  filters, loading state, and result navigation.
- Fixed a search input pending-state race where typing and deleting back to the
  same query could leave the panel stuck in loading.
- Added package-core/service coverage for relevance/date sorting semantics and
  invalid-sort fallback.
- Extended the search UI smoke across desktop and compact viewports to assert
  sort options, created ascending order, updated descending order, focus,
  no horizontal overflow, search latency, and jump-to-line navigation.

Verified:

- `node --check scripts/smoke-search-ui.mjs`
- `npm run typecheck`
- `node --test test/search-service-sort.test.mjs`
- `npm run smoke:search-ui`
- `git diff --check`
