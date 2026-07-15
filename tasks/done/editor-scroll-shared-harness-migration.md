# Editor Scroll Shared Harness Migration

Status: done

## Scope

Move the editor scroll benchmark smoke onto the shared Electron UI harness so
large-document scrolling uses deterministic lifecycle, cleanup, failure
artifacts, and desktop plus compact viewport coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the large markdown page plus embedded database fixture.
- Preserve scroll latency and scroll-overhead thresholds.
- Preserve CLI/env controls for line count, row count, steps, and thresholds.
- Run the benchmark across desktop and compact viewports with isolated fixture
  workspaces.
- Assert the editor and embedded table are present, visible, and do not create
  document horizontal overflow.
- This should remain UI benchmark/smoke coverage only; no editor or database
  service behavior changes are expected.

## Gates

- `node --check scripts/smoke-editor-scroll-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-scroll-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-editor-scroll-ui.mjs` to
  `withLotionUIHarness`.
- Ran the large-document editor scroll benchmark independently across desktop
  and compact viewports.
- Preserved CLI/env controls for line count, row count, scroll steps, total
  latency threshold, and scroll-overhead threshold.
- Preserved the large markdown fixture with an embedded database and verified
  the embedded table remains mounted after scrolling.
- Added no-horizontal-overflow checks and viewport intersection assertions for
  the long editor scroller and embedded table.
- Recorded per-viewport benchmark summaries; both desktop and compact remained
  under the configured thresholds in the focused smoke run.
- This change only updates UI benchmark harness coverage; editor and database
  services were not changed, so backend tests were not applicable.
