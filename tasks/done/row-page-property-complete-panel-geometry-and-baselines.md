# Row-page Property Complete Panel Geometry And Baselines

Status: done

Verification status: verified

## Goal

Complete the accepted row-page property visual regression slice by promoting
the reviewed property panel to strict desktop, compact, and wide production
baselines and making complete panel/row/control geometry part of the persisted
artifact contract.

## Acceptance Criteria

- Reproduce whether the current artifact contract can accept non-empty
  screenshots whose panel, rows, or important property controls are clipped,
  transparent, mis-owned, or overlapping.
- Persist panel, row, label/value column, source link, date, checkbox, option,
  text/empty, number, and entity-reference geometry for all required rows.
- Require every row and important control to stay inside the panel and viewport,
  remain visible/opaque, preserve a stable label/value split, and avoid control
  overlap or horizontal overflow.
- Preserve source-link open behavior, keyboard focus, read-only/editable
  distinctions, values, empty states, and entity-reference navigation.
- Add positive artifact coverage plus clipping/visibility/ownership/missing
  baseline negatives and deliberate committed-image mutation coverage.
- Commit reviewed desktop, compact, and wide panel baselines and require them
  through child, aggregate production, and release contracts.
- Record debugging, commands, artifacts, coverage, manual review, and exact
  results before moving this task to done/verified.

## Debugging

- Before this task, runtime assertions inspected detailed row/control geometry, but the
  persisted artifact contract retains only row names, row count, value-column
  left position, document overflow, and non-empty screenshot evidence.
- Production therefore could not independently prove that the screenshot contained
  a complete, visible, correctly owned panel or compare it with a reviewed
  visual baseline.
- The first three-viewport review exposed a false-positive compact screenshot:
  focus checks had scrolled `.page-secondary-content` to the bottom, its 52vh
  clipping surface hid Created/Updated rows, and the transparent clipped region
  captured the page title and Page details toggle instead. The old contract
  still passed because every row had been visible earlier in the run.
- Complete capture now resets both the row-page and details scroll owners,
  temporarily expands only the details overflow surface, forces a Chromium
  repaint layer, waits for paint, captures all twelve rows, and restores every
  inline style and scroll offset.
- The first repaint attempt produced missing compact text even though DOM rects
  were positive. Dispatching both scroll events, promoting the property surface
  to its own paint layer, and waiting 100ms after two animation frames produced
  complete stable text in repeated runs.
- Manual review also found selected Status/Tags values visually duplicated
  because each search action rendered a second colored OptionPill. Search
  actions now render as a distinct muted `⌕ + value` label while retaining
  per-value click and keyboard behavior.
- The focused row-page-navigation command ignored `LOTION_UI_VIEWPORTS` and
  always required desktop+compact. It now passes the selected viewport names to
  its artifact contract, so compact-only reproduction works.
- The first strict policy run caught a 513-versus-514 metadata error: the DOM
  rect was 513px after rounding while the PNG raster height was 514px. Policy
  dimensions now use the actual 712x514 PNG size.

## Verification

- `completePanelState` is persisted in both the result entry and screenshot
  metadata. It records panel/content/properties geometry, visibility, opacity,
  overflow/scroll ownership, viewport metrics, and every row's label/value and
  important control geometry.
- The child artifact contract requires positive nested ownership for the panel,
  content, all twelve rows, source links/open actions, inputs, option/search
  actions, checkbox/date/text/empty/number/entity controls; it rejects hidden
  surfaces, row/control escape, row or option/search overlap, horizontal
  overflow, and missing baselines.
- Reviewed zero-tolerance baselines are committed as
  `row-page-property-panel-{desktop,compact,wide}.{png,json}`. Repeated hashes
  were `5b9dbc41…` for desktop/wide and `a3d5c347…` for compact; all PNGs are
  712x514.
- `test/production-visual-baseline.test.mjs` proves a deliberate compact
  one-pixel mutation is rejected. Artifact tests cover the positive complete
  panel, horizontal overflow, missing metadata, clipped/transparent geometry,
  and missing required baseline. Production/release registration raises the
  default committed baseline count from 36 to 39.
- `node --test test/production-visual-baseline.test.mjs test/ui-harness-artifacts.test.mjs test/test-release.test.mjs`
  passed 131/131.
- `node scripts/test-renderer-components.mjs` passed with assertions that
  option searches use distinct action labels rather than duplicate pills.
- `LOTION_UI_VIEWPORTS=compact node scripts/smoke-row-page-navigation-ui.mjs`
  passed the focused viewport contract. The default desktop+compact run also
  passed; Status click search prefilled `Done`, Tags keyboard search prefilled
  `Focus`, focus moved to Global Search, and matching results remained visible.
- Focused production command:
  `LOTION_PRODUCTION_VISUAL_FILTER=smoke-row-page-property-visual-ui.mjs LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS=scripts/smoke-row-page-property-visual-ui.mjs LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 node scripts/test-production-ui-visual-quality.mjs`
  passed three screenshots and three required policies with `diffPixels: 0`
  and `diffRatio: 0`. Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-23T16-18-17-882Z/production-visual-gate/production-visual-gate.json`.
- The same gate passed renderer coverage at 31.49% lines/statements, 23.36%
  functions, and 61.34% branches, above the verified historical baseline.
- Typecheck, focused renderer/navigation checks, `npm run test:task-docs`,
  `npm run build`, and `git diff --check` passed. The task-doc gate validated
  673 files, 798 task references, and 661 queue items. Vite emitted only its
  existing non-blocking large-chunk warning.
