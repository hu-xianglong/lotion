# Database Bulk Row Selection And Actions

Status: done

Verification status: verified

Priority: P1

Depends on: Database row context menu and restore

## Goal

Support efficient multi-row workflows in table view without compromising row
virtualization.

## Frontend

- Add hover checkboxes, select-all-visible, Shift range selection, Cmd/Ctrl
  toggle, Escape clear, and a sticky selection action bar.
- Support batch property edit, duplicate, and recoverable delete.
- Define selection behavior when filters/sorts change or virtual rows unmount.

## Backend

- Add bounded batch update/duplicate/delete APIs with one transaction result and
  per-row errors.
- Avoid one IPC/write cycle per selected row.

## Acceptance

- Range selection works across virtualized rows.
- Batch edits update all selected rows atomically or report partial failures.
- Changing views clears or safely scopes selection.

## Gates

- Batch database service tests and latency benchmark.
- Virtualized bulk-selection UI smoke.
- `npm run typecheck`, `npm run test:latency`, `npm run build`.

## Delivered

- Added row checkboxes, select-all-visible, Shift range selection across
  virtualized rows, modifier toggles, Escape clearing, and view/query-scoped
  selection cleanup.
- Added a sticky bulk action bar for typed property edits, duplication,
  recoverable deletion, and explicit selection clearing.
- Added a bounded 500-operation batch service/API with one CSV/schema write,
  created-row IDs, and per-row validation errors.
- Preserved virtualization while selecting off-screen ranges and kept batch
  duplicates/tombstones compatible with row restore flows.

## Verification

- Focused 200-row batch transaction, typed validation, partial error,
  duplicate-page, delete/tombstone/restore, ghost-entity, and 500-operation
  bound test.
- File-cache overlapping read/write regression test.
- `node --test test/database-bulk-selection-artifacts.test.mjs`
- `LOTION_UI_SUITE_FILTER=database-bulk-selection npm run smoke:ui`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- Debugging found that batch delete wrote record-only tombstones and left every
  Page record active, producing ghost entities and losing Page metadata on
  restore. Batch delete now snapshots Page metadata/body paths, stores updated
  record values in tombstones, and removes all affected active Page records in
  one Pages CSV write. Restore recovers body and layout metadata.
- Batch duplicate coverage now proves independent body/layout metadata. Invalid
  typed batch values produce per-row errors without mutation; the toolbar uses
  number/date/checkbox/select-aware editors and presents success or partial
  failure results instead of silently discarding errors.
- Debugging found a selection race: semantically unchanged filters/sorts were
  deserialized into new array identities after a bundle refresh, asynchronously
  clearing a newly started selection. Selection cleanup now keys off a stable
  database/view/query-content signature and still clears on real view/query
  scope changes or Escape.
- Repeated restore runs exposed an inflight file-cache race where a read begun
  before/during an atomic write could repopulate the cache with pre-write CSV.
  FileService now tags inflight reads with mutation revisions and advances the
  revision at both mutation begin and commit. A same-size 4 MiB overlapping
  read/write regression test covers the cache invariant.
- Deleted-row actions now prevent double submission, expose busy states and
  errors, and carry stable row IDs for exact lifecycle assertions.
- The registered UI suite passed with zero console errors on real desktop
  (1440×1000) and compact (1040×820) viewports. Each run Shift-selected the
  complete 160-row virtual range, checked platform modifier toggle, Escape and
  view-scope cleanup, typed editors, atomic edit, two-row duplicate body/meta,
  162-row recoverable delete, ghost-page removal, and body/meta restore.
- Screenshots were visually inspected: the 162-row Deleted items dialog is
  viewport-contained, scrollable, legible, and exposes complete Restore and
  Permanently delete controls. Evidence:
  `artifacts/ui-smoke/database-bulk-selection-ui-2026-07-22T18-12-23-895Z/`
  and suite index `artifacts/ui-smoke/ui-suite-2026-07-22T18-12-18-544Z/`.
- Focused service/cache/artifact tests, TypeScript, fixtures, latency gates,
  production build, and diff check passed. The 20k-row slowest view was 13.3 ms
  and the 50k-row CSV median was 47.3 ms. Build retained the existing
  non-blocking large-chunk warning.
