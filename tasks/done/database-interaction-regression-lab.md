# Database Interaction Regression Lab

Status: done

Verification status: verified

Priority: P0

Depends on: Database view transactional persistence

## Delivered

- Added a focused demo-space-derived fixture covering many views, 11 field
  types, select ordering, embedded references, and virtualized row data.
- Added desktop, compact, and wide filter/sort interaction screenshots.
- Recorded first paint, view switch, menu open, and sort commit timing.
- Asserted view JSON, schema JSON, CSV, reload behavior, stale-write conflicts,
  console cleanliness, and horizontal overflow.
- Added an artifact contract with exact persisted file and screenshot paths.
- Wired the lab into the focused UI suite and production visual gate.
- Reserved `rowBatchActionMs` for the later bulk-row scenario.

## Verification

- Harness artifact contract unit test.
- `npm run smoke:database-interaction-ui`
- `LOTION_UI_SUITE_FILTER=database-interaction npm run smoke:ui`
- Focused three-viewport production visual gate.
- `npm run typecheck`
- `git diff --check`

### Verified evidence — 2026-07-22

- Initial `npm run smoke:database-interaction-ui` failed because the global
  `Default` tab selector matched three tablists. The smoke was returned to WIP
  and fixed by scoping view tabs and toolbar buttons to the exercised main
  `.database-table`.
- `node --test --test-name-pattern='database interaction artifact' test/ui-harness-artifacts.test.mjs`
  passed. The contract now requires exact Tasks fixture paths, exactly one
  `filter-menu` and one `sort-menu` snapshot per viewport, matching snapshot
  metadata, images of at least 512 bytes, and zero-overflow dimensions.
- `npm run smoke:database-interaction-ui` passed after the contract hardening
  at desktop 1440x1000, compact 1040x820, and wide 1728x1100. It produced six
  screenshots totaling 867,937 bytes, recorded timings, verified 11 field
  types, a virtualized 120+ row fixture, an embedded database reference,
  exact view/schema/CSV files, persisted sort direction after reload, typed
  `VIEW_CONFLICT` behavior, and zero console/page errors. Evidence:
  `artifacts/ui-smoke/database-interaction-ui-2026-07-22T16-29-32-138Z/`.
- `LOTION_UI_SUITE_FILTER=database-interaction npm run smoke:ui` passed and
  indexed the database-interaction child manifest with 6 screenshots and 0
  console errors. Suite evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-22T16-27-44-737Z/`.
- `LOTION_PRODUCTION_VISUAL_FILTER=database-interaction LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS=scripts/smoke-database-interaction-ui.mjs LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 npm run test:production-visual`
  passed its one-suite, three-viewport production contract with 6 screenshots
  totaling 831,834 bytes. Gate evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-22T16-28-20-016Z/production-visual-gate/`.
- `npm run typecheck` and `git diff --check` passed after the selector and
  artifact-contract changes.

Visual inspection of the desktop filter and compact sort artifacts confirmed
the menus remained visible inside the viewport. Compact view-tab clipping is
tracked by queue item 617 (view reorder/overflow) and is not misreported as
fixed by this regression-lab task.
