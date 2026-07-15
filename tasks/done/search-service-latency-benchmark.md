# Search service latency benchmark

## Goal

Add a repeatable benchmark for workspace search latency so future search ranking,
entity indexing, and import model changes have a concrete performance gate.

## Scope

- Generate a synthetic workspace with system page/entity metadata, standalone
  pages, a user database, rows, row pages, relation references, and markdown
  links.
- Measure cold-cache first query and warm repeated queries through
  `SearchService.query`.
- Cover title, body, database/schema, field, broad, relation, and markdown-link
  search routes.
- Add package scripts for checked and exploratory benchmark runs.

## Result

- Added `scripts/bench-search-latency.mjs`.
- Added `npm run test:search-latency` and
  `npm run benchmark:search-latency`.
- Default checked fixture: 360 standalone pages, 1200 database rows, and
  150 row pages.
- Covered title, body, field, database, broad, relation, and markdown-link
  search routes.
- Checked thresholds: cold max <= 500ms, warm max median <= 300ms.

## Verified

- `npm run test:search-latency`
  - cold max: 152.478ms
  - warm max median: 114.535ms
- `git diff --check`
