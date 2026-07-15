# UI Harness Snapshot Manifest Baseline Gate

Status: done

Source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`

## Goal

Strengthen the shared UI harness visual-regression foundation so element
snapshots are not just passive screenshots. Add a reusable CI-friendly snapshot
manifest baseline helper and connect the existing row-page property panel smoke
to it across desktop and compact viewports.

## Acceptance Criteria

- `captureElementSnapshot` output can be checked against an explicit manifest
  baseline: required viewport, image/metadata artifact existence, metadata
  identity, and stable geometry ranges.
- The row-page property panel smoke uses the baseline helper for the existing
  Original Notion HTML/CSV, date, checkbox, tag/select, and source-link property
  panel snapshot.
- The smoke remains multi-resolution and records the baseline result in its JSON
  output.
- Backend/service tests are not required because this only changes UI harness
  artifact validation and UI smoke assertions.

## Verification

- [x] `node --check scripts/ui-harness.mjs`
- [x] `node --check scripts/smoke-row-page-navigation-ui.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:row-page-navigation-ui`
- [x] `git diff --check`

## Result

- Added `assertElementSnapshotBaseline` to the shared UI harness so element
  snapshots have CI-readable checks for image/metadata existence, viewport,
  geometry ranges, and required metadata.
- Connected the existing row-page property panel visual smoke to the baseline
  helper across desktop and compact viewports.
- Updated the row-page smoke to explicitly expand the Page details panel before
  checking property geometry, matching the current UI instead of assuming
  properties are always visible.
- Documented the snapshot manifest baseline workflow in `docs/testing.md`.
- Backend/service tests are not applicable: this changes UI harness artifact
  validation and UI smoke assertions only.
