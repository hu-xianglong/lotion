# URL Field UI Artifact Contract And Regression Lane

Status: done

Queue item: 577

## Problem

URL fields have regressed repeatedly: editable URL cells looked like plain text,
open affordances overlapped text, source links and normal URL fields were too
easy to confuse, and top-level page URL properties could become hidden. The
focused URL field smoke already exercises these cases, but it does not expose a
machine-readable artifact contract and is not part of `test:ui-regression`.

## Scope

- Add a URL field artifact contract helper for the focused smoke output.
- Attach the contract to `smoke-url-field-ui.mjs`.
- Cover desktop and compact viewports, table URL editing, row-page editable URL
  property behavior, top-level page URL property behavior, open requests, and
  link-style geometry.
- Add unit coverage for passing and failing contract cases.
- Include `url-field` in the focused UI regression lane.
- Update testing docs so the regression lane contract is discoverable.

## Acceptance

- `smoke:url-field-ui` emits `result.artifactContract.status: "passed"` with
  desktop and compact viewport evidence.
- The contract fails if a viewport is missing, an editable URL opens on text
  click, open affordance requests are missing, or URL display geometry loses
  underline/non-overlap/minimum hit-target evidence.
- `LOTION_UI_SUITE_FILTER=url-field npm run smoke:ui` reports
  `missingArtifactContractCount: 0`.
- `npm run test:ui-regression` includes the URL field smoke in its filtered
  suite definition.

## Verification

- Passed: `node --check scripts/lib/url-field-artifacts.mjs`
- Passed: `node --check scripts/smoke-url-field-ui.mjs`
- Passed: `node --check test/ui-harness-artifacts.test.mjs`
- Passed: `node --test test/ui-harness-artifacts.test.mjs`
- Passed: `npm run smoke:url-field-ui`
  - Artifact: `artifacts/ui-smoke/url-field-ui-2026-06-17T08-34-10-348Z/harness-result.json`
  - Result: `artifactContract.status: passed`, `snapshotCount: 4`
- Passed: `LOTION_UI_SUITE_FILTER=url-field npm run smoke:ui`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-17T08-35-35-053Z/ui-suite-artifacts.json`
  - Result: `missingArtifactContractCount: 0`, `snapshotCount: 4`
- Passed: `node -e "const pkg=require('./package.json'); const script=pkg.scripts['test:ui-regression']; if (!script.includes('url-field')) throw new Error('test:ui-regression missing url-field'); console.log(script);"`
- Passed: `npm run typecheck`
- Passed: `git diff --check`
