# Database Row Context Menu And Restore

Status: done

Verification status: verified

Priority: P0

Depends on: Database settings menu shell

## Goal

Replace permanent Open/Delete buttons with a row handle and context menu whose
destructive actions are recoverable.

## Frontend

- Open the same menu from hover handle and right-click across table, list,
  gallery, calendar, and plugin-backed views where supported.
- Include Open, Open in new window, Rename, Duplicate, Copy link, Edit
  properties, and Delete.
- Replace always-visible action buttons with hover/focus affordances.
- Add recently deleted rows with Restore and Permanently delete.

## Backend

- Add duplicate-row API that copies values and row-page body/metadata while
  generating new IDs/timestamps.
- Add canonical row link references.
- Implement row/page tombstones and restore before routing menu Delete to it.

## Acceptance

- Right-click opens the menu without opening/editing the row.
- Duplicate produces an independent row page with preserved content.
- Delete + reload + restore returns the row and body.

## Gates

- Row duplicate/link/tombstone service tests.
- Cross-view row context-menu UI smoke.
- `npm run typecheck`, `npm run test:fixtures`, `npm run build`.

## Delivered

- Replaced permanent row deletion with persisted row tombstones and added
  restore/permanent-delete APIs plus a Recently deleted rows dialog.
- Added duplicate-row behavior that generates independent IDs/timestamps and
  page files while preserving properties, Markdown, and page display metadata.
- Added canonical row links and a shared context menu with Open, new window,
  Rename, Duplicate, Copy link, Edit properties, and recoverable Delete.
- Added right-click menus across table, list, gallery, and calendar layouts,
  with hover/focus action handles in primary row/card surfaces.

## Verification

- Focused row duplicate/link/tombstone/body and metadata lifecycle service test.
- `LOTION_UI_SUITE_FILTER=database-row-menu npm run smoke:ui`
- `npm run test:renderer-components`
- `node --test test/database-row-menu-artifacts.test.mjs`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `git diff --check`

### Verified evidence — 2026-07-22

- Debugging found that soft-deleting a row removed it from the business
  database but left its Page record resolvable as an active ghost entity.
  Tombstones now retain the complete Page metadata/body path, soft delete
  detaches the Page record, restore reattaches the exact snapshot, and
  permanent delete removes the retained body.
- Debugging also found that duplicate copied only the body and two layout
  fields. It now copies complete Page metadata with an independent ID, title,
  timestamps, path, and body. The service test verifies tags, URL, cover
  offset, path, full-width, small-text, independence, active-entity removal,
  reload/restore, and physical body deletion.
- List and gallery action handles were mouse-only/`aria-hidden`, and calendar
  had no handle. All three now expose named focusable actions with Enter/Space
  support; renderer component regression assertions cover them.
- The registered UI suite passed on desktop (1440×1000) and compact
  (1040×820) with zero console errors. It exercises all seven actions,
  right-click isolation, keyboard navigation, table/list/gallery/calendar
  entry points, canonical link copy, independent duplicate metadata/body,
  delete + reload + ghost-entity check + restore, and permanent delete.
- Desktop and compact deleted-row screenshots were visually inspected: dialog
  layout, overlay, labels, Restore/Permanently delete controls, and viewport
  containment were correct. Evidence:
  `artifacts/ui-smoke/database-row-menu-ui-2026-07-22T17-53-17-871Z/` and suite
  index `artifacts/ui-smoke/ui-suite-2026-07-22T17-53-12-339Z/`.
- Focused service/artifact/renderer tests, fixture validation, TypeScript,
  production build, latency gates, and `git diff --check` all passed. Build
  retained the existing non-blocking large-chunk warning.
- An additional `npm run test:coverage` audit found and corrected a stale
  customer-API expectation for protected title-property deletion. On retry all
  57 Node tests and the converter/import/formula/editor/renderer/link/hierarchy
  stages passed; the command then stopped at workspace smoke because the local,
  untracked `Quote_Builder--db_quote_builder/` scaffold contains no schema or
  data. It was left untouched because it is unrelated concurrent workspace
  state; this does not affect the row-menu focused coverage or required gates.
- Follow-up queue item #639 hardened workspace smoke so a truly empty scaffold
  is ignored while file-only and schema-only partial databases still fail. The
  complete `npm run test:fast` chain now passes; see
  `tasks/done/workspace-smoke-empty-scaffold-resilience.md`.
- The previously interrupted `npm run test:coverage` audit was rerun after that
  fix and passed at 83.4% package runtime coverage and 83.1% builtin-plugin
  runtime coverage, both above the configured 80% gates.
