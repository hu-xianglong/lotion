# Global Search Responsive Controls And Result Baselines

Status: done

Verification status: verified

## Goal

Repair the global-search header so its result filters and sort control remain
readable and operable without overlap or clipping, then promote the populated
large-result state to reviewed desktop, compact, and wide production baselines.

## Acceptance Criteria

- Preserve the existing large-result latency, sorting, keyboard navigation,
  filter, and jump-to-line behavior.
- Prove the current filter/sort overlap from screenshot and geometry evidence.
- Keep every filter and the sort label/select visible within the search surface
  without sibling overlap, self-clipping, or accidental horizontal scrolling.
- Record search-surface, filter, sort, results viewport, and visible-row
  geometry in both interaction summaries and screenshot metadata.
- Cover desktop, compact, and wide viewports with stable screenshots of the
  populated large-result state.
- Commit reviewed checksum-backed strict zero-diff baseline policies and require
  all three through the child, production, and release contracts.
- Add missing-baseline, clipped/overlapping-control, and committed-image
  mutation negative tests.
- Run renderer coverage without lowering the verified historical baseline.
- Record debugging, manual review, commands, artifacts, and exact results
  before moving this task to done/verified.

## Debugging

- The latest desktop and compact snapshots in
  `artifacts/ui-smoke/search-ui-2026-07-22T21-15-10-874Z/` visibly cut off the
  `排序` label/select at the right edge of the filter row.
- `.global-search-filters` is a single horizontally scrolling flex row, while
  the sort control has no dedicated layout rule. Large filter-count badges push
  the trailing sort control underneath the clipped edge of the 680px dialog.
- The current geometry contract only proves that the dialog and select are
  inside the browser viewport. It does not prove the sort control is inside the
  search surface, fully visible within its scroll owner, or disjoint from the
  filter buttons.
- The current artifact contract requires only desktop and compact screenshot
  presence and does not compare those images with intentional baselines.

## Delivered

- Changed the filter strip from one clipped horizontal flex row to a wrapping
  control layout and gave the sort label/select explicit sizing, spacing,
  border, color, and focus treatment.
- Added live ownership and intersection checks for the dialog, filter strip,
  six filter buttons, sort label/select, and results viewport. The smoke now
  fails on sibling overlap, controls outside either owner, or any filter-strip
  horizontal overflow.
- Stabilized the result screenshot by clearing transient pointer/focus state,
  waiting for subtree animations, and waiting for two paint frames.
- Persisted filter/sort/result geometry and the first eight result-row bounds
  in screenshot metadata, while preserving large-result latency, five sort
  modes, keyboard selection, filters, and jump-to-line coverage.
- Added reviewed strict desktop, compact, and wide baselines and required them
  through the Search UI child contract, aggregate production visual gate, and
  release artifact count.
- Added missing-baseline, clipped/overlapping-control, and deliberate committed
  image mutation negatives.

## Verification

Verified on 2026-07-23.

- The faulty source screenshots are
  `artifacts/ui-smoke/search-ui-2026-07-22T21-15-10-874Z/snapshots/Search-Latency-desktop.png`
  and
  `artifacts/ui-smoke/search-ui-2026-07-22T21-15-10-874Z/snapshots/Search-Latency-compact.png`.
  Both visibly truncate the trailing sort label/select.
- The corrected candidate
  `artifacts/ui-smoke/search-ui-2026-07-23T14-28-55-387Z/` passed desktop,
  compact, and wide geometry, sorting, keyboard navigation, jump-to-line,
  10,000-result rendering, and latency checks. The independent repeat
  `artifacts/ui-smoke/search-ui-2026-07-23T14-29-48-237Z/` produced identical
  PNG checksums:
  - desktop:
    `7e8663e7a63d9669d73fc523475b93cf6d22f3c935609c7b44739d3083bc6676`;
  - compact:
    `b13ae2c7a2e74852911b17efc10c453d67c6f9b8f41dc4d1ad142072be91cc9c`;
  - wide:
    `db5dba928a34848442091acb20c747ca6a965554d8e79e2682c2810eaea3f5c4`.
- Manual review confirmed all six filters, the complete `排序 / 相关性`
  control, progress copy, and result rows are readable in every viewport. Each
  viewport recorded six filters, zero filter-strip overflow,
  `sortInsidePanel: true`, `sortInsideFilters: true`, and
  `sortOverlapsFilter: false`. Desktop/wide recorded all first eight rows fully
  visible; compact recorded six fully visible and two naturally clipped by the
  owning results scroller.
- The strict child rerun
  `artifacts/ui-smoke/search-ui-2026-07-23T14-32-53-213Z/` passed all three
  baseline comparisons with zero differing pixels.
- The focused production gate passed one required suite, three screenshots
  totaling 340,555 bytes, three committed perceptual baselines, zero console
  errors, and renderer coverage/trend checks:
  `artifacts/ui-smoke/ui-suite-2026-07-23T14-33-51-694Z/production-visual-gate/production-visual-gate.json`.
- Production-gate latency remained below every threshold: first render at most
  952.8ms of 1,500ms, repeated render at most 784.8ms of 1,500ms, and input
  latency at most 9.2ms of 80ms.
- Renderer coverage stayed above the verified historical baseline:
  lines/statements 31.48% (+0.04), functions 23.23% (+0.21), and branches
  61.40% (+0.36).
- `node --test test/ui-harness-artifacts.test.mjs
  test/production-visual-baseline.test.mjs test/test-release.test.mjs` passed
  117/117 tests: 98 artifact/aggregation tests, twelve visual-baseline tests,
  and seven release tests.
- `npm run build` completed successfully (2,338 modules transformed). The
  existing Vite chunk-size warning remains informational.

## Remaining Umbrella Work

Additional critical surfaces still need reviewed baselines. The umbrella also
needs a decision on aggregating both real-workspace runners into nightly
production and deliberate renderer coverage improvements.
