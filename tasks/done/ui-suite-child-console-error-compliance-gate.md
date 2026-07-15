# UI Suite Child Console Error Compliance Gate

Status: done

## Why

The shared UI harness now records structured console/page errors and the
foundation smoke asserts that its own manifest is clean. The aggregate
`npm run smoke:ui` runner should enforce the same rule for every migrated child
smoke so future frontend regressions cannot pass with hidden renderer runtime
errors.

## Scope

- Reuse the shared console-error assertion in `scripts/smoke-ui-suite.mjs` when
  validating child `harness-result.json` manifests.
- Include each child smoke's `consoleErrorCount` in the aggregate summary.
- Document that aggregate UI smoke compliance includes console/page-error
  cleanliness, not just status and viewport coverage.

## Required Gates

- Passed `node --check scripts/smoke-ui-suite.mjs`
- Passed `npm run typecheck`
- Passed `LOTION_UI_SUITE_FILTER=ui-harness-foundation npm run smoke:ui`
  - Child artifact: `artifacts/ui-smoke/ui-harness-foundation-2026-06-15T17-38-43-740Z/harness-result.json`
  - Child `consoleErrorCount` was `0`.
  - Desktop and compact viewport coverage was present.
- Passed `git diff --check`

## Notes

This is a shared UI test-runner compliance change. Backend/service tests are
not applicable because no product data model, persistence API, or backend
behavior changed.
