# Editor Scroll UI Artifact Contract And Regression Lane

Status: done

Queue item: 580

## Why

The editor scroll smoke protects a performance-sensitive Notion-like editing
path: large imported pages with embedded databases, missing image decorations,
and iframe previews must scroll without jank or layout overflow. It is on the
shared UI suite, but it does not expose a stable artifact contract and is not
part of the focused UI regression lane.

## Scope

- Add an editor scroll artifact contract helper that validates desktop and
  compact viewport coverage, benchmark latency thresholds, scroll geometry,
  embedded-table presence after scroll, long-task evidence, overflow evidence,
  and non-empty editor screenshots.
- Update `smoke-editor-scroll-ui.mjs` to capture a stable editor snapshot per
  viewport and return the artifact contract in the harness result.
- Add unit coverage for passing and failing contract cases.
- Include `editor-scroll` in `npm run test:ui-regression`.
- Update testing docs so the lane is discoverable.

## Acceptance

- `npm run smoke:editor-scroll-ui` emits
  `artifactContract.status: "passed"` with desktop and compact evidence.
- The contract fails if a viewport is missing, scroll latency exceeds the
  recorded thresholds, the scroller is not scrollable, the embedded table is
  missing after scroll, overflow evidence is missing, or screenshots are
  missing.
- `LOTION_UI_SUITE_FILTER=editor-scroll npm run smoke:ui` reports
  `missingArtifactContractCount: 0`.
- `npm run test:ui-regression` includes the editor scroll lane.

## Verification

- Passed: `node --check scripts/lib/editor-scroll-artifacts.mjs`
- Passed: `node --check scripts/smoke-editor-scroll-ui.mjs`
- Passed: `node --check scripts/smoke-ui-suite.mjs`
- Passed: `node --check test/ui-harness-artifacts.test.mjs`
- Passed: `node --test test/ui-harness-artifacts.test.mjs`
- Passed: `npm run smoke:editor-scroll-ui`
  - Artifact: `artifacts/ui-smoke/editor-scroll-ui-2026-06-17T09-53-20-400Z/harness-result.json`
  - Result: `artifactContract.status: passed`, `snapshotCount: 2`
- Passed: `LOTION_UI_SUITE_FILTER=editor-scroll npm run smoke:ui`
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T09-54-49-053Z/ui-suite-artifacts.json`
  - Result: `missingArtifactContractCount: 0`, `snapshotCount: 2`
- Passed: `node -e "const pkg=require('./package.json'); const script=pkg.scripts['test:ui-regression']; if (!script.includes('editor-scroll')) throw new Error('test:ui-regression missing editor-scroll'); console.log(script);"`
- Passed: `npm run typecheck`
- Passed: `git diff --check`
