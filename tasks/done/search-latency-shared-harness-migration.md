# Search latency shared harness migration

## Goal

Move the global search latency and jump-to-line smoke onto the shared UI harness
so search typing, rendering, and navigation are tested with deterministic
workspace lifecycle, failure artifacts, and multiple viewport sizes.

## Acceptance

- `scripts/smoke-search-ui.mjs` uses `withLotionUIHarness` instead of
  hand-rolled CDP connection, workspace restore, and temp cleanup.
- The smoke runs against desktop and compact viewport presets with isolated
  fixture workspaces.
- Each viewport continues to verify:
  - backend query candidate latency stays under the configured threshold,
  - first and repeated search result rendering stay under the configured
    threshold,
  - synthetic input key latency stays under the configured threshold,
  - clicking a body-match result opens the page at a visible matching Markdown
    line.
- The visible search dialog/results have no horizontal document overflow across
  tested viewports.

## Backend Coverage

This item migrates an existing UI latency smoke to shared UI infrastructure. It
does not change search indexing, ranking, persistence, or page-open behavior, so
backend/search-service tests are not applicable.

## Gates

- `node --check scripts/smoke-search-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-search-ui.mjs` to `withLotionUIHarness`.
- The smoke now runs through desktop and compact viewport presets with isolated
  fixture workspaces.
- Preserved backend candidate latency, first/repeated render latency, input key
  latency, and jump-to-matching-markdown-line checks.
- Added document horizontal overflow assertions for search render, input, and
  jump navigation states.
- Stabilized the input latency benchmark with a reported warm-up input before
  measured samples; the original 80ms measured-sample threshold remains active.

## Verified

- `node --check scripts/smoke-search-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-ui` (desktop + compact)
- `git diff --check`
