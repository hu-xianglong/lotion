# Database Interaction Complete Surfaces And Baselines

Status: done

Verification status: verified

## Goal

Debug and verify the Database Interaction production suite as complete,
responsive interaction surfaces, persist its settings/filter/sort geometry,
and promote reviewed desktop, compact, and wide screenshots to strict
committed baselines.

## Acceptance Criteria

- Prove whether the current artifact contract can accept non-empty interaction
  screenshots whose settings, filter, sort, table, or active controls are
  clipped, transparent, overlapping, mis-owned, dirty, or offscreen.
- Persist complete geometry and visible state for every representative
  interaction phase and its owning database/table surface.
- Require controls to remain keyboard/click operable, visible/opaque, inside
  their dialog/popover and viewport owners, non-overlapping, and free of
  horizontal document overflow.
- Preserve filter/sort/settings mutations, persistence, failure handling,
  latency thresholds, focus/semantics, and representative row results.
- Add positive artifact coverage plus clipping/visibility/ownership/missing
  baseline negatives and deliberate committed-image mutation coverage.
- Commit reviewed desktop, compact, and wide baselines and require them through
  child, aggregate production, and release contracts.
- Record debugging, commands, artifacts, coverage, manual review, and exact
  results before moving this task to done/verified.

## Debugging

- The old contract required only image bytes, phase labels, and zero overflow.
  It did not persist or validate the settings/filter/sort surface rectangle,
  opacity, animation state, phase controls, ownership, active table, or
  perceptual evidence.
- Initial manual review found compact Filter and Sort screenshots captured
  during the 120ms `lotion-surface-in` animation. The popovers were nearly
  transparent and table/sidebar text showed through, but the artifact contract
  passed. Capture now waits for visible opacity, zero running subtree
  animations, two animation frames, and a final paint delay.
- Tightening table ownership exposed a second false positive: the smoke
  dispatched `lotion:open-entity` before database readiness, then
  `.database-table.first()` could bind Home's embedded Tasks table and claim
  navigation success. The failure artifact showed the Home tab/page with an
  embedded table behind Settings. The smoke now waits until `db_tasks` is
  available, targets `.database-table:not(.embedded-table)`, and requires the
  standalone `Tasks` title both initially and after reload.
- After both fixes, settings/filter/sort screenshots contain the intended
  standalone database, fully opaque surfaces, and complete controls. All nine
  images were byte-identical across two consecutive three-viewport runs.

## Verification

- Every settings/filter/sort snapshot now persists `completeSurfaceState` in
  both its result entry and metadata. Common evidence includes phase, surface,
  standalone table, active Default tab, viewport, opacity/visibility, running
  animations, and document overflow. Phase-specific controls cover both
  Settings scope choices; Filter header/empty/root group/conjunction/add
  actions; and Sort header/priority/rule/property/direction/clear/add controls.
- Runtime and persisted contracts reject missing or mis-owned controls,
  transparent or animating surfaces, wrong active tabs, embedded/offscreen
  tables, viewport escape, and horizontal overflow.
- Behavioral coverage remains intact: desktop/wide direct-tab switching,
  compact overflow-menu switching, persisted sort direction, saved-state
  timing, reload, stale-revision `VIEW_CONFLICT`, fixture field breadth,
  virtual-row presence, embedded references, and exact persisted fixture paths.
- Settings-scope baseline/policy pairs are committed as
  `database-interaction-settings-{desktop,compact,wide}.{png,json}`. PNG sizes
  and SHA-256 prefixes are desktop 1440x1000 / `55649591…`, compact 1040x820 /
  `16753d7d…`, and wide 1728x1100 / `2db8b282…`; all policies allow zero
  differing pixels. Filter and Sort remain separately persisted structural
  screenshots with complete geometry.
- `node --test test/production-visual-baseline.test.mjs test/ui-harness-artifacts.test.mjs test/test-release.test.mjs`
  passed 137/137, including transparent-phase and missing-baseline negatives,
  a deliberate committed-pixel mutation, production aggregation, and release
  evidence. Default committed baseline count rises from 45 to 48, covering all
  16 default production visual suites at desktop, compact, and wide.
- Two consecutive
  `LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 LOTION_DATABASE_INTERACTION_SKIP_BASELINE=1 node scripts/smoke-database-interaction-ui.mjs`
  runs produced byte-identical results for all nine images. A baseline-enabled
  run passed three required policies at `diffPixels: 0` and `diffRatio: 0`.
  Timings stayed bounded: first paint 32.9-395.9ms, menu open 107.8-136.6ms,
  sort save 314.3-334.6ms, and view switch 51.2-116.5ms.
- Focused production command:
  `LOTION_PRODUCTION_VISUAL_FILTER=smoke-database-interaction-ui.mjs LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS=scripts/smoke-database-interaction-ui.mjs LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 node scripts/test-production-ui-visual-quality.mjs`
  passed nine snapshots, three required baselines, and renderer coverage.
  Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-23T16-53-31-934Z/production-visual-gate/production-visual-gate.json`.
- Renderer coverage remained 31.49% lines/statements, 23.36% functions, and
  61.34% branches. `npm run typecheck`, `npm run test:task-docs`,
  `npm run build`, and `git diff --check` passed. The task-doc gate validated
  676 files, 801 references, and 664 queue items; Vite emitted only its existing
  non-blocking large-chunk warning.
