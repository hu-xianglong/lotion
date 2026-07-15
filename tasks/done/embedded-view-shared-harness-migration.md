# Embedded View Shared Harness Migration

Status: done

## Scope

Move the embedded database first-render, fallback column-order, pagination, and
load-more affordance smoke onto the shared Electron UI harness so embedded view
coverage uses deterministic app lifecycle, cleanup, failure artifacts, and
desktop plus compact viewport coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the isolated blank page plus embedded database fixture.
- Preserve render latency thresholds and CLI/env controls for embedded view
  counts and rows per database.
- Preserve fallback default column richness order assertions.
- Preserve embedded table pagination, page-size persistence, and Load more
  affordance assertions.
- Run the smoke across desktop and compact viewports.
- Assert embedded tables are visible/interactable and do not create document
  horizontal overflow.
- This should remain UI smoke/benchmark coverage only; no database or view
  service behavior changes are expected.

## Gates

- `node --check scripts/smoke-embedded-view-ui.mjs`
- `npm run typecheck`
- `npm run smoke:embedded-view-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-embedded-view-ui.mjs` to
  `withLotionUIHarness`.
- Preserved CLI/env controls for embedded view counts, rows per database, and
  render latency threshold.
- Ran the first-render benchmark, fallback default column richness order check,
  page-size persistence, pagination, and Load more affordance assertions across
  desktop and compact viewports.
- Added no-horizontal-overflow checks for blank, rendered, pagination, and
  load-more states, plus viewport intersection checks for the first embedded
  table.
- Focused smoke results stayed under the 1000ms render threshold for 1, 3, and
  10 embedded views at both viewport sizes.
- This change only updates UI smoke/benchmark harness coverage; database/view
  service behavior was not changed, so backend tests were not applicable.
