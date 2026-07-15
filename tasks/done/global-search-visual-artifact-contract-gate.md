# Global Search Visual Artifact Contract Gate

Status: done

## Goal

Turn the existing global search / command palette UI smoke screenshots and DOM
metadata into a reusable artifact contract. This keeps the shared UI regression
lab moving beyond one-off behavior checks and makes search regressions
auditable across desktop and compact viewports.

## Acceptance

- The search-title UI smoke emits a contract summary that verifies desktop and
  compact viewport coverage.
- The contract validates screenshot artifacts and metadata for the important
  phases: typed results, empty command palette defaults, recent rows, tag rows,
  built-in commands, and database/plugin commands.
- The contract asserts user-visible search affordances: input state, result
  rows, badges, icons, previews, filters for typed search, recent defaults,
  command rows, tag row, keyboard focus, and no raw page-id leakage.
- Unit coverage exercises both passing and failing artifact contract cases.
- Verification includes syntax checks, the focused unit test, the focused
  search-title UI smoke, typecheck, and `git diff --check`.

## Notes

- Backend/search-service tests are not expected unless search ranking or data
  behavior changes; this item should stay focused on UI artifact quality.
- Verification:
  - `node --check scripts/lib/global-search-visual-artifacts.mjs`
  - `node --check scripts/smoke-search-title-ui.mjs`
  - `node --test test/ui-harness-artifacts.test.mjs`
  - `npm run smoke:search-title-ui`
    - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T18-02-15-560Z/harness-result.json`
  - `npm run typecheck`
  - `git diff --check`
