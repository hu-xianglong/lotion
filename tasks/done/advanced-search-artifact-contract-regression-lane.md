# Advanced Search Artifact Contract And Regression Lane

Status: wip

## Why

Advanced Search is now a Search & AI core surface, but its smoke only asserts
behavior inline. The shared UI regression lane needs a machine-readable
artifact contract so CI/local runs can prove the semantic-search panel still
renders important states across desktop and compact viewports.

## Scope

- Add an Advanced Search artifact contract helper.
- Extend the existing Advanced Search smoke to capture screenshots and DOM
  metadata for initial, provider-error, rebuild, stale-result, empty-result,
  and adapter-error states.
- Include Advanced Search in the focused `test:ui-regression` lane.
- Add unit coverage for the contract and failure mode.

## Acceptance

- The Advanced Search smoke writes artifact metadata with desktop and compact
  viewport evidence.
- The contract validates:
  - initial not-built guidance;
  - Ollama unavailable state;
  - missing Ollama model state;
  - successful local rebuild/ready state;
  - stale index state with semantic row-page result;
  - empty result state;
  - LanceDB adapter error state;
  - external provider configuration error state;
  - row page, page, and database navigation evidence.
- The aggregate UI suite index can summarize Advanced Search artifacts through
  `artifactContract`.
- Backend/service tests are not applicable unless Advanced Search service
  behavior changes; this item should stay focused on UI artifact coverage.

## Gates

- Passed: `node --check scripts/lib/advanced-search-artifacts.mjs`
- Passed: `node --check scripts/smoke-advanced-search-ui.mjs`
- Passed: `node --test test/ui-harness-artifacts.test.mjs`
- Passed: `npm run typecheck`
- Passed: `LOTION_UI_SUITE_FILTER=advanced-search npm run smoke:ui`
  - Aggregate artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T06-13-57-215Z/ui-suite-artifacts.json`
  - Advanced Search artifact:
    `artifacts/ui-smoke/advanced-search-ui-2026-06-17T06-14-35-014Z/harness-result.json`
- Passed: `npm run test:ui-regression`
  - Aggregate artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T06-15-35-288Z/ui-suite-artifacts.json`
  - Advanced Search artifact:
    `artifacts/ui-smoke/advanced-search-ui-2026-06-17T06-17-49-952Z/harness-result.json`
  - Contract evidence: 2 viewports, 8 Advanced Search phases per viewport,
    18 total UI regression snapshots, 0 console errors.
- Passed: `git diff --check`

## Result

Advanced Search now participates in the shared UI regression artifact contract.
The focused and aggregate suite runs validate desktop and compact screenshots,
not-built guidance, Ollama provider/model errors, local rebuild readiness, stale
semantic row-page results, empty results, LanceDB adapter failure, external
provider configuration errors, and row-page/page/database navigation evidence.
