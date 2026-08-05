# Database Created Views Complete Surface And Baselines

Status: done

Verification status: verified

## Goal

Debug and verify the created-database-views production surface as a complete
responsive UI, persist its tab/table ownership geometry, and promote reviewed
desktop, compact, and wide screenshots to strict committed baselines.

## Acceptance Criteria

- Prove whether the current artifact contract can accept a non-empty screenshot
  whose created-view tabs, active state, table chrome, or representative rows
  are clipped, transparent, overlapping, mis-owned, or offscreen.
- Persist complete-surface geometry for the database header, view tabs and
  overflow controls, active view, table header/body, representative rows, and
  document viewport.
- Require every generated view to remain discoverable and switchable, the
  active state to be unambiguous, and all captured regions to remain
  visible/opaque, inside their owners and viewport, non-overlapping, and free
  of horizontal document overflow.
- Preserve generated view creation, sorting/filtering/layout semantics,
  persistence after reload, and keyboard/click interaction behavior.
- Add positive artifact coverage plus clipping/visibility/ownership/missing
  baseline negatives and deliberate committed-image mutation coverage.
- Commit reviewed desktop, compact, and wide baselines and require them through
  child, aggregate production, and release contracts.
- Record debugging, commands, artifacts, coverage, manual review, and exact
  results before moving this task to done/verified.

## Debugging

- The previous artifact contract checked only non-empty image bytes, three
  coarse rectangles, tab labels, and active text. It did not prove nested
  header/tab/table/footer ownership, visibility, opacity, overlap, clean UI
  state, representative row coverage, or a reviewed perceptual baseline.
- The first desktop/compact/wide run passed while all screenshots were captured
  during the intentional write-failure test. The compact 792x777 image exposed
  `db_created_views_compact`, the `__FAIL_VIEW_WRITE__` sentinel, a clipped
  bottom Filter popover, a Retry alert, and only the single filtered newest
  row. Desktop and wide had the same dirty state. This was a production visual
  false positive even though rollback storage assertions were correct.
- Failure verification remains intact. After proving that revision/sorts did
  not leak, the smoke now patches the descending view back to zero filters,
  reloads the database, confirms the descending active view and all three
  ordered rows, rejects any remaining Filter/error surface, then captures.
- Capture moves focus and pointer away, waits for two animation frames, and
  takes a discarded animation-disabled screenshot before the persisted image.
  Two complete three-viewport runs were byte-identical.

## Verification

- `completeSurfaceState` is persisted in both the result snapshot and screenshot
  metadata. It records the root surface, database header/title/subtitle/open
  action, properties, tab bar and every generated tab, active tab, view
  actions, table scroller/header, newest/middle/oldest rows, summary, footer,
  row count, visibility/opacity, popover/error counts, viewport, and document
  overflow.
- Runtime and persisted contracts require nested ownership and positive
  geometry; clean visible/opaque surfaces; unambiguous `Created date desc`
  activation; three ordered rows; `3 of 3 rows`; no popover/error state; no tab
  or footer overlap; and no viewport or horizontal overflow.
- Existing behavioral coverage still proves idempotent asc/desc generation,
  Enter-key and click activation, row order, reload persistence, serialized
  filter/resize writes, cross-surface revision convergence, injected failure
  reporting, and failed optimistic-mutation rollback. The new
  `recoveredCaptureState` proves one descending sort and zero filters before
  visual capture.
- Reviewed PNG/policy pairs are committed as
  `database-created-views-{desktop,compact,wide}.{png,json}`. Actual sizes and
  SHA-256 prefixes are desktop 1192x957 / `8f2a1a61…`, compact 792x777 /
  `ce7e84a6…`, and wide 1480x1057 / `1310933c…`; all policies allow zero
  differing pixels.
- `node --test test/production-visual-baseline.test.mjs test/ui-harness-artifacts.test.mjs test/test-release.test.mjs`
  passed 135/135. Coverage includes the complete positive contract,
  missing-tab evidence, dirty popover state, ownership escape, missing required
  baseline, deliberate committed-pixel mutation, production aggregation, and
  release evidence. Default committed production baseline count rises from 42
  to 45.
- Two consecutive
  `LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 LOTION_DATABASE_CREATED_VIEWS_SKIP_BASELINE=1 node scripts/smoke-database-created-views-ui.mjs`
  runs produced byte-identical screenshots. A baseline-enabled run then passed
  desktop, compact, and wide with `diffPixels: 0` and `diffRatio: 0`.
- Focused production command:
  `LOTION_PRODUCTION_VISUAL_FILTER=smoke-database-created-views-ui.mjs LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS=scripts/smoke-database-created-views-ui.mjs LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 node scripts/test-production-ui-visual-quality.mjs`
  passed three snapshots, three required baselines, and renderer coverage.
  Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-23T16-43-52-395Z/production-visual-gate/production-visual-gate.json`.
- Renderer coverage remained 31.49% lines/statements, 23.36% functions, and
  61.34% branches. `npm run typecheck`, `npm run test:task-docs`,
  `npm run build`, and `git diff --check` passed. The task-doc gate validated
  675 files, 800 references, and 663 queue items; Vite emitted only its existing
  non-blocking large-chunk warning.
