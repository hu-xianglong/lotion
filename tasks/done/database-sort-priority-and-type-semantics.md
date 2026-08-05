# Database Sort Priority And Type Semantics

Status: done

Verification status: verified

Priority: P0

Depends on: Database view transactional persistence; Database settings menu shell

## Goal

Make multiple sorts understandable, reorderable, and correct for each field
type.

## Frontend

- Add drag/keyboard rule priority, field-specific ascending/descending labels,
  clear-all, and visible priority chips.
- Prevent duplicate sort fields and keep a stable default direction per type.
- Allow select/multi-select option order to define their sort order.

## Backend

- Centralize type-aware comparators for text, number, date, checkbox, select,
  multi-select, formula, rollup, and empty values.
- Guarantee stable ordering with source row order/ID as the final tie-breaker.
- Sanitize stale rules after field/type changes.

## Acceptance

- Reordering sort rules immediately changes results and persists after reload.
- Empty and equal values sort deterministically.
- Select option reorder changes select sorting without changing cell values.

## Gates

- Shared comparator and multi-sort tests.
- Sort priority UI smoke with reload.
- `npm run typecheck`, `npm run test:latency`, `npm run build`.

## Delivered

- Added shared type-aware comparators for text, numeric/formula/rollup, date,
  checkbox, select, multi-select, and empty values, with stable source-order/ID
  tie-breaking.
- Select and multi-select sorting now follows schema option order, so option
  reordering changes display order without mutating cells.
- Rebuilt the sort popover with priority chips, drag and Alt+Arrow reordering,
  explicit move controls, type-specific direction labels, clear-all, duplicate
  prevention, and stable per-type defaults.
- Sanitized missing, duplicate, and invalid persisted sort rules.

## Verification

- Shared comparator and multi-sort stability tests.
- `npm run smoke:database-sort-priority-ui`
- `npm run typecheck`
- `npm run test:latency`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- Debugging found three implementation defects before verification. Fast native
  rule drops depended only on pending React `dragIndex` state and could be lost;
  drop now falls back to the field id carried by `dataTransfer`. Multi-select
  values containing the same option set in a different order/serialization were
  incorrectly treated as different values; they now compare as equal sets and
  preserve source order. Serialized checkbox value `"false"` was also treated as
  checked by `Boolean()` and now receives the correct unchecked rank.
- Comparator coverage verifies text natural collation, numbers, dates,
  booleans and serialized booleans, select option order, multi-select sets in
  CSV and JSON encodings, numeric/text formulas, rollups, null/undefined/blank
  values in both directions, stable equal-value ordering, and multi-sort
  priority. It also proves reversing select options changes ordering without
  editing cell values.
- Renderer coverage was migrated from the obsolete flat sort markup to priority
  chips, type-specific labels, drag/keyboard handles, explicit move controls,
  duplicate-field disabling, clear-all, removal, empty state, and the all-fields
  disabled state. The full `test:renderer-components` gate now passes.
- The previous smoke's desktop and compact files both represented one unchanged
  page rather than two viewports and did not exercise drag, move buttons,
  clear-all, or option reorder. The rewritten smoke uses fresh workspaces at
  real 1440×1000 and 1040×820 viewports. At each size, keyboard reorder changes
  `2,1,3,4` to `4,3,2,1`, native drag and explicit buttons change priority back
  and forth, the persisted order survives reload, duplicates remain disabled,
  and reversing Priority options changes rows to `4,3,1,2` without changing any
  Priority cell.
- Both screenshots were visually inspected for popover containment, readable
  chips and labels, drag/move affordances, table alignment, and document
  overflow. Evidence:
  `artifacts/ui-smoke/database-sort-priority-ui-2026-07-22T17-37-51-349Z/`
  and `artifacts/ui-smoke/ui-suite-2026-07-22T17-37-45-953Z/` (2 snapshots,
  259,770 bytes, zero console errors, artifact contract passed).
- Passed commands: focused `test/package-core.test.mjs`,
  `test/database-sort-priority-artifacts.test.mjs`,
  `npm run test:renderer-components`,
  `npm run smoke:database-sort-priority-ui`,
  `LOTION_UI_SUITE_FILTER=database-sort-priority npm run smoke:ui`,
  `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`,
  `npm run build`, and `git diff --check`.
