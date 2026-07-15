# Sidebar Settings Artifact Contract And Filter Lane

Status: done

Queue item: 595

Backlog source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

The broad sidebar UI regression filter now includes both sidebar navigation and
sidebar settings. Sidebar navigation publishes a screenshot-backed artifact
contract, but sidebar settings only returned raw behavior data, so the aggregate
UI suite could not prove the settings panel covered desktop and compact layouts.

## Acceptance

- Add a sidebar settings artifact contract that requires desktop and compact
  viewport evidence.
- The contract verifies default Pages/Databases settings, Databases-above-Pages
  reorder behavior, reset behavior, shortcut editing/conflict evidence, and
  screenshot/metadata files.
- The sidebar settings smoke captures a settings panel snapshot and metadata for
  each viewport.
- `LOTION_UI_SUITE_FILTER=sidebar npm run smoke:ui` can include sidebar settings
  without missing viewport/artifact diagnostics.
- Keep this scoped to testing/harness coverage; no product behavior changes.

## Verification

- `node --check scripts/lib/sidebar-settings-artifacts.mjs` - passed
- `node --check scripts/smoke-sidebar-settings-ui.mjs` - passed
- `node --test test/ui-harness-artifacts.test.mjs` - passed
- `npm run smoke:sidebar-settings-ui` - passed
  - Artifact: `artifacts/ui-smoke/sidebar-settings-ui-2026-06-17T14-47-55-639Z/harness-result.json`
- `LOTION_UI_SUITE_FILTER=sidebar npm run smoke:ui` - passed
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T14-49-20-409Z/ui-suite-artifacts.json`
  - Report: `artifacts/ui-smoke/ui-suite-2026-06-17T14-49-20-409Z/ui-suite-artifacts.md`
- `npm run typecheck` - passed
- `git diff --check`

## Result

- Added `assertSidebarSettingsArtifactContract` for the sidebar settings panel.
- Extended the real sidebar settings smoke to capture desktop and compact
  settings panel screenshots and metadata.
- The contract now verifies default section choices, sidebar section reordering,
  reset behavior, shortcut input/editing evidence, and non-empty screenshot
  files.
- The broad `sidebar` UI suite filter now passes with both sidebar navigation
  and sidebar settings lanes producing artifact contracts.
- No backend/service tests are applicable because this item only adds UI harness
  coverage and smoke artifact validation.
