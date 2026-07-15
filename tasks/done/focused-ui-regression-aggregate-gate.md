# Focused UI Regression Aggregate Gate

Status: done

## Why

The UI regression lab TODO asks for a focused command that exercises high-risk
renderer and UI surfaces. Lotion now has many individual smokes, but there was
still no single focused gate for the common "did I break the Notion-like UI?"
workflow without running the whole UI suite.

## Scope

- Add a focused `test:ui-regression` npm script.
- Let the shared smoke suite filter accept multiple comma-separated suites.
- Include renderer component coverage plus high-signal UI surfaces:
  row-page properties/navigation, markdown preview/editor rendering, and search
  title/quick-switcher results.
- Keep this as test infrastructure only; no product behavior changes.

## Acceptance

- `npm run test:ui-regression` runs renderer component regressions and the
  selected multi-resolution UI smokes through the shared harness.
- `LOTION_UI_SUITE_FILTER` accepts comma-separated filter tokens and fails
  clearly if no suite matches.
- Backend/service tests are not applicable because this task only adds a test
  aggregate and suite filtering.

## Gates

- `node --check scripts/smoke-ui-suite.mjs`
- `npm run typecheck`
- `npm run test:ui-regression`
- `git diff --check`

## Result

- Added `npm run test:ui-regression`, which runs renderer component regressions
  and then the shared UI suite filtered to row-page navigation, markdown preview,
  and search-title quick-switcher coverage.
- Updated `smoke-ui-suite` so comma-separated filters run in the caller's order
  and de-duplicate matching smoke scripts.
- The aggregate gate caught an ordering issue when search ran before row-page
  navigation; preserving filter order now keeps the focused row-page surface
  first.
- Backend/service tests were not applicable because no product data, service, or
  persistence behavior changed.

UI smoke artifact:

- `artifacts/ui-smoke/ui-suite-2026-06-12T20-14-14-551Z/`
