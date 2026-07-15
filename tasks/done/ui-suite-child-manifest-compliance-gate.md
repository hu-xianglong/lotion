# UI Suite Child Manifest Compliance Gate

Status: done

Source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`

## Goal

Strengthen the shared UI test foundation by making the aggregate UI suite verify
that each child smoke produced a standard `harness-result.json` manifest with
required multi-viewport coverage. This prevents a child smoke from silently
passing without the shared harness artifact/coverage contract.

## Acceptance Criteria

- `scripts/smoke-ui-suite.mjs` records and validates child smoke harness
  manifests after each selected child script.
- The validation requires a passed child manifest and no missing required
  viewport names.
- The suite JSON summary records child manifest path and observed coverage.
- Add a reusable harness artifact reader with unit coverage.
- Backend/service tests are not required because this only changes UI harness
  and smoke-runner infrastructure.

## Verification

- [x] `node --check scripts/ui-harness.mjs`
- [x] `node --check scripts/smoke-ui-suite.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run typecheck`
- [x] `LOTION_UI_SUITE_FILTER=ui-harness-foundation npm run smoke:ui`
- [x] `git diff --check`

## Result

- Added `readHarnessResultArtifactsSince` to the shared UI harness so test
  runners can find current-run `harness-result.json` files deterministically.
- Updated `scripts/smoke-ui-suite.mjs` so each selected child smoke must emit a
  passed harness manifest with no missing required viewport names.
- Included child manifest path and observed viewport coverage in the aggregate
  UI suite summary.
- Added unit coverage for current-run manifest filtering.
- Documented the aggregate child-manifest compliance gate.
- Backend/service tests are not applicable: this changes UI harness and smoke
  runner infrastructure only.
