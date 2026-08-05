# Database Column Header Menu

Status: done

Verification status: verified

Priority: P0

Depends on: Database settings menu shell; Database property manager; Database property soft delete and restore

## Goal

Make frequent column operations available directly from a compact header menu.

## Frontend

- Include Rename, Edit property, Sort ascending/descending, Filter by property,
  Calculate, Wrap, Hide in view, Duplicate, Insert left/right, Freeze up to,
  and Delete.
- Preserve drag reorder and resize without accidental menu opens.
- Show type-aware labels and disable unsupported system-field actions.

## Backend

- Add duplicate-field and positional add-field APIs that copy schema/options but
  initialize row values safely.
- Add persisted `frozenFieldCount` or `frozenThroughFieldId` to table view JSON.
- Sanitize freeze and column metadata after field deletion/reorder.

## Acceptance

- Sort/filter actions target the clicked field with a useful default.
- Insert/duplicate produces the expected column position after reload.
- Frozen columns remain visible during horizontal scrolling.

## Gates

- Field duplicate/insert/freeze service tests.
- Column-header menu and horizontal-scroll UI smoke.
- `npm run typecheck`, `npm run test:fixtures`, `npm run build`.

## Delivered

- Added a compact, keyboard-accessible column header menu covering rename/edit,
  sort, typed filter defaults, calculation, wrapping, hiding, duplication,
  positional insertion, freezing, and recoverable deletion.
- Kept drag reorder and resize handles independent from menu activation, with
  protected actions disabled for system/title properties.
- Added schema-aware duplicate and positional add support with safe blank row
  initialization, plus persisted and sanitized frozen-column boundaries.
- Rendered frozen header/body cells as sticky columns during horizontal scroll.

## Verification

- Focused duplicate/insert/freeze persistence service test.
- `npm run smoke:database-column-menu-ui`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- Debugging found and fixed two implementation defects before verification:
  positional add/duplicate accepted missing sources, system sources, invalid or
  conflicting anchors, and duplicate names; fast native column drops could also
  be lost while React drag state was still pending. The service now validates
  those inputs and creates unique names, while drag-over/drop falls back to the
  event's `dataTransfer` source id.
- The focused service regression verifies copied select schema/options are deep
  cloned, new record values are blank, schema/current-view position survives,
  unrelated views do not gain the field, duplicate names are uniquified,
  invalid sources/anchors fail, and freeze metadata persists or is sanitized.
- The rewritten UI smoke exercises all 13 menu actions plus keyboard navigation,
  clicked-field sorting/filtering, calculation, wrapping, rename/edit, per-view
  hiding, duplicate and both insert directions, resize/drag isolation, sticky
  frozen header and body cells during horizontal scroll, reload persistence,
  unfreeze, recoverable delete, and protected-title behavior.
- The artifact contract requires complete operation flags and real screenshots
  from both desktop (1440×1000) and compact (1040×820) viewports. Both screenshots
  were visually inspected for menu containment, readable layout, frozen-column
  continuity, and document overflow. Evidence:
  `artifacts/ui-smoke/database-column-menu-ui-2026-07-22T17-27-05-406Z/` and
  `artifacts/ui-smoke/ui-suite-2026-07-22T17-26-59-453Z/` (2 snapshots, 193,936
  bytes, zero console errors, artifact contract passed).
- Passed commands: focused `test/package-core.test.mjs`,
  `test/database-column-menu-artifacts.test.mjs`,
  `npm run smoke:database-column-menu-ui`,
  `LOTION_UI_SUITE_FILTER=database-column-menu npm run smoke:ui`,
  `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`,
  `npm run build`, and `git diff --check`.
