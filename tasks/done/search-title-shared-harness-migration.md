# Search title shared harness migration

## Goal

Move the search title / quick-switcher recent defaults smoke onto the shared UI
harness so search result quality is protected across desktop and compact
viewports with deterministic workspace cleanup and failure artifacts.

## Acceptance

- The search title UI smoke runs across the shared desktop and compact viewport
  presets.
- Each viewport uses an isolated workspace fixture.
- The smoke continues to assert:
  - search result titles do not leak raw ids,
  - icons and kind/match badges render,
  - type filters work,
  - empty query shows recent page/database/row-page entries with icons and
    subtitles,
  - clicking recent page/database/row-page results navigates correctly.
- The search dialog, input, filters, visible results, and document remain
  within viewport bounds without horizontal overflow across viewports.

## Backend Coverage

This is a UI smoke infrastructure migration. It does not change search service,
indexing, or persistence behavior, so backend/search-service tests are not
applicable.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-search-title-ui.mjs` to `withLotionUIHarness`.
- The smoke now runs against desktop and compact viewports with isolated
  fixture workspaces.
- Preserved assertions for title-only search, raw-id hiding, icons, kind and
  match badges, type filters, recent defaults, and recent page/database/row-page
  navigation.
- Added viewport geometry checks for the search dialog, input, filters where
  present, visible result rows, and document horizontal overflow.

## Verified

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui` (desktop + compact)
