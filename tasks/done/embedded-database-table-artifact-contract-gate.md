# Embedded Database Table Artifact Contract Gate

Status: done

## Goal

Add a reusable shared-harness artifact contract for embedded database tables.
This targets the recurring Notion parity issues around in-page tables: default
column order, visible pagination/load-more affordance, row counts, stable
geometry, and multi-viewport behavior.

## Acceptance

- The embedded-view UI smoke emits a returned harness result with desktop and
  compact viewport coverage.
- The first embedded table fixture captures a screenshot/metadata artifact for
  each viewport.
- The contract validates that the table screenshot exists, the default column
  order is information-rich (`Name`, `Notes`, `Score`), pagination defaults to
  20 rows, view settings persist a 50-row page size, load-more reaches 100
  visible rows, and the load-more affordance keeps a visible button plus
  secondary row count.
- Unit coverage exercises both passing and failing artifact contract cases.
- Verification includes syntax checks, the focused unit test, a focused
  embedded-view UI smoke with a small deterministic fixture, typecheck, and
  `git diff --check`.

## Notes

- Backend/database query behavior is already covered by latency and database
  view tests; this item should stay focused on UI artifact quality unless the
  smoke reveals a real data bug.
- Verification:
  - `node --check scripts/lib/embedded-view-artifacts.mjs`
  - `node --check scripts/smoke-embedded-view-ui.mjs`
  - `node --test test/ui-harness-artifacts.test.mjs`
  - `LOTION_EMBEDDED_VIEW_COUNTS=1 LOTION_EMBEDDED_VIEW_ROWS=120 npm run smoke:embedded-view-ui`
    - Artifact: `artifacts/ui-smoke/embedded-view-ui-2026-06-16T18-15-39-963Z/harness-result.json`
  - `npm run typecheck`
  - `git diff --check`
