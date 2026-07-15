# Row-page Navigation UI Artifact Contract

Status: done

Queue item: 576

## Problem

Item 575 made missing child artifact contracts explicit. The real
`Row-page navigation UI` child smoke still appears as `missing artifact
contract` in the aggregate UI suite index even though it already captures
multi-viewport row-property screenshots and rich navigation/property evidence.

## Scope

- Add a focused artifact contract helper for row-page navigation smoke output.
- Summarize desktop/compact screenshots, row-open timing, direct table edit,
  source-link opens, entity-ref navigation, date edit persistence, and
  property-focus evidence.
- Attach the contract to `smoke-row-page-navigation-ui.mjs` harness results.
- Add unit coverage for the contract and its failure cases.
- Verify the focused smoke and filtered aggregate suite no longer report a
  missing artifact contract for row-page navigation.

## Acceptance

- `smoke:row-page-navigation-ui` emits `result.artifactContract.status:
  "passed"` with desktop and compact snapshots.
- The contract fails if screenshots are missing/empty, row-page open timing is
  invalid, source-link opens are missing, direct cell edit evidence is missing,
  or entity-ref/date/focus evidence is missing.
- The aggregate `LOTION_UI_SUITE_FILTER=row-page-navigation npm run smoke:ui`
  reports `missingArtifactContractCount: 0`.

## Verification

- Passed: `node --check scripts/lib/row-page-navigation-artifacts.mjs`
- Passed: `node --check scripts/smoke-row-page-navigation-ui.mjs`
- Passed: `node --check test/ui-harness-artifacts.test.mjs`
- Passed: `node --test test/ui-harness-artifacts.test.mjs`
- Passed: `npm run smoke:row-page-navigation-ui`
  - Artifact: `artifacts/ui-smoke/row-page-navigation-2026-06-17T08-02-42-940Z/harness-result.json`
  - Result: `artifactContract.status: passed`, `snapshotCount: 2`
- Passed: `LOTION_UI_SUITE_FILTER=row-page-navigation npm run smoke:ui`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-17T08-04-29-116Z/ui-suite-artifacts.json`
  - Result: `missingArtifactContractCount: 0`
- Passed: `npm run typecheck`
- Passed: `git diff --check`
