# Release artifact indexes production visual gate

## Status

Done.

## Context

`npm run release:test` now runs `npm run test:production-visual`, but the release
artifact index only summarized generic UI harness manifests. A tester reviewing
`ui-artifacts.json` should be able to see the machine-readable production
visual gate result directly instead of hunting inside the UI suite artifact
directory.

## Implemented

- Release UI artifact collection now detects
  `production-visual-gate/production-visual-gate.json` beside a UI suite
  `harness-result.json`.
- `ui-artifacts.json` and `release-manifest.json` now preserve the gate path,
  status, filter, viewport string, artifact kind, and UI suite artifact-index
  path when the gate result is present.
- Added focused release artifact unit coverage for the production visual gate
  summary.
- Updated testing docs so tester handoffs know release artifacts link the
  production visual gate result.

## Verification

- [x] `node --test --test-name-pattern "release" test/test-release.test.mjs`
- [x] `npm run typecheck`
- [x] `git diff --check`
