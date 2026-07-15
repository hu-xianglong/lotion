# Editor Regression UI Artifact Contract And Regression Lane

Status: done

## Why

The editor regression smoke covers many Notion-like editing paths, but its
artifact is not yet summarized by a stable contract that the UI suite can index.
That leaves real editor behavior harder to audit from CI artifacts and makes it
too easy for the regression lane to pass without clear multi-viewport evidence.

## Scope

- Add an editor regression artifact contract helper that validates desktop and
  compact viewport coverage, core editing evidence, persistence evidence, focus
  and layout evidence, and non-empty screenshots.
- Update the editor regression smoke to capture a stable editor-region snapshot
  per viewport and return the artifact contract.
- Include the editor regression smoke in the focused UI regression lane.
- Add fixture/unit coverage for the contract and update testing docs.

## Acceptance

- The contract rejects missing compact/desktop viewport entries, missing
  editing/persistence evidence, and missing/empty screenshots.
- The smoke writes `artifactContract` into its harness manifest with screenshot
  summaries suitable for `ui-suite-artifacts.json` and `.md`.
- `npm run test:ui-regression` includes the editor regression lane.
- Verification records focused gates and keeps unrelated manual-test scripts
  and Git Sync todo moves out of this task.

## Verification

- `node --check scripts/lib/editor-regression-artifacts.mjs`
- `node --check scripts/smoke-editor-regression-ui.mjs`
- `node --check test/ui-harness-artifacts.test.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-17T09-05-29-793Z/harness-result.json`
  - Result: `artifactContract.status: passed`, `snapshotCount: 2`
- `LOTION_UI_SUITE_FILTER=editor-regression npm run smoke:ui`
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T09-12-09-246Z/ui-suite-artifacts.json`
  - Result: `missingArtifactContractCount: 0`, `snapshotCount: 2`
- `node -e "const pkg=require('./package.json'); const script=pkg.scripts['test:ui-regression']; if (!script.includes('editor-regression')) throw new Error('test:ui-regression missing editor-regression'); console.log(script);"`
- `npm run typecheck`
- `git diff --check`
