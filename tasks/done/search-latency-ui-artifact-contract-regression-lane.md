# Search Latency UI Artifact Contract And Regression Lane

Status: done

Queue item: 581

## Why

`smoke:search-ui` covers a high-risk, user-facing search surface: large search
results, input responsiveness, sort controls, keyboard navigation, jump-to-line
navigation, and desktop/compact layout. It currently runs as a focused smoke but
does not publish a machine-readable artifact contract and is not part of the
focused UI regression lane.

That leaves the shared UI suite unable to summarize whether search latency and
search navigation evidence actually existed in the child artifact.

## Acceptance

- Add a reusable Search UI artifact contract helper.
- The helper validates desktop and compact viewport evidence for:
  - backend candidate checks and visible hit counts,
  - first/repeated render timing thresholds,
  - input latency threshold and samples,
  - sorting controls/options/order,
  - keyboard navigation focus,
  - jump-to-line navigation evidence,
  - no horizontal overflow evidence,
  - non-empty search popup screenshots with metadata.
- Update `smoke:search-ui` to capture per-viewport snapshots and return the
  artifact contract in the harness result.
- Include `search-ui` in `npm run test:ui-regression`.
- Add unit coverage for passing and failing artifact contract cases.
- Update testing docs so the search latency contract is discoverable.

## Verification

- `node --check scripts/lib/search-ui-artifacts.mjs`
- `node --check scripts/smoke-search-ui.mjs`
- `node --check test/ui-harness-artifacts.test.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
  - Result: 49 tests passed.
- `npm run smoke:search-ui`
  - Result: passed.
  - Artifact: `artifacts/ui-smoke/search-ui-2026-06-17T10-14-40-441Z/harness-result.json`
  - Contract: `artifactContract.status: "passed"`, `snapshotCount: 2`.
- `LOTION_UI_SUITE_FILTER=search-ui npm run smoke:ui`
  - Result: passed; broad filter also matched Advanced Search because the
    existing suite filter is substring-based.
  - Artifact index:
    `artifacts/ui-smoke/ui-suite-2026-06-17T10-16-27-978Z/ui-suite-artifacts.json`
  - Contract: `missingArtifactContractCount: 0`.
- `LOTION_UI_SUITE_FILTER=smoke-search-ui.mjs npm run smoke:ui`
  - Result: passed.
  - Artifact index:
    `artifacts/ui-smoke/ui-suite-2026-06-17T10-18-12-142Z/ui-suite-artifacts.json`
  - Contract: `missingArtifactContractCount: 0`, `snapshotCount: 2`.
- `node --check scripts/smoke-ui-suite.mjs`
- `node -e 'const pkg=require("./package.json"); if (!pkg.scripts["test:ui-regression"].includes("smoke-search-ui.mjs")) process.exit(1); console.log("test:ui-regression includes smoke-search-ui.mjs")'`
- `npm run typecheck`
- `git diff --check`

## Result

- Added `scripts/lib/search-ui-artifacts.mjs`.
- `smoke:search-ui` now captures desktop/compact search popup screenshots and
  returns a machine-readable artifact contract with backend, render latency,
  input latency, sorting, keyboard navigation, jump-to-line, and overflow
  evidence.
- `npm run test:ui-regression` now includes the search popup smoke via exact
  script-name filtering.
- Testing docs describe the new search UI artifact contract.
