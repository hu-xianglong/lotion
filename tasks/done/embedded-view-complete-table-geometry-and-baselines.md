# Embedded View Complete Table Geometry And Baselines

Status: done

Verification status: verified

## Goal

Verify the embedded-database view as a complete production surface, debug its
header/settings/pagination/load-more behavior, persist ownership geometry, and
promote reviewed desktop, compact, and wide screenshots to strict baselines.

## Acceptance Criteria

- Prove whether the current artifact contract accepts a non-empty embedded
  table screenshot without complete header/table/pagination ownership,
  visibility, overlap, clipping, or perceptual evidence.
- Persist geometry for the embedded surface, header title/subtitle,
  Open/Refresh/Settings actions, table header/body, pagination footer,
  Load-more action, and secondary row count.
- Require controls and table regions to remain inside their owners and viewport,
  visible/opaque, non-overlapping, and free of horizontal document overflow.
- Preserve column order, scoped settings traversal, rows-per-page persistence,
  20/50/100 pagination behavior, keyboard focus, Open navigation, and render
  latency thresholds for 1/3/10 embedded views.
- Add positive artifact coverage plus clipping/visibility/ownership/missing
  baseline negatives and deliberate committed-image mutation coverage.
- Commit reviewed desktop, compact, and wide baselines and require them through
  child, aggregate production, and release contracts.
- Record debugging, commands, artifacts, coverage, manual review, and exact
  results before moving this task to done/verified.

## Debugging

- The artifact contract verifies semantic action and pagination summaries plus
  non-empty screenshot metadata, but it does not persist or revalidate complete
  surface/header/table/footer geometry or perceptual evidence.
- The initial three-viewport artifact passed while its 713x4415 screenshot was
  almost entirely blank. Pagination left the virtualized table around rows
  41-52; `scrollIntoViewIfNeeded()` considered the 4414px element visible, and
  the locator screenshot rasterized offscreen spacer height without the title,
  column header, first rows, summary, or Load-more footer.
- Hiding only `.virtual-spacer` was not sufficient: it caused the virtualizer to
  materialize all 100 loaded rows, preserving the 4414px false-positive
  surface. Capture now first scrolls to `row_0`, hides spacers and rows after
  the first eight only during capture, and restores all attributes/styles
  afterward. Runtime assertions still exercise the real 20/50/100 pagination
  and 500-row dataset.
- The first strict replay found one perceptual pixel of Chromium raster drift
  after two earlier byte-identical runs. Freezing capture-local
  animation/transition/caret state and taking a discarded warm-up screenshot
  stabilized GPU painting without weakening the zero-diff policy. Two new
  three-viewport runs were byte-identical before baseline acceptance.

## Verification

- `completeSurfaceState` is persisted in both the result entry and snapshot
  metadata. It records the surface, header, title/subtitle,
  Open/Refresh/Settings, tabs, sticky header, body, summary, footer, Load-more,
  row-count, first/last representative rows, visibility/opacity, viewport, and
  document-overflow metrics.
- Runtime and persisted contracts require the complete 8-row surface inside
  the viewport; nested ownership for header/body/footer children; visible,
  opaque surfaces; `Row 0` through `Row 7`; no virtual spacers; the real
  `100 of 500 rows` state; and no Load-more/row-count overlap. Negative tests
  reject transparent, offscreen, mis-owned, and missing-baseline evidence.
- Reviewed policies and 713x566 PNGs are committed as
  `embedded-view-table-{desktop,compact,wide}.{png,json}`. SHA-256 prefixes are
  `662745c3…` (desktop), `c3b2a060…` (compact), and `66efecae…` (wide).
  `maxDiffPixels` and `maxDiffRatio` are both zero.
- `test/production-visual-baseline.test.mjs` deliberately mutates a committed
  compact pixel and proves the baseline rejects it. Production/release
  registration raises the default committed baseline count from 39 to 42.
- `node --test test/production-visual-baseline.test.mjs test/ui-harness-artifacts.test.mjs test/test-release.test.mjs`
  passed 133/133, including positive complete-surface, clipping/visibility/
  ownership/missing-baseline negatives, mutation coverage, production
  aggregation, and release evidence.
- Two consecutive
  `LOTION_EMBEDDED_VIEW_COUNTS=1 LOTION_EMBEDDED_VIEW_ROWS=500 LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 LOTION_EMBEDDED_VIEW_SKIP_BASELINE=1 node scripts/smoke-embedded-view-ui.mjs`
  runs produced byte-identical screenshots for every viewport. A subsequent
  baseline-enabled run passed all three policies with `diffPixels: 0` and
  `diffRatio: 0`.
- Focused production command:
  `LOTION_PRODUCTION_VISUAL_FILTER=smoke-embedded-view-ui.mjs LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS=scripts/smoke-embedded-view-ui.mjs LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 node scripts/test-production-ui-visual-quality.mjs`
  passed three snapshots and three required baselines at zero diff. It retained
  1/3/10-view coverage: desktop 277.6/240.7/474.1ms, compact
  137.4/258.2/639.7ms, and wide 176.0/221.1/499.8ms, all below the 1000ms
  threshold. Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-23T16-34-37-606Z/production-visual-gate/production-visual-gate.json`.
- The same production gate passed renderer coverage at 31.49% lines/statements,
  23.36% functions, and 61.34% branches. `npm run typecheck`,
  `npm run test:task-docs`, and `npm run build` passed; Vite emitted only its
  existing non-blocking large-chunk warning.
