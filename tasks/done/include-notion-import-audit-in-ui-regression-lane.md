# Include Notion Import Audit In UI Regression Lane

Status: done

## Why

The Notion Import audit panel is the main review surface after imports, and it
already has a focused shared-harness smoke with an artifact contract. It was not
part of the focused `test:ui-regression` lane, so a normal product-quality gate
could miss regressions in source/workspace path review, audit summary
rendering, and the path-open affordances.

## Scope

- Include the Notion import audit UI smoke in `npm run test:ui-regression`.
- Stabilize the shared harness startup path so the aggregate lane waits for the
  Lotion renderer API instead of failing on a transient DOM load-state timeout.
- Stabilize the existing Advanced Search progress assertion exposed by the
  longer aggregate lane so transient `writing` progress does not fail before the
  final ready state is visible.
- Keep the task focused on regression-lane wiring and documentation.
- Preserve the existing audit/import runtime behavior.

## Acceptance

- `npm run test:ui-regression` runs the Notion import audit smoke alongside the
  other focused user-facing surfaces.
- The aggregate UI suite records the Notion import audit artifact contract with
  desktop and compact viewport evidence.
- The Notion import audit smoke opens the plugin settings panel through a stable
  deep-link path instead of brittle text navigation.
- The existing Advanced Search UI smoke remains stable when run after the new
  Notion import audit lane entry.
- Documentation lists the Notion import audit surface in the focused regression
  lane.
- Backend/import tests are not applicable because this item does not change
  importer or audit service behavior.

## Gates

- Passed: `node --check scripts/smoke-notion-import-ui.mjs`
- Passed: `node --check scripts/smoke-advanced-search-ui.mjs`
- Passed: `node --check scripts/ui-harness.mjs`
- Passed: `LOTION_UI_SUITE_FILTER=notion-import npm run smoke:ui`
  - Aggregate artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T06-45-46-359Z/ui-suite-artifacts.json`
  - Notion import audit artifact:
    `artifacts/ui-smoke/notion-import-audit-2026-06-17T06-46-06-633Z/harness-result.json`
- Passed: `LOTION_UI_SUITE_FILTER=advanced-search npm run smoke:ui`
  - Aggregate artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T06-54-48-392Z/ui-suite-artifacts.json`
  - Advanced Search artifact:
    `artifacts/ui-smoke/advanced-search-ui-2026-06-17T06-55-09-033Z/harness-result.json`
- Passed: `npm run typecheck`
- Passed: `npm run test:ui-regression`
  - Aggregate artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T06-59-03-686Z/ui-suite-artifacts.json`
  - Notion import audit artifact:
    `artifacts/ui-smoke/notion-import-audit-2026-06-17T06-59-24-454Z/harness-result.json`
  - Contract evidence: 11 suites passed, 20 total snapshots, desktop and
    compact Notion import audit snapshots, 0 console errors.
- Passed: `git diff --check`

## Result

The focused UI regression lane now includes Notion import audit coverage. The
audit smoke deep-links to the plugin settings panel, validates source/workspace
summary rendering, path-open affordances, and desktop/compact artifacts. The
aggregate regression artifact index now includes Notion import audit evidence
alongside row-page, markdown preview, search, embedded table, plugin manager,
LLM Chat, and Advanced Search surfaces.
