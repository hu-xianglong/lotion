# Gallery Calendar View Visual Snapshot Artifact

Status: done

## Why

Gallery, calendar, and list database views are user-facing Notion parity
surfaces. Existing smokes cover behavior, icons, row opening, date fields,
overflow, duplication, and persistence, but did not leave durable visual
artifacts for reviewing layout polish across desktop and compact viewports.

## Changes

- Extended the shared database template UI smoke to capture representative list,
  gallery, and calendar view screenshots across desktop and compact viewports.
- Stored metadata with database id/name, view id/type/name, visible row/card
  counts, toolbar count, overflow count, and viewport geometry.
- Preserved existing view switching, row open, date, icon, overflow, duplicate,
  and persistence assertions.
- Did not change database rendering, query, persistence, or service behavior, so
  backend/service tests were not applicable.

## Verification

- `node --check scripts/smoke-database-template-ui.mjs`
- `npm run typecheck`
- `npm run smoke:database-template-ui`
- `git diff --check`

## Artifacts

The focused smoke generated desktop and compact PNG/JSON artifacts under:

- `artifacts/ui-smoke/database-template-ui-2026-06-12T17-12-17-431Z/snapshots/database-list-view-desktop.png`
- `artifacts/ui-smoke/database-template-ui-2026-06-12T17-12-17-431Z/snapshots/database-gallery-view-desktop.png`
- `artifacts/ui-smoke/database-template-ui-2026-06-12T17-12-17-431Z/snapshots/database-calendar-view-desktop.png`
- `artifacts/ui-smoke/database-template-ui-2026-06-12T17-12-17-431Z/snapshots/database-list-view-compact.png`
- `artifacts/ui-smoke/database-template-ui-2026-06-12T17-12-17-431Z/snapshots/database-gallery-view-compact.png`
- `artifacts/ui-smoke/database-template-ui-2026-06-12T17-12-17-431Z/snapshots/database-calendar-view-compact.png`
