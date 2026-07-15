# UI Suite Missing Artifact Contract Diagnostics

Status: done

Queue item: 575

## Problem

The shared UI suite can include a child smoke that passes and writes a
`harness-result.json` but does not provide an `artifactContract`. The aggregate
artifact index previously made that hard to spot because the suite simply had no
contract details and contributed zero screenshots. That was weak evidence for a
production UI regression lane.

## Changes

- Added `missingArtifactContractCount` to aggregate UI suite artifact indexes.
- Added `artifactContractStatus` to each child suite row so missing contracts
  are explicit in JSON.
- Added `missing artifact contract` to the Markdown details column for child
  suites that have not yet been upgraded to screenshot contracts.
- Preserved existing viewport and console-error compliance gates.
- Documented the missing-contract diagnostic in `docs/testing.md`.
- Added unit coverage for missing child artifact contracts.

## Verification

- Passed: `node --check scripts/lib/ui-suite-artifacts.mjs`
- Passed: `node --check test/ui-harness-artifacts.test.mjs`
- Passed: `node --test test/ui-harness-artifacts.test.mjs`
- Passed: `LOTION_UI_SUITE_FILTER=row-page-navigation npm run smoke:ui`
  - Aggregate artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T07-44-00-825Z/ui-suite-artifacts.json`
  - Markdown artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T07-44-00-825Z/ui-suite-artifacts.md`
  - Child artifact:
    `artifacts/ui-smoke/row-page-navigation-2026-06-17T07-44-21-857Z/harness-result.json`
  - Verified `missingArtifactContractCount: 1` and details text
    `missing artifact contract`.
- Passed: `npm run typecheck`
- Passed: `git diff --check`
