# Database Property Soft Delete And Restore

Status: done

Verification status: verified

Priority: P0

Depends on: Database property manager

## Goal

Make property deletion recoverable before placing it in frequent-use menus.

## Delivered

- Replaced permanent delete with confirmation that explains affected views,
  formulas, rollups, filters, and sorts.
- Added Deleted properties with Restore and Permanently delete actions.
- Showed dependency warnings and disabled invalid permanent deletion.

- Moved deleted property schema plus cell values into a recoverable tombstone
  store rather than immediately removing CSV data.
- Recorded prior schema/view positions, visibility, wrapping, and dependency references.
- Added restore and permanent-delete APIs; absent tombstone arrays remain valid
  for legacy schemas.

## Acceptance

- Delete removes a property from active views but Restore returns values and
  the prior position when possible.
- Formula/relation/rollup dependencies are never silently corrupted.
- System/title fields cannot enter the deleted-properties flow.

## Verification

- Focused tombstone/value/position/visibility and dependency lifecycle service test.
- `node --test test/database-property-restore-artifacts.test.mjs`
- `npm run smoke:database-property-restore-ui`
- `LOTION_UI_SUITE_FILTER=database-property-restore npm run smoke:ui`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- Audit debugging found and fixed three product defects. Tombstones held stale
  dependency snapshots, so removed filter/sort clauses and later-fixed formulas
  could permanently disable deletion. Cross-database rollups targeting the
  deleted field were not detected at all. Permanently delete also had no
  irreversible-action confirmation. Dependencies are now recalculated from
  current schemas/views, including cross-database rollup targets, and permanent
  deletion requires explicit confirmation.
- The replacement smoke runs isolated desktop (1440×1000) and compact
  (1040×820) workspaces. It deletes two properties through the real manager,
  proves formula dependencies disable permanent deletion, reloads tombstones,
  verifies the full confirmation copy, permanently deletes an unblocked field,
  restores a populated field, and checks schema position, value, visibility,
  field order, wrapping, dependent-formula output, title/system protection, and
  zero horizontal overflow.
- Focused service coverage proves value/schema/view restoration, removal of
  stale filter/sort blockers, dynamic dependency release after formula/rollup
  edits, cross-database rollup protection, permanent deletion after blockers
  are removed, and title/system rejection.
- Both screenshots were visually inspected. The dependency warning, disabled
  destructive action, Restore action, and unblocked permanent action are clear
  at both viewport sizes. The artifact contract recorded two required snapshots
  (382,002 image bytes), zero console errors, no missing viewport, and no
  missing contract. Evidence:
  `artifacts/ui-smoke/database-property-restore-ui-2026-07-22T17-17-34-946Z/`
  and `artifacts/ui-smoke/ui-suite-2026-07-22T17-17-29-700Z/`.
- Focused service and artifact-contract tests, filtered suite integration,
  TypeScript, fixtures, latency, production build, and diff whitespace checks
  passed. The build emitted only the existing large-chunk advisory.
