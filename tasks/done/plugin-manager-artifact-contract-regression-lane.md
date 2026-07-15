# Plugin Manager Artifact Contract And Regression Lane

Status: done

Queue item: 569

## Goal

Make the plugin manager UI regression coverage production-style instead of only
manual-visible smoke output. The smoke should publish a reusable artifact
contract with desktop and compact evidence, and the focused UI regression lane
should include this surface because plugin settings, permissions, commands, and
detail pages are user-facing.

## Acceptance

- Add a plugin manager artifact contract helper that validates:
  - desktop and compact viewport coverage;
  - plugin list rows and provider icons;
  - permission pills for high-risk plugins;
  - extension/provider source drilldown evidence;
  - detail page overview/settings tab behavior;
  - command palette filter/click/Enter activation evidence;
  - notification toast evidence;
  - non-empty screenshots and metadata for each viewport.
- Update the plugin manager UI smoke to capture stable screenshots and return
  the artifact contract in the harness result.
- Add unit coverage for the artifact contract, including a negative regression.
- Include plugin manager in `test:ui-regression`.
- Verification must include the contract unit test, filtered plugin manager UI
  suite smoke, `test:ui-regression`, typecheck, and diff check.

## Backend Tests

Not applicable unless this task touches plugin host/storage/service behavior.
This slice is intentionally limited to UI harness/artifact coverage and package
script wiring.

## Verification

- [x] `node --check scripts/lib/plugin-manager-artifacts.mjs`
- [x] `node --check scripts/smoke-plugin-manager-ui.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run typecheck`
- [x] `LOTION_UI_SUITE_FILTER=plugin-manager npm run smoke:ui`
  - Artifact: `artifacts/ui-smoke/plugin-manager-ui-2026-06-17T04-30-15-437Z`
- [x] `npm run test:ui-regression`
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T04-31-17-206Z/ui-suite-artifacts.json`
  - Result: 8 suites passed, 14 screenshots, 0 console errors.
- [x] `git diff --check`
