# Editor Link Click UI Artifact Contract And Regression Lane

Status: done

Queue item: 579

## Why

The real editor link-click smoke protects a high-risk Notion-like behavior:
clicking rendered URL and page links should open/navigate, while clicking blank
space on the same line should enter editing without losing the Markdown link.
That smoke is not yet summarized by a machine-readable artifact contract and is
not part of the focused UI regression lane.

## Scope

- Add an editor link-click artifact contract helper that validates desktop and
  compact coverage, direct external-link open evidence, direct page-link
  navigation evidence, blank-space editing evidence, overflow checks, and
  non-empty editor screenshots.
- Update `smoke-editor-link-click-ui.mjs` to capture a stable editor snapshot
  per viewport and return the artifact contract in the harness result.
- Add unit coverage for passing and failing contract cases.
- Include `editor-link-click` in `npm run test:ui-regression`.
- Update testing docs so the lane is discoverable.

## Acceptance

- `npm run smoke:editor-link-click-ui` emits
  `artifactContract.status: "passed"` with desktop and compact evidence.
- The contract fails if a viewport is missing, an external link open request is
  absent, an internal page link does not navigate, blank-space editing evidence
  is missing, horizontal overflow is not recorded, or screenshots are missing.
- `LOTION_UI_SUITE_FILTER=editor-link-click npm run smoke:ui` reports
  `missingArtifactContractCount: 0`.
- `npm run test:ui-regression` includes the editor link-click lane.

## Verification

- Passed: `node --check scripts/lib/editor-link-click-artifacts.mjs`
- Passed: `node --check scripts/smoke-editor-link-click-ui.mjs`
- Passed: `node --check scripts/smoke-ui-suite.mjs`
- Passed: `node --check test/ui-harness-artifacts.test.mjs`
- Passed: `node --test test/ui-harness-artifacts.test.mjs`
- Passed: `npm run smoke:editor-link-click-ui`
  - Artifact: `artifacts/ui-smoke/editor-link-click-2026-06-17T09-36-38-099Z/harness-result.json`
  - Result: `artifactContract.status: passed`, `snapshotCount: 2`
- Passed: `LOTION_UI_SUITE_FILTER=editor-link-click npm run smoke:ui`
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T09-38-04-775Z/ui-suite-artifacts.json`
  - Result: `missingArtifactContractCount: 0`, `snapshotCount: 2`
- Passed: `node -e "const pkg=require('./package.json'); const script=pkg.scripts['test:ui-regression']; if (!script.includes('editor-link-click')) throw new Error('test:ui-regression missing editor-link-click'); console.log(script);"`
- Passed: `npm run typecheck`
- Passed: `git diff --check`
