# White Theme Artifact Contract And Regression Lane

Status: done

Queue item: 593

## Why

The Notion-like white default light theme has a focused multi-viewport smoke,
but it is not part of the aggregate UI regression lane and does not publish a
machine-readable artifact contract. A theme regression can therefore ship unless
someone remembers to run the focused smoke manually.

## Acceptance

- `scripts/smoke-white-theme-ui.mjs` emits an artifact contract with:
  - desktop and compact viewport coverage;
  - page, search, database, and plugin panel screenshots per viewport;
  - expected white/light token evidence;
  - no horizontal-overflow evidence from the existing smoke assertions.
- `scripts/smoke-ui-suite.mjs` includes the White theme UI smoke.
- `npm run test:ui-regression` includes the White theme UI smoke in the focused
  aggregate lane.
- The aggregate UI suite artifact index preserves the white-theme snapshot
  details like other artifact-contract-backed smokes.
- This is UI harness/regression coverage only; backend tests are not applicable.

## Verification Plan

- `node --check scripts/lib/white-theme-artifacts.mjs` - passed
- `node --check scripts/smoke-white-theme-ui.mjs` - passed
- `node --test test/ui-harness-artifacts.test.mjs` - passed
- `npm run smoke:white-theme-ui` - passed
  - Artifact: `artifacts/ui-smoke/white-theme-ui-2026-06-17T14-05-37-344Z/harness-result.json`
- `LOTION_UI_SUITE_FILTER=white-theme npm run smoke:ui` - passed
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T14-06-41-814Z/ui-suite-artifacts.json`
  - Report: `artifacts/ui-smoke/ui-suite-2026-06-17T14-06-41-814Z/ui-suite-artifacts.md`
- `npm run typecheck` - passed
- `git diff --check` - passed

## Result

- Added `scripts/lib/white-theme-artifacts.mjs` so the white-theme smoke now
  publishes a machine-readable artifact contract for page, search, database,
  and plugin snapshots across desktop and compact viewports.
- Added artifact-contract unit coverage for the happy path and missing plugin
  phase failure mode.
- Added the White theme UI smoke to the aggregate UI suite and
  `npm run test:ui-regression` lane.
- Extended suite artifact summaries to preserve theme `surfaceCount` and
  `tokenCount` details for CI/debug reports.
- Updated the white-theme smoke to open LLM Chat through the current Search &
  AI surface rather than the old direct footer entry.
