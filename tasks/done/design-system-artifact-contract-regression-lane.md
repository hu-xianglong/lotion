# Design System Artifact Contract And Regression Lane

Status: done

Queue item: 597

Backlog source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

The Design System lab verifies theme tokens, shared UI primitives, focus states,
and responsive layout, but it was a standalone smoke. It now publishes a
machine-readable artifact contract and participates in the aggregate UI
regression lane so future white-theme/control polish regressions are caught
without manual inspection.

## Acceptance

- Add a Design System artifact contract that requires desktop and compact
  viewport evidence.
- The contract verifies theme token values, shared control focus evidence,
  status-pill labels, non-overflow layout metrics, and screenshot/metadata
  files.
- Include Design System in the aggregate UI suite and focused UI regression
  gate.
- Keep this scoped to UI harness/regression coverage; no product behavior
  changes.

## Verification

- `node --check scripts/lib/design-system-artifacts.mjs` - passed
- `node --check scripts/smoke-design-system-ui.mjs` - passed
- `node --check scripts/smoke-ui-suite.mjs` - passed
- `node --test test/ui-harness-artifacts.test.mjs` - passed
- `npm run smoke:design-system-ui` - passed
  - Artifact: `artifacts/ui-smoke/design-system-ui-2026-06-17T15-17-26-741Z/harness-result.json`
- `LOTION_UI_SUITE_FILTER=design-system npm run smoke:ui` - passed
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T15-18-26-303Z/ui-suite-artifacts.json`
  - Report: `artifacts/ui-smoke/ui-suite-2026-06-17T15-18-26-303Z/ui-suite-artifacts.md`
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added `assertDesignSystemArtifactContract` for the Design System lab.
- The smoke now records token/control/layout evidence and desktop/compact
  screenshot metadata in the harness result.
- Added Design System to the aggregate UI suite and `test:ui-regression` filter.
- No backend/service tests are applicable because this item only adds UI harness
  coverage and smoke artifact validation.
